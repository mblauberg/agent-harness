# Agent Fabric ownership and topology

## Authority and team topology

The system combines four structures:

```text
authority:       one rooted supervisor tree
work:            one task dependency graph
communication:   durable addressable mailboxes
evidence:        immutable project artifacts by path and hash
```

Stage 5 supports one chair, up to four leaders and up to five workers per leader. The schema is recursive, but Stage 5 policy limits the depth to two levels below the chair.

Each agent has one authority parent per run. It may belong to multiple bounded discussion groups. Leaders own disjoint task subgraphs. A leader council is advisory; every task, stage and decision has one named owner.

Native subagents are either:

- **opaque children**, managed by the provider-native parent and counted
  against its budget; or
- **registered children**, given fabric identity because they need direct
  task ownership, cross-team messages or durable reassignment.

An agent cannot be managed simultaneously as both an opaque native child and a registered fabric child.

## Core records

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

All quantities are non-negative integers; money uses provider-currency microunits. A child reservation atomically debits the parent's available balance. Consumption draws from the reservation. Idempotent release returns only unused reserved units and cannot raise the parent above its original grant. Usage unknown for a hard dimension freezes further reservations on that dimension until reconciled. Unknown advisory usage may continue only with an estimate and a degraded receipt. Limits in different currencies or provider token units are not silently combined.

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

`agent` is the only stored mailbox recipient. Sending to a team or task atomically snapshots its authorised membership and creates one immutable delivery row per recipient. Each delivery records message ID, recipient agent, mailbox sequence, state, attempt count, claim deadline and acknowledgement time. Delivery state is `ready`, `claimed`, `acknowledged`, `abandoned` or `expired`; `delivery-pending` is the derived status for a required delivery that has not reached a terminal state by its response deadline. Sequence numbers are monotonic per run and recipient.

`successor-pending` is likewise an orthogonal derived routing disposition, not a delivery state or receipt counter. It is true exactly when stored state is `ready`, the row is unclaimed for that recipient, and the recipient has one valid active lifecycle-delivery owner: one nonfinal custody, one standalone `open` generation loss, or the exact linked pair of a `recovery-in-progress` loss and its nonfinal fresh custody. A standalone recovery-in-progress loss or crossed/multiple unrelated owners is integrity-failure and remains claim- fenced. This single predicate includes ready rows already present at the custody delivery cut and rows enqueued after it. Mailbox/operator projections expose `routingDisposition: normal|successor-pending`; receipt state/count remains `ready`. Claim uses the same joined predicate and rejects successor-pending. Adoption finalises the custody and any linked loss without changing the delivery row, so the predicate becomes false and the same ready row becomes claimable. Confirmed lifecycle abandon instead changes every matching successor-pending ready row to `abandoned` with the recovery reason and watermark transition in its terminal transaction. No `successor-pending` column or sixth delivery-state value exists.

Receive claims a delivery for a bounded visibility timeout. A crash before acknowledgement returns it to ready. Acknowledgement is per delivery and means that the named agent durably consumed it. A contiguous watermark advances only past deliveries that are acknowledged, abandoned with a reason, or expired by policy. Out-of-order acknowledgements do not skip gaps.

`dedupe_key` is unique per run and authenticated sender. It maps to one immutable audience expansion and payload hash. Reuse with a changed payload or audience is a conflict. Delivery is at least once; consumers are idempotent.

Task claim, delegation, write-scope transfer, task completion and barrier close are single SQLite transactions. All predicates are rechecked inside the write transaction. Budget reservations debit the parent's available ledger balance; idempotent release cannot increase it above the original grant. Every transition has a stable command ID and returns the committed result on retry.

## Session lifecycle

The agent may request compaction, rotation or release. The fabric validates only fabric-managed lifecycle actions. Provider-native automatic compaction and direct interactive lifecycle commands are external events: prevent them where a supported policy control exists; otherwise detect and journal them when possible and reconcile at the next boundary.

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
  agent without a valid checkpoint, and marks the agent `degraded` if provider   session state is found reset without one;
- `compact_in_place` is used only when the adapter advertises it and returns the
  resulting provider-session generation;
- same-full-history attach/resume is crash recovery only and may not satisfy a
  policy-required rotation;
- the portable rotation fallback checkpoints and fences the predecessor,
  reconciles children/leases, starts a genuinely fresh provider context under   the distinct the lifecycle-custody contract custody/action, proves adoption, then injects only   the bounded canonical checkpoint/handoff into that adopted context before   work resumes; no predecessor transcript/history is resumed or copied;
- a session compacted without a valid checkpoint is `context-unreconciled` and
  cannot close a barrier or retain a write lease until reconciled;
- completion drains or cancels children, releases leases, exports receipts and
  archives registry state;
