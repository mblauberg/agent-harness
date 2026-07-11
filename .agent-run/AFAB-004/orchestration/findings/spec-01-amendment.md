# Spec 01 amendment recommendation

Verdict: amend Spec 01 from v0.3 to v0.4 before runtime work. Spec 05 v1.0
assigns Spec 01 the project-session, operator-authority, scoped-gate, resource,
intake and result-delivery contracts (`docs/specs/05-project-fabric-console.md:21-36`).
The following is the smallest normative delta that makes those contracts
implementable without moving daemon bootstrap, migration or recovery ownership
out of Spec 04.

## Placement and conformance

Add a **Project Console v1 extension** to section 5.1 rather than inventing a
retroactive Stage 6. Stages 1-5 retain their existing conformance meaning; the
extension passes only when FR-020-FR-027, NFR-011-NFR-014 and AC-014-AC-020
below pass. Update the header to `Version: 0.4`, `Date: 11 July 2026`, and state
that the amendment is approved through Spec 05 v1.0 while implementation and
final human acceptance remain pending.

Add the entity text below after section 10, extend the existing core-record
section 11, replace the gate/barrier rules in section 12, extend the public
client surface in section 14, and add the requirements and scenarios to
sections 22-24. Section 16 shall list the new records as Fabric SQLite state;
section 18 shall own operator authorisation; section 19 shall project their
revisions and audit evidence; section 20 shall adopt the hierarchical resource
ledger.

## Proposed normative text

### Project sessions, coordination runs and workstreams

The Fabric shall persist a `project_session` before creating its first
coordination run. A project session is an authority and lifecycle container,
not a chair. Every coordination run belongs to exactly one project session and
retains exactly one fenced chair generation.

```yaml
project_session:
  project_session_id: stable-id
  project_ref: canonical-trusted-project-id
  project_generation: exact-generation
  topology_mode: coordinated-or-independent
  authority_ref: immutable-envelope-hash
  budget_ref: root-session-resource-budget
  launch_packet_ref: path-and-sha256
  state: revisioned-project-session-state
  revision: compare-and-set-integer
  generation: takeover-and-capability-fence
  created_by_operator_principal_id: stable-id
  expires_at: bounded-expiry

coordination_run:
  run_id: stable-id
  project_session_id: owning-session
  chair_agent_id: exactly-one
  chair_generation: fenced-generation
  authority_ref: narrowing-envelope-hash
  budget_ref: run-resource-budget
  state: active-or-quiescing-or-closed-or-cancelled-or-failed-or-quarantined-or-recovery-required
  revision: compare-and-set-integer

workstream:
  workstream_id: stable-id
  project_session_id: owning-session
  coordination_run_id: accountable-run
  fabric_task_id: owning-task
  lead_agent_id: bounded-lead-not-chair
  delivery_run_id: canonical-delivery-run-reference
  delivery_run_digest: optional-current-digest
  revision: compare-and-set-integer
```

Normal project-session states are `draft -> awaiting_launch -> launching ->
active -> quiescing -> awaiting_acceptance -> closed`. Exceptional states are
`launch_failed`, `launch_ambiguous`, `reconciling`, `visibility_degraded`,
`recovery_required`, `quarantined` and `cancelled`. `closed` and `cancelled`
are terminal. `launch_failed` becomes terminal only through an explicit
cancel/failure terminalisation; it may otherwise be revised and relaunched.
Every transition shall compare and increment `revision` in the same transaction
as its membership checks. Session generation changes only on authority rotation
or takeover and fences prior operator and chair-facing grants. Coordination-run
`closed`, `cancelled` and `failed` are terminal; `quarantined` and
`recovery-required` remain non-terminal until explicitly reconciled or
terminalised.

In `coordinated` mode, a project session has one non-terminal coordination run
and its workstreams have leads under that run's chair. In `independent` mode,
each workstream belongs to its own coordination run and chair; no authority or
barrier relationship is inferred between runs. No mode permits two concurrent
chairs for one coordination run.

`project_session_membership` shall use typed, same-session references for every
coordination run, workstream/delivery run, lease, provider action, required
message, artifact obligation, gate and scoped barrier. It shall not be an
opaque JSON list. Entering `quiescing` freezes new membership.
`awaiting_acceptance` requires every member terminal or explicitly abandoned
with reason, every required result delivery and artifact reconciled, no active
or quarantined lease/provider action, and every applicable scoped barrier
closed. `closed` additionally requires exact final-acceptance evidence or an
explicit cancel/failure path. Concurrent membership and close/reopen mutations
shall use compare-and-set revisions.

