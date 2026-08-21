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

import os from 'os';

/**
 * Where skills are looked for, in order.
 * Discovers skills from environment variables, workspace skills, global anymotion skills,
 * user agent skills (.agents/skills), gemini skills (.gemini/config/skills), and installed plugins.
 */
export function skillSearchRoots() {
  const roots = [];
  if (process.env.ANYMOTION_SKILLS_DIR) roots.push(path.resolve(process.env.ANYMOTION_SKILLS_DIR));
  roots.push(path.resolve(process.cwd(), 'skills'));
  roots.push(path.resolve(process.cwd(), '.agents', 'skills'));
  roots.push(path.resolve(process.cwd(), '.gemini', 'skills'));
  roots.push(path.join(PACKAGE_ROOT, 'skills'));
  roots.push(path.join(GLOBAL_DIR, 'skills'));

  const home = os.homedir();
  roots.push(path.join(home, '.agents', 'skills'));
  roots.push(path.join(home, '.gemini', 'config', 'skills'));

  // Also scan plugin skills in ~/.gemini/config/plugins and ~/.agents/plugins
  const pluginRoots = [
    path.join(home, '.gemini', 'config', 'plugins'),
    path.join(home, '.agents', 'plugins'),
    path.resolve(process.cwd(), '.gemini', 'plugins')
  ];

  for (const pr of pluginRoots) {
    if (fs.existsSync(pr)) {
      try {
        const plugins = fs.readdirSync(pr, { withFileTypes: true });
        for (const plug of plugins) {
          if (plug.isDirectory()) {
            const plugSkillDir = path.join(pr, plug.name, 'skills');
            if (fs.existsSync(plugSkillDir)) roots.push(plugSkillDir);
            const directSkill = path.join(pr, plug.name, 'SKILL.md');
            if (fs.existsSync(directSkill)) roots.push(path.join(pr, plug.name));
          }
        }
      } catch (_) {}
    }
  }

  // Filter existing directories and deduplicate
  const seen = new Set();
  const valid = [];
  for (const r of roots) {
    const res = path.resolve(r);
    if (!seen.has(res) && fs.existsSync(res)) {
      seen.add(res);
      valid.push(res);
    }
  }
  return valid;
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
import { execSync } from 'child_process';

function ensureSkillUnpacked(file) {
  try {
    if (!fs.existsSync(file)) return file;
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    if (buf[0] === 0x50 && buf[1] === 0x4B) {
      // It's a ZIP archive package (.skill)
      const dir = file.endsWith('.skill') ? file.replace(/\.skill$/, '') : path.dirname(file);
      const skillMd = path.join(dir, 'SKILL.md');
      if (!fs.existsSync(skillMd) || fs.statSync(skillMd).size === fs.statSync(file).size) {
        fs.mkdirSync(dir, { recursive: true });
        execSync(`tar -xf "${file}" -C "${dir}"`, { stdio: 'ignore' });
      }
      if (fs.existsSync(skillMd)) return skillMd;
    }
  } catch (_) {}
  return file;
}

export function listSkills() {
  const found = new Map();

  const add = (name, file) => {
    if (found.has(name)) return;
    const resolvedFile = ensureSkillUnpacked(file);
    let size = 0;
    try { size = Math.round(fs.statSync(resolvedFile).size / 1024); } catch (_) { return; }
    found.set(name, { name, path: resolvedFile, size, description: readFrontMatter(resolvedFile).description || '' });
  };

  for (const root of skillSearchRoots()) {
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { continue; }

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const standardFile = path.join(root, ent.name, 'SKILL.md');
        const packageFile = path.join(root, ent.name, `${ent.name}.skill`);
        if (fs.existsSync(standardFile)) add(ent.name, standardFile);
        else if (fs.existsSync(packageFile)) add(ent.name, packageFile);
      } else if (ent.name === 'SKILL.md' || ent.name.endsWith('.skill')) {
        // The unnamed root-level skill, or a standalone .skill file.
        const file = path.join(root, ent.name);
        const resolved = ensureSkillUnpacked(file);
        let name = readFrontMatter(resolved).name;
        if (!name) {
          name = ent.name === 'SKILL.md' ? path.basename(root) : ent.name.replace(/\.skill$/, '');
        }
        add(name, resolved);
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
  let baseName = skillName;
  let subPath = opts.reference || null;

  if (skillName && (skillName.includes('/') || skillName.includes('\\'))) {
    const parts = skillName.split(/[/\\]/);
    if (parts[0] === 'references' || parts[0].endsWith('.md')) {
      baseName = 'saas-explainer-motion';
      subPath = skillName;
    } else {
      baseName = parts[0];
      subPath = parts.slice(1).join('/');
    }
  }

  const all = listSkills();
  const normalized = String(baseName || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const entry = all.find(s => s.name.toLowerCase() === normalized) ||
                all.find(s => s.name.toLowerCase().includes(normalized)) ||
                all.find(s => s.name === 'saas-explainer-motion');
  if (!entry) return null;

  let targetFile = entry.path;
  if (subPath) {
    const skillDir = path.extname(entry.path) ? path.dirname(entry.path) : entry.path;
    const candidate = path.resolve(skillDir, subPath);
    if (fs.existsSync(candidate)) {
      targetFile = candidate;
    }
  }

  let text;
  try {
    text = fs.readFileSync(targetFile, 'utf8');
  } catch (_) {
    return null;
  }

  if (opts.stripSourceFiles === true && !subPath) {
    const idx = text.indexOf('## SOURCE FILES');
    if (idx > 0) text = text.slice(0, idx).trim();
  }

  if (opts.section) {
    const lines = text.split('\n');
    const q = String(opts.section).toLowerCase();
    let startLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        startLine = Math.max(0, i - 2);
        break;
      }
    }
    if (startLine !== -1) {
      text = lines.slice(startLine, startLine + 500).join('\n');
    }
  }

  return { ...entry, path: targetFile, text };
}

/**
 * The two skills the prompt always inlines. Named here rather than repeated as string
 * literals across ai-engine and skill-tools, because "which skills are primary" is one
 * decision and it was previously spelled out in five places that could drift apart.
 *
 * These two are the product: saas-explainer-motion is the house style and the seek-based
 * motion engine, motion-graphics is the craft underneath it. Every run gets both.
 */
export const PRIMARY_SKILLS = ['saas-explainer-motion', 'motion-graphics'];

/**
 * The catalogue line the build prompt carries.
 *
 * Without this the model has no idea the other skills exist, so load_skill would only ever
 * fire if the user named a skill out loud. Naming them — with their own descriptions — is
 * what lets the model notice mid-run that the job it has turned out to be is one a skill
 * already covers.
 *
 * This used to close with "Load at most two per run … they cost real context", which read as
 * a budget to protect rather than a library to use. In practice the model spent its two on
 * whichever skill the request mentioned most obviously — usually motion-audio, because most
 * explainers want sound — and then stopped, so css-animations, framer-motion and
 * svg-shape-morphing were advertised on every run and almost never opened. There are only
 * four of them and they are a fraction of the size of the two already inlined, so the cap was
 * costing more in improvised technique than it ever saved in tokens.
 */
export function skillCatalogue(alreadyLoaded = PRIMARY_SKILLS) {
  const loaded = new Set(alreadyLoaded);
  const rest = listSkills().filter(s => !loaded.has(s.name));
  if (!rest.length) return '';

  const lines = rest.map(s => `  • ${s.name} (${s.size}KB) — ${s.description || 'no description'}`);

  return (
    `\n# REFERENCE SKILLS — NOT LOADED, AVAILABLE ON DEMAND\n` +
    `The guidance above is already in this prompt. The skills below are NOT — each is a ` +
    `focused reference on one technique, and they are small next to the two you already have:\n` +
    lines.join('\n') +
    `\n\nCall load_skill("<name>") for EVERY one whose subject the job actually touches, and do ` +
    `it BEFORE you write the code it would inform — reading it afterwards only tells you what ` +
    `you should have done. Concretely:\n` +
    `  • the piece has music, a voiceover, or sound effects        → motion-audio\n` +
    `  • one shape or icon turns into another                      → svg-shape-morphing\n` +
    `  • the output is a React component                           → framer-motion\n` +
    `  • an animation janks, drops frames, or needs GPU specifics  → css-animations\n` +
    `Two or three of these applying to one piece is normal, not excessive. Loading a skill you ` +
    `need is never the wrong call; improvising a technique one of them covers is.\n`
  );
}
