/**
 * SHELL TOOL
 * Lets the agent check whether ffmpeg exists, install a font, probe a rendered file,
 * or run anything else the job needs.
 *
 * Two guards sit in front of it: a hard blocklist in sandbox.js that no approval can
 * override, and the approval prompt itself. The working directory is pinned to the
 * project folder so a careless relative path stays inside the composition.
 */

import { spawn } from 'child_process';
import { blockedCommandReason } from '../sandbox.js';

const DEFAULT_TIMEOUT = 60_000;
const MAX_TIMEOUT = 600_000;
const MAX_OUTPUT = 20_000;

function clip(text, limit = MAX_OUTPUT) {
  if (text.length <= limit) return text;
  const head = text.slice(0, Math.floor(limit * 0.7));
  const tail = text.slice(-Math.floor(limit * 0.25));
  return `${head}\n\n[… ${text.length - head.length - tail.length} characters trimmed …]\n\n${tail}`;
}

export const shellTools = [
  {
    name: 'run_command',
    description:
      'Run a shell command in the project folder and get back its output and exit code. ' +
      'Use it to check whether a tool is installed (ffmpeg -version), inspect a rendered file (ffprobe), ' +
      'convert or optimise an asset, or list something the other tools do not cover. ' +
      'Do not use it for reading or writing project files — read_file, write_file, and edit_file are safer and ' +
      'give better output.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command line to run.' },
        purpose: { type: 'string', description: 'One short line on why you need this. Shown to the user in the approval prompt.' },
        timeout: { type: 'number', description: `Milliseconds before the command is killed. Default ${DEFAULT_TIMEOUT}.` }
      },
      required: ['command']
    },
    mutates: true,
    preview(input) {
      return {
        title: 'run command',
        lines: [input.command, input.purpose ? `— ${input.purpose}` : ''].filter(Boolean)
      };
    },
    run(input, ctx) {
      const command = String(input.command || '').trim();
      if (!command) throw new Error('command is required');

      const blocked = blockedCommandReason(command);
      if (blocked) {
        throw new Error(
          `Refused: this command matches a blocked pattern (${blocked}). ` +
          `If you genuinely need it, ask the user to run it themselves.`
        );
      }

      const timeout = Math.min(MAX_TIMEOUT, Math.max(1000, input.timeout || DEFAULT_TIMEOUT));

      return new Promise((resolve, reject) => {
        // shell: true so pipes and built-ins behave the way the model expects. The
        // blocklist above is what makes that acceptable.
        const child = spawn(command, {
          cwd: ctx.project.dir,
          shell: true,
          windowsHide: true,
          env: process.env
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { child.kill('SIGKILL'); } catch (_) {}
          resolve({
            content: `Command timed out after ${timeout}ms and was killed.\n\nstdout so far:\n${clip(stdout)}\n\nstderr so far:\n${clip(stderr)}`,
            meta: { code: null, timedOut: true }
          });
        }, timeout);

        const onAbort = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { child.kill('SIGKILL'); } catch (_) {}
          reject(new Error('Command cancelled.'));
        };
        if (ctx.signal) ctx.signal.addEventListener('abort', onAbort, { once: true });

        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });

        child.on('error', err => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (ctx.signal) ctx.signal.removeEventListener('abort', onAbort);
          reject(new Error(`Could not run command: ${err.message}`));
        });

        child.on('close', code => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (ctx.signal) ctx.signal.removeEventListener('abort', onAbort);

          const parts = [`exit code: ${code}`];
          if (stdout.trim()) parts.push(`stdout:\n${clip(stdout.trim())}`);
          if (stderr.trim()) parts.push(`stderr:\n${clip(stderr.trim())}`);
          if (!stdout.trim() && !stderr.trim()) parts.push('(no output)');

          resolve({ content: parts.join('\n\n'), meta: { code, timedOut: false } });
        });
      });
    },
    summarize(input, result) {
      if (result.meta.timedOut) return 'timed out';
      return result.meta.code === 0 ? 'exit 0' : `exit ${result.meta.code}`;
    },
    label(input) { return `Bash(${String(input.command).slice(0, 60)})`; }
  }
];
