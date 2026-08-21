import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../config/config-manager.js';
import { extractBrand, formatBrand } from './tools/web-tools.js';
import { researchBrief, hasUrl } from './research.js';
import { skillSearchRoots, skillCatalogue, PRIMARY_SKILLS, listSkills, readSkill } from './skills.js';
import { resetFileMemory } from './tools/fs-tools.js';
import { runAgentLoop, resolveTokenPlan, resolveBaseUrl, withStallGuard, dropDanglingToolUse, prepareCachedRequest, fetchOpenAIAgentStream, inferProvider } from './agent-loop.js';

// ============================================================
// SYSTEM PROMPTS — Motion Graphics AI Agent (SKILL-aware)
// ============================================================
const SYSTEM_MOTION_PLAN = `You are Anymotion — a world-class AI Motion Graphics Engineering Agent.
Your specialty is planning broadcast-quality, SaaS-style animated HTML5 motion graphics explainers.

When given a user's description, you must:
1. Analyze the request and extract: visual style, number of scenes, key elements, duration, animation style
2. Propose ONE highly detailed, definitive implementation plan.
3. If the user provided URLs, extract exact text, colors, and branding into a "profiles" array. This allows building exact brand-matching profiles from real data.
4. Output a structured JSON plan with this schema:
{
  "analysis": "brief analysis of the request",
  "folder": "suggested folder name (kebab-case, descriptive)",
  "plan": {
    "title": "Main Title of the Animation",
    "style": "visual style description (e.g. Apple Liquid Glass)",
    "scenes": ["scene 1 description", "scene 2 description"],
    "duration": "e.g. 15s",
    "quality": "720p | 1080p | 2k | 4k — the resolution the final MP4 is exported at",
    "colors": ["#primary", "#accent"],
    "animations": ["animation type 1", "animation type 2"]
  },
  "profiles": [
    {
      "name": "Brand Name",
      "colors": ["#primary", "#accent"],
      "context": "Exact key sentences extracted from the URL for use in scenes"
    }
  ],
  "questions": []
}

OUTPUT: Return ONLY strict valid JSON, no markdown, no code fences. Ensure all properties and strings are double-quoted, and absolutely do not miss any commas between array elements or object properties. Do not include trailing commas.

===========================================================================
RESEARCH BINDING — READ THIS BEFORE YOU PLAN ANYTHING
===========================================================================
The user's message may contain a block headed "### RESEARCH". That block was scraped live
from the brand's own website moments ago. It is fact, not suggestion, and it is the single
most important input you have. Plans that ignore it are wrong even when they are beautiful.

When a RESEARCH block is present:

1. READ IT FIRST — before you decide the style, the scenes, or a single colour. The brand
   already decided what it looks like; your job is to animate that decision, not replace it.

2. COLOURS come from the scraped palette, verbatim. The research block lists them under
   "Brand colours" (primary, secondary, accents, and highlight shades). Copy ALL the extracted
   branding colors (3 to 5 colors) directly into plan.colors and profiles[].colors.
   Do NOT default to indigo-on-black, do NOT "modernise" the palette, do NOT invent an accent
   because the scraped one seems dull. If the site uses blue, teal, orange, and purple,
   declare all of them in plan.colors so the film matches their complete brand identity.

   plan.colors is the BRAND PALETTE (3 to 5 distinct branding colors: Primary Brand, Accent,
   Secondary, Highlight/Gradient, and UI Accent). Do not put generic plain gray/white surface
   neutrals in plan.colors unless the brand is strictly monochrome.

3. TYPEFACES come from the scraped fonts. Name them in plan.style.

4. COPY comes from the scraped wording. Scene text should reuse the brand's own headlines,
   product names and phrasing — the words they chose to describe themselves are better
   than the words you would choose for them. Put the exact sentences you are building from
   into profiles[].context.

5. ASSETS: use only URLs listed under "VERIFIED ASSETS". Anything under "DEAD ASSETS" does
   not load — never reference it. If a logo is needed and none is verified, say so in
   analysis rather than pointing at a URL that will render a broken box.

6. profiles[] is mandatory whenever research is present — one entry per brand, filled from
   the scraped data, not from what you already believe about that company.

7. analysis must open by stating what the research told you about the brand — its palette,
   its voice, its positioning — and then explain how the plan follows from it. If you find
   yourself writing an analysis that would read identically without the research block,
   you have not used the research.

If no RESEARCH block is present, plan from the written brief and say plainly in analysis
that the palette and copy are your invention. The same discipline applies to an invented
palette: two or three colours, chosen to work together — not a spread of six.

===========================================================================
RENDER QUALITY — CARRY IT, DO NOT CHOOSE IT
===========================================================================
plan.quality is the resolution the finished MP4 is exported at, and it is one of exactly
four tokens: "720p", "1080p", "2k", "4k". Lowercase, no other spelling — that string is
handed straight to the render step, which rejects anything else.

The brief usually settles it, because the user was asked before you were called. When it
does, copy it across unchanged; it is a requirement, not a starting point. When the brief
is silent, write "1080p" and say in analysis that you defaulted to it.

Never invent a fifth option, never leave the field out, and never write it as a
description ("high quality", "1920x1080") — the token, and nothing else.

===========================================================================
SKILLS & TOOLS
===========================================================================
The core skill saas-explainer-motion is ALWAYS automatically loaded for you. You do not need to call the load_skill tool for it.
You may smartly choose and load other relevant skills from the catalogue (e.g. motion-audio, framer-motion) using the load_skill tool if you believe they are necessary for the user's specific request.

===========================================================================
WHEN TO ASK, AND WHEN TO DECIDE
===========================================================================
You have a "questions" array in your output. Use it sparingly and well.

Do NOT ask about anything you can decide competently yourself. A missing duration is not
a blocker — 30s is the right default for an explainer and you know it. A missing palette
is not a blocker either: pick one that fits the subject and say in analysis that you chose
it. The user came here to get a plan, not to fill in a form. Asking about things a
professional would simply decide makes you look junior, and it costs the user a round trip
before they have seen a single idea.

Ask ONLY when the answer would change the plan structurally and you genuinely cannot infer
it — where guessing wrong means the whole thing is built for the wrong purpose:
  - The subject itself is ambiguous in a way that changes the content ("make it about our
    product" — which product, out of several you have no way to rank?)
  - Two readings of the brief lead to genuinely different animations, and nothing in the
    message favours one
  - A hard external constraint you cannot see (a required aspect ratio for a specific
    placement, a mandated brand kit that was mentioned but not supplied)

Never ask more than 2 questions, and prefer 0. If you can plan it, plan it — the user can
always tell you to change it, and reacting to a concrete plan is easier for them than
answering questions in the abstract.

Ask in the SAME LANGUAGE the user wrote in. If the brief is Roman Urdu, the question is
Roman Urdu. Never ask in English just because your instructions are in English.

Each question: { "question": "...", "why": "what changes depending on the answer",
"options": [{ "label": "...", "description": "..." }] }. Options are suggestions, not a
closed set — the user can always answer in their own words.

Output "questions": [] when you have nothing that meets this bar. That is the normal case.`;

export const SYSTEM_MOTION_GENERATE = `PRIMARY CORE SKILL: saas-explainer-motion
You are a world-class motion graphics engineer and expert frontend developer.
Your goal is to build a broadcast-quality, pixel-perfect animated graphic using the primary saas-explainer-motion skill.

===========================================================================
SECTION A — LAYOUT & RESPONSIVENESS (MANDATORY — NEVER VIOLATE THESE RULES)
===========================================================================

RULE 1 — NO OVERLAPPING ELEMENTS:
  - Every content element must be inside a proper flex or grid container.
  - NEVER use bare top/left pixel values that cause elements to overlap at different screen sizes.
  - Each scene is divided into 3 clear zones using CSS Grid rows:
      grid-template-rows: auto 1fr auto;
    Zone 1 (header): badge + title + subtitle
    Zone 2 (content): cards / metrics / diagram (main focal element)
    Zone 3 (footer): CTA / tagline
  - Elements within each zone must use flexbox with explicit gap.
    Example: display: flex; flex-wrap: wrap; gap: 1.5rem; align-items: center;
  - Mentally test your layout at 800px, 1280px, and 1920px. Nothing should overlap at any width.

RULE 2 — FULLY RESPONSIVE SCALING:
  - Set font-size on :root to: font-size: clamp(12px, 1.4vw, 18px);
  - Use em or rem for ALL font sizes, padding, margin, border-radius, and gap values — NEVER raw pixel spacing.
  - Cards must use: flex: 1 1 14rem; min-width: 0; so they wrap and reflow cleanly.
  - NEVER use position: absolute for any content element.
    Reserve absolute positioning ONLY for background decorations (particles, glow orbs, noise overlay).

RULE 3 — TEXT SAFETY:
  - All text containers must have: overflow: hidden; text-overflow: ellipsis;
  - Titles: max 2 lines. font-size: clamp(1.8rem, 4vw, 3.5rem);
  - Body text: max 3 lines. font-size: clamp(0.85rem, 1.4vw, 1.1rem);
  - Badge / label text: max 1 line. font-size: clamp(0.6rem, 1vw, 0.8rem); letter-spacing: 0.1em; text-transform: uppercase;

RULE 4 — Z-INDEX DISCIPLINE:
  - Background decorations (gradient, particles, noise): z-index 0
  - All visible content (cards, text, badges): z-index 10
  - Overlay / HUD (play button, progress bar, scene counter): z-index 100
  - NEVER put visible content at z-index 0 — it will be invisible against the background.

===========================================================================
SECTION B — SCENE ARCHITECTURE & ELEMENT-LEVEL ANIMATION CONSISTENCY
===========================================================================

- Structure all scenes as full-screen section elements:
    position: absolute; inset: 0; opacity: 0; pointer-events: none;
  Active scene sets opacity to 1 and pointer-events to auto.
- Each scene uses CSS Grid internally:
    display: grid; grid-template-rows: auto 1fr auto; padding: 5% 7%; gap: 2rem;
- Scene transitions use ONLY opacity + transform (translateY or scale). Never use display or visibility switching.
- Minimum 3 scenes per animation. Each scene must have one distinct hero element as its focal point.
- ELEMENT-LEVEL ANIMATION CONSISTENCY (CRITICAL):
  • EVERY element in a scene (badge, title, subtitle, cards, icons, metrics, buttons) MUST be animated.
  • Unified Easing Curve: Use cubic-bezier(0.16, 1, 0.3, 1) across ALL elements for smooth Apple-style spring entrance.
  • Staggered Offsets: Stagger sibling items with 60ms–80ms delay increments (e.g. t+0.0s title, t+0.08s subtitle, t+0.16s card 1, t+0.24s card 2).
  • Cohesive Direction: Elements in the same container move in shared spatial directions (e.g. translateY(24px -> 0px) or scale(0.95 -> 1.0)).
  • Continuous Micro-Idle Motion: Keep elements alive during active holds with subtle 3D tilt, gentle floating (translateY(-4px) over 4s), pulsing metric counters, and shimmer sweeps.

===========================================================================
SECTION C — LIQUID GLASSMorphism & VISUAL STANDARDS
===========================================================================

1. AESTHETIC — Apple Liquid Glass / Dark Glassmorphism:
   - Background: radial-gradient(ellipse at 30% 40%, #0d0221 0%, #050510 100%)
   - Accent colors: vibrant cyan #00f5ff, electric indigo #818cf8, neon purple #a855f7
   - Liquid Glass Cards:
     background: rgba(255,255,255,0.04);
     backdrop-filter: blur(24px) saturate(180%);
     border: 1px solid rgba(255,255,255,0.12);
     border-radius: 1.4rem;
     box-shadow: 0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2);
     transform-style: preserve-3d;
   - Shimmer Sweeps & Glow Halos: Apply animated gradient borders and specular highlights.

2. TYPOGRAPHY & ASSET HARVESTING (PRIORITY REAL ASSETS):
   - Load from Google Fonts: Inter (UI text) + Outfit / Plus Jakarta Sans (display headings).
   - REAL ASSETS PRIORITY: Automatically fetch real SVG logos from SimpleIcons (https://cdn.simpleicons.org/{brand_name}) or iTunes/Unsplash API via fetch_asset BEFORE resorting to plain text placeholders, even if the user didn't explicitly provide logo URLs!
   - Metric numbers use font-variant-numeric: tabular-nums for clean alignment.

3. DYNAMIC MUSIC SELECTION & SOUND SYNC:
   - Match BGM track style to product type via add_background_music:
     • AI, Cloud, Dev, Security SaaS → tech_ambient or dark_glass_synth
     • Sales, Business, Enterprise, HR SaaS → upbeat_corporate
     • Creative, Minimalist, Productivity SaaS → minimal_chill
   - Note for Video Export: Video rendering captures clean visual frames to MP4; soundtrack and BGM provide clean background audio backing without raw un-synced scene noise glitches.

===========================================================================
SECTION D — TECHNICAL REQUIREMENTS (CRITICAL FOR EDITOR INTEGRATION)
===========================================================================

1. Main entry point MUST be named index.html.
2. TIMELINE INTEGRATION: All animated elements MUST have a \`data-layer="Descriptive Name"\` attribute and an \`id\`. The editor parses these to build the timeline tracks.
3. SCENE INTEGRATION: All scenes MUST have a \`data-scene="<index>"\` attribute (e.g. \`data-scene="0"\`).
4. FIXED STAGE METRICS: The root canvas MUST be a fixed 1920x1080 container:
     \`#stage { width: 1920px; height: 1080px; transform: scale(var(--stage-scale, 1)); transform-origin: center; }\`
   Include a \`fit()\` function in your JS that calculates \`window.innerWidth / 1920\` and updates \`--stage-scale\`. This is how the editor zooms the view. Do not use 100vw/vh for the stage itself.
5. Assets: Use fetch_asset / download_asset tool for external images or logos. NEVER leave empty src attributes.
6. Code quality: Split into index.html + style.css + timeline.js using write_file / edit_file for modular maintainability.
7. CRITICAL: Include a floating Play/Pause button overlay (bottom-right corner, z-index: 100) and a requestAnimationFrame loop that auto-increments time and calls window.seek(t) each frame.

OUTPUT: You are an autonomous tool-calling agent. Use write_file, edit_file, and validation tools to build the composition directly into the project folder. Do not output raw HTML in chat text.`;

