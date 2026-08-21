/**
 * ANYMOTION AGENT LOOP
 * Drives the full-screen TUI in chat-ui.js as a conversational agent.
 *
 * Behaviour:
 *  - A message that reads like a question gets a normal reply.
 *  - A message that reads like a build request produces a PLAN with options first.
 *    Nothing is written to disk until the user picks an option.
 *  - Each approved build gets its own folder under ./projects/<name>/.
 *  - Reasoning is streamed live when /think is on, then collapsed to a summary.
 *
 * Implementation notes:
 *  - stdin runs in raw mode so the composer can own the keyboard: the picker popup,
 *    history, and scrollback all need keys readline would otherwise consume.
 *  - console.log from the server/renderer is intercepted while the TUI owns the
 *    screen; an unmanaged write would tear the frame and leave stale cells behind.
 */

import readline from 'readline';
import { PassThrough } from 'stream';
import fs from 'fs';
import path from 'path';
import { loadConfig, setConfigValue, editorEnabled } from '../src/config/config-manager.js';
import {
  generateMotionGraphics, createTemplateMotionGraphics, planMotionGraphics, chatReply,
  AVAILABLE_MODELS, THINKING_LEVELS
} from '../src/agent/ai-engine.js';
import { describeTools, dispatch } from '../src/agent/tools/index.js';
import { listSkills, skillSearchRoots } from '../src/agent/skills.js';
import { describeApiError, resolveBaseUrl } from '../src/agent/agent-loop.js';
import { researchBrief, hasUrl } from '../src/agent/research.js';
import { runIntake, intakeAvailable } from '../src/agent/intake.js';
import { renderVideo } from '../src/render/video-renderer.js';
import { startWebServer } from '../src/server/web-server.js';
import { createProject, writeMeta, listProjects, findProject, displayPath, setProjectsDir, DEFAULT_PROJECTS_DIR, PROJECTS_DIR } from '../src/project/workspace.js';
import { Tui, c, wrap, truncate } from './chat-ui.js';

const COMMANDS = [
  { name: '/build', args: '<prompt>', desc: 'plan and build an animation' },
  { name: '/model', args: '', desc: 'choose the AI model' },
  { name: '/think', args: '', desc: 'reasoning effort — off to max' },
  { name: '/tools', args: '', desc: 'what the agent can do' },
  { name: '/skills', args: '', desc: 'craft references the agent can read' },
  { name: '/todo', args: '', desc: 'show the current task list' },
  { name: '/verify', args: '', desc: 'audit and screenshot the composition' },
  { name: '/projects', args: '', desc: 'list projects and their folders' },
  { name: '/open', args: '<name>', desc: 'switch to another project' },
  { name: '/cd', args: '[path]', desc: 'choose where projects are created' },
  { name: '/editor', args: '', desc: 'launch the web editor', gated: 'editor' },
  { name: '/render', args: '[1080p|4k|720p]', desc: 'export the project to MP4' },
  { name: '/project', args: '', desc: 'inspect the current project' },
  { name: '/approve', args: '[manual|auto]', desc: 'ask before writes, or allow all' },
  { name: '/config', args: '[key] [value]', desc: 'view or change configuration' },
  { name: '/new', args: '', desc: 'start a fresh chat session (clears history)' },
  { name: '/stop', args: '', desc: 'stop the AI generation mid-stream' },
  { name: '/help', args: '', desc: 'show commands' },
  { name: '/clear', args: '', desc: 'clear the terminal screen (keeps history)' },
  { name: '/exit', args: '', desc: 'quit anymotion' }
];

/**
 * The commands worth advertising right now.
 *
 * A command marked `gated: 'editor'` stays in the table and stays dispatchable — typing
 * /editor still reaches doEditor, which explains itself. It just does not appear in /help
 * or the autocomplete popup while the editor is held back, because offering a command that
 * only ever answers "not available yet" is worse than not offering it.
 */
function visibleCommands() {
  const showEditor = editorEnabled();
  return COMMANDS.filter(cmd => cmd.gated !== 'editor' || showEditor);
}

/**
 * Renders agent-loop events into the transcript.
 *
 * This replaces StreamNarrator, which collapsed an entire build into a spinner label
 * reading "composing styles · 12,345 chars". That was the user's actual complaint: they
 * could see the agent was doing *something* to a file, and nothing else — no result, no
 * reasoning, no "that is done, here is what is next". Every event now gets a line.
 *
 * There are two surfaces, and they answer different questions. The transcript is the
 * permanent record — one line per call, scrollable, still there an hour later. The
 * status block above the composer is the live view: an aggregate of what is in flight
 * right now ("reading 3 files, running 1 shell command"), which is the only readable
 * way to show three tools that each finish in under a second.
 */
function makeEventRenderer(tui, state) {
  let lastWasTool = false;

  return (ev) => {
    switch (ev.type) {
      case 'thinking':
        tui.thinkPush(ev.text);
        break;

      case 'skill':
        tui.skill(ev.name, ev.size, ev.chosen === true);
        break;

      case 'text':
        // The narration between tool calls. This is the whole point.
        tui.thinkEnd();
        if (lastWasTool) { tui.rail(); lastWasTool = false; }
        tui.narratePush(ev.text);
        break;

      case 'tool_start':
        tui.activityStart(ev.name, ev.label);
        tui.toolStart(ev.label);
        lastWasTool = true;
        break;

      case 'tool_result': {
        tui.toolResult(ev.summary, ev.isError);
        // An edit is worth showing, not just counting — the user can see at a glance
        // whether the agent changed what they meant.
        if (ev.meta && Array.isArray(ev.meta.diff)) tui.diff(ev.meta.diff);
        // A fresh file has no diff to show, so a slice of the real source stands in.
        else if (ev.meta && ev.meta.preview) tui.codePreview(ev.meta.preview, ev.meta.added);
        lastWasTool = true;
        break;
      }

      case 'todos':
        // The list lives above the composer and updates in place, so it is deliberately
        // NOT echoed into the transcript — printing it on every update_todos call is what
        // stacked near-identical checklists and made the screen look busy.
        tui.setTodos(ev.todos);
        state.todos = ev.todos;
        tui.narrateEnd();
        lastWasTool = true;
        break;

      case 'notice':
        tui.push(c.dim('  │ ') + c.muted(ev.text));
        break;

      // Research events, for the build paths that reach a link without a plan step ahead of
      // them. When the plan already scraped the site these never fire — its result is passed
      // in as options.research — but a build that has to read the site itself should say so
      // rather than sit on a silent spinner.
      case 'fetch':
      case 'page':
      case 'fail':
      case 'asset':
        renderResearch(tui, ev);
        break;

      case 'error':
        // A named failure, wrapped so a long proxy message stays inside the frame.
        // This is the difference between "agent stopped" and "403 Forbidden — your key
        // was blocked by agentrouter.org".
        tui.thinkEnd();
        tui.narrateEnd();
        wrap(ev.text, tui.width - 8).forEach((line, i) => {
          tui.push(
            i === 0
              ? c.dim('  ' + '│' + ' ') + c.err('✘ ') + c.white(line)
              : c.dim('  ' + '│' + '   ') + c.muted(line)
          );
        });
        break;

      case 'usage':
        tui.addUsage(ev.usage);
        break;

      case 'turn':
        // Each turn closes a batch of tool calls, so the live aggregate is committed
        // to the transcript as one past-tense line — "Read 2 files, ran 5 shell
        // commands" — and the next turn starts a fresh tally.
        tui.thinkEnd();
        tui.narrateEnd();
        if (ev.n > 1) tui.activityFlush();
        break;

      case 'done':
        tui.thinkEnd();
        tui.narrateEnd();
        tui.activityFlush();
        break;
    }
    tui.render();
  };
}

/**
 * Opens the approval prompt and resolves once the user answers.
 *
 * The agent loop awaits this promise, so the run is genuinely paused — nothing is
 * written while the box is on screen. Parked on `state` so handleKey can find it, the
 * same way pendingPlan already works.
 *
 * The "don't ask again" option names the specific tool, because it is the one answer
 * whose effect outlives the moment and the user should be able to see what they are
 * agreeing to before they agree to it.
 */
function makeApprovalRequester(tui, state) {
  return (toolName, input, preview) => new Promise((resolve) => {
    tui.stopSpinner();

    const options = [
      'Yes',
      `Yes, and don't ask again for: ${toolName}`,
      'No, and tell the agent what to do differently'
    ];
    const verdicts = ['yes', 'always', 'no'];

    tui.approvalBox(preview.title || toolName, preview.lines || [], preview.diff || null, options);
    tui.placeholder = '↑↓ choose · enter confirm · esc skip';
    tui.hint = '↑↓ choose   ·   1-3 pick   ·   enter confirm   ·   esc skip';

    state.pendingApproval = {
      resolve: (verdict) => {
        state.pendingApproval = null;
        tui.placeholder = '';
        tui.hint = '';
        tui.approvalEnd(verdict);
        tui.startSpinner('working');
        tui.render();
        resolve(verdict);
      },
      // handleKey drives the highlight; the box redraws itself in place.
      move: (delta) => { tui.approvalMove(delta); tui.render(); },
      pick: (i) => {
        if (i < 0 || i >= verdicts.length) return;
        tui.approval.index = i;
        state.pendingApproval.resolve(verdicts[i]);
      },
      confirm: () => state.pendingApproval.pick(tui.approval ? tui.approval.index : 0)
    };
    tui.render();
  });
}

/**
 * The other side of the ask_user tool.
 *
 * Structurally identical to makeApprovalRequester — the agent loop parks on this promise,
 * so nothing happens while the question is on screen — but it resolves an answer instead
 * of a verdict, and it has one extra state the approval box does not need: typing.
 *
 * Digits are deliberately not shortcuts here. "3" is the first character of "30 seconds",
 * and treating it as "pick option 3" would submit the wrong answer to the one question
 * where a typed answer is most likely. So arrows select, and any printable character
 * starts a custom answer instead — the box stays on screen above the composer while it is
 * being typed, so the options are still readable.
 */
