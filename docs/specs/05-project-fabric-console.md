# Project Fabric Console and adaptive session orchestration

Status: Draft; human approval pending
Version: 0.1
Date: 11 July 2026
Risk: Crucial
Decision owner: Human maintainer
Design chairs: Codex with Claude Code adversarial review

## 1. Decision and relationship to existing specs

Build a project-scoped operator Console as a separate executable package over
the shared agent fabric. The Console is the human's primary local view of
project state, active runs, agents, evidence and decisions. It may initiate
explicitly requested project sessions and typed operator actions, but it is not
another task orchestrator or authority store.

- Spec 01 remains the coordination, authority and provider-session contract.
- Spec 02 remains the adaptive harness and delivery-lifecycle contract.
- Spec 03 remains the model-adapter activation and Herdr observation contract.
- Spec 04 remains the protocol, persistence, trust and operational-hardening
  contract.
- This spec owns the project Console, operator projection, adaptive session
  launch, human-attention workflow, Herdr control integration and optional Git
  and GitHub operator adapters.

The Console is local and project-scoped. GitHub is an optional project adapter,
not a prerequisite or authority store. No browser application is included in
this scope. A later client may consume the same operator API only if evidence
shows that the TUI cannot provide an acceptable operator experience.

## 2. Outcome

Give one human a concise, continuously current control surface from which they
can understand a project's position, see what requires judgement, start and
observe agent work, review artifacts, respond naturally or through typed
actions, and operate routine Git workflows. Agents retain autonomy over
decomposition, topology, routing and replanning inside a broad approved project
envelope.

The design optimises human attention rather than maximising approval events.
Google's agentic architecture guidance distinguishes dynamic orchestration,
where agents plan and delegate, from human-in-the-loop checkpoints for
subjective, high-stakes or final decisions. This Console applies that split:
routine work continues autonomously; only affected dependency subtrees wait at
genuine human gates.

Sources:

- [The New SDLC With Vibe Coding](https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding)
- [Google Cloud: choose a design pattern for an agentic AI system](https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system)

## 3. System boundary

```text
project artifacts + Git/GitHub + Herdr + Fabric
                         |
                 operator projection
                         |
             agent-fabric-console (TUI)
                         |
           typed, revision-bound commands
                         |
                Fabric transaction owner
```

### 3.1 Canonical owners

| Concern | Canonical owner |
| --- | --- |
| Approved intent and one-way decisions | Project specs and ADRs |
| Delivery lifecycle, evidence and acceptance | `.agent-run/<run>/RUN.json` |
| Project-session lifecycle, live tasks, agents, messages, leases and operational gates | Fabric SQLite through the daemon |
| Coordination evidence | Fabric receipt |
| Repository state | Git |
| Hosted collaboration | Optional GitHub adapter |
| Pane placement, process presence and visibility | Herdr |
| Human projection and commands | Console; never canonical state |

The Console shall never write SQLite directly or infer task completion from a
pane. It shall use a distinct authenticated human-operator principal, never a
chair or agent identity. Its independently revocable capability shall separate
read, decide, steer, pause, cancel, launch and external-effect actions, bind the
exact project and generation, and expire no later than the project session. It
shall label every projected fact with source, revision and freshness: `live`,
`snapshot`, `stale`, `unavailable` or `conflict`.

### 3.2 Package and process boundary

The implementation shall preserve these independently versioned seams:

```text
agent-fabric-protocol   shared schemas and typed clients
agent-fabric-daemon     coordination authority and persistence
agent-fabric-console    standalone operator TUI
agent-fabric-herdr      thin Herdr control and presence adapter
```

They may remain in one repository for atomic compatibility tests. The Console
shall communicate through public protocol clients and shall not import daemon
internals. It shall run in any terminal; Herdr integration is optional.

## 4. Project sessions and accountable topology

The Console presents one selected project at a time. A trusted-project switcher
may change context, but v1 shall not aggregate a cross-project portfolio.

A Console project view may contain either topology:

1. **Coordinated session:** one Fabric coordination run and chair supervise
   multiple concurrent delivery runs or workstreams. Each workstream may have a
   lead and a bounded team, but it is not another chair authority.
2. **Independent sessions:** unrelated or deliberately isolated runs each have
   one chair and separate fabric session authority.

