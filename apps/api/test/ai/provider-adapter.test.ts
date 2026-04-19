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

test('provider adapter streams mock responses as multiple chunks', async () => {
  const adapter = new GroqAiProviderAdapter('', 'fallback-model');

  const stream = await adapter.stream({
    taskType: 'summarize',
    selection: 'This is a longer body of text that should be emitted in multiple streaming chunks for the mock provider.',
  });

  const chunks: string[] = [];
  for await (const chunk of stream.chunks) {
    chunks.push(chunk);
  }

  assert.equal(stream.model, 'mock');
  assert.equal(stream.inputTokens > 0, true);
  assert.equal(chunks.length > 1, true);
  assert.match(chunks.join(''), /Summary/i);
});
