/**
 * AGENT LOOP
 *
 * The old engine did one round trip: prompt in, HTML out. If the result was wrong, the
 * only recourse was to regenerate the whole thing. There was no way for the model to
 * look at what it had made, no way for it to read a file before rewriting it, and — the
 * thing the user actually complained about — no way for it to say "that part is done,
 * here is what I am doing next", because nothing existed between "started" and "finished".
 *
 * This is that missing middle. A real multi-turn loop: the model thinks, calls tools,
 * reads the results, narrates, and keeps going until the work is genuinely done. Every
 * step emits an event, so the TUI shows the actual work rather than a character counter.
 *
 * Events emitted through `emit`:
 *   { type: 'thinking',    text }              extended-thinking delta
 *   { type: 'text',        text }              assistant prose delta — the narration
 *   { type: 'tool_start',  id, name, label }
 *   { type: 'tool_result', id, name, summary, isError, preview? }
 *   { type: 'todos',       todos }
 *   { type: 'turn',        n, of }
 *   { type: 'notice',      text }              loop-level info (compaction, retries)
 *   { type: 'error',       text, fatal }       a named API/network failure, not "agent stopped"
 *   { type: 'done',        reason, turns }
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import {
  toolSchemas, dispatch, requiresApproval, previewTool, labelTool
} from './tools/index.js';

/**
 * Duplicated from ai-engine.js on purpose. ai-engine imports this module, so importing
 * back would make the cycle real, and a `const` caught in the temporal dead zone during
 * module evaluation is a genuinely miserable bug to chase.
 *
 * `off: 0` is listed explicitly so an intentional "no thinking" survives the lookup as a
 * real value instead of falling through a default and being handed a budget back.
 */
const THINKING_BUDGETS = { off: 0, low: 1024, medium: 1536, high: 2048, xhigh: 4096, max: 8192 };

const MAX_TURNS = 150;
const MAX_RETRIES = 6;
const CONTEXT_CHAR_BUDGET = 320_000;

/**
 * Output ceilings per model, and the floor the thinking API enforces.
 *
 * `max_tokens` covers thinking *plus* the visible answer, and the request is rejected
 * outright when it exceeds what the model can emit or when the budget is not strictly
 * below it. Hardcoding one number worked until the model changed under it — a small or
 * third-party model with a lower ceiling got a 24k request and returned a 400 that read
 * like a thinking bug. Anything unknown falls back to the conservative floor rather than
 * assuming the largest window.
 */
const MODEL_OUTPUT_CAP = {
  'claude-opus-5': 64_000,
  'claude-sonnet-5': 64_000,
  'claude-fable-5': 64_000,
  'claude-haiku-4-5-20251001': 64_000
};
const DEFAULT_OUTPUT_CAP = 16_384;
const MIN_THINKING_BUDGET = 1024;

/** Longest output the model will accept, matched loosely so dated ids still resolve. */
function outputCapFor(model) {
  const id = String(model || '').toLowerCase();
  if (MODEL_OUTPUT_CAP[id]) return MODEL_OUTPUT_CAP[id];
  for (const [known, cap] of Object.entries(MODEL_OUTPUT_CAP)) {
    if (id.startsWith(known) || id.includes(known)) return cap;
  }
  // Family fallbacks, so an unlisted variant still gets a sane ceiling.
  if (/opus|sonnet|fable|haiku/.test(id)) return DEFAULT_OUTPUT_CAP * 2;
  return DEFAULT_OUTPUT_CAP;
}

/**
 * Reconciles the requested thinking budget with what the model can actually do.
 *
 * Returns the budget to send and the max_tokens that must accompany it. When there is
 * not enough headroom to think *and* answer, thinking is dropped rather than sent in a
 * shape the API will refuse — a run that thinks less is strictly better than a run that
 * 400s on its first turn.
 *
 * `desiredMax` defaults high on purpose. This agent writes whole compositions in one
 * write_file call, and a ceiling that cannot fit one truncates the call mid-argument —
 * which used to take the run down entirely. Room to finish the write is worth more than
 * the tokens saved by a tight limit.
 */
export function resolveTokenPlan(model, requestedBudget, desiredMax = 32_000) {
  const cap = outputCapFor(model);
  let budget = requestedBudget || 0;
  let maxTokens = Math.min(Math.max(desiredMax, 4096), cap);

  if (!budget) return { budget: 0, maxTokens };

  // Leave room for a real answer after the thinking is paid for.
  const ANSWER_ROOM = 8000;
  if (budget > cap - ANSWER_ROOM) budget = cap - ANSWER_ROOM;
  if (budget < MIN_THINKING_BUDGET) return { budget: 0, maxTokens };

  maxTokens = Math.min(cap, Math.max(maxTokens, budget + ANSWER_ROOM));
  // budget_tokens must be strictly less than max_tokens.
  if (budget >= maxTokens) budget = maxTokens - 1;
  if (budget < MIN_THINKING_BUDGET) return { budget: 0, maxTokens };

  return { budget, maxTokens };
}

/**
 * How long a stream may go silent before it is treated as dead.
 *
 * Nothing upstream guarantees a response. A connection can be accepted, produce a few
 * tokens, and then simply stop — no error, no close, no timeout — and `for await` will
 * wait on it forever. That is the "Responding… 6m56s" hang: the loop was healthy and
 * parked on a socket that was never going to speak again.
 *
 * Generous on purpose. Extended thinking legitimately goes quiet for a while before the
 * first delta, so this has to be long enough not to kill a slow-but-live request; the
 * point is to catch a stall, not to police latency.
 */
const STALL_MS = 110_000;
const FIRST_EVENT_MS = 110_000;

/**
 * Consumes an async iterable, failing if it goes quiet for too long.
 *
 * The deadline is reset by every event, so a stream that is producing anything at all is
 * left alone no matter how long it runs in total. Only silence is fatal — and the first
 * silence, before anything has arrived, is judged against a longer deadline than the rest.
 */
export async function withStallGuard(stream, onEvent, signal, timeoutMs = STALL_MS) {
  let timer = null;
  const timeout = timeoutMs || STALL_MS;
  // Explicit timeouts are honoured as given; only the default gets first-event grace, so a
  // caller that asked for a specific budget still gets exactly that.
  const firstTimeout = timeoutMs ? timeout : Math.max(timeout, FIRST_EVENT_MS);
  let started = false;

  const stall = new Promise((_, reject) => {
    const arm = () => {
      clearTimeout(timer);
      const budget = started ? timeout : firstTimeout;
      timer = setTimeout(() => {
        // End the request so the dead socket is not left dangling behind the retry.
        try { stream.controller?.abort(); } catch (_) {}
        const err = new Error(
          started
            ? `No response for ${Math.round(budget / 1000)}s — the stream went silent.`
            : `No first token after ${Math.round(budget / 1000)}s — the request never started.`
        );
        err.isStall = true;
        reject(err);
      }, budget);
    };
    arm();
    stream.__rearm = arm;
  });

  const pump = (async () => {
    for await (const event of stream) {
      if (signal?.aborted) break;
      stream.__rearm();
      started = true;
      onEvent(event);
    }
  })();

  try {
    await Promise.race([pump, stall]);
  } finally {
    clearTimeout(timer);
  }
}

/** Same headers Claude Code sends — agentrouter.org rejects anything else. */
function makeClient(config) {
  return new Anthropic({
    authToken: config.apiKey,
    baseURL: resolveBaseUrl(config),
    defaultHeaders: {
      'user-agent': 'claude-cli/2.1.220 (external, sdk-cli)',
      'x-app': 'cli',
      'anthropic-beta': 'claude-code-20250219,interleaved-thinking-2025-05-14,thinking-token-count-2026-05-13,context-management-2025-06-27,prompt-caching-scope-2026-01-05,mid-conversation-system-2026-04-07,advisor-tool-2026-03-01,effort-2025-11-24,fallback-credit-2026-06-01',
      'anthropic-version': '2023-06-01'
    }
  });
}