The Console is a projection-only client. The project-session lifecycle is a
Fabric-owned protocol entity persisted by the daemon before its first run is
created. Each Fabric coordination run retains exactly one accountable chair.
In coordinated mode, every `.agent-run/<run>/RUN.json` records its parent
project session, coordination run and Fabric task/workstream owned by its lead;
the chair alone retains run-level authority and barrier accountability. In
independent mode, each coordination run has its own chair and no implicit
cross-run authority. Coordinated mode is the recommendation, not a hard
default.

Pressing an explicit Console `Start project session` or `Launch run` action is
the human starting that chair. The Console submits the reviewed launch packet,
Fabric records and validates authority, and Herdr or a provider adapter performs
the external process action. The Console shall not autonomously invent a chair
or broaden its authority.

Parallel source writers shall use non-overlapping write scopes and separate
repository-owned `.worktrees/<run-or-agent>` worktrees when the project/session
launch packet grants worktree creation. This spec's human acceptance approves
that capability as an available envelope field; each active project/session
still records its chosen grant. Without it, the chair shall serialise
application or exchange immutable patch artifacts. Read-only workers do not
need worktrees. The fabric shall reject overlapping active writer leases before
launch.

## 5. Adaptive task intake and execution

### 5.1 Conversational intake

The Console shall provide a task input with an expandable structured plan. The
human may instead open a detailed form or choose `Discuss/scoping first`.

The chair assesses:

- intent, uncertainty and risk;
- task size, expected duration and oracle quality;
- decomposition and useful parallelism;
- specialities, model families and review pressure;
- write scopes, worktrees and repository interactions;
- likely gates, evidence and completion conditions.

The resulting plan is a forecast, not a lock. It exposes current topology,
models, worktrees, authority, outputs and checks. The chair may revise it as new
evidence appears.

### 5.2 Chair autonomy

Within the project/session authority envelope, the chair may without human
approval:

- work solo or enable/disable paired-primary collaboration;
- add, retire, replace or reroute agents;
- appoint run leads and form bounded leader teams;
- adjust ordering, parallelism and review strategy;
- create approved branches and worktrees;
- allocate routine Git work;
- increase or reduce resource use within configured ceilings;
- replan after failures, discoveries or changed estimates.

Paired programming is chair-selectable within authority and is not a default
requirement. The human may pin or prohibit a pair, chair family, model family,
visibility mode or resource ceiling at project, session, run or task level.
Preference precedence is `task > run > session > project > harness`; lower
levels may narrow authority automatically.

Human acceptance of this spec is the constitutional decision to amend the
harness so that `paired-primary` is chair-selectable inside an approved
project/session authority envelope rather than separately human-opt-in for each
use. Risk-required other-primary review remains distinct from live paired
programming.

### 5.3 Automatic continuation versus fresh implementation context

Routine, minor and reversible work may proceed automatically in the current
chair session when it:

- needs no spec or ADR decision;
- remains within one bounded write surface;
- has a strong objective oracle;
- needs no migration, external effect or destructive Git action;
- does not introduce an auth, privacy, legal, financial or release boundary.

Substantial or larger work shall not flow directly from scoping into
implementation. It shall create an accepted scope artifact and launch a fresh
implementation session from a compact, digest-bound handoff. Fresh means a new
provider context/session; it does not mean deleting or mutating the scoping
session. The old session remains resumable or is closed under retention policy.

A fresh implementation session is also required when any of these apply:

- a spec or ADR controls the work;
- multiple concurrent writers or worktrees are proposed;
- the work crosses major modules or is expected to span sessions;
- migration, weak-oracle or crucial-risk behaviour is present;
- the scoping context is materially polluted or near its safe context limit.

The chair may choose a fresh session earlier. A deterministic policy sets the
minimum; model judgement may escalate but not silently weaken it.

## 6. Scoping and artifact review

Extended scoping and grilling occur in the interactive Claude or Codex chair
pane, not in a second chat implementation inside the Console. The Console shall
open or focus that pane and display `scoping`, open decisions and artifact
status.

The chair shall persist decisions into project artifacts. Pane scrollback is
not authoritative. The Console shall provide an artifact view containing:

- rendered spec and ADR files;
- the diff since the previous review;
- open decisions and review findings;
- exact paths, revisions and digests;
- `Discuss`, `Accept`, `Request changes`, `Defer` and `Implement...` actions.

Natural-language acceptance in the active chair conversation may satisfy a
gate only when a contract-tested provider/Herdr integration identifies it as
direct human input and binds it to the operator principal, expected revision,
exact gate and artifact digests. Echoed text, agent-authored text, unavailable
direct-input provenance or raw pane scraping cannot approve. The adapter shall
record the provider message ID, exact human utterance, artifact digests and
interpreted decision. Ambiguity shall trigger clarification and shall not
silently approve; the human may always use the typed Console action instead.

