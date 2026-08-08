#!/usr/bin/env node

/**
 * ANYMOTION CLI — AI Motion Graphics Agent & Studio
 * Like Claude Code but for motion graphics:
 *   - Streams real-time thinking: what file is being written, what sections
 *   - Writes a self-contained composition and exports it to MP4
 *
 * The Web Editor is in the tree but off by default (config.editorEnabled) while it is
 * reworked for release. A run never starts it: the deliverables are the project folder
 * and the rendered video, both of which work without a server.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import { loadConfig, setConfigValue, CONFIG_PATH, editorEnabled } from '../src/config/config-manager.js';
import { generateMotionGraphics, createTemplateMotionGraphics } from '../src/agent/ai-engine.js';
import { researchBrief, hasUrl } from '../src/agent/research.js';
import { createProject, displayPath, listProjects, PROJECTS_DIR } from '../src/project/workspace.js';
import { renderVideo } from '../src/render/video-renderer.js';
import { startWebServer } from '../src/server/web-server.js';
import { runDoctor, runSetup, PACKAGE_ROOT } from '../scripts/install.js';
import { resolveBaseUrl } from '../src/agent/agent-loop.js';

const program = new Command();

// `anymotion --version` is the first thing anyone runs when filing a bug, so read the real
// number off the installed package rather than hard-coding one that drifts on release day.
let pkgVersion = '1.0.0';
try {
  pkgVersion = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version || pkgVersion;
} catch {
  // A missing or unreadable package.json is not worth failing a CLI over.
}

program
  .name('anymotion')
  .description('Anymotion — AI motion graphics agent and studio. Describe an animation, get a rendered MP4.')
  .version(pkgVersion, '-v, --version', 'Print the Anymotion version')
  .addHelpText('after', [
    '',
    `  Run ${chalk.bold('anymotion')} with no command to start the conversational agent.`,
    `  ${chalk.dim('Anymotion by Ali Usman • https://aliusman.site • MIT licensed')}`,
    ''
  ].join('\n'));

// ============================================================
// ░█▀█░█▀█░█░█░█▄▀░█░█░█▀█░▀█▀░▀█▀░█▀█░█▄░█
// ░█▀█░█░█░░█░░█░░░█▀▄░█▄█░░█░░░█░░█▄█░█░▀█
// ASCII Banner
// ============================================================
function showBanner() {
  console.log('');
  console.log(chalk.bold.hex('#00cbd6')('  █████╗ ███╗   ██╗██╗   ██╗███╗   ███╗ ██████╗ ████████╗██╗ ██████╗ ███╗   ██╗'));
  console.log(chalk.bold.hex('#00cbd6')(' ██╔══██╗████╗  ██║╚██╗ ██╔╝████╗ ████║██╔═══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║'));
  console.log(chalk.bold.hex('#00cbd6')(' ███████║██╔██╗ ██║ ╚████╔╝ ██╔████╔██║██║   ██║   ██║   ██║██║   ██║██╔██╗ ██║'));
  console.log(chalk.bold.hex('#6366f1')(' ██╔══██║██║╚██╗██║  ╚██╔╝  ██║╚██╔╝██║██║   ██║   ██║   ██║██║   ██║██║╚██╗██║'));
  console.log(chalk.bold.hex('#6366f1')(' ██║  ██║██║ ╚████║   ██║   ██║ ╚═╝ ██║╚██████╔╝   ██║   ██║╚██████╔╝██║ ╚████║'));
  console.log(chalk.bold.hex('#6366f1')(' ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝     ╚═╝ ╚═════╝    ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝'));
  console.log('');
  console.log(chalk.bold.hex('#00cbd6')('  ◆ ') + chalk.bold.white('Anymotion AI Studio') + chalk.dim(' • Claude Opus 5 • 1080p Motion Graphics Agent'));
  console.log('');
}

// ============================================================
// AGENT REAL-TIME OUTPUT RENDERER (like Claude Code)
// ============================================================
class AgentDisplay {
  constructor() {
    this.spinner = null;
    this.fileLog = [];
    this.charCount = 0;
    this.lastActivity = '';
    this.totalTokens = 0;
  }

  start(title) {
    process.stdout.write(chalk.bold.cyan(`\n  ● ${title}\n`));
  }

  writingFile(filePath, note = '') {
    const rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    this.fileLog.push(rel);
    process.stdout.write(
      chalk.dim('  │ ') +
      chalk.bold.yellow('create  ') +
      chalk.white(rel) +
      (note ? chalk.dim(` — ${note}`) : '') +
      '\n'
    );
  }

  thinking(msg) {
    process.stdout.write(chalk.dim(`  │ ${msg}\n`));
  }

  section(heading) {
    process.stdout.write(chalk.bold.hex('#6366f1')(`\n  ├─ ${heading}\n`));
  }

  onToken(token) {
    this.totalTokens++;
    this.charCount += token.length;
    if (this.charCount % 200 < 5 && process.stdout.isTTY) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(
        chalk.dim(`  │ Streaming... ${this.charCount} chars received [Claude Opus 5]`)
      );
    }
  }

  done(msg) {
    if (process.stdout.isTTY) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }
    process.stdout.write(chalk.bold.green(`  ✔ ${msg}\n`));
  }

  error(msg) {
    process.stdout.write(chalk.bold.red(`  ✘ ${msg}\n`));
  }

  link(label, url) {
    process.stdout.write(
      chalk.dim('  │ ') +
      chalk.bold.white(label + ': ') +
      chalk.underline.cyan(url) + '\n'
    );
  }

  divider() {
    process.stdout.write(chalk.dim('  └' + '─'.repeat(50) + '\n'));
  }
}

// ============================================================
// COMMAND: CONFIG
// ============================================================

/** Keys whose value should never be printed in full. */
const SECRET_KEYS = new Set(['apikey', 'apitoken', 'authtoken']);