/**
 * One streamed turn against an OpenAI-shaped endpoint, returned in Anthropic's shape.
 *
 * Exported because it is the only tool-capable path this codebase has for OpenAI-compatible
 * providers, and the build loop is no longer its only caller: `callOpenAICompatible` uses it
 * for intake too. Everything above the wire — the `tools` → `functions` mapping, the
 * streamed `tool_calls` reassembly, the stall guard, the tool_use/tool_result pairing that
 * the caller then relies on — is the same problem in both places, and solving it twice is how
 * the two copies drift.
 *
 * @returns {{content: Array, stop_reason: string, usage: object}} Anthropic-shaped, so a
 *          caller written against the SDK needs no second branch to read it.
 */
export async function fetchOpenAIAgentStream(params, config, signal, emit) {
  const baseUrl = resolveBaseUrl(config);
  const provider = inferProvider(config);

  const apiKey = config.apiKey;

  const openaiMessages = [];
  if (params.system) {
    // Flattened, not passed through. `cacheableSystem` turns the prompt into an array of
    // blocks so it can carry a cache_control breakpoint — valid for Anthropic, meaningless
    // here. Handing that array to an endpoint that expects a string left the system prompt
    // mangled or dropped outright, so the model arrived not knowing it had tools or that it
    // was meant to write files: it narrated, ended its turn, and got caught by the
    // entry nudge instead — three "agent stopped early" notices before any work began.
    const sys = Array.isArray(params.system)
      ? params.system.map(b => (typeof b === 'string' ? b : b?.text || '')).filter(Boolean).join('\n\n')
      : params.system;
    if (sys) openaiMessages.push({ role: 'system', content: sys });
  }

  for (const m of params.messages) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') {
        openaiMessages.push({ role: 'user', content: m.content });
      } else if (Array.isArray(m.content)) {
        const toolResults = m.content.filter(b => b.type === 'tool_result');
        if (toolResults.length > 0) {
          for (const tr of toolResults) {
            let resText = tr.content;
            if (Array.isArray(resText)) {
              resText = resText.map(cb => cb.text || '').join('\n');
            }
            openaiMessages.push({
              role: 'tool',
              tool_call_id: tr.tool_use_id,
              content: resText || 'Success'
            });
          }
        } else {
          const textStr = m.content.map(b => b.text || '').join('\n');
          openaiMessages.push({ role: 'user', content: textStr });
        }
      }
    } else if (m.role === 'assistant') {
      if (typeof m.content === 'string') {
        const cleanContent = m.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        openaiMessages.push({ role: 'assistant', content: cleanContent });
      } else if (Array.isArray(m.content)) {
        let textContent = '';
        const toolCalls = [];
        for (const b of m.content) {
          if (b.type === 'text') {
            const cleanText = (b.text || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
            textContent += cleanText;
          } else if (b.type === 'tool_use') {
            toolCalls.push({
              id: b.id,
              type: 'function',
              function: {
                name: b.name,
                arguments: JSON.stringify(b.input || {})
              }
            });
          }
        }
        textContent = textContent.trim();
        const msgObj = { role: 'assistant', content: textContent || (toolCalls.length ? null : '') };
        if (toolCalls.length > 0) msgObj.tool_calls = toolCalls;
        openaiMessages.push(msgObj);
      }
    }
  }

  const openaiTools = (params.tools || []).map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.input_schema || {}
    }
  }));

  const payload = {
    model: params.model,
    messages: openaiMessages,
    tools: openaiTools.length > 0 ? openaiTools : undefined,
    stream: true,
    max_tokens: params.max_tokens || 8192
  };

  if (params.thinking) {
    payload.include_reasoning = true;
    payload.reasoning = { max_tokens: params.thinking.budget_tokens || 4096 };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://anymotion.studio';
    headers['X-Title'] = 'Anymotion CLI';
  } else if (provider === 'agentrouter-openai') {
    headers['user-agent'] = 'claude-cli/2.1.220 (external, sdk-cli)';
    headers['x-app'] = 'cli';
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error ${response.status}: ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  let accumulatedText = '';
  let toolCallsMap = {};
  let finishReason = null;
  // Monotonic counter for fallback tool-call IDs. Date.now() can collide when two
  // calls arrive in the same millisecond, producing duplicate tool_use_ids that
  // break the tool_result pairing on the next turn.
  let _callIdSeq = 0;

  /**
   * Handles one `data: {...}` SSE line. Extracted so the leftover buffer can be run
   * through exactly the same parsing after the stream ends.
   */
  const consumeLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data: ')) return;
    if (trimmed === 'data: [DONE]') return;

    try {
      const data = JSON.parse(trimmed.slice(6));
      const choice = data.choices && data.choices[0];
      if (!choice) return;

      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = choice.delta;
      if (!delta) return;

      const reasoning = delta.reasoning_content || delta.reasoning || delta.thinking || delta.thought;
      if (reasoning) {
        emit({ type: 'thinking', text: reasoning });
      }

      if (delta.content) {
        accumulatedText += delta.content;
        emit({ type: 'text', text: delta.content });
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallsMap[idx]) {
            toolCallsMap[idx] = { id: tc.id || `call_${++_callIdSeq}_${idx}`, name: tc.function?.name || '', args: '' };
          }
          if (tc.function?.name) toolCallsMap[idx].name = tc.function.name;
          if (tc.function?.arguments) toolCallsMap[idx].args += tc.function.arguments;
        }
      }
    } catch (e) {}
  };

  // First chunk gets the same longer grace as the Anthropic path: waiting for a large prompt
  // to be uploaded and prefilled is not the same failure as a socket dying mid-generation,
  // and holding both to 180s kills slow-but-healthy requests.
  let sawChunk = false;

  while (true) {
    // Same stall problem as the Anthropic path: reader.read() on a socket that has gone
    // quiet without closing never settles, and the run hangs with no error to show. The
    // timer is cleared on every chunk, so it only fires against actual silence.
    let stallTimer;
    let chunk;
    const budget = sawChunk ? STALL_MS : Math.max(STALL_MS, FIRST_EVENT_MS);
    try {
      chunk = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          stallTimer = setTimeout(() => {
            try { reader.cancel(); } catch (_) {}
            const err = new Error(
              sawChunk
                ? `No response for ${Math.round(budget / 1000)}s — the stream went silent.`
                : `No first token after ${Math.round(budget / 1000)}s — the request never started.`
            );
            err.isStall = true;
            reject(err);
          }, budget);
        })
      ]);
    } finally {
      clearTimeout(stallTimer);
    }

    const { done, value } = chunk;
    if (done) break;
    sawChunk = true;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) consumeLine(line);
  }

  // Flush the decoder and whatever partial line is left. Providers that close without a
  // trailing newline used to have their final event — often the one carrying the last
  // tool-call arguments or finish_reason — silently discarded here.
  buffer += decoder.decode();
  if (buffer) {
    for (const line of buffer.split('\n')) consumeLine(line);
    buffer = '';
  }

  const contentBlocks = [];
  if (accumulatedText) {
    contentBlocks.push({ type: 'text', text: accumulatedText });
  }

  // The name says sorted, and the order matters: tool_use blocks must line up with the
  // tool_result blocks sent back next turn. Object.values() returns integer-like keys in
  // ascending order today, but that is a property of the key type rather than a promise
  // about the SSE `index` values, so the sort is made explicit.
  const sortedToolCalls = Object.entries(toolCallsMap)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, tc]) => tc);

  for (const tc of sortedToolCalls) {
    let input = {};
    try { input = JSON.parse(tc.args || '{}'); } catch(e) {}
    contentBlocks.push({
      type: 'tool_use',
      id: tc.id,
      name: tc.name,
      input
    });
  }

  let mappedStopReason = 'end_turn';
  if (sortedToolCalls.length > 0) mappedStopReason = 'tool_use';
  else if (finishReason === 'length') mappedStopReason = 'max_tokens';

  return {
    content: contentBlocks,
    stop_reason: mappedStopReason,
    usage: { input_tokens: 0, output_tokens: 0 }
  };
}