After acceptance, `Implement...` shall prepare an editable launch packet. It
may target the current chair for minor work or a fresh Claude/Codex chair for
substantial work. The prompt shall reference artifact paths and digests and
require the receiving chair to reopen them. It shall not paste large artifacts
into the prompt.

## 7. Human-attention policy

Human intervention is required for judgement or consequential boundaries, not
ordinary replanning. At minimum, gates cover:

- unresolved intent or material subjective trade-offs;
- spec and one-way architectural decisions;
- new trusted roots or confidential-data disclosure;
- provider login or credential entry;
- destructive Git/history operations;
- non-pre-authorised push or merge;
- release or deployment of an artifact or target not covered by its exact
  final-acceptance and release gates;
- external communications;
- irreversible actions and final acceptance.

Routine topology, model, worktree, test and implementation changes shall not
create blocking gates. Material authorised changes may notify without blocking.
A pending task-scoped gate blocks only its dependent subtree or barrier;
unrelated runnable work continues.

Every gate shall include the question, affected run/task/subtree, reason,
options, recommendation, consequences, evidence, revision, approver and any
deadline/default. No gate auto-approves on timeout.

The Console shall permit typed responses and natural-language responses. Every
operator command shall carry the operator capability, a stable command ID,
expected revision, actor, provenance and before/after audit event. The daemon
shall authorise the exact action and project before mutation. Duplicate
commands have one effect; stale revisions fail closed and show the changed
state. Negative tests shall cover absent, expired, revoked, wrong-project,
wrong-generation and action-insufficient operator capabilities.

## 8. Operator experience

The default `Attention` view shall let the human identify project, session,
active runs, current phase, owners, next milestone, health and required
judgement within 10 seconds.

Required views are:

- **Attention:** decisions, blockers, quarantines, expiring authority and
  acceptance-ready work.
- **Project:** goal, accepted scope, work map, repository and optional GitHub
  summary.
- **Runs:** active/history runs, leads, dependencies, evidence and completion.
- **Work:** task graph, write scopes, worktrees, barriers and checks.
- **Agents:** chair, leads, workers, provider/model, state, current task,
  context pressure and pane/session references.
- **Evidence:** artifacts, diffs, tests, reviews, receipts and provenance.
- **Activity:** readable messages, decisions and lifecycle events.
- **System:** daemon, adapters, trust, seats, expiry and degraded integrations.

The TUI shall remain usable at 80x24, keyboard-only, with visible focus and
non-colour urgency indicators. Normal message bodies shall be readable on
demand; default list previews remain bounded and terminal-neutralised. The UI
shall not suppress ordinary content merely because the machine is private, but
shall not render capability tokens or unrelated credential values.

Closing the Console detaches the UI. It shall not stop agents or the daemon.
`Stop project session` is a distinct action that shows checkpoint, drain,
evidence and worktree consequences before execution.

## 9. Herdr integration

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
Direct terminal text injection is a compatibility fallback and remains
`delivery-unconfirmed` until the provider or agent acknowledges the message.

## 10. Git and optional GitHub adapters

### 10.1 Git

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

### 10.2 GitHub

Projects may opt into GitHub Issues, Projects, pull requests, checks, Actions,
releases and repository metadata. GitHub outage or absence shall not stall or
corrupt the fabric. GitHub remains the higher-level hosted collaboration and
portfolio surface, while the Console owns live local orchestration projection.

## 11. Lifecycle and failure behaviour

Project session states are:

```text
draft -> awaiting_launch -> launching -> active -> quiescing
      -> awaiting_acceptance -> closed
```

Exceptional states include `launch_failed`, `launch_ambiguous`,
`reconciling`, `visibility_degraded`, `recovery_required`, `quarantined` and
`cancelled`.

These states and their revisions are Fabric-owned and persisted in the same
SQLite transaction domain as runs and leases. The Console derives no lifecycle
state from local UI files. Draft launch content may live in a project artifact,
but its Fabric session record owns status, identity and active revision.

Required behaviour:

- Console crash: agents continue; the Console resumes from Fabric state.
- Herdr loss: managed sessions continue as `visibility_degraded`; no task state
  is inferred from missing panes.
- Interactive chair pane loss: freeze its delivery/turn lease and explicitly
  reattach or rotate.
