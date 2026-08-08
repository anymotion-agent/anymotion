/**
 * PROJECT WORKSPACE
 * Every generated animation gets its own folder under ./projects, so a second
 * request never overwrites the first and each composition keeps its own exports.
 *
 * Layout:
 *   projects/
 *     saas-analytics-explainer/
 *       index.html          the composition
 *       project.json        prompt, plan, model, thinking level, timestamps
 *       exports/            rendered MP4s for this project only
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Where generated projects live. Overridable so tests and CI can point at a temp
 * folder instead of the real home directory; the default is unchanged, so existing
 * workspaces keep working.
 */
export let PROJECTS_DIR = path.resolve(
  process.env.ANYMOTION_PROJECTS_DIR || path.join(os.homedir(), 'anymotion-projects')
);

/** The default, kept so `/cd` with no argument can go back to it. */
export const DEFAULT_PROJECTS_DIR = PROJECTS_DIR;

/**
 * Repoints the workspace at another folder — what `/cd` calls.
 *
 * `let` rather than `const` above is deliberate: ESM exports are live bindings, so every
 * module that already imported PROJECTS_DIR sees this change without being re-imported or
 * having to ask for the value through a function. That is what makes this a four-line
 * feature instead of a refactor of every call site.
 *
 * The folder is created if it does not exist and checked for writability here, because the
 * alternative is discovering it is read-only halfway through a build, after the plan has
 * been approved and the first two scenes are already written.
 */
export function setProjectsDir(dir) {
  const resolved = path.resolve(dir);
  fs.mkdirSync(resolved, { recursive: true });
  fs.accessSync(resolved, fs.constants.W_OK);
  PROJECTS_DIR = resolved;
  return resolved;
}

/** kebab-case, filesystem-safe, and short enough to stay readable in a path. */
export function slugify(text, fallback = 'untitled') {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');
  return slug || fallback;
}

/**
 * Reserves a folder for a new project. A numeric suffix is appended when the name
 * is taken — reusing the directory would silently destroy the earlier composition.
 */
export function createProject(name, meta = {}) {
  if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

  const base = slugify(name);
  let dir = path.join(PROJECTS_DIR, base);
  let n = 2;
  while (fs.existsSync(dir)) {
    dir = path.join(PROJECTS_DIR, `${base}-${n}`);
    n++;
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'exports'), { recursive: true });

  const project = {
    name: path.basename(dir),
    dir,
    htmlFile: path.join(dir, 'index.html'),
    exportsDir: path.join(dir, 'exports'),
    meta: { createdAt: new Date().toISOString(), ...meta }
  };

  writeMeta(project);
  return project;
}

export function writeMeta(project, extra = {}) {
  const metaPath = path.join(project.dir, 'project.json');
  const payload = {
    name: project.name,
    ...project.meta,
    ...extra,
    updatedAt: new Date().toISOString()
  };
  project.meta = payload;
  fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}

export function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const dir = path.join(PROJECTS_DIR, e.name);
      const htmlFile = path.join(dir, 'index.html');
      let meta = {};
      try {
        meta = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf-8'));
      } catch (_) {
        // A folder without readable metadata is still a usable project — the HTML
        // file is what matters, so it is listed with whatever is known.
      }
      return {
        name: e.name,
        dir,
        htmlFile,
        exportsDir: path.join(dir, 'exports'),
        exists: fs.existsSync(htmlFile),
        meta
      };
    })
    .sort((a, b) => String(b.meta.updatedAt || '').localeCompare(String(a.meta.updatedAt || '')));
}

export function findProject(name) {
  return listProjects().find(p => p.name === name || p.name === slugify(name)) || null;
}

/** Path shown in the UI — relative to cwd, forward slashes on every platform. */
export function displayPath(target) {
  const rel = path.relative(process.cwd(), target).replace(/\\/g, '/');
  return rel.startsWith('..') ? target.replace(/\\/g, '/') : './' + rel;
}
