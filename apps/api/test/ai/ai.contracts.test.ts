import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AiCancelResponseSchema,
  AiInteractionHistoryItemSchema,
  AiInvokeSchema,
  AiProposalReviewSchema,
  AiTaskMetadataSchema,
  AiTaskEventSchema,
  AiInteractionStatus,
  AiTaskStatus,
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
  assert.equal(statuses.has('failed'), true);
  assert.equal(statuses.has('cancelled'), true);
  assert.equal(statuses.has('expired'), true);
});

test('AI task status includes cancellation for transport lifecycle coverage', () => {
  const statuses = new Set(AiTaskStatus.options);

  assert.equal(statuses.has('queued'), true);
  assert.equal(statuses.has('processing'), true);
  assert.equal(statuses.has('completed'), true);
  assert.equal(statuses.has('failed'), true);
  assert.equal(statuses.has('cancelled'), true);
});

test('AI task event schema supports the planned streaming event model', () => {
  const parsed = AiTaskEventSchema.parse({
    type: 'chunk',
    taskId: '33333333-3333-4333-8333-333333333333',
    chunk: 'hello',
  });

  assert.deepEqual(parsed, {
    type: 'chunk',
    taskId: '33333333-3333-4333-8333-333333333333',
    chunk: 'hello',
  });
});

test('AI cancel response schema supports cancelling and cancelled outcomes', () => {
  const cancelling = AiCancelResponseSchema.parse({
    taskId: '33333333-3333-4333-8333-333333333333',
    status: 'cancelling',
  });
  const cancelled = AiCancelResponseSchema.parse({
    taskId: '33333333-3333-4333-8333-333333333333',
    status: 'cancelled',
  });

  assert.equal(cancelling.status, 'cancelling');
  assert.equal(cancelled.status, 'cancelled');
});

test('AI task metadata schema binds a task to its document and owner', () => {
  const parsed = AiTaskMetadataSchema.parse({
    taskId: '33333333-3333-4333-8333-333333333333',
    documentId: '22222222-2222-4222-8222-222222222222',
    userId: '11111111-1111-1111-1111-111111111111',
    taskType: 'rewrite',
  });

  assert.equal(parsed.taskType, 'rewrite');
  assert.equal(parsed.documentId, '22222222-2222-4222-8222-222222222222');
});

test('AI proposal review schema accepts review payloads', () => {
  const parsed = AiProposalReviewSchema.parse({
    action: 'partial',
    appliedText: 'Accepted part only',
    currentSelection: 'Current selected text',
    currentStateVector: 'state-vector',
  });

  assert.equal(parsed.action, 'partial');
  assert.equal(parsed.appliedText, 'Accepted part only');
});

test('AI interaction history item schema captures persisted proposal details', () => {
  const parsed = AiInteractionHistoryItemSchema.parse({
    id: '33333333-3333-4333-8333-333333333333',
    documentId: '22222222-2222-4222-8222-222222222222',
    userId: '11111111-1111-1111-1111-111111111111',
    taskType: 'rewrite',
    inputTokens: 10,
    outputTokens: 20,
    modelUsed: 'mock',
    costCents: 1,
    status: 'pending',
    sourceTextHash: 'hash',
    sourceText: 'Original',
    proposalText: 'Proposal',
    sourceStateVector: 'state-vector',
    appliedText: null,
    staleAtReview: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(parsed.proposalText, 'Proposal');
  assert.equal(parsed.staleAtReview, false);
});
