# CI Branch Protection — Hackathon Setup

The CI workflow (`.github/workflows/ci.yml`) runs on every push and PR, but
GitHub does not enforce required checks until a repo admin enables branch
protection. For the hackathon demo window we want `main` to stay green: no
direct pushes, no merging while CI is red, and at least one reviewer per PR.
This page is the placeholder so the configuration step does not get lost
before the demo.

## Required steps (repo admin, one-time)

Navigate to **Settings → Branches → Branch protection rules → Add rule** and
apply the following to `main`:

- Branch name pattern: `main`
- Require a pull request before merging
  - Require approvals: **1**
  - Dismiss stale pull request approvals when new commits are pushed
- Require status checks to pass before merging
  - Require branches to be up to date before merging
  - Required status checks:
    - `Contracts`
    - `Frontend`
    - `MCP Server`
    - `Agent Runner`  *(add once PR #38 lands on main)*
- Require conversation resolution before merging
- Do **not** enable: Allow force pushes
- Do **not** enable: Allow deletions

Status check names must match the `name:` field of each job in
`.github/workflows/ci.yml`. If a job is renamed, update the required check
list at the same time or `main` will become unmergeable.

## After protection is on

Maintainers merge exclusively via the PR review path: open a PR, wait for the
four required checks, get one approval, then squash-merge. Hotfixes follow the
same flow — the rule explicitly blocks direct pushes to `main`, including from
admins, so plan to keep at least one other maintainer reachable during the
demo window.