- Ambiguous launch: reconcile by stable action ID; never blindly duplicate it.
- Stale artifact digest or base revision: invalidate the pending launch and
  return it to review.
- Chair loss: require a persisted handoff and explicit takeover; never silently
  promote a peer.
- Overlapping writer or unreconciled predecessor: quarantine the affected
  scope while unrelated work continues.
- Direct terminal intervention: journal it where detectable and reconcile the
  affected task revision.

Fabric services start on demand when the first project session starts. A
machine-wide daemon/supervisor, not a project Console, arbitrates the shared
socket and transaction owner. It may stop the daemon only after global
authoritative state proves that no active project session, run, lease, provider
action or attached Console remains. Concurrent project close requests are
idempotent and cannot stop another project's work. These services are not login
services under this spec.

## 12. Notifications and exports

V1 uses the TUI and native desktop notifications. Notify only for consequential
gates, critical-path blockage, quarantine, expiring authority, integrity
failure and completion/acceptance readiness. Deduplicate repeated alerts and
roll routine activity into summaries.

Markdown and JSON are generated snapshots from the operator projection. They
are portable handoff/status artifacts, never interactive authority or a second
state store. Telegram or other messaging is a later optional notification and
deep-link adapter.

## 13. Explicit exclusions

- No mandatory GitHub account, issue tracker or project board.
- No browser/HTML Console in this implementation scope.
- No Pi-based operator shell or replacement main harness; Pi remains an
  optional generic model adapter.
- No second task orchestrator, database or canonical status store.
- No arbitrary shell terminal inside the Console.
- No full provider TUI for every short-lived worker.
- No silent session deletion, context clearing or automatic chair takeover.
- No global daemon that runs when no project session is active.

## 14. Verification and acceptance

Implementation is accepted only when objective tests demonstrate:

1. The Console runs inside and outside Herdr against the same protocol.
2. Closing/restarting the Console neither stops nor duplicates active work.
3. A human can identify project/run/phase/owner/next milestone/health/attention
   within 10 seconds in an 80x24 terminal.
4. A consequential gate appears within two seconds of the committed event with
   scope, revision, evidence, consequence and available actions.
5. Natural-language acceptance is bound to the exact gate and artifact digests;
   ambiguous language cannot approve.
6. Minor routine work may continue automatically, while substantial work
   produces a fresh digest-bound implementation session.
7. The chair can dynamically change topology, pairing, models, leads and
   worktrees inside authority without approval.
8. A task-scoped gate leaves an independent sibling runnable and prevents only
   the dependent barrier from closing.
9. Duplicate commands have one effect; stale commands fail closed with a
   visible state diff.
10. Parallel writers cannot acquire overlapping scopes and use separate
    worktrees.
11. Git operations respect pre-authorisation and consequential-action gates.
12. GitHub-disabled and GitHub-outage scenarios preserve all local functions
    with explicit freshness labels.
13. Provider, pane and fabric identities reconcile before an agent becomes
    ready; ambiguous launches do not respawn blindly.
14. All operator actions journal actor, time, provenance, command ID,
    before/after state and linked evidence.
15. Full normal messages are readable on demand without terminal-control
    injection or capability rendering.
16. Every Console mutation rejects absent, expired, revoked, wrong-project,
    wrong-generation and action-insufficient operator capabilities.
17. Conversational approval succeeds only for authenticated direct human input
    bound to the expected gate revision; echo, injection and unavailable-input
    provenance fail closed.
18. Two projects can start and close concurrently without duplicating or
    prematurely stopping the shared daemon.
19. Pause, steer, resume, cancel, drain and stop enforce authority, survive
    Console restart and reconcile ambiguous external effects.
20. Native notifications deduplicate repeated events and focus the exact
    project/run/gate when actioned.
21. A scripted keyboard-only usability evaluation at 80x24 verifies every
    required view and action, visible focus and non-colour urgency; a timed
    operator study with at least three representative project fixtures records
    task correctness and time-to-identification for criterion 3.
22. Project-session draft, launch, active and close states survive daemon and
    Console restart without loss, duplication or state inferred from panes.
23. Broad project/session authority cannot release or deploy; promotion accepts
    only exact accepted-artifact digests and target-bound release authority.
24. Fresh native and other-primary reviews report no unresolved P0-P2 findings.

## 15. Implementation gate

This draft records the decided product direction. It does not authorise
implementation. Implementation begins only after the human accepts this exact
spec revision through a Console/chat decision or an explicit instruction in the
current session.
