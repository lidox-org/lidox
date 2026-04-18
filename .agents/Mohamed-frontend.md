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
- Make the visible AI proposal UX match the documented behavior used in the report.
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
- If offline buffering is not implemented, remove any UI implication that it exists.
- Treat removing offline UI cues as doc/product honesty, not as completion of the offline/reconnect requirement.
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
- Version restore and AI proposal review behave as documented on screen.
- Relevant frontend tests pass.

## Done when
- Frontend clearly demonstrates the grading sequence.
- AI UX is understandable and reliable on screen.
- Frontend tests cover the baseline paths.
- Any UX intentionally cut is documented as a deviation instead of being silently omitted.
