/**
 * ANYMOTION TUI RENDERER
 * A full-screen terminal interface built on raw ANSI — no TUI dependency.
 *
 * Layout, composed bottom-up so the composer stays pinned to the last rows:
 *
 *   ┌ header ────────────────────────────────┐  brand + model + editor state
 *   │ transcript (scrollable, rail gutter)   │
 *   │ ...                                    │
 *   │ [slash-command popup, when typing "/"] │
 *   │ ╭ composer ────────────────────────╮   │  bordered input, live cursor
 *   └ hint bar ──────────────────────────────┘  key hints + status
 *
 * The whole frame is repainted on every change. At this size a full repaint is
 * cheaper to reason about than diffing, and it removes a whole class of stale-cell
 * bugs when lines re-wrap on resize.
 */

import chalk from 'chalk';

const ESC = String.fromCharCode(27);
const CSI = ESC + '[';

// Matches ANSI SGR colour codes. Built from a string so the ESC byte is explicit:
// a pattern missing it would leave a stray character per code and skew every border.
const ANSI_PATTERN = new RegExp(ESC + '\\[[0-9;]*m', 'g');

export const BRAND = '#00cbd6';
export const ACCENT = '#818cf8';

export const c = {
  brand: chalk.hex(BRAND),
  brandBold: chalk.bold.hex(BRAND),
  accent: chalk.hex(ACCENT),
  dim: chalk.dim,
  white: chalk.white,
  ok: chalk.hex('#22c55e'),
  warn: chalk.hex('#f59e0b'),
  err: chalk.hex('#ef4444'),
  muted: chalk.hex('#71717a')
};

export function visibleLength(str) {
  return String(str).replace(ANSI_PATTERN, '').length;
}

/** Truncate to a visible width while preserving colour codes already emitted. */
export function truncate(str, width) {
  if (visibleLength(str) <= width) return str;
  let out = '';
  let seen = 0;
  let i = 0;
  const s = String(str);
  while (i < s.length && seen < width) {
    if (s[i] === ESC) {
      const end = s.indexOf('m', i);
      if (end === -1) break;
      out += s.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    out += s[i];
    seen++;
    i++;
  }
  // A cut can land between a colour code and its reset, so an explicit reset is
  // appended — otherwise the colour bleeds into every row drawn below it.
  return out + ESC + '[0m';
}

export function padRight(str, width) {
  const len = visibleLength(str);
  if (len >= width) return truncate(str, width);
  return str + ' '.repeat(width - len);
}

export function wrap(text, width) {
  const out = [];
  String(text).split('\n').forEach(paragraph => {
    if (!paragraph.trim()) { out.push(''); return; }
    let cur = '';
    paragraph.split(/\s+/).forEach(word => {
      if (!cur.length) { cur = word; return; }
      if ((cur + ' ' + word).length > width) { out.push(cur); cur = word; }
      else cur += ' ' + word;
    });
    if (cur) out.push(cur);
  });
  return out;
}

const RAIL = '│';

/** Guards chalk.hex against model-supplied palette strings that are not real hex. */
function safeHex(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value).trim()) ? String(value).trim() : '#888888';
}

/** `10s`, `3m 59s` — the elapsed counter next to the spinner. */
function formatElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

/** `842`, `7.0k`, `23.6k` — token counts stay one glance wide. */
function formatTokens(n) {
  if (n < 1000) return String(n);
  return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
}

/**
 * How each tool reads in the live activity line.
 *
 * `[present, past, noun]` — "reading 3 files" while it runs, "read 3 files" once it is
 * done. Aggregating by category is what keeps a 40-tool build legible: the transcript
 * still gets a line per call, but the status line says "reading 3 files" rather than
 * flickering through three filenames too fast to read.
 */
const TOOL_VERBS = {
  read_file:         ['reading', 'read', 'file'],
  list_dir:          ['listing', 'listed', 'directory'],
  grep_files:        ['searching', 'searched', 'pattern'],
  write_file:        ['writing', 'wrote', 'file'],
  edit_file:         ['editing', 'edited', 'file'],
  fetch_page:        ['researching', 'researched', 'page'],
  web_search:        ['searching the web', 'searched the web', 'query'],
  download_asset:    ['downloading', 'downloaded', 'asset'],
  make_placeholder:  ['drawing', 'drew', 'placeholder'],
  run_command:       ['running', 'ran', 'shell command'],
  preview_frames:    ['capturing', 'captured', 'frame'],
  check_composition: ['auditing', 'audited', 'composition'],
  list_sfx:          ['browsing', 'browsed', 'sound library'],
  add_sfx:           ['adding', 'added', 'sound'],
  render_video:      ['rendering', 'rendered', 'video'],
  update_todos:      ['planning', 'planned', 'step'],
  ask_user:          ['asking', 'asked', 'question']
};

/**
 * One animation per kind of work.
 *
 * A single spinner that looks identical for every state tells you only that something is
 * happening. These say *what* — a quadrant arc traces while it reasons, a clock hand
 * sweeps while it plans, a disc fills while it reads a page. All single-width box-drawing
 * and geometric glyphs, so nothing shifts the column the label sits in.
 */
const SPINNERS = {
  // A half-filled disc rolling through its four quarter-turns. The filled half is what
  // carries the motion — the glyph itself never changes size or column, so the circle
  // reads as one object rotating in place rather than four shapes taking turns.
  // Each quarter is held for 3 ticks (270ms): a full revolution takes just over a second,
  // which is an unhurried turn rather than a spin.
  thinking:    ['◐', '◐', '◐',
                '◓', '◓', '◓',
                '◑', '◑', '◑',
                '◒', '◒', '◒'],
  planning:    ['◴', '◷', '◶', '◵'],
  researching: ['◐', '◓', '◑', '◒'],
  rendering:   ['◢', '◣', '◤', '◥'],
  composing:   ['◰', '◳', '◲', '◱'],
  working:     ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
};

/**
 * Fills and empties the active task's square, so the current step is obvious at a glance.
 * Deliberately drawn from the same U+25A0 block as the ■/□ already used here — mixing in
 * a glyph from another block risks a different advance width and a column that jitters.
 */
const TODO_PULSE = ['□', '▣', '■', '▣'];

/** Pluralises the noun in "reading 3 files" without a dependency. */
function pluralise(noun, n) {
  if (n === 1) return noun;
  if (/y$/.test(noun)) return noun.replace(/y$/, 'ies');
  if (/(s|sh|ch|x)$/.test(noun)) return noun + 'es';
  return noun + 's';
}

/** Shown under the spinner, rotating, so long waits teach something. */
const TIPS = [
  'Press ctrl+c once to abort, twice to quit.',
  'Type /verify any time to audit the composition and screenshot it.',
  '/approve auto lets the agent work without stopping to ask.',
  'A message while a project is open edits that project — /build starts a new one.',
  '/tools shows everything the agent can reach on its own.',
  'Paste a URL in your brief and the agent pulls that brand\'s colours and fonts.',
  'shift+↑ / pgup scrolls the transcript without losing your draft.',
  '/think max gives the agent the largest reasoning budget.'
];

