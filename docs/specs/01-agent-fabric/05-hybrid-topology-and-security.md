
### 9.5 Hybrid profiles

Roles may use different profiles. The default side-by-side profile is:

```yaml
execution_profile:
  name: paired-visible
  default:
    control_mode: managed
    visibility_mode: none
    inbox_delivery_mode: structured-push
  roles:
    chair:
      control_mode: attached-interactive
      visibility_mode: provider-tui
      inbox_delivery_mode: cooperative-pull
    paired-primary:
      control_mode: attached-interactive
      visibility_mode: provider-tui
      inbox_delivery_mode: cooperative-pull
    leader:
      control_mode: managed
      visibility_mode: event-mirror
      inbox_delivery_mode: structured-push
    worker:
      control_mode: managed
      visibility_mode: none
      inbox_delivery_mode: structured-push
  herdr:
    layout: side-by-side
    retain_panes_after_completion: prompt
```

`paired-visible` places both primaries side-by-side only when the chair was
launched or attached under Herdr. Otherwise it shows the peer beside an unpaned
chair and records `visibility-degraded` for chair pane telemetry only.

The `paired-observed` profile keeps the chair interactive and runs the non-chair
primary with managed control, event-mirror visibility and structured push. It
provides stronger control over the peer while preserving the human-driven
chair.

## 10. Authority and team topology

The system combines four structures:

```text
authority:       one rooted supervisor tree
work:            one task dependency graph
communication:   durable addressable mailboxes
evidence:        immutable project artifacts by path and hash
```

Stage 5 supports one chair, up to four leaders and up to five workers per
leader. The schema is recursive, but Stage 5 policy limits the depth to two
levels below the chair.

Each agent has one authority parent per run. It may belong to multiple bounded
discussion groups. Leaders own disjoint task subgraphs. A leader council is
advisory; every task, stage and decision has one named owner.

Native subagents are either:

- **opaque children**, managed by the provider-native parent and counted
  against its budget; or
- **registered children**, given fabric identity because they need direct
  task ownership, cross-team messages or durable reassignment.

An agent cannot be managed simultaneously as both an opaque native child and a
registered fabric child.

## 11. Core records

```yaml
agent:
  agent_id: run-local-stable-id
  provider_session_ref: adapter-owned-resume-reference
  parent_agent_id: sole-authority-parent
  team_id: primary-team
  role: chair-or-leader-or-worker-or-reviewer
  authority_ref: immutable-envelope-hash
  budget_ref: inherited-budget-reservation
  control_mode: managed-or-shared-session-ui-or-attached-interactive
  visibility_mode: none-or-event-mirror-or-provider-tui
  inbox_delivery_mode: structured-push-or-verified-boundary-inject-or-cooperative-pull-or-notify-only
  pane_ref: optional-herdr-pane-id
  observer_ref: optional-renderer-id
  lifecycle: starting-or-ready-or-busy-or-checkpointing-or-idle-or-suspended-or-archived
```

```yaml
task:
  task_id: stable-id
  parent_task_id: optional
  dependencies: []
  owner_agent_id: exactly-one
  authority_ref: immutable-envelope-hash
  budget_ref: reservation
  base_revision: project-revision-or-artifact-generation
  expected_artifacts: []
  objective_checks: []
  human_gates: []
  state: proposed-or-ready-or-active-or-blocked-or-complete-or-cancelled-or-degraded
```

```yaml
budget:
  schema_version: 1
  budget_id: stable-id
  parent_budget_id: optional
  currency: provider-billing-currency-or-none
  hard_limits:
    provider_cost_microunits: integer-or-none
    input_tokens: integer-or-none
    output_tokens: integer-or-none
    provider_calls: integer-or-none
    concurrent_turns: integer-or-none
    descendants: integer-or-none
    message_bytes: integer-or-none
    artifact_bytes: integer-or-none
    wall_clock_milliseconds: integer-or-none
  advisory_limits: same-dimensions-as-hard-limits
  reserved: same-dimensions-as-hard-limits
  consumed: same-dimensions-as-hard-limits
  unknown_usage_policy: freeze-hard-dimension-or-advisory-estimate
```

All quantities are non-negative integers; money uses provider-currency
microunits. A child reservation atomically debits the parent's available
balance. Consumption draws from the reservation. Idempotent release returns
only unused reserved units and cannot raise the parent above its original
grant. Usage unknown for a hard dimension freezes further reservations on that
dimension until reconciled. Unknown advisory usage may continue only with an
estimate and a degraded receipt. Limits in different currencies or provider
token units are not silently combined.