/**
 * Roughly what one preview frame costs, in the char units this budget is measured in.
 *
 * A 1024×576 JPEG is about 1500 input tokens, i.e. ~6000 chars — four times what the
 * budget used to assume. Undercounting them let a run carry several rounds of stale
 * screenshots inside a budget that believed it had room, which is both the most expensive
 * thing in the transcript and the least useful, since only the newest frames describe the
 * file as it currently is.
 */
const IMAGE_CHARS = 6000;

function blockChars(part) {
  if (part.type === 'text') return (part.text || '').length;
  if (part.type === 'thinking') return (part.thinking || '').length;
  if (part.type === 'tool_use') return JSON.stringify(part.input || {}).length + 64;
  if (part.type === 'image') return IMAGE_CHARS;
  if (part.type === 'tool_result') {
    if (typeof part.content === 'string') return part.content.length;
    if (Array.isArray(part.content)) {
      return part.content.reduce(
        (n, c) => n + (c.type === 'text' ? (c.text || '').length : IMAGE_CHARS),
        0
      );
    }
  }
  return 200;
}

function messageChars(m) {
  if (typeof m.content === 'string') return m.content.length;
  if (Array.isArray(m.content)) return m.content.reduce((n, p) => n + blockChars(p), 0);
  return 0;
}

/**
 * Drops screenshots from all but the most recent preview.
 *
 * Frames are the most expensive thing in the transcript by a wide margin — roughly 1500
 * tokens each, four per call — and they go stale the moment the file is edited. A run that
 * previews half a dozen times is paying, on every subsequent turn, to re-read pictures of
 * a composition that no longer exists. The text that came with them is kept, so the model
 * still knows a preview happened and what was noted about it; only the pixels go.
 *
 * The newest set survives, because that one is still a true picture of the file on disk.
 *
 * This runs before the cache breakpoints are placed, so a fresh preview does rewrite the
 * older turns and costs one cache miss. That trade is heavily in favour of pruning: the
 * miss happens once per preview, while carrying the frames would be paid on every turn
 * after it.
 */
function pruneStaleImages(msgs) {
  let newest = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const c = msgs[i].content;
    if (Array.isArray(c) && c.some(b =>
      b.type === 'tool_result' && Array.isArray(b.content) &&
      b.content.some(x => x.type === 'image'))) { newest = i; break; }
  }
  if (newest < 0) return msgs;

  return msgs.map((m, i) => {
    if (i === newest || !Array.isArray(m.content)) return m;

    let touched = false;
    const content = m.content.map(b => {
      if (b.type !== 'tool_result' || !Array.isArray(b.content)) return b;
      if (!b.content.some(x => x.type === 'image')) return b;

      touched = true;
      const kept = b.content.filter(x => x.type !== 'image');
      const dropped = b.content.length - kept.length;
      kept.push({
        type: 'text',
        text: `[${dropped} frame${dropped === 1 ? '' : 's'} from this preview were released — they show an older version of the file. Call preview_frames again if you need to look now.]`
      });
      return { ...b, content: kept };
    });

    return touched ? { ...m, content } : m;
  });
}

/**
 * Compacts verbatim file payloads in historical assistant tool_use calls.
 *
 * When an agent writes or edits files (e.g. write_file with 500 lines), once that turn is
 * answered and settled (older than the immediate active exchange), the verbatim code in the
 * request history is redundant because the file already exists on disk as the source of truth.
 *
 * Compacting historical payloads to lightweight receipts saves 20,000-50,000 tokens per run
 * while preserving exact tool_use IDs, parameter schemas, and tool_use <-> tool_result pairing.
 */
function compactHistoricalToolInputs(msgs) {
  if (!Array.isArray(msgs) || msgs.length <= 4) return msgs;
  const cutoff = msgs.length - 4;

  return msgs.map((m, idx) => {
    if (idx >= cutoff || !Array.isArray(m.content)) return m;

    let modified = false;

    if (m.role === 'assistant') {
      const newContent = m.content.map(b => {
        if (b.type === 'tool_use' && b.input && typeof b.input === 'object') {
          if (b.name === 'write_file' && typeof b.input.content === 'string' && b.input.content.length > 300) {
            modified = true;
            const lines = b.input.content.split('\n').length;
            return {
              ...b,
              input: {
                path: b.input.path,
                content: `[Verbatim content of ${lines} lines written to disk. Disk file is source of truth.]`
              }
            };
          }
          if (b.name === 'edit_file' && typeof b.input.replacement === 'string' && b.input.replacement.length > 300) {
            modified = true;
            return {
              ...b,
              input: {
                path: b.input.path,
                target: b.input.target?.slice(0, 100) + '...',
                replacement: `[Replacement applied to disk (${b.input.replacement.length} chars). Disk file is source of truth.]`
              }
            };
          }
        }
        return b;
      });
      return modified ? { ...m, content: newContent } : m;
    }

    if (m.role === 'user') {
      const newContent = m.content.map(b => {
        if (b.type === 'tool_result') {
          if (Array.isArray(b.content)) {
            let nestedModified = false;
            const compactedInner = b.content.map(inner => {
              // Never truncate skill instructions loaded into context
              if (inner.type === 'text' && typeof inner.text === 'string' && inner.text.includes('# SKILL:')) {
                return inner;
              }
              if (inner.type === 'text' && typeof inner.text === 'string' && inner.text.length > 3000) {
                nestedModified = true;
                return {
                  ...inner,
                  text: `[Output truncated for older turn. Original was ${inner.text.length} chars.]\n` + inner.text.slice(0, 1500) + '\n...\n' + inner.text.slice(-800)
                };
              }
              return inner;
            });
            if (nestedModified) {
              modified = true;
              return { ...b, content: compactedInner };
            }
          } else if (typeof b.content === 'string') {
            if (!b.content.includes('# SKILL:') && b.content.length > 3000) {
              modified = true;
              return {
                ...b,
                content: `[Output truncated for older turn. Original was ${b.content.length} chars.]\n` + b.content.slice(0, 1500) + '\n...\n' + b.content.slice(-800)
              };
            }
          }
        }
        return b;
      });
      return modified ? { ...m, content: newContent } : m;
    }

    return m;
  });
}

/**
 * Extracts a concise summary of touched files and key decisions from turns about to be dropped.
 */
function summarizeDroppedTurns(droppedMsgs) {
  const filesTouched = new Set();
  const milestones = [];

  for (const m of droppedMsgs) {
    if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b.type === 'tool_use' && b.input?.path) {
          filesTouched.add(b.input.path);
        }
        if (b.type === 'text' && b.text && b.text.length > 30 && b.text.length < 300) {
          milestones.push(b.text.trim());
        }
      }
    }
  }

  const filesStr = filesTouched.size ? Array.from(filesTouched).join(', ') : 'None';
  const lastMilestone = milestones.length ? milestones[milestones.length - 1] : 'Active implementation';
  return `Files modified: ${filesStr} | Milestone: ${lastMilestone}`;
}

/**
 * Drops old turns when the transcript gets long.
 *
 * The subtlety that breaks naive compaction: every tool_use block MUST be answered by a
 * tool_result in the following message. Slice between them and the API returns a 400 that
 * looks like a model failure but is really a bookkeeping bug. So we only ever cut at a
 * boundary where no tool call is left dangling, and we drop whole assistant+result pairs.
 */
function getContextBudget(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus') || m.includes('sonnet') || m.includes('gpt-4') || m.includes('gemini')) return 500_000;
  return 320_000;
}

