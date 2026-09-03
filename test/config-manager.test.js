/**
 * Config manager tests.
 *
 * resolveConfigPath() reads process.env on every call, so pointing ANYMOTION_CONFIG at
 * a temp file is enough to exercise the real load/save paths without touching the
 * user's actual config.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  resolveConfigPath,
  defaultConfig,
  isPlaceholderKey,
  loadConfig,
  saveConfig,
  setConfigValue
} from '../src/config/config-manager.js';

/** Every env var loadConfig() consults, so a test starts from a known state. */
const ENV_KEYS = [
  'ANYMOTION_CONFIG', 'ANYMOTION_PORT',
  'ANYMOTION_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL'
];

let saved;
let tmpDir;
let tmpConfig;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anymotion-cfg-'));
  tmpConfig = path.join(tmpDir, 'motion.config.json');
  process.env.ANYMOTION_CONFIG = tmpConfig;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

const write = (obj) => fs.writeFileSync(tmpConfig, typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf-8');

describe('resolveConfigPath', () => {
  test('ANYMOTION_CONFIG wins over everything else', () => {
    assert.equal(resolveConfigPath(), path.resolve(tmpConfig));
  });
});

describe('isPlaceholderKey', () => {
  test('recognises empty and known placeholder strings', () => {
    for (const val of ['', '   ', 'your_api_key_here', 'sk-your-key-here', 'changeme', 'gemini_api_key_here']) {
      assert.equal(isPlaceholderKey(val), true, `"${val}" should count as unset`);
    }
  });

  test('is case-insensitive and trims', () => {
    assert.equal(isPlaceholderKey('  CHANGEME  '), true);
  });

  test('treats a real key as real', () => {
    assert.equal(isPlaceholderKey('sk-ant-api03-abcdef123456'), false);
  });

  test('handles null and undefined', () => {
    assert.equal(isPlaceholderKey(null), true);
    assert.equal(isPlaceholderKey(undefined), true);
  });
});

describe('defaultConfig', () => {
  test('ships no credential and sane defaults', () => {
    const cfg = defaultConfig();
    assert.equal(cfg.apiKey, '');
    assert.equal(cfg.provider, '');
    assert.equal(cfg.model, 'claude-opus-5');
    assert.equal(cfg.port, 3000);
    assert.equal(cfg.fps, 60);
    assert.equal(cfg.fileApprovalMode, 'manual');
    assert.equal(cfg.defaultResolution, '1080p');
  });
});

describe('loadConfig', () => {
  test('returns defaults when the file does not exist', () => {
    const cfg = loadConfig();
    assert.equal(cfg.model, 'claude-opus-5');
    assert.equal(cfg.port, 3000);
  });

  test('file values override defaults', () => {
    write({ model: 'claude-sonnet-5', port: 4100, themePreset: 'light' });
    const cfg = loadConfig();
    assert.equal(cfg.model, 'claude-sonnet-5');
    assert.equal(cfg.port, 4100);
    assert.equal(cfg.themePreset, 'light');
    // Untouched keys still come from the defaults.
    assert.equal(cfg.fps, 60);
  });

  test('a malformed config falls back to defaults instead of throwing', () => {
    write('{ this is not json');
    const cfg = loadConfig();
    assert.equal(cfg.model, 'claude-opus-5');
  });

  test('a JSON array is ignored rather than spread over the defaults', () => {
    write([1, 2, 3]);
    const cfg = loadConfig();
    assert.equal(cfg.model, 'claude-opus-5');
    assert.equal(cfg.port, 3000);
  });

  test('an env key fills in for a placeholder', () => {
    write({ apiKey: 'changeme' });
    process.env.ANTHROPIC_API_KEY = 'sk-ant-from-env';
    assert.equal(loadConfig().apiKey, 'sk-ant-from-env');
  });

  test('an env key never overwrites a real stored key', () => {
    write({ apiKey: 'sk-ant-stored-value' });
    process.env.ANTHROPIC_API_KEY = 'sk-ant-from-env';
    assert.equal(loadConfig().apiKey, 'sk-ant-stored-value');
  });

  test('ANYMOTION_API_KEY takes precedence over the other env names', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-second';
    process.env.ANYMOTION_API_KEY = 'sk-first';
    assert.equal(loadConfig().apiKey, 'sk-first');
  });

  test('ANTHROPIC_BASE_URL and ANTHROPIC_MODEL fill in when omitted in file', () => {
    write({ port: 4200 });
    process.env.ANTHROPIC_BASE_URL = 'https://env.example.com';
    process.env.ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
    const cfg = loadConfig();
    assert.equal(cfg.apiEndpoint, 'https://env.example.com');
    assert.equal(cfg.model, 'claude-haiku-4-5-20251001');
  });

  test('numeric settings arriving as strings are coerced', () => {
    write({ port: '4200', fps: '30' });
    const cfg = loadConfig();
    assert.equal(cfg.port, 4200);
    assert.equal(cfg.fps, 30);
    assert.equal(typeof cfg.port, 'number');
    assert.equal(typeof cfg.fps, 'number');
  });

  test('ANYMOTION_PORT overrides the file port', () => {
    write({ port: 4200 });
    process.env.ANYMOTION_PORT = '5300';
    assert.equal(loadConfig().port, 5300);
  });

  test('an invalid fileApprovalMode is reset to manual', () => {
    write({ fileApprovalMode: 'yolo' });
    assert.equal(loadConfig().fileApprovalMode, 'manual');
  });

  test('a valid fileApprovalMode survives', () => {
    write({ fileApprovalMode: 'always' });
    assert.equal(loadConfig().fileApprovalMode, 'always');
  });
});

describe('saveConfig', () => {
  test('creates the file and its parent directory', () => {
    const nested = path.join(tmpDir, 'deep', 'nested', 'motion.config.json');
    process.env.ANYMOTION_CONFIG = nested;
    saveConfig({ model: 'claude-fable-5' });
    assert.ok(fs.existsSync(nested));
    assert.equal(JSON.parse(fs.readFileSync(nested, 'utf-8')).model, 'claude-fable-5');
  });

  test('merges rather than replacing', () => {
    write({ model: 'claude-sonnet-5', themePreset: 'light' });
    saveConfig({ port: 4400 });
    const onDisk = JSON.parse(fs.readFileSync(tmpConfig, 'utf-8'));
    assert.equal(onDisk.port, 4400);
    assert.equal(onDisk.model, 'claude-sonnet-5');
    assert.equal(onDisk.themePreset, 'light');
  });

  test('writes valid JSON that loadConfig can read back', () => {
    saveConfig({ model: 'claude-opus-5', port: 3100 });
    const cfg = loadConfig();
    assert.equal(cfg.model, 'claude-opus-5');
    assert.equal(cfg.port, 3100);
  });

  test('leaves no .tmp file behind — the write is renamed into place', () => {
    saveConfig({ port: 3200 });
    assert.equal(fs.existsSync(`${tmpConfig}.tmp`), false);
  });

  test('returns the merged result', () => {
    const merged = saveConfig({ port: 3300 });
    assert.equal(merged.port, 3300);
    assert.equal(merged.model, 'claude-opus-5');
  });
});

describe('setConfigValue', () => {
  test('sets a single key without disturbing the others', () => {
    write({ model: 'claude-sonnet-5' });
    setConfigValue('port', 3900);
    const cfg = loadConfig();
    assert.equal(cfg.port, 3900);
    assert.equal(cfg.model, 'claude-sonnet-5');
  });
});
