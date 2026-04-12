# TEAM

## Objective
Deliver Assignment 2 with the highest grading impact first: baseline compliance, reliable live demo path, then quality/docs/tests.

## First decision
Choose one path immediately and document it:

1. Migrate the backend API to `FastAPI`.
2. Keep `NestJS` and explicitly record the deviation.

Recommendation: migrate to `FastAPI` if schedule permits. If not, do not hide the deviation.

## Priority order
1. Backend strategy and shared contracts
2. Reliable graded demo path
3. AI streaming and cancelation
4. Version restore + AI history + role enforcement gaps
5. Tests, run script, docs, deviation report
6. Demo rehearsal and Q&A prep

## Cross-team rules
- Keep changes PR-sized.
- Do not silently change contracts.
- Update docs when behavior changes.
- Run relevant verification before handoff.
- Do not claim a feature is done unless it works in the running app.

## Minimum demo path that must work
1. Register and login
2. Create document
3. Rich-text edit with auto-save indication
4. Share document and enforce roles server-side
5. Open same document in two windows and show collaboration
6. Use AI with streaming, cancelation, and suggestion review
7. Restore a previous version

## Required repo-level deliverables
- `README.md` with setup, run, tests, architecture summary
- `DEVIATIONS.md` or equivalent README section
- one-command local startup
- passing backend/frontend tests that cover the baseline
- live-demo script kept under 5 minutes

## Agent handoff format
Each owner agent should end with:
- what changed
- files changed
- tests run
- known risks / follow-ups