```yaml
message:
  message_id: uuid-v7
  run_id: stable-id
  sender_id: server-derived-agent-id
  audience_selector: agent-or-team-or-task
  kind: request-or-response-or-event-or-steer-or-cancel-or-escalate-or-ack
  conversation_id: bounded-exchange
  reply_to: optional-message-id
  task_id: owning-task
  task_revision: compare-and-set-revision
  inline_body: maximum-4096-bytes
  artifact_refs: []
  requested_action: explicit-or-none
  requires_ack: true-or-false
  dedupe_key: sender-scoped-retry-identity
  expires_at: optional
  hop_count: bounded
```

`agent` is the only stored mailbox recipient. Sending to a team or task
atomically snapshots its authorised membership and creates one immutable
delivery row per recipient. Each delivery records message ID, recipient agent,
mailbox sequence, state, attempt count, claim deadline and acknowledgement
time. Delivery state is `ready`, `claimed`, `acknowledged`, `abandoned` or
`expired`; `delivery-pending` is the derived status for a required delivery that
has not reached a terminal state by its response deadline. Sequence numbers are
monotonic per run and recipient.

`successor-pending` is likewise an orthogonal derived routing disposition, not
a delivery state or receipt counter. It is true exactly when stored state is
`ready`, the row is unclaimed for that recipient, and the recipient has one
valid active lifecycle-delivery owner: one nonfinal custody, one standalone
`open` generation loss, or the exact linked pair of a `recovery-in-progress`
loss and its nonfinal fresh custody. A standalone recovery-in-progress loss or
crossed/multiple unrelated owners is integrity-failure and remains claim-
fenced. This single predicate includes
ready rows already present at the custody delivery cut and rows enqueued after
it. Mailbox/operator projections expose
`routingDisposition: normal|successor-pending`; receipt state/count remains
`ready`. Claim uses the same joined predicate and rejects successor-pending.
Adoption finalises the custody and any linked loss without changing the
delivery row, so the predicate becomes false and the same ready row becomes
claimable. Confirmed lifecycle abandon instead changes every matching
successor-pending ready row to
`abandoned` with the recovery reason and watermark transition in its terminal
transaction. No `successor-pending` column or sixth delivery-state value exists.

Receive claims a delivery for a bounded visibility timeout. A crash before
acknowledgement returns it to ready. Acknowledgement is per delivery and means
that the named agent durably consumed it. A contiguous watermark advances only
past deliveries that are acknowledged, abandoned with a reason, or expired by
policy. Out-of-order acknowledgements do not skip gaps.

`dedupe_key` is unique per run and authenticated sender. It maps to one
immutable audience expansion and payload hash. Reuse with a changed payload or
audience is a conflict. Delivery is at least once; consumers are idempotent.

Task claim, delegation, write-scope transfer, task completion and barrier close
are single SQLite transactions. All predicates are rechecked inside the write
transaction. Budget reservations debit the parent's available ledger balance;
idempotent release cannot increase it above the original grant. Every
transition has a stable command ID and returns the committed result on retry.

## 12. Leases, delegation and barriers

The daemon issues fenced, generation-bearing leases:

- one chair lease per run;
- one owner lease per active task;
- one write-scope lease per canonical path set;
- one adapter-turn lease per fabric-managed provider session. Attached
  interactive sessions have registry and mailbox identity but no fabricated
  external turn control.

Every mutation supplies the expected lease generation. Stale generations fail
closed. Child authority must be a strict or equal subset of its parent for
paths, actions, disclosure, expiry and budget.

Lease expiry or generation change fences fabric mutations only. Before granting
an overlapping successor write-scope or adapter-turn lease, the daemon proves
one of:

1. the predecessor process or turn is terminal and its write capability has
   been revoked;
2. an operating-system sandbox prevents it reaching the successor's scope; or
3. it could produce only immutable patch artifacts and the sole serial applier
   rejects its old generation.

If none is provable, the scope is `quarantined` and no successor writer starts.
Unmanaged interactive or full-access sessions are patch-only unless their
liveness and revocation mechanism is enforced. Lease generation and action ID
are propagated to adapter commands and serial-apply operations.

A subtree leader may close a subtree barrier. Only the chair closes a stage or
run barrier. Closure requires:

- required descendants are terminal, cancelled or explicitly degraded;
- no unresolved provider turn or active write lease remains;
- artifacts and hashes are recorded;
- required checks pass;
- required messages are acknowledged or abandoned with a reason;
- the checkpoint records mailbox cursors and provider resume references;
- human gates are resolved;
- the next owner acknowledges the exact generation and revision.