/**
 * Status verbs that rotate when the spinner runs, so the label reads as something alive
 * rather than a stuck process. Two banks: conversational (planning, chat) and project
 * (actual composition work). Each word is held for ~3 seconds (30 spinner ticks at 90ms).
 */
const STATUS_VERBS = {
  conversational: ['Reasoning', 'Analyzing', 'Responding', 'Understanding', 'Imagining', 'Brainstorming'],
  project: ['Animating', 'Morphing', 'Composing', 'Generating', 'Enhancing', 'Visualizing']
};

const VERB_HOLD_TICKS = 30;  // ~3 seconds per word

export class Tui {
  constructor(meta = {}) {
    this.lines = [];          // rendered transcript lines, ANSI included
    this.input = '';
    this.cursor = 0;          // caret index within input
    this.scroll = 0;          // rows scrolled up from the bottom
    this.popup = [];          // suggestion / picker rows
    this.popupIndex = 0;
    this.popupTitle = '';
    this.popupMode = 'command'; // 'command' completes text, 'select' invokes onPick
    this.onPick = null;
    this.status = '';         // transient right-hand status (streaming, rendering)
    this.busy = false;
    this.meta = meta;         // { model, thinking, project, folder, port, serving }
    this.spinnerState = 'default';
    this.spinnerIndex = 0;
    this.spinnerTimer = null;
    this.thinkAnchor = -1;    // transcript index where the live thinking block starts
    this.thinkBuf = '';
    this.todos = [];          // live task list from the agent's update_todos tool
    this.narrateAnchor = -1;  // transcript index where streaming prose is redrawn
    this.narrateBuf = '';
    this.approval = null;     // { title, lines, diff, options, index } while awaiting a verdict
    this.approvalAnchor = -1; // transcript index where the approval box is redrawn
    this.placeholder = '';    // composer hint text, swapped per mode (chat / approval)
    this.hint = '';           // overrides the key hints in the bottom bar
    this.startTime = 0;       // when the current run began, for the elapsed counter
    this.tokensIn = 0;        // usage totals for the run, shown next to the spinner
    this.tokensOut = 0;
    this.activity = new Map();// live tool tally: verb → count, for the aggregate line
    this.activityTarget = ''; // most recent thing acted on, shown under the aggregate
    this.tipIndex = 0;
    this.verbBank = null;     // 'conversational' | 'project' — null means show status verbatim
    this.verbIndex = 0;       // which word from the bank is currently showing
    this.realThinking = false;// true once actual reasoning tokens arrive — freezes the label
    this.thinkElapsed = 0;    // seconds the last reasoning block ran, for "thought for Ns"
  }

  get width() { return Math.max(40, process.stdout.columns || 80); }
  get height() { return Math.max(12, process.stdout.rows || 24); }

  // ---- screen lifecycle -------------------------------------------------

  enter() {
    // Alternate buffer keeps the user's existing scrollback intact on exit.
    process.stdout.write(CSI + '?1049h');
    process.stdout.write(CSI + '?25l');
    // Mouse reporting, so the wheel scrolls the transcript.
    //
    // The alternate buffer has no scrollback of its own, so without this the wheel has
    // nothing to act on and the terminal simply swallows it — which is why scrolling
    // appeared to do nothing at all. 1000h is button-and-wheel only (not 1003h, which
    // reports every pixel of motion and would flood stdin for no benefit); 1006h asks
    // for SGR-encoded reports, which stay correct past column 223.
    process.stdout.write(CSI + '?1000h');
    process.stdout.write(CSI + '?1006h');
    // Bracketed paste. The terminal fences pasted text between \x1b[200~ and \x1b[201~,
    // which turns "was that a paste or a keystroke?" from a timing guess into a fact —
    // so a pasted newline lands in the composer instead of submitting the message.
    process.stdout.write(CSI + '?2004h');
    this.onResize = () => this.render();
    process.stdout.on('resize', this.onResize);
  }

  leave() {
    this.stopSpinner();
    if (this.onResize) process.stdout.off('resize', this.onResize);
    // Released in the reverse order it was taken, and before the buffer switch — a
    // terminal left in mouse-reporting mode spews escape sequences into the user's shell.
    process.stdout.write(CSI + '?2004l');
    process.stdout.write(CSI + '?1006l');
    process.stdout.write(CSI + '?1000l');
    process.stdout.write(CSI + '?25h');
    process.stdout.write(CSI + '?1049l');
  }

  // ---- transcript -------------------------------------------------------

  /**
   * Appends a rendered line to the transcript.
   *
   * Scroll handling is the whole subtlety here. `scroll` counts rows up from the bottom, so
   * a line appended at the bottom shifts every visible row up by one — meaning a reader who
   * has scrolled back sees the text creep downward out of the window on every single push.
   * During a build that is hundreds of pushes, which is why scrolling up mid-run used to be
   * impossible: the old code reset `scroll` to 0 on every push and yanked you to the tail.
   *
   * Incrementing `scroll` in step with the append keeps the viewport anchored on the same
   * text while output streams in underneath. At the tail (`scroll === 0`) nothing is done,
   * so the live view still follows the agent by default.
   */
  push(line = '') {
    this.lines.push(line);
    if (this.scroll > 0) this.scroll++;
  }

  /** Jump back to the live tail. Bound to `end` and used whenever the user submits. */
  scrollToBottom() {
    this.scroll = 0;
  }

  /** True when the transcript is scrolled off the tail, so render() can badge it. */
  get isScrolledBack() {
    return this.scroll > 0;
  }

  /** Body text hanging off the rail gutter. */
  text(str, colorFn = c.white) {
    wrap(str, this.width - 8).forEach(l => {
      this.push(c.dim('  ' + RAIL + ' ') + colorFn(l));
    });
  }

  rail() { this.push(c.dim('  ' + RAIL)); }

  userLine(str) {
    this.push('');
    wrap(str, this.width - 8).forEach((l, i) => {
      this.push((i === 0 ? c.accent('  ❯ ') : '    ') + chalk.bold.white(l));
    });
  }

  agentHeader(label = 'anymotion') {
    this.push('');
    this.push(c.brandBold('  ◆ ') + c.brandBold(label));
  }

  action(verb, target, note = '') {
    this.push(
      c.dim('  ' + RAIL + ' ') + c.accent(String(verb).padEnd(8)) +
      c.white(target) + (note ? c.dim('  ' + note) : '')
    );
  }

  ok(msg) { this.push(c.dim('  ' + RAIL + ' ') + c.ok('✔ ') + c.white(msg)); }
  fail(msg) { this.push(c.dim('  ' + RAIL + ' ') + c.err('✘ ') + c.white(msg)); }

