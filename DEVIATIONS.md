# Deviations from Assignment 1 / Assignment 2 Expectations

This document records where the running codebase and course deliverables differ from the written spec (`docs/lidox_spec.tex`), the Assignment 2 brief, or earlier reports. **Documentation of a deviation does not satisfy a baseline requirement** where the rubric expects a working feature—it only avoids silent mismatch penalties and makes grading risk explicit.

## Summary table

| Topic | Spec / brief expectation | Current implementation | Status |
|--------|-------------------------|-------------------------|--------|
| Backend framework | Assignment 2 references **FastAPI** (Python) | **NestJS** (TypeScript) in `apps/api` | Documented deviation; technology requirement may still be a **rubric risk** |
| Auth delivery | Cookie-based auth described in report | **HttpOnly cookies** for both access and refresh tokens | **Resolved** in `fix/pr1-repo-contracts-ci-workflow` |
| AI delivery to client | Streaming with cancelation | **Server-Sent Events** (`GET .../ai/tasks/:taskId/stream`) after `invoke`; **BullMQ** for Groq execution server-side | **Resolved** — transport aligned |
| Offline editing | IndexedDB buffer, sync on reconnect | **Not implemented** (listed under "Future Direction") | **Open** — out of scope for current sprint |
| Identity | Optional OAuth / SSO in diagrams | **Email + password only**; OAuth env stubs only | **Not integrated** |
| Version restore | Restoring applies prior document state | API returns success but does **not** apply snapshot to live Yjs state | **Partially open** — backend broadcast in progress |
| `document_versions` storage | Single schema for API + sync | **Schema drift**: API/Drizzle (`snapshot`, `crdt_clock`) vs sync-server raw SQL (`data`) | **Technical debt** — tracked separately |
| Export | DOCX and PDF export | No export endpoints or UI | **Future work** |
| SSO | Google/GitHub OAuth | Env placeholders only | **Future work** |

## Backend technology (FastAPI vs NestJS)

- **Brief:** Assignment 2 names **FastAPI** for the API layer.
- **Code:** The REST API is **NestJS 10** with Drizzle ORM and PostgreSQL (`apps/api`).
- **Rationale:** The team chose NestJS in Assignment 1 design (before the specific FastAPI constraint was stated in A2) because it provides a better-typed integration with the TypeScript monorepo. Migrating to Python FastAPI at this stage would break the shared `packages/types` contracts and add significant integration risk without adding value to the graded features.
- **Impact:** All required behaviors (JWT auth, RBAC, streaming SSE, WebSocket integration, CRUD) are implemented and demonstrable. Technology stack differs but architecture patterns are equivalent.

## Authentication and tokens

**Current behavior (post `fix/pr1-repo-contracts-ci-workflow`):**

1. **Access JWT** (15-min TTL): set as **`HttpOnly` cookie** (`access_token`, path `/`). No JS access to token.
2. **Refresh token** (7-day TTL): set as **`HttpOnly` cookie** (`refresh_token`, path `/api/auth/refresh`). Rotation with reuse detection.
3. **Hocuspocus**: sync server reads the access cookie from the WebSocket upgrade request headers and verifies JWT + Redis denied-JTI set.
4. **RBAC**: viewer/commenter sessions are forced read-only at the WebSocket layer.

This matches the Assignment 1 report's described behavior. Previous mismatch (Bearer token in JS memory) was resolved.

## AI pipeline (invoke → worker → SSE)

1. Client **`POST /api/documents/:docId/ai/invoke`** → creates a BullMQ task, returns `taskId`.
2. BullMQ worker calls Groq API (or mock if no key) and publishes events to Redis.
3. Client opens **`GET /api/documents/:docId/ai/tasks/:taskId/stream`** (`text/event-stream`) — receives `queued`, `started`, `chunk`, `complete`/`failed` events.
4. **Cancel:** `POST .../ai/tasks/:taskId/cancel`.
5. **Review:** `POST .../ai/tasks/:taskId/review` (accept / reject / partial).
6. **History:** `GET /api/documents/:docId/ai/history`.

This satisfies the A2 streaming requirement (Part 3.2).

## Version history and restore

- **Listing versions:** `GET /api/documents/:id/versions` — returns snapshot rows from `document_versions`.
- **Restore:** `POST .../versions/:versionId/restore` — performs permission checks but does **not yet** apply the snapshot to live Hocuspocus state. The UI disables the restore button with an honest explanation.
- **Planned:** Restore will write the snapshot to Redis and signal Hocuspocus to reload, broadcasting the state change to all connected clients.

This is an **incomplete feature** — listed honestly in `apps/web/UX_DEVIATIONS.md`.

## Offline editing

- No IndexedDB offline buffer is implemented on the current branch.
- Hocuspocus provider handles reconnection natively for transient disconnects.
- Durable offline editing (edits persisted while fully offline, synced on reconnect) is a future sprint item.
- The UI now shows a disconnected state warning instead of silently appearing normal.

## Schema drift (sync-server vs API)

- **API schema** (`apps/api/src/db/schema.ts`): `document_versions` uses `snapshot` (text/base64), `crdt_clock` (int), `created_by` (uuid).
- **Sync-server** (`apps/sync-server/src/extensions/database.ts`): queries use `data` column with `ON CONFLICT (document_id)` upsert — treats this as a single-row-per-document store.
- These paths operate independently. The sync server can persist snapshots without the API's version history being aware. A schema migration to unify them is tracked but not yet merged.

## Tests and CI

- CI runs: lint, typecheck, build, and `apps/api/test/**/*.test.ts` (Node native test runner).
- Frontend tests: vitest + React Testing Library in `apps/web` (added in `UX/UI` PR).
- Playwright E2E: smoke test for login added; broader coverage is future work.

---

*Maintained by Architecture / docs owner. Update this file whenever behavior or the rubric-relevant story changes.*
