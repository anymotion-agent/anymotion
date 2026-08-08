/**
 * PLAN TOOLS — the mechanism behind "ab maine ye kar liya, ab mai ye karunga".
 *
 * The old agent only ever announced intent, once, before it started. There was no
 * structure that could represent "step 2 of 5 finished, moving to step 3", so the TUI
 * had nothing to show but a character counter.
 *
 * update_todos gives the model a place to keep that state. It calls this at the start
 * of any multi-step job and again after each step lands; chat.js renders the list as a
 * live panel, so the user watches items tick over instead of reading a spinner.
 *
 * ask_user is the other half of the same idea, pointed the other way. The skill tells the
 * model to ask before it invents requirements, but it had no channel to ask through — so
 * it did what a model with no channel always does and guessed a duration, a palette, a
 * reading of the brief, then built thirty seconds of the wrong film. This gives it a
 * blocking, selectable question it can raise at any point in the run.
 */

import fs from 'fs';
import path from 'path';

const STATUSES = new Set(['pending', 'active', 'done']);

export const planTools = [
  {
    name: 'update_todos',
    description:
      'Publish or update your task list for the current request. Call this once when you start any job that takes ' +
      'more than one step, then call it again every single time a step completes — mark the finished item done and ' +
      'the next one active in the same call. The user sees this list live, so it is how they know what you already ' +
      'finished and what you are about to do. ' +
      'Keep exactly one item active. Write items as short outcomes ("scrape brand colours from the site"), not as ' +
      'tool names. Do not use this for single-step requests.',
    input_schema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The complete list, in order. Always send every item — this replaces the previous list.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Short outcome-focused description of the step.' },
              status: { type: 'string', enum: ['pending', 'active', 'done'], description: 'pending, active, or done.' }
            },
            required: ['text', 'status']
          }
        }
      },
      required: ['todos']
    },
    run(input, ctx) {
      const raw = Array.isArray(input.todos) ? input.todos : [];
      if (!raw.length) {
        if (ctx.todos && ctx.todos.length) {
          ctx.todos.forEach(t => t.status = 'done');
          if (typeof ctx.emit === 'function') ctx.emit({ type: 'todos', todos: ctx.todos });
          return { content: 'All todos marked done.', meta: { count: ctx.todos.length, done: ctx.todos.length } };
        }
        return { content: 'No todos to update.', meta: { count: 0, done: 0 } };
      }

      const todos = raw.slice(0, 20).map(t => ({
        text: String(t.text || '').trim().slice(0, 120),
        status: STATUSES.has(t.status) ? t.status : 'pending'
      })).filter(t => t.text);

      // One active item, always. A list with three "active" rows tells the user nothing
      // about what is happening right now, so keep the first and demote the rest.
      let seenActive = false;
      todos.forEach(t => {
        if (t.status !== 'active') return;
        if (seenActive) t.status = 'pending';
        seenActive = true;
      });

      ctx.todos = todos;
      if (typeof ctx.emit === 'function') ctx.emit({ type: 'todos', todos });

      const done = todos.filter(t => t.status === 'done').length;
      const active = todos.find(t => t.status === 'active');

      // The model reads this back on its next turn, so state it plainly rather than
      // just echoing the list — it is the cue to narrate the transition out loud.
      const lines = [
        `Task list updated — ${done}/${todos.length} done.`,
        active
          ? `Now working on: ${active.text}. Tell the user what you just finished and that you are starting this.`
          : done === todos.length
            ? 'Everything is marked done. Verify the result, then summarise what changed for the user.'
            : 'No item is active. Mark the next one active before continuing.'
      ];

      return { content: lines.join('\n'), meta: { todos, done, total: todos.length } };
    },
    summarize(input, result) {
      const { done, total } = result.meta;
      return `${done}/${total} done`;
    },
    label() { return 'UpdateTodos()'; }
  },

  {
    name: 'ask_user',
    description:
      'Ask the user a question and wait for their answer, offering 2-4 concrete options they can pick from. ' +
      'There are exactly two kinds of question worth asking. ' +
      'FIRST, before a plan exists: the composition decisions that are the user\'s and not yours — how many scenes ' +
      'and how long the film runs (one bundled question, not two), the brand palette, the render quality, and the ' +
      'aspect ratio when the placement is unclear. Ask those only when the user has not already said and nothing ' +
      'you can read settles it — a palette that research pulled off their own site is not a question. ' +
      'SECOND, at any point during the run: a decision where a wrong guess wastes the work and nothing in the brief ' +
      'or the files on disk points either way. If such a thing surfaces while you are writing scene 3, ask then. ' +
      'Everything else is yours to decide and to state in your narration: easing, type scale, pacing, layout, ' +
      'typography, which sound fits a beat. A user reacting to a finished composition gives better direction than ' +
      'a user answering abstract questions, so keep the total small — two questions before planning is the cap, ' +
      'and mid-build questions should be rarer still. ' +
      'Ask in the SAME LANGUAGE the user wrote to you in — a Roman Urdu brief gets a Roman Urdu question. ' +
      'Never use it for things you can find out yourself (read the file, fetch the page, list the sfx folder), ' +
      'for permission to write files (the approval prompt already handles that), or twice about the same thing. ' +
      'Always make one option the sensible default and mark it in its description. Keep options short and concrete ' +
      '("30 seconds, 6 scenes", "4K — 3840x2160, slowest to render", "#6366f1 indigo on near-black") rather than ' +
      'abstract ("medium length", "high quality", "cool palette").',
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'One clear question, in the same language the user is writing to you in.'
        },
        options: {
          type: 'array',
          description: '2 to 4 answers the user can select. Order them most-likely-first.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Short selectable answer, e.g. "30 seconds".' },
              description: { type: 'string', description: 'One line on what this choice means for the result.' }
            },
            required: ['label']
          }
        },
        context: {
          type: 'string',
          description: 'Optional single line explaining why you need to know, shown above the options.'
        },
        allow_custom: {
          type: 'boolean',
          description: 'Default true. Adds a "let me type my own answer" choice. Set false only when the options are genuinely exhaustive.'
        }
      },
      required: ['question', 'options']
    },
    async run(input, ctx) {
      const question = String(input.question || '').trim();
      if (!question) throw new Error('question is required.');

      const options = (Array.isArray(input.options) ? input.options : [])
        .map(o => (typeof o === 'string'
          ? { label: o.trim(), description: '' }
          : { label: String(o?.label || '').trim(), description: String(o?.description || '').trim() }))
        .filter(o => o.label)
        .slice(0, 4);

      if (options.length < 2) {
        throw new Error('Give at least 2 options. If there is genuinely only one sensible answer, do not ask — just do it and say what you assumed.');
      }

      // Headless runs, non-TTY invocations and the web server all reach this tool with no
      // way to render a prompt. Blocking forever there would hang the build, so the model
      // is told to decide for itself and — crucially — to say so in its summary, which is
      // strictly better than silently guessing.
      if (typeof ctx.askUser !== 'function') {
        const fallback = options[0].label;
        return {
          content:
            `No interactive prompt is available in this run, so the question could not be asked.\n` +
            `Proceed with the first option — "${fallback}" — as a documented assumption, and state plainly in your ` +
            `final summary that you assumed it because you could not ask.`,
          meta: { answer: fallback, assumed: true }
        };
      }

      const answer = await ctx.askUser({
        question,
        options,
        context: String(input.context || '').trim(),
        allowCustom: input.allow_custom !== false
      });

      const text = String(answer?.text ?? answer ?? '').trim();
      if (!text || answer?.cancelled) {
        return {
          content:
            `The user dismissed the question without answering. Do not ask it again. ` +
            `Pick "${options[0].label}", carry on, and mention the assumption when you summarise.`,
          meta: { answer: options[0].label, assumed: true }
        };
      }

      return {
        content:
          `The user answered: "${text}"\n` +
          `Treat this as a firm requirement for the rest of the run — do not ask about it again, and do not ` +
          `quietly drift away from it later. Acknowledge it in one short line, then continue.`,
        meta: { answer: text, custom: !!answer?.custom }
      };
    },
    summarize(input, result) {
      return result.meta.assumed ? `assumed ${result.meta.answer}` : result.meta.answer;
    },
    label(input) {
      const q = String(input?.question || '').trim();
      return `Ask(${q.length > 44 ? q.slice(0, 44) + '…' : q})`;
    }
  },

  {
    name: 'read_error_log',
    description:
      'Read recent runtime and API error details from .anymotion/errors.jsonl. Use this when the user asks "kya hua?", ' +
      '"what went wrong?", "why did it fail?", or when diagnosing a crash.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent errors to read (defaults to 5).' }
      }
    },
    run(input, ctx) {
      const dir = ctx.project?.dir || process.cwd();
      const errorFile = path.join(dir, '.anymotion', 'errors.jsonl');
      if (!fs.existsSync(errorFile)) {
        return { content: 'No error log found in this project. No runtime errors recorded.', meta: { count: 0 } };
      }
      try {
        const lines = fs.readFileSync(errorFile, 'utf-8').trim().split('\n').filter(Boolean);
        const count = input.limit || 5;
        const recent = lines.slice(-count).map(l => {
          try { return JSON.parse(l); } catch (_) { return l; }
        });
        return {
          content: JSON.stringify(recent, null, 2),
          meta: { count: recent.length, total: lines.length }
        };
      } catch (err) {
        return { content: `Error reading log: ${err.message}`, meta: { count: 0 } };
      }
    },
    summarize(input, result) {
      return `${result.meta.count} error logs`;
    },
    label() { return `ReadErrorLog()`; }
  }
];
