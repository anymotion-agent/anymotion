/**
 * ANYMOTION INSTALLER
 *
 * Three entry points, all reachable from the CLI:
 *   runInstall()  — one-time setup: create ~/.anymotion, publish skills, write a config
 *   runSetup()    — interactive wizard for provider / key / model
 *   runDoctor()   — read-only health check, safe to run any time
 *
 * Nothing here talks to the network and nothing prints an API key.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  GLOBAL_DIR,
  resolveConfigPath,
  loadConfig,
  saveConfig,
  defaultConfig,
  isPlaceholderKey
} from '../src/config/config-manager.js';
import { PROJECTS_DIR } from '../src/project/workspace.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The checked-out or installed package root (one level above scripts/). */
export const PACKAGE_ROOT = path.resolve(__dirname, '..');

export const MIN_NODE_MAJOR = 18;

/** Providers the agent loop knows how to talk to. */
export const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (official API)', env: 'ANTHROPIC_API_KEY', endpoint: 'https://api.anthropic.com' },
  { id: 'openrouter', label: 'OpenRouter', env: 'OPENROUTER_API_KEY', endpoint: 'https://openrouter.ai/api/v1' },
  { id: 'agentrouter', label: 'AgentRouter proxy', env: 'ANTHROPIC_AUTH_TOKEN', endpoint: 'https://agentrouter.org' },
  { id: 'opencode-zen', label: 'OpenCode Zen', env: 'ANYMOTION_API_KEY', endpoint: 'https://opencode.ai/zen/v1' },
  { id: 'groq', label: 'Groq', env: 'ANYMOTION_API_KEY', endpoint: 'https://api.groq.com/openai/v1' },
  { id: 'openai', label: 'OpenAI', env: 'OPENAI_API_KEY', endpoint: 'https://api.openai.com/v1' }
];

const ok = (m) => console.log(`  ${chalk.green('✔')} ${m}`);
const warn = (m) => console.log(`  ${chalk.yellow('!')} ${m}`);
const bad = (m) => console.log(`  ${chalk.red('✘')} ${m}`);
const info = (m) => console.log(`  ${chalk.dim('·')} ${chalk.dim(m)}`);

function heading(text) {
  console.log('');
  console.log(chalk.bold.hex('#00cbd6')(`  ${text}`));
  console.log(chalk.dim('  ' + '─'.repeat(Math.max(10, text.length))));
}

