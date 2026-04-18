# Contributing

## Toolchain

- Use `corepack enable` before installing dependencies.
- Use the repo-declared package manager: `corepack npm`.
- Node `20.x` is the baseline local and CI target.

## Branching

- Start every change from a GitHub issue.
- Use issue-linked branches:
  - `feat/<issue-number>-short-description`
  - `fix/<issue-number>-short-description`
  - `docs/<issue-number>-short-description`
  - `test/<issue-number>-short-description`
- Keep branches short-lived. If work grows, split it into stacked PRs.

## Pull Requests

- Rebase or merge from `main` before opening the PR.
- Keep each PR focused on one remediation theme.
- Add an opening PR comment with:
  - the issue link
  - the assignment clauses or feedback items addressed
  - touched areas
  - explicit out-of-scope items
  - verification steps and any gaps
- Cross-area PRs should call out likely owner reviewers before review starts.

## Reviews and Merge

- Require at least one approval before merge.
- Prefer squash merge into `main`.
- Use conventional commit titles on the squash commit, for example `fix(ci): add truthful smoke gates`.

## Validation

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run the most relevant test commands for the touched area.
- Do not claim assignment compliance for a behavior that is only stubbed or documented.

## Known Deviations

- If a change leaves an Assignment 2 mismatch unresolved, record it in `DEVIATIONS.md` in the same PR.
