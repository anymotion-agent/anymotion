/**
 * INTAKE — the agent decides what to do with what the user just said.
 *
 * What this replaces: chat.js used to classify every message with a regex. If it matched
 * `looksLikeBuildRequest`, planMotionGraphics was called immediately, on the spot. The
 * planner then had exactly one shot: whatever was in the message was all it would ever know.
 *
 * That is the wrong shape for "saas explainer bnao is website ka". The single most useful
 * thing available — the site itself, its palette, its typefaces, its real product wording —
 * sits behind a fetch that the plan step had no way to perform first. So the plan was
 * written from invented branding, and the build spent its turns fighting the plan.
 *
 * Here the model drives instead. It reads the message, and *it* decides: read the site
 * first, ask a question, or go straight to planning because the brief is already complete.
 * Planning stops being an automatic consequence of matching a regex and becomes a tool the
 * agent calls when it judges it has enough to plan well — which is the whole point.
 *
 * The contract is deliberately narrow. Intake gathers context and decides; it does not
 * write the plan and it never touches the composition. It returns one of:
 *
 *   { action: 'plan',   brief, research }   ready to plan, brief enriched with findings
 *   { action: 'answer', text }              a question, already answered
 *
 * so chat.js stays a router and the planner stays the only thing that writes plans.
 */

import { loadConfig } from '../config/config-manager.js';
import { researchBrief, hasUrl } from './research.js';
import { listSkills } from './skills.js';

/**
 * How intake is told to behave.
 *
 * Questions are rationed but no longer discouraged. The earlier version told the model to
 * decide everything itself, on the theory that a model handed a question-asking tool will
 * interview the user for six turns before building anything. That is a real failure mode,
 * but the cure overshot: four decisions are genuinely the user's — how many scenes, how
 * long, which brand colours, and what quality to export at — and guessing them wastes a
 * build the user then has to sit through again.
 *
 * So the rule is now about WHICH question, not how few. The four below are asked when the
 * user has not settled them and nothing readable settles them either; everything else
 * (easing, type scale, pacing, layout, sound) stays the agent's call. The cap is two
 * ask_user calls, which is what forces the four into bundled questions rather than a
 * four-turn interview: scenes and length travel together as one shape-of-film choice, and
 * a palette that research already found is not a question at all.
 */
const SYSTEM_INTAKE = `You are Anymotion's intake stage. A user has just said something. Your job is to work out what they want and get ready to act on it — not to build anything yet.

You have three ways to finish:

1. call create_plan — when this is a request to build or change an animation and you have what you need to plan it well
2. call ask_user — to settle a composition decision that is the user's to make, or when a wrong guess would waste the whole build
3. just reply in text — when it is a question, a comment, or small talk

# Read before you plan

If the message contains a URL, read it with research_site BEFORE you call create_plan. Never skip this. The site carries the palette, the typefaces, the logo and the product's own wording; a plan written without them is a plan built on guesses that the build then has to fight. This is the single highest-value thing you can do.

If the request names a technique your loaded guidance does not cover — React animation, SVG path morphing — check list_skills and load_skill the one that fits, so the plan is written knowing what the build will actually be able to do.

# Settle these four before you plan

A plan is a composition decision, and four of those belong to the user, not to you:

1. **Scenes and length** — how many beats the film runs, and how long it lasts.
2. **Brand colours** — the palette the film is built in.
3. **Render quality** — the resolution the final MP4 is exported at.
4. **Aspect** — only when the placement is unclear and it is not 16:9.

For each one, in this order: if the user already said it, use it. If research_site turned it up — the palette almost always comes from the site — use that and do not ask. Only if neither settles it, ask.

Bundle them. **At most two ask_user calls before create_plan**, so:

- Scenes and length are ONE question, because they are one choice about the shape of the film. Offer 3 concrete films, not abstractions: something like "Short — around 20s, 4-5 scenes", "Standard — around 35s, 6-7 scenes", "Detailed — around 60s, 9-10 scenes". Say what each is good for.
- Render quality is ONE question with 3-4 options, and each option must carry its real cost, because render time scales with pixels: "1080p — 1920x1080, the usual choice, fastest", "2K — 2560x1440, sharper for a big screen", "4K — 3840x2160, best quality, slowest to render", "720p — 1280x720, quick draft". Name the option in the brief exactly as "720p", "1080p", "2k" or "4k", because that is the token the render step takes.
- If the palette is genuinely unknown AND you still have a question left, fold it into one of the above rather than spending a third call. Otherwise pick a palette, and say in the brief that you chose it so the user can correct it on the first preview.

Ask in the SAME language the user wrote to you in. Do not ask about anything else — easing, type scale, pacing, layout, sound, typography and every other craft decision is yours to make, and a plan that explains those choices is the good outcome. Never ask about something you can find out yourself: read the file, fetch the page, list the folder.

Skip the questions entirely when they would be noise: a revision to an existing film, a question, small talk, or a brief that already spells all four out. And if a decision surfaces later, mid-build, ask_user is available then too — this stage is not your only chance.

# When you call create_plan

Put everything you learned into the brief: what they asked for, what the site turned out to look like, what the user answered, and what you decided and why. The brief you write is the only thing the planner will see, so anything you leave out is lost.

State the four settled decisions in plain terms the planner cannot misread — scene count, total length, the palette as hex, and the render quality as one of "720p" / "1080p" / "2k" / "4k". Where the user chose it, say so, because those are requirements rather than suggestions and nothing later in the run may drift away from them.

Write the brief in English even when the user wrote in another language — but keep their exact words for anything about tone, wording or copy.`;

