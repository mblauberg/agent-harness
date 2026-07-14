# Project Fabric Console Git, GitHub and Herdr integrations

## Herdr integration

Herdr remains the visible process and pane surface. A thin integration shall:

- launch/focus the standalone Console in a pane;
- create and arrange chair, paired-primary and selected long-running worker
  panes;
- keep short mechanical workers headless by default;
- project bounded agent metadata and attention state;
- show native desktop notifications;
- focus the exact Console item or agent pane from an action.

The Console may request these typed operations, but Herdr owns pane placement
and process presence. Pane creation is not proof that a provider session exists.
Provider identity and actual model/session references must reconcile before an
agent becomes ready.

Prompts shall normally travel through Fabric to a managed provider adapter.
Direct terminal text injection is not a protocol-compatibility path. If kept as
an explicit degraded steering helper, it remains `dispatched-unconfirmed`,
requires an already tracked no-answer task/message reference and cannot satisfy
delivery, result or barrier state; only Fabric mailbox/request-result paths use
delivery states or acknowledgements.

### Reliable paired request/reply

Any assignment whose result a chair or lead needs shall be committed before
wake-up as a Fabric task plus correlated request message. The request includes
task and revision, conversation and message IDs, expected output/artifacts,
`requires_ack`, dedupe key, response deadline and exact target session/agent.
Herdr may wake, focus or expose the peer; it is never the reply channel.

At a safe turn boundary, the peer integration shall pull and acknowledge the
request, then commit its correlated reply, terminal task result and pending
callback in one Fabric transaction or transactional-outbox invariant. A crash
between any of those logical effects shall replay one stable action rather than
expose partial completion. The requesting chair/lead integration shall
subscribe to or await that terminal result. It shall inject the unread result
at the requester's next safe turn boundary, waking an idle requester without
interrupting an active tool/model turn. The Console may show the result
immediately but shall not consume it for the requester.

The distinct request-result delivery obligation is persisted, not represented
by an in-memory callback and not conflated with the Agent Fabric contract mailbox delivery state:
`pending -> claimed -> provider-accepted -> consumed`, with `overdue`,
`abandoned` and retry recovery transitions. Claim generation,
request/reply/task revisions and stable callback ID make provider injection and
consumption idempotent across daemon, Console and requester restart or
compaction. A response deadline moves the obligation to `overdue`, alerts the
chair and keeps its dependent barrier open. The chair may retry the same stable
action, reassign or abandon with reason; it shall never blindly redispatch. A
late reply remains linked evidence but cannot silently complete reassigned or
abandoned work.

Pane status and scrollback cannot mark a reply delivered. An integration
without structured round-trip capability must declare degradation and use a
named artifact plus an explicit bounded collection step.

The direct Herdr prompt helper shall require an explicit `--fire-and-forget`
flag and caller-supplied task/message reference. The current shell helper marks
that reference unverified; the implemented Fabric-backed operation shall
validate it authoritatively before pane injection. It is reserved for steering
a tracked task where no answer is expected; the flag is an explicit operator
acknowledgement, not semantic prompt classification.

## Git and optional GitHub adapters

### Git

The Console shall expose status, diff, log, branches, worktrees, fetch, pull,
stage, unstage, commit, merge/rebase state, push and upstream tracking through
typed operations rather than an arbitrary shell.

An approved project/session envelope may pre-authorise routine branch,
worktree, pull, stage and commit operations. Push and PR merge require an exact
remote/branch or PR grant in the active run authority or a consequential-action
gate. Release and deployment cannot be covered by a broad project/session
envelope: they require canonical final acceptance plus digest- and target-bound
release authority. Force-push, destructive branch deletion, history rewriting
and removal of a worktree with unmerged changes require a consequential-action
gate.

Before mutation, the Console shall show repository, branch/worktree, expected
revision and affected state. The action receipt shall record the result.

### GitHub

Projects may opt into GitHub Issues, Projects, pull requests, checks, Actions,
releases and repository metadata. GitHub outage or absence shall not stall or
corrupt the fabric. GitHub remains the higher-level hosted collaboration and
portfolio surface, while the Console owns live local orchestration projection.


## Notifications and exports

V1 uses the TUI and native desktop notifications. Notify only for consequential
gates, critical-path blockage, quarantine, expiring authority, integrity
failure and completion/acceptance readiness. Deduplicate repeated alerts and
roll routine activity into summaries. While project work remains active, the
daemon-owned notification worker emits best-effort desktop notifications even
when the Console is detached; Herdr may project the same durable attention item
but is not required. Sent, deduplicated and failed delivery state is journalled.
The Attention inbox remains authoritative, and the Console labels notification
delivery `available`, `unavailable` or `stale`.

V1 notifications are non-authoritative and need not be actionable. A click may
focus an exact revision only when the discovered terminal/Herdr integration has
a contract-tested link/action capability. Otherwise the notification merely
directs the human to the Console Attention view. A notification never
acknowledges, approves or consumes its item.

Markdown and JSON are generated snapshots from the operator projection. They
are portable handoff/status artifacts, never interactive authority or a second
state store. Telegram or other messaging is a later optional notification and
deep-link adapter.
