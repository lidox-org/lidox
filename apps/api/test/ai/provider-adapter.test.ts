import test from 'node:test';
import assert from 'node:assert/strict';
import { GroqAiProviderAdapter } from '../../src/ai/provider-adapter';

test('provider adapter returns a mock response when no API key is configured', async () => {
  const adapter = new GroqAiProviderAdapter('', 'fallback-model');

  const response = await adapter.generate({
    taskType: 'rewrite',
    selection: 'Hello world',
  });

  assert.equal(response.model, 'mock');
  assert.match(response.result, /Rewritten/i);
  assert.equal(response.inputTokens > 0, true);
  assert.equal(response.outputTokens > 0, true);
});