function makeQuestionAsker(tui, state) {
  return ({ question, options, context, allowCustom }) => new Promise((resolve) => {
    tui.stopSpinner();
    const items = (options || []).map(o => (
      typeof o === 'string' ? { label: o, description: '' } : o
    ));
    const custom = allowCustom !== false;
    if (custom) items.push({ label: 'Something else — let me type it', description: '' });

    const startTyping = () => {
      if (!state.pendingQuestion) return;
      state.pendingQuestion.typing = true;
      tui.placeholder = 'Type your answer, then press enter';
      tui.hint = 'enter   submit answer   ·   esc   skip the question';
    };

    tui.askBox(question, items, context || '');
    tui.placeholder = '↑↓ choose · enter confirm · or just type your own answer';
    tui.hint = '↑↓ choose   ·   enter confirm   ·   type = your own answer   ·   esc skip';

    state.pendingQuestion = {
      typing: false,
      resolve: (answer) => {
        state.pendingQuestion = null;
        tui.placeholder = ''; tui.hint = '';
        tui.askEnd(answer.cancelled ? 'skipped' : answer.text);
        tui.startSpinner('working');
        tui.render();
        resolve(answer);
      },
      move: (delta) => { tui.approvalMove(delta); tui.render(); },
      pick: (i) => {
        if (i < 0 || i >= items.length) return;
        if (tui.approval) tui.approval.index = i;
        // The last row is an escape hatch, not an answer: choosing it hands the composer
        // to the user rather than resolving.
        if (custom && i === items.length - 1) {
          startTyping();
          setInput(tui, '');
          tui.render();
          return;
        }
        state.pendingQuestion.resolve({ text: items[i].label, custom: false });
      },
      confirm: () => state.pendingQuestion.pick(tui.approval ? tui.approval.index : 0),
      startTyping
    };
    tui.render();
  });
}

// ---------------------------------------------------------------- bootstrap