- provider session deletion requires retention policy or human authority.

`lease` and `lifecycleRow` are tagged unions, never nullable bags:

~~~yaml
lease:
  oneOf:
    - leaseKind: task
      required: [leaseKind, leaseId, ownerAgentId, generation, state,
        taskId, taskRevision, expiry, revision]
      stateEnum: [active, frozen, released, revoked, abandoned]
      expiryType: RFC3339-date-time-or-null
      ids: [leaseId, ownerAgentId, taskId]
      positive: [generation, taskRevision, revision]
    - leaseKind: write
      required: [leaseKind, leaseId, ownerAgentId, generation, state,
        pathScopeDigest, expiry, revision]
      stateEnum: [active, quarantined, lifecycle-quarantined, released,
        revoked-abandoned, expired]
      expiryType: RFC3339-date-time-or-null
      ids: [leaseId, ownerAgentId]
      positive: [generation, revision]
      digests: [pathScopeDigest]

lifecycleRow:
  oneOf:
    - sourceKind: custody
      required: [sourceKind, agentId, custodyId, actionRef, state,
        disposition, sourceProviderGeneration, sourcePrincipalGeneration,
        sourceBridgeGeneration, targetProviderGeneration,
        targetPrincipalGeneration, targetBridgeGeneration, checkpointDigest,
        terminalEvidenceDigest]
      nullOnly: [terminalEvidenceDigest]
      stateEnum: [awaiting-boundary, prepared, dispatched, accepted, ambiguous,
        provider-terminal, committing, finalized]
      dispositionEnum: [adopted, no-effect, quarantined, superseded, abandoned, null]
      conditional: disposition is null before finalized and is nonnull exactly
        at finalized; terminalEvidenceDigest is null in awaiting-boundary,
        prepared, dispatched, accepted and ambiguous and is nonnull in provider-
        terminal, committing and finalized
      actionRef: ProviderActionRefV1
      ids: [agentId, custodyId]
      positive: [sourceProviderGeneration, sourcePrincipalGeneration,
        sourceBridgeGeneration, targetProviderGeneration,
        targetPrincipalGeneration, targetBridgeGeneration]
      digests: [checkpointDigest]
      nullableDigests: [terminalEvidenceDigest]
    - sourceKind: generation-loss
      required: [sourceKind, agentId, generationLossId, lossKind,
        recoveryActionRef, abandonKind, state, disposition,
        oldProviderGeneration, newProviderGeneration,
        oldContextRevision, newContextRevision, checkpointState,
        checkpointDigest, lossEvidenceDigest, terminalEvidenceDigest]
      nullOnly: [recoveryActionRef, oldContextRevision, checkpointDigest,
        terminalEvidenceDigest]
      lossKindEnum: [generation-advance, context-advance]
      stateEnum: [open, recovery-in-progress, recovered-adopted, abandoned]
      dispositionEnum: [recovered-adopted, abandoned, null]
      abandonKindEnum: [none, direct-open, recovery-attempt]
      checkpointStateEnum: [absent, invalid, last-validated]
      conditional: checkpointDigest nonnull iff last-validated; generation-
        advance requires newProviderGeneration greater than old; context-advance
        requires newProviderGeneration equal oldProviderGeneration, nonnull
        oldContextRevision and newContextRevision greater than oldContextRevision;
        disposition is null for open/recovery-
        in-progress, exactly recovered-adopted for recovered-adopted and exactly
        abandoned for abandoned; terminalEvidenceDigest is nonnull exactly in
        the two terminal states; recoveryActionRef is null and abandonKind none
        in open, nonnull and abandonKind none in recovery-in-progress and
        recovered-adopted, null with direct-open or nonnull with recovery-attempt
        in abandoned
      recoveryActionRef: ProviderActionRefV1-or-null
      ids: [agentId, generationLossId]
      positive: [oldProviderGeneration, newProviderGeneration]
      nonnegative: [newContextRevision]
      nullableNonnegative: [oldContextRevision]
      digests: [lossEvidenceDigest]
      nullableDigests: [checkpointDigest, terminalEvidenceDigest]
~~~

### Project-session ownership and topology

The daemon shall persist a project session before creating its first coordination run. A project session records:

