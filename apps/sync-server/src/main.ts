import { Server } from '@hocuspocus/server';
import { config } from './config';
import { AuthExtension } from './extensions/auth';
import { DatabaseExtension } from './extensions/database';
import { RedisPresenceExtension } from './extensions/redis';
import { LoggerExtension } from './extensions/logger';

async function bootstrap(): Promise<void> {
  console.log(`[sync-server] starting on port ${config.SYNC_PORT}...`);

  const server = new Server({
    port: config.SYNC_PORT,
    quiet: true,

    // Extensions are evaluated in order.
    // Logger first so every event is captured,
    // auth before any document work,
    // then persistence + presence.
    extensions: [
      new LoggerExtension(),
      new AuthExtension(),
      new DatabaseExtension(),
      new RedisPresenceExtension(),
    ],
  });

  await server.listen();

  console.log(`[sync-server] listening on ws://0.0.0.0:${config.SYNC_PORT}`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[sync-server] received ${signal}, shutting down...`);
    await server.destroy();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[sync-server] fatal error during startup:', err);
  process.exit(1);
});
