/**
 * FILESYSTEM TOOLS
 * The four verbs an agent needs to work on an existing composition instead of
 * regenerating it: look, find, change, create.
 *
 * `edit_file` is the important one. Without an exact-string replace the model has no
 * way to make a small change, so every revision became a full rewrite into a brand
 * new folder — which is what made the old build feel like a generator rather than an
 * agent.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { resolveInProject, assertWritable, ensureDir } from '../sandbox.js';
import { repairAndReport, manifestOf } from './contract-audit.js';

const MAX_READ_BYTES = 2_000_000;
const DEFAULT_READ_LIMIT = 3000;

/**
 * WHAT THE MODEL HAS ALREADY SEEN.
 *
 * The operating rules say "read_file before edit_file, every time", and they are right to:
 * edit_file needs a byte-exact old_string, so guessing at it wastes a turn. But taken
 * literally it means a 2000-line composition is re-read before every single edit, and each
 * re-read is ~15K tokens that then sit in the transcript forever. Six edits cost ninety
 * thousand tokens to re-learn a file that never changed.
 *
 * That is not how anyone actually works. You read a file once, you remember it, and you
 * re-read only the part you are unsure about. This map is that memory: path → hash of the
 * bytes the model was last shown, plus which line range it saw.
 *
 * Keyed on a hash of the content rather than mtime, because the point is to detect that the
 * file is DIFFERENT, and mtime lies in both directions — a save that changes nothing bumps
 * it, and a fast successive write may not. If the user edits index.html in the web editor
 * mid-run, the hash moves and the next read returns the real file.
 *
 * Per-project, and cleared when a run starts, so one build never inherits stale beliefs
 * from the last one.
 */
const seenFiles = new Map();

const hashOf = (text) => crypto.createHash('sha1').update(text).digest('hex');

/** Called at the start of each agent run — see resetSkillAnnouncements for the same idea. */
export function resetFileMemory() {
  seenFiles.clear();
}

/**
 * Records that the model has now seen `text` for `key`.
 * Every path that writes or reads a file funnels through here, so the memory cannot drift
 * from what was actually shown.
 */
function remember(key, text, { from = 1, to = 0, full = false } = {}) {
  seenFiles.set(key, { hash: hashOf(text), from, to: to || countLines(text), full });
}

/**
 * Re-stamps the memory after an edit_file wrote new bytes.
 *
 * Deliberately NOT the same as remember(..., {full:true}). An edit does not mean the model
 * has seen the whole file — it means the file changed under a view the model already had.
 * If it had only read lines 1-100 of a 2000-line composition, claiming the whole thing is
 * "seen" would make a later read of line 1500 return "unchanged, use what you have" for
 * bytes it has never been shown. That is the one way this cache could actually lie.
 *
 * So the previously-seen RANGE is carried forward untouched and only the hash moves. And if
 * there was no prior read at all, the entry is dropped rather than invented: a full read is
 * cheaper than a wrong answer.
 */
function rememberAfterEdit(key, text) {
  const prior = seenFiles.get(key);
  if (!prior) { seenFiles.delete(key); return; }
  seenFiles.set(key, { ...prior, hash: hashOf(text) });
}

/** Directories that are never interesting to the model and would flood its context. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'exports', '.temp_frames', '.anymotion']);

function relative(projectDir, absPath) {
  return path.relative(projectDir, absPath).replace(/\\/g, '/') || '.';
}

function countLines(text) {
  if (!text) return 0;
  return text.split('\n').length;
}

/** Walks the project tree, skipping build output and dependency folders. */
function walk(dir, projectDir, out = [], depth = 0) {
  if (depth > 6) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push({ path: relative(projectDir, full) + '/', dir: true });
      walk(full, projectDir, out, depth + 1);
    } else {
      let size = 0;
      try { size = fs.statSync(full).size; } catch (_) {}
      out.push({ path: relative(projectDir, full), dir: false, size });
    }
  }
  return out;
}

/**
 * Compiles a simple glob ("*.css", "assets/*.js", "assets/**.json") to a RegExp matched
 * against project-relative paths. `*` stays within one path segment; `**` crosses them.
 */
