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
| Any later state to `Done` | Merging agent or user; merge auto-closes a `Closes #N` issue | No gate remains; the terminal reason or integrated pull request is recorded |

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

Merge authority is repo-based. This repository is a personal harness, not
production: by user directive (2026-07-16), repository auto-merge is enabled
and agents merge directly. An agent merges a pull request once it has passed
its tier's review pressure (routine: chair plus native checks; substantial:
fresh native plus the cross-family leg on the exact head; crucial: both) and
CI is green on the exact head, without waiting for the user. `gh pr merge
--auto` may be queued once those gates are met.

The user review/merge gate applies only when the agent is stuck: split review
verdicts it cannot settle with primary-source evidence, an exhausted repair
budget, or a decision outside its granted authority. Standing user gates are
unchanged: branch deletion, history rewrites, credential or connector setup,
pushes to shared branches outside authorised merges, and risk-tier downgrades.

Branch protection requires the head to be strictly up to date with `main`, so
concurrent pull requests still integrate as a serialised merge train: merge
one, update the next onto the new `main`, rerun the exact-head checks and
independent review (an update-merge is a new commit and invalidates prior
exact-head evidence), then merge it.

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

## Agent-go trigger

[`.github/workflows/agent-go-trigger.yml`](../../.github/workflows/agent-go-trigger.yml)
(issue #152) is a thin dispatch workflow: adding the `agent-go` label to an
accepted issue starts an agent run that is expected to end at a linked pull
request awaiting user review, the same way manually starting `implement` on a
`Ready` issue does. It only dispatches; it never runs the implementation
itself, and it never installs or contacts anything beyond the one endpoint
its config selects.

### What it does

1. The workflow subscribes to exactly one event/type pair: `issues: labeled`.
2. The `gate` job requires all of: the label added is exactly `agent-go`, the
   actor is the maintainer, and the issue is open. Any other label, actor or
   a closed issue leaves the job's `if:` false and the run does nothing.
3. `gate` reads the provider lane (`codex` or `claude`) from
   [`.github/agent-go.yml`](../../.github/agent-go.yml).
4. The `dispatch` job builds a small JSON payload (issue number, title, body,
   URL, repository) and POSTs it to the endpoint the maintainer configured
   for the selected lane.

### Security model

- **Event and type:** only `issues: labeled` is subscribed. There is no
  `unlabeled` subscription, so removing the label cannot fire anything — this
  is a guard by omission, not a runtime check. There is no `issue_comment` or
  `pull_request` subscription, so no @-mention and no PR-side labelling can
  fire it either.
- **Label:** `github.event.label.name == 'agent-go'` — the exact label from
  the taxonomy in [`.github/labels.yml`](../../.github/labels.yml), nothing
  else.
- **Actor:** `github.event.sender.login == 'mblauberg'` — read from the
  webhook payload's own record of who performed the action, not
  `github.actor` (which is not guaranteed to equal the acting principal on
  every event shape) and not a repository write-access check (a compromised
  or over-scoped collaborator token must not fire this; only the named
  maintainer login can). There is no `allowed_bots` list and no fallback for
  any other actor.
- **State:** `github.event.issue.state == 'open'` — labelling a closed issue
  does nothing.
- **Untrusted payload:** issue title and body are attacker-controlled input
  on a public repository (the documented prompt-injection incident class).
  They are read into `env:` values (`ISSUE_TITLE`, `ISSUE_BODY`) and only
  ever referenced as shell variables; no step interpolates
  `${{ github.event.issue.title }}` or `${{ github.event.issue.body }}`
  directly into a `run:` script body. The dispatch payload itself is built
  with `jq --arg`, so both fields stay JSON string data in the POST body —
  never code, never a shell fragment.
- **Workflow hygiene:** top-level `permissions: {}`; `gate` holds only
  `contents: read` (to check out the one config file); `dispatch` holds `{}`
  (it only builds a payload and calls `curl`, needing no `GITHUB_TOKEN`
  scope). `actions/checkout` is the only third-party action and is
  SHA-pinned. `tests/test_agent_go_trigger_policy.py` asserts every invariant
  above against the parsed workflow, and zizmor
  (`zizmor --config .github/zizmor.yml .github/workflows .github/actions`,
  pinned at v1.27.0 in `ci.yml`) is clean.

### Provider swap

Swapping providers is a one-line change: edit the `provider:` value in
[`.github/agent-go.yml`](../../.github/agent-go.yml) — `provider: codex`
(default) or `provider: claude` — and change nothing else in the workflow,
the gate or the dispatch payload shape. Each lane reads its endpoint from its
own repository secret, so both lanes can be configured at once and the swap
is just which one `gate` selects.

### Maintainer one-time setup

The workflow dispatches to whichever endpoint is configured; it never
installs an app, mints a token or provisions a connector itself (standing
user gate: credential and connector setup is maintainer-only). Do this once
per lane before relying on it:

**Codex lane (default):**

1. Install and connect the Codex Cloud GitHub connector for this repository
   (ChatGPT subscription) from the Codex Cloud UI.
2. Create a Codex Cloud environment/task configuration that accepts a
   dispatch call for this repository and note the endpoint URL it exposes
   (or the webhook URL of an intermediary you control that starts a Codex
   Cloud task from that payload).
3. Set that URL as the `AGENT_GO_CODEX_DISPATCH_URL` repository secret.

**Claude lane (swap):**

1. Install the Claude Code GitHub app / configure a Claude Code Routine with
   a GitHub trigger (subscription credit), managed via the RemoteTrigger
   routine.
2. Note the routine's trigger endpoint URL.
3. Set that URL as the `AGENT_GO_CLAUDE_DISPATCH_URL` repository secret.

Whichever lane is not currently selected in `.github/agent-go.yml` can be
configured ahead of time so the swap in the previous section stays a
same-day operation, not a rebuild.

### Remaining acceptance evidence (live verification)

These steps need the maintainer's connector/app installation above and
cannot be produced from static review; they are the issue's acceptance
criteria and remain open until run:

1. Label a real test issue `agent-go` as the maintainer and confirm the run
   ends at a correctly linked pull request.
2. Negative test: have a non-maintainer comment on or label an issue
   `agent-go` (or label it as the maintainer through some other automation
   identity) and confirm no run starts.
3. Exercise the provider swap once end-to-end in each direction (`codex` to
   `claude` and back), confirming both dispatch endpoints work before
   relying on either as the default.