export const SYSTEM_MOTION_CHAT = `You are Anymotion — an AI Motion Graphics Engineering Agent.
You are talking to a user in a terminal chat. Be concise, warm and practical.

You can help with: designing motion graphics, explaining animation techniques, advising on
timing/easing/color, and answering questions about the Anymotion editor.

Rules:
- Keep replies short — 2 to 5 sentences unless asked for detail. This is a terminal, not a document.
- Never output HTML or code blocks in chat. If the user wants an animation built, tell them you
  will plan it first and ask them to confirm.
- Plain text only. No markdown headings, no bullets with asterisks.`;

/**
 * Extended-thinking budgets in tokens. `off: 0` is listed explicitly so an intentional
 * "no thinking" survives the lookup as a real value instead of falling through a default
 * and being handed a budget back.
 */
export const THINKING_BUDGETS = {
  off: 0,
  low: 1024,
  medium: 2048,
  high: 4096,
  xhigh: 8192,
  max: 16384
};

export const THINKING_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Models offered by the /model picker. */
export const AVAILABLE_MODELS = [
  { id: 'claude-opus-5', label: 'Opus 5', note: 'most capable — best for complex compositions' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', note: 'balanced speed and quality' },
  { id: 'claude-fable-5', label: 'Fable 5', note: 'creative and stylistic work' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', note: 'fastest — quick drafts' }
];

function translateOpenRouterModel(rawModel) {
  if (!rawModel) return 'anthropic/claude-3.7-sonnet';
  const m = String(rawModel).trim();

  // If already contains a vendor prefix (e.g. "anthropic/claude-3.7-sonnet" or "openai/gpt-4o"), use directly
  if (m.includes('/')) return m;

  const lower = m.toLowerCase();
  if (lower.includes('opus')) return 'anthropic/claude-3-opus';
  if (lower.includes('sonnet')) return 'anthropic/claude-3.7-sonnet';
  if (lower.includes('fable')) return 'anthropic/claude-3.5-sonnet';
  if (lower.includes('haiku')) return 'anthropic/claude-3.5-haiku';
  if (lower.includes('gpt-4o')) return 'openai/gpt-4o';
  if (lower.includes('gpt-5') || lower.includes('sol')) return 'openai/gpt-4.5-preview';
  if (lower.includes('kimi')) return 'moonshotai/kimi-k3';

  return `anthropic/${m}`;
}

// ============================================================
// OPENAI COMPATIBLE FETCH (OpenRouter, OpenCode, Groq, etc)
// ============================================================
async function callOpenAICompatible(prompt, config, opts = {}) {
  const apiKey = config.apiKey;
  const provider = (inferProvider(config) === 'agentrouter' ? 'openrouter' : inferProvider(config));
  const baseUrl = resolveBaseUrl(config);

  const rawModel = opts.model || config.model || 'gpt-4o';
  const model = provider === 'openrouter' ? translateOpenRouterModel(rawModel) : rawModel;

  // Tools are handled by a different path entirely — see runOpenAIToolLoop.
  //
  // Everything below this line flattens messages to plain strings, which silently discards
  // tool_use and tool_result blocks. That was invisible while only the Anthropic path had
  // tools, and became a real behavioural split the moment intake started passing them: on
  // agentrouter the agent read sites and chose when to plan, and on openrouter the exact
  // same request fell back to the old keyword heuristic because its tools never left.
  if (opts.tools && opts.tools.length) {
    return runOpenAIToolLoop({ prompt, config, opts, model });
  }

  const openaiMessages = [];
  if (opts.system) {
    openaiMessages.push({ role: 'system', content: opts.system });
  }

  const inMsgs = opts.messages || [{ role: 'user', content: prompt }];
  for (const m of inMsgs) {
    let contentStr = m.content;
    if (Array.isArray(contentStr)) {
      contentStr = contentStr
        .map(b => (typeof b === 'string' ? b : b.text || b.content || ''))
        .filter(Boolean)
        .join('\n');
    }
    openaiMessages.push({ role: m.role, content: contentStr });
  }

  const payload = {
    model,
    messages: openaiMessages,
    stream: true,
    max_tokens: opts.maxTokens || 8192,
  };

  if (opts.thinking && opts.thinking !== 'off') {
    payload.include_reasoning = true;
    payload.reasoning = { max_tokens: THINKING_BUDGETS[opts.thinking] || 4096 };
  } else if (opts.thinking === 'off') {
    payload.reasoning_effort = 'none';
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

  let maxRetries = 10;
  let retryCount = 0;
  let success = false;
  let lastError = null;
  let finalText = '';

  while (retryCount <= maxRetries && !success) {
    let accumulatedFinalText = '';
    let accumulatedReasoning = '';

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: opts.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error ${response.status}: ${errText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      // Stall guard — same as fetchOpenAIAgentStream. Without this, reader.read()
      // on a socket that goes silent never settles, and the run hangs forever with no
      // error to show.  The timer resets on every chunk, so only genuine silence trips it.
      const STALL_TIMEOUT = 180_000;
      const FIRST_CHUNK_TIMEOUT = 420_000;
      let sawFirstChunk = false;

      while (true) {
        let stallTimer;
        let chunk;
        const budget = sawFirstChunk ? STALL_TIMEOUT : Math.max(STALL_TIMEOUT, FIRST_CHUNK_TIMEOUT);
        try {
          chunk = await Promise.race([
            reader.read(),
            new Promise((_, reject) => {
              stallTimer = setTimeout(() => {
                try { reader.cancel(); } catch (_) {}
                const err = new Error(
                  sawFirstChunk
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
        sawFirstChunk = true;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          if (trimmed === 'data: [DONE]') continue;

          try {
            const data = JSON.parse(trimmed.slice(6));
            const choice = data.choices && data.choices[0] ? data.choices[0] : null;
            if (!choice) continue;

            const delta = choice.delta || choice.message || {};
            const reasoning = delta.reasoning_content || delta.reasoning || delta.thinking || delta.thought;
            if (reasoning) {
              accumulatedReasoning += reasoning;
              if (opts.onThinking) opts.onThinking(reasoning);
            }

            const textChunk = delta.content !== undefined && delta.content !== null ? delta.content : (delta.text || choice.text);
            if (textChunk !== undefined && textChunk !== null) {
              accumulatedFinalText += textChunk;
              if (opts.onToken) opts.onToken(textChunk);
            }
          } catch (e) { }
        }
      }

      // Process leftover buffer
      if (buffer && buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const choice = data.choices && data.choices[0] ? data.choices[0] : null;
            if (choice) {
              const delta = choice.delta || choice.message || {};
              const reasoning = delta.reasoning_content || delta.reasoning || delta.thinking || delta.thought;
              if (reasoning) {
                accumulatedReasoning += reasoning;
                if (opts.onThinking) opts.onThinking(reasoning);
              }
              const textChunk = delta.content !== undefined && delta.content !== null ? delta.content : (delta.text || choice.text);
              if (textChunk !== undefined && textChunk !== null) {
                accumulatedFinalText += textChunk;
                if (opts.onToken) opts.onToken(textChunk);
              }
            }
          } catch (e) {}
        }
      }

      if (accumulatedFinalText && accumulatedFinalText.trim().length > 0) {
        finalText = accumulatedFinalText;
      } else if (accumulatedReasoning && accumulatedReasoning.trim().length > 0) {
        finalText = accumulatedReasoning;
      } else {
        // Fallback: try non-streaming request if stream produced empty text
        try {
          const nonStreamPayload = { ...payload, stream: false };
          const nsRes = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(nonStreamPayload),
            signal: opts.signal
          });
          if (nsRes.ok) {
            const nsData = await nsRes.json();
            const nsMsg = nsData.choices?.[0]?.message?.content || nsData.choices?.[0]?.text;
            if (nsMsg && nsMsg.trim().length > 0) {
              finalText = nsMsg;
            }
          }
        } catch (_) {}

        if (!finalText) {
          throw new Error('API returned an empty response.');
        }
      }

      success = true;
    } catch (err) {
      lastError = err;
      const msg = err.message || '';
      if (msg.includes('401') || msg.includes('403')) throw err;
      retryCount++;
      if (retryCount <= maxRetries) {
        await new Promise(r => setTimeout(r, retryCount <= 5 ? 2000 : 5000));
      }
    }
  }

  if (!success) throw lastError;
  return finalText;
}

/**
 * The tool-use loop for OpenAI-compatible providers.
 *
 * Deliberately the same shape as the one in `callClaudeAnthropic`: run a turn, append the
 * assistant message, answer every tool_use with a tool_result in the very next message, stop
 * on end_turn. `fetchOpenAIAgentStream` hands back an Anthropic-shaped response, so this can
 * be a near-mirror of that loop rather than a second design — which is the point, because the
 * caller (intake, and anything else passing tools) must not be able to tell which provider
 * answered it.
 *
 * No prompt caching here: `cache_control` is Anthropic-specific and these endpoints reject or
 * ignore it. Nothing to do about that beyond not sending it.
 */
async function runOpenAIToolLoop({ prompt, config, opts, model }) {
  const messages = (opts.messages || [{ role: 'user', content: prompt }]).map(m => ({ ...m }));

  // The build loop's emitter carries streamed text and reasoning out to the TUI; intake
  // passes onToken/onThinking instead, so translate between the two.
  const emit = (ev) => {
    if (!ev) return;
    if (ev.type === 'text' && ev.text && opts.onToken) opts.onToken(ev.text);
    else if (ev.type === 'thinking' && ev.text && opts.onThinking) opts.onThinking(ev.text);
  };

  const MAX_LOOPS = 50;
  const MAX_RETRIES = 10;
  let accumulated = '';

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    let turn = null;
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        turn = await fetchOpenAIAgentStream(
          {
            model,
            system: opts.system || SYSTEM_MOTION_GENERATE,
            messages,
            tools: opts.tools,
            max_tokens: opts.maxTokens || 8192
          },
          config,
          opts.signal,
          emit
        );
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (opts.signal?.aborted) throw err;
        const msg = (err.message || '').toLowerCase();
        // Fail fast on the errors that are identical on every attempt.
        if (msg.includes('401') || msg.includes('403') || msg.includes('404')) throw err;
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, attempt < 5 ? 2000 : 5000));
        }
      }
    }

    if (lastError) throw lastError;

    messages.push({ role: 'assistant', content: turn.content });

    for (const block of turn.content) {
      if (block.type === 'text' && block.text) accumulated += block.text;
    }

    if (turn.stop_reason === 'tool_use' && opts.toolHandler) {
      const toolResults = [];
      for (const block of turn.content) {
        if (block.type !== 'tool_use') continue;
        try {
          const result = await opts.toolHandler(block.name, block.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result || 'Success'
          });
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            is_error: true,
            content: err.message
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // A model that asked for tools when the caller supplied no handler would otherwise
    // loop here forever, re-asking and never being answered.
    if (turn.stop_reason === 'tool_use') break;

    if (turn.stop_reason === 'max_tokens') {
      messages.push({
        role: 'user',
        content: 'Continue exactly where you left off. Do not repeat anything. Just output the exact next characters.'
      });
      continue;
    }

    break;
  }

  return accumulated;
}

export async function callAIProvider(prompt, config, opts = {}) {
  const provider = inferProvider(config);
  if (provider === 'anthropic' || provider === 'agentrouter') {
    return callClaudeAnthropic(prompt, config, opts);
  } else {
    return callOpenAICompatible(prompt, config, opts);
  }
}

// ============================================================
// OFFICIAL @anthropic-ai/sdk — same headers as Claude Code
// This is required for agentrouter.org to accept the request
// ============================================================
async function callClaudeAnthropic(prompt, config, opts = {}) {
  const apiKey = config.apiKey;
  const baseUrl = resolveBaseUrl(config);
  const model = opts.model || config.model || 'claude-opus-5';

  // Instantiate official Anthropic SDK — sends exact same headers/user-agent as Claude Code CLI
  const client = new Anthropic({
    authToken: apiKey,
    baseURL: baseUrl,
    defaultHeaders: {
      'user-agent': 'claude-cli/2.1.220 (external, sdk-cli)',
      'x-app': 'cli',
      'anthropic-beta': 'claude-code-20250219,interleaved-thinking-2025-05-14,thinking-token-count-2026-05-13,context-management-2025-06-27,prompt-caching-scope-2026-01-05,mid-conversation-system-2026-04-07,advisor-tool-2026-03-01,effort-2025-11-24,fallback-credit-2026-06-01',
      'anthropic-version': '2023-06-01'
    }
  });

  const msgParams = {
    model,
    max_tokens: opts.maxTokens || 8192,
    system: opts.system || SYSTEM_MOTION_GENERATE,
    messages: opts.messages ? [...opts.messages] : [{ role: 'user', content: prompt }],
  };
  const initialCount = msgParams.messages.length;

  if (opts.tools) {
    msgParams.tools = opts.tools;
  }

  // `off` must survive as 0 rather than being defaulted back into a budget, and the
  // budget/max_tokens pair has to fit inside what this specific model can emit — a fixed
  // number here is what turns a model swap into a 400.
  const requested = THINKING_BUDGETS[opts.thinking] ?? THINKING_BUDGETS.high;
  const plan = resolveTokenPlan(model, requested, msgParams.max_tokens);
  msgParams.max_tokens = plan.maxTokens;

  if (plan.budget) {
    msgParams.thinking = { type: 'enabled', budget_tokens: plan.budget };
  }

  /**
   * The cache breakpoints, stamped fresh for every attempt.
   *
   * This path is the one intake, chat and planning all go out through, and until now it
   * carried no breakpoint at all — only the build loop did. Planning was the expensive
   * miss: the plan skill is ~18KB of system prompt that is byte-identical across every
   * revision of the same plan, and it was being re-read at full price each time.
   *
   * Stamped per attempt rather than once, because the tool loop below pushes onto
   * `msgParams.messages` — a breakpoint placed before the first attempt would sit further
   * and further from the end as the conversation grew, leaving the settled turns after it
   * uncached. And stamped onto a copy, because `msgParams.messages` may be the very array
   * the caller handed in; rewriting its contents would be a side effect on their history.
   */
  const cachedRequest = () => {
    const marked = prepareCachedRequest({
      system: msgParams.system,
      tools: msgParams.tools,
      messages: msgParams.messages
    });
    const req = { ...msgParams, system: marked.system, messages: marked.messages };
    // Only when the caller sent tools — an explicit `tools: undefined` is not the same
    // request shape as no tools key at all.
    if (msgParams.tools) req.tools = marked.tools;
    return req;
  };

  let maxRetries = 10;
  let accumulatedFinalText = '';
  let loopIterations = 0;
  const MAX_CONTINUATION_LOOPS = 50;

  while (loopIterations < MAX_CONTINUATION_LOOPS) {
    loopIterations++;
    let retryCount = 0;
    let finalMsg = null;
    let success = false;
    let lastError = null;

    while (retryCount <= maxRetries && !success) {
      try {
        const reqOpts = opts.signal ? { signal: opts.signal } : undefined;
        const stream = await client.messages.stream(cachedRequest(), reqOpts);

        // A silent socket is indistinguishable from a slow model without a deadline, and
        // the SDK will wait on it forever. The guard resets on every event, so only
        // genuine silence trips it — long generations are untouched.
        await withStallGuard(stream, (event) => {
          if (event.type === 'content_block_delta') {
            const delta = event.delta;
            if (delta.type === 'text_delta' && delta.text) {
              if (opts.onToken) opts.onToken(delta.text);
            } else if (delta.type === 'thinking_delta' && delta.thinking) {
              if (opts.onThinking) opts.onThinking(delta.thinking);
            }
          }
        }, opts.signal);

        finalMsg = await stream.finalMessage();
        success = true;
      } catch (err) {
        lastError = err;
        const msg = (err.message || '').toLowerCase();
        const status = err.status || err.statusCode;

        // A user-cancelled request fails on every retry by design.
        if (opts.signal?.aborted) throw err;

        if (msg.includes('content-blocked') || msg.includes('safety')) {
          throw err;
        }

        // Self-heal, same as the agent loop: an endpoint that refuses the thinking
        // parameters either 400s about them or accepts the connection and closes it
        // without a byte. Both are fixed by dropping thinking and trying once more,
        // which is strictly better than surfacing a dead end to the user.
        const isBadRequest = status === 400 || msg.includes('400') || msg.includes('invalid_request');
        const mentionsThinking = msg.includes('thinking') || msg.includes('budget_tokens') ||
                                 msg.includes('max_tokens');
        const isSilentReject = msg.includes('ended without sending any chunks') && msgParams.thinking;

        if (((isBadRequest && mentionsThinking) || isSilentReject) && msgParams.thinking) {
          delete msgParams.thinking;
          retryCount++;
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        // Auth failures and request-shape rejections fail identically on every retry —
        // burning 10 attempts only delays an error the user can already act on.
        if (status === 401 || status === 403 || status === 404) throw err;
        if (isBadRequest) throw err;

        retryCount++;
        if (retryCount <= maxRetries) {
          const delay = retryCount <= 5 ? 5000 : 15000;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    if (!success) throw lastError;

    // Append to conversation history
    msgParams.messages.push({ role: 'assistant', content: finalMsg.content });

    // Evaluate stop reason
    if (finalMsg.stop_reason === 'tool_use' && opts.toolHandler) {
      const toolResults = [];
      for (const block of finalMsg.content) {
        if (block.type === 'tool_use') {
          try {
            const result = await opts.toolHandler(block.name, block.input);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result || "Success"
            });
          } catch (err) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              is_error: true,
              content: err.message
            });
          }
        }
      }
      msgParams.messages.push({ role: 'user', content: toolResults });
      // Loop continues
    } else if (finalMsg.stop_reason === 'max_tokens') {
      msgParams.messages.push({
        role: 'user',
        content: "Continue exactly where you left off. Do not repeat anything. Just output the exact next characters."
      });
      // Loop continues
    } else {
      break; // Finished
    }
  }

  // A model that keeps stopping on tool_use or max_tokens used to spin here forever,
  // burning credit with no ceiling and no way out but Ctrl+C. Whatever was produced up
  // to the cap is still returned — the caller gets partial work rather than nothing.
  if (loopIterations >= MAX_CONTINUATION_LOOPS) {
    console.warn(
      `⚠️  Stopped after ${MAX_CONTINUATION_LOOPS} continuation rounds — returning what was generated so far.`
    );
  }

  // Extract generated text blocks only from NEW assistant messages added during this invocation,
  // avoiding duplicate accumulation of pre-existing chat history or intermediate tool turns.
  for (let i = initialCount; i < msgParams.messages.length; i++) {
    const msg = msgParams.messages[i];
    if (msg && msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        accumulatedFinalText += msg.content;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            accumulatedFinalText += block.text;
          }
        }
      }
    }
  }

  // Safety fallback if no text block was produced
  if (!accumulatedFinalText.trim() && msgParams.messages.length > initialCount) {
    for (let i = msgParams.messages.length - 1; i >= initialCount; i--) {
      const msg = msgParams.messages[i];
      if (msg && Array.isArray(msg.content)) {
        const txt = msg.content.map(b => b.text || b.thinking || '').filter(Boolean).join('\n');
        if (txt.trim()) {
          accumulatedFinalText = txt.trim();
          break;
        }
      }
    }
  }

  return accumulatedFinalText || "I'm ready to help with your motion graphics project. Describe what you'd like to build!";
}


