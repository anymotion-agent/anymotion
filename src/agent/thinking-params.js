/**
 * THINKING PARAMETER TRANSLATION
 *
 * Every vendor spells "how hard should this model reason" differently, and most of them
 * reject — or silently ignore — everybody else's spelling:
 *
 *   Claude     thinking: { type: 'enabled', budget_tokens }        (budget, no effort)
 *   GPT-5/o    reasoning_effort: 'minimal' | 'low' | 'medium' | 'high'
 *   Gemini     reasoning_effort: 'low' | 'medium' | 'high' (flash also 'none')
 *   GLM        thinking: { type: 'enabled' | 'disabled' }          (toggle, no budget)
 *   Qwen       enable_thinking: bool + thinking_budget             (DashScope/SiliconFlow)
 *   DeepSeek   nothing accepted — reasoner models always think, chat models never do
 *   OpenRouter reasoning: { effort } — effort XOR max_tokens, never both          (its unified layer)
 *
 * This module is the one place that knows those dialects. Callers hand it the abstract
 * level the user picked ('off' … 'max') plus the provider and model id, and get back the
 * exact body fields that provider understands. No caller spreads vendor params by hand
 * any more — that shotgun was why a level change did nothing on half the models and
 * produced a 400 on the other half.
 *
 * Import-only module: it depends on nothing, so importing it from agent-loop or
 * ai-engine cannot create a cycle.
 */

export const THINKING_LEVELS = ['off', 'low', 'medium', 'high', 'xhigh', 'max'];

/**
 * Token budgets per level. One source of truth — agent-loop and ai-engine used to keep
 * two private copies with different numbers, which is how 'medium' meant 1536 in one
 * place and 2048 in the other.
 */
export const THINKING_BUDGETS = {
  off: 0,
  low: 1024,
  medium: 2048,
  high: 4096,
  xhigh: 8192,
  max: 16384
};

/** Coerces anything into a valid level, or the fallback. */
export function normalizeThinkingLevel(value, fallback = 'high') {
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (THINKING_LEVELS.includes(v)) return v;
  }
  return fallback;
}

/**
 * The OpenAI-style effort ladder. xhigh/max fold into 'high' — no vendor exposes more
 * than three real steps, and pretending otherwise would send a value that 400s.
 */
export function effortFromLevel(level) {
  const lvl = normalizeThinkingLevel(level, 'high');
  if (lvl === 'off') return 'none';
  if (lvl === 'low') return 'low';
  if (lvl === 'medium') return 'medium';
  return 'high';
}

/**
 * Which vendor's model this is, matched loosely so dated ids still resolve.
 * Model ids arrive with vendor prefixes on aggregators ("zhipu/glm-4.6") — the match
 * is a substring scan over the lowercased id, so prefixes are harmless.
 */
export function modelFamily(model) {
  const id = String(model || '').toLowerCase();
  if (!id) return 'other';
  if (id.includes('claude') || id.includes('anthropic')) return 'claude';
  if (id.includes('glm') || id.includes('zhipu') || id.includes('chatglm')) return 'glm';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('qwen') || id.includes('qwq')) return 'qwen';
  if (id.includes('kimi') || id.includes('moonshot')) return 'kimi';
  if (id.includes('minimax') || id.includes('abab') || id.includes('mini-max')) return 'minimax';
  if (id.includes('longcat')) return 'longcat';
  if (id.includes('gemini')) return 'gemini';
  if (id.includes('grok')) return 'grok';
  if (/gpt-5|gpt-6/.test(id)) return 'gpt-reasoning';
  // o1/o3/o4/o5 as their own token, not a substring of "sonnet" or "glm-4.6-flash".
  if (/(^|[^a-z0-9])(o[1345])([^a-z0-9]|$)/.test(id)) return 'gpt-reasoning';
  if (id.includes('gpt') || id.includes('openai')) return 'gpt';
  return 'other';
}

/**
 * Qwen3's thinking_budget window is 1024–38912 on DashScope, with 16384 as the usual
 * default. Levels are spread across that window rather than the Claude budget table,
 * because Qwen's minimum is already the Claude 'low' and 'max' has real headroom.
 */
function qwenBudget(level) {
  const table = { low: 2048, medium: 8192, high: 16384, xhigh: 24576, max: 32768 };
  return table[level] || 16384;
}

/**
 * Builds the thinking fields for an OpenAI-compatible /chat/completions request.
 *
 * @param {object}  p
 * @param {string}  p.provider  provider id from inferProvider()
 * @param {string}  p.model     the model id the request is actually for
 * @param {string?} p.level     'off'…'max', or null/undefined when the caller expresses
 *                              no preference (then the model's own default is kept)
 * @returns {{ body: object, mode: 'off'|'on'|'default'|'always', family: string }}
 *          `body` is merged into the payload; an empty body sends nothing.
 */