/** sk-abc…xyz — enough to tell two keys apart without exposing either. */
function maskSecret(value) {
  const s = String(value || '');
  if (!s) return '(not set)';
  if (s.length <= 12) return '*'.repeat(s.length);
  return `${s.slice(0, 6)}…${s.slice(-4)} (${s.length} chars)`;
}

program
  .command('config [key] [value]')
  .description('View or set config values (API key, model, port, resolution...)')
  .action((key, value) => {
    showBanner();
    const config = loadConfig();
    if (!key) {
      console.log(chalk.bold.yellow('  📋 Current Configuration (motion.config.json):\n'));
      // The key is masked here because this output is what people paste into bug
      // reports and screen recordings.
      const shown = Object.fromEntries(
        Object.entries(config).map(([k, v]) =>
          SECRET_KEYS.has(k.toLowerCase()) ? [k, maskSecret(v)] : [k, v]
        )
      );
      const lines = JSON.stringify(shown, null, 2).split('\n');
      lines.forEach(line => console.log(chalk.dim('  ') + line));
      console.log('');
      console.log(chalk.dim('  Set a value: ') + chalk.bold('anymotion config <key> <value>'));
      console.log(chalk.dim('  Example:     ') + chalk.bold('anymotion config model claude-opus-5'));
      return;
    }
    if (!value) {
      const raw = config[key];
      const display = SECRET_KEYS.has(key.toLowerCase())
        ? maskSecret(raw)
        : (raw === undefined || raw === '' ? '(not set)' : raw);
      console.log(chalk.cyan(`  [${key}]: `) + chalk.green(display));
      return;
    }

    // Numeric settings arrive from argv as strings, and `port: "3000"` silently broke
    // comparisons downstream.
    let parsed = value;
    if (['port', 'fps'].includes(key)) {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n)) {
        console.log(chalk.red(`  ✘ ${key} must be a number.`));
        process.exitCode = 1;
        return;
      }
      parsed = n;
    }

    setConfigValue(key, parsed);
    const shownValue = SECRET_KEYS.has(key.toLowerCase()) ? maskSecret(parsed) : parsed;
    console.log(chalk.green(`  ✔ Updated: ${key} = ${shownValue}`));
  });