// ============================================================
// AUTOMATIC SKILL INJECTION (loads SKILL.md for motion generation)
// Splits skill into two tiers:
//   • Plan tier  — condensed planning guidance (STEP 1–2.5), ~8K chars
//   • Build tier — core build instructions without SOURCE FILES block, ~75K chars
// The raw SKILL.md is 247KB (~60K tokens). Sending it whole exceeds context
// limits on most models, so SOURCE FILES (145KB of verbatim CSS/JS) is always
// stripped. The model already knows how to write those from the core instructions.
// ============================================================

let _analyzedSkills = new Set();

/**
 * Forget which skills have already been announced.
 *
 * The set exists to stop one run printing "Analyzing skill: motion-graphics/SKILL.md" four
 * times, because getSkillSystemPrompt() loads several skills and some of them resolve to the
 * same file. But it used to live for the lifetime of the process, which in the chat REPL is
 * the whole session — so the first build announced its skills and every build after it was
 * silent, looking as though the agent had stopped consulting them. Each plan and each build
 * clears it, so the dedupe stays within a run and the user sees the skills load every time.
 */
export function resetSkillAnnouncements() {
  _analyzedSkills = new Set();
  // Announcing is the default every run. Without this the suppression below would leak:
  // one revision would silence the *next* fresh build too, since this is module state.
  _announceSkills = true;
}