/**
 * The tools intake can reach. Not the build set: intake cannot write files, cannot run
 * commands, and cannot render. Everything here either reads something or ends the stage.
 */
function intakeTools() {
  return [
    {
      name: 'research_site',
      description:
        'Read one or more web pages and extract branding: colour palette, typefaces, logo and image ' +
        'assets (each probed to confirm it actually loads), and the product copy. Call this FIRST ' +
        'whenever the request contains a URL — before create_plan, never after. The result is what ' +
        'lets the plan use their real brand instead of invented colours.',
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The page to read. Pass the URL exactly as the user wrote it.'
          }
        },
        required: ['url']
      }
    },
    {
      name: 'create_plan',
      description:
        'Declare that you are ready to plan, and hand over the brief to plan from. Call this when ' +
        'the request is to build or change an animation and you have gathered what you need — ' +
        'the site read, the skill loaded, the questions answered. Do NOT call it before reading a ' +
        'URL the user gave you, and do NOT call it while scene count, length, palette or render ' +
        'quality are still open questions you were supposed to ask. ' +
        'Do NOT call it for a question; answer those in text instead.',
      input_schema: {
        type: 'object',
        properties: {
          brief: {
            type: 'string',
            description:
              'The full brief for the planner: what to build, what the research turned up, and the ' +
              'choices you made. Self-contained — the planner sees only this.'
          },
          reasoning: {
            type: 'string',
            description: 'One short line for the user on why you are ready to plan now.'
          }
        },
        required: ['brief']
      }
    },
    {
      name: 'list_skills',
      description:
        'List the craft references available on this machine, with one line on what each covers. ' +
        'Use when the request touches a technique your loaded guidance may not cover.',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'load_skill',
      description:
        'Read one skill by name, so the brief is written knowing what the build can do. Load at most ' +
        'one at this stage — the build stage can load more once it knows what it needs.',
      input_schema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Exact name from list_skills.' } },
        required: ['name']
      }
    }
  ];
}

/**
 * Whether this provider can run the intake stage at all.
 *
 * Intake is a tool-use loop: the model decides by *calling* research_site, ask_user or
 * create_plan. That used to be an Anthropic-only capability here, because
 * `callOpenAICompatible` built its payload with no `tools` key — so on openrouter/openai the
 * model could only reply in text, every build request came back as `{action:'answer'}`, and
 * those providers were held back on the regex router instead.
 *
 * `callOpenAICompatible` now routes tool-bearing requests through the same streamed
 * tool loop the build stage uses, so the decision is available on every provider and the
 * gate is about the key rather than the vendor. Providers still differ in how well they
 * *use* tools, but that is a model-quality question, and a weak tool-caller degrades into
 * plain text — which `runIntake` already treats as `{action:'answer'}`.
 */
export function intakeAvailable(config = {}) {
  return Boolean(config.apiKey && config.apiKey !== 'GEMINI_API_KEY_HERE');
}

export { SYSTEM_INTAKE, intakeTools };

/**
 * Runs the intake stage.
 *
 * `callAIProvider` already owns the parts that are easy to get wrong — streaming, the stall
 * guard, thinking-shape self-healing, retries that resume rather than restart, and a tool
 * loop that pairs every tool_use with a tool_result. It takes a `toolHandler`, so intake is
 * that handler plus a decision recorded on the side. Writing a second agent loop here would
 * mean maintaining two copies of all of that.
 *
 * Returns `{ action: 'plan', brief, research }` or `{ action: 'answer', text }`.
 */
