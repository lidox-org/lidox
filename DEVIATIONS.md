# Deviations from Assignment 1 / Assignment 2 Expectations

This document records where the running codebase and course deliverables differ
from the written spec (`docs/lidox_spec.tex`), the Assignment 2 brief, or
earlier reports. It is intentionally about the **current runnable submission**,
not the older intermediate branches.

## Summary table

| Topic | Spec / brief expectation | Current implementation | Status |
|--------|-------------------------|-------------------------|--------|
| Backend framework | Assignment 2 references **FastAPI** (Python) | **FastAPI** in `apps/api-fastapi`; legacy NestJS code remains in `apps/api` as non-default reference code | **Resolved for the runnable submission** |
| Auth delivery | Cookie-based auth described in report | **HttpOnly cookies** for both access and refresh tokens | **Resolved** |
| AI delivery to client | Streaming with cancelation | **Server-Sent Events** (`GET .../ai/tasks/:taskId/stream`) after `invoke`; FastAPI async tasks + Redis event stream | **Resolved** |
| Offline editing | IndexedDB buffer, sync on reconnect | Browser-local **Yjs + IndexedDB** persistence via `y-indexeddb`, then CRDT sync on reconnect | **Resolved** |
| Identity | Optional OAuth / SSO in diagrams | **Email/password plus Google OAuth** when `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are configured; GitHub OAuth remains a placeholder | **Partially resolved** |
| Version restore | Restoring applies prior document state | Snapshot restore rewinds the active editor immediately and rebroadcasts to connected clients | **Resolved** |
| `document_versions` storage | Single schema for API + sync | FastAPI and sync-server both use `snapshot` + `crdt_clock` rows in `document_versions` | **Resolved** |
| AI worker topology | Assignment 1 design referenced a separate queue worker | The FastAPI app runs async AI tasks in-process and streams events from Redis | **Intentional simplification** |
| Live permission revocation | Permission changes should cut off stale write sessions promptly | Permission changes are published through Redis and the sync server forcibly closes stale downgraded/revoked sessions, sending the user back to the dashboard | **Resolved** |
| Export | DOCX and PDF export | **PDF export** is available from the editor header; **DOCX** export is still not implemented | **Partially resolved** |

## Backend technology

- **Brief:** Assignment 2 names **FastAPI** for the API layer.
- **Code:** The default runnable backend is **FastAPI** in `apps/api-fastapi`.
- **Legacy code:** `apps/api` still contains the older NestJS implementation, but `run.sh`, `npm run dev`, and the README demo path now start the FastAPI backend by default.
- **Impact:** The runnable submission aligns with the brief while preserving the older code as reference material during the handoff window.

## Authentication and tokens

Current behavior:

1. **Access JWT** (15-min TTL): set as **`HttpOnly` cookie** (`access_token`, path `/`).
2. **Refresh token** (7-day TTL): set as **`HttpOnly` cookie** (`refresh_token`, path `/api/auth/refresh`).
3. **WebSocket auth:** the sync server reads the access cookie from the upgrade request and verifies JWT + Redis denied-JTI set membership.
4. **RBAC:** viewer/commenter sessions are forced read-only at the WebSocket layer for new or refreshed connections.
5. **Google OAuth:** `/api/auth/google/start` and `/api/auth/google/callback` perform the Google sign-in flow and issue the same HttpOnly session cookies as local auth.

This matches the cookie-first browser auth model expected by the report and avoids exposing auth tokens to frontend JavaScript.

## AI pipeline (invoke → async task → SSE)

1. Client **`POST /api/documents/:docId/ai/invoke`** returns `taskId`.
2. FastAPI spawns an async task, calls Groq API (or mock fallback), and publishes task events into Redis.
3. Client opens **`GET /api/documents/:docId/ai/tasks/:taskId/stream`** (`text/event-stream`) and receives `queued`, `started`, `chunk`, `complete` / `failed` / `cancelled` events.
4. **Cancel:** `POST .../ai/tasks/:taskId/cancel`.
5. **Review:** `POST .../ai/tasks/:taskId/review` (accept / reject / partial).
6. **History:** `GET /api/documents/:docId/ai/history`.

This satisfies the Assignment 2 streaming requirement without the older BullMQ worker topology from the original design.

## Version history and restore

- **Listing versions:** `GET /api/documents/:id/versions` returns snapshot rows from `document_versions`.
- **Restore:** `POST .../versions/:versionId/restore` writes a new restore row, publishes the restore event, and returns the snapshot so the active editor also rewinds immediately in the browser.
- **Live sessions:** connected editors receive the restored content through normal Hocuspocus/Yjs updates.

## Offline editing

- The web client persists the Yjs document locally via `y-indexeddb`.
- Hocuspocus reconnects automatically; local Yjs updates merge through CRDT sync when the socket returns.
- The current UI shows a disconnected state banner, while local edits remain available in the browser cache during transient offline periods.

## Remaining gaps

- **Additional OAuth providers:** GitHub OAuth / generic SSO are still placeholders.
- **Document export parity:** PDF export is implemented, but DOCX export is still missing.

## Tests and CI

- CI runs: lint, typecheck, build, and `apps/api/test/**/*.test.ts` (Node native test runner).
- Frontend tests: Vitest + React Testing Library in `apps/web`.
- Sync-server restore logic: Node test in `apps/sync-server/src/extensions/restore.test.ts`.
- FastAPI coverage: pytest suite in `apps/api-fastapi/tests`.
- Playwright E2E: smoke test for login added; broader coverage is future work.
