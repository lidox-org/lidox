# Abror

## Role
AI & Orchestration Lead

## Objective
Close the two most important Assignment 2 feature gaps: streamed AI and reliable AI/collaboration behavior.

## Owned scope
- `apps/api/src/ai/`
- `apps/sync-server/`
- related contracts in `packages/types/`

## Primary tasks
- Replace AI polling with real streaming via SSE or WebSocket chunks.
- Implement generation cancelation.
- Keep provider logic behind one adapter/interface.
- Keep prompts configurable in one module/config path.
- Fix AI interaction logging so final status reflects real user action.
- Implement or finish stale proposal detection during collaboration.
- Document AI behavior during concurrent edits.
- Add AI tests with mocked provider responses.
- Stabilize sync lifecycle:
  - authenticated connection
  - reconnect handling
  - state reconciliation
  - presence reliability

## Deliverables
- streaming transport
- cancelation support
- accurate AI history logging
- AI/sync tests
- any contract updates required for streaming

## Constraints
- Do not ship streaming that still behaves like polling.
- Do not log `accepted` before a user actually accepts.
- Coordinate frontend contract changes before merging.

## Verification
- AI output arrives chunk-by-chunk.
- User can cancel without corrupting state.
- Accept/reject/partial state is stored correctly.
- Collaboration remains stable during AI flows.

## Done when
- Assignment 2 AI baseline is satisfied.
- AI and sync behavior can be demonstrated confidently live.
