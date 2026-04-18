import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../config/redis';
import { DocumentsService } from '../documents/documents.service';
import {
  ROLE_HIERARCHY,
  AI_WRITE_TASKS,
  AI_READ_TASKS,
} from '@lidox/types';
import type {
  AiCancelResponse,
  AiInvokeInput,
  AiTaskResult,
} from '@lidox/types';
import type { AiJobData } from './ai.processor';
import { createAiTaskEventStream, publishAiTaskEvent } from './ai-event-bus';
import {
  clearAiTaskCancellationRequest,
  getAiTaskMetadata,
  getAiTaskStatus,
  requestAiTaskCancellation,
  storeAiTaskMetadata,
  storeAiTaskStatus,
} from './task-store';
import {
  createCancelledTaskResult,
  createQueuedTaskResult,
} from './task-status';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly queue: Queue<AiJobData>;

  constructor(private readonly documentsService: DocumentsService) {
    this.queue = new Queue<AiJobData>('ai-tasks', {
      connection: redis,
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Invoke an AI task                                                */
  /* ---------------------------------------------------------------- */
  async invoke(docId: string, input: AiInvokeInput, userId: string) {
    // Check document exists and AI is enabled
    const doc = await this.documentsService.findDocument(docId);

    if (!doc.aiEnabled) {
      throw new ForbiddenException('AI features are disabled for this document');
    }

    // Check user permission
    const role = await this.documentsService.getUserRole(docId, userId);

    if (!role) {
      throw new ForbiddenException('No access to this document');
    }

    // Write tasks require editor+, read tasks require commenter+
    const isWriteTask = (AI_WRITE_TASKS as readonly string[]).includes(input.task);
    const isReadTask = (AI_READ_TASKS as readonly string[]).includes(input.task);

    if (isWriteTask && ROLE_HIERARCHY[role] < ROLE_HIERARCHY['editor']) {
      throw new ForbiddenException('Editor access required for write AI tasks');
    }

    if (isReadTask && ROLE_HIERARCHY[role] < ROLE_HIERARCHY['commenter']) {
      throw new ForbiddenException('Commenter access required for read AI tasks');
    }

    // Create task
    const taskId = uuidv4();
    const queuedTask = createQueuedTaskResult(taskId);

    // Store initial status in Redis
    await storeAiTaskStatus(queuedTask);
    await storeAiTaskMetadata({
      taskId,
      documentId: docId,
      userId,
      taskType: input.task,
    });
    await publishAiTaskEvent({
      type: 'queued',
      taskId,
    });

    // Dispatch BullMQ job
    await this.queue.add(
      'process',
      {
        taskId,
        documentId: docId,
        userId,
        taskType: input.task,
        selection: input.selection,
        language: input.language,
      },
      {
        jobId: taskId,
      },
    );

    this.logger.log(`AI task ${taskId} queued (${input.task})`);

    return { taskId, status: 'queued' as const };
  }

  streamTask(docId: string, taskId: string, userId: string) {
    return this.withAuthorizedTask(docId, taskId, userId, async () =>
      createAiTaskEventStream(taskId),
    );
  }

  async cancelTask(
    docId: string,
    taskId: string,
    userId: string,
  ): Promise<AiCancelResponse> {
    return this.withAuthorizedTask(docId, taskId, userId, async () => {
      const task = await getAiTaskStatus(taskId);
      if (!task) {
        throw new NotFoundException('Task not found or expired');
      }

      if (
        task.status === 'completed' ||
        task.status === 'failed' ||
        task.status === 'expired'
      ) {
        throw new ConflictException(
          `Cannot cancel a task in ${task.status} state`,
        );
      }

      if (task.status === 'cancelled') {
        return {
          taskId,
          status: 'cancelled',
        };
      }

      await requestAiTaskCancellation(taskId);

      const job = await this.queue.getJob(taskId);
      const state = job ? await job.getState() : null;

      if (job && (state === 'waiting' || state === 'delayed')) {
        await job.remove();
        await clearAiTaskCancellationRequest(taskId);

        const cancelledTask = createCancelledTaskResult(
          taskId,
          'Cancelled before generation started',
        );
        await storeAiTaskStatus(cancelledTask);
        await publishAiTaskEvent({
          type: 'cancelled',
          taskId,
          reason: 'Cancelled before generation started',
        });

        return {
          taskId,
          status: 'cancelled',
        };
      }

      return {
        taskId,
        status: 'cancelling',
      };
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Get task status                                                  */
  /* ---------------------------------------------------------------- */
  async getTaskStatus(docId: string, taskId: string, userId: string): Promise<AiTaskResult> {
    return this.withAuthorizedTask(docId, taskId, userId, async () => {
      const cached = await getAiTaskStatus(taskId);
      if (!cached) {
        throw new NotFoundException('Task not found or expired');
      }

      return cached;
    });
  }

  private async withAuthorizedTask<T>(
    docId: string,
    taskId: string,
    userId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    // Verify user has access to the document
    const role = await this.documentsService.getUserRole(docId, userId);
    if (!role) {
      throw new ForbiddenException('No access to this document');
    }

    const metadata = await getAiTaskMetadata(taskId);
    if (!metadata || metadata.documentId !== docId) {
      throw new NotFoundException('Task not found or expired');
    }

    return action();
  }
}
