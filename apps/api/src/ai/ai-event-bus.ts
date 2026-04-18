import type { MessageEvent } from '@nestjs/common';
import {
  AiTaskEventSchema,
  type AiTaskEvent,
  type AiTaskEventType,
} from '@lidox/types';
import Redis from 'ioredis';
import { Observable } from 'rxjs';
import { redis } from '../config/redis';

const EVENT_TTL_SECONDS = 3600;
const EVENT_BUFFER_LIMIT = 512;
const TERMINAL_EVENTS = new Set<AiTaskEventType>([
  'complete',
  'failed',
  'cancelled',
]);

function eventChannel(taskId: string): string {
  return `ai:events:${taskId}:channel`;
}

function eventBufferKey(taskId: string): string {
  return `ai:events:${taskId}:buffer`;
}

export function isTerminalAiTaskEvent(event: AiTaskEvent): boolean {
  return TERMINAL_EVENTS.has(event.type);
}

export async function publishAiTaskEvent(event: AiTaskEvent): Promise<void> {
  const payload = JSON.stringify(event);
  const bufferKey = eventBufferKey(event.taskId);

  await redis
    .multi()
    .rpush(bufferKey, payload)
    .ltrim(bufferKey, -EVENT_BUFFER_LIMIT, -1)
    .expire(bufferKey, EVENT_TTL_SECONDS)
    .publish(eventChannel(event.taskId), payload)
    .exec();
}

export async function readBufferedAiTaskEvents(
  taskId: string,
): Promise<AiTaskEvent[]> {
  const buffered = await redis.lrange(eventBufferKey(taskId), 0, -1);

  return buffered.map((payload) => AiTaskEventSchema.parse(JSON.parse(payload)));
}

export function createAiTaskEventStream(
  taskId: string,
): Observable<MessageEvent> {
  return new Observable<MessageEvent>((subscriber) => {
    const subscription = redis.duplicate();
    let cleanedUp = false;

    const emitEvent = (event: AiTaskEvent) => {
      subscriber.next({
        type: event.type,
        data: event,
      });

      if (isTerminalAiTaskEvent(event)) {
        subscriber.complete();
        void cleanup();
      }
    };

    const onMessage = (channel: string, payload: string) => {
      if (channel !== eventChannel(taskId)) {
        return;
      }

      emitEvent(AiTaskEventSchema.parse(JSON.parse(payload)));
    };

    const cleanup = async () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;

      subscription.off('message', onMessage);

      try {
        if (subscription.status !== 'end') {
          await subscription.quit();
        }
      } catch {
        subscription.disconnect();
      }
    };

    const start = async () => {
      const bufferedEvents = await readBufferedAiTaskEvents(taskId);
      for (const event of bufferedEvents) {
        emitEvent(event);
        if (isTerminalAiTaskEvent(event)) {
          return;
        }
      }

      subscription.on('message', onMessage);
      await ensureRedisConnection(subscription);
      await subscription.subscribe(eventChannel(taskId));
    };

    void start().catch(async (error) => {
      subscriber.error(error);
      await cleanup();
    });

    return () => {
      void cleanup();
    };
  });
}

async function ensureRedisConnection(client: Redis): Promise<void> {
  if (client.status === 'wait') {
    await client.connect();
  }
}
