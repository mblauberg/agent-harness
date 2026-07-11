# Herdr pane operating contract

Herdr is the control plane for substantial interactive, long-running and
cross-family work. It does not replace native subagents or decide model routing.

## Use a pane when

- the worker may run longer than about two minutes;
- the human benefits from watching or steering it;
- it may block for input;
- it is the other primary family or a bonus-family review leg worth observing;
- the task must survive the lead's context churn.

Keep short mechanical/native fan-out inline. For substantial eligible work done
without Herdr, record `HERDR-NOT-USED: <reason>`.

## Preflight

```sh
test "${HERDR_ENV:-}" = 1
herdr status server
herdr integration status
herdr agent list
```

Operate the live session only from a Herdr-managed pane. If `HERDR_ENV` is not
`1`, report that boundary instead of inspecting or controlling the user's
focused session from outside Herdr.

Treat the installed CLI as the syntax authority. Use `herdr --help` and the
relevant non-mutating command-group help; never run bare `herdr` for discovery
because it launches or attaches the TUI. Do not probe a potentially mutating
subcommand by omitting arguments.

Workspace, tab, pane and terminal IDs are opaque. Parse them from JSON after
every create, split or move; never derive them from display order or examples.
Use `--current` for the caller pane or an explicit returned ID. An omitted
target may resolve to another client's focused pane.

Require a compatible running server and a current integration for the selected
agent. An installed CLI without an integration can still run, but its state is
`unknown`; do not treat that as reliable completion telemetry. Pi remains
dormant until its provider/model route is approved and `herdr integration
install pi` has been evaluated.

## Start and name

Discover the current CLI/model options first. Start one role per pane:

```sh
herdr agent start review-other-primary --cwd "$PWD" --split right --no-focus -- <agent command>
```

Use role names such as `review-claude`, `review-codex`, `scout-gemini` or
`implement-api`. Paired-primary runs use `pair-claude` and `pair-codex`; both
panes remain owned by the session chair when stage ownership rotates. Record
the pane/terminal ID and actual adapter, provider family
and resolved model in the run receipt.

## Send steering

Use the bundled helper only for fire-and-forget steering with no expected
answer. It resolves the pane, calls Herdr's `pane run`, waits for paste
settlement, then sends a harmless trailing Enter because Herdr 0.7.3 can leave
long Claude/Codex drafts unsubmitted. Its result is `dispatched-unconfirmed`,
not proof that the target process consumed the prompt:

```sh
printf '%s' '<bounded prompt>' | \
  "${AGENTS_HOME:-$HOME/.agents}/skills/orchestrate/scripts/herdr_prompt.sh" \
  <name> --fire-and-forget --task-ref <task-or-message-id>
```

The helper never waits and cannot return an answer. Do not use it for an
assignment, review, research request or any work the lead must consume. Prefer
it over separate raw text/key sends only for steering an already tracked task.
The current shell helper records the caller-supplied reference but cannot prove
that it exists; its receipt therefore says `task-ref-unverified`. Authoritative
task validation belongs to the Fabric-backed Console/provider operation in
Spec 05.

## Send answer-bearing work

Before waking a peer, create a structured Fabric task and request message with
the owning task/revision, conversation and message IDs, expected output or
artifact, `reply_to`, acknowledgement requirement, dedupe key and deadline.
Herdr then wakes or focuses the peer; it is not the transport of record.

The peer consumes and acknowledges the request through Fabric at a safe turn
boundary. Reply, terminal task result and pending request-result delivery commit
in one transaction or transactional outbox before completion-ready. The
requesting chair/lead integration subscribes to the correlated terminal result
and receives it at its next safe turn boundary. An idle requester is woken; an
active requester is not interrupted mid-tool or mid-turn. The Console may
display the committed reply before requester consumption, but does not
acknowledge it on the requester's behalf.

Response deadlines persist as barrier-blocking obligations. On overdue work,
the chair may retry the same stable action, reassign or abandon with reason; it
never blindly redispatches. Late replies remain evidence but do not silently
complete superseded work. Claim generation and stable callback IDs make
provider acceptance and requester consumption idempotent across restart.

If the active integration cannot provide Fabric request/reply, record
`FABRIC-ROUNDTRIP-UNAVAILABLE`, use a named artifact plus an explicit bounded
collection step, and report the degraded manual path. Never describe pane
status or scrollback as an automatic callback.

Observed raw-send failure modes (2026-07-10, one session lost ~20 min to these —
use the helper instead):

- `herdr agent send <pane> '\r'` sends the two literal characters `\r`, never
  a submit; the draft sits in the composer looking sent.
- Targeting by session UUID fails with `agent_not_found` — target the pane id
  (`w3:p2`), not the session id.
- The pane buffer scrolls: output longer than the buffer is unrecoverable via
  `read` — ask the worker to re-emit only the missing span, or have it write
  findings to a file from the start.
- `pane run` can still leave a long draft unsubmitted. The helper follows it
  with a settled Enter; still read the pane after dispatch because successful
  transport does not prove agent uptake.

Prompts state source scope, artifact directory, allowed artifact classes, source
write authority, output contract, evidence requirements and whether subagents
are permitted. For long-running work, prefer artifact-only writes plus a
compressed return over full output in the lead context. Do not paste secrets or
uncleared project data into an external provider pane.

For paired-primary work, persist the assignment through Fabric and use Herdr
only for the bounded wake-up notification. The durable envelope records
task/stage, chair, owner, peer, base revision, write scopes, prohibited actions,
expected output, objective checks and human gates. The peer replies through the
correlated Fabric exchange and writes any named artifact; pane scrollback is
never the authoritative negotiation.

## Observe steering without poll loops

- Continue useful local work after dispatch.
- Check once near expected completion with `herdr agent get <name>` or
  `herdr agent list`.
- If the main thread truly has nothing else to do, use one bounded
  `herdr agent wait <name> --status idle --timeout <ms>`.
- Read only the bounded tail: `herdr agent read <name> --source
  recent-unwrapped --lines <n>`.

Do not repeatedly wait in 20–30 second loops. State telemetry is advisory and
can be stale. If status conflicts with a live session, inspect
`herdr pane process-info`, `herdr agent explain`, and a bounded pane tail before
declaring failure.

`idle` and `done` both mean the agent is no longer working: `done` is an unseen
completion and `idle` is a seen/waiting completion. Accept either after checking
the pane record and bounded output. A `blocked` agent needs input; `unknown`
means integration/detection is not yet reliable.

For answer-bearing Fabric work, await or subscribe to the correlated terminal
result instead of polling pane state. Delivery to the lead occurs at a safe turn
boundary and survives lead compaction or restart as unread Fabric state.

## Finish

Capture the worker's concise result and artifact paths, adjudicate them in the
lead context, preserve a bounded status/failure receipt, then close or reuse the
pane deliberately. Never close a pane, tab, workspace or session you did not
create unless the human explicitly requests it, and never stop the Herdr server
from an active session as incidental cleanup. Do not retain a full pane transcript when the named artifact
and receipt are sufficient. Clean pane-local temporary payload only when the
run owns it; lifecycle and retention follow `session`'s context-hygiene
contract. A pane being idle does not prove its work is correct; objective checks
and review still gate the result.