  keyValue(key, value) {
    this.push(c.dim('  ' + RAIL + ' ') + c.muted(String(key).padEnd(18)) + c.white(value));
  }

  endBlock() {
    this.push(c.dim('  └' + '─'.repeat(Math.max(4, Math.min(this.width - 6, 60)))));
  }

  /** Framed callout for results worth pulling out of the flow. */
  panel(title, rows) {
    const inner = Math.min(this.width - 6, 66);
    this.push('');
    this.push(
      c.brand('  ╭─ ') + c.brandBold(title) + ' ' +
      c.brand('─'.repeat(Math.max(0, inner - visibleLength(title) - 4))) + c.brand('╮')
    );
    rows.forEach(row => {
      const pad = Math.max(0, inner - visibleLength(row) - 1);
      this.push(c.brand('  │ ') + row + ' '.repeat(pad) + c.brand('│'));
    });
    this.push(c.brand('  ╰' + '─'.repeat(inner) + '╯'));
  }

  // ---- thinking ---------------------------------------------------------

  /**
   * Opens a live reasoning block. The transcript is truncated back to the anchor on
   * every update, so the block grows in place instead of leaving a trail of partial
   * renders behind it.
   */
  thinkStart(label = 'thinking') {
    this.thinkAnchor = this.lines.length;
    this.thinkBuf = '';
    this.thinkLabel = label;
    this.thinkStartTime = null;
    this.thinkScroll = 0;
    this.repaintThinking();
  }

  /**
   * Swaps the label on the live reasoning block ("thinking" → "planning scenes").
   * Distinct from setStatus, which drives the spinner text in the bottom bar.
   */
  setThinkingLabel(label) {
    if (this.thinkAnchor === -1) {
      this.thinkStart(label);
    } else {
      this.thinkLabel = label;
      this.repaintThinking();
    }
  }

  thinkPush(chunk) {
    if (this.thinkAnchor === -1) this.thinkStart();
    if (!this.thinkStartTime) this.thinkStartTime = Date.now();

    // First real reasoning token: stop guessing at a verb and say what is happening. The
    // rotation exists to cover an unknown wait; this is no longer unknown.
    if (!this.realThinking) {
      this.realThinking = true;
      this.spinnerState = 'thinking';
    }

    this.thinkBuf += chunk;
    this.repaintThinking();
  }

  repaintThinking() {
    if (this.thinkAnchor === -1) return;
    this.lines.length = this.thinkAnchor;

    // Nothing is drawn into the transcript while reasoning is live. The streamed text now
    // renders inside the status block, directly under the spinner — reading order should
    // follow the thing that is moving, and the spinner sits at the bottom of the frame, so
    // text placed above it meant the answer appeared before the question. thinkEnd() still
    // leaves its "Thought for Ns" receipt behind at this anchor.
  }

  /**
   * The live reasoning tail, as rows for the status block.
   *
   * Four lines, scrolled one row at a time rather than re-sliced to the tail on every
   * repaint. Jumping straight to the last four lines meant that when a burst of tokens
   * arrived the whole block changed at once and nothing could be read; advancing by a
   * single row per frame lets the top line retire while the new one arrives underneath,
   * which is the movement the eye can actually follow.
   *
   * The block is padded to a constant four rows so the composer below it never shifts,
   * and the row about to leave is drawn dimmer than the rest — it is on its way out, and
   * showing that is what makes the movement read as scrolling rather than replacement.
   */
  thinkingRows() {
    if (this.thinkAnchor === -1 || !this.thinkBuf) return [];

    const WINDOW = 4;
    const all = wrap(this.thinkBuf.replace(/\s+/g, ' ').trim(), this.width - 12);

    // One row per frame, no matter how far behind the window has fallen. A long pause
    // followed by a flood of text still scrolls at a readable pace.
    const target = Math.max(0, all.length - WINDOW);
    if (this.thinkScroll < target) this.thinkScroll++;
    else if (this.thinkScroll > target) this.thinkScroll = target;

    const window = all.slice(this.thinkScroll, this.thinkScroll + WINDOW);
    const rows = window.map((l, i) => {
      // The top row only fades once there is something above it to have scrolled past —
      // otherwise the very first line of a thought would appear half-erased.
      const leaving = i === 0 && this.thinkScroll > 0;
      return c.dim('    ╎ ') + chalk.italic(leaving ? c.dim(l) : c.muted(l));
    });
    while (rows.length < WINDOW) rows.push('');
    return rows;
  }

  /**
   * Closes the live reasoning block.
   *
   * The streamed text goes, but a one-line receipt stays: "✻ Thought for 6s". Wiping the
   * block entirely made a long reasoning pause look like nothing had happened, which is
   * exactly the wait the user most wants accounted for. Blocks that produced no reasoning
   * leave nothing behind — there is nothing to account for.
   */
  thinkEnd() {
    if (this.thinkAnchor === -1) return;

    const secs = this.thinkStartTime
      ? Math.max(1, Math.round((Date.now() - this.thinkStartTime) / 1000))
      : 0;

    this.lines.length = this.thinkAnchor;
    this.thinkAnchor = -1;
    this.thinkBuf = '';
    this.thinkStartTime = null;
    this.thinkScroll = 0;
    this.realThinking = false;

    if (secs) {
      this.thinkElapsed = secs;
      this.push('');
      this.push(c.muted('  ✻ ') + chalk.italic(c.muted(`Thought for ${secs}s`)));
    }
  }

  // ---- agent activity ---------------------------------------------------
  //
  // These four render the loop's events. The old UI collapsed all of this into a
  // spinner label reading "composing styles · 12,345 chars", which told the user
  // nothing about what the agent had actually accomplished. Now every tool call gets
  // a line, every result gets a summary under it, and the agent's own narration lands
  // between them in full.

  /**
   * A skill entering context.
   *
   * Two different things used to print this identical line. The agent calling load_skill
   * because the job turned out to need sound design is a decision worth seeing. The two
   * skills the prompt inlines on every single run are not — they are fixed furniture, and
   * dressing them as "Analyzing" made the agent look like it was choosing when it wasn't.
   * So the chosen one keeps the announcement, and the automatic ones say what they are.
   */
  skill(name, size, chosen = false) {
    this.thinkEnd();
    this.narrateEnd();
    const label = chosen ? 'Analyzing skill: ' : 'Skill loaded: ';
    const mark = chosen ? c.brandBold('◆ ') : c.dim('◇ ');
    const shown = chosen ? c.white(name) : c.muted(name);
    this.push(c.dim('  ' + RAIL + ' ') + mark + (chosen ? c.accent(label) : c.muted(label)) + shown + c.dim(` (${size}KB)`));
  }

  /**
   * A tool call starting. Returns the transcript index of the line so toolResult can
   * attach its summary underneath even if prose arrived in between.
   */
  toolStart(label) {
    this.thinkEnd();
    this.narrateEnd();
    // ● (U+25CF) rather than ⏺ (U+23FA): the latter is in an emoji-adjacent block, so most
    // terminals render it from a fallback font as a squashed oval at the wrong baseline.
    this.push(c.dim('  ' + RAIL + ' ') + c.brandBold('● ') + c.white(label));
    return this.lines.length - 1;
  }

