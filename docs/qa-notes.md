# Short Q&A notes (architecture)

Use these to answer common evaluator questions without contradicting the code.

## Is the backend FastAPI?

Yes. The runnable submission uses **FastAPI** in `apps/api-fastapi`. The older
NestJS code remains in the repo as legacy reference code, but `run.sh` and
`npm run dev` start FastAPI by default.

## How does authentication work?

- **Access:** JWT in an **HttpOnly cookie** (`access_token`).
- **Refresh:** **HttpOnly cookie** (`refresh_token`) for silent session rotation.
- **WebSocket:** the sync server authenticates from the access-token cookie sent during the upgrade request.

## Is AI “streaming”?

Yes at the **HTTP** layer: the browser consumes **Server-Sent Events** from `.../ai/tasks/:taskId/stream` after `invoke`. Groq runs **server-side**; the client does not open a raw WebSocket to the LLM.

## Is offline mode implemented?

Yes for the browser demo path. The editor persists its Yjs document to
IndexedDB, and Hocuspocus/Yjs merge local changes back in on reconnect.

## Does version restore fully work?

Yes. Restoring a version republishes the selected snapshot through the sync
server, and connected editors receive the restored content.

## What should we trust: LaTeX spec or the repo?

- **`docs/lidox_spec.tex`:** Assignment 1 design reference.
- **`DEVIATIONS.md` + this repo:** Truth for **what runs** today.

## Branching and CI?

Pull requests targeting **`main`** run lint, typecheck, tests, and build (`.github/workflows/ci.yaml`). See `docs/git-workflow.md`.
