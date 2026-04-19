# Frontend UX Deviations

This branch improves the Assignment 2 demo client, but the following items are
still intentionally limited and should not be presented as complete:

## Version Restore

- The version history sidebar is visible.
- Restore actions are intentionally disabled in the UI because the current
  backend restore flow is still placeholder behavior.
- The editor now states this explicitly instead of implying restore is ready.

## Offline Persistence

- Live sync state is shown in the editor header.
- Offline buffering and durable local persistence are not implemented in this
  branch.
- The editor now warns that disconnected edits may not survive a reload until
  sync reconnects.

## Auth Contract

- This branch keeps the current repo auth contract as-is.
- Cookie-first browser auth alignment is not part of this frontend-only UX pass
  and still requires coordinated backend and frontend contract work.

## Live Permission Revocation

- The editor enforces read-only viewer/commenter UX on load.
- Mid-session permission downgrades and forced disconnect behavior are not
  implemented in this branch.