For the final run barrier, the human acceptance gate takes the place of
next-owner acknowledgement.

Direct filesystem access cannot be perfectly fenced by the daemon. Shared
source retains the serial-applier rule unless write scopes are provably
disjoint and predecessor revocation is enforced.

## 13. Provider adapter contract

Each adapter runs behind a versioned process boundary in the first release.
Adapter failure must not crash the core.

```yaml
adapter_operations:
  registration_required:
    - capabilities
    - status
    - release
    - lookup_action
    - cancel_action
  managed_session_required:
    - spawn
    - send_turn
    - interrupt
    - resume_reference
    - dispatch
  attached_interactive_required:
    - attach
    - status
    - wakeup
    - resume_reference
  optional:
    - steer
    - follow_up
    - compact
    - fork
    - native_subagents
    - enforced_read_only
    - usage_and_cost
    - shared_session_ui
    - verified_boundary_inject
    - compact_in_place
```

Every side-effecting adapter command uses a fabric-generated `action_id`, exact
`adapter_id`, lease generation and immutable payload hash. The daemon-global
provider action identity is the pair `(adapter_id, action_id)`; an action ID may
repeat on another adapter but the same pair may not identify another run or
input. The adapter durably records
`prepared`, `dispatched`, `accepted`, `terminal` or `ambiguous`. The core calls
`lookup_action` after ambiguity and never automatically replays a side-effecting
command unless downstream idempotency for that action ID is proven. Otherwise
the task is quarantined for explicit recovery. The action record commits before
dispatch; its terminal result commits before message acknowledgement.

`lookup_action` applies to every adapter operation with external effects,
including provider-mutating release or wake-up implementations. An adapter may
declare an operation core-only and idempotent only when it does not mutate the
provider session or external state; that declaration is contract-tested.

The scheduler does not assign a role whose control, delivery or recovery
requirements exceed the session's advertised capabilities.

`steer` and `follow_up` execute under the active turn lease held by the turn
initiator; they do not acquire a second generation. Only a new `send_turn`
acquires a new adapter-turn lease. Interactive targets return
`capability_unavailable` for turn-control operations and use mailbox plus
wake-up instead.

Planned adapters:

| Adapter | Intended role | Notes |
|---|---|---|
| Claude Agent SDK | Claude primary, leader or worker | Persistent headless sessions; interactive TUI remains a separate profile |
| Codex app-server | Codex primary, leader or worker | Thread and turn lifecycle; contract-test generated protocol schemas |
| Pi SDK or RPC | Generic API and open-provider workers | Model-neutral worker runtime; not the authority store |
| Agy | Gemini or Antigravity access | Adapter only; no separate provider skill |
| Cursor | Composer and Grok only | Model allow-list remains routing policy |
| Kiro or ACP | Open-model runtime | Capability-discovered, optional and non-blocking |
| Herdr | Pane placement, observation and wake-ups | Never authoritative transport |

Unsupported optional capabilities return a typed `capability_unavailable`
result. The router may choose a compatible substitute only when the existing
model-routing policy permits substitution and records it.

## 14. MCP and client interface

Claude Code and Codex launch separate stdio MCP proxy processes. Each proxy
connects to the same Unix socket and shared daemon. The proxy may safely start
the daemon under a single-instance lock when it is absent.

The operation registry is the sole owner of the current MCP tool set. Every
active agent-principal operation has an exhaustive `tool` or `none`
classification and every `tool` entry owns one stable name. The generated
descriptor/reference artifact, rather than a second list in this document,
records the Stage 2-5 and Spec 05 names. V1 has exactly one descriptor per
operation; constant-bound aliases such as a steer-only provider action or a
release-only lifecycle action are not additional descriptors. A future variant
projection must replace the whole-operation descriptor with a registry-declared
exhaustive, non-overlapping set and cannot silently omit an admitted enum member.

Run creation belongs only to reviewed operator launch custody. There is no
private or agent `createRun` method, and `fabric_run_create` is never an MCP descriptor. The
proxy accepts only an `afc_` agent capability, initialises with
`expectedPrincipalKind: agent` and rejects a bootstrap credential before
advertising tools.

Private local seat provisioning names an expected prior roster generation and
one immutable replacement generation for the exact project/session/run/chair
identity. The database owns the sole active generation per project and revokes
all capabilities belonging to its predecessor in the same transaction that
activates the replacement. Exact current-generation replay is idempotent;
stale, rollback and cross-project attempts fail closed.