/** True when `bin --version` (or the given probe args) runs. */
export function commandExists(bin, args = ['-version']) {
  try {
    execFileSync(bin, args, { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function ask(rl, question, fallback = '') {
  return new Promise(resolve => {
    const suffix = fallback ? chalk.dim(` [${fallback}]`) : '';
    rl.question(`  ${question}${suffix}: `, answer => {
      resolve(String(answer || '').trim() || fallback);
    });
  });
}

/** Reads a secret without echoing it back to the terminal. */
function askSecret(rl, question) {
  return new Promise(resolve => {
    const input = rl.input;
    const wasRaw = input.isRaw;
    let value = '';

    process.stdout.write(`  ${question}: `);

    const onData = (chunk) => {
      const s = chunk.toString('utf8');
      for (const ch of s) {
        if (ch === '\r' || ch === '\n') {
          input.removeListener('data', onData);
          if (input.setRawMode) input.setRawMode(!!wasRaw);
          process.stdout.write('\n');
          return resolve(value.trim());
        }
        if (ch === '') { // Ctrl+C
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '' || ch === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        value += ch;
        process.stdout.write('*');
      }
    };

    if (input.setRawMode) input.setRawMode(true);
    input.on('data', onData);
  });
}

// ============================================================
// DOCTOR
// ============================================================

/**
 * Inspects the environment and reports what is missing.
 * Returns { problems, warnings } so callers can set an exit code.
 */
export async function runDoctor() {
  let problems = 0;
  let warnings = 0;

  heading('Anymotion Doctor');

  // --- Node ------------------------------------------------------------------
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= MIN_NODE_MAJOR) {
    ok(`Node.js ${process.versions.node}`);
  } else {
    bad(`Node.js ${process.versions.node} — Anymotion needs ${MIN_NODE_MAJOR} or newer`);
    problems++;
  }

  // --- Config ----------------------------------------------------------------
  const configPath = resolveConfigPath();
  if (fs.existsSync(configPath)) {
    ok(`Config found at ${configPath}`);
  } else {
    warn(`No config yet — run ${chalk.bold('anymotion install')}`);
    warnings++;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    bad(`Config unreadable: ${err.message}`);
    return { problems: problems + 1, warnings };
  }

  // --- Credentials -----------------------------------------------------------
  if (isPlaceholderKey(config.apiKey)) {
    bad(`No API key. Run ${chalk.bold('anymotion setup')} or export ANTHROPIC_API_KEY.`);
    problems++;
  } else {
    ok(`API key present (${String(config.apiKey).length} chars, not shown)`);
  }
  info(`provider: ${config.provider}   model: ${config.model}`);

  // --- Skills ----------------------------------------------------------------
  const skillDirs = [
    path.join(GLOBAL_DIR, 'skills'),
    path.join(PACKAGE_ROOT, 'skills')
  ].filter(d => fs.existsSync(d));

  if (skillDirs.length) {
    const found = skillDirs.flatMap(d =>
      fs.readdirSync(d).filter(f => f === 'SKILL.md' || f.endsWith('.skill'))
    );
    ok(`Skills available (${found.length} file${found.length === 1 ? '' : 's'}) in ${skillDirs[0]}`);
  } else {
    warn('No skills directory found — the agent will run without motion-graphics guidance');
    warnings++;
  }

  // --- Workspace -------------------------------------------------------------
  try {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    fs.accessSync(PROJECTS_DIR, fs.constants.W_OK);
    ok(`Workspace writable at ${PROJECTS_DIR}`);
  } catch (err) {
    bad(`Workspace not writable: ${err.message}`);
    problems++;
  }

  // --- FFmpeg ----------------------------------------------------------------
  // Only `render` needs it, so a miss is a warning rather than a failure.
  if (commandExists('ffmpeg', ['-version'])) {
    ok('FFmpeg found — video export available');
  } else {
    warn('FFmpeg not on PATH — `anymotion render` will fail until it is installed');
    info('macOS: brew install ffmpeg   ·   Windows: winget install Gyan.FFmpeg   ·   Linux: apt install ffmpeg');
    warnings++;
  }

  // --- Puppeteer browser -----------------------------------------------------
  try {
    const { default: puppeteer } = await import('puppeteer');
    const exe = puppeteer.executablePath();
    if (exe && fs.existsSync(exe)) {
      ok('Puppeteer browser installed');
    } else {
      warn('Puppeteer browser missing — run `npx puppeteer browsers install chrome`');
      warnings++;
    }
  } catch (_) {
    warn('Puppeteer not resolvable — run `npm install` in the Anymotion folder');
    warnings++;
  }

  console.log('');
  if (!problems && !warnings) console.log(chalk.bold.green('  Everything looks good.\n'));
  else if (!problems) console.log(chalk.bold.yellow(`  Usable, with ${warnings} warning(s).\n`));
  else console.log(chalk.bold.red(`  ${problems} problem(s) to fix before Anymotion will run.\n`));

  return { problems, warnings };
}

// ============================================================
// SETUP WIZARD
// ============================================================

/**
 * Asks for the few settings that cannot be guessed and saves them.
 * The key is read without echo and never printed back.
 */
export async function runSetup(options = {}) {
  // Ensure base installation (skills, config directory) is done before setup wizard
  console.log(chalk.dim('  Checking installation...'));
  await runInstall();
  console.log('');

  const current = loadConfig();
  const configPath = resolveConfigPath();

  heading('Anymotion Setup');
  info(`Config file: ${configPath}`);
  console.log('');

  if (!process.stdin.isTTY) {
    bad('Setup needs an interactive terminal.');
    info('Non-interactive alternative: anymotion config apiKey <key>');
    return { cancelled: true };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    // --- Provider ------------------------------------------------------------
    console.log(chalk.bold('  Which API provider?'));
    PROVIDERS.forEach((p, i) => {
      const mark = p.id === current.provider ? chalk.green(' (current)') : '';
      console.log(`    ${chalk.cyan(String(i + 1))}. ${p.label}${mark}`);
    });
    console.log('');

    const currentIndex = Math.max(0, PROVIDERS.findIndex(p => p.id === current.provider));
    const pick = await ask(rl, 'Choose 1-' + PROVIDERS.length, String(currentIndex + 1));
    const provider = PROVIDERS[Number(pick) - 1] || PROVIDERS[currentIndex];
    console.log('');

    // --- Key -----------------------------------------------------------------
    const envKey = process.env[provider.env];
    if (envKey) {
      ok(`${provider.env} is already set in your environment — Anymotion will use it.`);
      info('Leave the next prompt empty to keep using the environment variable.');
    } else if (!isPlaceholderKey(current.apiKey)) {
      info('A key is already saved. Leave empty to keep it.');
    }

    const entered = await askSecret(rl, `${provider.label} API key`);
    console.log('');

    // --- Model ---------------------------------------------------------------
    const model = await ask(rl, 'Model', current.model || defaultConfig().model);
    const resolution = await ask(rl, 'Default resolution (720p/1080p/1440p/4k)', current.defaultResolution || '1080p');
    const fpsAnswer = await ask(rl, 'Frames per second', String(current.fps || 60));
    const portAnswer = await ask(rl, 'Editor port', String(current.port || 3000));
    const approval = await ask(rl, 'File approval mode (manual/auto/always)', current.fileApprovalMode || 'manual');

    const updates = {
      provider: provider.id,
      // Set apiEndpoint to the provider's default endpoint.
      apiEndpoint: provider.endpoint || '',
      model: model || defaultConfig().model,
      defaultResolution: ['720p', '1080p', '1440p', '2k', '4k'].includes(resolution) ? resolution : '1080p',
      fps: Number.isFinite(parseInt(fpsAnswer, 10)) ? parseInt(fpsAnswer, 10) : 60,
      port: Number.isFinite(parseInt(portAnswer, 10)) ? parseInt(portAnswer, 10) : 3000,
      fileApprovalMode: ['manual', 'auto', 'always'].includes(approval) ? approval : 'manual'
    };

    if (entered) updates.apiKey = entered;

    saveConfig(updates);

    console.log('');
    ok(`Saved to ${configPath}`);
    if (!entered && !envKey && isPlaceholderKey(current.apiKey)) {
      warn('No API key stored yet. Set one with: anymotion config apiKey <key>');
    }
    return { cancelled: false, provider: provider.id };
  } finally {
    rl.close();
  }
}

// ============================================================
// INSTALL
// ============================================================

/** Copies a directory tree, skipping build clutter. */
function copyTree(from, to, skip = new Set()) {
  let copied = 0;
  if (!fs.existsSync(from)) return copied;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copied += copyTree(src, dest, skip);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dest);
      copied++;
    }
  }
  return copied;
}

/**
 * First-run install. Idempotent: safe to run repeatedly, and it never overwrites a
 * config that already has a key in it.
 *
 * Creates ~/.anymotion/ with:
 *   motion.config.json   defaults, or the existing file left untouched
 *   skills/              motion-graphics guidance the agent reads at build time
 *   EXPLAINER_..._SFX/   the sound library, if the package shipped with one
 */
export async function runInstall(options = {}) {
  heading('Installing Anymotion');

  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE_MAJOR) {
    bad(`Node.js ${MIN_NODE_MAJOR}+ is required (found ${process.versions.node}).`);
    return { installed: false };
  }

  // --- Home ------------------------------------------------------------------
  fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  ok(`Home directory ready at ${GLOBAL_DIR}`);

  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  ok(`Workspace ready at ${PROJECTS_DIR}`);

  // --- Config ----------------------------------------------------------------
  const configPath = resolveConfigPath();
  if (fs.existsSync(configPath)) {
    const existing = loadConfig();
    ok(`Existing config kept at ${configPath}`);
    if (isPlaceholderKey(existing.apiKey)) {
      warn('No API key set yet — run `anymotion setup`.');
    }
  } else {
    // Written through saveConfig so the same defaults and atomic write apply.
    saveConfig(defaultConfig());
    ok(`Config created at ${configPath}`);
    info('Add your key with `anymotion setup` — it is never committed.');
  }

  // --- Skills ----------------------------------------------------------------
  const skillsFrom = path.join(PACKAGE_ROOT, 'skills');
  const skillsTo = path.join(GLOBAL_DIR, 'skills');
  if (fs.existsSync(skillsFrom) && path.resolve(skillsFrom) !== path.resolve(skillsTo)) {
    // `.skill` files are zip bundles used for distribution; the agent reads the
    // extracted SKILL.md, so only real directories and markdown are published.
    const n = copyTree(skillsFrom, skillsTo, new Set(['node_modules']));
    ok(`Published ${n} skill file(s) to ${skillsTo}`);
  } else if (fs.existsSync(skillsTo)) {
    ok('Skills already installed');
  } else {
    warn('No skills folder found in the package');
  }

  // --- SFX library (large, optional) -----------------------------------------
  const sfxName = 'EXPLAINER_MOTION_GRAPHICS_SFX';
  const sfxFrom = path.join(PACKAGE_ROOT, sfxName);
  const sfxTo = path.join(GLOBAL_DIR, sfxName);
  if (fs.existsSync(sfxTo)) {
    ok('Sound library already installed');
  } else if (fs.existsSync(sfxFrom)) {
    const n = copyTree(sfxFrom, sfxTo);
    ok(`Copied ${n} sound file(s) to ${sfxTo}`);
  } else {
    info('No bundled sound library — add_background_music will fall back to remote assets');
  }

  // --- Optional tooling ------------------------------------------------------
  if (!commandExists('ffmpeg', ['-version'])) {
    warn('FFmpeg is not installed. Video export needs it:');
    info('macOS: brew install ffmpeg   ·   Windows: winget install Gyan.FFmpeg   ·   Linux: apt install ffmpeg');
  } else {
    ok('FFmpeg found');
  }

  console.log('');
  console.log(chalk.bold.green('  Install complete.'));
  console.log('');
  console.log(chalk.bold.white('  Next:'));
  console.log(`    ${chalk.bold('anymotion setup')}   ${chalk.dim('add your API key')}`);
  console.log(`    ${chalk.bold('anymotion doctor')}  ${chalk.dim('verify everything')}`);
  console.log(`    ${chalk.bold('anymotion')}         ${chalk.dim('start the agent')}`);
  console.log('');

  return { installed: true, home: GLOBAL_DIR };
}

// Allow `node scripts/install.js [--doctor|--setup]` directly, which is what the npm
// scripts and the README one-liner use. pathToFileURL is required for this comparison
// to hold on Windows, where argv[1] is a drive-letter path and import.meta.url is not.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const arg = (process.argv[2] || '').replace(/^--/, '');
  const run =
    arg === 'doctor' ? runDoctor :
    arg === 'setup' ? runSetup :
    runInstall;

  run()
    .then(result => {
      if (result && result.problems) process.exitCode = 1;
    })
    .catch(err => {
      console.error(chalk.red(`\n  ✘ ${err.message}\n`));
      process.exitCode = 1;
    });
}
