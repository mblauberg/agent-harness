---
name: github-setup
description: "Use when the user says \"set up GitHub for this project\" or asks to scaffold a new repo's labels, branch ruleset, issue forms, PR template, work-item runbook, or Project board. Not for this repo's own day-to-day GitHub mechanics; use its runbook."
---

# GitHub setup

Scaffold a fresh (or under-scaffolded) repository with the pattern proven in
provenant: declarative labels, a main-branch ruleset pinned to one aggregate
required check, issue forms, a user-gate-first PR template, a work-item
runbook, a Project board with six standard statuses, and the branch/linking
doctrine that makes them cohere. This skill authors the scaffolding; it is not
a substitute for the target project's own runbook, which owns its
project-specific mechanics once copied in.

## User gate first

Nothing gets pushed, created or enforced on GitHub before the user approves a
concrete plan naming the target repo, the exact labels/ruleset/forms diff,
and the Project board name. Present the plan, wait for explicit approval, then
execute. A destructive step — ruleset enforcement, label pruning via
`skip-delete: false` — gets called out by name in that plan, not buried in a
"looks good?" summary. If the user has not named a target repository, ask; do
not infer one from the working directory.

## Steps

1. **Labels** — copy [`templates/labels.yml`](templates/labels.yml) to
   `.github/labels.yml` and
   [`templates/workflows-labels.yml`](templates/workflows-labels.yml) to
   `.github/workflows/labels.yml`, then either push (the workflow syncs on
   the next push to `main`) or run the sync action once manually. Warn the
   user that pruning is on: any label not in the file is deleted.
2. **Ruleset** — add a `ci-status` aggregate job to the project's own CI
   workflow (template:
   [`templates/ci-status-aggregate.yml`](templates/ci-status-aggregate.yml)),
   then create the branch ruleset pinning that one check. Full commands and
   the `integration_id` rationale: [references/ruleset-and-ci.md](references/ruleset-and-ci.md).
3. **Issue forms** — copy `templates/ISSUE_TEMPLATE/*.yml` to
   `.github/ISSUE_TEMPLATE/`: `work-item.yml` (generic as-is), `bug.yml` and
   `feature.yml` (adapt gate-command wording to the target project), and
   `config.yml` (disables blank issues; fill in the SECURITY.md link).
   Provenant's `skill-proposal.yml` is deliberately excluded — specific to a
   skill-catalogue repository, not general scaffolding.
4. **PR template** — copy
   [`templates/pull_request_template.md`](templates/pull_request_template.md)
   to `.github/pull_request_template.md`. Evidence-table rows are generic
   placeholders; add the project's real gate names. User-gate-first by
   construction: "Decision requested" and "Independent review" are required
   sections, not optional ones.
5. **Work-item runbook** — write a copy of
   [references/doctrine.md](references/doctrine.md) into the target repo
   (e.g. `docs/runbooks/github-workflow.md`), then add the project's own
   mechanics (worktree/branch helper, merge authority — see "Merge
   authority" in that file, which is a per-project decision this skill does
   not make for the user).
6. **Project board** — create it and set the six standard statuses (Backlog,
   Ready, In progress, In review, Awaiting user, Done):
   [references/project-board.md](references/project-board.md).
7. **Optional agent-trigger wiring** — provenant's own switch is the
   `agent-go` label already in `templates/labels.yml` ("Triaged and ready; an
   agent lane is authorised to implement without further user input"); no
   separate webhook/dispatch automation has landed to extract, so do not
   invent one. If the target project wants more (e.g. a workflow that
   dispatches an agent on that label), scope it as a fresh, explicitly
   authorised addition, not part of this baseline.
8. **CODEOWNERS / Dependabot** — stack-specific (paths, ecosystems), not a
   generalisable pattern; `templates/dependabot.yml` keeps the one durable
   convention (Dependabot PRs carry only the `dependencies` label, matching
   the label-sync file) with a comment showing where to add ecosystems.

## Stop conditions

Stop and ask rather than guess: no target repo named, no push/write
permission confirmed, an existing ruleset or labels file the user has not
said may be replaced, or a project whose CI stack makes the `ci-status`
aggregate non-obvious to wire (ask which jobs it should `needs:`).