// ============================================================
// COMMAND: GENERATE — AI Agent with real-time streaming
// ============================================================
program
  .command('generate [prompt...]')
  .description('Generate a motion graphics animation with Claude Opus 5 AI Agent')
  .option('--serve', 'Auto-launch Web Editor after generation', false)
  .option('-a, --approve <mode>', 'File edit approval mode (manual, auto, always)')
  .action(async (promptArr, opts) => {
    showBanner();
    const display = new AgentDisplay();
    let prompt = promptArr ? promptArr.join(' ') : '';

    if (!prompt) {
      const ans = await inquirer.prompt([{
        type: 'input',
        name: 'userPrompt',
        message: chalk.cyan('  What motion graphics should I create?'),
        default: 'SaaS Analytics Dashboard Explainer Film — Apple Liquid Glass UI'
      }]);
      prompt = ans.userPrompt;
    }

    const config = loadConfig();
    const approvalMode = (opts.approve || config.fileApprovalMode || 'manual').toLowerCase();

    if (!['manual', 'auto', 'always'].includes(approvalMode)) {
      console.log(chalk.red(`\n  ✘ Unknown approval mode "${approvalMode}". Use manual, auto or always.\n`));
      process.exitCode = 1;
      return;
    }

    // Every run gets its own project folder, so nothing existing is ever overwritten.
    // The confirm below is about spending time and API credit, not about losing work.
    if (approvalMode === 'manual') {
      const confirm = await inquirer.prompt([{
        type: 'confirm',
        name: 'approve',
        message: chalk.yellow('  Start the agent? It will write files and use API credit.'),
        default: true
      }]);
      if (!confirm.approve) {
        console.log(chalk.yellow('\n  ⚠ Cancelled.'));
        return;
      }
    }

    display.start(`Anymotion Agent — "${prompt}"`);
    display.section('Planning Motion Graphics Composition');

    let research = null;
    if (hasUrl(prompt)) {
      display.thinking('There is a link in that — let me read it before I plan anything.');
      try {
        research = await researchBrief(prompt, {
          emit: (ev) => {
            if (ev.type === 'fetch') display.thinking(`Fetching ${ev.url.replace(/^https?:\/\//, '')}`);
            else if (ev.type === 'page') display.thinking(`✓ Read page — ${ev.detail}`);
            else if (ev.type === 'asset') {
              const icon = ev.ok ? '✓' : '✗';
              display.thinking(`${icon} Asset ${ev.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 40)}`);
            }
          }
        });
        if (research) {
          display.thinking(`Read ${research.urls.length} page(s), ${research.liveAssets.length} live assets`);
        }
      } catch (err) {
        display.thinking(`Could not read the site — ${err.message}`);
        research = null;
      }
    }

    display.thinking('Reading SKILL.md for motion graphics best practices...');
    display.thinking(`Selecting AI model: ${chalk.bold.cyan(config.model || 'claude-opus-5')}`);
    display.thinking(`Endpoint: ${chalk.dim(resolveBaseUrl(config))}`);
    display.thinking(`File Edit Approval Mode: ${chalk.bold.yellow(approvalMode)}`);
    display.section('Streaming Motion Graphics Code');

    let project = null;
    let generated = false;

    try {
      // The agent works inside a project folder — it reads, edits and screenshots real
      // files rather than streaming one string back.
      project = createProject(prompt, { prompt, model: config.model, source: 'cli' });
      display.thinking(`Working in ${displayPath(project.dir)}`);

      const result = await generateMotionGraphics(
        [{ role: 'user', content: research && research.block ? `${prompt}\n\n${research.block}` : prompt }],
        {
          project,
          research,
          // This command has no approval UI to draw a y/n box in, so the mode chosen
          // above is applied once, up front, rather than per file.
          configOverrides: { fileApprovalMode: approvalMode === 'manual' ? 'auto' : approvalMode },
          emit: (ev) => {
            if (ev.type === 'skill') display.thinking(`◆ Analyzing skill: ${ev.name} (${ev.size}KB)`);
            else if (ev.type === 'tool_start') display.thinking(ev.label);
            else if (ev.type === 'text') display.onToken(ev.text);
          }
        }
      );
      generated = !!(result.files && result.files['index.html']);
    } catch (err) {
      display.error(`AI generation failed: ${err.message}`);
    }

    if (process.stdout.isTTY) { process.stdout.clearLine(0); process.stdout.cursorTo(0); }

    // Fall back to the offline template only when the agent produced nothing at all.
    if (!generated) {
      if (!project) project = createProject(prompt, { prompt, source: 'cli-template' });
      display.thinking('Falling back to the built-in template composition.');
      fs.writeFileSync(project.htmlFile, createTemplateMotionGraphics(prompt), 'utf-8');
    } else {
      display.done(`Generation complete — ${display.charCount.toLocaleString()} characters streamed`);
    }

    // Point the editor and renderer at what was just built. Copying index.html out to a
    // single configured path used to strand style.css, script.js and assets/ in the
    // project folder, so the served page lost its styling and animation.
    display.section('Activating Project');
    setConfigValue('projectFile', project.htmlFile);
    setConfigValue('outputDir', project.exportsDir);

    const written = fs.readdirSync(project.dir, { withFileTypes: true })
      .filter(e => e.isFile())
      .map(e => e.name);
    for (const name of written) {
      const abs = path.join(project.dir, name);
      display.writingFile(abs, `${Math.max(1, Math.round(fs.statSync(abs).size / 1024))} KB`);
    }

    display.divider();
    console.log('');
    console.log(chalk.bold.green('  ✔ Motion Graphics Generation Complete!\n'));

    if (opts.serve) {
      // Auto-launch editor. When the editor is held back this prints why and lists what to
      // do instead, which is a better answer to an explicit --serve than silent next-steps.
      await launchEditorAndOpen(config.port || 3000, display);
    } else {
      console.log(chalk.bold.white('  Next steps:'));
      if (editorEnabled()) {
        console.log(chalk.dim('  ›') + chalk.bold(' anymotion serve') + chalk.dim(' — open Web Editor at http://localhost:3000'));
      }
      console.log(chalk.dim('  ›') + chalk.bold(' anymotion render') + chalk.dim(' — export to 1080p MP4 video'));
      console.log(chalk.dim('  ›') + chalk.dim(' open the project index.html in a browser to preview it\n'));
    }
  });