  /** The `⎿ 412 lines` line under a tool call. */
  toolResult(summary, isError = false) {
    wrap(String(summary), this.width - 14).forEach((l, i) => {
      this.push(
        c.dim('  ' + RAIL + '   ') +
        (i === 0 ? (isError ? c.err('⎿ ') : c.dim('⎿ ')) : '  ') +
        (isError ? c.err(l) : c.muted(l))
      );
    });
  }

  /** Unified diff rows from fs-tools' buildDiff. */
  diff(rows) {
    rows.forEach(r => {
      const paint = r.sign === '+' ? c.ok : r.sign === '-' ? c.err : c.muted;
      this.push(c.dim('  ' + RAIL + '   ') + paint(r.sign + ' ' + truncate(r.text, this.width - 14)));
    });
  }

  /**
   * Numbered source preview under a write, capped with `… +N lines`.
   *
   * A summary reading "wrote 412 lines" is a receipt, not evidence — it tells the user
   * something happened but not whether it was the right something. A dozen real lines
   * is usually enough to recognise the shape of what landed.
   *
   * `total` is the file's real line count, which is normally larger than what was
   * passed in: the tool only ships the head of the file to keep the event small.
   */
  codePreview(text, total = 0) {
    const shown = String(text).split('\n');
    const numW = String(shown.length).length;
    shown.forEach((line, i) => {
      this.push(
        c.dim('  ' + RAIL + '     ') +
        c.dim(String(i + 1).padStart(numW)) + ' ' +
        c.muted(truncate(line.replace(/\t/g, '  '), this.width - 16))
      );
    });
    const rest = Math.max(0, total - shown.length);
    if (rest) this.push(c.dim('  ' + RAIL + '     ') + c.dim(`… +${rest} lines`));
  }

  // ---- live activity ----------------------------------------------------
  //
  // The transcript keeps a line per tool call, which is the record. This is the other
  // half: a single rolling sentence in the status bar that says what is happening
  // *right now* across every call in flight — "reading 3 files, running 1 shell
  // command…" — because three filenames flashing past in half a second is not
  // something a person can actually read.

  activityStart(toolName, label) {
    const verb = TOOL_VERBS[toolName];
    const key = verb ? toolName : 'other';
    this.activity.set(key, (this.activity.get(key) || 0) + 1);
    this.activityTarget = label || '';
  }

  activityClear() {
    this.activity.clear();
    this.activityTarget = '';
  }

  /** `reading 3 files, running 1 shell command` — present tense, for the status bar. */
  activityPhrase(tense = 0) {
    const parts = [];
    this.activity.forEach((count, key) => {
      const verb = TOOL_VERBS[key];
      if (!verb) { parts.push(tense ? 'worked' : 'working'); return; }
      parts.push(`${verb[tense]} ${count} ${pluralise(verb[2], count)}`);
    });
    return parts.join(', ');
  }

  /**
   * Commits the run's activity to the transcript as one past-tense line.
   *
   * This is the "ab maine ye kar liya" beat: the live sentence stops moving and turns
   * into a record of what was actually done, so scrolling back through a long build
   * reads as a sequence of completed steps rather than a wall of individual calls.
   */
  activityFlush() {
    const phrase = this.activityPhrase(1);
    this.activityClear();
    if (!phrase) return;
    this.push(c.dim('  ' + RAIL + ' ') + c.muted(phrase.charAt(0).toUpperCase() + phrase.slice(1)));
  }

  /**
   * Streaming assistant prose. Redrawn in place from an anchor, like the thinking
   * block, so partial words do not leave a trail of half-wrapped lines behind them.
   */
  narratePush(chunk) {
    if (this.narrateAnchor === -1) {
      this.thinkEnd();
      this.narrateAnchor = this.lines.length;
      this.narrateBuf = '';
    }
    this.narrateBuf += chunk;
    this.repaintNarration();
  }

  repaintNarration() {
    if (this.narrateAnchor === -1) return;
    this.lines.length = this.narrateAnchor;
    const text = this.narrateBuf.replace(/\n{3,}/g, '\n\n');
    text.split('\n').forEach(para => {
      if (!para.trim()) { this.rail(); return; }
      wrap(para.trim(), this.width - 8).forEach(l => {
        this.push(c.dim('  ' + RAIL + ' ') + c.white(l));
      });
    });
  }

  /** Commits the streamed prose so the next tool call renders below it. */
  narrateEnd() {
    if (this.narrateAnchor === -1) return;
    if (!this.narrateBuf.trim()) this.lines.length = this.narrateAnchor;
    this.narrateAnchor = -1;
    this.narrateBuf = '';
  }

  /**
   * The live task list. Kept as a panel pinned above the composer rather than pushed
   * into the transcript — a list that scrolled away with the history could not answer
   * "what is it doing now", which is the whole reason it exists.
   */
  setTodos(todos) {
    this.todos = Array.isArray(todos) ? todos : [];
  }

  /**
   * The task list rows, windowed around the active step.
   *
   * This is the ONLY place the checklist is drawn. It used to be rendered here *and*
   * snapshotted into the transcript on every update, which read as two competing lists —
   * one plan and one progress log saying the same thing.
   *
   * `animated` is false once the agent stops: a pulsing glyph on a finished run would
   * suggest work is still happening.
   */
  todoRows(animated) {
    if (!this.todos.length) return [];

    const rows = [];
    const WINDOW = 5;
    const activeIdx = Math.max(0, this.todos.findIndex(t => t.status === 'active'));
    const start = Math.max(0, Math.min(activeIdx - 1, this.todos.length - WINDOW));
    const window = this.todos.slice(start, start + WINDOW);

    if (start > 0) rows.push(c.dim('    ') + c.dim(`  … ${start} done above`));
    window.forEach(t => {
      // Only the active row animates. Done and pending rows are settled facts and a
      // moving glyph on them would be noise; the one square that breathes is the one
      // the eye should land on.
      const pulse = animated
        ? TODO_PULSE[Math.floor(this.spinnerIndex / 5) % TODO_PULSE.length]
        : '■';
      const mark = t.status === 'done' ? c.ok('✔')
        : t.status === 'active' ? c.warn(pulse)
        : c.dim('□');
      const text = t.status === 'done'
        ? c.dim(chalk.strikethrough(t.text))
        : t.status === 'active' ? chalk.bold.white(t.text) : c.muted(t.text);
      rows.push(c.dim('    ') + mark + ' ' + truncate(text, this.width - 10));
    });
    const rest = this.todos.length - (start + window.length);
    if (rest > 0) rows.push(c.dim('    ') + c.dim(`  … ${rest} more`));

    return rows;
  }

