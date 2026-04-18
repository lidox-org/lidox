import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AiInvokeSchema,
  AiInteractionStatus,
  AiTaskType,
  AI_READ_TASKS,
  AI_WRITE_TASKS,
} from '@lidox/types';

test('AI invoke schema accepts orchestration metadata needed by the spec', () => {
  const parsed = AiInvokeSchema.parse({
    task: 'rewrite',
    selection: 'Selected text',
    nodeId: 'paragraph-12',
    stateVector: 'encoded-state-vector',
    language: 'French',
  });

  assert.deepEqual(parsed, {
    task: 'rewrite',
    selection: 'Selected text',
    nodeId: 'paragraph-12',
    stateVector: 'encoded-state-vector',
    language: 'French',
  });
});

test('AI invoke schema rejects empty selections', () => {
  const parsed = AiInvokeSchema.safeParse({
    task: 'rewrite',
    selection: '',
  });

  assert.equal(parsed.success, false);
});

test('AI read/write task lists are disjoint and cover all registered tasks', () => {
  const allTasks = new Set(AiTaskType.options);
  const classifiedTasks = new Set([...AI_WRITE_TASKS, ...AI_READ_TASKS]);

  assert.equal(classifiedTasks.size, allTasks.size);

  for (const task of AI_WRITE_TASKS) {
    assert.equal(AI_READ_TASKS.includes(task), false);
  }

  for (const task of allTasks) {
    assert.equal(classifiedTasks.has(task), true);
  }
});

test('AI interaction status supports review-first lifecycle states', () => {
  const statuses = new Set(AiInteractionStatus.options);

  assert.equal(statuses.has('pending'), true);
  assert.equal(statuses.has('accepted'), true);
  assert.equal(statuses.has('rejected'), true);
  assert.equal(statuses.has('partial'), true);
  assert.equal(statuses.has('expired'), true);
});
