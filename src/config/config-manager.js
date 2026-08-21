/**
 * CONFIG MANAGER
 * Loads motion.config.json, layering environment variables underneath it so a key
 * never has to be written to disk to be used.
 *
 * Resolution order for the config file itself:
 *   1. ANYMOTION_CONFIG            explicit override, for CI and tests
 *   2. ./motion.config.json        a per-project config in the current folder
 *   3. ~/.anymotion/motion.config.json   the installed default
 *
 * The old build only ever looked at ./motion.config.json, so running `anymotion`
 * from anywhere other than the source checkout silently fell back to defaults with
 * no API key and no explanation.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

/** Where a global install keeps its config and skills. */
export const GLOBAL_DIR = path.resolve(
  process.env.ANYMOTION_HOME || path.join(os.homedir(), '.anymotion')
);

const CONFIG_FILENAME = 'motion.config.json';
const LOCAL_CONFIG = path.resolve(process.cwd(), CONFIG_FILENAME);
const GLOBAL_CONFIG = path.join(GLOBAL_DIR, CONFIG_FILENAME);

/** The config file this process will read and write. */
export function resolveConfigPath() {
  if (process.env.ANYMOTION_CONFIG) return path.resolve(process.env.ANYMOTION_CONFIG);
  if (fs.existsSync(LOCAL_CONFIG)) return LOCAL_CONFIG;
  if (fs.existsSync(GLOBAL_CONFIG)) return GLOBAL_CONFIG;
  // Nothing exists yet — writes should land next to the user, not inside the package.
  return GLOBAL_CONFIG;
}

/** Kept as a named export because the CLI prints it in `config` and `doctor`. */
export const CONFIG_PATH = resolveConfigPath();

export function detectProviderFromKey(key = '') {
  const k = String(key || '').trim();
  if (k.startsWith('sk-or-v1-')) return 'openrouter';
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('sk-proj-') || k.startsWith('sk-admin-')) return 'openai';
  if (k.startsWith('xai-')) return 'xai';
  if (k.startsWith('fw_')) return 'fireworks';
  if (k.startsWith('pplx-')) return 'perplexity';
  return null;
}