function compact(messages, emit, model) {
  const charBudget = getContextBudget(model);
  let total = messages.reduce((n, m) => n + messageChars(m), 0);
  if (total <= charBudget) return messages;

  const keep = [...messages];
  const firstUser = keep.length ? [keep.shift()] : [];   // the original request stays
  const droppedList = [];
  let dropped = 0;

  while (keep.length > 4 && total > charBudget) {
    const removed = keep.shift();
    droppedList.push(removed);
    total -= messageChars(removed);
    dropped++;

    // If we just removed an assistant turn that made tool calls, its tool_results are
    // now orphaned — take them with it.
    const madeToolCalls = Array.isArray(removed.content) &&
      removed.content.some(p => p.type === 'tool_use');
    if (madeToolCalls && keep.length && Array.isArray(keep[0].content) &&
        keep[0].content.some(p => p.type === 'tool_result')) {
      const toolRes = keep.shift();
      droppedList.push(toolRes);
      total -= messageChars(toolRes);
      dropped++;
    }
  }

  // A user message carrying tool_results can never lead the conversation.
  while (keep.length && Array.isArray(keep[0].content) &&
         keep[0].content.some(p => p.type === 'tool_result')) {
    const orphanRes = keep.shift();
    droppedList.push(orphanRes);
    total -= messageChars(orphanRes);
    dropped++;
  }

  if (emit) emit({ type: 'notice', text: `compacted context — dropped ${dropped} older turns` });

  const memorySummary = summarizeDroppedTurns(droppedList);

  const compacted = [
    ...firstUser,
    { role: 'assistant', content: 'Understood. Continuing with project implementation.' },
    { role: 'user', content: `[${dropped} earlier turns were trimmed to stay within context budget.\n<session_memory>\n${memorySummary}\nAll files on disk are the source of truth — use read_file if you need specific details.\n</session_memory>]` },
    ...keep
  ];

  return dropDanglingToolUse(compacted);
}

/**
 * PROMPT CACHING
 *
 * The beta header for caching was already being sent, but nothing in the request ever
 * carried a `cache_control` breakpoint — so it did nothing. That is the single largest
 * avoidable cost here: the system prompt and the full tool schemas are byte-identical on
 * every turn, and a 50-turn build was re-reading both at full price 50 times.
 *
 * Three breakpoints, ordered the way the API matches the prefix (tools → system →
 * messages), so each one extends the last:
 *
 *   1. tools    — fixed for the whole process
 *   2. system   — fixed for the run
 *   3. history  — everything before the newest turn, which is the part that never
 *                 changes again once written
 *
 * The messages breakpoint is what makes this compound: turn N's request is turn N-1's
 * request plus one exchange, so all but the last turn is already a cache hit.
 */
const CACHE = { type: 'ephemeral' };

/** Marks the last tool schema, which caches every schema before it too. */
function cacheableTools(tools) {
  if (!Array.isArray(tools) || !tools.length) return tools;
  return tools.map((t, i) =>
    i === tools.length - 1 ? { ...t, cache_control: CACHE } : t
  );
}

/** System prompts arrive as a plain string here; blocks are what carry cache_control. */
function cacheableSystem(system) {
  if (!system) return system;
  if (typeof system === 'string') {
    return [{ type: 'text', text: system, cache_control: CACHE }];
  }
  if (!Array.isArray(system) || !system.length) return system;
  return system.map((b, i) =>
    i === system.length - 1 ? { ...b, cache_control: CACHE } : b
  );
}

/**
 * Caches the settled part of the conversation.
 *
 * The breakpoint goes on the second-to-last message, not the last: the newest turn is the
 * one being answered, and marking it would write a cache entry that the next turn's
 * breakpoint immediately supersedes. Everything before it is final, so that prefix is
 * read from cache on every remaining turn of the run.
 *
 * Only ever four breakpoints exist across a request (the API's limit), and tools and
 * system take two of them — so exactly one is placed here, and any breakpoint left over
 * from a previous turn is cleared first.
 */
function cacheHistory(msgs) {
  if (!Array.isArray(msgs) || msgs.length < 3) return msgs;

  const mark = msgs.length - 2;
  return msgs.map((m, i) => {
    if (!Array.isArray(m.content)) return m;

    // A block still carrying last turn's breakpoint would spend a slot for nothing.
    const clean = m.content.map(b =>
      b.cache_control ? { ...b, cache_control: undefined } : b
    );

    if (i !== mark) return { ...m, content: clean };

    // Thinking blocks are signed and cannot carry a breakpoint, so it goes on the last
    // block that can — normally the tool_use or tool_result that ends the turn anyway.
    const at = (() => {
      for (let j = clean.length - 1; j >= 0; j--) {
        const t = clean[j].type;
        if (t !== 'thinking' && t !== 'redacted_thinking') return j;
      }
      return -1;
    })();
    if (at < 0) return { ...m, content: clean };

    return {
      ...m,
      content: clean.map((b, j) => (j === at ? { ...b, cache_control: CACHE } : b))
    };
  });
}

/**
 * The same three breakpoints, for the callers that are not the build loop.
 *
 * Intake, chat replies and planning all go out through `callClaudeAnthropic`, which builds
 * its request by hand and so carried no breakpoint at all. Planning is the expensive one:
 * the plan skill block is ~18KB of system prompt, and every revision of the same plan was
 * re-uploading it at full price. The helpers below it are already proven by the build loop,
 * so exposing them is the entire fix.
 *
 * Each field passes through untouched when there is nothing to mark — no tools, no system,
 * or a conversation too short to have a settled part — so a caller can hand over whatever
 * it has without checking first.
 */
export function prepareCachedRequest({ system, tools, messages }) {
  return {
    system: cacheableSystem(system),
    tools: cacheableTools(tools),
    messages: cacheHistory(messages)
  };
}

/**
 * Last line of defence for the tool_use/tool_result pairing rule.
 *
 * The API rejects the whole request if any assistant tool_use is not answered by a
 * tool_result in the next message. Every individual path that builds history tries to
 * respect that, but they are several and they each have to get it right every time; this
 * runs over the finished array and drops any pair that did not survive, so one mistake
 * upstream costs a turn instead of the run.
 */
export function dropDanglingToolUse(msgs) {
  const out = [];

  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const calls = Array.isArray(m.content)
      ? m.content.filter(b => b.type === 'tool_use')
      : [];

    if (m.role !== 'assistant' || !calls.length) {
      out.push(m);
      continue;
    }

    const next = msgs[i + 1];
    const answered = new Set(
      next && Array.isArray(next.content)
        ? next.content.filter(b => b.type === 'tool_result').map(b => b.tool_use_id)
        : []
    );

    const orphans = calls.filter(c => !answered.has(c.id));
    if (!orphans.length) {
      out.push(m);
      continue;
    }

    const kept = m.content.filter(b => b.type !== 'tool_use' || answered.has(b.id));
    out.push({
      ...m,
      content: kept.length ? kept : [{ type: 'text', text: '(incomplete tool call omitted)' }]
    });
  }

  return out;
}

/**
 * Strips thinking blocks from history — but never from a turn that called a tool.
 *
 * This is the bug that kept coming back as a 400 mid-run. With extended thinking on,
 * the API requires that an assistant turn ending in tool_use keeps its thinking blocks,
 * signature intact, when it is sent back as history: the signature is what proves the
 * reasoning was not tampered with. Dropping it produced
 * "Expected `thinking` or `redacted_thinking`, but found `tool_use`" — and because the
 * agent loop sends the whole transcript on every turn, the very first tool call poisoned
 * every request after it. Retrying re-sent the same broken history, so all 6 retries
 * burned and the run died. It looked model-specific only because a model that happened
 * not to call a tool never tripped it.
 *
 * So: turns with tool_use keep everything. Plain prose turns are already finished and
 * their thinking is never re-read, so it is still dropped there to save tokens.
 */
