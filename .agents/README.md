# `.agents` Workspace

This folder is written for coding harnesses such as Codex. Each file is an execution brief with owned scope, deliverables, constraints, verification, and done criteria.

## How to use
- Start with `team-plan.md` and `status-and-estimate.md`.
- Then assign one harness/agent per owner file.
- Each owner should stay inside owned scope unless the task explicitly requires cross-area work.
- Keep changes PR-sized and update docs when behavior changes.
- Do not silently deviate from `assignment2.pdf`; record deviations in `DEVIATIONS.md` or the README.

## Files
- `team-plan.md`: shared priorities, ordering, and team rules
- `status-and-estimate.md`: current completion estimate and main gaps
- `Brandon-architecture.md`: architecture, docs, deviation report, demo, review
- `Mohamed-frontend.md`: frontend, editor UX, AI UX, frontend tests
- `Abror-ai-orchestration.md`: AI orchestration, streaming, sync behavior, AI tests
- `Abdelmonaim-backend-devops-lead.md`: backend core, auth, permissions, infra, backend tests

## Critical Assignment 2 facts
- The brief says `FastAPI`; the current repo uses `NestJS`.
- AI streaming is mandatory; the current repo uses queue + polling.

Those are delivery-critical decisions, not polish items.
