import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { AiController } from '../../src/ai/ai.controller';
import { createAuthenticatedRequest } from '../helpers/http';
import { createAsyncSpy } from '../helpers/spy';

const VALID_DOC_ID = '22222222-2222-4222-8222-222222222222';
const VALID_TASK_ID = '33333333-3333-4333-8333-333333333333';

test('AiController.invoke rejects an invalid document id', async () => {
  const invokeSpy = createAsyncSpy(async () => ({
    taskId: VALID_TASK_ID,
    status: 'queued' as const,
  }));
  const controller = new AiController({
    invoke: invokeSpy.fn,
    getTaskStatus: async () => {
      throw new Error('not used');
    },
  } as never);

  await assert.rejects(
    controller.invoke(
      'not-a-uuid',
      { task: 'rewrite', selection: 'Hello world' },
      createAuthenticatedRequest(),
    ),
    (error: unknown) => error instanceof BadRequestException,
  );

  assert.equal(invokeSpy.calls.length, 0);
});

test('AiController.invoke rejects an invalid AI payload', async () => {
  const invokeSpy = createAsyncSpy(async () => ({
    taskId: VALID_TASK_ID,
    status: 'queued' as const,
  }));
  const controller = new AiController({
    invoke: invokeSpy.fn,
    getTaskStatus: async () => {
      throw new Error('not used');
    },
  } as never);

  await assert.rejects(
    controller.invoke(
      VALID_DOC_ID,
      { task: 'rewrite', selection: '' },
      createAuthenticatedRequest(),
    ),
    (error: unknown) => error instanceof BadRequestException,
  );

  assert.equal(invokeSpy.calls.length, 0);
});

test('AiController.invoke parses the body and delegates to the service', async () => {
  const expectedResponse = {
    taskId: VALID_TASK_ID,
    status: 'queued' as const,
  };
  const invokeSpy = createAsyncSpy(async () => expectedResponse);
  const controller = new AiController({
    invoke: invokeSpy.fn,
    getTaskStatus: async () => {
      throw new Error('not used');
    },
  } as never);

  const response = await controller.invoke(
    VALID_DOC_ID,
    {
      task: 'translate',
      selection: 'Salom dunyo',
      language: 'English',
      nodeId: 'paragraph-1',
      stateVector: 'base64-state-vector',
    },
    createAuthenticatedRequest({
      user: {
        userId: '44444444-4444-4444-8444-444444444444',
      },
    }),
  );

  assert.deepEqual(response, expectedResponse);
  assert.deepEqual(invokeSpy.calls, [
    [
      VALID_DOC_ID,
      {
        task: 'translate',
        selection: 'Salom dunyo',
        language: 'English',
        nodeId: 'paragraph-1',
        stateVector: 'base64-state-vector',
      },
      '44444444-4444-4444-8444-444444444444',
    ],
  ]);
});

test('AiController.getTask rejects an invalid task id', async () => {
  const getTaskSpy = createAsyncSpy(async () => ({
    taskId: VALID_TASK_ID,
    status: 'completed' as const,
    result: 'done',
  }));
  const controller = new AiController({
    invoke: async () => {
      throw new Error('not used');
    },
    getTaskStatus: getTaskSpy.fn,
  } as never);

  await assert.rejects(
    controller.getTask(
      VALID_DOC_ID,
      'bad-task-id',
      createAuthenticatedRequest(),
    ),
    (error: unknown) => error instanceof BadRequestException,
  );

  assert.equal(getTaskSpy.calls.length, 0);
});

test('AiController.getTask delegates validated ids and user id to the service', async () => {
  const expectedResponse = {
    taskId: VALID_TASK_ID,
    status: 'completed' as const,
    result: 'stream complete',
  };
  const getTaskSpy = createAsyncSpy(async () => expectedResponse);
  const controller = new AiController({
    invoke: async () => {
      throw new Error('not used');
    },
    getTaskStatus: getTaskSpy.fn,
  } as never);

  const response = await controller.getTask(
    VALID_DOC_ID,
    VALID_TASK_ID,
    createAuthenticatedRequest({
      user: {
        userId: '55555555-5555-4555-8555-555555555555',
      },
    }),
  );

  assert.deepEqual(response, expectedResponse);
  assert.deepEqual(getTaskSpy.calls, [
    [
      VALID_DOC_ID,
      VALID_TASK_ID,
      '55555555-5555-4555-8555-555555555555',
    ],
  ]);
});