// ============================================================
// COMMAND: SERVE — Launch Editor
// ============================================================
program
  .command('serve')
  .description('Launch the Anymotion Web Editor live server at http://localhost:3000')
  .option('-p, --port <number>', 'Custom port', '3000')
  .action(async (opts) => {
    showBanner();
    const port = parseInt(opts.port, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      console.log(chalk.red(`\n  ✘ Invalid port "${opts.port}".\n`));
      process.exitCode = 1;
      return;
    }
    const display = new AgentDisplay();
    await launchEditorAndOpen(port, display);
  });

// ============================================================
// COMMAND: RENDER — Export Video
// ============================================================
program
  .command('render')
  .description('Render motion graphics to 1080p/4K MP4 using Puppeteer + FFmpeg')
  .option('-r, --res <resolution>', 'Resolution (720p, 1080p, 4k)', '1080p')
  .option('-f, --fps <fps>', 'Frames per second', '60')
  .action(async (opts) => {
    showBanner();
    const display = new AgentDisplay();
    const config = loadConfig();
    const port = config.port || 3000;
    const fps = parseInt(opts.fps, 10);

    if (!Number.isFinite(fps) || fps < 1 || fps > 240) {
      console.log(chalk.red(`\n  ✘ Invalid fps "${opts.fps}". Use a number between 1 and 240.\n`));
      process.exitCode = 1;
      return;
    }

    display.start(`Rendering ${opts.res.toUpperCase()} @ ${fps} FPS`);
    display.thinking('Launching Puppeteer headless browser...');
    display.section('Frame Capture in Progress');

    try {
      const outputPath = await renderVideo({ resolution: opts.res, fps });
      const filename = path.basename(outputPath);
      display.writingFile(outputPath, `${opts.res.toUpperCase()} MP4 Video`);
      display.done(`Render Complete — ${filename}`);
      display.divider();
      console.log('');
      display.link('Local File', outputPath);
      display.link('Video Download', `http://localhost:${port}/exports/${filename}`);
      // OpenCut is an optional companion app, so its link is only offered when the user
      // has actually configured one. Printing a fixed localhost:3001 URL advertised a
      // service that is not running for most people.
      if (config.opencutUrl) {
        const base = String(config.opencutUrl).replace(/\/+$/, '');
        const videoUrl = encodeURIComponent(`http://localhost:${port}/exports/${filename}`);
        display.link('Import to OpenCut', `${base}/import?videoUrl=${videoUrl}&name=Anymotion_Motion`);
      }
      console.log('');
    } catch (err) {
      display.error(`Render failed: ${err.message}`);
      process.exitCode = 1;
    }
  });

// ============================================================
// COMMAND: INSTALL / SETUP / DOCTOR
// ============================================================
program
  .command('install')
  .description('One-time setup: create the Anymotion home folder, publish skills, write a config')
  .action(async () => {
    showBanner();
    const { runInstall } = await import('../scripts/install.js');
    await runInstall();
  });

program
  .command('setup')
  .description('Interactive wizard for provider, API key and model')
  .action(async () => {
    showBanner();
    await runSetup();
  });

program
  .command('doctor')
  .description('Check Node version, API key, skills, FFmpeg and Puppeteer')
  .action(async () => {
    showBanner();
    const { problems } = await runDoctor();
    if (problems) process.exitCode = 1;
  });