/**
 * Whether a run should announce its skills at all.
 *
 * A revision is a continuation, not a new job. The skills were read and announced when the
 * build was planned, `readSkillFile` serves them from memory afterwards, and the text going
 * into the prompt is byte-identical — so "Analyzing skill: saas-explainer-motion/SKILL.md
 * (247KB)" on a request to change the background music describes no work being done. It read
 * as the agent starting over, which is the opposite of what a revision is.
 *
 * The announcement is suppressed rather than the load: the skill still reaches the model
 * exactly as before. Only the line is dropped, and only when the caller says this run
 * continues an earlier one.
 */
let _announceSkills = true;

export function setSkillAnnouncements(on) {
  _announceSkills = on !== false;
}

/**
 * Skill discovery lives in skills.js — see the note there on why it has to be a separate
 * module. Re-exported so anything already importing these from ai-engine keeps working.
 */
export { listSkills, readSkill } from './skills.js';

/**
 * Skill files, read from disk once per process.
 *
 * The same two skills are loaded by both stages — the plan tier and the build tier each ask
 * for saas-explainer-motion and motion-graphics — and the first of those resolves to a
 * 5000-line, ~247KB file. Re-reading it returns a byte-identical string every time, so
 * every read after the first was disk work for something already in memory.
 *
 * This changes nothing about what reaches the model: same text, same slicing, same prompt.
 * The token cost of a skill is set by it being in the system prompt, not by how many times
 * it is read, and that cost is what prompt caching handles.
 *
 * Keyed on mtime and size rather than path alone, so editing a SKILL.md mid-session is
 * picked up by the next run instead of being masked until restart.
 */
const _skillFileCache = new Map();

function readSkillFile(p) {
  const st = fs.statSync(p);
  const key = `${st.mtimeMs}:${st.size}`;
  const hit = _skillFileCache.get(p);
  if (hit && hit.key === key) return { ...hit, cached: true };

  const entry = { key, content: fs.readFileSync(p, 'utf8'), kb: Math.round(st.size / 1024) };
  _skillFileCache.set(p, entry);
  return { ...entry, cached: false };
}

export function _loadSkillByName(skillName, onEvent) {
  const match = listSkills().find(s => s.name === skillName);
  const candidates = match ? [match.path] : [];
  for (const root of skillSearchRoots()) {
    if (skillName) candidates.push(path.join(root, skillName, 'SKILL.md'));
    candidates.push(path.join(root, 'SKILL.md'));
  }
  candidates.push(path.resolve(process.cwd(), 'SKILL.md'));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const { content } = readSkillFile(p);
        return content;
      }
    } catch (_) {}
  }
  return null;
}

function _loadSkillRaw(onEvent) {
  return _loadSkillByName(PRIMARY_SKILLS[0], onEvent) || _loadSkillByName(PRIMARY_SKILLS[1], onEvent);
}

/**
 * Condensed skill for the PLAN step — only planning guidance (STEP 1, 2, 2.5)
 * and the key API surface. Small enough to never blow context limits.
 */

export function detectCoreSkill(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' && typeof m.content === 'string') {
      if (/saas|explainer|software|dashboard|app|platform/i.test(m.content)) {
        return 'saas-explainer-motion';
      }
    }
  }
  return 'motion-graphics';
}

export function getSkillForPlan(onEvent, coreSkill = 'saas-explainer-motion') {
  const raw = _loadSkillByName(coreSkill, onEvent) || _loadSkillByName('saas-explainer-motion', onEvent) || _loadSkillRaw(onEvent);
  if (!raw) return SYSTEM_MOTION_PLAN;

  const step3Idx = raw.indexOf('## STEP 3');
  const planSection = step3Idx > 0 ? raw.slice(0, step3Idx).trim() : raw.slice(0, 35000);

  const genSkill = _loadSkillByName('motion-graphics', onEvent);
  const genSection = genSkill && genSkill !== raw ? genSkill.slice(0, 12000) : '';

  const sysPlan = SYSTEM_MOTION_PLAN.replace(/saas-explainer-motion/g, coreSkill || 'saas-explainer-motion');

  return `${sysPlan}

# SKILL PLANNING GUIDANCE (auto-loaded — reference material):
${planSection}

${genSection ? `# GENERAL MOTION GRAPHICS GUIDANCE:\n${genSection}` : ''}

# ────────────────────────────────────────────────────────────────
# OUTPUT CONTRACT — THIS OVERRIDES EVERYTHING ABOVE
# ────────────────────────────────────────────────────────────────
The skill guidance above is craft reference: use its taste, its beat-sheet thinking and
its brand-mining approach to decide WHAT to plan. It does NOT change HOW you reply.

Specifically, ignore the skill's instruction to ask the user questions first. Any missing
answers were already collected before this request reached you, and anything still unknown
you must decide yourself and record in "analysis". Asking a question here produces no
plan at all.

Your entire reply must be ONE JSON object matching the schema given at the top of this
prompt. It must start with { and end with }. No preamble, no "Here's the plan:", no
markdown fences, no commentary after the closing brace.

And the RESEARCH BINDING rules from the top of this prompt still stand. Fill plan.colors
and profiles[] from that block, and open "analysis" with what the research actually said.
${skillCatalogue()}
One exception to "reply with JSON only": you may call list_skills or load_skill first. If
this piece needs craft guidance or if the user requested a specific skill — such as saas-explainer-motion,
ui-ux-pro-max, frontend-design, motion-audio, svg-shape-morphing, css-animations — load that skill BEFORE you write the plan, so
the plan is written with the complete craft reference in hand. Load any skill that applies, then reply with the JSON object. Write no conversational text alongside the tool call itself.`;
}

/**
 * Cuts a skill down to its working guidance.
 */
function trimToWorkingGuidance(text) {
  for (const marker of ['## Appendix A', '## SOURCE FILES']) {
    const i = text.indexOf(marker);
    if (i > 0) return text.slice(0, i).trim();
  }
  return text;
}

/**
 * System prompt for the BUILD/GENERATE step.
 * Inlines both general motion graphics principles and the primary SaaS explainer / Liquid Glass UI skill.
 */
export function getSkillSystemPrompt(onEvent, coreSkill = 'saas-explainer-motion') {
  const saasSkill = _loadSkillByName('saas-explainer-motion', onEvent) || _loadSkillRaw(onEvent);
  const generalMotionSkill = _loadSkillByName('motion-graphics', onEvent);
  const detectedCore = coreSkill || 'saas-explainer-motion';

  const sysGen = SYSTEM_MOTION_GENERATE.replace(/saas-explainer-motion/g, detectedCore);

  let combined = `${sysGen}\n\n# ANYMOTION MULTI-SKILL SYSTEM MATRIX:\n`;

  if (generalMotionSkill) {
    combined += `\n## [SKILL: GENERAL MOTION GRAPHICS — TIMING, EASING & CHOREOGRAPHY]\n${generalMotionSkill}\n`;
  }

  if (saasSkill) {
    combined += `\n## [SKILL: SAAS PRODUCT EXPLAINER & LIQUID GLASS UI]\n${saasSkill}\n`;
  }

  combined += skillCatalogue();
  return combined;
}

// ============================================================
// CONTEXT OPTIMIZATION
// ============================================================
export function optimizeContextWindow(messages, maxChars = 80000) {
  let ctx = JSON.parse(JSON.stringify(messages));

  const estimateChars = (msgs) => msgs.reduce((acc, m) => {
    if (typeof m.content === 'string') return acc + m.content.length;
    if (Array.isArray(m.content)) {
      return acc + m.content.reduce((c, part) => {
        if (part.type === 'text') return c + part.text.length;
        if (part.type === 'tool_result' && typeof part.content === 'string') return c + part.content.length;
        return c + 500; // rough estimate for tool_use or other objects
      }, 0);
    }
    return acc;
  }, 0);

  // Repaired on the way out, not just when truncating.
  //
  // Chat history is a live array the CLI keeps across turns, and a build that was stopped
  // with ctrl+c can leave an assistant `tool_use` in it whose `tool_result` never arrived.
  // Nothing this function does creates that, but this is the one place every ai-engine path
  // funnels through before an API call, so it is where the request stops being malformed.
  // Without it a single aborted build poisons every later message with a 400.
  if (estimateChars(ctx) <= maxChars) return dropDanglingToolUse(ctx);

  const keepFirst = Math.min(2, ctx.length);
  const head = ctx.slice(0, keepFirst);
  let tail = ctx.slice(keepFirst);

  while (tail.length > 2 && estimateChars([...head, ...tail]) > maxChars) {
    tail.shift();
  }

  // shift() above cuts wherever the budget runs out, which can land between an assistant
  // tool_use and the tool_result answering it — so the repair has to run after the cut too.
  // A tool_result that lost its tool_use cannot lead the conversation either.
  while (tail.length && Array.isArray(tail[0].content) &&
         tail[0].content.some(b => b.type === 'tool_result')) {
    tail.shift();
  }

  return dropDanglingToolUse([
    ...head,
    { role: 'user', content: '[System: Earlier parts of the conversation were truncated to optimize token limits. Continue from here.]' },
    { role: 'assistant', content: 'Understood. I have the recent context.' },
    ...tail
  ]);
}

// ============================================================
// URL CONTEXT FETCHER — Extracts Fonts, Colors, Assets & Info
// ============================================================
export async function enrichPromptWithUrlContext(promptText) {
  if (!promptText || typeof promptText !== 'string') return promptText;

  const urlMatches = promptText.match(/https?:\/\/[^\s<>'")]+/gi);
  if (!urlMatches || !urlMatches.length) return promptText;

  const uniqueUrls = [...new Set(urlMatches)].slice(0, 3);
  const blocks = [];

  // The extraction itself now lives in web-tools.js, where it is also exposed to the
  // model as the fetch_page tool. Keeping one implementation means the automatic
  // first-message scrape and a deliberate mid-conversation lookup see the same data —
  // and it retires the copy that read an undeclared `fonts` variable, which threw on
  // every single call and left this whole feature silently doing nothing.
  for (const url of uniqueUrls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) continue;
      const brand = extractBrand(await res.text(), url);
      blocks.push(`### 🌐 AUTOMATICALLY FETCHED WEB BRAND CONTEXT\n${formatBrand(brand, url)}`);
    } catch (err) {
      console.warn(`[URL Fetcher] Could not fetch ${url}: ${err.message}`);
    }
  }

  return blocks.length ? `${promptText}\n\n${blocks.join('\n\n')}` : promptText;
}

