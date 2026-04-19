# Collaboration transport and message flow

## Components

| Piece | Role |
|--------|------|
| **React + TipTap** | Editor UI; binds Yjs doc to ProseMirror |
| **Yjs** | CRDT state for the document |
| **HocuspocusProvider** (`apps/web/src/lib/websocket.ts`) | WebSocket client to sync server |
| **Sync server** (`apps/sync-server`) | `@hocuspocus/server` relays updates and awareness |
| **PostgreSQL** (sync extension) | Debounced persistence of Yjs snapshots (see `DEVIATIONS.md` for schema notes) |

## Connection flow

1. User opens a document in the SPA with a valid access JWT in memory.
2. `getOrCreateProvider(documentId)` creates a `Y.Doc` and connects to `ws://<host>:3002` (or `wss` in production) with `name` = document UUID and `token` = access JWT.
3. **Authentication** — `AuthExtension` validates JWT and attaches `userId` / `email` to connection context.
4. **Sync** — Yjs updates propagate between clients through the server; **awareness** drives presence/cursors (`PresenceCursors`, etc.).

## What this is not

- **Not** REST/SSE: editing traffic is **not** the same channel as `/api` or AI streaming.
- **Not** offline-first: there is no IndexedDB-backed queue for edits when disconnected (see `DEVIATIONS.md`).
