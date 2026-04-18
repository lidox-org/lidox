# Brandon

## Role
Architecture Lead

## Objective
Keep Assignment 2 aligned with Assignment 1 where possible, and make every deviation explicit, justified, and easy to explain in the demo/Q&A.

## Owned scope
- `docs/`
- `diagrams/`
- README architecture sections
- deviation documentation
- demo script and Q&A notes

## Primary tasks
- Create or maintain `DEVIATIONS.md`.
- Update architecture diagrams if implementation changes.
- Write concise docs for:
  - JWT lifecycle
  - collaboration transport/message flow
  - AI request/stream/cancel/review flow
- Resolve the evaluator-noted mismatch between documented cookie/offline behavior and actual code behavior.
- Remove or reword any claim that is not implemented yet, especially:
  - offline buffering
  - full version restore semantics
  - full AI-proposal handling semantics
- For each removed/reworded claim, state whether the item is:
  - no longer in scope
  - still planned but not delivered
  - an Assignment 2 baseline gap that remains a grading risk
- Audit repo structure against docs.
- Document branch/merge conventions that match actual team practice.
- Prepare the live demo script in grading order.
- Review cross-area changes for consistency.

## Deliverables
- `DEVIATIONS.md` or equivalent README section
- updated diagrams/docs
- documented branch/merge conventions
- `docs/demo-script.md` or similar short script
- short Q&A notes for the team

## Constraints
- Do not invent features in docs that are not implemented.
- Prefer precise documentation over aspirational documentation.

## Verification
- README setup matches actual commands.
- Diagrams match actual containers/modules.
- Auth/communication/offline claims in docs match the real app behavior.
- Demo script can be followed end-to-end in under 5 minutes.

## Done when
- All major deviations are documented.
- Architecture story is consistent across README, diagrams, and code.
- Team can answer architecture questions without hand-waving.