```yaml
project_session:
  project_session_id: stable-id
  project_id: stable-id-bound-to-one-canonical-root
  mode: coordinated-or-independent
  state: draft-or-awaiting_launch-or-launching-or-active-or-quiescing-or-awaiting_acceptance-or-closed-or-exceptional
  revision: compare-and-set-integer
  generation: authority-and-takeover-fence
  authority_ref: immutable-envelope-hash
  budget_ref: root-project-session-budget
  launch_packet_ref: path-and-sha256
  membership_revision: compare-and-set-integer
  origin:
    operator_id: required-current-operator

coordination_run:
  run_id: stable-id
  project_session_id: owning-session
  chair_agent_id: exactly-one
  chair_generation: fenced-generation
  authority_ref: narrowing-envelope-hash
  authority_revision: compare-and-set-integer
  git_allowlist_epoch: monotonic-authority-fence
  git_allowlist_digest: null-or-exact-sha256
  budget_ref: run-resource-budget
  state: revisioned-run-state
  revision: compare-and-set-integer

workstream:
  workstream_id: stable-id
  project_session_id: owning-session
  coordination_run_id: accountable-run
  fabric_task_id: owning-task
  lead_agent_id: bounded-lead-not-chair
  delivery_run_id: canonical-delivery-run-reference
  revision: compare-and-set-integer
```

Membership rows explicitly bind coordination runs, delivery runs/workstreams, tasks, leases, provider actions, required messages, artifact obligations, gates and scoped barriers to the project session. `quiescing` freezes new membership. A transition to `awaiting_acceptance` rechecks in the same transaction that every run, workstream and task is terminal or explicitly abandoned with reason; every required message and artifact obligation is reconciled; no active lease, provider action or unresolved operator-effect custody remains; every typed Git custody/reservation is machine-terminal or has the exact human-resolution record in the typed-Git effect contract; and every applicable scoped barrier is closed. `closed` additionally needs the exact acceptance or cancel/failure terminal path. An accepted path's `acceptance_ref` is not an arbitrary receipt digest: it is the canonical digest of the complete sorted set of approved, human- required final-acceptance gates in the same project session, exactly one for each run currently in `awaiting_acceptance`. Each binding includes gate ID, owning run, gate revision, approved status, persisted resolution and evidence references. Every gate must be run-scoped, enforce the exact `fabric.v1.project-session.close` operation, name the authenticated human operator sentinel or the resolving operator, and contain a typed-Console or provider-native explicit confirmation. The daemon recomputes the digest from current durable state in the close transaction. Missing, stale, substituted, duplicate, extra, cross-run, cross-session or non-human acceptance fails closed. Historical terminal runs require no new acceptance gate and retain their terminal disposition. Thus one run's authority can never accept another nonterminal independent run. Such a final-close gate may be approved only while its session and owning run are `quiescing`, after every task, non-chair lease, provider action, required result/message, artifact obligation, non-final gate, barrier and unrelated operator effect is settled. Active-session approval fails closed. Quiescing forbids new work and new membership, so an approved gate cannot outlive a subsequent source mutation; only source- valid settlement remains permitted.

Every exit from `quiescing` other than the exact receipt-bound transition to `awaiting_acceptance`, and every exit from `awaiting_acceptance` other than accepted close, invalidates the current acceptance cycle. Returning `quiescing -> active`, reopening `awaiting_acceptance -> active`, or entering a reconciliation/recovery/quarantine detour supersedes every prior gate that names `fabric.v1.project-session.close`, whether pending, deferred or approved, and terminalises any active membership for those gates. A later drain/close requires newly created gates and fresh explicit human resolutions. No prior acceptance reference or confirmation may authorise work or evidence changed after that exit. Pending or deferred gates receive a closed `system-supersession` terminal disposition containing a typed durable cause (`operator-command`, `chair- bridge-loss` or `system-recovery`) with its exact reference, reason and timestamp. It carries no operator ID, approval or evidence authority and is forbidden for approved or rejected status. An already human-resolved gate retains its human resolution as historical audit evidence when its status becomes superseded. The `system-supersession` result arm is exposed only when the connection negotiates `gate-system-supersession.v1`. A peer without that additive result- shape feature receives `FEATURE_UNAVAILABLE` before any read/replay response would contain the new arm; existing human-resolution v1 shapes remain byte- compatible.

Public project-session transition cannot enter `quiescing`; the typed, receipt-producing project-drain custody is its sole owner and changes the session and every affected run atomically. Public transitions among `active`, `visibility_degraded`, `reconciling`, `recovery_required` and `quarantined` likewise compare-and-set the session, affected runs and current chair leases in one transaction. Work-admitting targets keep the current chair lease active; reconciliation, recovery and quarantine freeze it. Reactivation requires a live current-chair capability plus exact active required run and current-chair- lease membership. A durable lost launched-chair bridge reserves every lifecycle departure to chair-recovery custody. Legacy imports create both required run and current-chair-lease membership; an additive migration repairs earlier source-invalid membership without rewriting migration history.