function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; }
      else re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp('^' + re + '$');
}

/** True when `text` parses as a complete JavaScript program. */
function parsesClean(text) {
  try {
    // new Function compiles the body as a program — a SyntaxError here is the same
    // one node --check would report, and it costs a few ms with no child process.
    new Function(text);
    return true;
  } catch (e) {
    if (e instanceof SyntaxError) return false;
    throw e;
  }
}

/**
 * Validates and heals common syntax errors before writing to disk.
 *
 * JS healing is parse-first: if the content already parses, NOTHING is appended. The
 * old version counted raw {/(/[ characters — including the ones inside strings,
 * comments and regex literals — so any file with a "{" inside a string literal got
 * garbage closers bolted on the end, and the model then spent turns debugging
 * corruption it did not cause. Bracket math runs only on content that provably fails
 * to parse, and only when the imbalance is small.
 *
 * Returns { content, issues } — `issues` are human/model-readable warnings that the
 * caller appends to the tool result, so a file that still does not parse is flagged in
 * the same turn it was written, not three debug cycles later.
 */
function validateAndHealSyntax(filePath, content) {
  if (typeof content !== 'string') return { content, issues: [] };
  const ext = path.extname(filePath).toLowerCase();
  let healed = content;
  const issues = [];

  if (ext === '.json') {
    try {
      JSON.parse(healed);
    } catch (e) {
      try {
        const repaired = healed.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        JSON.parse(repaired);
        healed = repaired;
      } catch (_) {
        throw new Error(`JSON syntax error in ${filePath}: ${e.message}`);
      }
    }
  } else if (ext === '.js') {
    // 1. Unclosed template literal (odd count of unescaped backticks) — still worth
    //    fixing before a parse, because the parse would only say "unexpected end".
    const backticks = (healed.match(/(?<!\\)`/g) || []).length;
    if (backticks % 2 !== 0) {
      healed += '`';
    }

    // 2. Bracket healing, but ONLY when the file does not already parse. A file that
    //    parses is correct by definition; the counts below would still see "extra"
    //    brackets inside string literals and corrupt a working file.
    if (!parsesClean(healed)) {
      const before = healed;
      let openB = (healed.match(/{/g) || []).length;
      let closeB = (healed.match(/}/g) || []).length;
      let openP = (healed.match(/\(/g) || []).length;
      let closeP = (healed.match(/\)/g) || []).length;
      let openBr = (healed.match(/\[/g) || []).length;
      let closeBr = (healed.match(/\]/g) || []).length;

      if (openBr > closeBr && openBr - closeBr <= 10) {
        healed += '\n' + ']'.repeat(openBr - closeBr);
      }
      if (openP > closeP && openP - closeP <= 10) {
        healed += '\n' + ')'.repeat(openP - closeP);
      }
      if (openB > closeB && openB - closeB <= 10) {
        healed += '\n' + '}'.repeat(openB - closeB);
      }

      // If appending closers did not rescue the parse, it made things worse — a file
      // that fails with a clearer error beats a file that fails AND has junk on the end.
      if (healed !== before && !parsesClean(healed)) {
        healed = before;
      }
    }

    // 3. Still unparseable after healing: write it anyway (the model may be mid-refactor
    //    and editing another file first), but say so loudly so the next turn fixes it
    //    instead of the failure surfacing later as a mysterious runtime bug.
    if (!parsesClean(healed)) {
      try {
        new Function(healed);
      } catch (e) {
        if (e instanceof SyntaxError) {
          issues.push(
            `⚠ ${path.basename(filePath)} has a SYNTAX ERROR: ${e.message}. ` +
            `Fix it with edit_file before building anything else on top of it.`
          );
        }
      }
    }

    // 4. Auto-ensure responsive fitStage scaler exists in timeline.js
    if (path.basename(filePath).toLowerCase() === 'timeline.js' && !healed.includes('fitStage') && !healed.includes('stage-scale')) {
      const fitStageSnippet = `\n/* Auto-scale 1920x1080 stage to fit any screen resolution */\nfunction fitStage() {\n  var vw = window.innerWidth || 1920, vh = window.innerHeight || 1080;\n  var s = Math.min(vw / 1920, vh / 1080);\n  document.documentElement.style.setProperty('--stage-scale', s);\n}\nwindow.addEventListener('resize', fitStage);\nfitStage();\n`;
      healed = fitStageSnippet + healed;
    }
  } else if (ext === '.html') {
    // 1. Auto-heal unclosed <script> tag if script was cut off
    const openScripts = (healed.match(/<script\b[^>]*>/gi) || []).length;
    const closeScripts = (healed.match(/<\/script>/gi) || []).length;
    if (openScripts > closeScripts) {
      let openB = (healed.match(/{/g) || []).length;
      let closeB = (healed.match(/}/g) || []).length;
      if (openB > closeB && openB - closeB <= 10) {
        healed += '\n' + '}'.repeat(openB - closeB);
      }
      healed += '\n</script>';
    }

    // 2. Auto-heal unclosed <style> tag
    const openStyles = (healed.match(/<style\b[^>]*>/gi) || []).length;
    const closeStyles = (healed.match(/<\/style>/gi) || []).length;
    if (openStyles > closeStyles) {
      healed += '\n</style>';
    }

    // 3. Ensure closing body and html tags if missing
    if (healed.includes('<body') && !healed.includes('</body>')) {
      healed += '\n</body>';
    }
    if (healed.includes('<html') && !healed.includes('</html>')) {
      healed += '\n</html>';
    }

    // 4. Auto-ensure playback controls container exists for explainer projects
    if (healed.includes('timeline.js') && !healed.includes('id="playbtn"') && !healed.includes("id='playbtn'")) {
      const playbackMarkup = `\n  <!-- ============ PLAYBACK CONTROLS (interactive preview) ============ -->\n  <div class="playback" id="playback">\n    <button id="playbtn" title="Play / Pause (Space)" aria-label="Play / Pause">&#9654;</button>\n    <div class="tc" id="tc">00:00 / 00:25</div>\n  </div>\n`;
      if (healed.includes('</div><!-- /viewport -->')) {
        healed = healed.replace('</div><!-- /viewport -->', '</div><!-- /viewport -->' + playbackMarkup);
      } else if (healed.includes('</body>')) {
        healed = healed.replace('</body>', playbackMarkup + '</body>');
      } else {
        healed += playbackMarkup;
      }
    }
  } else if (ext === '.css') {
    // Auto-heal unclosed CSS rules
    let openB = (healed.match(/{/g) || []).length;
    let closeB = (healed.match(/}/g) || []).length;
    if (openB > closeB && openB - closeB <= 10) {
      healed += '\n' + '}'.repeat(openB - closeB);
    }
  }

  return { content: healed, issues };
}

/**
 * Write-time feedback for a just-written file — the heart of the mismatch fix.
 *
 * For a JS write (or an HTML write against existing JS):
 *   1. unambiguous near-miss references (play-btn vs playbtn) are auto-corrected in
 *      the JS to match the HTML, and
 *   2. whatever cannot be auto-fixed is reported with file:line and the correction,
 *      so the model fixes it in the same run instead of three debug turns later.
 *
 * For an HTML write, the result also carries the NAMING MANIFEST — the exact
 * ids/classes now on disk — because a big HTML file is exactly where the model's
 * next timeline.js gets its near-miss ids from.
 *
 * `rewritten` maps any JS file the repair changed to its new content, so the caller
 * re-stamps its file-memory with the bytes that are actually on disk now. Empty when
 * the counterpart file does not exist yet (a first-turn build is not a mismatch).
 */
function crossFileFeedback(relPath, projectDir, { manifest = false } = {}) {
  const ext = path.extname(relPath).toLowerCase();
  if (ext !== '.js' && ext !== '.html') {
    return { text: '', manifest: '', rewritten: new Map() };
  }
  const entry = ext === '.html' ? path.basename(relPath) : 'index.html';
  const { report, rewritten } = repairAndReport(projectDir, entry);
  const manifestText = manifest && ext === '.html'
    ? manifestOf(path.join(projectDir, path.basename(relPath)))
    : '';
  return { text: report, manifest: manifestText, rewritten };
}

export const fsTools = [
  {
    name: 'read_file',
    description:
      'Read a file from the current project folder. Returns the content with line numbers. ' +
      'Read a file before your FIRST edit to it — editing blind is the single most common way to corrupt ' +
      'a composition. You do not need to read it again between your own edits: edit_file returns the lines ' +
      'around each change, and this tool will tell you the file is unchanged rather than re-sending content ' +
      'you already have. For a file over 400 lines, use grep_files to find the line you want and then read ' +
      'that region with offset and limit.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project folder, e.g. index.html or style.css' },
        offset: { type: 'number', description: 'First line to read (1-based). Omit to start at the top.' },
        limit: { type: 'number', description: `How many lines to read. Defaults to ${DEFAULT_READ_LIMIT}.` }
      },
      required: ['path']
    },
    run(input, ctx) {
      const target = resolveInProject(ctx.project.dir, input.path);
      if (!fs.existsSync(target)) {
        throw new Error(`File not found: ${input.path}. Use list_dir to see what exists.`);
      }
      const stat = fs.statSync(target);
      if (stat.isDirectory()) throw new Error(`${input.path} is a directory — use list_dir instead.`);
      if (stat.size > MAX_READ_BYTES && !input.offset && !input.limit) {
        throw new Error(`${input.path} is ${Math.round(stat.size / 1024)} KB, too large to read whole in one turn. Re-run read_file with offset: 1, limit: 1000, or use grep_files.`);
      }

      const raw = fs.readFileSync(target, 'utf-8');
      const lines = raw.split('\n');
      const start = Math.max(0, (input.offset ? input.offset - 1 : 0));
      const limit = input.limit || DEFAULT_READ_LIMIT;
      const slice = lines.slice(start, start + limit);
      const key = target;
      const wantFrom = start + 1;
      const wantTo = start + slice.length;

      // Already seen, and unchanged since. Re-sending the bytes teaches the model nothing it
      // does not have three messages up the transcript, so send back the fact instead — far
      // cheaper, and it still answers the question the model was really asking ("is my copy
      // current?"). Only skipped when the earlier read covered the range being asked for now;
      // a narrower previous read must not suppress a wider one.
      const prior = seenFiles.get(key);
      if (prior && prior.hash === hashOf(raw) && prior.from <= wantFrom && prior.to >= wantTo) {
        return {
          content:
            `${input.path} is unchanged since you read it earlier this run (lines ${prior.from}–${prior.to}, ` +
            `${lines.length} total). You already have its current contents — use them.\n\n` +
            `Nothing has modified this file since, so old_string values copied from that read will still ` +
            `match byte for byte. Re-read only if you need a range outside ${prior.from}–${prior.to}: ` +
            `pass offset and limit for that range.`,
          meta: { lines: lines.length, shown: 0, cached: true }
        };
      }

      const width = String(start + slice.length).length;

      const body = slice
        .map((l, i) => `${String(start + i + 1).padStart(width)}\t${l}`)
        .join('\n');

      const truncated = start + slice.length < lines.length;
      remember(key, raw, { from: wantFrom, to: wantTo, full: !start && !truncated });
      return {
        content: body + (truncated ? `\n\n[truncated — file has ${lines.length} lines total]` : ''),
        meta: { lines: lines.length, shown: slice.length, cached: false }
      };
    },
    summarize(input, result) {
      return result.meta.cached ? `unchanged, already read` : `${result.meta.lines} lines`;
    },
    label(input) {
      return `Reading & Analyzing ${input.path}${input.offset ? ' (lines ' + input.offset + '–' + ((input.offset || 1) + (input.limit || 3000)) + ')' : ''}`;
    }
  },

  {
    name: 'list_dir',
    description:
      'List the files and folders in the current project. Use this first when you are not sure what the project contains.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Subfolder to list. Omit for the project root.' }
      }
    },
    run(input, ctx) {
      const target = input.path ? resolveInProject(ctx.project.dir, input.path) : ctx.project.dir;
      if (!fs.existsSync(target)) throw new Error(`No such folder: ${input.path || '.'}`);

      const entries = walk(target, ctx.project.dir);
      if (!entries.length) {
        return { content: '(empty project folder — nothing has been written yet)', meta: { count: 0 } };
      }
      const body = entries
        .map(e => (e.dir ? `  ${e.path}` : `  ${e.path}  (${Math.max(1, Math.round(e.size / 1024))} KB)`))
        .join('\n');
      return { content: body, meta: { count: entries.filter(e => !e.dir).length } };
    },
    summarize(input, result) {
      return `${result.meta.count} file${result.meta.count === 1 ? '' : 's'}`;
    },
    label(input) { return `Analyzing Directory (${input.path || '.'})`; }
  },

  {
    name: 'grep_files',
    description:
      'Search the project files with a regular expression. Returns matching lines with their file and line number. ' +
      'Use this to locate a selector, an element id, or a keyframe without reading whole files. ' +
      'Pass context to also show lines around each match — the usual way to see enough of a function or CSS rule ' +
      'to edit it without a separate read_file.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'JavaScript regular expression source, e.g. "@keyframes\\\\s+\\\\w+"' },
        path: { type: 'string', description: 'Limit the search to this file or folder. Omit to search the whole project.' },
        glob: { type: 'string', description: 'Only search files matching this pattern, e.g. "*.css" or "assets/*.js".' },
        ignore_case: { type: 'boolean' },
        context: { type: 'number', description: 'Lines of context to show before and after each match, 0–10.' }
      },
      required: ['pattern']
    },
    run(input, ctx) {
      let re;
      try {
        re = new RegExp(input.pattern, input.ignore_case ? 'i' : '');
      } catch (err) {
        throw new Error(`Invalid regular expression: ${err.message}`);
      }

      const contextLines = Math.max(0, Math.min(10, input.context | 0));
      const globRe = input.glob ? globToRegex(input.glob) : null;

      const root = input.path ? resolveInProject(ctx.project.dir, input.path) : ctx.project.dir;
      const files = fs.existsSync(root) && fs.statSync(root).isFile()
        ? [{ path: relative(ctx.project.dir, root), dir: false }]
        : walk(root, ctx.project.dir).filter(e => !e.dir);

      const hits = [];
      const MAX_HITS = 100;
      for (const file of files) {
        if (globRe && !globRe.test(file.path)) continue;
        const abs = path.join(ctx.project.dir, file.path);
        let text;
        try { text = fs.readFileSync(abs, 'utf-8'); } catch (_) { continue; }
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (hits.length >= MAX_HITS) break;
          if (!re.test(lines[i])) continue;
          if (contextLines > 0) {
            const from = Math.max(0, i - contextLines);
            const to = Math.min(lines.length - 1, i + contextLines);
            const block = [];
            for (let j = from; j <= to; j++) {
              block.push((j === i ? '>' : ' ') + `${file.path}:${j + 1}: ${lines[j].trim().slice(0, 200)}`);
            }
            hits.push(block.join('\n'));
          } else {
            hits.push(`${file.path}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
          }
        }
        if (hits.length >= MAX_HITS) break;
      }

      return {
        content: hits.length ? hits.join('\n') : `No matches for /${input.pattern}/`,
        meta: { count: hits.length }
      };
    },
    summarize(input, result) {
      return `${result.meta.count} match${result.meta.count === 1 ? '' : 'es'}`;
    },
    label(input) { return `Searching Codebase (${input.pattern})`; }
  },

  {
    name: 'write_file',
    description:
      'Create a file, or replace one entirely. Use this for new files only. ' +
      'To change part of a file that already exists, use edit_file — a full rewrite loses work and burns tokens. ' +
      'After an HTML write the result lists the NAMING CONTRACT (every id/class now on disk) — copy those names ' +
      'verbatim into the JavaScript and CSS, dashes and underscores included. After a JS write the result ' +
      'auto-corrects any near-miss id/class references to the HTML and reports anything it could not fix; ' +
      'resolve reported mismatches with edit_file before writing further files — they are exactly the bugs that ' +
      'otherwise only appear when the composition runs.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project folder, e.g. index.html' },
        content: { type: 'string', description: 'The complete file content.' }
      },
      required: ['path', 'content']
    },
    mutates: true,
    preview(input, ctx) {
      const target = resolveInProject(ctx.project.dir, input.path);
      const exists = fs.existsSync(target);
      const lines = countLines(input.content);
      return {
        title: exists ? `overwrite ${input.path}` : `create ${input.path}`,
        lines: [
          exists
            ? `This replaces the existing file (${countLines(fs.readFileSync(target, 'utf-8'))} lines).`
            : 'New file.',
          `${lines} lines, ${Math.max(1, Math.round(input.content.length / 1024))} KB`
        ]
      };
    },
    run(input, ctx) {
      const target = assertWritable(ctx.project.dir, input.path);
      const existed = fs.existsSync(target);
      ensureDir(target);
      const { content: finalContent, issues } = validateAndHealSyntax(input.path, input.content);
      fs.writeFileSync(target, finalContent, 'utf-8');

      // Repair may rewrite this very file (JS) or its siblings — the memory cache must
      // end up holding the bytes that are on disk, not the bytes the model sent.
      const feedback = crossFileFeedback(input.path, ctx.project.dir, { manifest: true });
      const onDisk = feedback.rewritten.get(path.basename(input.path)) ?? finalContent;

      // The model composed these bytes, so it already knows them — recording that here means
      // a read_file straight after a write returns "unchanged" instead of echoing back the
      // content the model just sent. That echo was a full duplicate of the write, at input
      // prices, for no new information.
      remember(target, onDisk, { full: true });

      const parts = [
        ...issues,
        feedback.manifest,
        feedback.text
      ].filter(Boolean);

      // Large first writes are exactly where near-miss ids and truncated outputs come
      // from. The system prompt says to build in stages; this is the reminder that
      // lands at the moment it matters, when it was not followed.
      if (!existed && countLines(onDisk) > 300) {
        parts.push(
          `\n💡 ${countLines(onDisk)} lines in one write — that is where id typos and truncation creep in. ` +
          `Next time: write the skeleton with section markers, then grow it with edit_file one section at a time. ` +
          `If you fill scene bodies from here, do it as separate edit_file calls per scene.`
        );
      }

      return {
        content: `${existed ? 'Overwrote' : 'Created'} ${input.path} (${countLines(onDisk)} lines).` + parts.join('\n'),
        meta: {
          added: countLines(onDisk),
          removed: 0,
          path: input.path,
          existed,
          preview: onDisk.split('\n').slice(0, 14).join('\n')
        }
      };
    },
    summarize(input, result) {
      return `+${result.meta.added} lines`;
    },
    label(input) { return `Generating File (${input.path})`; }
  },

  {
    name: 'edit_file',
    description:
      'Replace an exact string in a file. This is the preferred way to change an existing composition: ' +
      'it keeps everything you are not touching. old_string must match the file byte for byte, including ' +
      'indentation. CRITICAL: old_string MUST be completely unique. NEVER use generic lines like `</div>` or ' +
      '`}` alone. Always include 2-4 lines of context above and below the target to guarantee uniqueness, ' +
      'otherwise the edit will fail. Read the file before your first edit to it. ' +
      'This returns the lines around the change, so after editing you already have the current state of that ' +
      'region — chain further edits directly instead of re-reading the file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project folder.' },
        old_string: { type: 'string', description: 'Exact text to find. MUST include 2-4 surrounding lines to ensure the string is completely unique within the file.' },
        new_string: { type: 'string', description: 'Text to replace it with.' },
        replace_all: { type: 'boolean', description: 'Replace every occurrence instead of requiring a unique match.' }
      },
      required: ['path', 'old_string', 'new_string']
    },
    mutates: true,
    preview(input, ctx) {
      return {
        title: `edit ${input.path}`,
        diff: buildDiff(input.old_string, input.new_string)
      };
    },
    run(input, ctx) {
      const target = assertWritable(ctx.project.dir, input.path);
      if (!fs.existsSync(target)) {
        throw new Error(`File not found: ${input.path}. Use write_file to create it.`);
      }
      if (input.old_string === input.new_string) {
        throw new Error('old_string and new_string are identical — nothing to change.');
      }

      const original = fs.readFileSync(target, 'utf-8');
      const occurrences = original.split(input.old_string).length - 1;

      if (occurrences === 0) {
        // Auto-heal whitespace-only/indentation differences if unique
        const normalizeWS = s => s.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
        const normOriginal = normalizeWS(original);
        const normOld = normalizeWS(input.old_string);
        const normOccurrences = normOriginal.split(normOld).length - 1;

        if (normOccurrences === 1) {
          const origLines = original.split('\n');
          const targetTrimmed = input.old_string.split('\n').map(l => l.trim()).filter(Boolean);
          let matchStart = -1;
          let matchEnd = -1;

          for (let i = 0; i < origLines.length; i++) {
            if (origLines[i].trim() === targetTrimmed[0]) {
              let tIdx = 0;
              let oIdx = i;
              while (tIdx < targetTrimmed.length && oIdx < origLines.length) {
                const oTrimmed = origLines[oIdx].trim();
                if (!oTrimmed) {
                  oIdx++;
                  continue; // Skip empty lines in original
                }
                if (oTrimmed === targetTrimmed[tIdx]) {
                  tIdx++;
                  oIdx++;
                } else {
                  break;
                }
              }
              if (tIdx === targetTrimmed.length) {
                matchStart = i;
                matchEnd = oIdx;
                break;
              }
            }
          }

          if (matchStart >= 0) {
            const matchedRaw = origLines.slice(matchStart, matchEnd).join('\n');
            input.old_string = matchedRaw;
            return this.run(input, ctx);
          }
        }

        // The failure tells the model what to do, but the nearby actual text tells it what
        // string to try instead — so it does not have to read the whole file again, guess,
        // and fail a second time.
        const lines = original.split('\n');
        const searchLines = input.old_string.split('\n');
        const firstSearchLine = searchLines[0] || '';
        let bestMatch = '';
        let bestScore = 0;

        const needleTrimmed = firstSearchLine.trim();
        if (needleTrimmed) {
          for (const line of lines) {
            const candidate = line.trim();
            if (!candidate) continue;
            let score = 0;
            const limit = Math.min(candidate.length, needleTrimmed.length);
            for (let i = 0; i < limit; i++) {
              if (candidate[i] === needleTrimmed[i]) score++;
              else break;
            }
            if (score > bestScore && score >= 4) { bestScore = score; bestMatch = line; }
          }
        }

        const excerpt = bestMatch
          ? `The closest line in the file is:\n  ${bestMatch.slice(0, 120)}`
          : `The file starts with:\n  ${lines.slice(0, 3).join('\n  ').slice(0, 200)}`;

        throw new Error(
          `old_string was not found in ${input.path}. It must match exactly, including whitespace. ` +
          `${excerpt}\n\nRe-read the file and copy the text verbatim, or use that nearby line as old_string.`
        );
      }
      if (occurrences > 1 && !input.replace_all) {
        throw new Error(
          `old_string appears ${occurrences} times in ${input.path}. ` +
          `You MUST include 2-4 lines of surrounding context above and below the target to guarantee uniqueness, ` +
          `or set replace_all to true if you genuinely want to replace every occurrence.`
        );
      }

      const updated = input.replace_all
        ? original.split(input.old_string).join(input.new_string)
        : original.replace(input.old_string, input.new_string);

      const { content: finalContent, issues } = validateAndHealSyntax(input.path, updated);
      fs.writeFileSync(target, finalContent, 'utf-8');

      // Repair may rewrite this file right after the edit landed — everything below
      // (the memory stamp and the context echo) must reflect the repaired bytes.
      const feedback = crossFileFeedback(input.path, ctx.project.dir);
      const onDisk = feedback.rewritten.get(path.basename(input.path)) ?? finalContent;

      // Re-stamp the hash, keeping whatever range the model had actually read. See
      // rememberAfterEdit — marking the whole file seen here is the one thing that would
      // let this cache withhold bytes the model has never been shown.
      rememberAfterEdit(target, onDisk);

      const removed = countLines(input.old_string) * (input.replace_all ? occurrences : 1);
      const added = countLines(input.new_string) * (input.replace_all ? occurrences : 1);

      // CONTEXT WINDOW — what makes this different from write_file.
      //
      // The edit landed. The model now wants to know whether it worked, and whether it can
      // keep editing without re-reading the file. So instead of returning only "done", we
      // return the lines bracketing the change: enough to confirm it landed in the right
      // place, and enough to anchor the next edit if one follows immediately.
      //
      // Cost: a few hundred tokens against the ~15K a full re-read of a large composition
      // costs — and unlike the re-read, this is not paid again on every later turn.
      //
      // The bracket is what is worth sending; the replacement body is not. The model wrote
      // new_string, so echoing it back charges input tokens to tell it what it just said. On
      // a 100-line insert that echo is larger than the saving, so past a threshold only the
      // surrounding lines are returned and the middle is elided.
      const updatedLines = onDisk.split('\n');
      const needle = input.new_string;
      const idx = onDisk.indexOf(needle);
      const PAD = 5;
      const MAX_ECHO_LINES = 20;
      let context = '';

      if (idx >= 0) {
        const editStartLine = finalContent.slice(0, idx).split('\n').length;
        const editLineCount = needle.split('\n').length;
        const editEndLine = editStartLine + editLineCount - 1;
        const contextStart = Math.max(1, editStartLine - PAD);
        const contextEnd = Math.min(updatedLines.length, editEndLine + PAD);
        const width = String(contextEnd).length;
        const number = (l, n) => `${String(n).padStart(width)}\t${l}`;

        let body;
        if (editLineCount > MAX_ECHO_LINES) {
          const head = updatedLines
            .slice(contextStart - 1, editStartLine + 2)
            .map((l, i) => number(l, contextStart + i));
          const tailStart = editEndLine - 2;
          const tail = updatedLines
            .slice(tailStart - 1, contextEnd)
            .map((l, i) => number(l, tailStart + i));
          body = [
            ...head,
            `\t… ${editLineCount - 6} lines you just wrote, unchanged from what you sent …`,
            ...tail
          ].join('\n');
        } else {
          body = updatedLines
            .slice(contextStart - 1, contextEnd)
            .map((l, i) => number(l, contextStart + i))
            .join('\n');
        }

        context =
          `\nNow at lines ${contextStart}–${contextEnd} of ${updatedLines.length} ` +
          `(this is current — you do not need to re-read the file to edit near here):\n${body}`;
      }

      const writeTimeFeedback = [
        ...issues,
        feedback.text
      ].filter(Boolean).join('\n');

      return {
        content:
          `Edited ${input.path} — ${occurrences === 1 || !input.replace_all ? '1 replacement' : occurrences + ' replacements'}.` +
          context + writeTimeFeedback,
        meta: { added, removed, path: input.path, diff: buildDiff(input.old_string, input.new_string) }
      };
    },
    summarize(input, result) {
      return `+${result.meta.added} −${result.meta.removed}`;
    },
    label(input) { return `Updating File (${input.path})`; }
  }
];

/** A compact -/+ preview. Not a real diff algorithm — just enough to review an edit. */
export function buildDiff(oldStr, newStr, maxLines = 6) {
  const before = String(oldStr).split('\n').slice(0, maxLines);
  const after = String(newStr).split('\n').slice(0, maxLines);
  const out = [];
  before.forEach(l => out.push({ sign: '-', text: l.slice(0, 120) }));
  after.forEach(l => out.push({ sign: '+', text: l.slice(0, 120) }));
  return out;
}
