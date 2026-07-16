---
name: github-setup
description: "Use when the user says \"set up GitHub for this project\" or asks to scaffold a new repo's labels, branch ruleset, issue forms, PR template, work-item runbook, or Project board. Not for this repo's own day-to-day GitHub mechanics; use its runbook."
---

# GitHub setup

Scaffold a fresh (or under-scaffolded) repository with the pattern proven in
provenant: declarative labels, a main-branch ruleset pinned to one aggregate
required check, issue forms, a user-gate-first PR template, a work-item
runbook, a Project board, and the branch/linking doctrine that ties them
together. This skill authors the scaffolding; the target project's own
runbook owns its mechanics once copied in.

## User gate first

Nothing is pushed, created or enforced on GitHub before the user approves a
concrete plan naming the target repo, the exact labels/ruleset/forms diff and
the Project board name. Call out destructive steps by name in that plan:
ruleset enforcement, label pruning via `skip-delete: false`. If the user has
not named a target repository, ask; never infer one from the working
directory.

## Steps

1. **Labels**: copy [`templates/labels.yml`](templates/labels.yml) to
   `.github/labels.yml` and
   [`templates/workflows-labels.yml`](templates/workflows-labels.yml) to
   `.github/workflows/labels.yml`; sync runs on the next push to `main`.
   Warn: pruning is on, so labels missing from the file are deleted.
2. **Ruleset**: add a `ci-status` aggregate job (template:
   [`templates/ci-status-aggregate.yml`](templates/ci-status-aggregate.yml))
   to the project's CI, then create the branch ruleset pinning that one
   check. Commands and the `integration_id` rationale:
   [references/ruleset-and-ci.md](references/ruleset-and-ci.md).
3. **Issue forms**: copy `templates/ISSUE_TEMPLATE/*.yml` to
   `.github/ISSUE_TEMPLATE/`: `work-item.yml` as-is; adapt gate-command
   wording in `bug.yml` and `feature.yml`; fill the SECURITY.md link in
   `config.yml`. `skill-proposal.yml` is deliberately excluded as
   provenant-specific.
4. **PR template**: copy
   [`templates/pull_request_template.md`](templates/pull_request_template.md)
   into `.github/`; replace the placeholder evidence rows with the project's
   real gate names. "Decision requested" and "Independent review" stay
   required sections.
5. **Work-item runbook**: write a copy of
   [references/doctrine.md](references/doctrine.md) into the target repo
   (e.g. `docs/runbooks/github-workflow.md`) and add the project's own
   mechanics; merge authority is a per-project decision this skill does not
   make.
6. **Project board**: create it with the six standard statuses:
   [references/project-board.md](references/project-board.md).
7. **Optional agent-trigger wiring**: the `agent-go` label in
   `templates/labels.yml` is a pure authorisation switch; readiness lives in
   Project Status. No dispatch automation is part of this baseline; if the
   target project wants one, scope it as a fresh, explicitly authorised
   addition.
8. **CODEOWNERS / Dependabot**: stack-specific; `templates/dependabot.yml`
   keeps one durable convention (Dependabot PRs carry only the
   `dependencies` label) with a comment showing where to add ecosystems.

## Stop conditions

Stop and ask rather than guess: no target repo named, no push/write
permission confirmed, an existing ruleset or labels file the user has not
said may be replaced, or a CI stack where the `ci-status` aggregate is
non-obvious to wire (ask which jobs it should `needs:`).