// ============================================================
// CONVERSATION — plain chat reply, no artifacts
// ============================================================
export async function chatReply(messages, options = {}) {
  const config = loadConfig();
  const apiKey = options.apiKey || config.apiKey;
  if (!apiKey || apiKey === 'GEMINI_API_KEY_HERE') {
    throw new Error('No API key configured. Set one with: /config apiKey <key>');
  }

  const enrichedMessages = await Promise.all(messages.map(async (m, i) => {
    if (i === messages.length - 1 && m.role === 'user' && typeof m.content === 'string') {
      return { ...m, content: await enrichPromptWithUrlContext(m.content) };
    }
    return m;
  }));

  const optimizedMessages = optimizeContextWindow(enrichedMessages);

  const text = await callAIProvider(null, config, {
    // What is open right now, appended to the standing prompt. Without this the chat model
    // has no idea a project exists, so "iska duration kitna hai?" reads as a question about
    // nothing and comes back as a request for clarification.
    system: options.projectContext
      ? `${SYSTEM_MOTION_CHAT}\n\nCURRENT SESSION:\n${options.projectContext}`
      : SYSTEM_MOTION_CHAT,
    messages: optimizedMessages,
    model: options.model,
    // Chat is short-form, so this thinks lightly rather than not at all — enough to keep
    // an answer about the open project accurate, without making a one-line reply slow.
    thinking: options.thinking || config.thinking || 'low',
    maxTokens: 2000,
    onToken: options.onToken,
    onThinking: options.onThinking
  });
  return text.trim();
}

function repairTruncatedJson(jsonStr) {
  let stack = [];
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === '\\') {
      isEscaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') stack.push('}');
      else if (char === '[') stack.push(']');
      else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  if (inString) jsonStr += '"';
  while (stack.length > 0) {
    jsonStr += stack.pop();
  }
  return jsonStr;
}

/**
 * Coerces whatever the planner wrote for `quality` into a token the renderer accepts.
 *
 * The field has one job — survive from the question the user answered at intake all the
 * way to `render_video`'s `resolution` argument — and it crosses a model in the middle,
 * which is exactly where "1080p" becomes "1080P", "Full HD" or "1920x1080". Left alone,
 * every one of those reaches parseResolution and throws, but not until the build has
 * finished and the render is the last step, so the user loses the whole run to a spelling.
 *
 * The forgiving cases below are the ones actually worth rescuing: casing, the pixel size
 * written out, and the "1440p"/"UHD"/"HD" family. Anything genuinely unreadable falls back
 * to 1080p rather than throwing, because a film rendered at the usual resolution is a far
 * better outcome than no film — and the plan panel shows the value, so a wrong default is
 * visible before approval rather than after the render.
 */
/**
 * Trims a palette down to the few colours a brand actually owns.
 *
 * The planner reliably emitted five to seven, because a page yields dozens of literal colour
 * values and the research block used to hand over the top fourteen. web-tools now separates
 * brand colours from surface neutrals before the model ever sees them, and the prompt asks for
 * two to four — but a prompt is a request, and this is the guarantee, so a model that writes
 * seven anyway cannot put seven in front of the user.
 *
 * Order is preserved rather than re-ranked: the planner puts the primary first and the plan
 * panel renders swatches in that order, so the first entries are the ones that matter.
 * Malformed and duplicate values are dropped first, so the cap is spent on real colours.
 */
const MAX_PLAN_COLORS = 5;

function normalisePalette(value, limit = MAX_PLAN_COLORS) {
  if (!Array.isArray(value)) return undefined;

  const seen = new Set();
  const out = [];

  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    let v = entry.trim().toLowerCase();
    if (!v) continue;

    // "primary: #2f6bff" and "#2f6bff (accent)" both appear in practice. The hex is the
    // part that gets rendered, so it is the part kept.
    const hex = v.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/);
    if (hex) {
      v = '#' + (hex[1].length === 3 ? hex[1].split('').map(ch => ch + ch).join('') : hex[1]);
    } else if (!/^rgba?\(/.test(v)) {
      // A named colour is legitimate CSS and renders fine, so it stays; anything else is
      // prose the swatch renderer cannot draw.
      if (!/^[a-z]{3,20}$/.test(v)) continue;
    }

    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= limit) break;
  }

  return out.length ? out : undefined;
}

function normaliseQuality(value) {
  const raw = String(value ?? '').toLowerCase().trim();
  if (!raw) return '1080p';

  const TOKENS = ['720p', '1080p', '2k', '4k'];
  if (TOKENS.includes(raw)) return raw;

  // More than one token in the string means it is not an answer — it is the schema line
  // from the prompt, copied across instead of filled in. Reading the first match would
  // pick "4k" out of "720p | 1080p | 2k | 4k" and render four times the pixels nobody
  // asked for, so this case takes the default like any other unreadable value.
  const distinct = new Set(TOKENS.filter(t => raw.includes(t)));
  if (distinct.size === 1) return [...distinct][0];
  if (distinct.size > 1) return '1080p';

  if (raw.includes('3840') || raw.includes('2160') || /\buhd\b/.test(raw) || /\b4k\b/.test(raw)) return '4k';
  if (raw.includes('2560') || raw.includes('1440') || /\bqhd\b/.test(raw) || /\b2k\b/.test(raw)) return '2k';
  if (raw.includes('1920') || raw.includes('1080') || /\bfhd\b/.test(raw) || /\bfull hd\b/.test(raw)) return '1080p';
  if (raw.includes('1280') || raw.includes('720') || /\bhd\b/.test(raw)) return '720p';

  return '1080p';
}