export async function startChat() {
  const config = loadConfig();

  // A folder chosen with /cd is saved, so restore it before anything reads PROJECTS_DIR.
  // If it has since been deleted or made read-only, the default is still there — losing a
  // saved preference is recoverable, refusing to start is not.
  if (config.projectsDir) {
    try {
      setProjectsDir(config.projectsDir);
    } catch (_) { /* fall through to the default */ }
  }

  const state = {
    server: null,
    port: config.port || 3000,
    busy: false,
    history: [],
    historyIndex: -1,
    draft: '',
    messages: [],          // conversation history sent to the chat model
    model: config.model || 'claude-opus-5',
    thinking: config.thinking || 'high',
    fileApprovalMode: config.fileApprovalMode || 'manual', // 'manual' | 'auto'
    project: null,         // active project from workspace.js
    projectActive: false,  // has this session actually opened that project? (see below)
    pendingPlan: null,     // { plan, prompt } awaiting approval
    pendingApproval: null, // resolver for the live y/n/a tool prompt
    pendingQuestion: null, // resolver for an ask_user question the agent raised
    pendingResearch: null, // research result from the plan step, reused by doBuild
    todos: []              // last task list the agent published
  };

  // Every new terminal launch starts a 100% fresh, clean session.
  const recent = listProjects().find(p => p.exists);

  const tui = new Tui({
    model: state.model,
    thinking: state.thinking,
    port: state.port,
    // null hides the badge entirely; false would claim the editor is merely stopped.
    serving: editorEnabled() ? false : null,
    // Blank until this session opens or creates a project.
    folder: ''
  });

  tui.enter();
  tui.welcome();

  // If a past project exists, show a subtle hint that the user can /open it if desired.
  if (recent) {
    tui.push('');
    tui.text(`Previous project: ${recent.name}`, c.dim);
    tui.text(`Type your request to start a new build, or use /open ${recent.name}`, c.dim);
  }

  installConsoleBridge(tui);
  tui.render();

  const cleanup = (code = 0) => {
    tui.leave();
    process.stdout.write('\n  ' + c.dim('anymotion session ended.') + '\n\n');
    process.exit(code);
  };

  // Keyboard bytes only. stdin carries mouse reports too, and readline's parser would
  // decode those as ordinary characters, so the two are separated before parsing rather
  // than after.
  const keyStream = new PassThrough();

  readline.emitKeypressEvents(keyStream);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();

  // Mouse reports arrive on the same stream as keystrokes, and readline's key parser does
  // not understand them — an SGR report would be decoded as the literal characters
  // "<64;80;10M" and typed straight into the composer. So stdin is filtered here and only
  // the keyboard bytes are forwarded to the parser.
  const SGR_MOUSE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

  const feedKeys = (s) => {
    let forwarded = '';
    let last = 0;
    let m;

    SGR_MOUSE.lastIndex = 0;
    while ((m = SGR_MOUSE.exec(s)) !== null) {
      forwarded += s.slice(last, m.index);
      last = m.index + m[0].length;

      const button = Number(m[1]);
      // Bit 6 marks a wheel event; bit 0 then gives the direction. Everything else is a
      // click, which the transcript has no use for — dropping it also means a click does
      // not steal focus or disturb the composer.
      if (button & 0x40) {
        const down = button & 0x01;
        const step = (button & 0x10) ? 15 : 3; // ctrl+wheel pages, plain wheel nudges
        tui.scroll = Math.max(0, tui.scroll + (down ? -step : step));
        tui.render();
      }
    }
    forwarded += s.slice(last);

    // Legacy X10 reports (\x1b[M + 3 bytes) from terminals that ignored the 1006 request.
    // They are dropped rather than decoded: any terminal new enough to matter answers in
    // SGR, and letting the raw bytes through is what puts junk in the input box.
    forwarded = forwarded.replace(/\x1b\[M.{3}/gs, '');

    if (forwarded) keyStream.write(Buffer.from(forwarded, 'latin1'));
  };

  // Bracketed paste mode (?2004h) makes the terminal fence pasted text between \x1b[200~
  // and \x1b[201~. That turns "was this a paste?" from a timing guess into a fact, so a
  // pasted newline can never submit the message half-typed. The pasted body bypasses the
  // keypress parser entirely and is inserted into the composer verbatim — otherwise every
  // character would round-trip through readline and a 200-line paste would repaint 200
  // times.
  const PASTE = /\x1b\[200~([\s\S]*?)\x1b\[201~/g;
  const PASTE_START = '\x1b[200~';

  // A big paste arrives split across several data events, so an unterminated start marker
  // parks the tail here until the closing marker turns up in a later chunk.
  let pending = '';

  process.stdin.on('data', (chunk) => {
    const s = pending + chunk.toString('latin1');
    pending = '';
    let last = 0;
    let m;

    PASTE.lastIndex = 0;
    while ((m = PASTE.exec(s)) !== null) {
      feedKeys(s.slice(last, m.index));
      last = m.index + m[0].length;
      insertText(tui, m[1]);
    }

    const rest = s.slice(last);
    const open = rest.lastIndexOf(PASTE_START);
    if (open === -1) {
      feedKeys(rest);
    } else {
      // Paste still streaming — everything from the marker onward waits for its terminator.
      feedKeys(rest.slice(0, open));
      pending = rest.slice(open);
    }
  });

  keyStream.on('keypress', (str, key) => {
    if (!key) return;

    // Ctrl+C must work mid-task, so it is handled before the busy guard below.
    if (key.ctrl && key.name === 'c') {
      if (state.busy) { cleanup(130); return; }
      if (tui.input.length) { setInput(tui, ''); tui.render(); return; }
      cleanup(0);
      return;
    }
    if (key.ctrl && key.name === 'd' && !tui.input.length) { cleanup(0); return; }

    handleKey(tui, state, str, key);
  });
}

/**
 * Drop pasted text into the composer at the cursor, newlines and all.
 *
 * Paste never submits — that is the whole point of routing it around the keypress path.
 * The user presses Enter when they are ready, which is also what clears the composer.
 */
function insertText(tui, text) {
  if (!text) return;
  // \r is what a terminal actually sends for Enter inside a paste; normalise so the
  // composer's line splitting sees the newlines it expects.
  const body = text.replace(/\r\n?/g, '\n');
  setInput(tui, tui.input.slice(0, tui.cursor) + body + tui.input.slice(tui.cursor), tui.cursor + body.length);
  tui.render();
}

// ---------------------------------------------------------------- keyboard

function setInput(tui, value, cursor) {
  tui.input = value;
  tui.cursor = cursor === undefined ? value.length : cursor;
  if (tui.popupMode !== 'select') refreshPopup(tui);
}

function refreshPopup(tui) {
  // The popup is a command picker, not a search box: it only opens while the input
  // is a bare slash-token, so "/build a logo intro" stops suggesting mid-sentence.
  if (!tui.input.startsWith('/') || tui.input.includes(' ')) {
    tui.popup = [];
    tui.popupIndex = 0;
    tui.popupTitle = '';
    return;
  }
  const q = tui.input.toLowerCase();
  tui.popupMode = 'command';
  tui.popupTitle = 'commands';
  tui.popup = visibleCommands().filter(cmd => cmd.name.startsWith(q));
  if (tui.popupIndex >= tui.popup.length) tui.popupIndex = 0;
}

function openChooser(tui, title, items, onPick) {
  tui.popupMode = 'select';
  tui.popupTitle = title;
  tui.popup = items;
  tui.popupIndex = Math.max(0, items.findIndex(i => i.current));
  tui.onPick = onPick;
}

function closePopup(tui) {
  tui.popup = [];
  tui.popupIndex = 0;
  tui.popupTitle = '';
  tui.popupMode = 'command';
  tui.onPick = null;
}

function handleKey(tui, state, str, key) {
  const name = key.name;

  // --- a live approval box owns the keyboard until it is answered ---
  // The agent loop is parked on this promise, so nothing gets written to disk while
  // this is on screen. Arrows move, numbers pick directly, enter confirms, esc skips.
  // Everything else is swallowed: a stray keystroke must not fall through to submit.
  if (state.pendingApproval) {
    const p = state.pendingApproval;
    if (name === 'up') { p.move(-1); return; }
    if (name === 'down') { p.move(1); return; }
    if (name === 'return') { p.confirm(); return; }
    if (name === 'escape') { p.resolve('no'); return; }
    if (str && /^[1-9]$/.test(str)) { p.pick(Number(str) - 1); return; }
    // The old single-letter shortcuts still work for anyone who has the muscle memory.
    const ch = (str || '').toLowerCase();
    if (ch === 'y') { p.resolve('yes'); return; }
    if (ch === 'n') { p.resolve('no'); return; }
    if (ch === 'a') { p.resolve('always'); return; }
    return;
  }

  // --- a question owns the keyboard the same way, but printable keys start a typed answer ---
  // Same parked-promise shape as the approval box. The difference is that a question can be
  // answered with something that is not on the list, so this has a second state: once the
  // user starts typing, the box steps aside and the composer takes over, with enter meaning
  // "this is my answer" rather than "send this message".
  if (state.pendingQuestion) {
    const q = state.pendingQuestion;

    if (q.typing) {
      if (name === 'return' && !key.shift) {
        const text = tui.input.trim();
        setInput(tui, '');
        q.resolve(text ? { text, custom: true } : { cancelled: true });
        return;
      }
      if (name === 'escape') {
        setInput(tui, '');
        q.resolve({ cancelled: true });
        return;
      }
      // Everything else is ordinary text editing — deliberately NOT returning here so the
      // normal key handling below (arrows, backspace, characters, paste) still applies.
    } else {
      if (name === 'up') { q.move(-1); return; }
      if (name === 'down') { q.move(1); return; }
      if (name === 'return') { q.confirm(); return; }
      if (name === 'escape') { q.resolve({ cancelled: true }); return; }

      // A printable character means the user is answering in their own words. No digit
      // shortcuts: "3" is how "30 seconds" starts, and picking option 3 instead would be
      // the wrong answer to exactly the question most likely to be typed.
      if (str && str.length === 1 && str >= ' ') {
        q.startTyping();
        setInput(tui, str);
        tui.render();
        return;
      }
      return;
    }
  }

  // --- popup navigation takes priority over history / submit ---
  if (tui.popup.length) {
    if (name === 'escape') { closePopup(tui); tui.render(); return; }
    if (name === 'up') { tui.popupIndex = (tui.popupIndex - 1 + tui.popup.length) % tui.popup.length; tui.render(); return; }
    if (name === 'down') { tui.popupIndex = (tui.popupIndex + 1) % tui.popup.length; tui.render(); return; }

    if (tui.popupMode === 'select' && (name === 'return' || name === 'tab')) {
      const pick = tui.popup[tui.popupIndex];
      const fn = tui.onPick;
      closePopup(tui);
      setInput(tui, '');
      if (fn) fn(pick);
      tui.render();
      return;
    }
    if (name === 'tab') {
      const chosen = tui.popup[tui.popupIndex];
      setInput(tui, chosen.name + (chosen.args ? ' ' : ''));
      tui.render();
      return;
    }
  }

  switch (name) {
    case 'return': {
      if (key.shift) {
        // Shift+Enter is the deliberate newline. Pasted newlines never reach here — they
        // go straight into the composer via the bracketed-paste path.
        setInput(tui, tui.input.slice(0, tui.cursor) + '\n' + tui.input.slice(tui.cursor), tui.cursor + 1);
        tui.render();
        return;
      }
      const input = tui.input.trim();
      if (!input) return;
      // Enter on a highlighted argument-less suggestion runs that command.
      const chosen = tui.popup.length && tui.popupMode === 'command' ? tui.popup[tui.popupIndex] : null;
      const final = chosen && chosen.name.startsWith(input) && !chosen.args ? chosen.name : input;
      setInput(tui, '');
      closePopup(tui);
      state.history.push(final);
      state.historyIndex = -1;
      submit(tui, state, final);
      return;
    }

    case 'backspace':
      if (tui.cursor > 0) {
        setInput(tui, tui.input.slice(0, tui.cursor - 1) + tui.input.slice(tui.cursor), tui.cursor - 1);
      }
      break;

    case 'delete':
      if (tui.cursor < tui.input.length) {
        setInput(tui, tui.input.slice(0, tui.cursor) + tui.input.slice(tui.cursor + 1), tui.cursor);
      }
      break;

    case 'left': tui.cursor = Math.max(0, tui.cursor - 1); break;
    case 'right': tui.cursor = Math.min(tui.input.length, tui.cursor + 1); break;
    case 'home': tui.cursor = 0; break;
    case 'end': tui.cursor = tui.input.length; break;

    case 'up':
    case 'down': {
      if (key.shift) {
        if (name === 'up') tui.scroll += 5;
        if (name === 'down') tui.scroll = Math.max(0, tui.scroll - 5);
        break;
      }
      if (!state.history.length) break;
      if (state.historyIndex === -1) {
        if (name === 'down') break;
        state.draft = tui.input;
        state.historyIndex = state.history.length - 1;
      } else if (name === 'up') {
        state.historyIndex = Math.max(0, state.historyIndex - 1);
      } else {
        state.historyIndex++;
      }
      if (state.historyIndex >= state.history.length) {
        state.historyIndex = -1;
        setInput(tui, state.draft || '');
      } else {
        setInput(tui, state.history[state.historyIndex]);
      }
      break;
    }

    // A page is a screen minus two rows of overlap, so the line you were reading stays on
    // screen instead of the view jumping a full blind page at a time.
    case 'pageup': tui.scroll += Math.max(1, tui.bodyRows - 2); break;
    case 'pagedown': tui.scroll = Math.max(0, tui.scroll - Math.max(1, tui.bodyRows - 2)); break;

    case 'escape':
      // Esc clears the draft, but when the transcript is scrolled back the more useful
      // reading of "get me out of here" is returning to the live tail.
      if (tui.scroll > 0 && !tui.input.length) tui.scrollToBottom();
      else setInput(tui, '');
      break;

    default:
      if (key.ctrl && name === 'end') { tui.scrollToBottom(); break; }
      if (key.ctrl && name === 'home') { tui.scroll = Number.MAX_SAFE_INTEGER; break; }
      if (key.ctrl && name === 'l') { tui.lines = []; tui.scrollToBottom(); tui.welcome(); break; }
      if (key.ctrl && name === 'u') { setInput(tui, ''); break; }
      if (key.ctrl || key.meta) break;
      if (str && str >= ' ') {
        setInput(tui, tui.input.slice(0, tui.cursor) + str + tui.input.slice(tui.cursor), tui.cursor + str.length);
      }
      break;
  }

  tui.render();
}

// ---------------------------------------------------------------- dispatch

async function submit(tui, state, input) {
  if (state.busy) {
    if (input.trim().toLowerCase() === '/stop') {
      if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
      }
      setInput(tui, '');
    } else {
      tui.action('warn', 'AI is busy. Type /stop to cancel.');
      setInput(tui, '');
    }
    tui.render();
    return;
  }

  // Reload config to catch any manual changes made to motion.config.json
  state.config = loadConfig();

  tui.userLine(input);
  // The user just hit enter — whatever was on screen is now stale. Jump to the tail so the
  // response streams in underneath rather than staying pinned wherever they had scrolled.
  tui.scrollToBottom();
  state.busy = true;
  tui.render();

  try {
    await handleInput(tui, state, input);
  } catch (err) {
    tui.thinkEnd();
    tui.narrateEnd();
    tui.stopSpinner();
    tui.agentHeader();
    // err.explained is set by the agent loop for API and network failures; it names the
    // actual cause instead of leaking an SDK stack fragment.
    const message = err.explained || describeApiError(err, state.config || {});
    wrap(message, tui.width - 8).forEach((line, i) => {
      if (i === 0) tui.fail(line);
      else tui.push(c.dim('  │   ') + c.muted(line));
    });
    tui.endBlock();
  }

  // A run that died with an approval box open would otherwise leave the keyboard
  // captured by a resolver nobody is awaiting — every keystroke swallowed, no way out.
  state.pendingApproval = null;
  state.pendingQuestion = null;
  tui.stopSpinner();
  state.busy = false;
  tui.render();
}

async function handleInput(tui, state, input) {
  if (!input.startsWith('/')) {
    // An outstanding plan captures the next message: it is an answer, not a new topic.
    if (state.pendingPlan) { await resolveApproval(tui, state, input); return; }
    await route(tui, state, input);
    return;
  }

  const [cmdRaw, ...rest] = input.split(/\s+/);
  const cmd = cmdRaw.toLowerCase();
  const arg = rest.join(' ');

  switch (cmd) {
    case '/exit':
    case '/quit':
      tui.leave();
      process.stdout.write('\n  ' + c.dim('anymotion session ended.') + '\n\n');
      process.exit(0);
      return;

    case '/help': showHelp(tui); return;
    case '/clear': tui.lines = []; tui.scrollToBottom(); tui.welcome(); return;
    case '/new':
      state.messages = [];
      // A fresh session also detaches from whatever was being edited, so the next plain
      // message is not read as an instruction about the previous project.
      state.projectActive = false;
      state.pendingPlan = null;
      state.pendingResearch = null;
      state.todos = [];
      tui.lines = [];
      tui.scrollToBottom();
      tui.welcome();
      tui.action('note', 'Started a fresh session. Chat history cleared.');
      return;

    case '/model': chooseModel(tui, state, arg); return;
    case '/think':
    case '/thinking': chooseThinking(tui, state, arg); return;

    case '/build':
    case '/generate':
      if (!arg) {
        tui.agentHeader();
        tui.text('Describe the animation you want. For example:', c.muted);
        tui.text('/build SaaS analytics dashboard explainer, dark glass style', c.white);
        tui.endBlock();
        return;
      }
      await doPlan(tui, state, arg);
      return;

    case '/projects': doProjects(tui, state); return;
    case '/open': doOpen(tui, state, arg); return;
    case '/cd': doCd(tui, arg); return;
    case '/tools': doTools(tui); return;
    case '/skills': doSkills(tui); return;
    case '/todo':
    case '/todos': doTodo(tui, state); return;
    case '/verify': await doVerify(tui, state); return;
    case '/editor':
    case '/serve': doEditor(tui, state); return;
    case '/render': await doRender(tui, state, arg); return;
    case '/project': doProject(tui, state); return;
    case '/approve': doApprove(tui, state, arg); return;
    case '/config': doConfig(tui, rest); return;

    default:
      tui.agentHeader();
      tui.fail(`Unknown command: ${cmd}`);
      tui.text('Type /help to see what is available.', c.muted);
      tui.endBlock();
  }
}

/**
 * Decides whether a plain message is a build request or a question. Kept as a local
 * heuristic rather than a classifier round-trip — an extra API call before every
 * reply would double latency for the common case, and /build forces the issue when
 * the guess is wrong.
 */
const BUILD_VERBS = /\b(make|create|build|generate|design|animate|banao|bana|bnao|bna|chahiye|kar\s*do|karo)\b/i;
const QUESTION_HINTS = /^(what|why|how|when|where|which|who|can|could|should|do|does|is|are|kya|kaise|kyu|kyun|kaisay)\b|\?$/i;

/** Words that mean "start over somewhere else", not "change what is open". */
const FRESH_BUILD_HINTS = /\b(new|another|fresh|separate|scratch|naya|nayi|nai|alag|doosra|dusra)\b/i;

/** Pleasantries and acknowledgements. Never worth spinning up an agent run for. */
const SMALL_TALK = /^(hi|hey|hello|yo|thanks|thank you|ty|ok|okay|cool|nice|great|good|done|sahi|theek|thik|shukriya|shukria|acha|accha|bas|salam|assalam|kaise ho|kya haal|kya haal hai|kese ho|how are you|sup)[\s!.?]*$/i;

/**
 * "Pick up where you stopped."
 *
 * Worth matching explicitly because the word carries no information on its own — routed
 * as an ordinary message it is a one-word brief with no build verb, which falls through
 * to chat, and the model quite reasonably answers "not sure what you meant". What it
 * actually means is "re-run the last brief against the open folder", and only the CLI
 * knows what that brief was.
 */
const CONTINUE_HINTS = /^(continue|retry|try again|replan|re-plan|carry on|keep going|go on|resume|proceed|next|go|finish|aage|aage barho|jari rakho|continue karo|karo continue|dobara|phir se|\.|\.\.)[\s!.?]*$/i;

function looksLikeBuildRequest(text) {
  const t = text.trim();
  if (QUESTION_HINTS.test(t) && !BUILD_VERBS.test(t)) return false;
  if (BUILD_VERBS.test(t)) return true;
  // A long descriptive phrase with no question marker reads as a brief.
  return t.split(/\s+/).length >= 5 && !t.includes('?');
}

/**
 * Routes user messages directly to the LLM agent with full context.
 *
 * Like Antigravity and modern agentic systems, we do NOT use rigid regex keyword gates
 * to guess user intent. The LLM agent inspects the conversation history, disk inventory,
 * and open tasks to naturally determine whether to continue an interrupted run, apply
 * surgical edits, answer questions, or plan a fresh composition.
 */
async function route(tui, state, input) {
  const t = input.trim();
  const hasProject = state.projectActive && state.project && state.project.dir && fs.existsSync(state.project.dir);

  // 0. If user says "continue", "retry", "replan", "phir se", etc.
  if (CONTINUE_HINTS.test(t)) {
    await doContinue(tui, state);
    return;
  }

  // 1. If small talk / greeting / pleasantry, go straight to conversational chat without hitting tool intake
  if (SMALL_TALK.test(t)) {
    await doChat(tui, state, input);
    return;
  }

  // 2. If an active project was explicitly opened or created in THIS session, route instructions to it
  if (hasProject && !FRESH_BUILD_HINTS.test(t)) {
    await doRevise(tui, state, input);
    return;
  }

  // 3. If explicit build request or brief with URL, plan directly with live steps
  if (looksLikeBuildRequest(t) || hasUrl(t)) {
    await doPlan(tui, state, input);
    return;
  }

  // 4. If no project is active and request is open-ended, let intake decide
  if (intakeAvailable(loadConfig())) {
    await doIntake(tui, state, input);
    return;
  }

  await doChat(tui, state, input);
}

/**
 * The intake stage — the agent decides what this message means.
 *
 * This is what replaced `looksLikeBuildRequest` on the main path. The regex could only
 * answer "brief or question", and it answered from vocabulary alone: "saas explainer bnao
 * is website ka" matched a build verb, went straight to planning, and the planner wrote a
 * plan for a site it had never read. There was no step at which anything could have
 * fetched it, because matching the regex *was* the decision to plan.
 *
 * Now the model reads the message and chooses: read the site, ask one question, or plan.
 * When it plans, the research it did on the way is handed over with the brief — so the
 * plan is written knowing the real palette and the real copy, and `doPlan` never fetches
 * the same page twice.
 */
async function doIntake(tui, state, input) {
  state.abortController = new AbortController();

  tui.beginRun();
  tui.startSpinner('understanding');
  if (state.thinking !== 'off') tui.thinkStart('reasoning about the request');

  let outcome = null;
  let streamed = '';

  try {
    outcome = await runIntake([...state.messages, { role: 'user', content: input }], {
      model: state.model,
      thinking: state.thinking,
      signal: state.abortController.signal,
      project: state.project,
      askUser: makeQuestionAsker(tui, state),
      projectContext: describeOpenProject(state),
      onThinking: (t) => { tui.thinkPush(t); tui.render(); },
      onToken: (tok) => { streamed += tok; },
      onEvent: (ev) => {
        if (ev.type === 'skill') tui.skill(ev.name, ev.size, ev.chosen === true);
        else if (ev.type === 'intake_decision') {
          if (ev.detail) tui.action('plan', ev.detail);
        } else if (ev.type === 'tool_failed') {
          tui.fail(`${ev.tool} — ${ev.detail}`);
        } else renderResearch(tui, ev);
        tui.render();
      }
    });
  } catch (err) {
    // Only the thinking block closes here. The spinner is deliberately left running so the
    // `stopSpinner(true)` calls below can still print their "Worked for Ns" receipt — that
    // receipt is guarded on `busy`, so stopping the spinner first silently suppressed it.
    // The `finally` below is what does the plain stop, on every path.
    tui.thinkEnd();
    if (state.abortController?.signal.aborted) {
      tui.action('note', 'Stopped.');
      tui.stopSpinner(true);
      return;
    }
    tui.stopSpinner(true);
    if (looksLikeBuildRequest(input.trim())) {
      await doPlan(tui, state, input);
    } else {
      await doChat(tui, state, input);
    }
    return;
  } finally {
    tui.stopSpinner();
    tui.thinkEnd();
  }

  if (outcome.action === 'plan') {
    tui.stopSpinner(true);
    // The research travels with the brief. doPlan checks this before deciding whether to
    // fetch, which is what stops the site being read twice in one turn.
    state.pendingResearch = outcome.research || null;
    await doPlan(tui, state, outcome.brief, '', { research: outcome.research || null });
    return;
  }

  // An answer, already written. Recorded in history under the user's original words, not
  // the intake brief, so the next turn reads back the way the conversation actually went.
  const answer = (outcome.text || streamed || '').trim();
  tui.stopSpinner(true);

  // A weak tool-caller describing the build instead of starting it.
  //
  // Intake is now available on every provider, and the models behind openrouter/openai vary
  // a lot in how reliably they emit a tool call. The failure is specific: the request is
  // plainly a brief, and the model replies with prose about what it *would* build rather
  // than calling create_plan. Left alone that drops the request entirely — the user asked
  // for a composition and got a paragraph. The old keyword heuristic is exactly the right
  // arbiter here, because it only has to answer the question intake already failed to.
  if (answer && looksLikeBuildRequest(input.trim())) {
    tui.agentHeader();
    tui.action('note', 'building from your request directly', 'no plan decision came back');
    tui.endBlock();
    await doPlan(tui, state, input);
    return;
  }

  if (answer) {
    tui.agentHeader();
    for (const line of wrap(answer, tui.width - 6)) tui.text(line, c.white);
    tui.endBlock();
    state.messages.push({ role: 'user', content: input });
    state.messages.push({ role: 'assistant', content: answer });
    return;
  }

  // Intake finished without a decision and without saying anything — nothing to show, so
  // treat it as an ordinary message rather than leaving the turn blank.
  await doChat(tui, state, input);
}

/**
 * Resumes the open project from whatever state it is actually in.
 *
 * Deliberately not a plain revision with the word "continue" as the prompt: the agent
 * would receive a single ambiguous word and have to guess. Instead the instruction names
 * the two things it needs — the folder is the source of truth, and unfinished items on
 * its own task list are the work queue — so it starts by reading rather than asking.
 */
async function doContinue(tui, state) {
  const hasProject = state.projectActive && state.project && state.project.dir && fs.existsSync(state.project.dir);
  if (!hasProject) {
    if (state.lastBrief) {
      await doPlan(tui, state, state.lastBrief);
      return;
    }
    tui.text('Nothing in progress to continue yet. Tell me what animation you would like to build!', c.muted);
    return;
  }
  const open = (state.todos || []).filter(t => t.status !== 'done');
  const dir = state.project.dir;

  // What is actually on disk, not what the plan intended to put there.
  //
  // The task list names the files the plan meant to create — "Create project structure:
  // index.html, style.css, script.js" — and a run that died early created none of them.
  // Resuming from the task list alone, the agent read style.css, missed, read script.js,
  // missed, listed the directory, then read project.json: four round-trips to learn what
  // one readdir already knows. Worse, the misses read as "the folder is wrong" when the
  // folder was right all along and simply near-empty.
  //
  // Handing over the real inventory costs nothing and removes the guessing entirely.
  let inventory = '';
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.'))
      .map(e => {
        if (e.isDirectory()) return `${e.name}/`;
        let kb = 0;
        try { kb = Math.max(1, Math.round(fs.statSync(path.join(dir, e.name)).size / 1024)); } catch (_) { }
        return `${e.name} (${kb}KB)`;
      });
    if (entries.length) {
      inventory = `The folder already contains these files — this is the complete list, so do not go looking for anything that is not on it:\n${entries.map(e => `- ${e}`).join('\n')}`;
    } else {
      inventory = 'The folder is empty apart from metadata. Nothing was written before the run stopped.';
    }
  } catch (_) { }

  const entry = state.project.htmlFile || path.join(dir, 'index.html');
  const hasEntry = fs.existsSync(entry);
  let missingDetail = '';

  if (hasEntry) {
    try {
      const html = fs.readFileSync(entry, 'utf-8');
      const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
      const styles = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gi)].map(m => m[1]);
      const missing = [];
      for (const rel of [...scripts, ...styles]) {
        if (!/^https?:\/\//i.test(rel) && !rel.startsWith('data:')) {
          const full = path.resolve(dir, rel);
          if (!fs.existsSync(full)) missing.push(rel);
        }
      }
      if (missing.length) {
        missingDetail = `CRITICAL MISSING FILES: index.html references ${missing.join(', ')}, but they do NOT exist on disk yet. You MUST immediately invoke write_file to create ${missing.join(' and ')} to finish the animation engine.`;
      }
    } catch (_) {}
  }

  const instruction = [
    'Continue the work already in progress in this folder. Do not start over, do not chat, and do not ask me what I meant.',
    inventory,
    missingDetail,
    hasEntry
      ? 'Read index.html first to see exactly how far you got, then immediately write the missing files.'
      : 'index.html does not exist yet, so write it now.',
    open.length ? `Still open on your task list:\n${open.map(t => `- ${t.text}`).join('\n')}` : ''
  ].filter(Boolean).join('\n\n');

  await doRevise(tui, state, instruction);
}

