/**
 * CROSS-FILE CONTRACT AUDIT & REPAIR
 *
 * The single most expensive failure this agent makes is not a hard bug — it is a
 * spelling. The model writes index.html with id="playbtn", then writes timeline.js
 * querying getElementById('play-btn'), and both files look perfect on their own. The
 * mismatch only shows up when the composition runs, so the model discovers it three
 * turns later inside a debugging loop: check_composition reports it, the model edits,
 * re-checks, edits again — every round a full context re-read of files that were
 * already correct.
 *
 * This module works that problem from both ends:
 *
 *   PREVENT — manifestOf() lists the exact ids/classes a just-written HTML declares,
 *   so the model's very next message carries the real spellings when it writes
 *   timeline.js. Big files are where near-miss ids come from; a compact manifest is
 *   what makes recall trivial.
 *
 *   CURE — auditIdClassContracts() statically compares every JS id/class reference
 *   against the HTML (with file:line and a suggested correction), and
 *   repairIdClassContracts() goes one step further: when the mismatch has exactly one
 *   unambiguous fuzzy match (play-btn ↔ playbtn, -/_/case insensitive), the JS is
 *   rewritten to the HTML's spelling automatically. The DOM defines the ids; the JS
 *   must follow it. What cannot be auto-fixed is reported for the model to fix.
 *
 * It is deliberately one-directional: HTML ids that JS never touches are not bugs, and
 * classes the JS adds at runtime (active, paused, …) or builds via createElement are
 * not markup either.
 */

import fs from 'fs';
import path from 'path';

const norm = (s) => String(s).replace(/[-_]/g, '').toLowerCase();

/**
 * Classes a timeline toggles at runtime rather than expects in markup. Listing them
 * keeps the audit quiet on the one legitimate way for a class to be absent from HTML.
 */
const RUNTIME_CLASSES = new Set([
  'scene', 'card', 'active', 'visible', 'hidden', 'playing', 'paused',
  'done', 'open', 'closed', 'selected', 'disabled', 'show', 'hide'
]);

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