Each coordination run has exactly one generation-fenced chair. Every chair generation change atomically revokes the prior chair lease, abandons its membership with the exact takeover/recovery reason and binds the successor lease as the sole active required chair-lease membership; takeover or bridge recovery cannot leave the new current lease outside project- session membership. Coordinated mode has exactly one non-terminal coordination run and may contain many delivery workstreams under it, but their leads are not additional chairs. A concurrent attempt to create a second non-terminal run fails. Independent mode also has exactly one non-terminal coordination run per project session; a project view represents concurrent unrelated runs as separate independent project sessions, each with its own chair and session authority. Historical terminal run rows may remain in either mode without becoming live authority. A project session never implies cross-run authority.

SQLite enforces at most one non-terminal coordination run per project session in either mode and at most one `active` chair lease per run. Frozen predecessor leases may coexist only inside a bounded takeover/recovery transaction; a forward migration deterministically revokes non-current predecessors and repairs their membership, but refuses ambiguous duplicate current runs. A cancelled or failed project close is valid only from `draft`, `awaiting_launch`, terminal `launch_failed`, or `awaiting_acceptance`; the last case first supersedes the whole acceptance cycle. Accepted close still requires `awaiting_acceptance`. Unsafe live, ambiguous, recovery or quarantine states must use their typed lifecycle owner instead of generic close.

Clean close, stop and recovery-abandon commit an immutable launched-chair bridge-retirement record only after the exact run/session is terminal, its current chair lease and bridge capability are revoked and its agents are archived. Active child bridges atomically become `none` with their provider and capability binding cleared. Startup and live supervision ignore only a valid retirement record; a lost/pending bridge remains recovery-owned. Durable retirement commits before best-effort volatile transport removal, so crash can leak neither authority nor a fabricated loss. Recovery-abandon additionally requires every unrelated task, workstream, lease, provider action, result, message, gate, barrier, resource and external effect settled, abandons the exact run/current-chair memberships with reason, revokes remaining capabilities, archives agents and advances membership revision once.

A retained launched-chair handoff is not the generic database-only takeover. It uses typed live-handoff custody bound to the current bridge generation, handoff artifact, successor retained child bridge, provider contract and successor promotion observation. It revokes the predecessor capability/lease, promotes and rebinds the exact provider bridge, installs one successor chair lease/membership and advances session/run generations atomically. Missing or ambiguous promotion remains fenced; loss recovery never fabricates a graceful handoff.

In coordinated mode `fabric.v1.workstream.create` is a chair-only `workstreams.v1` operation. One transaction creates or reuses the root Fabric task/team, narrowed lead authority and budget, hierarchical resource scope, workstream row and required project-session membership. It creates no run, chair or cross-session authority. Terminal workstream state derives from its root task/team sources. Independent concurrency instead creates another project session.

Exceptional project-session states are `launch_failed`, `launch_ambiguous`, `reconciling`, `visibility_degraded`, `recovery_required`, `quarantined` and `cancelled`. `closed` and `cancelled` are terminal. `launch_failed` becomes terminal only through an explicit cancel/failure transition. Ambiguous, recovery and quarantine states remain non-terminal. Session generation changes only on authority rotation or takeover and fences prior operator and chair-facing grants.

### Local operator bootstrap and reviewed chair launch

`projectSessionCreate` creates only a Fabric-owned draft and has no provider, process or Git effect. Before that call, the private machine-local control plane may provision the first operator for an exact trusted project root. This is not a public operator operation and does not make the bootstrap principal an operator. The daemon shall:

- recheck the canonical root against the machine-local workspace-trust
  registry and bind one deterministic project identity plus the exact current   trust-record digest to that root;
- derive the local operator subject from the trusted launcher context, create
  or revalidate its generation-fenced principal, and issue only the requested   bounded project capability;
- require exact idempotent replay or an explicit generation-bound rotation
  through `OperatorStore.rotatePrincipal`, which increments the principal   generation and revokes every prior-generation capability;
- persist only capability hashes and return plaintext launch credentials once
  over the private local channel; and
- never write the operator credential to discovery files, audit journals,
  project artifacts, Console state, projections or rendered output.

The initial capability is `project-launch` kind and can create only a draft session or a project-bound intake. It cannot authorise a session-targeted command. After draft creation, the private control plane method `issueLocalOperatorSessionCapability` rechecks the same local subject, project trust digest, session ID and generation, then issues a session-bound capability carrying only the requested actions, including `launch` when requested. Its expiry may not exceed the project capability or the reviewed launch-envelope expiry. Phase-two launch always authenticates with this session capability and therefore uses the existing session-generation fence; the public session-create result never contains a credential.