// ============================================================
// COMMAND: PROJECTS
// ============================================================
program
  .command('projects')
  .description('List generated projects in the workspace')
  .action(() => {
    showBanner();
    const projects = listProjects();
    if (!projects.length) {
      console.log(chalk.dim(`  No projects yet in ${PROJECTS_DIR}`));
      console.log(chalk.dim('  Create one with: ') + chalk.bold('anymotion generate "your idea"\n'));
      return;
    }

    const active = path.resolve(loadConfig().projectFile || '');
    console.log(chalk.bold.yellow(`  📁 ${projects.length} project(s) in ${PROJECTS_DIR}\n`));
    for (const p of projects) {
      const isActive = path.resolve(p.htmlFile) === active;
      const marker = isActive ? chalk.green(' ● active') : '';
      const when = p.meta.updatedAt ? chalk.dim(` · ${p.meta.updatedAt.slice(0, 10)}`) : '';
      const missing = p.exists ? '' : chalk.red(' (no index.html)');
      console.log(`  ${chalk.bold.white(p.name)}${marker}${when}${missing}`);
      if (p.meta.prompt) console.log(chalk.dim(`    ${String(p.meta.prompt).slice(0, 96)}`));
    }
    console.log('');
    console.log(chalk.dim('  Config file: ') + chalk.dim(CONFIG_PATH));
    console.log('');
  });

// ============================================================
// HELPER: Launch server + show editor link
// ============================================================
async function launchEditorAndOpen(port, display) {
  // Held back for release, not deleted: the server module and web-editor/ are untouched
  // and this function is unchanged below the guard. One check here covers both callers —
  // `anymotion serve` and `generate --serve`.
  if (!editorEnabled()) {
    display.error('The web editor is not part of this build yet.');
    console.log(chalk.dim('  It is being reworked before release. You do not need it to work:'));
    console.log(chalk.dim('  ›') + chalk.bold(' anymotion render') + chalk.dim(' — export the MP4'));
    console.log(chalk.dim('  ›') + chalk.dim(' open the project index.html in a browser to preview it'));
    console.log('');
    console.log(chalk.dim('  To run it anyway: ') + chalk.bold('anymotion config editorEnabled true') + '\n');
    return null;
  }

  display.section('Launching Anymotion Web Editor Server');
  display.thinking(`Starting Express server on port ${port}...`);

  // startWebServer returns a Promise. Announcing "LIVE" on a timer instead of on the
  // resolved listener meant a failed bind still printed a success banner and a link to
  // a port nothing was serving.
  let server;
  try {
    server = await startWebServer({ port });
  } catch (err) {
    display.error(`Could not start the editor on port ${port}: ${err.message}`);
    if (err.code === 'EACCES') {
      display.thinking('That port needs elevated permissions. Try --port 3000 or higher.');
    }
    process.exitCode = 1;
    return null;
  }

  {
    display.done(`Web Editor is LIVE!`);
    display.divider();
    console.log('');
    console.log(chalk.bold.hex('#00cbd6')('  ┌────────────────────────────────────────────────┐'));
    console.log(chalk.bold.hex('#00cbd6')('  │') + chalk.bold.white('  🎬 ANYMOTION STUDIO — LIVE EDITOR') + chalk.bold.hex('#00cbd6')('              │'));
    console.log(chalk.bold.hex('#00cbd6')('  │') + chalk.bold.hex('#00cbd6')('  ▶ ') + chalk.underline.cyan(`http://localhost:${port}`) + chalk.bold.hex('#00cbd6')('                           │'));
    console.log(chalk.bold.hex('#00cbd6')('  │') + chalk.dim('  Motion graphics loaded • Edit live • Export 4K   ') + chalk.bold.hex('#00cbd6')('│'));
    console.log(chalk.bold.hex('#00cbd6')('  └────────────────────────────────────────────────┘'));
    console.log('');
    console.log(chalk.dim('  Press Ctrl+C to stop the server.\n'));

    // Try to auto-open browser. `start` is a cmd.exe builtin, so on Windows it needs a
    // shell and an empty title argument before the URL.
    const opener = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start ""'
      : 'xdg-open';
    import('child_process').then(({ exec }) => {
      exec(`${opener} "http://localhost:${port}"`, () => {});
    });
  }

  return server;
}

// ============================================================
// DEFAULT ENTRY — conversational chat REPL when no command is given.
// Subcommands (generate/serve/render/config) still parse as before, so scripts and
// `npm run` entries keep working; only the bare invocation changed.
// ============================================================
if (process.argv.length <= 2) {
  const { startChat } = await import('./chat.js');
  await startChat();
} else {
  program.parse(process.argv);
}