export function buildOpenAIThinkingParams({ provider, model, level }) {
  const lvl = level == null ? null : normalizeThinkingLevel(level, 'high');
  const family = modelFamily(model);
  const on = lvl !== null && lvl !== 'off';
  const out = {};

  const result = () => ({
    body: out,
    mode: on ? 'on' : (lvl === 'off' ? 'off' : 'default'),
    family
  });

  // OpenRouter normalises every vendor behind its own reasoning object, so family
  // detection would be wrong there — a qwen3 behind openrouter speaks OpenRouter's
  // dialect, not DashScope's.
  if (provider === 'openrouter') {
    if (on) {
      // OpenRouter rejects a request carrying BOTH reasoning.effort and
      // reasoning.max_tokens ("Only one of ... can be specified", 400). Effort is the
      // knob that actually tracks the user's level choice, so that is the one sent —
      // max_tokens stays out entirely.
      out.include_reasoning = true;
      out.reasoning = { effort: effortFromLevel(lvl) };
    } else if (lvl === 'off') {
      // Explicit off: OpenRouter honours reasoning.enabled=false for models that can
      // be told to stop, and ignores it for those that cannot (DeepSeek-R1 etc.).
      out.reasoning = { enabled: false };
    }
    return result();
  }

  // No preference expressed: keep the model's default. GLM is the one exception — its
  // default is thinking-on, and an explicit enable is what its API expects to see.
  if (lvl === null) {
    if (family === 'glm') out.thinking = { type: 'enabled' };
    return result();
  }

  switch (family) {
    case 'claude':
      // Claude behind a generic OpenAI-compatible proxy (not OpenRouter, which is
      // handled above) — most such proxies pass the Anthropic thinking object through.
      if (on) out.thinking = { type: 'enabled', budget_tokens: THINKING_BUDGETS[lvl] };
      break;

    case 'glm':
      // Zhipu's toggle. There is no budget knob — 'low' and 'max' are the same request,
      // and 'off' is a real, working off.
      out.thinking = { type: on ? 'enabled' : 'disabled' };
      break;

    case 'qwen':
      // DashScope / SiliconFlow / most self-hosted Qwen3 endpoints. enable_thinking is
      // the switch (Qwen3 thinks by default on several providers, so off must be sent
      // explicitly, not merely omitted), thinking_budget is the depth.
      if (on) {
        out.enable_thinking = true;
        out.thinking_budget = qwenBudget(lvl);
      } else {
        out.enable_thinking = false;
      }
      break;

    case 'deepseek':
      // DeepSeek accepts none of these parameters, and its API rejects unknown body
      // fields. deepseek-reasoner always thinks, deepseek-chat never does — the level
      // simply cannot reach either model, and sending anything would 400.
      break;

    case 'gemini':
      // Gemini's OpenAI-compatible surface maps reasoning_effort onto thinkingBudget.
      // Pro-class models cannot stop thinking; flash-class accept 'none'.
      if (on) {
        out.reasoning_effort = effortFromLevel(lvl);
      } else if (/flash/.test(String(model || '').toLowerCase())) {
        out.reasoning_effort = 'none';
      }
      break;

    case 'gpt-reasoning':
      // GPT-5/o-series. 'minimal' is the closest thing to off — these models cannot
      // reason with zero tokens, and omitting the param means the default, not off.
      out.reasoning_effort = on ? effortFromLevel(lvl) : 'minimal';
      break;

    case 'gpt':
      // Non-reasoning GPT (gpt-4o, gpt-4.1 …) has no thinking to control, and OpenAI's
      // API rejects reasoning_effort on these models outright.
      break;

    case 'kimi':
    case 'minimax':
    case 'longcat':
    case 'grok':
    default:
      // Generic OpenAI-style knob. Kimi-K2-thinking, MiniMax-M2, LongCat-Flash-Thinking
      // and Grok-4 all accept reasoning_effort on their current APIs; those that don't
      // either ignore it or 400, and the caller's self-heal strips it on that 400.
      if (on) out.reasoning_effort = effortFromLevel(lvl);
      break;
  }

  return result();
}

/**
 * Builds the thinking field for an Anthropic Messages-shaped request — the Claude path,
 * and any proxy (agentrouter, GLM's Anthropic-compatible endpoint) that speaks that shape.
 *
 * @param {string} model   the model id
 * @param {string?} level  'off'…'max' (null = default, which thinks at 'high')
 * @param {number}  budget the budget after resolveTokenPlan() clamping — this function
 *                         does not re-clamp, it trusts the caller's ceiling math
 * @returns {{ type: 'enabled'|'disabled', budget_tokens?: number } | null}
 */
export function buildAnthropicThinkingParams(model, level, budget) {
  const lvl = level == null ? 'high' : normalizeThinkingLevel(level, 'high');
  const family = modelFamily(model);

  // GLM speaks the Anthropic shape but takes an on/off toggle — a budget_tokens field
  // is not part of its dialect, and 'off' must be a real disabled, not an omitted param.
  if (family === 'glm') {
    return { type: lvl === 'off' ? 'disabled' : 'enabled' };
  }

  if (lvl === 'off') return null;
  if (!budget || budget < 1024) return null;
  return { type: 'enabled', budget_tokens: budget };
}
