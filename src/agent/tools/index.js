/**
 * TOOL REGISTRY
 *
 * One place that knows every tool, so the agent loop never has to. It hands Anthropic
 * the schema list and turns a tool_use block into a tool_result block.
 *
 * The important rule here is that dispatch() ALWAYS returns a tool_result — success or
 * failure. The old handler returned undefined for unknown tool names, which produced a
 * malformed tool_result and a 400 from the API: the whole run died because the model
 * mistyped a name. A model that gets told "no such tool, here are the real ones" simply
 * corrects itself on the next turn.
 */

import { fsTools } from './fs-tools.js';
import { webTools } from './web-tools.js';
import { shellTools } from './shell-tools.js';
import { motionTools } from './motion-tools.js';
import { planTools } from './plan-tools.js';
import { skillTools } from './skill-tools.js';
import { READ_ONLY_TOOLS } from '../sandbox.js';

export const ALL_TOOLS = [
  ...planTools,
  ...fsTools,
  ...motionTools,
  ...webTools,
  ...shellTools,
  ...skillTools
];

const BY_NAME = new Map(ALL_TOOLS.map(t => [t.name, t]));

const TOOL_ALIASES = {
  powershell: 'run_command',
  bash: 'run_command',
  sh: 'run_command',
  cmd: 'run_command',
  read: 'read_file',
  write: 'write_file',
  edit: 'edit_file',
  updatetodos: 'update_todos',
  list: 'list_dir',
  grep: 'grep_files',
  download: 'fetch_asset',
  addsfx: 'add_sfx',
  readerrorlog: 'read_error_log',
  addbackgroundmusic: 'add_background_music',
  music: 'add_background_music',
  loadskill: 'load_skill',
  readskill: 'load_skill',
  skill: 'load_skill',
  listskills: 'list_skills',
  skills: 'list_skills'
};

export function getTool(name) {
  if (!name) return null;
  const lower = String(name).toLowerCase().replace(/[^a-z0-9_]/g, '');
  const resolved = TOOL_ALIASES[lower] || name;
  return BY_NAME.get(resolved) || BY_NAME.get(name) || null;
}

export function toolNames() {
  return ALL_TOOLS.map(t => t.name);
}

/** The `tools` payload for the Anthropic messages API. */
export function toolSchemas() {
  return ALL_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema
  }));
}

/** True when a tool changes something and therefore needs the user's approval. */
export function requiresApproval(name) {
  const tool = getTool(name);
  if (!tool) return false;
  if (READ_ONLY_TOOLS.has(name)) return false;
  return tool.mutates === true;
}

/** What the approval prompt shows. Falls back to a plain argument dump. */
export function previewTool(name, input, ctx) {
  const tool = getTool(name);
  if (!tool) return { title: name, lines: ['unknown tool'] };
  if (typeof tool.preview === 'function') {
    try {
      return tool.preview(input, ctx);
    } catch (err) {
      // A preview that throws must not block the call it was describing.
      return { title: name, lines: [`(could not preview: ${err.message})`] };
    }
  }
  const lines = Object.entries(input || {})
    .map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`)
    .slice(0, 6);
  return { title: name, lines: lines.length ? lines : ['no arguments'] };
}

/** The `⏺ Read(index.html)` label. */
export function labelTool(name, input) {
  const tool = getTool(name);
  if (!tool) return `${name}(?)`;
  try {
    return typeof tool.label === 'function' ? tool.label(input) : `${name}()`;
  } catch (_) {
    return `${name}()`;
  }
}

/** The `⎿ 412 lines` line under it. */
export function summarizeTool(name, input, result) {
  const tool = getTool(name);
  if (!tool || typeof tool.summarize !== 'function') return 'done';
  try {
    return tool.summarize(input, result);
  } catch (_) {
    return 'done';
  }
}

/**
 * Runs a tool and always resolves to something the API will accept.
 *
 * Returns `{ content, images?, meta, isError, summary }`. Errors come back as
 * `isError: true` with the message as content, which the model reads as feedback and
 * retries — the same way a failed shell command teaches a person what to type next.
 */
export async function dispatch(name, input, ctx) {
  const tool = getTool(name);

  if (!tool) {
    return {
      isError: true,
      content:
        `No tool named "${name}" exists. Available tools: ${toolNames().join(', ')}. ` +
        `Call one of those instead.`,
      meta: {},
      summary: 'unknown tool'
    };
  }

  try {
    const result = await tool.run(input || {}, ctx);
    const normalized = result && typeof result === 'object' ? result : { content: String(result ?? '') };
    return {
      isError: false,
      content: normalized.content ?? '',
      images: normalized.images || null,
      meta: normalized.meta || {},
      summary: summarizeTool(name, input, { ...normalized, meta: normalized.meta || {} })
    };
  } catch (err) {
    return {
      isError: true,
      content: `${name} failed: ${err.message}`,
      meta: {},
      summary: err.message.slice(0, 80)
    };
  }
}

/** Human-readable catalogue for the /tools slash command. */
export function describeTools() {
  const groups = [
    ['Planning', planTools],
    ['Files', fsTools],
    ['Motion', motionTools],
    ['Web', webTools],
    ['Shell', shellTools]
  ];
  return groups.map(([title, tools]) => ({
    title,
    tools: tools.map(t => ({
      name: t.name,
      mutates: t.mutates === true,
      // First sentence only — the full description is written for the model, not the user.
      summary: t.description.split(/\.\s/)[0] + '.'
    }))
  }));
}