/**
 * Sends a change straight to the agent against the open folder — no plan round-trip.
 *
 * Planning earns its keep on a fresh build, where there is a lot to decide before any
 * code exists. For "make scene 2 snappier" it is just a turn of latency between the ask
 * and the edit; the per-tool y/n/a gate is the checkpoint that matters here.
 */
async function doRevise(tui, state, input) {
  const meta = state.project.meta || {};
  const base = (meta.plan && meta.plan.plan) || {};
  const option = { ...base, title: base.title || meta.option || state.project.name };
  await doBuild(tui, state, input, meta.plan || {}, option, { revise: true });
}

function enforceContextLimits(state) {
  // A rough estimate: 1 token ≈ 4 characters. Limit to ~150k tokens (600,000 chars) to stay safely under 200k.
  const CHAR_LIMIT = 600000;
  let currentChars = state.messages.reduce((acc, msg) => acc + (msg.content || '').length, 0);
  
  while (currentChars > CHAR_LIMIT && state.messages.length > 4) {
    const dropped = state.messages.shift();
    currentChars -= (dropped.content || '').length;
    // Anthropic API expects messages to start with 'user'
    if (state.messages.length > 0 && state.messages[0].role === 'assistant') {
      const dropped2 = state.messages.shift();
      currentChars -= (dropped2.content || '').length;
    }
  }
}

