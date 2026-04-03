import { useState, useEffect, useCallback } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';

interface PresenceUser {
  clientId: number;
  name: string;
  color: string;
  avatarUrl?: string | null;
}

interface Props {
  provider: HocuspocusProvider | null;
  currentUserId: string | undefined;
}

const CURSOR_COLORS = [
  '#EF4444', // red
  '#F59E0B', // amber
  '#10B981', // emerald
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
];

function getColor(clientId: number): string {
  return CURSOR_COLORS[clientId % CURSOR_COLORS.length];
}

export function PresenceCursors({ provider, currentUserId }: Props) {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  const updateUsers = useCallback(() => {
    if (!provider?.awareness) return;

    const states = provider.awareness.getStates();
    const connectedUsers: PresenceUser[] = [];

    states.forEach((state, clientId) => {
      if (!state.user) return;
      if (state.user.id === currentUserId) return;

      connectedUsers.push({
        clientId,
        name: state.user.name || 'Anonymous',
        color: state.user.color || getColor(clientId),
        avatarUrl: state.user.avatarUrl,
      });
    });

    setUsers(connectedUsers);
  }, [provider, currentUserId]);

  useEffect(() => {
    if (!provider?.awareness) return;

    provider.awareness.on('change', updateUsers);
    updateUsers();

    return () => {
      provider.awareness?.off('change', updateUsers);
    };
  }, [provider, updateUsers]);

  if (users.length === 0) return null;

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {users.slice(0, 5).map((user) => (
          <div
            key={user.clientId}
            className="relative"
            title={user.name}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-7 w-7 rounded-full border-2 border-white object-cover shadow-sm"
                style={{ borderColor: user.color }}
              />
            ) : (
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white shadow-sm"
                style={{ backgroundColor: user.color }}
              >
                {user.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
            )}
            <span
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white"
              style={{ backgroundColor: '#10B981' }}
            />
          </div>
        ))}
      </div>

      {users.length > 5 && (
        <div className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-surface text-[10px] font-medium text-muted">
          +{users.length - 5}
        </div>
      )}

      <span className="ml-2 text-xs text-muted">
        {users.length} online
      </span>
    </div>
  );
}
