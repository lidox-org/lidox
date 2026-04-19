import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCompletedTaskResult,
  createFailedTaskResult,
  createProcessingTaskResult,
  createQueuedTaskResult,
} from '../../src/ai/task-status';

const TASK_ID = '33333333-3333-4333-8333-333333333333';

test('task-status helpers create stable queued and processing snapshots', () => {
  assert.deepEqual(createQueuedTaskResult(TASK_ID), {
    taskId: TASK_ID,
    status: 'queued',
  });

  assert.deepEqual(createProcessingTaskResult({ taskId: TASK_ID }), {
    taskId: TASK_ID,
    status: 'processing',
    result: undefined,
    modelUsed: undefined,
  });
});

test('task-status helpers create completed and failed snapshots', () => {
  assert.deepEqual(
    createCompletedTaskResult({
      taskId: TASK_ID,
      result: 'done',
      inputTokens: 12,
      outputTokens: 8,
      modelUsed: 'mock',
    }),
    {
      taskId: TASK_ID,
      status: 'completed',
      result: 'done',
      inputTokens: 12,
      outputTokens: 8,
      modelUsed: 'mock',
    },
  );

  assert.deepEqual(createFailedTaskResult(TASK_ID, 'boom'), {
    taskId: TASK_ID,
    status: 'failed',
    error: 'boom',
  });
});
