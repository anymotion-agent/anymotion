import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isPerplexityApiHost, resolveBaseUrl } from '../src/agent/agent-loop.js';

test('attribution applies to the default Perplexity endpoint', () => {
  assert.equal(isPerplexityApiHost(resolveBaseUrl({ apiKey: 'pplx-test' })), true);
  assert.equal(isPerplexityApiHost('https://api.perplexity.ai/chat/completions'), true);
});

test('attribution is skipped for custom, lookalike, and invalid hosts', () => {
  for (const url of ['https://openrouter.ai/api/v1', 'https://api.perplexity.ai.example.com', 'https://proxy.example.com/perplexity', '']) {
    assert.equal(isPerplexityApiHost(url), false, url);
  }
});
