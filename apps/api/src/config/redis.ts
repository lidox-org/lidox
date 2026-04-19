import Redis from 'ioredis';
import { env } from './env';

const isTestEnvironment =
  env.NODE_ENV === 'test' || process.argv.includes('--test');

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (attempts) => {
    if (isTestEnvironment) {
      return null;
    }

    return Math.min(attempts * 50, 2_000);
  },
});

redis.on('error', (error) => {
  if (!isTestEnvironment) {
    console.error('[redis] connection error', error);
  }
});