export async function runIntake(messages, options = {}) {
  const config = loadConfig();
  const apiKey = options.apiKey || config.apiKey;
  if (!apiKey || apiKey === 'GEMINI_API_KEY_HERE') {
    throw new Error('No API key configured. Set one with: /config apiKey <key>');
  }

  const notify = typeof options.onEvent === 'function' ? options.onEvent : () => { };
  const { callAIProvider } = await import('./ai-engine.js');
  const { getTool } = await import('./tools/index.js');

  // Set by the create_plan handler. The tool loop keeps running until the model stops
  // calling tools, so this is read after the call returns rather than thrown to escape.
  let decision = null;
  let research = options.research || null;
  const researched = new Set();

  const toolHandler = async (name, input) => {
    if (name === 'create_plan') {
      const brief = String(input?.brief || '').trim();
      if (!brief) throw new Error('brief is required — write the full brief for the planner.');
      decision = { brief, reasoning: String(input?.reasoning || '').trim() };
      notify({ type: 'intake_decision', action: 'plan', detail: decision.reasoning });
      // The model is told the stage is over so it stops rather than narrating past the
      // decision; whatever it says next is discarded anyway.
      return 'Ready to plan. The brief has been handed to the planner — stop here and say nothing further.';
    }

    if (name === 'research_site') {
      const raw = String(input?.url || '').trim();
      if (!raw) throw new Error('url is required.');

      // researchBrief finds URLs with a regex that requires a scheme, so a bare "acme.com"
      // yields nothing and comes back null — a read that reports failure without a single
      // request having been made. The model writes the URL the way the user typed it, and
      // people do not type schemes, so this is the common case rather than the edge one.
      const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

      if (researched.has(url)) {
        return 'That page has already been read this turn. Use what it returned rather than fetching it again.';
      }
      researched.add(url);

      const found = await researchBrief(url, { emit: notify, signal: options.signal });
      if (!found) {
        notify({ type: 'fail', url, detail: 'nothing could be read' });
        return `Nothing could be read from ${url}. Plan without it, and say in the brief that the site could not be reached so the palette is your own choice.`;
      }

      // A page that resolved but gave up no colours, type or copy is a failure the model
      // needs told plainly — otherwise it plans as if it had branding it does not have.
      if (!found.block || !found.block.trim()) {
        notify({ type: 'fail', url, detail: 'no branding found on the page' });
        return `${url} loaded but exposed no usable branding (likely a JS-rendered page). Choose the palette and type yourself and say so in the brief.`;
      }

      // Merge rather than overwrite: a brief with two links should end up with both sites'
      // findings, not only the last one's.
      research = research
        ? {
          ...found,
          urls: [...research.urls, ...found.urls],
          block: `${research.block}\n\n${found.block}`,
          liveAssets: [...research.liveAssets, ...found.liveAssets],
          deadAssets: [...research.deadAssets, ...found.deadAssets]
        }
        : found;

      return found.block;
    }

    // ask_user, list_skills and load_skill are the real registered tools, run through the
    // real dispatch path, so the TUI prompt and the skill event behave exactly as they do
    // mid-build. Duplicating them here would be a second implementation to keep in step.
    const tool = getTool(name);
    if (!tool) return `No tool named "${name}" at this stage. Use research_site, create_plan, list_skills, load_skill or ask_user.`;

    try {
      const result = await tool.run(input || {}, {
        emit: notify,
        askUser: options.askUser,
        project: options.project,
        todos: []
      });
      return (result && typeof result === 'object' ? result.content : String(result ?? '')) || 'done';
    } catch (err) {
      // The tool loop turns a throw into an is_error tool_result, which the model reads and
      // recovers from — but silently. The user then watches intake take twenty seconds and
      // sees only the reasoning mention that something "failed", with no line saying what.
      // Surfacing it here is the difference between a visible skipped step and a mystery.
      notify({ type: 'tool_failed', tool: name, detail: err.message });
      throw err;
    }
  };

  const tools = [...intakeTools()];
  // ask_user is the registered one, schema and all — intake only decides whether to offer it.
  const ask = getTool('ask_user');
  if (ask && typeof options.askUser === 'function') {
    tools.push({ name: ask.name, description: ask.description, input_schema: ask.input_schema });
  }

  const text = await callAIProvider(null, config, {
    system: options.projectContext
      ? `${SYSTEM_INTAKE}\n\nCURRENT SESSION:\n${options.projectContext}`
      : SYSTEM_INTAKE,
    messages,
    model: options.model,
    // Intake is a judgement call, not a generation task: enough thinking to notice that a
    // brief is missing its palette, not enough to make a one-line answer slow.
    thinking: options.thinking === 'off' ? 'off' : 'low',
    maxTokens: 4096,
    tools,
    toolHandler,
    signal: options.signal,
    onToken: options.onToken,
    onThinking: options.onThinking
  });

  if (decision) {
    return {
      action: 'plan',
      brief: decision.brief,
      reasoning: decision.reasoning,
      research
    };
  }

  return { action: 'answer', text: (text || '').trim(), research };
}
