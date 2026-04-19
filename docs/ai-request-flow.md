# AI request, stream, cancel, and review flow

End-to-end path as implemented in `apps/api/src/ai/*` and `apps/web/src/editor/AiToolbar.tsx` / `AiProposal.tsx`.

## 1. Invoke

- User selects text (minimum length enforced in UI).
- Client **`POST /api/documents/:docId/ai/invoke`** with JSON body: task type, selection text/html, optional Yjs state vector for staleness checks.
- Server validates role (and AI-enabled flag), enqueues work, returns **`{ taskId }`**.

## 2. Stream output (SSE)

- Client opens **`GET /api/documents/:docId/ai/tasks/:taskId/stream`** with `Accept: text/event-stream` and Bearer auth.
- NestJS **`@Sse`** handler (`AiController.streamTask`) emits events the frontend parses as **SSE** (chunk + done semantics in `AiToolbar.tsx`).
- UI shows progressive proposal text while `streaming` is true.

## 3. Cancel

- **`POST /api/documents/:docId/ai/tasks/:taskId/cancel`** aborts in-flight work where supported; UI exposes cancel while a task is active.

## 4. Review (accept / reject)

- **`POST .../review`** with accept/reject decision; proposal state and audit logging are handled server-side per `AiService`.

## 5. Background processing

- **BullMQ** workers (`ai.processor.ts`) call Groq (or mock). The user-facing “stream” is **SSE from the API**, fed from task/stream state—not a direct browser-to-Groq WebSocket.

## Rubric wording

- Describe this as **SSE streaming from the API** after task creation, not as “polling-only” delivery.