Starting the first coordination chair is a separate consequential action over an existing `awaiting_launch` project session. `projectSessionTransition` may prepare `draft -> awaiting_launch`; that transition requires the reviewed launch-packet reference, atomically replaces the session's current packet path/digest and increments its revision. `ProjectSessionTransitionRequest` therefore adds `launchPacketRef`, required only for `draft -> awaiting_launch` and forbidden for every other public transition. The public operator path shall reject every transition into or out of `launching` and every transition into or out of `launch_ambiguous`. Public `operatorActionReconcile` shall reject a launch intent. Only the daemon-internal launch-custody service may enter or leave a launch-owned state or reconcile its provider action.

The operator action protocol adds `ProjectSessionLaunchIntent` to `OperatorActionIntent` and maps it to the `launch` capability. Its closed wire shape is:

```yaml
project_session_launch:
  project_id: exact-project
  project_session_id: existing-awaiting-launch-or-proved-failed-session
  expected_project_revision: compare-and-set-integer
  expected_session_revision: compare-and-set-integer
  expected_session_generation: fenced-generation
  trust_record_digest: exact-sha256
  launch_packet_ref: exact-path-and-sha256
  authority_ref: exact-sha256
  budget_ref: exact-reference
  resource_plan_ref: exact-path-and-sha256
  provider_adapter_id: registered-adapter
  provider_action_id: stable-launch-attempt-id
  provider_contract_digest: exact-sha256
  resource_state_digest: exact-sha256
  retry_of:
    provider_adapter_id: exact-prior-adapter
    provider_action_id: exact-prior-action
```

`retry_of` is absent for a first attempt and required only after custody has proved the referenced attempt failed before provider acceptance. It is a closed object and is never accepted for an ambiguous, active or merely unobserved attempt. Unknown keys are rejected.

`launch_packet_v1` is a closed, schema-versioned artifact:

```yaml
launch_packet_v1:
  schema_version: 1
  project_id: exact-project
  project_session_id: exact-session
  run_id: globally-unique-run
  chair_agent_id: exactly-one-chair
  project_run_directory: canonical-root-relative-path
  topology_mode: coordinated-or-independent
  budget_ref: exact-session-budget-ref
  resource_plan_ref: exact-path-and-sha256
  chair_authority: AuthorityEnvelopeV2
  provider:
    adapter_id: exact-registered-adapter
    action_id: stable-launch-attempt-id
    contract_digest: exact-sha256
    input_schema_id: registered-strict-schema
    input: strict-adapter-launch-input
```

`launch_resource_plan_v1` is a separate closed artifact:

```yaml
launch_resource_plan_v1:
  schema_version: 1
  project_id: exact-project
  project_session_id: exact-session
  run_id: exact-packet-run
  budget_ref: exact-session-budget-ref
  scopes:
    project:
      scope_id: stable-id
      limits: qualified-non-negative-resource-amounts
    project_session:
      scope_id: stable-id
      limits: qualified-non-negative-resource-amounts
    coordination_run:
      scope_id: stable-id
      limits: qualified-non-negative-resource-amounts
  launch_reservation:
    amounts: qualified-non-negative-resource-amounts
```

The packet, resource plan and every nested object reject unknown or missing fields. Provider input is validated by the exact schema selected by `input_schema_id` under `contract_digest`; it cannot contain a capability, secret, executable override, environment source or other trusted control field. Artifact references and `project_run_directory` resolve from the exact trusted project root and reject absolute paths, traversal and symlink escape.

Preview and commit apply all of these cross-checks:

- intent, packet, plan, stored project/session and topology identities match;
- for a first attempt, the session's current launch-packet path/digest equals
  `launch_packet_ref`; a retry instead binds the stored failed-attempt packet   and the proposed new packet separately;
- packet and intent adapter, action, contract, budget and resource-plan
  references match exactly;
- normalised `chair_authority` hashes to `authority_ref` and narrows the active
  project/session envelope;
- the authority budget vector equals the coordination-run scope limits, and
  session/run limits narrow every ancestor;
- the current trust record hashes to `trust_record_digest`;
- the registered adapter contract hashes to `provider_contract_digest` and
  validates the strict provider input;
- current scopes, limits, reservations and unknown usage hash to
  `resource_state_digest`; and
- the launch reservation ID and `operation_id` are daemon-derived from the
  canonical `(provider_adapter_id, provider_action_id)` pair; no reservation   key or join is action-ID-only.

Preview persists these exact values and a canonical launch-binding digest. Commit re-reads the artifacts and current state and rejects any changed packet, plan, project/session revision, trust record, adapter contract or resource state before mutation.

The launch-custody service owns a synchronous preparation hook inside the operator-command transaction. An initial commit advances the session from `awaiting_launch` to `launching`. A retry commit CASes `launch_failed` to `launching`, replaces the session's current launch-packet path/digest with the newly reviewed reference and increments its revision. Either form creates the coordination run, narrowed authority, one chair, random chair-capability hash, chair lease, mailbox/adapter binding, required memberships, project/session/run resource scopes, launch reservation, prepared provider action, immutable custody row and operator preparation in the same transaction. Every predicate, including the coordinated/independent one-chair rule, is rechecked there. Fault at any statement rolls back every launch-owned row and, for retry, retains the failed attempt's packet binding. The generic operator effect port cannot prepare, dispatch, status-reconcile or complete a launch.

