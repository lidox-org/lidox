# Short Q&A notes (architecture)

Use these to answer common evaluator questions without contradicting the code.

## Why NestJS instead of FastAPI?

Assignment 2 mentions FastAPI; this PoC uses **NestJS** for historical/team reasons. It is an **explicit deviation** (`DEVIATIONS.md`). Documenting it avoids a silent mismatch; it may not remove a strict technology rubric requirement.

## How does authentication work?

- **Access:** JWT in **memory**, sent as **Bearer** on REST.
- **Refresh:** **HttpOnly cookie** to obtain new access tokens.
- **WebSocket:** Access JWT passed on the Hocuspocus connection—not the refresh cookie.

## Is AI “streaming”?

Yes at the **HTTP** layer: the browser consumes **Server-Sent Events** from `.../ai/tasks/:taskId/stream` after `invoke`. Groq runs **server-side**; the client does not open a raw WebSocket to the LLM.

## Is offline mode implemented?

**No.** Future work only. Do not claim offline buffering or sync-on-reconnect.

## Does version restore fully work?

**Not end-to-end.** The API returns success; applying snapshot data back into the live Yjs session is **incomplete** (`DEVIATIONS.md`). Say “partial / in progress” unless the team lands a fix.

## What should we trust: LaTeX spec or the repo?

- **`docs/lidox_spec.tex`:** Assignment 1 design reference.
- **`DEVIATIONS.md` + this repo:** Truth for **what runs** today.

## Branching and CI?

Pull requests targeting **`main`** run lint, typecheck, tests, and build (`.github/workflows/ci.yaml`). See `docs/git-workflow.md`.