### Human operator principals and commands

An operator is a distinct authenticated principal and shall never reuse an
agent, lead or chair identity.

```yaml
operator_principal:
  operator_principal_id: stable-id
  principal_kind: human-operator
  project_ref: exact-project
  generation: fenced-generation
  input_provenance_binding: authenticated-channel-attestation
  state: active-or-revoked

operator_capability:
  capability_id: stable-id
  token_hash: secret-derived-hash-only
  operator_principal_id: exact-principal
  project_ref: exact-project
  project_generation: exact-generation
  project_session_id: optional-only-for-pre-session-launch
  project_session_generation: required-for-session-mutations
  actions: subset-of-read-decide-steer-pause-cancel-launch-takeover-external-effect
  expires_at: no-later-than-session-expiry
  revoked_at: optional
  takeover_binding: optional-handoff-sha256-chair-generation-and-expected-revision
```

A project-bound `launch` capability may create a reviewed session before a
session ID exists. Every other session mutation requires the exact session ID
and generation. Action sets are independently revocable; possession of
`decide` does not imply `launch`, `takeover` or `external-effect`.

Every operator command shall include stable `command_id`, principal and
capability IDs and generations, exact project/session, action, expected target
revision, provenance, payload hash and any consequential-decision preview
digest. The transaction journal shall record before and after revisions/state,
linked evidence and result. Retry of the same command and payload returns the
committed result; changed payload, stale revision, absent/expired/revoked
capability, wrong project/session/generation or insufficient action fails
closed. Takeover additionally requires its bound handoff digest, prior chair
generation and compare-and-set revision.

### Scoped gates

Replace identifier-only task gates with a first-class revisioned `gate`:

```yaml
gate:
  gate_id: stable-id
  project_session_id: owning-session
  coordination_run_id: owning-run
  scope_kind: task-or-subtree-or-run-or-release
  affected_task_ids: non-empty-typed-set
  dependency_revision: exact-task-graph-revision
  blocked_operation_ids: typed-operation-set
  enforcement_points: subset-of-task-readiness-operation-scoped-barrier
  question: exact-question
  reason: required
  options: bounded-list
  recommendation: explicit-or-none
  consequences: required
  evidence_refs: typed-path-and-digest-list
  revision: compare-and-set-integer
  approver_ref: required-principal-or-policy
  deadline: optional
  timeout_default: never-approve
  status: pending-or-approved-or-rejected-or-deferred-or-cancelled-or-superseded
```

Gate creation/resolution and task-dependency changes shall be transactional.
Before task claim/start/resume, the daemon evaluates applicable
`task-readiness` gates against the exact dependency revision. Before a named
operation it evaluates `operation` gates. Before barrier closure it evaluates
only gates applicable to that scoped barrier. A `subtree` gate blocks the named
root and dependency descendants; unrelated siblings remain runnable. A
rejected or deferred gate remains blocking until an authorised revision,
replacement or cancellation makes the affected operation inapplicable. No
deadline auto-approves.

Legacy `task_human_gates` shall migrate to `task`-scoped gates with
`task-readiness` and `scoped-barrier` enforcement. Migration shall not infer a
run or release gate.

### Hierarchical resource authority

Replace the team-only budget owner shape with one resource ledger spanning
`project -> project-session -> coordination-run -> team -> agent`.

```yaml
resource_budget:
  budget_id: stable-id
  parent_budget_id: optional
  scope_kind: project-or-project-session-or-coordination-run-or-team-or-agent
  scope_id: exact-owner
  state: active-or-usage-unknown-or-released

resource_budget_dimension:
  unit_key: versioned-unit
  hard_limit: non-negative-integer-or-none
  advisory_limit: non-negative-integer-or-none
  used: non-negative-integer
  reserved: non-negative-integer
  usage_unknown: boolean

resource_reservation:
  reservation_id: stable-id
  budget_id: admitting-leaf
  action_id: exact-dispatch-or-membership-action
  amounts: typed-unit-map
  state: reserved-or-consumed-or-released-or-ambiguous
  generation: retry-fence
```