/**
 * A few lines telling the chat model what is currently open.
 *
 * Read from disk rather than from `state`, because the agent has been editing that file
 * and the in-memory numbers go stale the moment it does. Returns null when nothing is
 * open, which leaves the system prompt exactly as it was.
 */
function describeOpenProject(state) {
  if (!state.projectActive || !state.project || !fs.existsSync(state.project.dir)) return null;

  const p = state.project;
  const lines = [`Open project: ${p.name} (${displayPath(p.dir)})`];

  const entry = p.htmlFile || path.join(p.dir, 'index.html');
  if (fs.existsSync(entry)) {
    try {
      const html = fs.readFileSync(entry, 'utf-8');
      lines.push(`index.html exists — ${countLayers(html)} animated layers, ${readDuration(html)}s timeline.`);
    } catch (_) {
      lines.push('index.html exists.');
    }
  } else {
    lines.push('index.html has NOT been written yet — the composition does not exist on disk.');
  }

  const brief = p.meta && (p.meta.option || p.meta.prompt);
  if (brief) lines.push(`Brief: ${brief}`);

  const open = (state.todos || []).filter(t => t.status !== 'done');
  if (open.length) lines.push(`Still open: ${open.map(t => t.text).join('; ')}`);

  return lines.join('\n');
}

async function doChat(tui, state, input) {
  state.messages.push({ role: 'user', content: input });
  enforceContextLimits(state);

  tui.beginRun();
  tui.startSpinner('thinking');
  if (state.thinking !== 'off') tui.thinkStart('reasoning');

  state.abortController = new AbortController();

  let reply;
  try {
    reply = await chatReply(state.messages, {
      model: state.model,
      thinking: state.thinking,
      projectContext: describeOpenProject(state),
      signal: state.abortController.signal,
      onThinking: (t) => { tui.thinkPush(t); tui.render(); }
    });
  } finally {
    tui.thinkEnd();
    tui.stopSpinner();
  }

  state.messages.push({ role: 'assistant', content: reply });
  tui.agentHeader();
  reply.split('\n').forEach(para => {
    if (para.trim()) tui.text(para, c.white);
    else tui.rail();
  });
  tui.endBlock();
}

// ---------------------------------------------------------------- planning

/**
 * Renders research progress from the events researchBrief emits.
 *
 * The old enrichment was silent — a console.warn in a raw-mode TUI either disappeared or
 * corrupted the frame, so the user stared at "planning" for eleven seconds without knowing
 * half that time was spent scraping a site. These events make it visible.
 */
function renderResearch(tui, event) {
  const { type, url, detail, ok, brand } = event;
  // Not every event that reaches here is a research event — the plan step routes its whole
  // event stream through this function. Anything without a url is something else's.
  if (!url || typeof url !== 'string') return;
  const shortUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const label = shortUrl.length > 54 ? shortUrl.slice(0, 52) + '…' : shortUrl;

  if (type === 'fetch') {
    tui.action('research', `fetching ${label}`, '');
  } else if (type === 'page') {
    tui.action('research', label, detail || 'scraped');
    if (brand) {
      if (brand.theme) {
        tui.push(c.dim('  │   ') + c.brandBold('Theme:     ') + c.white(`${brand.theme.mode.toUpperCase()} MODE`) + c.dim(` (Bg: ${brand.theme.bgPrimary} · Surface: ${brand.theme.bgSecondary})`));
        tui.push(c.dim('  │   ') + c.brandBold('Accents:   ') + c.accent(`Primary: ${brand.theme.primaryAccent}`) + c.dim(` · Secondary: ${brand.theme.secondaryAccent}`));
      } else if (Array.isArray(brand.colors) && brand.colors.length) {
        tui.push(c.dim('  │   ') + c.brandBold('Palette:   ') + c.white(brand.colors.slice(0, 5).join(', ')));
      }
      if (Array.isArray(brand.fonts) && brand.fonts.length) {
        tui.push(c.dim('  │   ') + c.brandBold('Fonts:     ') + c.white(brand.fonts.slice(0, 4).join(', ')));
      }
      if (Array.isArray(brand.copy) && brand.copy.length) {
        const headline = brand.copy[0];
        if (headline) tui.push(c.dim('  │   ') + c.brandBold('Headline:  ') + c.muted(`"${truncate(headline, 55)}"`));
      }
      if (Array.isArray(brand.assets) && brand.assets.length) {
        const logos = brand.assets.filter(a => a.kind === 'logo');
        if (logos.length) tui.push(c.dim('  │   ') + c.brandBold('Brand Logo:') + c.dim(` ${logos[0].url.slice(0, 50)}`));
      }
    }
  } else if (type === 'fail') {
    tui.fail(`${label} — ${detail}`);
  } else if (type === 'asset') {
    const icon = ok ? '✓' : '✗';
    const shortAsset = url.replace(/^https?:\/\/[^/]+/, '').slice(0, 48);
    tui.action('research', `${icon} ${shortAsset}`, ok ? '' : detail);
  }
}

async function doPlan(tui, state, prompt, feedback = '', opts = {}) {
  let enrichedPrompt = prompt;

  // Research before the plan. If the brief carries a link, the link *is* the brief, so the
  // site is scraped and its assets probed before a single line of plan is written. The old
  // enrichment did this silently inside planMotionGraphics; here it is visible, and its
  // verified-asset list is what stops the plan promising a logo that will never load.
  //
  // `opts.research` is intake's. When it decided to read the site before planning, the
  // findings arrive already merged into the brief — fetching again would cost the user a
  // second round of network waits for pages that are already in the prompt.
  if (!feedback && opts.research) {
    state.pendingResearch = opts.research;
    const live = opts.research.liveAssets.length;
    const dead = opts.research.deadAssets.length;
    tui.agentHeader();
    tui.ok(
      `Using what I already read — ${opts.research.urls.length} page` +
      `${opts.research.urls.length === 1 ? '' : 's'}, ${live} usable asset${live === 1 ? '' : 's'}` +
      (dead ? `, ${dead} dead and skipped` : '')
    );
    tui.endBlock();
  } else if (!feedback) {
    state.pendingResearch = null;

    if (hasUrl(prompt)) {
      state.abortController = new AbortController();
      tui.agentHeader();
      tui.text('There is a link in that — let me read it before I plan anything.', c.muted);
      tui.startSpinner('researching');

      let research = null;
      try {
        research = await researchBrief(prompt, {
          emit: (ev) => { renderResearch(tui, ev); tui.render(); },
          signal: state.abortController.signal
        });
      } catch (err) {
        // Research is a bonus, never a blocker: a slow CDN must not be the reason a
        // build cannot start.
        tui.fail(`Could not finish reading the site — ${err.message}`);
      } finally {
        tui.stopSpinner();
      }

      if (research) {
        enrichedPrompt += '\n\n' + research.block;
        state.pendingResearch = research;
        const live = research.liveAssets.length;
        const dead = research.deadAssets.length;
        tui.ok(
          `Read ${research.urls.length} page${research.urls.length === 1 ? '' : 's'} — ` +
          `${live} usable asset${live === 1 ? '' : 's'}` + (dead ? `, ${dead} dead and skipped` : '')
        );
      }
      tui.endBlock();
    }

    // Part (b) — clarifications.
    //
    // The old approach gated two questions here (duration, colors) before the plan was
    // written, on the theory that they are necessary and cheaply detectable. But the cost
    // is latency: every build waits for a TUI round-trip even when the brief already gave
    // the answer, and the questions themselves are in English when the user types in Urdu.
    //
    // The smarter path: let the planner run immediately with what it has. If it is missing
    // something it genuinely needs, it asks through ask_user at the exact moment it notices
    // — in the user's own language, with context about why it is asking. The model is better
    // at noticing "this brief has no palette" than a regex is.
  }

  const request = feedback ? `${prompt}\n\nUSER FEEDBACK ON PREVIOUS PLAN: ${feedback}` : enrichedPrompt;

  tui.agentHeader();
  tui.text(feedback ? 'Revising the plan…' : 'Let me plan this first.', c.muted);
  tui.endBlock();

  state.abortController = new AbortController();

  tui.beginRun();
  tui.action('skill', 'saas-explainer-motion', 'Liquid Glass UI · 60fps Motion Engine · Web Audio (Active)');
  tui.action('plan', 'Synthesizing scene beat-sheet, typography & layer choreography');
  tui.startSpinner('planning');
  if (state.thinking !== 'off') tui.thinkStart('reasoning about the composition');

  const contextMessages = [
    ...state.messages,
    { role: 'user', content: request }
  ];

  state.lastBrief = prompt;

  let plan;
  try {
    plan = await planMotionGraphics(contextMessages, {
      model: state.model,
      thinking: state.thinking,
      signal: state.abortController.signal,
      onThinking: (t) => { tui.thinkPush(t); tui.render(); },
      onEvent: (ev) => {
        if (ev.type === 'skill') tui.skill(ev.name, ev.size, ev.chosen === true);
        else renderResearch(tui, ev);
        tui.render();
      }
    });
  } catch (err) {
    tui.thinkEnd();
    tui.stopSpinner(true);
    tui.agentHeader();
    tui.fail(`Planning error: ${err.message}`);
    tui.action('note', 'Type "continue" or "retry" to try generating the plan again.');
    tui.endBlock();
    return;
  } finally {
    tui.thinkEnd();
    tui.stopSpinner();
  }

  // Questions the planner raised for itself. Nothing is gated up front any more — the
  // model plans first and only asks when it hit something it genuinely could not decide,
  // which is why these arrive with a plan attached rather than instead of one.
  //
  // Answering re-plans with the answers folded in; skipping keeps the plan exactly as it
  // is, since the model already chose a defensible default for whatever it asked about.
  const questions = Array.isArray(plan.questions) ? plan.questions.slice(0, 2) : [];
  if (questions.length && !feedback) {
    const ask = makeQuestionAsker(tui, state);
    const answers = [];

    for (const q of questions) {
      if (!q || !q.question) continue;
      const answer = await ask({
        question: q.question,
        context: q.why || '',
        options: Array.isArray(q.options) ? q.options : [],
        allowCustom: true
      });
      if (answer && !answer.cancelled) answers.push(`${q.question} → ${answer.text}`);
    }

    if (answers.length) {
      // Recursed rather than patched: the answer can invalidate scenes, pacing and palette
      // at once, and re-planning is cheaper than reconciling all of that by hand.
      await doPlan(tui, state, prompt,
        `The user answered your questions:\n${answers.map(a => `- ${a}`).join('\n')}\n\nRe-plan with these as firm requirements. Do not ask anything further.`);
      return;
    }
  }

  state.pendingPlan = { plan, prompt };
  tui.planPreview(plan);
  tui.placeholder = 'Type "approve" to build, "no" to cancel, or describe changes';
  tui.hint = 'approve   ·   cancel   ·   or describe changes';
}