function stripThinking(content, thinkingEnabled = true) {
  if (!Array.isArray(content)) return content;

  // With thinking off, a leftover thinking block is the thing the API objects to — the
  // rule inverts, so drop them everywhere.
  const hasToolUse = thinkingEnabled && content.some(p => p.type === 'tool_use');
  if (hasToolUse) return content;

  const kept = content.filter(p => p.type !== 'thinking' && p.type !== 'redacted_thinking');
  return kept.length ? kept : [{ type: 'text', text: '(continuing)' }];
}

/** Builds the tool_result block, attaching images when a tool returned frames. */
function toolResultBlock(id, outcome) {
  const parts = [];
  if (outcome.content) parts.push({ type: 'text', text: String(outcome.content).slice(0, 100_000) });

  // This is the whole point of preview_frames: the model gets to actually look.
  if (Array.isArray(outcome.images)) {
    outcome.images.forEach(img => {
      if (img.label) parts.push({ type: 'text', text: img.label });
      parts.push({
        type: 'image',
        source: { type: 'base64', media_type: img.media_type || 'image/jpeg', data: img.data }
      });
    });
  }

  return {
    type: 'tool_result',
    tool_use_id: id,
    is_error: outcome.isError === true,
    content: parts.length ? parts : [{ type: 'text', text: 'done' }]
  };
}

function isTransient(err) {
  const msg = (err && err.message ? err.message : '').toLowerCase();
  // A silent stream is the most retryable failure there is — the request never got a
  // real answer, so re-sending it is the only way to find out what the answer was.
  if (err && err.isStall) return true;
  // SDK throws this when the stream opens but closes with zero chunks. Same shape as
  // a stall except faster: the connection was accepted, then immediately dropped by the
  // upstream. Retrying it once is free, and the self-heal below drops thinking if the
  // second attempt also fails.
  if (msg.includes('ended without sending any chunks')) return true;
  if (msg.includes('content-blocked') || msg.includes('safety')) return false;
  if (msg.includes('invalid_request') || msg.includes('400')) return false;
  // An auth or permission failure will fail identically on every retry. Retrying it just
  // makes the user wait 90 seconds before seeing the same message.
  const status = err && err.status;
  if (status === 401 || status === 403 || status === 404) return false;
  return true;
}

/**
 * Turns an SDK or network error into something a user can act on.
 *
 * "Agent stopped" is the least useful thing a tool can say. The three failures that
 * actually happen here — a proxy rejecting the key, a rate limit, and a dead network —
 * need three different responses from the user, so they have to read differently.
 */
/**
 * The endpoint a given provider talks to.
 *
 * This mapping existed in three places — the Anthropic client, the OpenAI-compatible
 * fetch, and the error formatter — and they had already drifted, so an error could name
 * a different host than the one the request actually went to. One copy, one answer.
 */

export function inferProvider(config = {}) {
  const k = String(config.apiKey || '').trim();
  if (k.startsWith('sk-or-v1-')) return 'openrouter';
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('sk-proj-') || k.startsWith('sk-admin-')) return 'openai';
  if (k.startsWith('xai-')) return 'xai';
  if (k.startsWith('fw_')) return 'fireworks';
  if (k.startsWith('pplx-')) return 'perplexity';

  let url = (config.apiEndpoint || '').trim().toLowerCase();
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('opencode.ai/zen/go')) return 'opencode-go';
  if (url.includes('opencode.ai')) return 'opencode-zen';
  if (url.includes('groq.com')) return 'groq';
  if (url.includes('deepseek.com')) return 'deepseek';
  if (url.includes('together.xyz')) return 'together';
  if (url.includes('openai.com')) return 'openai';
  if (url.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (url.includes('x.ai')) return 'xai';
  if (url.includes('mistral.ai')) return 'mistral';
  if (url.includes('fireworks.ai')) return 'fireworks';
  if (url.includes('perplexity.ai')) return 'perplexity';
  if (url.includes('cerebras.ai')) return 'cerebras';
  if (url.includes('sambanova.ai')) return 'sambanova';
  if (url.includes('siliconflow.cn') || url.includes('siliconflow.com')) return 'siliconflow';
  if (url.includes('11434')) return 'ollama';
  if (url.includes('1234')) return 'lmstudio';
  if (url.includes('tokenrouter.com')) return 'tokenrouter';
  if (url.includes('kie.ai')) return 'kie';
  if (url.includes('piapi.ai')) return 'piapi';
  if (url.includes('anthropic.com')) return 'anthropic';
  if (url.includes('agentrouter.org/v1')) return 'agentrouter-openai';
  if (url.includes('agentrouter.org')) return 'agentrouter';
  if (config.provider) {
    const p = String(config.provider).trim().toLowerCase();
    if (p) return p;
  }
  return 'agentrouter';
}

export function resolveBaseUrl(config = {}) {
  let baseUrl = (config.apiEndpoint || '').trim().replace(/\/$/, '');
  const provider = inferProvider(config);

  const KNOWN = {
    openrouter:     'https://openrouter.ai/api/v1',
    opencode:       'https://opencode.ai/zen/v1',
    'opencode-zen': 'https://opencode.ai/zen/v1',
    'opencode-go':  'https://opencode.ai/zen/go/v1',
    tokenrouter:    'https://api.tokenrouter.com/v1',
    openai:         'https://api.openai.com/v1',
    groq:           'https://api.groq.com/openai/v1',
    deepseek:       'https://api.deepseek.com/v1',
    gemini:         'https://generativelanguage.googleapis.com/v1beta/openai',
    xai:            'https://api.x.ai/v1',
    kie:            'https://api.kie.ai/v1',
    piapi:          'https://api.piapi.ai/v1',
    together:       'https://api.together.xyz/v1',
    mistral:        'https://api.mistral.ai/v1',
    fireworks:      'https://api.fireworks.ai/inference/v1',
    perplexity:     'https://api.perplexity.ai',
    cerebras:       'https://api.cerebras.ai/v1',
    sambanova:      'https://api.sambanova.ai/v1',
    siliconflow:    'https://api.siliconflow.cn/v1',
    ollama:         'http://localhost:11434/v1',
    lmstudio:       'http://localhost:1234/v1',
    'agentrouter-openai': 'https://agentrouter.org/v1',
    agentrouter:    'https://agentrouter.org',
    anthropic:      'https://api.anthropic.com'
  };

  const keyPrefix = String(config.apiKey || '').trim();
  const isKeyProvider = keyPrefix.startsWith('sk-or-v1-') || keyPrefix.startsWith('sk-ant-') || keyPrefix.startsWith('gsk_') || keyPrefix.startsWith('sk-proj-') || keyPrefix.startsWith('xai-') || keyPrefix.startsWith('fw_') || keyPrefix.startsWith('pplx-');

  if (!baseUrl || isKeyProvider || (baseUrl.includes('agentrouter.org') && provider !== 'agentrouter')) {
    return KNOWN[provider] || 'https://agentrouter.org';
  }

  return baseUrl;
}

export function logError(projectDir, errorDetails) {
  try {
    const dir = projectDir || process.cwd();
    const logDir = path.join(dir, '.anymotion');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'errors.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      ...errorDetails
    };
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (_) {}
}