Child budgets shall only narrow their parent. Admission shall atomically
reserve every affected ancestor before dispatch so concurrent runs cannot
overbook a project or session. Completion, cancellation and reconciled
ambiguity shall consume or release the same stable reservation idempotently.
Unknown hard-dimension usage shall be projected as unknown and shall reject a
new provider turn whenever remaining ancestor capacity cannot be proved;
already-authorised in-flight work may reach its bounded terminal state.
Unlike unit keys never aggregate. Reads expose hard/advisory limit, used,
reserved, remaining and unknown at every level.

### Revisioned task intake

```yaml
intake:
  intake_id: stable-id
  project_ref: exact-project
  project_session_id: optional-until-launch
  state: draft-or-awaiting-chair-or-discussing-or-awaiting-human-or-accepted-or-deferred-or-cancelled
  revision: compare-and-set-integer
  intent: bounded-human-input
  plan_ref: optional-path-and-sha256
  artifact_refs: typed-path-and-digest-list
  gate_ids: typed-set
  conversation_id: optional-stable-exchange
  chair_request_message_id: optional-correlated-request
  created_by_operator_principal_id: stable-id
```

Every intake mutation shall supply the expected revision. `Discuss/scoping
first` shall atomically update the intake and commit its correlated request,
intake revision, gate and artifact references before any Herdr wake/focus.
Chair replies and revised plan/artifact digests update the same intake.
Duplicate submission has one effect; daemon/provider restart or compaction
resumes that stable item rather than creating another discussion.

### Result delivery and atomic assignment completion

Mailbox delivery and request-result delivery are distinct obligations.

```yaml
result_delivery:
  callback_id: stable-id
  project_session_id: owning-session
  coordination_run_id: owning-run
  task_id: exact-task
  task_revision: expected-or-terminal-revision
  request_message_id: correlated-request
  request_revision: exact-revision
  reply_message_id: optional-until-result-commit
  reply_revision: optional-until-result-commit
  requester_agent_id: exact-consumer
  requester_provider_session_generation: exact-generation
  response_deadline: required
  state: pending-or-claimed-or-provider-accepted-or-consumed-or-overdue-or-abandoned
  claim_generation: retry-fence
  claim_deadline: optional
  provider_action_id: optional-stable-injection-action
  abandoned_reason: required-when-abandoned
```

`pending -> claimed -> provider-accepted -> consumed` is the normal path.
The response deadline moves an unresolved obligation to `overdue`, alerts the
chair and leaves its dependent barrier open. Only an explicit same-action retry
may advance the claim generation and return it to `pending`; reassignment or
abandonment records a reason and fences the prior generation. A late reply is
linked evidence but cannot complete reassigned or abandoned work. Console
projection, pane state, scrollback, wake-up and mailbox acknowledgement never
consume this obligation.

Add two atomic protocol operations:

1. `fabric_task_request` commits the task, correlated request message and its
   immutable recipient deliveries, response deadline, stable callback and
   dependent-barrier link before any provider or Herdr wake-up.
2. `fabric_task_complete_with_reply` compare-and-set validates task owner,
   owner-lease generation, task/request revisions and callback generation, then
   commits the correlated reply, terminal task result, artifact/result refs and
   pending callback/outbox effect in one SQLite transaction. A transactional
   outbox is permitted only if it exposes the same all-or-nothing invariant.

Add typed claim, provider-accept, consume, same-action retry, reassign and
abandon operations. Every operation uses a stable command/action ID and returns
the committed result on retry. Crash recovery shall expose either the complete
logical effect or none of it, never a reply without terminal task state or a
terminal task without its callback.

## Requirements to append

- **FR-020 (Project Console v1):** Persist project sessions and typed
  membership before their first coordination run; preserve exactly one chair
  generation per run and the coordinated/independent topology invariants.
- **FR-021:** Authenticate operator principals separately from agents and
  authorise each revision-bound action through an exact project/session,
  generation, expiry and action capability.
- **FR-022:** Enforce revisioned task, subtree, run and release gates at the
  declared readiness, operation and scoped-barrier points without blocking
  unrelated siblings.
- **FR-023:** Atomically reserve and reconcile every configured resource
  dimension across project, session, run, team and agent ancestors.