  /**
   * The idle task list — same rows, with a header, shown when the agent is not running.
   *
   * Without this the checklist vanished the moment a turn ended, so the user lost the
   * record of what had just been done and what was still outstanding.
   */
  idleTodoBlock() {
    if (!this.todos.length) return [];
    const done = this.todos.filter(t => t.status === 'done').length;
    const all = done === this.todos.length;
    return [
      '  ' + (all ? c.ok('✔ ') : c.brand('▪ ')) +
        c.muted(`tasks  ${done}/${this.todos.length}`) +
        (all ? c.dim('  ·  /todo to clear') : ''),
      ...this.todoRows(false)
    ];
  }

  /**
   * The approval prompt, as a selectable list rather than three bare letters.
   *
   * Claude Code's version spells each choice out — "Yes, and don't ask again for:
   * run_command" — which matters because "a" is the one answer with consequences past
   * this moment, and a single keystroke gives no chance to notice that. Arrow keys plus
   * number keys both work; the numbers are what people reach for.
   *
   * Redrawn from an anchor so arrowing up and down updates in place.
   */
  approvalBox(title, lines = [], diffRows = null, options = null) {
    this.thinkEnd();
    this.narrateEnd();
    this.approval = {
      mode: 'approve',
      title,
      lines,
      diff: diffRows,
      options: options || ['Yes', 'No'],
      index: 0
    };
    this.approvalAnchor = this.lines.length;
    this.repaintApproval();
  }

  /**
   * The agent asking the user something, rather than asking permission.
   *
   * Shares the approval box's anchor machinery and arrow-key handling — a question is
   * structurally the same widget — but reads differently on purpose: brand colour instead
   * of warning amber, and no "Do you want to proceed?", because nothing is about to
   * happen. It is a fork in the road, not a gate.
   *
   * Options may be plain strings or `{ label, description }`; the description is the
   * difference between "30 seconds" and "30 seconds — room for three scenes and a
   * closing card", which is what makes the list answerable without thinking hard.
   */
  askBox(question, options, note = '') {
    this.thinkEnd();
    this.narrateEnd();
    this.approval = {
      mode: 'ask',
      title: question,
      lines: note ? [note] : [],
      diff: null,
      options: (options && options.length) ? options : ['Yes', 'No'],
      index: 0
    };
    this.approvalAnchor = this.lines.length;
    this.repaintApproval();
  }

  approvalMove(delta) {
    if (!this.approval) return;
    const n = this.approval.options.length;
    this.approval.index = (this.approval.index + delta + n) % n;
    this.repaintApproval();
  }

  repaintApproval() {
    if (!this.approval || this.approvalAnchor === -1) return;
    this.lines.length = this.approvalAnchor;

    const a = this.approval;
    const asking = a.mode === 'ask';
    const frame = asking ? c.brand : c.warn;
    const titleColor = asking ? chalk.bold.hex(BRAND) : chalk.bold.hex('#f59e0b');
    const inner = Math.min(this.width - 6, 74);

    // A question is usually a sentence, not a tool name, so it goes in the body where it
    // can wrap rather than in the border, where it would be truncated.
    const heading = asking ? 'Question' : a.title;

    this.push('');
    this.push(
      frame('  ╭─ ') + titleColor(heading) + ' ' +
      frame('─'.repeat(Math.max(0, inner - visibleLength(heading) - 4))) + frame('╮')
    );

    const row = painted => {
      const pad = Math.max(0, inner - visibleLength(painted) - 1);
      this.push(frame('  │ ') + painted + ' '.repeat(pad) + frame('│'));
    };

    if (asking) {
      wrap(a.title, inner - 3).forEach(w => row(chalk.bold.white(w)));
      if (a.lines.length) row('');
    }
    a.lines.forEach(l => wrap(String(l), inner - 3).forEach(w => row(c.muted(w))));

    if (Array.isArray(a.diff) && a.diff.length) {
      a.diff.forEach(r => {
        const paint = r.sign === '+' ? c.ok : r.sign === '-' ? c.err : c.muted;
        row(paint(r.sign + ' ' + truncate(r.text, inner - 6)));
      });
    }

    row('');
    if (!asking) row(c.muted('Do you want to proceed?'));

    a.options.forEach((opt, i) => {
      const selected = i === a.index;
      const label = typeof opt === 'string' ? opt : String(opt.label || '');
      const desc = typeof opt === 'string' ? '' : String(opt.description || '');
      // The label is wrapped so a long "don't ask again for: <command>" stays inside
      // the frame instead of blowing the border out to the right.
      wrap(`${i + 1}. ${label}`, inner - 6).forEach((line, j) => {
        const marker = selected && j === 0 ? c.accent('❯ ') : '  ';
        const body = j === 0 ? line : '   ' + line;
        row(marker + (selected ? chalk.bold.white(body) : c.muted(body)));
      });
      if (desc) wrap(desc, inner - 10).forEach(line => row(c.dim('     ' + line)));
    });

    this.push(frame('  ╰' + '─'.repeat(inner) + '╯'));
  }

  /** Commits the box with the chosen answer shown in place of the options. */
  approvalEnd(verdict) {
    if (this.approvalAnchor === -1) { this.approval = null; return; }
    this.lines.length = this.approvalAnchor;
    this.approvalAnchor = -1;
    const title = this.approval ? this.approval.title : '';
    this.approval = null;
    const mark = verdict === 'no'
      ? c.err('✘ ') + c.muted('skipped ' + title)
      : verdict === 'always'
        ? c.ok('✔ ') + c.muted('allowed — will not ask again for ' + title)
        : c.ok('✔ ') + c.muted('allowed ' + title);
    this.push(c.dim('  ' + RAIL + ' ') + mark);
  }

  /**
   * Commits a question box with the answer in place of the options.
   *
   * Kept in the transcript rather than erased, because three turns later "why is it 30
   * seconds?" has an answer sitting right there: because that is what was chosen.
   */
  askEnd(answer) {
    if (this.approvalAnchor === -1) { this.approval = null; return; }
    this.lines.length = this.approvalAnchor;
    this.approvalAnchor = -1;
    const question = this.approval ? this.approval.title : '';
    this.approval = null;
    const inner = Math.max(20, Math.min(this.width - 8, 74));
    this.push(c.dim('  ' + RAIL + ' ') + c.accent('? ') + c.muted(truncate(question, inner)));
    this.push(c.dim('  ' + RAIL + '   ') + c.ok('↳ ') + chalk.bold.white(truncate(String(answer), inner)));
  }