async function resolveApproval(tui, state, input) {
  const { plan, prompt } = state.pendingPlan;
  const answer = input.trim().toLowerCase();

  if (/^(no|n|cancel|nahi|nai|rehne do|chhodo|decline)$/i.test(answer)) {
    state.pendingPlan = null;
    clearApprovalMode(tui);
    tui.agentHeader();
    tui.text('Cancelled — nothing was written.', c.muted);
    tui.endBlock();
    return;
  }

  const isApproved = /^(yes|y|ok|okay|go|approve|approved|haan|han|theek|thik|sahi|start|build)$/i.test(answer) || answer === '1';
  if (!isApproved) {
    // Anything else is treated as revision feedback rather than an approval.
    await doPlan(tui, state, prompt, input);
    return;
  }

  // Approved!
  state.pendingPlan = null;
  clearApprovalMode(tui);

  // Set the definitive plan to build
  const optionToBuild = plan.plan || {};
  // include extracted profiles so generateMotionGraphics has them if needed
  optionToBuild.profiles = plan.profiles || [];
  
  await doBuild(tui, state, prompt, plan, optionToBuild);
}

function clearApprovalMode(tui) {
  tui.placeholder = '';
  tui.hint = '';
}

// ---------------------------------------------------------------- building

/**
 * Runs the agent against a project folder.
 *
 * Two things changed here from the old one-shot version:
 *
 *  1. Nothing is written by this function any more. The agent writes through its own
 *     tools, one file at a time, each behind the y/n/a gate. The old loop at the bottom
 *     that dumped `files` to disk and made `.backup-<timestamp>` copies is gone — it was
 *     working around not having an editor, and now there is one.
 *  2. A revision reuses `state.project` instead of calling createProject(). Every "make
 *     scene 2 snappier" used to spawn a whole new folder and regenerate from scratch,
 *     which is why revisions lost work.
 */
async function doBuild(tui, state, prompt, plan, option, opts = {}) {
  const config = loadConfig();
  const hasKey = !!(config.apiKey && config.apiKey !== 'GEMINI_API_KEY_HERE');
  const revising = opts.revise === true && state.project && fs.existsSync(state.project.dir);

  const project = revising
    ? state.project
    : createProject(plan.folder || option.title || prompt, {
        prompt,
        option: option.title,
        model: state.model,
        thinking: state.thinking,
        plan
      });

  state.project = project;
  tui.meta.folder = displayPath(project.dir);

  // On a fresh build, clear todos. On a continuation/revision, preserve existing todos so the agent knows what tasks were in progress.
  if (!revising) {
    state.todos = [];
    tui.setTodos([]);
  } else if (state.todos && state.todos.length) {
    tui.setTodos(state.todos);
  }

  tui.agentHeader();
  if (revising) {
    tui.action('open', displayPath(project.dir), 'editing in place');
  } else {
    tui.action('mkdir', displayPath(project.dir), 'project workspace');
  }
  tui.action('skill', 'saas-explainer-motion', 'Liquid Glass UI · 60fps Motion Engine · Web Audio (Active)');
  tui.text(revising ? `Revising: ${option.title}` : `Building: ${option.title}`, c.white);
  tui.rail();

  if (!hasKey) {
    tui.action('note', 'no API key configured', 'using built-in template');
    const html = createTemplateMotionGraphics(prompt);
    fs.writeFileSync(path.join(project.dir, 'index.html'), html, 'utf-8');
    tui.action('write', displayPath(path.join(project.dir, 'index.html')));
    tui.text('This is the offline template. Set a key with /config apiKey <key> for AI generation.', c.muted);
    tui.endBlock();
    writeMeta(project, { layers: countLayers(html), duration: readDuration(html), usedFallback: true });
    activateProject(state, project);
    return;
  }

  // The chosen option is folded into the prompt so the generator builds what was
  // approved rather than re-interpreting the original one-liner.
  const brief = [
    prompt,
    '',
    revising
      ? 'THIS IS AN INSTRUCTION / CONTINUATION for the existing project in this folder. The files on disk are the authoritative source of truth. Check existing files and open tasks, fulfill the user request above, and use surgical edit_file or continue building as requested.'
      : 'APPROVED PLAN — follow it exactly:',
    `Title: ${option.title}`,
    option.style ? `Style: ${option.style}` : '',
    option.duration ? `Duration: ${option.duration}` : '',
    Array.isArray(option.colors) && option.colors.length ? `Palette: ${option.colors.join(', ')}` : '',
    Array.isArray(option.scenes) && option.scenes.length ? `Scenes:\n- ${option.scenes.join('\n- ')}` : '',
    Array.isArray(option.animations) && option.animations.length ? `Animations: ${option.animations.join(', ')}` : ''
  ].filter(Boolean).join('\n');

  tui.beginRun();
  tui.startSpinner('contacting ' + state.model);
  if (state.thinking !== 'off') tui.thinkStart('designing the composition');

  state.abortController = new AbortController();

  const contextMessages = [
    ...state.messages,
    { role: 'user', content: brief }
  ];

  let result = null;
  let failure = null;

  try {
    result = await generateMotionGraphics(contextMessages, {
      model: state.model,
      thinking: state.thinking,
      approvedPlan: option,
      project,
      todos: state.todos || [],
      configOverrides: { fileApprovalMode: state.fileApprovalMode },
      signal: state.abortController.signal,
      emit: makeEventRenderer(tui, state),
      requestApproval: makeApprovalRequester(tui, state),
      askUser: makeQuestionAsker(tui, state),
      research: state.pendingResearch || null,
      // Lets the engine tell a continuation from a fresh build, so a revision does not
      // re-announce skills it already announced.
      revise: revising,
      onThinking: (t) => { tui.thinkPush(t); tui.render(); }
    });
  } catch (err) {
    failure = err;
  }

  tui.thinkEnd();
  tui.narrateEnd();
  tui.stopSpinner(true);
  state.pendingApproval = null;
  state.pendingQuestion = null;
  clearApprovalMode(tui);

  if (failure) {
    // The loop already emitted a named `error` event for API and network failures, so
    // that detail is in the transcript above. This line stays short and points at the
    // one thing the user cares about next: their partial work is safe.
    const why = failure.explained || describeApiError(failure, state.config || {});
    wrap(`The agent stopped — ${why}`, tui.width - 8).forEach((line, i) => {
      if (i === 0) tui.fail(line);
      else tui.push(c.dim('  │   ') + c.muted(line));
    });
    tui.text('Whatever it had already written is still in the folder — say what to fix and it will pick up from there.', c.muted);
    tui.endBlock();
    // Recorded even though it failed. "continue" only means something if the next turn
    // can see which project was being built and how far it got; returning without this
    // is what made the agent answer "not sure what you meant" in the same session.
    rememberAttempt(state, brief, result, `Stopped before finishing — ${why}. Partial work is in ${displayPath(project.dir)}.`);
    activateProject(state, project);
    notifyEditor(state, 'partial build');
    return;
  }

  const html = (result.files && result.files['index.html']) || '';

  if (!html) {
    // The agent finished without ever writing the entry point. Say so plainly rather
    // than papering over it with the template — the transcript above shows what it did
    // instead, which is more useful than a stock animation.
    tui.fail('The agent finished without writing index.html.');
    tui.text('Say "continue" and it will pick up in the same folder.', c.muted);
    tui.endBlock();
    rememberAttempt(state, brief, result,
      `I did not write index.html in ${displayPath(project.dir)}. The plan above is still the plan — continue from where I stopped and write the composition.`);
    // Activated on purpose: the folder exists and is the subject of the conversation, so
    // the next message has to route to it as a revision rather than to generic chat.
    activateProject(state, project);
    return;
  }

  const layers = countLayers(html);
  const duration = readDuration(html);

  if (result.stopReason === 'turn-limit') {
    tui.action('note', 'hit the step limit', 'say "continue" to let it keep going');
  } else if (result.stopReason === 'aborted') {
    tui.action('note', 'stopped by you');
  }

  tui.ok(`Composition ready — ${layers} animated layers, ${duration}s timeline` +
    (result.toolCalls ? c.dim(`  ·  ${result.toolCalls} tool calls over ${result.turns} steps`) : ''));

  // The editor is a browser tab in another process and has no idea any of this happened.
  notifyEditor(state, `${layers} layers · ${duration}s`);

  // Keep the conversation aware of what happened, so a follow-up like "scene 2 ko
  // smooth karo" lands with the context of what scene 2 currently is.
  rememberAttempt(state, brief, result,
    `Worked in ${displayPath(project.dir)} — ${layers} animated layers, ${duration}s timeline.`);

  const revisions = Array.isArray(project.meta?.revisions) ? project.meta.revisions : [];
  if (revising) revisions.push({ at: new Date().toISOString(), prompt, toolCalls: result.toolCalls });

  writeMeta(project, { layers, duration, usedFallback: false, revisions });
  activateProject(state, project);
  tui.endBlock();

  if (!revising) {
    tui.panel('PROJECT FOLDER', [
      c.white(displayPath(project.dir)),
      c.dim('index.html    the composition'),
      c.dim('exports/      rendered video output'),
      c.dim('project.json  prompt, plan and settings')
    ]);
  }

  // The build used to end by starting a server and throwing a browser tab at the user.
  // It no longer does: the editor is being reworked before it ships, and a finished run
  // should hand back files, not open an unfinished surface. The deliverable is the MP4
  // the agent renders and the folder it wrote — so that is what gets pointed at.
  //
  // Nothing here is removed, only left uncalled: /editor still exists and still works the
  // moment editorEnabled is set, and an editor already running is still told to reload.
  if (editorEnabled()) {
    if (!state.server) {
      doEditor(tui, state);
    } else {
      tui.text('Reload http://localhost:' + state.port + ' to see it.', c.muted);
    }
  } else {
    tui.text('Preview it by opening ' + displayPath(project.htmlFile) + ' in a browser.', c.muted);
  }
}

/**
 * Writes a build attempt into the conversation, whether or not it worked.
 *
 * This is the whole answer to "same session mein context kyun nahi rehta". A build that
 * succeeded used to be recorded and a build that failed used to return early, so the very
 * runs the user was most likely to follow up on — the broken ones — left no trace at all.
 * The next message then reached a model that had never heard of the project.
 *
 * The assistant half is the model's own narration when there is any, because that is the
 * richest account of what it did. `fallback` covers the case where it ended the turn
 * without saying anything, which is exactly the failure mode this is here for.
 */