- **FR-024:** Persist one revisioned intake across discussion, restart and
  compaction with idempotent correlated chair messaging.
- **FR-025:** Commit answer-bearing task assignment as task, request and result
  obligation before wake-up.
- **FR-026:** Commit reply, terminal task result and pending result delivery
  atomically or through an equivalent transactional outbox.
- **FR-027:** Persist and recover result-delivery claims, deadlines, retries,
  reassignment, abandonment and consumption independently of mailbox delivery.
- **NFR-011 (security):** Every operator mutation shall reject absent, expired,
  revoked, wrong-project, wrong-session, wrong-generation and
  action-insufficient capabilities.
- **NFR-012 (reliability):** Duplicate and crash-replayed intake, gate, session,
  request, completion and delivery commands shall have one durable effect.
- **NFR-013 (auditability):** Operator commands shall record authenticated
  actor, provenance, command ID, exact revisions, before/after state and linked
  evidence without capability values.
- **NFR-014 (portability):** These entities and operations belong to the public
  Fabric protocol and shall work without Console, Herdr or GitHub.

## Acceptance scenarios and tests

- **AC-014, project lifecycle/topology:** create the session before any run;
  prove one chair in coordinated mode and distinct chairs/no implicit authority
  in independent mode; race membership against quiesce/close and show stale CAS
  loses; restart every lifecycle state; refuse acceptance/close with each member
  kind unresolved.
- **AC-015, operator fencing:** positive tests for each separated action;
  negative matrix for absent, expired, revoked, wrong-project, wrong-session,
  wrong-principal/session generation and insufficient action; takeover fails
  without the exact handoff digest, old chair generation and expected revision.
- **AC-016, scoped gates:** at each enforcement point block the affected task,
  descendants, named operation or barrier; prove an unrelated sibling remains
  claimable and run closure evaluates only the union of applicable scoped
  barriers; race dependency/gate revisions and fail stale commands.
- **AC-017, resource admission:** race concurrent runs against a shared project
  and session limit for every configured unit; exactly one over-capacity
  admission fails; crash/restart reservation, release, ambiguous and unknown
  usage paths; verify honest used/reserved/remaining/unknown projection.
- **AC-018, intake continuity:** duplicate `Discuss/scoping first`, then restart
  daemon and requester and compact the chair; observe one intake, one correlated
  request and monotonic revisions through reply, plan update and acceptance.
- **AC-019, atomic request/completion:** inject crashes before and after every
  write boundary of both atomic operations; observe no wakeable request without
  its task/obligation and no reply, terminal task or callback without the other
  two; retry returns the same IDs and effect.
- **AC-020, result delivery:** prove safe-boundary claim/accept/consume,
  requester restart/compaction, idle wake versus busy non-interruption,
  deadline/overdue, same-action retry, reassignment, abandonment and late reply;
  dependent barriers stay open and Console/pane reads never consume.

Static/schema tests shall reject cross-project/session foreign keys, invalid
state transitions, untyped gate enforcement values and resource unit mismatch.
Integration tests shall exercise the public protocol without Console or Herdr.
Spec 04 shall own the additive migration, startup reconciliation and global
daemon liveness/stop tests that consume these Spec 01 terminal-state contracts.

## Existing conflicts the amendment resolves

- `runs` has no project-session link, lifecycle state, revision or chair
  generation (`runtime/agent-fabric/migrations/0001-core.sql:14-20`).
- capabilities and the command journal are agent/run-only; they cannot express
  a distinct operator or revision-bound before/after audit
  (`0001-core.sql:104-112,184-192`).
- task gates contain only task, ID, status and evidence, while barrier closure
  checks every task gate in its selected task set
  (`0001-core.sql:476-484`; `src/core/fabric.ts:3720-3733`).
- budgets are run/team-owned and therefore cannot prevent aggregate project or
  session overbooking (`0001-core.sql:415-437`).
- no intake or result-delivery record exists; mailbox `deliveries` has different
  consumption semantics (`0001-core.sql:114-156`).
- task creation, message send and terminal task update are separate public
  actions; `updateTask` can terminalise a task without a reply/callback
  (`src/core/fabric.ts:1636-1736,1907-1931`). The existing command journal gives
  a sound transaction/idempotency primitive (`src/application/command-journal.ts:77-105`)
  but must accept operator principals and the new composite operations.