  /** Single definitive plan with approval prompt underneath. */
  planPreview(plan) {
    this.push('');
    this.push(c.brandBold('  ◆ ') + chalk.bold.white('Definitive Plan'));
    
    if (plan.analysis) {
      this.rail();
      wrap(plan.analysis, this.width - 8).forEach(l => {
        this.push(c.dim('  │ ') + c.white(l));
      });
    }
    
    if (plan.plan) {
      const opt = plan.plan;
      this.rail();
      this.push(c.dim('  │ ') + c.accent(`❯ `) + chalk.bold.white(opt.title || `Main Title`));
      if (opt.style) this.push(c.dim('  │    ') + c.muted(opt.style));
      if (opt.duration) this.push(c.dim('  │    ') + c.muted('duration  ') + c.white(opt.duration));
      // The quality was settled with the user before this plan existed, so it belongs on the
      // approval screen — this is their last chance to catch a 4K they did not want before
      // sitting through a render at it. The pixel size is spelled out because "2k" means
      // little on its own.
      if (opt.quality) {
        const q = String(opt.quality).toLowerCase().trim();
        const px = { '720p': '1280x720', '1080p': '1920x1080', '2k': '2560x1440', '4k': '3840x2160' }[q];
        this.push(c.dim('  │    ') + c.muted('quality   ') + c.white(q) + (px ? c.dim('  ' + px) : ''));
      }
      if (Array.isArray(opt.colors) && opt.colors.length) {
        this.push(c.dim('  │    ') + c.muted('palette   ') + opt.colors.map(h => chalk.hex(safeHex(h))('■')).join(' ') +
          c.dim('  ' + opt.colors.join(' ')));
      }
      (opt.scenes || []).forEach(s => {
        wrap('• ' + s, this.width - 14).forEach((l, j) => {
          this.push(c.dim('  │    ') + (j === 0 ? c.muted(l) : c.muted('  ' + l)));
        });
      });
      if (Array.isArray(opt.animations) && opt.animations.length) {
        this.push(c.dim('  │    ') + c.muted('motion    ') + c.dim(opt.animations.join(', ')));
      }
    }

    if (plan.profiles && Array.isArray(plan.profiles) && plan.profiles.length > 0) {
      this.rail();
      this.push(c.dim('  │ ') + chalk.bold.white('Extracted Brand Profiles'));
      plan.profiles.forEach(p => {
        this.push(c.dim('  │    ') + c.accent('• ') + c.white(p.name || 'Brand Profile'));
        if (p.colors && p.colors.length) {
          this.push(c.dim('  │      ') + p.colors.map(h => chalk.hex(safeHex(h))('■')).join(' ') + c.dim(' ' + p.colors.join(' ')));
        }
        if (p.context) {
           wrap(p.context, this.width - 16).forEach((l, j) => {
             this.push(c.dim('  │      ') + c.muted(l));
           });
        }
      });
    }

    this.endBlock();
  }

  welcome() {
    const w = Math.min(this.width - 6, 75);
    this.push('');
    this.push(c.brandBold('  █████╗ ███╗   ██╗██╗   ██╗███╗   ███╗ ██████╗ ████████╗██╗ ██████╗ ███╗   ██╗'));
    this.push(c.brandBold(' ██╔══██╗████╗  ██║╚██╗ ██╔╝████╗ ████║██╔═══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║'));
    this.push(c.brandBold(' ███████║██╔██╗ ██║ ╚████╔╝ ██╔████╔██║██║   ██║   ██║   ██║██║   ██║██╔██╗ ██║'));
    this.push(c.accent(' ██╔══██║██║╚██╗██║  ╚██╔╝  ██║╚██╔╝██║██║   ██║   ██║   ██║██║   ██║██║╚██╗██║'));
    this.push(c.accent(' ██║  ██║██║ ╚████║   ██║   ██║ ╚═╝ ██║╚██████╔╝   ██║   ██║╚██████╔╝██║ ╚████║'));
    this.push(c.accent(' ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝     ╚═╝ ╚═════╝    ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝'));
    this.push('');
    this.push('  ' + c.brandBold('◆') + '  ' + chalk.bold.white('Welcome to Anymotion AI Studio'));
    this.push('');
    this.text('Ask me anything about motion design, or describe an animation.', c.muted);
    this.text('For a build I will plan it first and show you options — nothing is', c.muted);
    this.text('written until you approve. Each project gets its own folder.', c.muted);
    this.push('');
    this.push(c.dim('  ' + '─'.repeat(w)));
    this.push('');
    this.push('  ' + c.accent('try') + c.dim('  "SaaS analytics explainer, dark glass, 3 scenes"'));
    this.push('  ' + c.accent('   ') + c.dim('  /model     switch model'));
    this.push('  ' + c.accent('   ') + c.dim('  /think     reasoning effort — off to max'));
    this.push('  ' + c.accent('   ') + c.dim('  /help      all commands'));
    this.push('');
  }

  // ---- spinner ----------------------------------------------------------

  startSpinner(label) {
    this.busy = true;
    this.status = label;

    // Pick animation sequence based on what is happening — minimal, futuristic feel.
    const lower = (label || '').toLowerCase();
    if (/thinking|reasoning/.test(lower)) {
      this.spinnerState = 'thinking';
    } else if (/plan/.test(lower)) {
      this.spinnerState = 'planning';
    } else if (/research|fetch/.test(lower)) {
      this.spinnerState = 'researching';
    } else if (/render/.test(lower)) {
      this.spinnerState = 'rendering';
    } else if (/compos|captur/.test(lower)) {
      this.spinnerState = 'composing';
    } else {
      this.spinnerState = 'working';
    }

    /**
     * Which bank of rotating verbs to draw from — or none at all.
     *
     * A label like "capturing frames — this can take a few minutes" is specific and true,
     * and swapping it for "Morphing…" would be a downgrade. So the rotation only kicks in
     * for the generic waits, where the alternative is a word that sits motionless for
     * fifteen seconds and reads as a hung process.
     */
    if (/thinking|reasoning|analyz|understand|plan|contacting|reply|chat/.test(lower)) {
      this.verbBank = 'conversational';
    } else if (/build|generat|compos|animat|working|editing|revis/.test(lower)) {
      this.verbBank = 'project';
    } else {
      this.verbBank = null;   // specific status — show it verbatim
    }
    this.verbIndex = 0;
    this.realThinking = false;

    if (!this.startTime) this.startTime = Date.now();
    if (this.spinnerTimer) clearInterval(this.spinnerTimer);
    this.spinnerTimer = setInterval(() => {
      this.spinnerIndex++;
      if (this.spinnerIndex % VERB_HOLD_TICKS === 0) this.verbIndex++;
      if (this.spinnerIndex % 133 === 0) this.tipIndex++;
      this.render();
    }, 90);
    this.render();
  }

  /**
   * The word shown next to the spinner.
   *
   * Once real reasoning tokens have arrived the rotation stops and the label locks to
   * "Thinking" — at that point the word is no longer a stand-in for an unknown wait, it
   * is a description of what is actually happening, and rotating it would be a lie.
   */
  spinnerLabel() {
    if (this.realThinking) return 'Thinking';
    if (!this.verbBank) return this.status || 'Working';
    const bank = STATUS_VERBS[this.verbBank];
    return bank[this.verbIndex % bank.length];
  }

