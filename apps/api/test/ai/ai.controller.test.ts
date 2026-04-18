import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { Observable } from 'rxjs';
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
    streamTask: async () => {
      throw new Error('not used');
    },
    cancelTask: async () => {
      throw new Error('not used');
    },
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
    streamTask: async () => {
      throw new Error('not used');
    },
    cancelTask: async () => {
      throw new Error('not used');
    },
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
    streamTask: async () => {
      throw new Error('not used');
    },
    cancelTask: async () => {
      throw new Error('not used');
    },
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
    streamTask: async () => {
      throw new Error('not used');
    },
    cancelTask: async () => {
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
    streamTask: async () => {
      throw new Error('not used');
    },
    cancelTask: async () => {
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

test('AiController.streamTask rejects an invalid task id', async () => {
  const streamSpy = createAsyncSpy(async () => new Observable());
  const controller = new AiController({
    invoke: async () => {
      throw new Error('not used');
    },
    streamTask: streamSpy.fn,
    cancelTask: async () => {
      throw new Error('not used');
    },
    getTaskStatus: async () => {
      throw new Error('not used');
    },
  } as never);

  await assert.rejects(
    controller.streamTask(
      VALID_DOC_ID,
      'not-a-uuid',
      createAuthenticatedRequest(),
    ),
    (error: unknown) => error instanceof BadRequestException,
  );

  assert.equal(streamSpy.calls.length, 0);
});

test('AiController.streamTask delegates validated ids and user id to the service', async () => {
  const expectedStream = new Observable();
  const streamSpy = createAsyncSpy(async () => expectedStream);
  const controller = new AiController({
    invoke: async () => {
      throw new Error('not used');
    },
    streamTask: streamSpy.fn,
    cancelTask: async () => {
      throw new Error('not used');
    },
    getTaskStatus: async () => {
      throw new Error('not used');
    },
  } as never);

  const response = await controller.streamTask(
    VALID_DOC_ID,
    VALID_TASK_ID,
    createAuthenticatedRequest({
      user: {
        userId: '66666666-6666-4666-8666-666666666666',
      },
    }),
  );

  assert.equal(response, expectedStream);
  assert.deepEqual(streamSpy.calls, [
    [
      VALID_DOC_ID,
      VALID_TASK_ID,
      '66666666-6666-4666-8666-666666666666',
    ],
  ]);
});

test('AiController.cancelTask delegates validated ids and user id to the service', async () => {
  const expectedResponse = {
    taskId: VALID_TASK_ID,
    status: 'cancelling' as const,
  };
  const cancelSpy = createAsyncSpy(async () => expectedResponse);
  const controller = new AiController({
    invoke: async () => {
      throw new Error('not used');
    },
    streamTask: async () => {
      throw new Error('not used');
    },
    cancelTask: cancelSpy.fn,
    getTaskStatus: async () => {
      throw new Error('not used');
    },
  } as never);

  const response = await controller.cancelTask(
    VALID_DOC_ID,
    VALID_TASK_ID,
    createAuthenticatedRequest({
      user: {
        userId: '77777777-7777-4777-8777-777777777777',
      },
    }),
  );

  assert.deepEqual(response, expectedResponse);
  assert.deepEqual(cancelSpy.calls, [
    [
      VALID_DOC_ID,
      VALID_TASK_ID,
      '77777777-7777-4777-8777-777777777777',
    ],
  ]);
});
