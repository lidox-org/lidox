# TEAM

## Objective
Deliver Assignment 2 with the highest grading impact first: baseline compliance, reliable live demo path, then quality/docs/tests.

## First decision
Choose one path immediately and document it:

1. Migrate the backend API to `FastAPI`.
2. Keep `NestJS` and explicitly record the deviation.

Recommendation: migrate to `FastAPI` if schedule permits. If not, do not hide the deviation.
Important: a documented `NestJS` deviation avoids a silent mismatch penalty, but it does not satisfy the Assignment 2 backend technology requirement.

## Priority order
1. Fix evaluator-deducted mismatches between docs and implementation
2. Backend strategy and shared contracts
3. Reliable graded demo path
4. AI streaming and cancelation
5. Version restore + AI history + role enforcement gaps
6. Tests, run script, docs, deviation report
7. Demo rehearsal and Q&A prep

## Evaluator feedback to address first
- Align the documented auth/communication model with the actual implementation.
- Either implement offline buffering or remove/mark the claim clearly in docs.
- Finish the version-restore behavior so the PoC matches the report.
- Finish the AI-proposal handling behavior so the PoC matches the report.
- Add automated tests.
- Document and follow branch/merge conventions in the repo.

## Done criteria for any work item
- The implementation works in the running app, or the remaining gap is explicitly documented as a deviation/rubric risk.
- Docs and code say the same thing.
- The owner leaves evidence: tests run, manual checks, and exact remaining risks.
- No one reports a task as "done" if it only reworded docs for a still-missing baseline feature.

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
- documented branch/merge conventions that match actual team practice
- one-command local startup
- passing backend/frontend tests that cover the baseline
- live-demo script kept under 5 minutes

## Agent handoff format
Each owner agent should end with:
- what changed
- files changed
- tests run
- known risks / follow-ups