// ============================================================
// PLAN — proposes options before any file is written
// ============================================================
export async function planMotionGraphics(messages, options = {}) {
  const config = loadConfig();
  const apiKey = options.apiKey || config.apiKey;
  if (!apiKey || apiKey === 'GEMINI_API_KEY_HERE') {
    throw new Error('No API key configured. Set one with: /config apiKey <key>');
  }

  /**
   * Progress sink. Callers pass either onEvent (chat's plan step) or emit (the build
   * loop's convention); accepting both means neither caller has to know which name this
   * function happens to prefer, and a caller that passes nothing still works.
   */
  const notify = typeof options.onEvent === 'function' ? options.onEvent
    : typeof options.emit === 'function' ? options.emit
      : () => { };

  resetSkillAnnouncements();

  // Normalize messages if passed as a string
  const msgList = Array.isArray(messages)
    ? messages
    : [{ role: 'user', content: String(messages || '') }];

  /**
   * The brief may already carry its research.
   *
   * doPlan() scrapes the site before it calls this, visibly, and appends a block that
   * includes something the old enrichment could not produce: every asset probed and marked
   * live or dead. Scraping again here would refetch the same pages, take the same seconds,
   * and append a second — worse — copy of the same facts. So research runs only when the
   * caller did none of its own.
   */
  const alreadyResearched = msgList.some(m =>
    typeof m.content === 'string' && m.content.includes('### RESEARCH')
  );

  /**
   * Research before the plan, not after it.
   *
   * A link in the brief *is* the brief: the palette, the typefaces, the product wording and
   * the real logo all live on that page. Planning first and looking second produces a plan
   * built on invented branding that the build then has to fight. So the site is read here,
   * before a single line of the plan exists, and its verified-asset list is what stops the
   * plan promising a logo that will never load.
   *
   * This used to call enrichPromptWithUrlContext, which fetches the page but never probes
   * whether its assets actually resolve. researchBrief follows one level of internal links,
   * probes every asset it finds, and reports progress as it goes. The old enrichment stays
   * as the fallback for the case where researchBrief comes back empty-handed.
   */
  const lastUserIndex = (() => {
    for (let i = msgList.length - 1; i >= 0; i--) {
      const m = msgList[i];
      if (m.role === 'user' && typeof m.content === 'string') return i;
    }
    return -1;
  })();

  let enrichedMessages = msgList;
  let research = options.research || null;

  if (!alreadyResearched && lastUserIndex !== -1 && hasUrl(msgList[lastUserIndex].content)) {
    if (!research) {
      try {
        research = await researchBrief(msgList[lastUserIndex].content, {
          emit: notify,
          signal: options.signal
        });
      } catch (_) {
        // Research is a bonus, never a blocker: a slow CDN must not be the reason a plan
        // cannot be written. Fall through to the lighter scrape below.
        research = null;
      }
    }

    if (research && research.block) {
      enrichedMessages = msgList.map((m, i) =>
        i === lastUserIndex ? { ...m, content: `${m.content}\n\n${research.block}` } : m
      );
    } else {
      enrichedMessages = await Promise.all(msgList.map(async (m, i) =>
        i === lastUserIndex ? { ...m, content: await enrichPromptWithUrlContext(m.content) } : m
      ));
    }
  }

  const optimizedMessages = optimizeContextWindow(enrichedMessages);
  const coreSkill = detectCoreSkill(messages);
  const planSystemPrompt = getSkillForPlan(notify, coreSkill);

  /**
   * The planner can read skills.
   *
   * This call used to pass no tools at all, which made the "agent decides what it needs"
   * behaviour a half-truth: intake could load a skill and the build loop could load a skill,
   * but the stage that actually decides the composition could not. It got getSkillForPlan's
   * fixed inline — the same two skills on every run, announced as "Analyzing skill" whether
   * or not the job had anything to do with them — and the four skills on disk it was told
   * about in the catalogue were unreachable, because the tool named in that catalogue was
   * not in its request.
   *
   * So a plan for a piece that needed sound design was written without motion-audio, and one
   * needing path morphing without svg-shape-morphing, and the build then had to improvise
   * against a plan that had never seen the guidance.
   *
   * Dynamic import for the reason intake uses one: tools/index pulls in the whole tool
   * surface, and importing it at module scope here risks closing a cycle back through
   * agent-loop. Reusing the registered tool rather than calling readSkill directly keeps the
   * truncation, the error text and the TUI event identical to a load at any other stage.
   */
  const planTools = [];
  let planToolHandler;
  const loadedSkillNames = new Set();
  try {
    const { getTool } = await import('./tools/index.js');
    for (const name of ['list_skills', 'load_skill']) {
      const tool = getTool(name);
      if (tool) planTools.push({ name: tool.name, description: tool.description, input_schema: tool.input_schema });
    }
    planToolHandler = async (name, input) => {
      const tool = getTool(name);
      if (!tool) return `No tool named "${name}" at the planning stage. Use list_skills or load_skill.`;
      const result = await tool.run(input || {}, { emit: notify, todos: [], loadedSkills: loadedSkillNames });
      return (result && typeof result === 'object' ? result.content : String(result ?? '')) || 'done';
    };
  } catch (_) {
    planToolHandler = undefined;
  }

  const requestPlanText = (msgs) => callAIProvider(null, config, {
    system: planSystemPrompt,
    messages: msgs,
    model: options.model,
    // Planning is where the composition is actually decided, so it thinks properly.
    thinking: options.thinking || config.thinking || 'high',
    maxTokens: 16384,
    tools: planTools.length ? planTools : undefined,
    toolHandler: planTools.length ? planToolHandler : undefined,
    signal: options.signal,
    onToken: options.onToken,
    onThinking: options.onThinking
  });

  const requestRawJsonText = (msgs, extraPrompt) => callAIProvider(null, config, {
    system: planSystemPrompt + '\n\nIMPORTANT: Do NOT call any tools. Output ONLY a valid JSON object starting with { and ending with }.',
    messages: extraPrompt ? [...msgs, { role: 'user', content: extraPrompt }] : msgs,
    model: options.model,
    thinking: options.thinking || config.thinking || 'high',
    maxTokens: 16384,
    tools: undefined,
    toolHandler: undefined,
    signal: options.signal,
    onToken: options.onToken,
    onThinking: options.onThinking
  });

  let planText = await requestPlanText(optimizedMessages);

  const parseCandidate = (str) => {
    if (!str || typeof str !== 'string') return null;
    let clean = str.replace(/```json/gi, '').replace(/```/g, '').trim();
    const s = clean.indexOf('{');
    if (s === -1) return null;
    let sub = clean.slice(s);
    const e = sub.lastIndexOf('}');
    if (e !== -1) sub = sub.slice(0, e + 1);

    try { return JSON.parse(sub); } catch (_) {}
    try {
      let rep = sub
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/"\s+"/g, '", "')
        .replace(/}\s*{/g, '}, {')
        .replace(/\]\s*\[/g, '], [')
        .replace(/"\s*{/g, '", {')
        .replace(/}\s*"/g, '}, "');
      return JSON.parse(rep);
    } catch (_) {}
    try {
      return JSON.parse(repairTruncatedJson(sub));
    } catch (_) {}
    return null;
  };

  let plan = parseCandidate(planText);

  // If initial response was prose or missing valid JSON, request clean JSON without tools
  if (!plan) {
    try {
      const fixedText = await requestRawJsonText(
        [
          ...optimizedMessages,
          { role: 'assistant', content: planText }
        ],
        'That was prose or invalid JSON. Reply with ONLY the valid JSON plan object starting with { and ending with }. ' +
        'Do not call any tools, do not ask questions, and do not add conversational text. Return the JSON object directly.'
      );
      plan = parseCandidate(fixedText);
    } catch (_) {}
  }

  // Safety fallback: if model still failed to return JSON, generate a baseline structured plan from the user brief
  if (!plan || typeof plan !== 'object' || !plan.plan) {
    const userBrief = (messages.find(m => m.role === 'user' && typeof m.content === 'string')?.content || 'SaaS Product Explainer')
      .slice(0, 80);
    const slug = userBrief
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'saas-explainer';

    plan = {
      analysis: `Structured composition plan generated for: "${userBrief}"`,
      folder: slug,
      plan: {
        title: userBrief.length > 50 ? userBrief.slice(0, 50) + '...' : userBrief,
        style: "Apple Liquid Glass UI with 60fps Motion Engine",
        scenes: [
          "Scene 1: Hero reveal with animated logo, brand typography, and specular inner borders",
          "Scene 2: Core feature highlights grid with interactive micro-animations and smooth camera panning",
          "Scene 3: Call to action with liquid glass action button and verified brand finish"
        ],
        duration: "15s",
        quality: "1080p",
        colors: ["#3b82f6", "#10b981"],
        animations: ["spring-easing", "liquid-glass-blur", "staggered-fade"]
      }
    };
  }

  if (!plan.plan || typeof plan.plan !== 'object') {
    throw new Error('Plan is missing the main "plan" object.');
  }

  plan.plan.quality = normaliseQuality(plan.plan.quality);

  // A palette is two or three colours. Capped here rather than trusted from the prompt,
  // because "brand colours" that run to seven entries are no longer brand colours — see
  // normalisePalette. profiles[] carries per-brand palettes and gets the same treatment.
  const palette = normalisePalette(plan.plan.colors);
  if (palette) plan.plan.colors = palette;

  if (Array.isArray(plan.profiles)) {
    plan.profiles.forEach(p => {
      if (!p || typeof p !== 'object') return;
      const pPalette = normalisePalette(p.colors);
      if (pPalette) p.colors = pPalette;
    });
  }

  /**
   * Hand the scrape forward so the build does not repeat it.
   *
   * Underscored because everything else on this object came from the model; this is the
   * one field the planner added. A caller can pass it straight back as options.research
   * to generateMotionGraphics, which is the difference between fetching the site once and
   * fetching it twice.
   */
  if (research) plan._research = research;

  return plan;
}

// ============================================================
// GENERATE MOTION GRAPHICS — Main Export
//
// This used to be a single request that streamed HTML into memory. It is now a real
// agent run: the model reads, writes, edits, researches, runs commands, and looks at
// its own output through a headless browser until the work stands up.
// ============================================================

/**
 * The behavioural half of the system prompt. The rules in SKILL.md say what a good
 * composition looks like; this says how to work — and most of it exists because of a
 * specific failure the old build had.
 */
const AGENT_OPERATING_RULES = `
===========================================================================
HOW YOU WORK
===========================================================================

You are an agent, not a code generator. You have tools and a project folder. Keep
working until the job is genuinely finished — do not hand back a half-built
composition and ask the user what to do next.

NARRATE. This matters as much as the code.
  After every tool result, write one or two short lines: what just happened, and what
  you are doing next. "Scene 2 ka easing linear tha — usko cubic-bezier par le gaya.
  Ab main check karta hoon ke koi element overlap to nahi kar raha."
  Never go silent through a run of tool calls. The user is watching a terminal, and a
  wall of tool names with no explanation tells them nothing.
  Mirror the user's language exactly. Roman Urdu in, Roman Urdu out. English in,
  English out. Do not switch on them.

PLAN OUT LOUD.
  For anything with more than one step, call update_todos first, then call it again
  every time a step lands — mark that one done and the next one active in the same
  call. The user sees this list live.
  IMPORTANT: When you update todos, DO NOT end your turn! In the exact same response,
  immediately call the next tool (write_file, edit_file, etc.) to perform the active step.
  Chain your tool calls so you work through the tasks continuously.

NEVER EDIT BLIND — BUT DO NOT RE-READ WHAT YOU ALREADY HAVE.
  read_file before the FIRST edit_file on a file. old_string has to match byte for byte,
  so guessing at it wastes a turn.
  After that, you already have the file. edit_file returns the lines around every change
  it makes — that is your updated copy of that region, use it. Do not read the whole file
  again between edits. If you do, read_file will tell you it is unchanged and send nothing
  back, which costs you a turn for no information.
  Re-read only when: the user says they edited it themselves, a tool reports it changed,
  or you need a region you have not seen. Then pass offset and limit for THAT region.
  On a file over 400 lines, grep_files for an anchor first and read around the hit —
  reading 2000 lines to change 3 of them is the most expensive mistake available to you.
  Prefer edit_file over write_file on a file that already exists. A full rewrite throws
  away work the user may have done in the editor, and burns tokens reproducing code
  that was already correct.

FAST 1-SHOT MODULAR FILE CREATION:
  - Deliver clean, modular, production-ready files in a single pass:
    • index.html (Complete HTML DOM structure, semantic scenes with data-scene="<n>", data-layer attributes, linked to style.css & timeline.js)
    • style.css (Complete CSS layout, glassmorphism tokens, presets, typography, responsive stage)
    • timeline.js (Complete deterministic animation engine, window.seek(t), window.DURATION, scene transitions, cursor motion, and audio synth)
  - FAST COMPLETE WRITES: Write each file COMPLETELY from start to finish in a single write_file call. Do NOT break a file into small 50-line fragments or multi-turn appends — output the complete working file.
  - BATCH TOOL CALLS: You can emit write_file for index.html, style.css, and timeline.js in the SAME response turn to construct the entire project in 1-2 rapid turns instead of wasting 10+ turns.
  - Assets: Put media (images, audio, videos, SVG) in an \`assets/\` folder.

ZERO-BUG FIRST-PASS ARCHITECTURE STANDARDS (PREVENT BUGS BEFORE THEY HAPPEN):
  1. BULLETPROOF SCENE ISOLATION (ELIMINATE OVERLAPS & GHOST TEXT):
     - In style.css, always declare:
       .scene, [data-scene] {
         position: absolute;
         inset: 0;
         width: 100%;
         height: 100%;
         display: flex;
         flex-direction: column;
         align-items: center;
         justify-content: center;
         opacity: 0;
         pointer-events: none;
         visibility: hidden;
         overflow: hidden;
       }
     - In timeline.js, compute scene visibility mathematically from timestamp t:
       function getSceneState(t, start, end) {
         if (t < start || t >= end) return { visible: false, progress: 0, opacity: 0 };
         const duration = end - start;
         const localT = t - start;
         const fadeIn = Math.min(1, localT / 0.4);
         const fadeOut = Math.min(1, (end - t) / 0.4);
         const opacity = Math.min(fadeIn, fadeOut);
         return { visible: true, progress: localT / duration, opacity };
       }
       Update each scene: el.style.visibility = state.visible ? 'visible' : 'hidden'; el.style.opacity = state.opacity;
     - This guarantees ZERO text overlaps at every frame across the entire timeline!

  2. 100% PURE DETERMINISTIC SEEK FUNCTION (ZERO STATE ACCUMULATION):
     - Every visual property in seek(t) MUST be computed directly from timestamp t with zero cumulative variables.
     - Always use mathematical interpolation:
       const lerp = (a, b, progress) => a + (b - a) * progress;
       const clamp01 = (v) => Math.max(0, Math.min(1, v));
       const cubicBezier = (p) => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

  3. 1920×1080 STAGE BOUNDS (ZERO OFF-CANVAS / OVERFLOW):
     - Set stage strictly: .stage { width: 1920px; height: 1080px; position: relative; overflow: hidden; }
     - Keep content centered within an inner container: max-width: 1560px; margin: 0 auto;
     - Cards and features must use flexbox/grid with explicit gap (e.g. gap: 32px) rather than arbitrary top/left coordinates.

  4. MANDATORY WINDOW CONTRACTS & INTERACTIVE PLAYBACK ENGINE:
     - Always declare \`window.DURATION = <seconds>;\` at the top of timeline.js.
     - Always declare \`window.seek = function(t) { ... };\` that calculates and renders the visual state at time t (supporting both seconds and ms).
     - Always include the 60fps interactive playback loop and play/pause event listeners in timeline.js:
       let isPlaying = false, rafId = null, lastNow = performance.now(), currentTime = 0;
       function tick(now) {
         rafId = null;
         const dt = (now - lastNow) / 1000;
         lastNow = now;
         if (isPlaying) {
           currentTime += dt;
           if (currentTime >= window.DURATION) { currentTime = 0; isPlaying = false; syncPlayBtn(false); }
           window.seek(currentTime);
           rafId = requestAnimationFrame(tick);
         }
       }
       function togglePlay() { 
         isPlaying = !isPlaying; 
         lastNow = performance.now(); 
         syncPlayBtn(isPlaying); 
         if (isPlaying && !rafId) rafId = requestAnimationFrame(tick);
       }
       document.getElementById('playbtn')?.addEventListener('click', togglePlay);
       document.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); togglePlay(); } });
     - Safe DOM Mounting: \`if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();\`
     - Always call \`window.seek(0);\` immediately so the initial frame renders instantly.

  5. AUDIO PLAYBACK ISOLATION:
     - Never call \`audio.play()\` directly inside \`seek(t)\`!
     - Gate audio playback inside \`window.playCuesFor(t, isPlaying)\` so headless auditing and video rendering remain 100% silent and error-free.

HIGH-PRECISION SURGICAL BUG FIXING:
  - Run check_composition and validate_seek to audit your build.
  - If check_composition or validate_seek reports any errors or warnings (e.g. OVERLAP, console errors, missing seek, or layer bounds):
    • Identify the exact file and lines causing the issue.
    • Fix it SURGICALLY with a single targeted edit_file call (including 2-4 lines of surrounding context for 100% exact match).
    • DO NOT rewrite the entire file with write_file when fixing a bug — use edit_file to preserve working code and save tokens.
    • Immediately re-run check_composition to confirm the fix is 100% clean.
  - Then call preview_frames with one timestamp per scene and inspect the rendered visual output. Check that text is not overlapping or clipped, contrast is readable, and Liquid Glass layout looks polished. If anything looks wrong, fix it surgically with edit_file and verify again.
  - Self-critique before finishing: Does this look like a broadcast-quality SaaS product explainer? Is the brand palette clearly visible (covering at least 15-20% of non-background elements)?
  - Never tell the user the work is done before check_composition and validate_seek come back completely clean.

SCENE PACING & TIMING STANDARDS:
  - Title / Intro scene: 3.5–4 seconds (gives viewers time to absorb brand and topic).
  - Feature / Product scenes: 4–6 seconds per scene (never rush a key product feature).
  - Outro / CTA scene: 3.5–4.5 seconds.
  - Average pacing: 4–5 seconds per scene. Never show text or cards for under 2 seconds.

MODERN BRAND-CUSTOMIZED CURSOR SYSTEM & KINETIC CHOREOGRAPHY:
  - NEVER output the generic, boxy retro Windows 95 arrow cursor!
  - In index.html, always construct the sleek Modern Brand Cursor with precision stealth pointer, frosted glass name badge, and dynamic click ripple:
    \`\`\`html
    <div class="cursor-rig" id="cursor" data-el="cursor" data-anim="cursor">
      <div class="cursor-pointer">
        <svg width="28" height="32" viewBox="0 0 28 32" fill="none" class="cursor-svg">
          <defs>
            <linearGradient id="curGrad" x1="0" y1="0" x2="28" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="100%" stop-color="var(--accent-secondary, #94a3b8)"/>
            </linearGradient>
            <filter id="curGlow">
              <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="var(--accent-primary, #00cbd6)" flood-opacity="0.4"/>
            </filter>
          </defs>
          <path d="M3.5 2.5 L24.5 13.2 C25.8 13.9 25.6 15.8 24.1 16.2 L14.8 18.8 L10.8 28.2 C10.2 29.6 8.3 29.7 7.7 28.3 L2.2 4.1 C1.9 2.8 3.1 1.6 4.4 2.2 Z" 
                fill="url(#curGrad)" stroke="var(--accent-primary, #00cbd6)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" filter="url(#curGlow)"/>
        </svg>
        <div class="cursor-badge" data-el="cursorBadge"><span class="cursor-badge-dot"></span><span class="cursor-badge-name">AI</span></div>
      </div>
      <div class="click-ripple" id="clickRipple" data-el="clickRipple"></div>
    </div>
    \`\`\`
  - In style.css, style \`.cursor-rig\` with \`position: absolute; pointer-events: none; z-index: 1000; transform-origin: 2px 2px;\`. Style \`.cursor-badge\` with frosted glass (\`background: rgba(18,22,34,0.85); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; font-size: 11px; padding: 3px 8px; font-family: var(--font-mono); color: #fff; display: flex; align-items: center; gap: 5px;\`).
  - Style \`.click-ripple\` with \`border: 2px solid var(--accent-primary); border-radius: 50%; box-shadow: 0 0 14px var(--accent-primary); opacity: 0; transform: scale(0.3);\`.
  - CHOREOGRAPHY & TIMING:
    1. Arced Travel: Animate x on outCubic, y on inOutCubic over 550ms–750ms so the movement feels natural and alive.
    2. Settle: 120ms hesitation before clicking.
    3. Click Press: Scale 1 → 0.86 over 80ms.
    4. Click Release + Ripple: Scale 0.86 → 1 over 200ms, and animate .click-ripple scale 0.3 → 1.8 with opacity 0.75 → 0 over 350ms!

BRAND-ADAPTIVE ANIMATED MESH BACKGROUNDS:
  - Use floating organic mesh gradient orbs (.bg-wash + .bg-orb) with 20s–30s GPU Keyframe floating motion instead of plain black or saste sparkles.
  - Integrate subtle film grain noise overlay at opacity 0.03 for tactile cinematic depth.

FINISH BY RENDERING THE VIDEO.
  The deliverable is an MP4, not an HTML file. Once every task on your list is done and
  check_composition is clean, call render_video — do not stop at the preview and do not
  ask whether they want it rendered.
  - Use the quality the plan settled on — the plan's "quality" field, one of 720p, 1080p,
    2k or 4k, chosen by the user before the plan was written. Pass it to render_video as
    the resolution. If the plan has no quality, use 1080p and say that you defaulted to it.
  - The export never contains the preview controls. The renderer loads the page with
    ?render and strips anything outside the stage, so the play/pause bar, scrubber and
    timecode are gone from every frame. Keep film content inside .stage and preview
    furniture outside it and this takes care of itself.
  - It takes minutes. Say so before you start it rather than going quiet.
  - Skip it only when the user explicitly asked for the HTML alone, or when the request
    was a small tweak they are still iterating on.

BRAND-ADAPTIVE THEME & COLOR SYSTEM BINDING:
  - When building an explainer from website research, strictly bind the extracted BRAND THEME & COLOR ROLE SYSTEM:
    • THEME MODE MATCHING: If the website is DARK MODE (e.g. Higgsfield, Linear, Supabase, Vercel), build a dark-glass composition using the extracted dark background (--bg-primary: e.g. #030304, #08090a) and dark surface cards (--bg-secondary: #131313). If LIGHT MODE (e.g. Stripe, Notion), build a clean light-glass composition with light backgrounds and crisp contrast text.
    • ACCENT ROLES: Bind --accent-primary to the extracted Primary Brand Accent (e.g. #d1fe17 Neon Lime for Higgsfield) for hero badges, active buttons, neon glowing orbs, and focus borders. Bind --accent-secondary to the Secondary Accent for subtle gradient partners.
    • TYPOGRAPHY BINDING: Include the exact extracted typefaces via Google Fonts <link> inside index.html <head>!
    • LOGOS & ASSETS: Download the official brand logo from verified assets into assets/logo.svg!

RESEARCH WHEN YOU DO NOT KNOW.
  If the user names a product or brand, fetch_page their site and use the real colours,
  real typefaces, and real wording instead of inventing them. web_search first if you
  do not have the URL. download_asset any logo or image you reference — a remote URL in
  a composition breaks the render.

BEST PRACTICES FOR BRAND ASSETS & FONTS:
  1. BRAND LOGOS & VECTORS:
     Use SimpleIcons CDN with fetch_asset to download pixel-perfect SVG logos into ./assets/:
     https://cdn.simpleicons.org/{brand_name} (e.g. spotify, apple, slack, stripe, github, figma, notion, discord, google, youtube).
     Example: fetch_asset(url: "https://cdn.simpleicons.org/spotify", target_path: "assets/spotify-logo.svg")
  2. GOOGLE FONTS INCLUSION:
     Always add Google Fonts <link> tag inside the <head> of index.html for any font used in CSS!
     Example: <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Inter:wght@400;600;700&display=swap">
  3. REAL ARTWORK & ALBUM COVERS:
     For real album covers, app icons, or product artwork, search using web_search or fetch_asset from iTunes Search API:
     https://itunes.apple.com/search?term={query}&entity=album
     Or use high-quality Unsplash image URLs: https://images.unsplash.com/...
  4. LOCAL ASSET HARVESTING:
     Download all images/logos into ./assets/ using fetch_asset BEFORE referencing them in index.html src attributes!
  5. BACKGROUND MUSIC & SOUND EFFECTS (SFX):
     Use add_background_music to add synced royalty-free background soundtracks (presets: tech_ambient, upbeat_corporate, dark_glass_synth, minimal_chill) to assets/music.mp3 at 25% volume.
     Use list_sfx and add_sfx to copy UI sound effects (clicks, glass UI, pops, swooshes) into assets/sfx/.
     Whenever building a SaaS explainer animation, call add_background_music and add_sfx to provide rich broadcast-quality sound!

ASSETS MUST NEVER RENDER BROKEN.
  Every image src in the finished composition has to resolve to a file inside the project
  folder. A dead link does not just lose the image — it collapses the box to zero and the
  whole layout around it shifts, so one 404 ruins a frame that was otherwise finished.
  - download_asset never fails on a dead URL: it writes a styled SVG placeholder at the
    same path instead. READ THE RESULT. When it says it placeholdered, it also tells you
    the new .svg path — reference THAT path, not the one you asked for, or you have
    hand-written the broken src the tool just saved you from.
  - Pass fallback_label, fallback_color and fallback_kind on every download_asset call.
    They cost nothing when the download works, and when it fails they are the difference
    between a branded placeholder and a grey box.
  - When you know no real asset exists — a fictional product, an invented avatar, a
    screenshot you cannot source — call make_placeholder directly rather than downloading
    something almost right from a stock site.
  - After the composition is written, check_composition reports failed requests. Any
    "failed request" line pointing at a local file is a broken asset. Fix it before you
    tell the user anything is finished.

USE THE TERMINAL WHEN IT HELPS.
  run_command is there for checking ffmpeg, probing a rendered file, converting an
  asset. The user approves each one, so keep them purposeful.

DECIDE BY DEFAULT. ASK ONLY WHEN A GUESS WOULD BE RECKLESS.
  You are the professional here. The user hired you to make judgement calls, not to hand
  them a questionnaire. Duration, palette, easing, type scale, scene count, which sound
  fits a beat — decide all of it yourself and say plainly in your narration what you chose
  and why. A user reacting to something concrete gives you better direction in one line
  than they would give in five answers to abstract questions.

  ask_user is for the narrow case where guessing wrong wastes the whole build and nothing
  in the brief or the files points either way:
    - the brief is genuinely ambiguous about WHAT is being animated, not how
    - a hard external constraint was referenced but not supplied (a brand kit they
      mentioned, a required aspect ratio for a placement you cannot see)
    - two readings lead to structurally different animations and nothing favours one
  If a competent designer would just pick and move on, pick and move on.

  When you do ask: ask in the SAME LANGUAGE the user wrote in — Roman Urdu brief means a
  Roman Urdu question. Ask at the moment it comes up, mid-run is fine. Never ask for
  something you can find out yourself (read the file, fetch the page, list the sfx folder),
  never ask permission to write files (the approval prompt covers that), and never ask
  twice about the same thing. Keep options concrete — "30 seconds", "#6366f1 indigo on
  near-black" — never "medium length" or "cool palette", and mark the sensible default.

SOUND IS PART OF THE MOTION, NOT A DECORATION.
  A card that pops in silently reads as a mockup. The same card with a click on the
  landing frame reads as a product. So every composition you build ships with sound
  wired to the visuals.

  Call list_sfx FIRST and use only filenames it returned. A guessed filename is a silent
  404 that you will not notice, because nothing on screen changes. Then call add_sfx to
  copy the ones you picked into the project's own assets/sfx/ folder, and reference them
  by the project-relative path it gives you. The library lives next to the editor, not
  inside the project, so pointing straight at it plays nothing outside the running server.

  Then, for each significant visual beat, wire a sound to the frame where the motion
  LANDS — not where it starts. Sound is late by design; a whoosh that fires on the first
  frame of a 400ms slide feels detached from the element that is still moving.

  What earns a sound:
    element enters / card pops        → click_00x.ogg or drop_00x.ogg
    panel or modal opens             → maximize_00x.ogg   closes → minimize_00x.ogg
    glass / frosted surface appears  → glass_00x.ogg
    toggle, tab or state switch      → switch_00x.ogg
    confirmation, checkmark, success → confirmation_00x.ogg
    error, warning, negative beat    → error_00x.ogg
    hover, cursor crossing a target  → rollover_00x.ogg
    question or reveal beat          → question_00x.ogg
  What must NOT get a sound: ambient particles, background gradients, the progress bar,
  film grain, idle breathing loops. A film that clicks on every frame is noise.

  IMPLEMENTATION — this has to survive scrubbing, which is the part that is easy to get
  wrong. seek(t) is called on every frame AND every time the user drags the scrubber, so
  a naive new Audio(...).play() inside seek() fires hundreds of times and machine-guns
  the same click. Build a cue table and gate it:

    const SFX = [
      { t: 1.20, src: 'assets/sfx/click_001.ogg', vol: 0.5 },
      { t: 2.05, src: 'assets/sfx/glass_002.ogg', vol: 0.35 }
    ];
    SFX.forEach(cue => { cue.audio = new Audio(cue.src); cue.audio.volume = cue.vol ?? 0.5; });

    let lastT = 0;
    window.playCuesFor = (t, playing) => {
      // Only fire while actually playing forward. Scrubbing and rewinding stay silent —
      // seek(t) must remain a pure function of t for the renderer, and audio is a side
      // effect that has no place in it.
      if (playing && t > lastT && t - lastT < 0.5) {
        SFX.forEach(cue => {
          if (cue.t > lastT && cue.t <= t) {
            try { cue.audio.currentTime = 0; cue.audio.play().catch(() => {}); } catch (_) {}
          }
        });
      }
      lastT = t;
    };

  Call playCuesFor(t, isPlaying) from the rAF playback loop — NEVER from inside seek(t).
  Keep every cue volume between 0.25 and 0.6; SFX at 1.0 clips and sounds amateur.
  Reference sounds by a path relative to the project, and download or copy them in if
  they are not already there — the exported MP4 has no audio track, so these are for the
  editor preview, but a 404 still logs an error that check_composition will flag.

  Finally: list the cue times in your closing summary, so the user knows what to listen
  for instead of wondering whether sound was wired at all.

WHEN YOU FINISH.
  Say plainly what you built and what you verified. If something is still weak or you
  made a judgement call the user might disagree with, say so — do not oversell it.`;

export async function generateMotionGraphics(messages, options = {}) {
  const config = loadConfig();
  const apiKey = options.apiKey || config.apiKey;

  if (!apiKey || apiKey === 'GEMINI_API_KEY_HERE') {
    console.log('\n⚠️  No API Key found. Creating template motion graphics project...');
    return { files: { 'index.html': createTemplateMotionGraphics() }, usedFallback: true };
  }

  const project = options.project;
  if (!project || !project.dir) {
    throw new Error('generateMotionGraphics needs a project ({ dir, htmlFile, exportsDir }) to work in.');
  }

  const notify = typeof options.emit === 'function' ? options.emit
    : typeof options.onEvent === 'function' ? options.onEvent
      : () => { };

  resetSkillAnnouncements();
  // A revision continues a build that already announced these skills, and they come back
  // from readSkillFile's cache byte-identical — so re-announcing describes no work.
  setSkillAnnouncements(!options.revise);
  // Each build starts with no beliefs about what is on disk. Carrying the last run's file
  // hashes would let a "you already read this" reply refer to a transcript this model cannot
  // see, which is worse than a redundant read.
  resetFileMemory();

  /**
   * Research was already done at the plan stage — reuse it instead of re-scraping the site.
   * The old path ran enrichPromptWithUrlContext twice (once at plan, once at build), which
   * meant the same URL was fetched and parsed twice with no sharing.
   *
   * When nobody planned first — `anymotion generate` goes straight here — the link still has
   * to be read before anything is written, so this runs the same researchBrief the plan step
   * uses, with the lighter enrichment as its fallback.
   */
  const alreadyResearched = messages.some(m =>
    typeof m.content === 'string' && m.content.includes('### RESEARCH')
  );

  const lastUserIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'user' && typeof m.content === 'string') return i;
    }
    return -1;
  })();

  let enriched = messages.map(m => ({ ...m }));
  const existingResearch = options.research || options.approvedPlan?._research || null;

  if (existingResearch && existingResearch.block && !alreadyResearched && lastUserIndex !== -1) {
    enriched[lastUserIndex] = {
      ...enriched[lastUserIndex],
      content: `${enriched[lastUserIndex].content}\n\n${existingResearch.block}`
    };
  } else if (!existingResearch && !alreadyResearched && lastUserIndex !== -1 && hasUrl(messages[lastUserIndex].content)) {
    let research = null;
    try {
      research = await researchBrief(messages[lastUserIndex].content, {
        emit: notify,
        signal: options.signal
      });
    } catch (_) {
      research = null;
    }

    if (research && research.block) {
      enriched[lastUserIndex] = {
        ...enriched[lastUserIndex],
        content: `${enriched[lastUserIndex].content}\n\n${research.block}`
      };
    } else {
      enriched[lastUserIndex] = {
        ...enriched[lastUserIndex],
        content: await enrichPromptWithUrlContext(enriched[lastUserIndex].content)
      };
    }
  }

  const convo = enriched.map(m => ({ ...m }));

  // The quality the user chose has to reach render_video, and the model calling that tool is
  // the weakest link in the chain — a build that ran for forty turns may well have lost the
  // plan's `quality` line by the time it gets there, and would then render at the config
  // default without anyone noticing the 4K they asked for came out 1080p. So the approved
  // quality is folded into the config the tool context is built from, which makes
  // `input.resolution || ctx.config.defaultResolution` land on the user's answer even when
  // the model omits the argument entirely. An explicit resolution still wins, because a
  // later "render me a quick draft" is a real instruction.
  const approvedQuality = options.approvedPlan?.quality;
  const configOverrides = { ...(options.configOverrides || {}) };
  if (approvedQuality && configOverrides.defaultResolution === undefined) {
    configOverrides.defaultResolution = approvedQuality;
  }

  if (options.approvedPlan) {
    const last = convo[convo.length - 1];
    if (last && typeof last.content === 'string') {
      // _research is the planner's own bookkeeping, not part of the plan. It is already in
      // the prompt as a formatted block, so serialising it here would send the same scrape
      // twice — once readable, once as raw JSON.
      const { _research, ...planForModel } = options.approvedPlan;
      last.content += `\n\nTHE APPROVED PLAN TO EXECUTE:\n${JSON.stringify(planForModel, null, 2)}`;
    }
  }

  const coreSkill = detectCoreSkill(convo);
  const system =
    `${getSkillSystemPrompt(notify, coreSkill)}\n${AGENT_OPERATING_RULES}\n\n` +
    `Your project folder is "${project.name}". All tool paths are relative to it. ` +
    `The composition entry point is index.html.`;

  const result = await runAgentLoop({
    messages: convo,
    system,
    project,
    config: { ...config, ...configOverrides },
    model: options.model,
    todos: options.todos || [],
    // The build is the longest and least recoverable step — it writes the file the user
    // actually gets. It thinks hard by default.
    thinking: options.thinking || config.thinking || 'high',
    signal: options.signal,
    emit: options.emit || (() => { }),
    requestApproval: options.requestApproval,
    askUser: options.askUser
  });

  // The files now live on disk — the loop wrote them through the tools rather than
  // accumulating strings in memory. Read back what exists so callers that expect the
  // old `{ files }` shape keep working.
  const files = {};
  const entry = path.join(project.dir, 'index.html');
  if (fs.existsSync(entry)) files['index.html'] = fs.readFileSync(entry, 'utf-8');

  return {
    files,
    text: result.text,
    turns: result.turns,
    toolCalls: result.toolCalls,
    todos: result.todos,
    stopReason: result.stopReason,
    usedFallback: false,
    messages: convo
  };
}