The generated read descriptors additionally own these resource templates:

- `fabric://runs/{run_id}/status`
- `fabric://runs/{run_id}/tasks`
- `fabric://runs/{run_id}/agents`
- `fabric://runs/{run_id}/receipts`

Unshipped or registry-classified `none` operations are absent rather than
stubbed. Stage 2 contract tests
verify resource round-trips from both MCP clients. The four URI templates are
MCP-native convenience projections of the same generated run-status, task-list,
agent-list and receipt-list descriptors; they are not another schema owner.
Every surface, including Codex dynamic tools, exposes those four generated read
tools even when it has no resource-template channel.
Subtree-barrier closure by a leader becomes available with teams in Stage 5;
before then `fabric_barrier_close` accepts only chair-owned run or stage scope.

MCP notifications are not assumed to reach every interactive client. Mailbox
state and adapter delivery remain authoritative.

The complete current set is generated from the same closed agent-operation
codecs and principal registry as the public protocol. The standalone MCP proxy
negotiates the authenticated agent protocol before advertising tools; it does not retain
a second hand-written method vocabulary. Operations absent from the negotiated
features or current authority are absent from the advertised tool list, not
present as permissive generic RPC. Inputs and outputs are validated by the
shared codecs before and after the daemon call.

Registry classification is compile-time exhaustive. `registerAgent`,
`rotateCapability` and any other operation whose result still contains a bearer
secret are `none`. Spawn and attach become `tool` only with secret-free public
result codecs and shared custody: the daemon generates the target capability,
persists only its digest and privately hands plaintext to a bridge-provisioning
adapter inside the stable one-effect provider action. The model-visible result
contains agent/action/session identity plus `bridgeState` and
`bridgeGeneration`, never the token. An adapter that cannot provision a bridge
advertises that fact before dispatch; attach may then register a bridge-less
mailbox/wake-up participant with `bridgeState: none`, but neither attach nor
spawn fabricates a live Fabric tool surface. A supported retained bridge must
complete a later provider-originated Fabric call before it is claimed active.
Attach remains registry-classified `tool` regardless of the selected adapter's
bridge capability; `bridgeState` reports the runtime outcome.

Every model-visible result is the exact closed public result codec. Opaque
provider output is replaced by typed contract evidence and/or a digest before
projection. A validated bounded `providerAnswer` remains available only for a
non-review task-bound ephemeral spawn. A certifying review projects its answer
digest and safe parsed result, never raw text. `additionalProperties: true`,
raw provider JSON and copied output schemas are forbidden.

A launched chair receives this same current, principal-scoped MCP operation
surface through the secret-consuming provider-session bridge. Its one-use
attestation operation is also registry-classified `tool`, but only the
launch-attestation feature/grant projects it; standalone proxies cannot see it.
“Private” means grant-scoped and one-use, not registry-exempt. Claude SDK MCP
tools and Codex app-server dynamic tools may use provider-specific transport descriptions, but their Fabric names,
schemas, authority results and receipts are generated from the same descriptors.
The provider session must originate every tool call. The adapter wrapper may
route and validate an attributed call but cannot invoke a Fabric operation on
the model's behalf and report that as session activity. Later turns reuse the
same retained bridge; a resume reference without it exposes no Fabric tools and
follows chair-loss recovery.

## 15. Session lifecycle

The agent may request compaction, rotation or release. The fabric validates
only fabric-managed lifecycle actions. Provider-native automatic compaction and
direct interactive lifecycle commands are external events: prevent them where
a supported policy control exists; otherwise detect and journal them when
possible and reconcile at the next boundary.

```yaml
lifecycle_request:
  action: compact-or-rotate-or-completion-ready-or-release
  agent_id: stable-id
  task_revision: exact-revision
  checkpoint_ref: path-and-sha256
  mailbox_watermark: last-contiguous-disposed-sequence
  acknowledged_above_watermark: []
  in_flight_children: []
  open_work: []
  next_action: exact-action
```

Policy by role:

- chair and primary leaders persist for a run and rotate at barriers or context
  pressure;
- team leaders persist for their task subgraph;
- workers are normally ephemeral;
- independent reviewers start with fresh context;
- the fabric refuses lifecycle requests that clear or release a work-owning
  agent without a valid checkpoint, and marks the agent `degraded` if provider
  session state is found reset without one;
