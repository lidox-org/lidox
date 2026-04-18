import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFailedInteractionLog,
  buildPendingInteractionLog,
} from '../../src/ai/interaction-log';

const BASE_INPUT = {
  taskId: '33333333-3333-4333-8333-333333333333',
  documentId: '22222222-2222-4222-8222-222222222222',
  userId: '11111111-1111-1111-1111-111111111111',
  taskType: 'rewrite' as const,
  selection: 'Original selected text',
};

test('completed generations are logged as pending review, not accepted', () => {
  const log = buildPendingInteractionLog({
    ...BASE_INPUT,
    inputTokens: 10,
    outputTokens: 20,
    modelUsed: 'mock',
    costCents: 1,
  });

  assert.equal(log.status, 'pending');
  assert.equal(log.modelUsed, 'mock');
  assert.ok(log.sourceTextHash);
});

test('failed generations are logged as failed, not rejected by the user', () => {
  const log = buildFailedInteractionLog(BASE_INPUT);

  assert.equal(log.status, 'failed');
  assert.equal(log.inputTokens, 0);
  assert.equal(log.outputTokens, 0);
  assert.equal(log.modelUsed, 'unknown');
  assert.ok(log.sourceTextHash);
});
