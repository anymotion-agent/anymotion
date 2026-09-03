/**
 * Thinking-parameter translation tests.
 *
 * buildOpenAIThinkingParams / buildAnthropicThinkingParams are the one place that maps
 * the user's abstract /think level onto a vendor's actual dialect. These tests pin that
 * mapping for every family the agent supports: send exactly the fields the vendor
 * accepts, nothing it would 400 on, and make 'off' a real disable for the models that
 * think by default.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  THINKING_LEVELS,
  normalizeThinkingLevel,
  effortFromLevel,
  modelFamily,
  buildOpenAIThinkingParams,
  buildAnthropicThinkingParams
} from '../src/agent/thinking-params.js';

const oi = (provider, model, level) =>
  buildOpenAIThinkingParams({ provider, model, level }).body;

describe('normalizeThinkingLevel', () => {
  test('accepts every level including off', () => {
    for (const l of THINKING_LEVELS) {
      assert.equal(normalizeThinkingLevel(l), l);
    }
  });

  test('falls back on garbage input', () => {
    assert.equal(normalizeThinkingLevel('ultra'), 'high');
    assert.equal(normalizeThinkingLevel(null), 'high');
    assert.equal(normalizeThinkingLevel(undefined, 'low'), 'low');
  });
});

describe('modelFamily', () => {
  const cases = [
    ['claude-opus-5', 'claude'],
    ['anthropic/claude-3.7-sonnet', 'claude'],
    ['glm-4.6', 'glm'],
    ['zhipu/glm-5.3', 'glm'],
    ['deepseek/deepseek-r1', 'deepseek'],
    ['qwen/qwen3-235b', 'qwen'],
    ['qwq-32b', 'qwen'],
    ['moonshotai/kimi-k2-thinking', 'kimi'],
    ['minimax/minimax-m2', 'minimax'],
    ['longcat/longcat-flash-thinking', 'longcat'],
    ['google/gemini-2.5-pro', 'gemini'],
    ['openai/gpt-5', 'gpt-reasoning'],
    ['openai/o3', 'gpt-reasoning'],
    ['openai/gpt-4o', 'gpt'],
    ['xai/grok-4', 'grok'],
    ['llama-3', 'other']
  ];
  for (const [id, expected] of cases) {
    test(`${id} → ${expected}`, () => {
      assert.equal(modelFamily(id), expected);
    });
  }
});

describe('OpenAI-compatible dialects', () => {
  test('GLM: toggle, no budget, real off', () => {
    assert.deepEqual(oi('siliconflow', 'zhipu/glm-4.6', 'max'),
      { thinking: { type: 'enabled' } });
    assert.deepEqual(oi('siliconflow', 'zhipu/glm-4.6', 'low'),
      { thinking: { type: 'enabled' } });
    assert.deepEqual(oi('siliconflow', 'zhipu/glm-4.6', 'off'),
      { thinking: { type: 'disabled' } });
  });

  test('Qwen: enable_thinking + budget, explicit off', () => {
    assert.deepEqual(oi('siliconflow', 'qwen/qwen3-235b', 'medium'),
      { enable_thinking: true, thinking_budget: 8192 });
    assert.deepEqual(oi('siliconflow', 'qwen/qwen3-235b', 'off'),
      { enable_thinking: false });
    // Budget actually varies with level — the old code never sent one at all.
    assert.equal(oi('siliconflow', 'qwen/qwen3-235b', 'max').thinking_budget, 32768);
  });

  test('DeepSeek: nothing — its API rejects unknown fields', () => {
    assert.deepEqual(oi('deepseek', 'deepseek-chat', 'high'), {});
    assert.deepEqual(oi('deepseek', 'deepseek-reasoner', 'off'), {});
  });

  test('GPT-5/o-series: reasoning_effort ladder, minimal for off', () => {
    assert.deepEqual(oi('openai', 'gpt-5', 'low'), { reasoning_effort: 'low' });
    assert.deepEqual(oi('openai', 'gpt-5', 'high'), { reasoning_effort: 'high' });
    assert.deepEqual(oi('openai', 'o3', 'off'), { reasoning_effort: 'minimal' });
  });

  test('non-reasoning GPT: no fields — reasoning_effort 400s there', () => {
    assert.deepEqual(oi('openai', 'gpt-4o', 'high'), {});
  });

  test('Gemini: effort on, none for flash off', () => {
    assert.deepEqual(oi('gemini', 'gemini-2.5-pro', 'medium'), { reasoning_effort: 'medium' });
    assert.deepEqual(oi('gemini', 'gemini-2.5-flash', 'off'), { reasoning_effort: 'none' });
    // Pro-class cannot stop thinking — off sends nothing rather than a value that 400s.
    assert.deepEqual(oi('gemini', 'gemini-2.5-pro', 'off'), {});
  });

  test('Kimi / MiniMax / LongCat / Grok: generic reasoning_effort', () => {
    assert.deepEqual(oi('together', 'moonshotai/kimi-k2-thinking', 'low'),
      { reasoning_effort: 'low' });
    assert.deepEqual(oi('together', 'minimax/minimax-m2', 'high'),
      { reasoning_effort: 'high' });
    assert.deepEqual(oi('together', 'longcat/longcat-flash-thinking', 'max'),
      { reasoning_effort: 'high' });
    assert.deepEqual(oi('xai', 'grok-4', 'medium'), { reasoning_effort: 'medium' });
  });

  test('OpenRouter: unified reasoning object, effort ONLY — no max_tokens', () => {
    // OpenRouter 400s when both fields arrive: "Only one of reasoning.effort and
    // reasoning.max_tokens can be specified". Effort is what tracks the level, so
    // max_tokens must stay out of the request entirely.
    assert.deepEqual(oi('openrouter', 'zhipu/glm-4.6', 'high'), {
      include_reasoning: true,
      reasoning: { effort: 'high' }
    });
    assert.deepEqual(oi('openrouter', 'any/model', 'off'), {
      reasoning: { enabled: false }
    });
  });

  test('null level = no preference: model default, except GLM', () => {
    assert.deepEqual(oi('openai', 'gpt-5', null), {});
    assert.deepEqual(oi('siliconflow', 'zhipu/glm-4.6', null),
      { thinking: { type: 'enabled' } });
  });

  test('xhigh/max fold to high effort — no vendor has more steps', () => {
    assert.equal(oi('openai', 'gpt-5', 'xhigh').reasoning_effort, 'high');
    assert.equal(oi('openai', 'gpt-5', 'max').reasoning_effort, 'high');
  });
});

describe('Anthropic-shaped dialects', () => {
  test('Claude: budget shape', () => {
    assert.deepEqual(buildAnthropicThinkingParams('claude-opus-5', 'high', 4096),
      { type: 'enabled', budget_tokens: 4096 });
    assert.deepEqual(buildAnthropicThinkingParams('claude-opus-5', 'low', 1024),
      { type: 'enabled', budget_tokens: 1024 });
  });

  test('Claude off: no thinking field at all', () => {
    assert.equal(buildAnthropicThinkingParams('claude-opus-5', 'off', 0), null);
  });

  test('GLM on Anthropic shape: toggle only', () => {
    assert.deepEqual(buildAnthropicThinkingParams('glm-4.6', 'max', 16384),
      { type: 'enabled' });
    assert.deepEqual(buildAnthropicThinkingParams('glm-4.6', 'off', 0),
      { type: 'disabled' });
  });

  test('budget below the API floor is dropped, not clamped', () => {
    assert.equal(buildAnthropicThinkingParams('claude-opus-5', 'high', 512), null);
  });
});

describe('effortFromLevel', () => {
  test('maps the ladder', () => {
    assert.equal(effortFromLevel('off'), 'none');
    assert.equal(effortFromLevel('low'), 'low');
    assert.equal(effortFromLevel('medium'), 'medium');
    assert.equal(effortFromLevel('high'), 'high');
    assert.equal(effortFromLevel('max'), 'high');
  });
});