The immutable custody row binds one session attempt generation, run, chair, operator command, provider adapter/action pair, capability hash, reservation, artifact references and all preview digests. The provider action journal owns outcome; custody metadata is never rewritten to represent progress. The pair `(provider_adapter_id, provider_action_id)` is unique across the daemon and is the immutable launch-attempt identity across all runs and adapter journals.

The chair credential is cryptographically random and never deterministically rederived. Only its hash is durable. Its plaintext appears once in a volatile post-commit handle passed to a dedicated, secret-bearing adapter handoff that configures the launched chair's local Fabric access. It is not part of the schema-validated provider input, prompt/model input, provider action payload or history, operator result, preview, projection, event, receipt, discovery material, log or adapter error. The adapter accepts this handoff at most once for the exact launch attempt; replay cannot recover or redisclose the secret.

Possession of that credential by the adapter wrapper is not provider-session continuity. Launch custody generates a 32-byte random challenge before adapter I/O, persists only its digest and passes the raw challenge once in the volatile private handle. Before returning terminal success, the exact launched provider session must echo that challenge through the Fabric tool configured in that session. The adapter contract, covered by `provider_contract_digest`, declares its provider-native invocation-attribution mechanism. The real adapter returns the verbatim bounded native invocation record: provider session reference and generation, provider-assigned turn and tool-call IDs, adapter/action pair, contract digest and challenge response. The daemon verifies the record against the custody challenge and terminal outcome before activation and stores only a canonical non-secret evidence digest.

The provider adapter is a trusted translation boundary, not a cryptographic attestor against its own malicious code. The guarantee is narrower and testable: shipped adapter code has no terminal-success path without an attributable provider-native callback. A wrapper-side Fabric read, direct bridge method call, adapter-generated assertion, missing provider turn/call ID or wrong/replayed challenge cannot attest continuity. Conformance runs the real adapter against a fake provider transport that emits native events; a fixture with no provider tool event must remain unproved.

The supervisor retains the secret-consuming adapter/session bridge after a successful launch. Later turns for that provider session reuse the same bridge; the credential is not reissued, reconstructed or copied into model input or history. Loss of the bridge before terminal evidence is ambiguous. Loss after activation is explicit provider-context/chair loss and requires normal fencing, handoff or takeover recovery; restart never fabricates continuity from the resume reference alone. An adapter that cannot obtain session-originated attestation must fail closed and cannot return terminal success.

The dispatch return and `lookup_action` response use the same closed `launch_adapter_outcome_v1` union. A terminal success has this shape:

```yaml
launch_adapter_outcome_v1:
  schema_version: 1
  provider_adapter_id: exact-adapter
  provider_action_id: exact-action
  provider_contract_digest: exact-custody-sha256
  observation_kind: dispatch-return-or-lookup
  observed_at: timestamp
  outcome:
    kind: terminal-success
    provider_session_ref: exact-non-secret-resume-reference
    provider_session_generation: positive-integer
    effect_digest: exact-sha256
    resource_usage:
      qualified-unit-key: non-negative-safe-integer-or-unknown
```

A proved no-effect failure has this shape:

```yaml
launch_adapter_outcome_v1:
  schema_version: 1
  provider_adapter_id: exact-adapter
  provider_action_id: exact-action
  provider_contract_digest: exact-custody-sha256
  observation_kind: dispatch-return-or-lookup
  observed_at: timestamp
  outcome:
    kind: terminal-no-effect
    failure_code: bounded-adapter-contract-code
    no_effect_proof:
      schema_id: registered-no-effect-proof-schema
      proof: strict-schema-validated-proof
      digest: exact-sha256
```

Every other result uses or is normalised to this shape:

```yaml
launch_adapter_outcome_v1:
  schema_version: 1
  provider_adapter_id: exact-adapter
  provider_action_id: exact-action
  provider_contract_digest: exact-custody-sha256
  observation_kind: dispatch-return-or-lookup
  observed_at: timestamp
  outcome:
    kind: ambiguous
    reason_code: absent-or-error-or-conflict-or-missing-resume-reference
    evidence_digest: exact-sha256-or-null
```