- `compact_in_place` is used only when the adapter advertises it and returns the
  resulting provider-session generation;
- same-full-history attach/resume is crash recovery only and may not satisfy a
  policy-required rotation;
- the portable rotation fallback checkpoints and fences the predecessor,
  reconciles children/leases, starts a genuinely fresh provider context under
  the distinct section 32.20 custody/action, proves adoption, then injects only
  the bounded canonical checkpoint/handoff into that adopted context before
  work resumes; no predecessor transcript/history is resumed or copied;
- a session compacted without a valid checkpoint is `context-unreconciled` and
  cannot close a barrier or retain a write lease until reconciled;
- completion drains or cancels children, releases leases, exports receipts and
  archives registry state;
- provider session deletion requires retention policy or human authority.

## 16. Persistence and retention

SQLite/WAL owns concurrent coordination records: agents, tasks, mailbox events,
cursors, leases, budgets, provider resume references and schema migrations.
Stage 1 isolates synchronous SQLite writes and checkpoints from adapter event
processing so a migration or WAL checkpoint cannot stall provider supervision.

Each project run directory owns:

- assignment and authority envelopes;
- checkpoints and handoffs;
- reports, patches and verification evidence;
- model-routing and adapter receipts;
- final synthesis and human-gate state.

Mailbox bodies are operational state and default to ephemeral retention.
Artifacts referenced by messages retain their project-defined classification.
The fabric never deletes provider-native session files. Unknown or user-owned
files are never pruned.

## 17. Failure handling

| Failure | Required behaviour |
|---|---|
| Daemon restart | Replay committed events and restore cursors. Ordinary provider sessions follow their adapter recovery contract. A launched chair whose volatile bridge is lost is journalled and fenced as chair loss; never re-expose Fabric tools from its resume reference alone. Recovery uses the explicit generation-bound chair-bridge recovery custody below. |
| Duplicate message | Deduplicate by message and action key |
| Unknown provider turn | Reconcile adapter state before retrying any side-effecting action |
| Worker loss | Expire its turn lease, preserve partial artifacts and notify its parent |
| Leader loss | Freeze new grants in its subtree; chair adopts or reassigns with a new generation |
| Chair loss | Require explicit lease takeover and persisted handoff; never silently promote a peer |
| Provider outage | Bound retries; degrade optional families; block required coverage |
| Herdr control or telemetry socket loss | Continue only healthy provider processes; mark `visibility-degraded`; infer no task state from absent telemetry |
| Observed renderer or pane loss | Keep the adapter-owned session; recreate only the renderer and resume its display cursor |
| Interactive TUI or pane-process loss | Freeze delivery and the turn lease; reconcile the provider session; explicitly reattach or rotate with a higher generation |
| Interactive operator edit | Record it where integrations permit; regardless of detection, compare-and-set rejects stale task mutations and forces reconciliation; declare provenance limits honestly |
| Message storm | Apply quotas, hop limits, bounded conversations and no global broadcast |
| Overlapping writes | Reject intersecting leases and verify base revision after writes |
| Store corruption | Stop mutations, preserve the database and require recovery from exports or backup |

## 18. Security and privacy

- The daemon listens only on a per-user Unix socket by default.
- Socket and state directories reject group or world access.
- A discovery token authenticates only a same-user control-plane client; it is
  not an agent-authority credential. Its purpose is to deny access to sandboxed
  worker processes that share the user ID but cannot read the discovery path;
  adapters do not pass it into worker environments.
- On attach, the daemon issues a revocable, run-scoped capability bound to one
  fabric principal, permitted operations, mailbox, authority hash, expiry,
  connection nonce and current lease generation.
- Grants above the client's registered role require chair approval recorded in
  the journal.
- The daemon derives sender, run and authority from authenticated context rather
  than MCP arguments. Chair-only, owner-only and recipient-only access controls
  apply to every tool and resource read.
- Attach, takeover and token rotation are journalled and use compare-and-set
  against the current generation.
- Secrets never appear in configuration, messages, receipts or Herdr pane
  metadata.
- Adapters receive only the environment variables required for their provider.
- Message bodies cannot grant authority. Unrestricted same-user shell access
  may bypass cooperative controls, so receipts distinguish protocol-enforced
  from operating-system-enforced authority.
- Project path resolution rejects traversal, symlink escape and paths outside
  the approved workspace roots.
- Read-only claims distinguish policy-only restrictions from substrate-enforced
  restrictions.
- Remote sockets, WebSocket listeners and external dashboards are disabled in
  the first release.
