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
- Treat `NestJS` as an explicit compliance risk until/unless the API is migrated to `FastAPI`.
- Resolve the evaluator-noted auth/communication mismatch:
  - either implement the documented cookie-based/session behavior
  - or align the docs to the actual bearer-token design with Brandon
- Ensure all protected endpoints require auth.
- Enforce permissions server-side for:
  - document CRUD
  - sharing
  - version restore
  - AI invocation
- Fix version persistence and restore consistency.
- Audit schema mismatches between API and sync server.
- Implement reconnect/offline-sync behavior if feasible.
- If offline buffering cannot be delivered, ensure docs clearly mark it as a deviation and leave it listed as an open baseline/rubric gap.
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
- Document branch/merge conventions that match actual practice.

## Deliverables
- backend changes
- backend tests
- startup script / Makefile
- CI updates
- API docs if FastAPI is used
- branch/merge convention documentation with Brandon if repo-level

## Constraints
- Permission checks must be real server-side checks.
- Fresh clone setup must be simple and reproducible.
- Do not leave schema drift between services unresolved.

## Verification
- Fresh clone starts with one command.
- Protected routes reject unauthorized access.
- Viewer cannot modify documents via direct API call.
- Version restore actually changes document state.
- Auth/session behavior matches what the docs now claim.
- Backend tests pass.

## Done when
- Core backend baseline is reliable.
- Infra/setup is reviewer-friendly.
- Backend behavior matches what README/docs claim.
- Any remaining baseline gaps are called out explicitly, not hidden behind doc-only wording.
