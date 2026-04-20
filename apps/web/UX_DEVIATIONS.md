# Frontend UX Deviations

The demo client now ships with working restore, cookie-first auth alignment,
and browser-local offline persistence. The remaining user-visible limitation is
around live permission revocation:

## Live Permission Revocation

- The editor enforces read-only viewer/commenter UX on load.
- Mid-session permission downgrades and forced disconnect behavior are not
  implemented in this branch.
