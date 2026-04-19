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

## How to treat deviations
- Documenting a deviation is mandatory, but documentation alone does not satisfy the baseline requirement.
- Example: recording `NestJS` instead of `FastAPI` avoids a silent mismatch, but it is still a rubric/compliance risk.
- Example: removing an offline-sync claim from docs avoids overclaiming, but it does not mean the offline/reconnect requirement is complete.
- When a baseline item is not implemented, mark it explicitly as:
  - implemented
  - documented deviation
  - open rubric risk

## Required output from every agent
- Assignment 2 clauses closed by the change
- evaluator-feedback items closed by the change
- files changed
- tests/manual checks run
- remaining rubric risks, clearly separated from items that were only documented/aligned

## Feedback-driven focus
The latest evaluator feedback specifically deducted for:
- auth/communication model mismatch between report and code
- offline buffering described in docs but left as future work in code
- incomplete version-restore and AI-proposal handling behavior in the PoC
- lack of automated tests
- repository process not following documented branch/merge conventions

Agents should fix those items before adding lower-priority features.