export function describeApiError(err, config = {}) {
  if (!err) return 'Unknown error.';

  if (err.isStall) return err.message;

  const status = err.status || err.statusCode;
  const raw = err.message || String(err);
  const endpoint = resolveBaseUrl(config).replace(/^https?:\/\//, '');

  // The SDK keeps the parsed error body, and on a 400 it is the only thing that says what
  // was actually wrong. Dropping it in favour of a canned guess is how "tool_use ids were
  // found without tool_result blocks" spent two runs disguised as a model-name problem.
  const upstream = (() => {
    const body = err.error;
    const m = (body && body.error && body.error.message) || (body && body.message);
    return typeof m === 'string' && m.trim() ? m.trim() : '';
  })();

  const code = err.code || (err.cause && err.cause.code) || '';

  // Network-layer failures never reach the API, so a status code is not available.
  const NET = {
    ENOTFOUND:     `Cannot resolve ${endpoint} — check your internet connection or the apiEndpoint in /config.`,
    ECONNREFUSED:  `${endpoint} refused the connection — the endpoint may be down, or the port in apiEndpoint is wrong.`,
    ECONNRESET:    `${endpoint} dropped the connection mid-request. Usually transient — try again.`,
    ETIMEDOUT:     `${endpoint} timed out. The proxy may be overloaded.`,
    EAI_AGAIN:     `DNS lookup for ${endpoint} failed temporarily — check your connection.`,
    EPIPE:         `The connection to ${endpoint} closed while the request was still being sent. Usually transient — try again.`,
    EHOSTUNREACH:  `No route to ${endpoint} — check your network, VPN, or proxy settings.`,
    ENETUNREACH:   `The network is unreachable — this machine appears to be offline.`,
    ECONNABORTED:  `The connection to ${endpoint} was aborted mid-flight. Usually transient — try again.`,
    // TLS failures are their own category: retrying never helps, and the fix is never
    // "wait a moment" — it is a clock, a proxy, or a certificate store.
    CERT_HAS_EXPIRED:                    `${endpoint} presented an expired TLS certificate. Check this machine's clock, or whether a corporate proxy is intercepting HTTPS.`,
    DEPTH_ZERO_SELF_SIGNED_CERT:         `${endpoint} presented a self-signed certificate — usually a corporate HTTPS proxy. Its root certificate has to be trusted by Node.`,
    UNABLE_TO_VERIFY_LEAF_SIGNATURE:     `The TLS certificate chain from ${endpoint} could not be verified — often a corporate proxy in the middle.`,
    SELF_SIGNED_CERT_IN_CHAIN:           `A self-signed certificate is in the chain from ${endpoint} — usually a corporate HTTPS proxy.`
  };
  if (NET[code]) return `${code} — ${NET[code]}`;

  // A silent close is not a network code and not a status, so it is matched on text. It
  // is worth naming precisely because the cause is almost never the network — an endpoint
  // that accepts a connection and then closes it without a byte is rejecting the request
  // without bothering to say so.
  if (/ended without sending any chunks/i.test(raw)) {
    return `${endpoint} accepted the request and then closed it without sending anything. ` +
           `Usually the request shape was refused upstream — thinking is disabled automatically and retried. ` +
           `If it persists, try /model, or check the key's access to this model.`;
  }

  const HTTP = {
    400: `400 Bad Request — ${endpoint} rejected the request shape.`,
    401: `401 Unauthorized — your API key was rejected by ${endpoint}. Set a valid key with /key.`,
    402: `402 Payment Required — the account behind this key is out of credit at ${endpoint}. Top it up, or use a different key with /key.`,
    403: `403 Forbidden — ${endpoint} blocked this request. The key may lack access to this model, or the proxy is filtering it. Try /model, or check the key's plan.`,
    404: `404 Not Found — ${endpoint} has no route for this request. The apiEndpoint may be missing a path, or the model does not exist there.`,
    408: `408 Request Timeout — ${endpoint} gave up waiting for the request. Usually transient — try again.`,
    413: `413 Payload Too Large — the conversation is too big for this endpoint. Start a fresh chat, or lower /think.`,
    422: `422 Unprocessable — ${endpoint} understood the request but refused its contents. Often an unsupported parameter for this model: try /model.`,
    429: `429 Rate Limited — ${endpoint} is throttling you. Wait a moment, or switch to a lighter model with /model.`,
    500: `500 Server Error — ${endpoint} failed internally. Not your request; retry shortly.`,
    502: `502 Bad Gateway — ${endpoint} could not reach the upstream model provider.`,
    503: `503 Service Unavailable — ${endpoint} is overloaded or down for maintenance.`,
    504: `504 Gateway Timeout — ${endpoint} waited too long for the upstream model and gave up.`,
    529: `529 Overloaded — the model provider is at capacity. Retry in a minute.`
  };
  if (status && HTTP[status]) {
    // The upstream sentence is the specific one; the mapped line is the advice around it.
    // A 400 without it reads as "something was wrong somewhere", which is unactionable.
    return upstream ? `${HTTP[status]} ${upstream}` : HTTP[status];
  }

  // Unmapped statuses still carry their class, which is what decides whether waiting helps.
  if (status >= 500) return `HTTP ${status} from ${endpoint} — a server-side failure, not your request. ${raw.slice(0, 160)}`;
  if (status >= 400) return `HTTP ${status} from ${endpoint} — the request was rejected. ${raw.slice(0, 160)}`;
  if (status) return `HTTP ${status} from ${endpoint} — ${raw.slice(0, 200)}`;

  if (/abort/i.test(raw)) return 'Request aborted.';
  if (/terminated|UND_ERR_BODY_TERMINATED/i.test(raw)) {
    return `Connection closed by proxy (120s gateway timeout) — extended thinking exceeded proxy time limit.`;
  }
  if (/fetch failed/i.test(raw)) {
    return `Network request to ${endpoint} failed — no response at all. Check your connection, VPN, or firewall.`;
  }
  // JSON parse failures against a proxy almost always mean an HTML error page came back.
  if (/unexpected token|is not valid json/i.test(raw)) {
    return `${endpoint} returned something that was not JSON — usually an HTML error or captcha page from a proxy or gateway.`;
  }
  return raw.slice(0, 300);
}

/**
 * Runs the agent until it stops asking for tools.
 *
 * @param {object}   o
 * @param {Array}    o.messages          conversation so far (mutated in place, so the
 *                                       caller keeps the history for the next request)
 * @param {string}   o.system            system prompt
 * @param {object}   o.project           { name, dir, htmlFile, exportsDir, meta }
 * @param {object}   o.config
 * @param {Function} o.emit              event sink
 * @param {Function} o.requestApproval   async (name, input, preview) => 'yes'|'no'|'always'
 * @param {Function} [o.askUser]         async ({ question, options, context, allowCustom })
 *                                       => { text, custom?, cancelled? }. Omit it and the
 *                                       ask_user tool degrades to a documented assumption
 *                                       rather than hanging on a prompt nobody can see.
 * @param {AbortSignal} [o.signal]
 * @returns {Promise<{ text, turns, toolCalls, todos, stopReason }>}
 */
export async function runAgentLoop(o) {
  const {
    messages, system, project, config,
    emit = () => {}, requestApproval = async () => 'yes', askUser, signal
  } = o;

  const client = makeClient(config);
  const model = o.model || config.model || 'claude-opus-5';
  // `off` is a real choice and must survive the lookup, so this cannot use `||` — that
  // turned an explicit 0 back into a budget. Anything unrecognised thinks at 'high'
  // rather than silently dropping to the cheapest setting.
  const rawBudget = THINKING_BUDGETS[o.thinking] ?? THINKING_BUDGETS.high;

  // AgentRouter uses AWS Bedrock/Vertex backend which emits encrypted thinking signatures (signature_delta).
  // Cap the budget to 2048 so reasoning finishes fast (15-25s) without exceeding the proxy's 120s gateway limit.
  const provider = inferProvider(config);
  const budget = (provider === 'agentrouter' && rawBudget > 2048) ? 2048 : rawBudget;

  const tools = toolSchemas();

  // Set once, by the self-heal below, when the endpoint proves it will not accept
  // extended thinking on this run. Latched for the rest of the run so every later turn
  // is built in the shape that actually worked, instead of failing and healing again.
  let thinkingDisabled = false;

  // Shared across every tool call in this run, so update_todos can park state where the
  // next tool (and the TUI) can see it.
  const ctx = {
    project,
    config,
    signal,
    emit,
    todos: Array.isArray(o.todos) && o.todos.length ? [...o.todos] : [],
    // Passed straight through to the ask_user tool. Left undefined when the caller has no
    // UI, which the tool checks for rather than blocking on a promise nobody will resolve.
    askUser,
    // Approval that the user granted for the rest of the run via "a".
    autoApproved: new Set()
  };

  let turns = 0;
  let toolCalls = 0;
  let narration = '';
  let stopReason = 'complete';
  let todoNudgeCount = 0;
  let entryNudgeCount = 0;
  const nudged = new Set();

  while (turns < MAX_TURNS) {
    if (signal?.aborted) { stopReason = 'aborted'; break; }
    turns++;
    emit({ type: 'turn', n: turns, of: MAX_TURNS });

    const plan = resolveTokenPlan(model, thinkingDisabled ? 0 : budget);

    const activeTodosPrompt = ctx.todos && ctx.todos.length
      ? `\n\n# CURRENT ACTIVE TODO LIST:\n` + ctx.todos.map(t => `- [${t.status.toUpperCase()}] ${t.text}`).join('\n') + `\n\nIMPORTANT: Carry out the active task now. Call the required file or command tools immediately. Do not stop until all tasks are marked DONE.`
      : '';

    let projectStatePrompt = '';
    if (project?.dir && fs.existsSync(project.dir)) {
      try {
        const files = fs.readdirSync(project.dir).filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== 'exports');
        const fileStats = files.map(f => {
          try {
            const sz = fs.statSync(path.join(project.dir, f)).size;
            return `${f} (${Math.round(sz / 1024 * 10) / 10}KB)`;
          } catch (_) { return f; }
        });
        if (fileStats.length) {
          projectStatePrompt = `\n\n# PROJECT DISK STATE (${path.basename(project.dir)}):\nExisting files: ${fileStats.join(', ')}\nDisk files are always the authoritative source of truth.`;
        }
      } catch (_) {}
    }

    const effectiveSystem = typeof system === 'string' 
      ? system + activeTodosPrompt + projectStatePrompt
      : (Array.isArray(system) ? [...system, { type: 'text', text: activeTodosPrompt + projectStatePrompt }] : system);

    const params = {
      model,
      max_tokens: plan.maxTokens,
      system: cacheableSystem(effectiveSystem),
      messages: cacheHistory(
        pruneStaleImages(dropDanglingToolUse(compact(compactHistoricalToolInputs(messages), emit, model)))
          .map(m => ({ ...m, content: stripThinking(m.content, plan.budget > 0) }))
      ),
      tools: cacheableTools(tools)
    };
    if (plan.budget) {
      params.thinking = { type: 'enabled', budget_tokens: plan.budget };
    }

    // ── request, with retries that resume rather than restart ──────────────────
    let finalMsg = null;
    let attempt = 0;
    let lastError = null;
    // Where this turn's narration starts. A retry re-sends the same request, so whatever
    // partial text the failed attempt streamed has to be rolled back first — otherwise a
    // stall halfway through a sentence leaves that half in the transcript twice.
    const narrationMark = narration.length;

    while (attempt <= MAX_RETRIES && !finalMsg) {
      narration = narration.slice(0, narrationMark);
      try {
        const provider = inferProvider(config);
        if (provider === 'anthropic' || provider === 'agentrouter') {
          const stream = await client.messages.stream(params, signal ? { signal } : undefined);
          await withStallGuard(stream, (event) => {
            if (event.type !== 'content_block_delta') return;
            const d = event.delta;
            if (d.type === 'text_delta' && d.text) {
              narration += d.text;
              emit({ type: 'text', text: d.text });
            } else if (d.type === 'thinking_delta' && d.thinking) {
              emit({ type: 'thinking', text: d.thinking });
            }
            // signature_delta is AgentRouter's encrypted thinking — no visible text
            // but the model IS working. Reaching this callback already rearms the
            // stall timer (withStallGuard calls __rearm on every event), so no
            // extra code is needed here. The important thing is that we do NOT
            // filter these events out before they reach the guard.
          }, signal);
          finalMsg = await stream.finalMessage();
        } else {
          finalMsg = await fetchOpenAIAgentStream(params, config, signal, emit);
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = err;
        const explained = describeApiError(err, config);

        // Self-heal: thinking-related failures are recoverable — strip all thinking
        // blocks from history and retry once. Two symptoms, same cause:
        //
        //   1. 400 "Expected `thinking` or `redacted_thinking`…" — the proxy saw a
        //      tool_use turn without its thinking signature and rejected the shape.
        //   2. "request ended without sending any chunks" — the proxy accepted the
        //      connection but closed it before a single token. Some intermediaries do
        //      this instead of a 400 when the thinking parameters are invalid for the
        //      upstream model they route to.
        //
        // Both are solved the same way: drop thinking for the rest of the run. The model
        // loses its reasoning trail but the run continues rather than dying on turn 1.
        const msg = String(err.message || '').toLowerCase();
        const status = err.status || err.statusCode;
        const isBadRequest = status === 400 || msg.includes('400') || msg.includes('invalid_request');
        const mentionsThinking = msg.includes('thinking') || msg.includes('budget_tokens') ||
                                 msg.includes('max_tokens');
        const isSilentReject = msg.includes('ended without sending any chunks') && params.thinking;
        const isThinkingShapeError = (isBadRequest && mentionsThinking) || isSilentReject;

        if (isThinkingShapeError && attempt === 0) {
          emit({ type: 'notice', text: 'thinking rejected by endpoint — disabling and retrying' });
          // Latch it, so the remaining turns of this run are built without thinking from
          // the start rather than each one failing once and healing again.
          thinkingDisabled = true;
          delete params.thinking;
          params.messages = params.messages.map(m => ({
            ...m,
            content: stripThinking(m.content, false)
          }));
          attempt++;
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        // Auto-scale thinking budget if proxy times out at 120s
        if ((msg.includes('terminated') || msg.includes('stall') || msg.includes('timeout') || msg.includes('econnreset')) && params.thinking && params.thinking.budget_tokens > 2048) {
          params.thinking.budget_tokens = 2048;
          emit({ type: 'notice', text: 'extended thinking hit proxy 120s limit — scaled to fast 2048 budget' });
        }

        if (!isTransient(err)) {
          // A permanent failure is worth naming loudly before it unwinds — the throw
          // below reaches the caller, but the event reaches the transcript, where the
          // user is actually looking.
          emit({ type: 'error', text: explained, fatal: true });
          logError(project?.dir, {
            model,
            provider: inferProvider(config),
            status: err.status || err.statusCode,
            message: err.message,
            explained,
            turn: turns
          });
          err.explained = explained;
          throw err;
        }

        attempt++;
        if (attempt > MAX_RETRIES) break;
        const wait = Math.min(20_000, 2000 * attempt);
        emit({ type: 'notice', text: `${explained} — retry ${attempt}/${MAX_RETRIES} in ${wait / 1000}s` });
        await new Promise(r => setTimeout(r, wait));
      }
    }

    if (!finalMsg) {
      const explained = describeApiError(lastError, config);
      emit({
        type: 'error',
        text: `Gave up after ${MAX_RETRIES} retries. ${explained}`,
        fatal: true
      });
      const err = lastError || new Error('The model did not respond.');
      err.explained = explained;
      throw err;
    }

    // Usage drives the `↓ 7.0k tokens` meter. Emitted per turn rather than accumulated
    // here so the caller decides whether to show it at all.
    if (finalMsg.usage) emit({ type: 'usage', usage: finalMsg.usage });

    messages.push({ role: 'assistant', content: finalMsg.content });

    // ── max_tokens: ask it to continue instead of losing the turn ──────────────
    //
    // Careful: hitting the ceiling *during* a tool call leaves a `tool_use` block that was
    // cut off mid-argument. The API requires every tool_use to be answered by a
    // tool_result in the very next message, so appending a plain "continue" prompt here
    // produces "tool_use ids were found without tool_result blocks" — a 400 that then
    // repeats on all six retries, because the broken pair is already in history.
    //
    // This is the failure that kept landing on the same step of a run: the biggest
    // write_file of the build is the one that runs out of tokens mid-argument, so it looked
    // like that specific tool was cursed. Drop the truncated call and ask for a smaller
    // one; keeping it is not an option, since its arguments are incomplete anyway.
    if (finalMsg.stop_reason === 'max_tokens') {
      const truncated = Array.isArray(finalMsg.content) &&
        finalMsg.content.some(b => b.type === 'tool_use');

      if (truncated) {
        messages.pop();
        const salvaged = finalMsg.content.filter(b => b.type !== 'tool_use');
        messages.push({
          role: 'assistant',
          content: salvaged.length ? salvaged : [{ type: 'text', text: '(cut off at the output limit)' }]
        });
        messages.push({
          role: 'user',
          content: 'Your last tool call ran past the output limit and was discarded before it could run — nothing was written. Split it into smaller pieces: write_file with the first section only, then extend it with edit_file. Do not resend the call that was too large.'
        });
        emit({ type: 'notice', text: 'tool call exceeded the output limit — asking for smaller writes' });
        continue;
      }

      messages.push({
        role: 'user',
        content: 'You hit the output limit mid-answer. Continue exactly where you stopped — do not repeat anything and do not start over.'
      });
      continue;
    }

    if (finalMsg.stop_reason !== 'tool_use') {
      // ── premature end_turn: nudge once per unfinished-work reason ───────────
      const entry = project.htmlFile || path.join(project.dir, 'index.html');
      let missingFiles = [];
      let entryWritten = false;

      if (fs.existsSync(entry)) {
        try {
          entryWritten = fs.statSync(entry).size > 0;
          const html = fs.readFileSync(entry, 'utf-8');
          const scriptMatches = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
          const cssMatches = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gi)].map(m => m[1]);
          for (const rel of [...scriptMatches, ...cssMatches]) {
            if (!/^https?:\/\//i.test(rel) && !rel.startsWith('data:')) {
              const fullPath = path.resolve(project.dir, rel);
              if (!fs.existsSync(fullPath)) {
                missingFiles.push(rel);
              }
            }
          }
        } catch (_) {}
      }

      const unfinished = ctx.todos.filter(t => t.status !== 'done');

      let nudge = null;
      if (!entryWritten && entryNudgeCount < 3) {
        entryNudgeCount++;
        nudge = `CRITICAL: You ended your turn with conversational text, but ${path.basename(entry)} does NOT exist on disk yet. Do NOT output conversational text, explanations, or promises. You MUST immediately invoke the write_file tool to create ${path.basename(entry)}, then verify it with check_composition.`;
      } else if (missingFiles.length > 0 && entryNudgeCount < 4) {
        entryNudgeCount++;
        nudge = `CRITICAL: ${path.basename(entry)} references ${missingFiles.join(', ')}, but these files DO NOT exist on disk yet. The animation will not run without them. You MUST immediately invoke write_file to create ${missingFiles[0]}, then complete the remaining files.`;
      } else if (toolCalls === 0 && entryNudgeCount < 2) {
        entryNudgeCount++;
        nudge = `CRITICAL: You explained your plan in chat text but did not execute any tools. You are an autonomous builder agent. You MUST invoke write_file or edit_file immediately to implement the required code.`;
      } else if (unfinished.length && todoNudgeCount < 4) {
        todoNudgeCount++;
        const next = unfinished.map(t => `- [${t.status.toUpperCase()}] ${t.text}`).join('\n');
        nudge = `You ended your turn with work still open on your task list:\n${next}\n\nDo not stop or narrate promises — immediately invoke the required tools to complete the open items and update_todos to mark them done.`;
      }

      if (nudge) {
        emit({ type: 'notice', text: 'agent stopped early — continuing it' });
        messages.push({ role: 'user', content: nudge });
        continue;
      }

      stopReason = finalMsg.stop_reason || 'complete';
      break;
    }

    // ── run the tools it asked for ─────────────────────────────────────────────
    const requests = finalMsg.content.filter(b => b.type === 'tool_use');
    const results = [];

    for (const block of requests) {
      if (signal?.aborted) { stopReason = 'aborted'; break; }

      // Validate truncated file tool inputs before showing or running
      const isFileTool = ['write_file', 'edit_file', 'read_file'].includes(block.name);
      if (isFileTool && (!block.input || typeof block.input !== 'object' || !block.input.path)) {
        const errDesc = `Tool call "${block.name}" failed: argument payload was truncated mid-stream before 'path' could be transmitted. ` +
                        `Split into clean modular files (index.html, style.css, timeline.js).`;
        results.push(toolResultBlock(block.id, { isError: true, content: errDesc }));
        emit({ type: 'tool_result', id: block.id, name: block.name, summary: 'truncated arguments — path missing', isError: true });
        continue;
      }

      const label = labelTool(block.name, block.input);
      emit({ type: 'tool_start', id: block.id, name: block.name, label, input: block.input });

      // ── approval gate ────────────────────────────────────────────────────────
      const needsApproval =
        config.fileApprovalMode !== 'auto' &&
        requiresApproval(block.name) &&
        !ctx.autoApproved.has(block.name);

      if (needsApproval) {
        const preview = previewTool(block.name, block.input, ctx);
        let verdict;
        try {
          verdict = await requestApproval(block.name, block.input, preview);
        } catch (_) {
          verdict = 'no';
        }

        if (verdict === 'always') ctx.autoApproved.add(block.name);

        if (verdict === 'no') {
          // Denial is information, not an error: tell the model plainly so it adapts
          // rather than retrying the identical call.
          results.push(toolResultBlock(block.id, {
            isError: true,
            content: `The user declined ${block.name}. Do not retry it. Ask what they would prefer, or take a different approach.`
          }));
          emit({ type: 'tool_result', id: block.id, name: block.name, summary: 'declined by user', isError: true });
          continue;
        }
      }

      const outcome = await dispatch(block.name, block.input, ctx);
      toolCalls++;
      results.push(toolResultBlock(block.id, outcome));
      emit({
        type: 'tool_result',
        id: block.id,
        name: block.name,
        summary: outcome.summary,
        isError: outcome.isError,
        meta: outcome.meta
      });
    }

    if (stopReason === 'aborted') {
      // Ctrl+C between two tool calls leaves this turn's `tool_use` blocks unanswered, and
      // `messages` is the array the caller keeps as chat history. Send it back as-is and the
      // NEXT request — a plain question, minutes later — is rejected with "tool_use ids were
      // found without tool_result blocks", because the damage is upstream of anything that
      // request did. Answering the calls we skipped closes the pairs before we unwind.
      const answered = new Set(results.map(r => r.tool_use_id));
      const missing = requests
        .filter(b => !answered.has(b.id))
        .map(b => toolResultBlock(b.id, {
          isError: true,
          content: 'The user stopped the run before this tool ran. Nothing was executed.'
        }));
      if (missing.length) results.push(...missing);
      if (results.length) messages.push({ role: 'user', content: results });
      break;
    }
    if (!results.length) { stopReason = 'complete'; break; }

    messages.push({ role: 'user', content: results });
  }

  if (turns >= MAX_TURNS && stopReason === 'complete') stopReason = 'turn-limit';

  emit({ type: 'done', reason: stopReason, turns, toolCalls });

  return { text: narration.trim(), turns, toolCalls, todos: ctx.todos, stopReason };
}

/** Exposed so callers can size progress bars / warnings against the same number. */
export const AGENT_MAX_TURNS = MAX_TURNS;
