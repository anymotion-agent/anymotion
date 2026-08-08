/**
 * AGENT SANDBOX
 * Every filesystem and shell tool the model can reach goes through here first.
 *
 * The model writes paths it invented from a plan it invented, so "trust the input"
 * is not an option: a single `../../` in a filename would let a composition escape
 * its project folder and overwrite the CLI itself.
 */

import path from 'path';
import fs from 'fs';

/**
 * Resolves a model-supplied path against the project root and refuses anything that
 * lands outside it. Absolute paths are rejected outright rather than silently
 * re-rooted — a model asking for C:\Windows\... has misunderstood something, and
 * quietly writing to ./Windows/... would hide that.
 */
export function resolveInProject(projectDir, relPath) {
  if (typeof relPath !== 'string' || !relPath.trim()) {
    throw new Error('path is required');
  }
  const cleaned = relPath.trim().replace(/\\/g, '/');

  if (path.isAbsolute(cleaned) || /^[a-zA-Z]:/.test(cleaned)) {
    throw new Error(`Absolute paths are not allowed: "${relPath}". Use a path relative to the project folder.`);
  }

  const root = path.resolve(projectDir);
  const target = path.resolve(root, cleaned);

  // path.relative is the reliable containment test: string prefix comparison would
  // accept a sibling folder whose name merely starts with the root's name.
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes the project folder: "${relPath}".`);
  }
  return target;
}

/** Reserved names that must never be clobbered by a generated file. */
const PROTECTED = new Set(['project.json']);

export function assertWritable(projectDir, relPath) {
  const target = resolveInProject(projectDir, relPath);
  if (PROTECTED.has(path.basename(target).toLowerCase())) {
    throw new Error(`${path.basename(target)} is managed by Anymotion and cannot be written directly.`);
  }
  return target;
}

/**
 * Commands that are never worth an approval prompt, because no reasonable answer to
 * "do you want to run this?" is yes. Matched before the prompt so a mis-keyed "y"
 * cannot authorise them.
 */
const BLOCKED_COMMAND_PATTERNS = [
  { re: /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rf]/i, why: 'recursive/forced delete' },
  { re: /\brmdir\s+\/s/i, why: 'recursive directory delete' },
  { re: /\bdel\s+\/[sq]/i, why: 'recursive delete' },
  // PowerShell is the default shell on Windows, and none of the POSIX patterns above
  // match it — `Remove-Item -Recurse -Force C:\` sailed straight through to the prompt.
  { re: /\b(remove-item|ri|rd|erase)\b[^|;]*-(recurse|force)\b/i, why: 'recursive/forced delete (PowerShell)' },
  { re: /\bremove-item\b[^|;]*\b-path\b\s*['"]?[a-z]:[\\/]?['"]?(\s|$)/i, why: 'delete at a drive root (PowerShell)' },
  { re: /\bclear-(disk|content)\b/i, why: 'destroys disk or file contents (PowerShell)' },
  { re: /\bformat-volume\b/i, why: 'volume format (PowerShell)' },
  { re: /\bstop-computer\b|\brestart-computer\b/i, why: 'system power control (PowerShell)' },
  { re: /\bformat\s+[a-z]:/i, why: 'disk format' },
  { re: /\bmkfs\b/i, why: 'filesystem format' },
  { re: /\bdd\s+[^|]*of=\/dev\//i, why: 'raw device write' },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/i, why: 'system power control' },
  { re: /\b(curl|wget|iwr|invoke-webrequest)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|powershell|pwsh|iex)/i, why: 'pipe-to-shell install' },
  { re: /\|\s*iex\b|\biex\s*\(/i, why: 'pipe-to-shell install (PowerShell)' },
  { re: /\bgit\s+push\b/i, why: 'publishes code to a remote' },
  { re: /\bnpm\s+publish\b/i, why: 'publishes a package' },
  { re: /\b(chmod|chown)\s+-R\s+\/(?!\w)/i, why: 'recursive permission change on /' },
  { re: />\s*\/dev\/sd[a-z]/i, why: 'raw disk write' },
  { re: /:\(\)\s*\{.*\}\s*;\s*:/, why: 'fork bomb' }
];

/** Returns a reason string when the command must be refused, or null when it may proceed. */
export function blockedCommandReason(command) {
  const cmd = String(command || '');
  for (const { re, why } of BLOCKED_COMMAND_PATTERNS) {
    if (re.test(cmd)) return why;
  }
  return null;
}

/** True for tools that only observe. These skip the approval prompt entirely. */
export const READ_ONLY_TOOLS = new Set([
  'read_file',
  'list_dir',
  'grep_files',
  'fetch_page',
  'web_search',
  'list_sfx',
  'check_composition',
  'preview_frames',
  'update_todos',
  // Reading reference material is no different from reading a file.
  'list_skills',
  'load_skill',
  // Asking is the opposite of acting: gating a question behind "do you want to proceed?"
  // would make the user answer twice to say one thing.
  'ask_user'
]);

/** Creates the project folder lazily so tools can write before the first build lands. */
export function ensureDir(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  return target;
}
