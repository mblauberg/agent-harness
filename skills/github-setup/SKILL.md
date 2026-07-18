---
name: github-setup
description: "Use when the user says \"set up GitHub for this project\" or asks to scaffold a new repo's labels, branch ruleset, issue forms, PR template, work-item runbook, or Project board. Not for this repo's own day-to-day GitHub mechanics; use its runbook."
---

# GitHub setup

Scaffold a fresh or under-scaffolded repository with declarative labels, a
main-branch ruleset pinned to one aggregate check, issue forms, a PR template,
a work-item runbook and a Project board. The target project's runbook owns
mechanics after setup.

## User gate first

Before any GitHub write or enforcement, the user approves a plan naming the
target, exact scaffold diff and Project board. Name destructive steps: ruleset
enforcement and label pruning via `skip-delete: false`. Ask for an unnamed
target; never infer it from the working directory.

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
3. **Issue forms and security route**: before adding the issue-form contact
   link, copy [`templates/SECURITY.md`](templates/SECURITY.md) to the repository
   root, or verify that an existing `SECURITY.md` provides a valid private
   route. Then copy `templates/ISSUE_TEMPLATE/*.yml` to
   `.github/ISSUE_TEMPLATE/`: `work-item.yml` as-is; adapt gate-command
   wording in `bug.yml` and `feature.yml`; replace `<owner>/<repo>` in
   `config.yml`. Confirm private vulnerability reporting is enabled, or replace
   `<private-reporting-route>` with a working confidential contact method. Do
   not publish until the placeholder is gone and both link and route work.
   `skill-proposal.yml` is deliberately excluded as provenant-specific.
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
7. **Optional agent trigger**: `agent-go` authorises; Project Status records
   readiness. Dispatch automation is outside this baseline and needs separate
   authority.
8. **CODEOWNERS / Dependabot**: stack-specific; `templates/dependabot.yml`
   keeps one durable convention (Dependabot PRs carry only the
   `dependencies` label) with a comment showing where to add ecosystems.

## Stop conditions

Stop on an unnamed target, unconfirmed write permission, replacement of an
existing ruleset or labels file, or ambiguous `ci-status` dependencies. Ask
which jobs it should `needs:`.
