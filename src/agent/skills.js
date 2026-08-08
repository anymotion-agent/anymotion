/**
 * SKILL REGISTRY — where skills live and what is in them.
 *
 * This is deliberately its own module rather than part of ai-engine.js. The tool registry
 * needs skill discovery, ai-engine needs it too, and ai-engine already sits downstream of
 * the tool registry through agent-loop — so putting it in ai-engine would close an import
 * cycle (ai-engine -> agent-loop -> tools/index -> skill-tools -> ai-engine). Nothing here
 * imports anything of ours beyond config, so it can be pulled in from either side safely.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GLOBAL_DIR } from '../config/config-manager.js';

/** Directory of this file, used to find the skills that ship inside the package. */
const _here = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(_here, '..', '..');

/**
 * Where skills are looked for, in order. ANYMOTION_SKILLS_DIR wins so a fork or a test can
 * point somewhere else without editing code; the package's own skills/ folder is the last
 * resort so a fresh clone works before `anymotion install` has published anything.
 *
 * The original list hardcoded one machine's home path (C:/Users/hp/.gemini/...), which found
 * nothing on anyone else's computer and made the agent silently run with no motion guidance.
 */
export function skillSearchRoots() {
  const roots = [];
  if (process.env.ANYMOTION_SKILLS_DIR) roots.push(path.resolve(process.env.ANYMOTION_SKILLS_DIR));
  roots.push(path.join(GLOBAL_DIR, 'skills'));
  roots.push(path.resolve(process.cwd(), 'skills'));
  roots.push(path.join(PACKAGE_ROOT, 'skills'));
  return roots;
}

/**
 * Reads the YAML front-matter a SKILL.md opens with, without pulling in a YAML parser.
 *
 * Only `name` and `description` are wanted and both are plain single-line scalars, so a line
 * scan over the fenced block is enough. A skill with no front-matter yields nothing rather
 * than failing — several of the older skills predate the convention.
 */
function readFrontMatter(file) {
  try {
    // Front-matter lives in the first few hundred bytes. Reading the whole file to get at it
    // would mean loading ~250KB per skill just to build a list.
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(2048);
    const read = fs.readSync(fd, buf, 0, 2048, 0);
    fs.closeSync(fd);

    const head = buf.subarray(0, read).toString('utf8');
    if (!head.startsWith('---')) return {};

    const end = head.indexOf('\n---', 3);
    if (end === -1) return {};

    const meta = {};
    for (const line of head.slice(3, end).split('\n')) {
      const m = line.match(/^(name|description):\s*(.+)$/);
      if (m) meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return meta;
  } catch (_) {
    return {};
  }
}

/**
 * Every skill on the search path, as `{ name, path, size, description }`.
 *
 * Deduplicated by name: when two roots hold a "motion-graphics" skill the first root wins
 * (env > global > cwd > package), so a user's own override shadows the packaged copy rather
 * than appearing twice in the list.
 *
 * This is what /skills prints, what the build prompt advertises to the model, and what
 * load_skill validates its argument against.
 */
export function listSkills() {
  const found = new Map();

  const add = (name, file) => {
    if (found.has(name)) return;
    let size = 0;
    try { size = Math.round(fs.statSync(file).size / 1024); } catch (_) { return; }
    found.set(name, { name, path: file, size, description: readFrontMatter(file).description || '' });
  };

  for (const root of skillSearchRoots()) {
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { continue; }

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const file = path.join(root, ent.name, 'SKILL.md');
        if (fs.existsSync(file)) add(ent.name, file);
      } else if (ent.name === 'SKILL.md') {
        // The unnamed root-level skill. Named from its own front-matter where it has any, so
        // it does not sit in the list as a bare filename.
        const file = path.join(root, 'SKILL.md');
        add(readFrontMatter(file).name || path.basename(root), file);
      }
    }
  }

  return Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One skill by name, with its text.
 *
 * SOURCE FILES is stripped for the same reason the build prompt strips it: it is 145KB of
 * verbatim CSS and JS the model can already write from the instructions above it, and sending
 * it costs more context than the whole rest of the skill combined.
 */
export function readSkill(skillName, opts = {}) {
  const entry = listSkills().find(s => s.name === skillName);
  if (!entry) return null;

  let text;
  try {
    text = fs.readFileSync(entry.path, 'utf8');
  } catch (_) {
    return null;
  }

  if (opts.stripSourceFiles !== false) {
    const idx = text.indexOf('## SOURCE FILES');
    if (idx > 0) text = text.slice(0, idx).trim();
  }

  return { ...entry, text };
}

/**
 * The catalogue line the build prompt carries.
 *
 * Without this the model has no idea the other skills exist, so load_skill would only ever
 * fire if the user named a skill out loud. Naming them — with their own descriptions — is
 * what lets the model notice mid-run that the job it has turned out to be is one a skill
 * already covers.
 */
export function skillCatalogue(alreadyLoaded = []) {
  const loaded = new Set(alreadyLoaded);
  const rest = listSkills().filter(s => !loaded.has(s.name));
  if (!rest.length) return '';

  const lines = rest.map(s => `  • ${s.name} — ${s.description || 'no description'}`);

  return (
    `\n# OTHER SKILLS AVAILABLE ON DEMAND\n` +
    `The guidance above is already loaded. These are NOT — call load_skill("<name>") to read ` +
    `one when the job needs it, BEFORE you write the code it would inform:\n` +
    lines.join('\n') +
    `\nLoad at most two per run, and only when the request genuinely needs what they cover. ` +
    `They cost real context.\n`
  );
}