// ============================================================
// TEMPLATE FALLBACK — Rich Motion Graphics Template
// ============================================================
export function createTemplateMotionGraphics(prompt = 'SaaS Product Motion Explainer') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${prompt}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0b0f19;
      --accent-color: #00cbd6;
      --accent-glow: rgba(0, 203, 214, 0.35);
      --card-bg: rgba(255, 255, 255, 0.05);
      --text-color: #ffffff;
      --text-dim: #94a3b8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      width: 100vw; height: 100vh;
      background: var(--bg-color);
      color: var(--text-color);
      font-family: 'Outfit', sans-serif;
      overflow: hidden;
      display: flex;
      justify-content: center;
      align-items: center;
      perspective: 1200px;
    }

    .bg-glow {
      position: absolute;
      width: 700px; height: 700px;
      background: radial-gradient(circle, var(--accent-glow) 0%, rgba(0,0,0,0) 70%);
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      filter: blur(80px);
      z-index: 0;
    }

    .stage {
      position: relative; z-index: 10;
      text-align: center; max-width: 900px; padding: 40px;
    }

    .glass-card {
      background: var(--card-bg);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 24px;
      padding: 52px 64px;
      box-shadow: 0 30px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2);
      transform-style: preserve-3d;
    }

    .badge {
      display: inline-block;
      padding: 8px 18px;
      background: rgba(0, 203, 214, 0.15);
      border: 1px solid var(--accent-color);
      color: var(--accent-color);
      border-radius: 100px;
      font-size: 13px; font-weight: 700;
      letter-spacing: 1.5px; text-transform: uppercase;
      margin-bottom: 28px;
      box-shadow: 0 0 20px var(--accent-glow);
    }

    h1#motion-title {
      font-size: 54px; font-weight: 800; line-height: 1.1;
      margin-bottom: 16px;
      background: linear-gradient(135deg, #ffffff 0%, #94a3b8 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }

    p#motion-subtitle {
      font-size: 19px; color: var(--text-dim);
      margin-bottom: 36px; line-height: 1.6;
    }

    .cta-btn {
      display: inline-flex; align-items: center; gap: 10px;
      background: linear-gradient(135deg, var(--accent-color) 0%, #0098a1 100%);
      color: #000; font-size: 17px; font-weight: 700;
      padding: 15px 34px; border-radius: 12px; border: none;
      box-shadow: 0 12px 28px var(--accent-glow); cursor: pointer;
    }

    .particle {
      position: absolute; background: var(--accent-color);
      border-radius: 50%; opacity: 0.6; filter: blur(2px);
    }
  </style>
</head>
<body>
  <div class="bg-glow" id="bgGlow"></div>
  <div class="stage">
    <div class="glass-card" id="card">
      <div class="badge" id="badge">ANYMOTION AI STUDIO</div>
      <h1 id="motion-title">${prompt}</h1>
      <p id="motion-subtitle">Broadcast-quality animated motion graphics generated by the Anymotion AI Agent</p>
      <button class="cta-btn" id="motion-cta">
        <span>Explore Motion</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
  </div>

  <script>
    window.DURATION = 10.0;
    const card = document.getElementById('card');
    const bgGlow = document.getElementById('bgGlow');

    for (let i = 0; i < 6; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.id = 'particle-' + i;
      p.style.width = (10 + i * 4) + 'px';
      p.style.height = (10 + i * 4) + 'px';
      document.body.appendChild(p);
    }

    window.seek = function(t) {
      t = Math.max(0, Math.min(window.DURATION, t));
      const entry = Math.min(1, t / 1.5);
      const scale = 0.7 + 0.3 * Math.sin(entry * Math.PI / 2);
      const rotX = 25 * (1 - entry);
      card.style.transform = \`rotateX(\${rotX}deg) scale(\${scale})\`;
      card.style.opacity = Math.min(1, t / 0.8);
      const glow = 1 + 0.2 * Math.sin(t * 2);
      bgGlow.style.transform = \`translate(-50%, -50%) scale(\${glow})\`;
      for (let i = 0; i < 6; i++) {
        const p = document.getElementById('particle-' + i);
        const angle = t * 1.5 + (i * Math.PI / 3);
        const radius = 220 + i * 25 + Math.sin(t * 3 + i) * 20;
        const x = window.innerWidth / 2 + Math.cos(angle) * radius - 10;
        const y = window.innerHeight / 2 + Math.sin(angle) * radius - 10;
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.opacity = 0.3 + 0.4 * Math.sin(t * 4 + i);
      }
    };

    let startTime = null;
    function autoPlay(ts) {
      if (!startTime) startTime = ts;
      window.seek(((ts - startTime) / 1000) % window.DURATION);
      requestAnimationFrame(autoPlay);
    }
    requestAnimationFrame(autoPlay);
  </script>
</body>
</html>`;
}