  setStatus(label) {
    this.status = label;
  }

  /** Accumulates usage for the `↓ 7.0k tokens` meter next to the elapsed time. */
  addUsage(usage) {
    if (!usage) return;
    // All three are input tokens the request actually paid to process, just at different
    // rates. Counting the reads but not the writes made the first turn of a run — the one
    // that fills the cache — look far cheaper than it was, and the saving on later turns
    // correspondingly smaller than it is.
    this.tokensIn += (usage.input_tokens || 0) +
      (usage.cache_read_input_tokens || 0) +
      (usage.cache_creation_input_tokens || 0);
    this.tokensOut += usage.output_tokens || 0;
  }

  /** Resets the per-run counters. Called when a new request starts, not on each turn. */
  beginRun() {
    this.startTime = Date.now();
    this.tokensIn = 0;
    this.tokensOut = 0;
    this.activityClear();
  }

  /**
   * Parks the spinner. A mid-run stop leaves startTime, the token totals and the activity
   * tally alone: an approval prompt stops the spinner mid-run, and a run that reports
   * "0s" after the user thinks about it for a minute would be lying. beginRun() is what
   * resets the counters, once per request; a final stop consumes startTime once it has
   * spent it on the receipt.
   *
   * @param {boolean} [finalStop=false] - true when this is the end of the run, not a
   *                  mid-run pause for approval. Only then does the "worked for Ns"
   *                  receipt appear.
   */
  stopSpinner(finalStop = false) {
    // A run that actually did something gets a one-line receipt before the spinner dies,
    // but only at the FINAL stop — not during mid-run approval pauses. The thinking block
    // already left its own "Thought for Ns" line, so this is for the rest of the work:
    // tool calls, planning, composition.
    //
    // `busy` is deliberately not part of this test. It is the spinner's own flag, and any
    // earlier pause clears it — including a `finally` that parks the spinner before the
    // caller reaches its own final stop, which is exactly the shape of the intake and plan
    // paths. Gating on it meant the receipt went to whichever stop ran first and was
    // silently dropped, so those runs never reported their time at all. startTime is the
    // run-scoped value, so it is the right thing to read; clearing it below is what keeps
    // a second final stop from printing the receipt twice.
    if (finalStop && this.startTime) {
      const secs = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
      // Only show the receipt when measurable work happened. A two-word reply that took
      // 2 seconds needs no ceremony; a composition run that took 47 seconds does.
      if (secs >= 3 && (this.tokensOut > 500 || this.activity.size > 0)) {
        this.push('');
        this.push(c.muted('  ✻ ') + chalk.italic(c.muted(`Worked for ${secs}s`)));
      }
      this.startTime = 0;
    }

    this.busy = false;
    this.status = '';
    if (this.spinnerTimer) { clearInterval(this.spinnerTimer); this.spinnerTimer = null; }
  }

  // ---- frame ------------------------------------------------------------

  /**
   * The live block above the composer while the agent is working.
   *
   *   ✻ Compositing… (3m 59s · ↓ 7.0k tokens)
   *     ∟ reading 3 files, running 1 shell command
   *       src/agent/ai-engine.js
   *     ■ Phase 2 — agent loop
   *     □ Phase 3 — TUI narration
   *     ∟ Tip: /verify audits the composition any time.
   *
   * Returned as an array rather than pushed, because render() has to know the height
   * before it decides how many transcript rows are left.
   */
  statusBlock() {
    const rows = [];

    const frames = SPINNERS[this.spinnerState] || SPINNERS.working;
    const frame = frames[this.spinnerIndex % frames.length];

    // Header: what it is doing, how long it has taken, what that has cost.
    // An active todo wins over the rotating verb — a concrete task name is always more
    // informative than a mood word.
    const active = this.todos.find(t => t.status === 'active');
    const label = active ? active.text : this.spinnerLabel();
    const elapsed = this.startTime ? formatElapsed(Date.now() - this.startTime) : '';
    const meter = [
      elapsed,
      this.tokensOut ? '↓ ' + formatTokens(this.tokensOut) + ' tokens' : ''
    ].filter(Boolean).join(' · ');

    rows.push(
      '  ' + c.brand(frame + ' ') + chalk.bold.white(label + '…') +
      (meter ? c.dim(`  (${meter})`) : '')
    );

    // The reasoning tail, immediately under the spinner it belongs to. This is the whole
    // point of moving it out of the transcript: the words the model is thinking sit
    // directly beneath the label that says it is thinking, so the two read as one block.
    const thinking = this.thinkingRows();
    if (thinking.length) rows.push(...thinking);

    // What is in flight right now, aggregated by category.
    const phrase = this.activityPhrase(0);
    if (phrase) {
      rows.push(c.dim('    ∟ ') + c.muted(phrase));
      if (this.activityTarget) {
        rows.push(c.dim('      ') + c.dim(truncate(this.activityTarget, this.width - 10)));
      }
    }

    // The task list, nested under the spinner rather than pinned as a one-line strip —
    // the point of a plan is seeing the shape of the whole thing, not just the current
    // item. Trimmed to a window around the active step so a 20-item plan cannot eat
    // the transcript.
    rows.push(...this.todoRows(true));

    // A tip only where there is nothing more useful to show.
    if (!phrase && !this.todos.length) {
      rows.push(c.dim('    ∟ Tip: ') + c.dim(TIPS[this.tipIndex % TIPS.length]));
    }

    return rows;
  }