export function resolveProvider(config = {}) {
  const keyProvider = detectProviderFromKey(config.apiKey);
  if (keyProvider) return keyProvider;

  if (config.provider && String(config.provider).trim()) {
    return String(config.provider).trim().toLowerCase();
  }
  const endpoint = String(config.apiEndpoint || '').toLowerCase();
  if (endpoint.includes('openrouter')) return 'openrouter';
  if (endpoint.includes('opencode.ai/zen/go')) return 'opencode-go';
  if (endpoint.includes('opencode')) return 'opencode-zen';
  if (endpoint.includes('groq')) return 'groq';
  if (endpoint.includes('deepseek')) return 'deepseek';
  if (endpoint.includes('together')) return 'together';
  if (endpoint.includes('openai')) return 'openai';
  if (endpoint.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (endpoint.includes('x.ai')) return 'xai';
  if (endpoint.includes('mistral')) return 'mistral';
  if (endpoint.includes('fireworks')) return 'fireworks';
  if (endpoint.includes('perplexity')) return 'perplexity';
  if (endpoint.includes('cerebras')) return 'cerebras';
  if (endpoint.includes('sambanova')) return 'sambanova';
  if (endpoint.includes('siliconflow')) return 'siliconflow';
  if (endpoint.includes('11434')) return 'ollama';
  if (endpoint.includes('1234')) return 'lmstudio';
  if (endpoint.includes('tokenrouter')) return 'tokenrouter';
  if (endpoint.includes('kie.ai')) return 'kie';
  if (endpoint.includes('piapi.ai')) return 'piapi';
  if (endpoint.includes('anthropic')) return 'anthropic';
  if (endpoint.includes('agentrouter.org/v1')) return 'agentrouter-openai';
  if (endpoint.includes('agentrouter')) return 'agentrouter';
  return 'agentrouter';
}

/** Values used when no config file exists at all. */
export function defaultConfig() {
  return {
    apiKey: '',
    apiEndpoint: process.env.ANTHROPIC_BASE_URL || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
    effortLevel: 'high',
    thinking: 'high',
    defaultResolution: '1080p',
    fps: 60,
    port: 3000,
    outputDir: './exports',
    projectFile: './index.html',
    themePreset: 'dark-glass',
    fileApprovalMode: 'manual',
    provider: '', // Auto-detected from apiEndpoint if omitted
    editorEnabled: false,
    projectsDir: ''
  };
}

/** Reads the API key from the environment, whichever provider named it. */
function apiKeyFromEnv() {
  return (
    process.env.ANYMOTION_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.TOKENROUTER_API_KEY ||
    process.env.OPENCODE_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.XAI_API_KEY ||
    process.env.KIE_API_KEY ||
    process.env.PIAPI_API_KEY ||
    process.env.TOGETHER_API_KEY ||
    process.env.MISTRAL_API_KEY ||
    process.env.FIREWORKS_API_KEY ||
    process.env.PPLX_API_KEY ||
    process.env.CEREBRAS_API_KEY ||
    process.env.SAMBANOVA_API_KEY ||
    process.env.SILICONFLOW_API_KEY ||
    ''
  );
}

/** Placeholder values that mean "not configured" and must not be treated as a key. */
const PLACEHOLDER_KEYS = new Set([
  '',
  'gemini_api_key_here',
  'your_gemini_api_key',
  'your_api_key_here',
  'sk-your-key-here',
  'changeme'
]);

export function isPlaceholderKey(value) {
  return PLACEHOLDER_KEYS.has(String(value || '').trim().toLowerCase());
}

/** Reads a boolean the way a human writes one — "false", "0" and "off" all mean off. */
function isTruthy(value) {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return false;
  return !['false', '0', 'off', 'no'].includes(raw);
}

/**
 * Whether the web editor may run at all.
 *
 * One place answers this so the chat REPL, the CLI subcommands and anything added later
 * cannot drift apart — the editor being off must mean off everywhere, not off on the path
 * somebody remembered to gate.
 */
export function editorEnabled(config) {
  return isTruthy((config || loadConfig()).editorEnabled);
}

export function loadConfig() {
  const configPath = resolveConfigPath();
  const base = defaultConfig();
  let parsed = {};

  try {
    if (fs.existsSync(configPath)) {
      parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};
    }
  } catch (err) {
    // A malformed config used to be swallowed into silent defaults, which looked
    // exactly like a missing API key. Naming the file makes it fixable.
    console.error(`⚠️  Could not parse ${configPath}: ${err.message}`);
    console.error('   Falling back to defaults. Fix the JSON or delete the file to regenerate it.');
  }

  const merged = { ...base, ...parsed };
  merged.provider = resolveProvider(merged);

  // The environment wins over a placeholder but never over a real stored value, so
  // exporting a key in one shell does not permanently change the saved config.
  if (isPlaceholderKey(merged.apiKey)) {
    merged.apiKey = apiKeyFromEnv() || '';
  }

  if (process.env.ANTHROPIC_BASE_URL && !parsed.apiEndpoint) merged.apiEndpoint = process.env.ANTHROPIC_BASE_URL;
  if (process.env.ANTHROPIC_MODEL && !parsed.model) merged.model = process.env.ANTHROPIC_MODEL;
  if (process.env.ANYMOTION_PORT) {
    const p = parseInt(process.env.ANYMOTION_PORT, 10);
    if (Number.isFinite(p)) merged.port = p;
  }

  // argv and env deliver numbers as strings; downstream code does arithmetic on these.
  merged.port = Number(merged.port) || 3000;
  merged.fps = Number(merged.fps) || 60;

  // Same story for the editor flag: /config writes whatever the user typed, so "false"
  // and "0" arrive as truthy strings and would switch the editor back on by accident.
  merged.editorEnabled = isTruthy(merged.editorEnabled);
  if (process.env.ANYMOTION_EDITOR !== undefined) {
    merged.editorEnabled = isTruthy(process.env.ANYMOTION_EDITOR);
  }

  if (!['manual', 'auto', 'always'].includes(merged.fileApprovalMode)) {
    merged.fileApprovalMode = 'manual';
  }

  return merged;
}

export function saveConfig(updates) {
  const configPath = resolveConfigPath();
  try {
    const current = loadConfig();
    const merged = { ...current, ...updates };
    fs.mkdirSync(path.dirname(configPath), { recursive: true });

    // Write-then-rename: a crash mid-write used to leave a truncated config that
    // failed to parse on the next run.
    const tmp = `${configPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmp, configPath);
    return merged;
  } catch (err) {
    throw new Error(`Failed to save config to ${configPath}: ${err.message}`);
  }
}

export function setConfigValue(key, value) {
  return saveConfig({ [key]: value });
}
