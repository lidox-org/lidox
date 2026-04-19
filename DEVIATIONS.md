# Deviations from Assignment 1 / Assignment 2 expectations

This document records where the running codebase and course deliverables differ from the written spec (`docs/lidox_spec.tex`), the Assignment 2 brief, or earlier reports. **Documentation of a deviation does not satisfy a baseline requirement** where the rubric expects a working feature—it only avoids silent mismatch penalties and makes grading risk explicit.

## Summary table

| Topic | Spec / brief expectation | Current implementation | Status |
|--------|-------------------------|-------------------------|--------|
| Backend framework | Assignment 2 references **FastAPI** (Python) | **NestJS** (TypeScript) in `apps/api` | Documented deviation; technology requirement may still be a **rubric risk** |
| AI delivery to client | Streaming with cancelation | **Server-Sent Events** (`GET .../ai/tasks/:taskId/stream`) after `invoke`; **BullMQ** still used for Groq execution server-side | Largely aligned for UX; transport differs from a raw WebSocket token stream |
| Offline editing | IndexedDB buffer, sync on reconnect | **Not implemented** (listed under README “Future Direction”) | **Out of scope** for PoC; must not be claimed as delivered |
| Identity | Optional OAuth / SSO in diagrams | **Email + password only**; OAuth env stubs only | **Not integrated** |
| Version restore | Restoring applies prior document state | API returns success **without applying** snapshot to live Yjs state; UI **does not** reload doc after restore | **Open grading risk**—feature incomplete |
| `document_versions` storage | Single schema for API + sync | **Schema drift**: API/Drizzle (`snapshot`, `crdt_clock`, `created_by`) vs sync-server raw SQL (`data`, `ON CONFLICT(document_id)`) | **Technical debt**—persistence paths may not match migrated tables |

## Backend technology (FastAPI vs NestJS)

- **Brief:** Assignment 2 names **FastAPI** for the API layer.
- **Code:** The REST API is **NestJS 10** with Drizzle ORM and PostgreSQL (`apps/api`).
- **Implication:** Treat as an explicit technology substitution. If the rubric is strict on FastAPI, migrating or seeking instructor clarification is the only way to close the gap; README and this file do not remove that risk.

## Authentication and tokens

**Implemented behavior (matches README in broad strokes):**

1. **Access JWT** (short-lived, ~15 minutes): returned in JSON on login/register; the SPA keeps it **in memory** (`apps/web/src/lib/api.ts`) and sends it as **`Authorization: Bearer <accessToken>`** for REST calls.
2. **Refresh token**: issued as an **HttpOnly** cookie (`refresh_token`, path `/api/auth/refresh`, `SameSite=Lax`). The client refreshes by `POST /api/auth/refresh` with `credentials: 'include'`. The body may also send `refreshToken` for non-browser clients (`auth.controller.ts`).
3. **Hocuspocus (collaboration)**: the WebSocket client passes the access JWT via the Hocuspocus **`token` provider field** (see `apps/web/src/lib/websocket.ts`). The sync server verifies the JWT and checks a Redis **denied JTIs** set when Redis is available (`apps/sync-server/src/extensions/auth.ts`).

**Evaluator-style mismatch to avoid:** Do not describe the app as “cookie-only” API auth—the **access** token is primarily a **Bearer** token in memory; **refresh** is cookie-based.

## AI pipeline (invoke → worker → SSE)

1. Client **`POST /api/documents/:docId/ai/invoke`** → creates a task, returns `taskId`.
2. Worker processes the job (Groq, mocks if no API key).
3. Client opens **`GET /api/documents/:docId/ai/tasks/:taskId/stream`** with `Accept: text/event-stream` and receives **SSE** chunks until completion or error.
4. **Cancel:** `POST .../ai/tasks/:taskId/cancel`.

Older copy that described **polling only** was inaccurate relative to the current frontend (`AiToolbar.tsx`).

## Version history and restore

- **Listing versions:** `GET /api/documents/:id/versions` uses Drizzle `document_versions` rows.
- **Restore:** `POST .../versions/:versionId/restore` performs permission checks and returns `{ message, versionId }` **without** loading snapshot content into the editor or notifying Hocuspocus to replace Yjs state (`documents.service.ts`).
- **UI:** `VersionHistory` does not pass `onRestore` in `Editor.tsx`, so the client does not refresh from server after a “successful” restore.

**Conclusion:** Full “restore previous version” behavior for the demo is **not** complete; document as **planned / incomplete**, not as a finished Assignment 1/2 feature.

## Collaboration transport

- **Real-time editing:** Yjs + Hocuspocus WebSocket on port **3002** (separate from REST). Not the same connection as REST or SSE.

## Diagrams vs code (`diagrams/`)

- **`context.mmd`**: Shows OAuth, email, and org admin flows **not** wired in this PoC.
- **`container.mmd`**: Previously suggested offline buffering, S3, OAuth, and broad Redis roles; the running app is narrower (see updated diagram).
- **`component-ai.mmd`**: Prior C4 text described subcomponents (YAML templates, per-org budget UI, etc.) **beyond** what is implemented in `apps/api/src/ai/*`.

Diagrams are updated to reduce overclaiming; the **LaTeX spec** remains the Assignment 1 design reference and can diverge from the PoC.

## Tests and CI

- **README** “Future Direction” still lists broad e2e coverage; the repo **does** ship API tests under `apps/api/test` and CI runs `npm test` on PRs to `main`. Coverage is **not** comprehensive relative to a production bar.

## Offline

- No IndexedDB offline buffer, no “working offline” banner in production paths. Any report or slide that implied offline sync should be corrected to **future work**.

---

*Maintained by Architecture / docs owner. Update this file whenever behavior or the rubric-relevant story changes.*