function getSessionFilePath(projectDir) {
  const dir = projectDir || process.cwd();
  return path.join(dir, '.anymotion', 'session.json');
}

function saveSession(state) {
  try {
    const file = getSessionFilePath(state.project?.dir);
    const logDir = path.dirname(file);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      messages: state.messages || [],
      thinking: state.thinking,
      model: state.model,
      todos: state.todos || [],
      updatedAt: new Date().toISOString()
    }, null, 2), 'utf-8');
  } catch (_) {}
}

function loadSession(state) {
  try {
    const file = getSessionFilePath(state.project?.dir);
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(data.messages) && data.messages.length) {
        state.messages = data.messages;
      }
      if (Array.isArray(data.todos) && data.todos.length && (!state.todos || !state.todos.length)) {
        state.todos = data.todos;
      }
      return true;
    }
  } catch (_) {}
  return false;
}

function rememberAttempt(state, brief, result, fallback) {
  if (result && Array.isArray(result.messages) && result.messages.length > 0) {
    state.messages = result.messages;
  } else {
    state.messages.push({ role: 'user', content: brief });
    state.messages.push({
      role: 'assistant',
      content: (result && result.text && result.text.trim()) || fallback
    });
  }
  if (result && Array.isArray(result.todos) && result.todos.length) {
    state.todos = result.todos;
    if (typeof state.tui?.setTodos === 'function') state.tui.setTodos(result.todos);
  }
  enforceContextLimits(state);
  saveSession(state);
}

/**
 * Points the server and renderer at a project. Both read projectFile/outputDir from
 * the config file on each request, so writing config is what actually switches them.
 */
function activateProject(state, project) {
  state.project = project;
  state.projectActive = true;
  setConfigValue('projectFile', project.htmlFile);
  setConfigValue('outputDir', project.exportsDir);
  loadSession(state);
  notifyEditor(state, 'switched to ' + project.name);
}

/**
 * Pokes the editor's live-reload stream so an open tab refreshes immediately.
 *
 * The server also watches the filesystem, so this is belt and braces — but a recursive
 * fs.watch is unsupported on some platforms, and a build writes several files in a
 * burst where the debounce can land awkwardly. An explicit "I am done" is exact.
 *
 * Deliberately fire-and-forget: the editor may not be running, and a build must never
 * fail because nobody was watching it.
 *
 * With the editor held back there is nothing to poke, and port 3000 on a developer's
 * machine usually belongs to something else — so this stays quiet rather than POSTing
 * a build notification at a stranger's dev server.
 */
function notifyEditor(state, reason) {
  if (!editorEnabled()) return;
  const port = state.port || 3000;
  fetch(`http://localhost:${port}/api/live/reload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
    signal: AbortSignal.timeout(1500)
  }).catch(() => {});
}

// ---------------------------------------------------------------- pickers

function chooseModel(tui, state, arg) {
  if (arg) {
    setModel(tui, state, arg.trim());
    return;
  }
  openChooser(tui, 'select model', AVAILABLE_MODELS.map(m => ({
    name: m.label,
    desc: m.note,
    value: m.id,
    current: m.id === state.model
  })), (pick) => setModel(tui, state, pick.value));
}

function setModel(tui, state, id) {
  state.model = id;
  tui.meta.model = id;
  setConfigValue('model', id);
  tui.agentHeader();
  tui.ok(`Model set to ${id}`);
  const known = AVAILABLE_MODELS.find(m => m.id === id);
  if (!known) tui.text('Not in the built-in list — it will be sent to the endpoint as-is.', c.muted);
  tui.endBlock();
  tui.render();
}

function chooseThinking(tui, state, arg) {
  if (arg) {
    setThinking(tui, state, arg.trim().toLowerCase());
    return;
  }
  const notes = {
    low: 'quick reasoning — fast response',
    medium: 'balanced reasoning',
    high: 'deep reasoning — default',
    xhigh: 'extended reasoning — complex tasks',
    max: 'maximum depth — deepest reasoning'
  };
  openChooser(tui, 'reasoning effort', THINKING_LEVELS.map(l => ({
    name: l,
    desc: notes[l],
    value: l,
    current: l === state.thinking
  })), (pick) => setThinking(tui, state, pick.value));
}

function setThinking(tui, state, level) {
  if (!THINKING_LEVELS.includes(level)) {
    tui.agentHeader();
    tui.fail(`Unknown level "${level}". Use: ${THINKING_LEVELS.join(', ')}`);
    tui.endBlock();
    tui.render();
    return;
  }
  state.thinking = level;
  tui.meta.thinking = level;
  setConfigValue('thinking', level);
  tui.agentHeader();
  tui.ok(`Reasoning effort set to ${level}`);
  tui.endBlock();
  tui.render();
}

// ---------------------------------------------------------------- projects

function doProjects(tui, state) {
  const projects = listProjects();
  tui.agentHeader();
  if (!projects.length) {
    tui.text('No projects yet — describe an animation to create one.', c.muted);
    tui.endBlock();
    return;
  }
  tui.text(`${projects.length} project${projects.length === 1 ? '' : 's'} in ./projects`, c.muted);
  tui.rail();
  projects.forEach(p => {
    const active = state.project && p.dir === state.project.dir;
    tui.push(
      c.dim('  │ ') + (active ? c.ok('● ') : c.dim('○ ')) +
      c.white(p.name.padEnd(28)) + c.dim(displayPath(p.dir))
    );
    if (p.meta.prompt) {
      tui.push(c.dim('  │   ') + c.muted(String(p.meta.prompt).slice(0, 60)));
    }
  });
  tui.rail();
  tui.text('Switch with /open <name>', c.muted);
  tui.endBlock();
}

function doCd(tui, arg) {
  tui.agentHeader();

  if (!arg || !arg.trim()) {
    // No argument — go back to the default.
    setProjectsDir(DEFAULT_PROJECTS_DIR);
    setConfigValue('projectsDir', '');
    tui.ok(`Back to the default folder — ${displayPath(DEFAULT_PROJECTS_DIR)}`);
    tui.endBlock();
    return;
  }

  const target = arg.trim();
  let resolved;
  try {
    resolved = setProjectsDir(target);
  } catch (err) {
    tui.fail(`Cannot use that folder — ${err.message}`);
    tui.endBlock();
    return;
  }

  setConfigValue('projectsDir', resolved);
  tui.ok(`Projects will be created in ${displayPath(resolved)}`);
  tui.text('Saved — this sticks until you /cd again.', c.muted);
  tui.endBlock();
}

function doOpen(tui, state, arg) {
  tui.agentHeader();
  if (!arg) {
    tui.fail('Which project? Use /projects to see the list.');
    tui.endBlock();
    return;
  }
  const project = findProject(arg);
  if (!project) {
    tui.fail(`No project named "${arg}".`);
    tui.endBlock();
    return;
  }
  activateProject(state, project);
  tui.meta.folder = displayPath(project.dir);
  tui.ok(`Switched to ${project.name}`);
  tui.action('folder', displayPath(project.dir));
  tui.endBlock();
}

function doProject(tui, state) {
  tui.agentHeader();
  if (!state.project || !fs.existsSync(state.project.htmlFile)) {
    tui.fail('No active project — describe an animation to create one.');
    tui.endBlock();
    return;
  }

  const html = fs.readFileSync(state.project.htmlFile, 'utf-8');
  const kb = Math.round(fs.statSync(state.project.htmlFile).size / 1024);

  tui.keyValue('project', state.project.name);
  tui.keyValue('folder', displayPath(state.project.dir));
  tui.keyValue('file', displayPath(state.project.htmlFile) + `  (${kb} KB)`);
  tui.rail();
  tui.keyValue('duration', readDuration(html) + 's');
  tui.keyValue('layers', String(countLayers(html)));
  tui.keyValue('scenes', String(countMatches(html, /class="[^"]*scene-container/g)));

  const names = [...html.matchAll(/data-layer="([^"]+)"/g)].map(m => m[1]).slice(0, 8);
  if (names.length) {
    tui.rail();
    names.forEach(n => tui.push(c.dim('  │ ') + c.accent('• ') + c.white(n)));
  }
  tui.endBlock();
}

// ---------------------------------------------------------------- editor / render

async function doEditor(tui, state) {
  tui.agentHeader();

  // The editor is still in the tree and still works — it is simply not part of what this
  // build ships. Everything below this guard is untouched, so flipping editorEnabled
  // restores the old behaviour exactly, with no code to put back.
  if (!editorEnabled()) {
    tui.fail('The web editor is not part of this build yet.');
    tui.text('It is being reworked before release. Renders and previews do not need it —', c.muted);
    tui.text('/render exports the MP4, and index.html opens straight in a browser.', c.muted);
    tui.text('To run it anyway: /config editorEnabled true', c.dim);
    tui.endBlock();
    return;
  }

  if (state.server) {
    tui.ok('Editor already running');
    tui.endBlock();
    tui.panel('LIVE EDITOR', [c.white('http://localhost:' + state.port)]);
    return;
  }

  if (!state.project) {
    tui.fail('No project to edit yet — describe an animation first.');
    tui.endBlock();
    return;
  }

  tui.action('start', 'web editor', `port ${state.port}`);
  tui.action('serving', displayPath(state.project.htmlFile));
  try {
    state.server = await startWebServer({ port: state.port });
  } catch (err) {
    tui.fail(`Could not start server: ${err.message}`);
    tui.endBlock();
    return;
  }

  if (state.server && state.server.alreadyRunning) {
    tui.ok('Editor already running — reusing port ' + state.port);
  } else {
    tui.meta.serving = true;
    tui.ok('Server is live');
  }
  tui.endBlock();

  tui.panel('LIVE EDITOR', [
    c.white('http://localhost:' + state.port),
    c.dim('Edits save back into ' + displayPath(state.project.dir))
  ]);

  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start ""'
      : 'xdg-open';
  import('child_process').then(({ exec }) => {
    exec(`${opener} http://localhost:${state.port}`, () => {});
  });
}