/** Root-level .js files — the composition's scripts. assets/ is data, not logic. */
function scriptFiles(projectDir) {
  try {
    return fs.readdirSync(projectDir, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.js') && !e.name.startsWith('.'))
      .map(e => e.name);
  } catch (_) {
    return [];
  }
}

/** All attribute-declared contracts of an HTML document, as sets. */
function htmlContractsOf(html) {
  const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
  const classes = new Set();
  for (const m of html.matchAll(/\bclass=["']([^"']+)["']/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
  }
  const scenes = new Set([...html.matchAll(/data-scene=["']([^"']+)["']/g)].map(m => m[1]));
  return { ids, classes, scenes };
}

/**
 * Everything the audit and the repair need, in one pass: the HTML's declared
 * contracts, every root .js source, and the ids/classes the JS itself creates.
 */
function collect(projectDir, entryRel) {
  const htmlPath = path.join(projectDir, entryRel);
  if (!fs.existsSync(htmlPath)) return { skipped: 'html' };

  const jsNames = scriptFiles(projectDir);
  if (!jsNames.length) return { skipped: 'js' };

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const contracts = htmlContractsOf(html);

  const jsSources = jsNames.map(name => ({
    name,
    text: fs.readFileSync(path.join(projectDir, name), 'utf-8')
  }));

  /**
   * Elements the JavaScript builds itself never appear in markup — createElement +
   * id assignment, classList.add, or an innerHTML/template string containing class="…".
   * A query for one of those is not a mismatch, so they are collected up front and
   * treated as present. Without this, DOM-building timelines would drown the real
   * findings in false positives.
   */
  const dynamicIds = new Set();
  const dynamicClasses = new Set();
  for (const { text } of jsSources) {
    for (const m of text.matchAll(/\bid\s*[:=]\s*["']([^"']+)["']/g)) dynamicIds.add(m[1]);
    for (const m of text.matchAll(/\bid=["']([^"']+)["']/g)) dynamicIds.add(m[1]);
    for (const m of text.matchAll(/class(?:Name)?\s*[:=]\s*["']([^"']+)["']/g)) {
      m[1].split(/\s+/).filter(Boolean).forEach(c => dynamicClasses.add(c));
    }
    for (const m of text.matchAll(/class=["']([^"']+)["']/g)) {
      m[1].split(/\s+/).filter(Boolean).forEach(c => dynamicClasses.add(c));
    }
    for (const m of text.matchAll(/classList\.(?:add|toggle|replace)\(\s*["']([^"']+)["']/g)) {
      dynamicClasses.add(m[1]);
    }
  }

  return { htmlPath, entryRel, contracts, jsSources, dynamicIds, dynamicClasses };
}

/** The id/class this reference almost certainly meant, or null. */
const closest = (want, have) => [...have].find(h => norm(h) === norm(want)) || null;

/**
 * Static audit: JS references vs HTML declarations.
 *
 * @param {string} projectDir absolute project folder
 * @param {string} entryRel   entry html, relative — usually index.html
 * @returns {{ findings: string[], skipped?: string }}
 *          `skipped` names the file that does not exist yet, so a first-turn write
 *          (index.html before timeline.js exists) stays silent instead of reporting
 *          phantom mismatches against a half-built project.
 */
export function auditIdClassContracts(projectDir, entryRel = 'index.html') {
  const c = collect(projectDir, entryRel);
  if (c.skipped) return { findings: [], skipped: c.skipped };

  const { contracts, entryRel: entry, jsSources, dynamicIds, dynamicClasses } = c;
  const { ids: htmlIds, classes: htmlClasses, scenes: htmlScenes } = contracts;

  const findings = [];
  const report = (msg) => {
    if (findings.length < 12) findings.push(msg);
  };

  for (const { name: jsName, text: js } of jsSources) {

    // Direct id references — getElementById('x') and querySelector('#x').
    for (const m of js.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)) {
      const id = m[1];
      if (htmlIds.has(id) || dynamicIds.has(id)) continue;
      const near = closest(id, htmlIds);
      report(
        `${jsName}:${lineOf(js, m.index)} calls getElementById('${id}'), but ${entry} has no id="${id}".` +
        (near ? ` It has id="${near}" — use that, or add the missing id to the HTML.` : '')
      );
    }

    // Selector references — ids, classes and data-scene inside any querySelector string.
    for (const m of js.matchAll(/querySelector(?:All)?\(\s*(["'])([\s\S]*?)\1\s*\)/g)) {
      const sel = m[2];
      const line = lineOf(js, m.index);

      for (const idm of sel.matchAll(/#([a-zA-Z0-9_-]+)/g)) {
        const id = idm[1];
        if (htmlIds.has(id) || dynamicIds.has(id)) continue;
        const near = closest(id, htmlIds);
        report(
          `${jsName}:${line} queries '#${id}', but ${entry} has no id="${id}".` +
          (near ? ` It has id="${near}".` : '')
        );
      }

      for (const cm of sel.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
        const cls = cm[1];
        if (htmlClasses.has(cls) || dynamicClasses.has(cls) || RUNTIME_CLASSES.has(cls)) continue;
        const near = closest(cls, htmlClasses);
        report(
          `${jsName}:${line} queries '.${cls}', but ${entry} has no class="${cls}".` +
          (near ? ` It has class="${near}".` : '')
        );
      }

      for (const sm of sel.matchAll(/\[data-scene=["']?(\d+)["']?\]/g)) {
        if (htmlScenes.has(sm[1])) continue;
        report(
          `${jsName}:${line} queries [data-scene="${sm[1]}"], but ${entry} declares scenes: ` +
          (htmlScenes.size ? [...htmlScenes].join(', ') : 'none at all.')
        );
      }
    }

    for (const m of js.matchAll(/getElementsByClassName\(\s*["']([^"']+)["']\s*\)/g)) {
      const cls = m[1];
      if (htmlClasses.has(cls) || dynamicClasses.has(cls) || RUNTIME_CLASSES.has(cls)) continue;
      const near = closest(cls, htmlClasses);
      report(
        `${jsName}:${lineOf(js, m.index)} calls getElementsByClassName('${cls}'), but ${entry} has no class="${cls}".` +
        (near ? ` It has class="${near}".` : '')
      );
    }
  }

  return { findings };
}

/**
 * Auto-corrects unambiguous id/class mismatches in the JS so they match the HTML.
 *
 * Only the safest class of error is touched: the reference has EXACTLY ONE fuzzy
 * match among the HTML's real names (differing only by `-`, `_` or letter case).
 * The DOM defines the ids, so the JS is bent to the HTML, never the other way round.
 * Anything ambiguous or unmatched is left alone for the audit to report.
 *
 * @returns {{ repaired: string[], rewritten: Map<string, string> }}
 *          `rewritten` maps each modified js file name → its new full content, so the
 *          caller can keep its file-memory cache in sync with what is now on disk.
 */
export function repairIdClassContracts(projectDir, entryRel = 'index.html') {
  const c = collect(projectDir, entryRel);
  if (c.skipped) return { repaired: [], rewritten: new Map() };

  const { contracts, jsSources, dynamicIds, dynamicClasses } = c;
  const { ids: htmlIds, classes: htmlClasses } = contracts;

  const repaired = [];
  const rewritten = new Map();

  for (const { name: jsName, text: js } of jsSources) {
    const edits = [];

    // getElementById('x') — whole-call rewrite keeps the original quote style.
    for (const m of js.matchAll(/(getElementById)\(\s*(["'])([^"']+)\2\s*\)/g)) {
      const id = m[3];
      if (htmlIds.has(id) || dynamicIds.has(id)) continue;
      const near = closest(id, htmlIds);
      if (!near) continue;
      edits.push({
        start: m.index,
        end: m.index + m[0].length,
        text: `${m[1]}(${m[2]}${near}${m[2]})`
      });
      repaired.push(`${jsName}: getElementById('${id}') → '${near}'`);
    }

    // querySelector strings — repair the #id / .class tokens inside the selector.
    for (const m of js.matchAll(/(querySelector(?:All)?)\(\s*(["'])([\s\S]*?)\2\s*\)/g)) {
      const sel = m[3];
      let changed = false;

      const fixed = sel
        .replace(/#([a-zA-Z0-9_-]+)/g, (tok, id) => {
          if (htmlIds.has(id) || dynamicIds.has(id)) return tok;
          const near = closest(id, htmlIds);
          if (!near) return tok;
          changed = true;
          repaired.push(`${jsName}: '#${id}' → '#${near}'`);
          return '#' + near;
        })
        .replace(/\.([a-zA-Z0-9_-]+)/g, (tok, cls) => {
          if (htmlClasses.has(cls) || dynamicClasses.has(cls) || RUNTIME_CLASSES.has(cls)) return tok;
          const near = closest(cls, htmlClasses);
          if (!near) return tok;
          changed = true;
          repaired.push(`${jsName}: '.${cls}' → '.${near}'`);
          return '.' + near;
        });

      if (changed) {
        edits.push({
          start: m.index,
          end: m.index + m[0].length,
          text: `${m[1]}(${m[2]}${fixed}${m[2]})`
        });
      }
    }

    // getElementsByClassName('x')
    for (const m of js.matchAll(/(getElementsByClassName)\(\s*(["'])([^"']+)\2\s*\)/g)) {
      const cls = m[3];
      if (htmlClasses.has(cls) || dynamicClasses.has(cls) || RUNTIME_CLASSES.has(cls)) continue;
      const near = closest(cls, htmlClasses);
      if (!near) continue;
      edits.push({
        start: m.index,
        end: m.index + m[0].length,
        text: `${m[1]}(${m[2]}${near}${m[2]})`
      });
      repaired.push(`${jsName}: getElementsByClassName('${cls}') → '${near}'`);
    }

    if (!edits.length) continue;

    // Apply back-to-front so earlier offsets stay valid.
    edits.sort((a, b) => b.start - a.start);
    let out = js;
    for (const e of edits) {
      out = out.slice(0, e.start) + e.text + out.slice(e.end);
    }
    fs.writeFileSync(path.join(projectDir, jsName), out, 'utf-8');
    rewritten.set(jsName, out);
  }

  return { repaired, rewritten };
}

/**
 * One-call write-time feedback: repair what is unambiguous, then report whatever
 * genuinely needs the model's attention.
 *
 * @returns {{ report: string, rewritten: Map<string, string> }}
 */
export function repairAndReport(projectDir, entryRel = 'index.html') {
  const { repaired, rewritten } = repairIdClassContracts(projectDir, entryRel);
  const { findings, skipped } = auditIdClassContracts(projectDir, entryRel);
  if (skipped && !repaired.length) return { report: '', rewritten };

  let report = '';

  if (repaired.length) {
    const shown = repaired.slice(0, 8);
    const more = repaired.length - shown.length;
    report +=
      `\n\n✓ AUTO-CORRECTED ${repaired.length} near-miss reference(s) in the JavaScript to match the HTML ` +
      `(no action needed — the files now agree):\n` +
      shown.map(r => `  ${r}`).join('\n') +
      (more > 0 ? `\n  … and ${more} more` : '');
  }

  if (findings.length) {
    report +=
      '\n\n⚠ CROSS-FILE MISMATCHES — fix these now with edit_file, do not continue building on top of them:\n' +
      findings.map((f, i) => `${i + 1}. ${f}`).join('\n');
  }

  return { report, rewritten };
}

/**
 * Renders the audit alone for a tool result — no rewriting. Returns '' when there is
 * nothing to say, so callers can concatenate it unconditionally. check_composition
 * and diagnose_issue use this: they are read-side tools and must not edit files.
 */
export function contractReport(projectDir, entryRel = 'index.html') {
  const { findings, skipped } = auditIdClassContracts(projectDir, entryRel);
  if (skipped || !findings.length) return '';
  return (
    '\n\n⚠ CROSS-FILE MISMATCHES — fix these now with edit_file, do not continue building on top of them:\n' +
    findings.map((f, i) => `${i + 1}. ${f}`).join('\n')
  );
}

/**
 * The PREVENT half: a compact list of the exact names an HTML file declares, for the
 * write_file tool result. When the model next writes timeline.js, these spellings are
 * the most recent thing in its context — which is precisely what a 60-id composition
 * needs, because near-miss ids come from the model guessing at names it wrote twenty
 * thousand tokens ago.
 */
export function manifestOf(htmlPath) {
  if (!fs.existsSync(htmlPath)) return '';
  const { ids, classes, scenes } = htmlContractsOf(fs.readFileSync(htmlPath, 'utf-8'));
  if (!ids.size && !classes.size && !scenes.size) return '';

  const list = (set, cap = 60) => {
    const arr = [...set];
    return arr.length <= cap
      ? arr.join(', ')
      : arr.slice(0, cap).join(', ') + `, … (+${arr.length - cap} more)`;
  };

  const lines = [
    '',
    '📌 NAMING CONTRACT — the exact ids/classes now on disk. Use THESE spellings verbatim in',
    'timeline.js and style.css (watch the dashes and underscores — they must match byte for byte):'
  ];
  if (ids.size) lines.push(`  ids (${ids.size}): ${list(ids)}`);
  if (classes.size) lines.push(`  classes (${classes.size}): ${list(classes)}`);
  if (scenes.size) lines.push(`  data-scene values (${scenes.size}): ${list(scenes)}`);
  return '\n' + lines.join('\n');
}
