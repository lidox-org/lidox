# Mohamed

## Role
Frontend & UX Lead

## Objective
Turn the existing frontend into a reliable Assignment 2 demo client with clear role enforcement, streaming AI UX, and solid edge-state handling.

## Owned scope
- `apps/web/`

## Primary tasks
- Enforce viewer/editor UX correctly in the editor.
- Add content auto-save status, not only title save behavior.
- Complete version history UX after backend restore is fixed.
- Implement AI streaming UI with:
  - progressive rendering
  - cancel action
  - clear failure state
- Add AI interaction history UI per document.
- Keep suggestion UX review-first:
  - compare original vs suggestion
  - accept/reject/edit
  - undo after acceptance
- Show stale proposal state clearly during collaboration.
- Add frontend tests for auth flow, document UI, and AI suggestion UI.

## Deliverables
- frontend changes in `apps/web/`
- frontend tests
- any required UI copy/states for demo clarity

## Constraints
- Do not rely on hidden buttons as access control.
- Coordinate contract changes before implementing them.
- Preserve existing app flow unless there is a strong reason to change it.

## Verification
- Demo works in two browser windows.
- Viewer cannot edit in the editor UI.
- AI stream is visible incrementally.
- Relevant frontend tests pass.

## Done when
- Frontend clearly demonstrates the grading sequence.
- AI UX is understandable and reliable on screen.
- Frontend tests cover the baseline paths.