Each variant and nested object rejects unknown or missing fields and must match the custody adapter/action pair and contract digest. Terminal success requires a usable exact resume reference, positive provider-session generation, session-originated continuity attestation under the live bridge and resource-usage key for every and only reserved dimension. `accepted` without that complete terminal evidence is an interim journal state and cannot activate the session. Only an adapter-contract-validated proof that no provider session or external effect exists for the pair may produce `terminal-no-effect`; lookup absence, transport error, malformed output, adapter error, conflicting evidence or a missing resume reference is `ambiguous`. The daemon validates the proof under `schema_id` and requires its canonical hash to equal `digest`.

Operator projections use a closed typed reference rather than inventing an artifact:

```yaml
LaunchProviderActionJournalRefV1:
  schema_version: 1
  project_session_id: exact-session
  coordination_run_id: exact-run
  actionRef:
    adapterId: exact-adapter
    actionId: exact-action
  provider_contract_digest: exact-custody-sha256
  custody_attempt_generation: positive-integer
  journal_revision: positive-integer
  journal_state: prepared-or-dispatched-or-accepted-or-terminal-or-ambiguous
  outcome_kind: terminal-success-or-terminal-no-effect-or-ambiguous-or-null
  outcome_digest: exact-sha256-or-null
```

Launch `OperatorActionStatus` values in pending or ambiguous state and the terminal `OperatorActionReceipt` require `launchProviderActionJournalRef`. Its nested `actionRef` is byte-shape-identical to canonical `ProviderActionRefV1` and equality-binds the custody/action journal pair. The launch ambiguous variant no longer requires `effectRef`; an actual immutable effect artifact may still be linked, but no synthetic `ArtifactRef` is created. Non-launch action variants retain their existing artifact rules.

`ProviderActionRefV1` now means only the canonical closed two-field `{adapterId, actionId}` pair at every public boundary. No compatibility alias or decoder accepts the former launch-journal shape under that name.

Launch custody persists `dispatched` before adapter I/O. The internal reconciler alone advances `launching` to `active`, `launch_failed` or `launch_ambiguous` from persisted adapter evidence. `OperatorActionStatus` and its terminal receipt are read-only projections of the provider-action journal; they do not fabricate a later operator command or mutate its original audit.

Recovery is attempt-state-specific:

- a custody-owned `prepared` action causes zero adapter calls; recovery revokes
  its chair capability hash and chair lease, releases its reservation and   terminalises the run/action/session as a proved pre-acceptance   `launch_failed` attempt;
- a custody-owned `dispatched`, `accepted` or `ambiguous` action permits
  `lookup_action` only; it is never sent again; and
- `terminal-success` activates the same run exactly once,
  `terminal-no-effect` performs failed-attempt cleanup, and an ambiguous   outcome retains its run, lease, capability hash, reservation and action   identity in `launch_ambiguous`.

On `terminal-success`, custody reconciles the launch reservation in the same transaction that persists the exact provider resume reference/generation and performs the active-state CAS. For each exact usage value it records consumption and releases the unused remainder. For an `unknown` value it marks that dimension unknown at every affected ancestor and closes the reservation without making unproved capacity available. Exact overrun is an integrity failure that enters `recovery_required`; it is never truncated to the reservation. `terminal-no-effect` records zero effect and releases the full reservation. Ambiguity retains the reservation unchanged.

Generic provider startup and public reconciliation exclude every action owned by launch custody. An ambiguous attempt prohibits retry and a second chair. A proved failure may retry only after a fresh current-state preview with a newly reviewed packet, new run ID, new provider adapter/action identity, next custody attempt generation and `retry_of` bound to the failed attempt. The retry commit atomically replaces the session's packet reference as described above. Failed custody rows remain immutable.

Added requirements are:

- **FR-028:** Launch packet and resource-plan artifacts shall be closed,
  versioned, identity-cross-checked and bound to current trust, adapter and   resource state before any launch mutation.
- **FR-029:** One internal custody transaction shall own launch preparation,
  dispatch fencing and outcome reconciliation; public transition, generic   effect and generic recovery surfaces shall not own launch state.
- **FR-030:** Launch dispatch and lookup shall return the closed adapter-outcome
  union; operator status/receipt shall bind its typed provider-action reference,   and terminal success shall reconcile every reserved resource dimension.
- **FR-031:** A proved-failure retry shall atomically replace the session launch
  packet while advancing the failed session under the next custody generation.
- **FR-032:** Terminal chair launch shall require a provider-session-originated,
  challenge-bound Fabric continuity attestation and a retained owning bridge;   adapter-wrapper possession alone shall never attest continuity.
- **NFR-015:** Chair launch credentials shall be random, hash-only at rest and
  disclosed once only through the dedicated adapter secret handoff.
- **NFR-016:** Provider adapter/action identity shall be daemon-global, and
  crash recovery shall never duplicate a launch effect.
- **NFR-017:** A chair bridge shall retain credential material only in volatile
  session state and shall fail closed on bridge loss without reissuing it.

