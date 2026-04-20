import { Extension } from '@hocuspocus/server';
import type {
  connectedPayload,
  onDisconnectPayload,
} from '@hocuspocus/server';
import Redis from 'ioredis';
import { config } from '../config';

const PERMISSION_EVENT_CHANNEL = 'permissions:changed';
const ROLE_PRIORITY: Record<string, number> = {
  owner: 4,
  editor: 3,
  commenter: 2,
  viewer: 1,
};

interface PermissionChangeEvent {
  documentId: string;
  userId: string;
  newRole: string | null;
}

interface LiveConnection {
  connection: connectedPayload['connection'];
  documentName: string;
  role: string;
  socketId: string;
  userId: string;
}

export function shouldDisconnectForPermissionChange(
  currentRole: string,
  newRole: string | null,
): boolean {
  if (!newRole) {
    return true;
  }

  return (ROLE_PRIORITY[newRole] ?? 0) < (ROLE_PRIORITY[currentRole] ?? 0);
}

function buildPermissionChangePayload(newRole: string | null): string {
  return JSON.stringify({
    type: 'permission-change',
    newRole,
    revoked: newRole === null,
    message:
      newRole === null
        ? 'Your access to this document was revoked.'
        : `Your access changed to ${newRole}.`,
  });
}

export class PermissionDisconnectExtension implements Extension {
  private sub: Redis | null = null;
  private ready = false;
  private connections = new Map<string, LiveConnection>();

  constructor() {
    this.initRedis();
  }

  async connected(data: connectedPayload): Promise<void> {
    const ctx = data.context as { userId?: string; userRole?: string } | undefined;
    if (!ctx?.userId || !ctx.userRole) {
      return;
    }

    this.connections.set(data.socketId, {
      connection: data.connection,
      documentName: data.documentName,
      role: ctx.userRole,
      socketId: data.socketId,
      userId: ctx.userId,
    });
  }

  async onDisconnect(data: onDisconnectPayload): Promise<void> {
    this.connections.delete(data.socketId);
  }

  private initRedis(): void {
    const redisOpts = {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    };

    try {
      this.sub = new Redis(config.REDIS_URL, redisOpts);

      this.sub.on('ready', () => {
        this.ready = true;
        console.log('[permissions] Redis subscriber connected');
        void this.sub!.subscribe(PERMISSION_EVENT_CHANNEL);
      });

      this.sub.on('error', (err) => {
        this.ready = false;
        console.warn('[permissions] Redis error:', err.message);
      });

      this.sub.on('message', (_channel: string, message: string) => {
        void this.handlePermissionMessage(message);
      });

      void this.sub.connect();
    } catch (err) {
      console.warn('[permissions] Could not initialise Redis:', (err as Error).message);
    }
  }

  private async handlePermissionMessage(raw: string): Promise<void> {
    if (!this.ready) {
      return;
    }

    try {
      const event = JSON.parse(raw) as PermissionChangeEvent;
      if (!event.documentId || !event.userId) {
        return;
      }

      const targets = [...this.connections.values()].filter(
        (connection) =>
          connection.documentName === event.documentId &&
          connection.userId === event.userId &&
          shouldDisconnectForPermissionChange(connection.role, event.newRole),
      );

      for (const target of targets) {
        target.connection.sendStateless(buildPermissionChangePayload(event.newRole));
        target.connection.close({
          code: 4403,
          reason:
            event.newRole === null
              ? 'Document access revoked'
              : `Document access changed to ${event.newRole}`,
        });
        this.connections.delete(target.socketId);
      }
    } catch (err) {
      console.warn('[permissions] Failed to handle permission message:', (err as Error).message);
    }
  }

  async onDestroy(): Promise<void> {
    this.connections.clear();

    if (this.sub) {
      await this.sub.quit().catch(() => {});
      this.sub = null;
    }
  }
}