  render() {
    if (this.thinkAnchor !== -1) {
      this.repaintThinking();
    }
    if (this.narrateAnchor !== -1) {
      this.repaintNarration();
    }

    const W = this.width;
    const H = this.height;
    const out = [];

    // Header: two rows plus a separator.
    // `serving` is null when the editor is not part of this build at all — a permanent
    // "editor offline" badge reads as something broken rather than something withheld,
    // so the slot is simply empty until the editor is switched back on.
    const serving = this.meta.serving === null ? ''
      : this.meta.serving
        ? c.ok('● live') + c.dim(' localhost:' + this.meta.port)
        : c.dim('○ editor offline');
    const left = '  ' + chalk.bold.white('ANY') + c.brandBold('MOTION') +
      c.dim('  motion-graphics agent');
    const right = serving + '  ';
    const gap = Math.max(1, W - visibleLength(left) - visibleLength(right));
    out.push(truncate(left + ' '.repeat(gap) + right, W));

    // Second row carries the live session settings — model, reasoning effort, and the
    // folder the agent is actually writing into.
    const think = this.meta.thinking && this.meta.thinking !== 'off'
      ? c.accent('✻ ' + this.meta.thinking)
      : c.dim('✻ off');
    const folder = this.meta.folder
      ? c.brand('▪ ') + c.white(this.meta.folder)
      : c.dim('▪ no project yet');
    out.push(truncate(
      c.dim('  ' + (this.meta.model || 'claude-opus-5')) +
      c.dim('  ·  ') + think +
      c.dim('  ·  ') + folder, W));
    out.push(c.brand('  ' + '━'.repeat(Math.max(4, W - 4))));

    // Reserve rows for composer (3) + hint bar (1) + popup (+1 for its title) + the
    // live status block (aggregate line, target, nested todos, tip).
    const popupRows = this.popup.length
      ? Math.min(this.popup.length, 12) + (this.popupTitle ? 3 : 2)
      : 0;
    // Live status block while the agent runs; the bare task list when it is idle. Either
    // way the checklist occupies the same strip directly above the composer, so it never
    // jumps to a different part of the screen between turns.
    const statusBlockRows = this.busy ? this.statusBlock() : this.idleTodoBlock();
    const statusRows = statusBlockRows.length ? statusBlockRows.length + 1 : 0;  // +1 for spacing
    const bodyRows = Math.max(1, H - out.length - 4 - popupRows - statusRows);
    // Published so the key handler can page by a real screenful rather than a guessed
    // constant — pgup used to move 5 rows regardless of how tall the terminal was.
    this.bodyRows = bodyRows;

    // Transcript window, honouring scrollback offset.
    const maxScroll = Math.max(0, this.lines.length - bodyRows);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    const offset = this.scroll;
    const end = this.lines.length - offset;
    const start = Math.max(0, end - bodyRows);
    const visible = this.lines.slice(start, end);
    while (visible.length < bodyRows) visible.push('');
    
    const thumbH = Math.max(1, Math.floor(bodyRows * (bodyRows / Math.max(1, this.lines.length))));
    let thumbStart = 0;
    if (maxScroll > 0) {
       const fraction = 1 - (offset / maxScroll);
       thumbStart = Math.floor(fraction * (bodyRows - thumbH));
    }

    visible.forEach((l, i) => {
      if (maxScroll > 0) {
        const isThumb = i >= thumbStart && i < thumbStart + thumbH;
        const scrollChar = isThumb ? c.accent('█') : c.dim('│');
        out.push(padRight(l, W - 2) + ' ' + scrollChar);
      } else {
        out.push(truncate(l, W));
      }
    });

    // Suggestion / picker popup, drawn directly above the composer.
    if (popupRows) {
      const popW = Math.min(W - 6, 56);
      out.push(c.dim('  ┌' + '─'.repeat(popW) + '┐'));
      if (this.popupTitle) {
        const t = (' ' + this.popupTitle).slice(0, popW).padEnd(popW);
        out.push(c.dim('  │') + c.brandBold(t) + c.dim('│'));
      }
      this.popup.slice(0, 12).forEach((item, i) => {
        // Row text is built plain first so padding is computed on real widths, then
        // painted as a whole — a highlight that stops at the text would look ragged.
        const label = ' ' + String(item.name).padEnd(14) + (item.desc || '');
        const row = label.slice(0, popW).padEnd(popW);
        const painted = i === this.popupIndex
          ? chalk.bgHex('#1e1b4b').white(row)
          : c.accent(row.slice(0, 15)) + c.muted(row.slice(15));
        out.push(c.dim('  │') + painted + c.dim('│'));
      });
      out.push(c.dim('  └' + '─'.repeat(popW) + '┘'));
    }

    // Live status block, drawn directly above the composer. Built by statusBlock() so
    // render() can reserve exactly as many rows as it will occupy.
    if (statusRows) {
      statusBlockRows.forEach(r => out.push(truncate(r, W)));
      out.push('');  // breathing room between status and composer
    }

    // Composer: a bordered box with a coloured caret marker.
    // Border rows are '  ' + corner + boxW + corner, so the content row must carry
    // exactly boxW visible cells between its two '│' glyphs.
    const boxW = Math.max(10, W - 6);
    const prompt = this.busy ? '⏳ ' : '❯ ';
    const shown = this.inputWindow(boxW - 4);
    const bodyPlain = this.input.length
      ? shown.text
      : (this.placeholder || 'Describe an animation, or press / for commands');
    const body = bodyPlain.slice(0, Math.max(0, boxW - 4));
    const pad = Math.max(0, boxW - 2 - prompt.length - body.length);

    out.push(c.dim('  ╭' + '─'.repeat(boxW) + '╮'));
    out.push(
      c.dim('  │ ') +
      (this.busy ? c.warn(prompt) : c.accent(prompt)) +
      (this.input.length ? c.white(body) : c.dim(body)) +
      ' '.repeat(pad) +
      c.dim(' │')
    );
    out.push(c.dim('  ╰' + '─'.repeat(boxW) + '╯'));

    // Hint bar doubles as the live status line while work is running.
    let hint;
    if (this.scroll > 0) {
      // Scrolled off the tail. This takes priority over every other hint, including the
      // spinner: once new output stops pushing the view around, the only thing that is not
      // obvious is that there IS newer output below, and how to get back to it.
      const below = this.scroll;
      hint = '  ' + c.warn('▼ ') + c.muted(`${below} line${below === 1 ? '' : 's'} below`) +
        c.dim('   ↓/pgdn scroll   ctrl+end jump to latest') +
        (this.busy ? c.dim('   ctrl+c abort') : '');
    } else if (this.busy) {
      const seq = SPINNERS[this.spinnerState] || SPINNERS.working;
      const frame = seq[this.spinnerIndex % seq.length];
      hint = '  ' + c.brand(frame + ' ') + c.muted(this.spinnerLabel() + '…') +
        c.dim('   ctrl+c abort');
    } else if (this.popup.length) {
      hint = '  ' + c.dim(this.popupMode === 'select'
        ? '↑↓ choose   enter select   esc cancel'
        : '↑↓ select   tab complete   enter run   esc dismiss');
    } else if (this.hint) {
      hint = '  ' + c.dim(this.hint);
    } else {
      hint = '  ' + c.dim('/ commands   ↑ history   esc clear   pgup scroll   ctrl+c exit');
    }
    out.push(truncate(hint, W));

    // Single write: assembling the frame first avoids visible tearing.
    let frame = CSI + 'H' + CSI + 'J';
    frame += out.slice(0, H).join('\n');
    process.stdout.write(frame);

    // Park the real cursor inside the composer so typing feels native.
    // Columns are 1-based: 2 margin + 1 border + 1 space = the caret starts at 5.
    if (!this.busy) {
      const row = H - 2;
      const col = 5 + prompt.length + shown.caret;
      process.stdout.write(CSI + row + ';' + col + 'H' + CSI + '?25h');
    } else {
      process.stdout.write(CSI + '?25l');
    }
  }

  /** Horizontal scroll for input longer than the box. */
  inputWindow(width) {
    if (this.input.length <= width) {
      return { text: this.input, caret: this.cursor };
    }
    let startIdx = Math.max(0, this.cursor - width + 1);
    if (startIdx + width > this.input.length) startIdx = this.input.length - width;
    return { text: this.input.slice(startIdx, startIdx + width), caret: this.cursor - startIdx };
  }
}