Acceptance additionally requires:

- **AC-021:** an untrusted/wrong-root bootstrap request, changed idempotent
  replay, stale trust digest, stale operator generation, invalid rotation or   widened capability fails closed without creating a project or plaintext   credential residue;
- **AC-022:** duplicate, stale, failed and ambiguous chair launch produces one
  project session, at most one run/action effect for the stable identity, no   second coordinated chair and no secret in protocol responses, projections,   logs or receipts;
- **AC-025:** public launch-state transition and reconciliation attempts fail
  with zero launch rows, while transaction fault injection and concurrent   coordinated commits expose either no launch or one complete custody-owned   launch; and
- **AC-026:** prepared, dispatched, accepted, failed and ambiguous crash points
  follow the recovery and retry rules above, global adapter/action reuse fails   before adapter I/O, and secret-canary scans find no durable or model-visible   credential copy. Terminal-outcome fixtures also prove resume-reference,   no-effect-proof, typed status-reference and exact/unknown resource settlement   behaviour. Session-attestation fixtures prove that wrapper self-probes,   wrong-session challenges and immediate bridge teardown cannot activate.

### Chair-bridge recovery and one lifecycle mutation surface

Loss of a retained bridge after activation atomically creates an immutable `chair_bridge_loss` record, freezes the old chair lease, delivery and new authority grants, revokes the old Fabric capability, advances the affected run and session to `recovery_required`, and captures a daemon-derived recovery manifest digest over current task, mailbox, lease, checkpoint, provider and membership revisions. This manifest is loss evidence, not a fabricated chair-authored handoff.

The volatile registry supervises every retained chair and child bridge. Loss of a non-chair spawn/attach bridge persists one immutable child-bridge loss, revokes the exact target capability, advances `bridgeGeneration` and changes the agent's `bridgeState` from `active` to `lost` or `none`. It does not promote the child, fabricate provider death or force the whole run into `recovery_required`; chair loss retains the stronger run/session fencing below. Repeated observation is idempotent and a dead child bridge cannot authenticate or replay a later call.

Recovery requires an explicit operator command with `takeover` authority bound to that exact loss record, recovery manifest, run/session/chair generations, provider adapter/contract and target revision. The operator chooses one closed path:

1. `rebind`: retain the same chair identity and provider resume reference under
   a higher chair/principal/session generation. Recovery custody creates a new    random capability and challenge, invokes a dedicated stable adapter action,    and requires a fresh provider-native attestation before reactivation.
2. `takeover`: promote an explicitly named existing successor only after its
   live provider bridge and authority are proved; the loss manifest substitutes    for a chair handoff only for this operator-authorised crash-recovery path.
3. `abandon`: preserve the loss evidence and enter the explicit cancel/failure
   terminal path without deleting provider history.

No path reconstructs or reissues the old credential. Rebind is a newly issued, generation-bound capability after atomic revocation, not derivation from a hash or resume reference. Its provider action uses the same prepare-before-I/O, lookup-only ambiguity and one-effect custody rules as initial launch. Restart discovers a missing live bridge and persists/fences the loss before admitting another chair mutation. If no operator acts, the session remains safely `recovery_required`; it is not silently resumed or promoted.

The typed two-phase `OperatorActionIntent` is the sole production owner of project-session drain/stop and daemon drain/stop. The direct `fabric.v1.project-session.{drain,stop}` and `fabric.v1.daemon.{drain,stop}` operations are retired because their request shapes do not carry the complete preview/global-revision contract. They are absent from grants and negotiated clients; retained decoders return the typed retirement failure and point to `fabric.v1.operator-action.preview`.

- **FR-034:** Post-activation bridge loss shall persist and fence one exact loss
  generation, and only explicit recovery custody may rebind, take over or   abandon it.
- **FR-035:** All production lifecycle mutations shall use the typed operator-
  action preview/commit/status/reconcile path; incomplete direct lifecycle   operations shall be retired and ungranted.
- **NFR-019:** Recovery shall never derive, reconstruct or reuse the old chair
  credential, and ambiguous recovery shall never duplicate a provider effect.
- **NFR-020:** The complete authorised MCP descriptor set shall be projected or
  the connection/launch shall fail closed; no projection may silently truncate.
- **AC-028:** daemon/adapter crash after activation creates one loss record and
  freezes the old generation; rebind requires a fresh capability, challenge,   adapter action and native provider attestation, takeover requires an explicit   successor with a live bridge, and abandon remains available. Resume-reference-   only recovery and duplicate effects fail.
- **AC-029:** protocol negotiation exposes no direct lifecycle shortcut, while
  typed lifecycle preview/commit survives restart and preserves exact global,   session, run and consequence fences.
