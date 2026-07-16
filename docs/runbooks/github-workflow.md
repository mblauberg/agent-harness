# GitHub work-item workflow

Use this process for user- and agent-originated repository work. Project
Status is the sole workflow state; labels describe content or gates, not
progress. The label taxonomy is declarative in
[`.github/labels.yml`](../../.github/labels.yml), synced with pruning: a label
absent from that file is deleted on the next sync, so never hand-create one.
Issue intake uses the issue forms under `.github/ISSUE_TEMPLATE/`; blank
issues are disabled.

## Statuses

| Status | Meaning |
|---|---|
| Backlog | Untriaged or explicitly deferred. |
| Ready | Accepted with bounded scope, authority and acceptance evidence. |
| In progress | An owner is executing the accepted work. |
| In review | The pull request, checks or independent review is active. |
| Awaiting user | Machine work is ready but a user decision or acceptance remains. |
| Done | The item is integrated, or closed with its terminal reason recorded. |

## Triage

1. Check the evidence, desired outcome, scope, acceptance evidence,
   dependencies, risk, authority and user gates.
2. Record one result in a comment:
   - **Accepted:** state the bounded scope, authority and remaining gates; set
     `Ready`.
   - **Rejected:** give an evidence-based reason and a condition that would
     justify reopening; set `Done` and close as not planned.
   - **Deferred:** give the reason and reconsideration condition; leave open in
     `Backlog`.
   - **Duplicate:** link the canonical item; set `Done` and close as not planned.
3. Agents may triage only inside their granted authority. A spec, one-way-door
   choice, final acceptance or release decision moves to `Awaiting user`; an
   agent never infers it. User-originated items follow the same evidence and
   scope checks.

## Execute and review

1. Set `In progress` when an owner starts the accepted scope.
2. Link a pull request with `Closes #N` only when merge leaves no user or
   external-action gate. Otherwise use `References #N` and keep the issue open.
3. Set `In review` while exact-head checks and independent review run. A new
   commit invalidates that exact-head evidence and it must be rerun.
4. If machine gates pass but a user gate remains, set `Awaiting user`.
5. A user decision comment names the selected choice, artifact or exact head,
   supporting evidence and every remaining gate.
6. Set `Done` only after the issue has no remaining gate and its terminal
   reason or integrated pull request is recorded.

Use a text or Mermaid diagram only when several actors, dependencies or state
transitions would otherwise be difficult to review. Simple issues and pull
requests do not need one.

## Mechanics

This runbook is provenant-local repository process, not harness doctrine. The
worktree authority it relies on (the standing envelope in `HARNESS.md` and the
helper contract in [`docs/worktrees.md`](../worktrees.md)) is harness doctrine
and applies wherever the harness is loaded.

The loop below takes an accepted issue from `Ready` to `Done`. The examples use
issue `148`; substitute the live issue number and a short kebab-case slug.

### Branch and worktree

Name the branch `issue-N-slug`, for example `issue-148-runbook-mechanics`.
Create the linked branch, then a worktree on it. `gh issue develop` records the
issue-to-branch link on GitHub; the helper enforces the shared-worktree
contract, and its authorisation flags attest that the standing `HARNESS.md`
envelope or a direct user instruction covers the operation:

```sh
gh issue develop 148 --name issue-148-runbook-mechanics --base main
git fetch origin
scripts/worktree create impl-148 --human-authorised \
  --existing-branch issue-148-runbook-mechanics
```

When the GitHub-side branch link is not needed, create the branch and worktree
in one step:

```sh
scripts/worktree create impl-148 --human-authorised \
  --new-branch issue-148-runbook-mechanics --branch-authorised \
  --start-point main
```

Then set the issue to `In progress` (commands under
[Project status](#project-status)).

### Commit and push

Reference the issue from every commit body with `Refs #N`. Never put a closing
keyword in a commit message; the pull request owns issue closure. Push with an
upstream so `gh pr create` finds the branch:

```sh
git push -u origin issue-148-runbook-mechanics
```

### Pull request

Open the pull request against `main` and link the issue per the rule in
[Execute and review](#execute-and-review): `Closes #N` only when merge leaves
no user or external-action gate, otherwise `References #N` with the issue left
open. The body must follow the repository template
([`.github/pull_request_template.md`](../../.github/pull_request_template.md));
`gh pr create --body` bypasses the template, so fill a copy — evidence rows
bound to the exact head SHA and the independent-review block included — and
pass it explicitly:

```sh
cp .github/pull_request_template.md /tmp/pr-body.md
# fill in every section, then:
gh pr create --base main \
  --title "docs(runbooks): document agent GitHub mechanics" \
  --body-file /tmp/pr-body.md
```

Set the issue to `In review` while exact-head checks and independent review
run, and `Awaiting user` once machine gates pass and only a user decision
remains.

### Project status

Project Status (project `2`, owner `mblauberg`) is the sole workflow state; no
effort or session document owns it. Ownership of each transition:

| Transition | Owner | When |
|---|---|---|
| `Backlog` to `Ready`, `Done` or unchanged | Triage: user, or an agent inside granted authority | The triage result is recorded in an issue comment |
| `Ready` to `In progress` | Implementing agent | Work on the accepted scope starts |
| `In progress` to `In review` | Implementing agent | The pull request, exact-head checks or independent review is active |
| `In review` to `Awaiting user` | Implementing agent | Machine gates pass; a user decision or acceptance remains |
| Any later state to `Done` | User; merge auto-closes a `Closes #N` issue and the user confirms | No gate remains; the terminal reason or integrated pull request is recorded |

Move an item with the project CLI. The Status field id is stable for this
project:

```sh
item=$(gh project item-list 2 --owner mblauberg --limit 200 --format json \
  --jq '.items[] | select(.content.number == 148) | .id')
gh project item-edit --project-id PVT_kwHOBiwkrc4BdU1c --id "$item" \
  --field-id PVTSSF_lAHOBiwkrc4BdU1czhX3Kn4 --single-select-option-id 5c9ddb06
```

Status option ids: `Backlog` `c764d63a`, `Ready` `a5ebd55b`, `In progress`
`5c9ddb06`, `In review` `27873f75`, `Awaiting user` `129da224`, `Done`
`93d6cd26`. If an id stops matching, re-derive it:

```sh
gh project field-list 2 --owner mblauberg --format json \
  --jq '.fields[] | select(.name == "Status")'
```

### Merge

Integration to `main` is a user gate; the user merges. Repository auto-merge
is disabled: never queue `gh pr merge --auto`. Branch protection requires the
head to be strictly up to date with `main`, so concurrent pull requests
integrate as a manual, serialised merge train: merge one, update the next onto
the new `main`, rerun the exact-head checks and independent review (an
update-merge is a new commit and invalidates prior exact-head evidence), then
merge it.

### After merge

Afterwards:

1. Confirm the issue closed (`Closes #N`) or close it with its terminal reason
   recorded, and confirm Status is `Done`.
2. Remove the worktree once `git status` in it is clean and no live agent,
   pane or unconsumed handoff remains:

   ```sh
   scripts/worktree remove impl-148 --human-authorised
   ```

3. Branch deletion, local or remote, needs separate explicit user authority.
   After an authorised remote deletion, run `git fetch --prune`.
