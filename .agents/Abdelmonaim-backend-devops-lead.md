# Abdelmonaim

## Role
Backend & DevOps Lead

## Objective
Make the backend compliant, secure, testable, and easy to run from a fresh clone.

## Owned scope
- `apps/api/` except AI-specific internals owned by Abror
- `packages/types/`
- infra / startup / CI

## Primary tasks
- Decide and execute the backend strategy:
  - migrate API to `FastAPI`, or
  - keep `NestJS` and document the deviation clearly
- Ensure all protected endpoints require auth.
- Enforce permissions server-side for:
  - document CRUD
  - sharing
  - version restore
  - AI invocation
- Fix version persistence and restore consistency.
- Audit schema mismatches between API and sync server.
- Add backend tests for:
  - auth
  - permissions
  - document CRUD
  - AI invocation with mocked provider
  - WebSocket auth/basic exchange
- Add one-command local startup.
- Ensure `.env.example` is complete.
- If using FastAPI, expose useful auto-generated API docs.
- Align CI with actual repo tooling.

## Deliverables
- backend changes
- backend tests
- startup script / Makefile
- CI updates
- API docs if FastAPI is used

## Constraints
- Permission checks must be real server-side checks.
- Fresh clone setup must be simple and reproducible.
- Do not leave schema drift between services unresolved.

## Verification
- Fresh clone starts with one command.
- Protected routes reject unauthorized access.
- Viewer cannot modify documents via direct API call.
- Version restore actually changes document state.
- Backend tests pass.

## Done when
- Core backend baseline is reliable.
- Infra/setup is reviewer-friendly.
- Backend behavior matches what README/docs claim.
