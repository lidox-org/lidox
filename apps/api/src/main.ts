import 'reflect-metadata';
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';

// Load .env from monorepo root (two levels up from apps/api)
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';
import { runMigrations } from './db/migrate';
import { startAiWorker } from './ai/ai.processor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Run database migrations
  logger.log('Running database migrations...');
  await runMigrations();

  // Create NestJS application
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api');

  // Middleware
  app.use(cookieParser());
  app.use(helmet());

  // CORS
  app.enableCors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  // Start BullMQ AI worker
  const aiWorker = startAiWorker();

  // Graceful shutdown
  const shutdown = async () => {
    logger.log('Shutting down...');
    await aiWorker.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  await app.listen(env.PORT);
  logger.log(`API server running on http://localhost:${env.PORT}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application', err);
  process.exit(1);
});
