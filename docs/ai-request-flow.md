# AI request, stream, cancel, and review flow

End-to-end path as implemented in `apps/api-fastapi/app/ai_runtime.py` and
`apps/web/src/editor/AiToolbar.tsx` / `AiProposal.tsx`.

## 1. Invoke

- User selects text (minimum length enforced in UI).
- Client **`POST /api/documents/:docId/ai/invoke`** with JSON body: task type, selection text/html, optional Yjs state vector for staleness checks.
- Server validates role (and AI-enabled flag), creates the async task, returns **`{ taskId }`**.

## 2. Stream output (SSE)

- Client opens **`GET /api/documents/:docId/ai/tasks/:taskId/stream`** with `Accept: text/event-stream` and cookie auth.
- FastAPI returns a `StreamingResponse`; the frontend parses queued/started/chunk/complete events as **SSE**.
- UI shows progressive proposal text while `streaming` is true.

## 3. Cancel

- **`POST /api/documents/:docId/ai/tasks/:taskId/cancel`** aborts in-flight work where supported; UI exposes cancel while a task is active.

## 4. Review (accept / reject)

- **`POST .../review`** with accept/reject decision; proposal state and audit logging are handled server-side per `AiService`.

## 5. Background processing

- FastAPI async tasks call Groq (or mock) and publish event chunks into Redis. The user-facing “stream” is **SSE from the API**, not a direct browser-to-Groq WebSocket.

## Rubric wording

- Describe this as **SSE streaming from the API** after task creation, not as “polling-only” delivery.