async function doRender(tui, state, arg) {
  const config = loadConfig();
  const resolution = (arg || config.defaultResolution || '1080p').toLowerCase();
  const fps = config.fps || 60;

  tui.agentHeader();
  if (!state.project || !fs.existsSync(state.project.htmlFile)) {
    tui.fail('No project to render — describe an animation first.');
    tui.endBlock();
    return;
  }

  tui.action('render', `${resolution} @ ${fps}fps`, 'puppeteer + ffmpeg');
  tui.action('output', displayPath(state.project.exportsDir));
  tui.startSpinner('capturing frames — this can take a few minutes');

  try {
    const outputPath = await renderVideo({
      resolution,
      fps,
      htmlFile: state.project.htmlFile,
      outputDir: state.project.exportsDir
    });
    tui.stopSpinner();
    const filename = path.basename(outputPath);
    const mb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);
    tui.action('write', displayPath(outputPath), `${mb} MB`);
    tui.ok('Render complete');
    tui.endBlock();

    const rows = [c.white(filename), c.dim(displayPath(state.project.exportsDir))];
    if (state.server) rows.push(c.dim(`http://localhost:${state.port}/exports/${filename}`));
    tui.panel('EXPORTED VIDEO', rows);

    // The renderer captures page frames only; audio added in the editor is never mixed
    // into the file. Saying so here avoids a silent surprise on playback.
    tui.text('Note: exported video is silent — timeline music and SFX are preview-only.', c.muted);
  } catch (err) {
    tui.stopSpinner();
    tui.fail(`Render failed: ${err.message}`);
    tui.endBlock();
  }
}

// ---------------------------------------------------------------- misc

function showHelp(tui) {
  tui.agentHeader();
  tui.text('Ask a question, or describe an animation and I will plan it first.', c.muted);
  tui.rail();
  visibleCommands().forEach(cmd => {
    const left = `${cmd.name} ${cmd.args}`.trim();
    tui.push(c.dim('  │ ') + c.accent(left.padEnd(26)) + c.muted(cmd.desc));
  });
  tui.rail();
  tui.push(c.dim('  │ ') + c.muted('keys      ') +
    c.dim('tab complete · ↑ history · ctrl+l clear · ctrl+c exit'));
  tui.push(c.dim('  │ ') + c.muted('scroll    ') +
    c.dim('wheel or shift+↑↓ · pgup/pgdn by page · ctrl+end latest · ctrl+home top'));
  tui.endBlock();
}

/**
 * Controls the real approval gate in agent-loop.js.
 *
 * The old version accepted a third mode, "always", and none of the three did what the
 * name said: nothing was ever asked, and "manual" merely copied the old file to
 * `.backup-<timestamp>` after the fact. There are two honest states now — ask, or don't.
 */
function doApprove(tui, state, arg) {
  tui.agentHeader();
  const mode = (arg || '').trim().toLowerCase();

  if (mode === 'manual' || mode === 'auto') {
    state.fileApprovalMode = mode;
    setConfigValue('fileApprovalMode', mode);
    tui.ok(`Approval mode: ${mode}`);
    tui.text(mode === 'manual'
      ? 'Every write, edit, download and terminal command stops for y / n / a first.'
      : 'The agent writes, edits and runs commands without stopping to ask.', c.muted);
  } else {
    tui.keyValue('mode', state.fileApprovalMode || 'manual');
    tui.rail();
    tui.text('manual   ask before every write, edit, download or command', c.muted);
    tui.text('auto     let the agent work without interruption', c.muted);
    tui.rail();
    tui.text('Reading files, searching and screenshotting never ask — they change nothing.', c.dim);
    tui.text('Usage: /approve <manual|auto>', c.muted);
  }
  tui.endBlock();
}

function doTools(tui) {
  tui.agentHeader();
  tui.text('What the agent can do on its own:', c.white);
  describeTools().forEach(group => {
    tui.rail();
    tui.push(c.dim('  │ ') + c.accent(group.title.toUpperCase()));
    group.tools.forEach(t => {
      const gate = t.mutates ? c.warn(' ⚑') : '  ';
      tui.push(c.dim('  │ ') + gate + ' ' + c.white(t.name.padEnd(20)) + c.muted(t.summary));
    });
  });
  tui.rail();
  tui.text('⚑ stops for approval in manual mode.', c.dim);
  tui.endBlock();
}

/**
 * The user-facing half of skill discovery.
 *
 * `/tools` answers "what can the agent do"; this answers "what does it know". Both matter
 * for the same reason: the agent's output is only as good as the guidance behind it, and
 * until now there was no way to find out which references were actually on this machine —
 * a skill dropped into ~/.anymotion/skills was indistinguishable from one that never
 * installed. The search path is printed for that case specifically.
 */
const AUTOLOADED_SKILLS = new Set([
  'saas-explainer-motion',
  'motion-graphics',
  'motion-audio',
  'css-animations'
]);

function doSkills(tui) {
  tui.agentHeader();
  const skills = listSkills();

  if (!skills.length) {
    tui.fail('No skills found on this machine.');
    tui.text('Looked in:', c.muted);
    skillSearchRoots().forEach(r => tui.push(c.dim('  │ ') + c.muted(displayPath(r))));
    tui.endBlock();
    return;
  }

  const auto = skills.filter(s => AUTOLOADED_SKILLS.has(s.name));
  const rest = skills.filter(s => !AUTOLOADED_SKILLS.has(s.name));
  const kb = skills.reduce((sum, s) => sum + s.size, 0);

  tui.text(`${skills.length} skills on this machine (${kb}KB of craft guidance):`, c.white);

  // One line per skill: a description that wrapped would push the list past a screenful
  // and bury the names, which are the part being looked for.
  const row = (s, mark) => {
    const desc = s.description || '(no description)';
    const parts = wrap(desc, 46);
    const first = parts[0] + (parts.length > 1 ? '…' : '');
    tui.push(c.dim('  │ ') + mark + ' ' + c.white(s.name.padEnd(24)) +
      c.dim(`${String(s.size).padStart(4)}KB  `) + c.muted(first));
  };

  if (auto.length) {
    tui.rail();
    tui.push(c.dim('  │ ') + c.accent('ALWAYS LOADED') + c.dim('  — in the system prompt from the start'));
    auto.forEach(s => row(s, c.ok('●')));
  }

  if (rest.length) {
    tui.rail();
    tui.push(c.dim('  │ ') + c.accent('ON DEMAND') + c.dim('  — the agent reads these itself when a job needs them'));
    rest.forEach(s => row(s, c.dim('○')));
  }

  tui.rail();
  tui.text('The agent picks these on its own — no command needed.', c.dim);
  tui.endBlock();
}

function doTodo(tui, state) {
  tui.agentHeader();
  if (!state.todos || !state.todos.length) {
    tui.text('No task list yet — it appears once the agent starts planning a build.', c.muted);
    tui.endBlock();
    return;
  }
  // The list is already pinned above the composer, so there is nothing to "show" — the
  // only useful thing this command can do is take it down once it has been read.
  const done = state.todos.filter(t => t.status === 'done').length;
  const total = state.todos.length;
  state.todos = [];
  tui.setTodos([]);
  tui.text(`Task list cleared (${done}/${total} done).`, c.muted);
  tui.endBlock();
}

/**
 * Runs the same two checks the agent runs on itself, on demand.
 *
 * Worth having separately from a build: it is the fastest way to find out whether a
 * composition you edited by hand in the web editor still seeks deterministically.
 */
async function doVerify(tui, state) {
  tui.agentHeader();
  if (!state.project || !fs.existsSync(state.project.htmlFile)) {
    tui.fail('No active project to verify.');
    tui.endBlock();
    return;
  }

  tui.startSpinner('auditing the composition');
  const ctx = { project: state.project, config: loadConfig(), emit: () => {} };

  try {
    const audit = await dispatch('check_composition', {}, ctx);
    tui.stopSpinner();
    tui.toolStart('CheckComposition()');
    tui.toolResult(audit.summary, audit.isError);
    String(audit.content).split('\n').forEach(line => {
      if (line.trim()) tui.push(c.dim('  │ ') + c.muted(line));
    });

    tui.startSpinner('capturing frames');
    const shots = await dispatch('preview_frames', {}, ctx);
    tui.stopSpinner();
    tui.toolStart('PreviewFrames()');
    tui.toolResult(shots.summary, shots.isError);
    // The images went to the model during a build; here there is nobody to show them
    // to, so report the capture and point at where the pixels actually are.
    tui.text(editorEnabled()
      ? 'Open the editor to scrub the timeline yourself: /editor'
      : 'Open index.html in a browser to scrub the timeline yourself.', c.muted);
  } catch (err) {
    tui.stopSpinner();
    tui.fail(err.message);
  }

  tui.endBlock();
}

function doConfig(tui, rest) {
  const [key, ...valueParts] = rest;
  const value = valueParts.join(' ');
  const config = loadConfig();

  tui.agentHeader();

  if (!key) {
    const hidden = new Set(['apiKey']);
    Object.entries(config).forEach(([k, v]) => {
      const shown = hidden.has(k) && v ? String(v).slice(0, 6) + '••••••' : String(v);
      tui.keyValue(k, shown);
    });
    tui.rail();
    tui.text('Change one with: /config <key> <value>', c.muted);
    tui.endBlock();
    return;
  }

  if (!value) {
    const v = config[key];
    tui.keyValue(key, v === undefined ? '(not set)' : String(v));
    tui.endBlock();
    return;
  }

  try {
    setConfigValue(key, value);
    tui.ok(`${key} = ${key === 'apiKey' ? value.slice(0, 6) + '••••••' : value}`);

    // Switching provider while apiEndpoint still points at the old one sends the new key
    // to the old host, which comes back as a 401 that looks like a bad key. resolveBaseUrl
    // now ignores another provider's host, but clearing it here keeps /config honest about
    // where requests actually go.
    if (key === 'provider') {
      const endpoint = resolveBaseUrl({ ...config, provider: value, apiEndpoint: '' });
      if ((config.apiEndpoint || '').trim().replace(/\/$/, '') !== endpoint) {
        setConfigValue('apiEndpoint', endpoint);
        tui.ok(`apiEndpoint = ${endpoint}`);
      }
      if (!config.apiKey) tui.text('Set the key for this provider with: /config apiKey <key>', c.muted);
    }
  } catch (err) {
    tui.fail(err.message);
  }
  tui.endBlock();
}

/**
 * The server and renderer write to stdout directly. Inside the alternate screen that
 * would land mid-frame, so their output is routed into the transcript instead.
 */
function installConsoleBridge(tui) {
  const sink = (colorFn) => (...args) => {
    const text = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ').trim();
    if (!text) return;
    text.split('\n').forEach(l => tui.push(c.dim('  │ ') + colorFn(l)));
    if (!tui.busy) tui.render();
  };
  console.log = sink(c.muted);
  console.info = sink(c.muted);
  console.warn = sink(c.warn);
  console.error = sink(c.err);
}

function countMatches(text, regex) {
  const m = text.match(regex);
  return m ? m.length : 0;
}

function countLayers(html) {
  return countMatches(html, /data-anim=/g);
}

function readDuration(html) {
  const m = html.match(/window\.DURATION\s*=\s*([\d.]+)/);
  return m ? m[1] : '10.0';
}
