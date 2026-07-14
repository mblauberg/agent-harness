
### 32.9 Local operator bootstrap and reviewed chair launch

`projectSessionCreate` creates only a Fabric-owned draft and has no provider,
process or Git effect. Before that call, the private machine-local control
plane may provision the first operator for an exact trusted project root. This
is not a public operator operation and does not make the bootstrap principal an
operator. The daemon shall:

- recheck the canonical root against the machine-local workspace-trust
  registry and bind one deterministic project identity plus the exact current
  trust-record digest to that root;
- derive the local operator subject from the trusted launcher context, create
  or revalidate its generation-fenced principal, and issue only the requested
  bounded project capability;
- require exact idempotent replay or an explicit generation-bound rotation
  through `OperatorStore.rotatePrincipal`, which increments the principal
  generation and revokes every prior-generation capability;
- persist only capability hashes and return plaintext launch credentials once
  over the private local channel; and
- never write the operator credential to discovery files, audit journals,
  project artifacts, Console state, projections or rendered output.

The initial capability is `project-launch` kind and can create only a draft
session or a project-bound intake. It cannot authorise a session-targeted
command. After draft creation, the private control plane method
`issueLocalOperatorSessionCapability` rechecks the same local subject, project
trust digest, session ID and generation, then issues a session-bound capability
carrying only the requested actions, including `launch` when requested. Its
expiry may not exceed the project capability or the reviewed launch-envelope
expiry. Phase-two launch always authenticates with this session capability and
therefore uses the existing session-generation fence; the public session-create
result never contains a credential.

Starting the first coordination chair is a separate consequential action over
an existing `awaiting_launch` project session. `projectSessionTransition` may
prepare `draft -> awaiting_launch`; that transition requires the reviewed
launch-packet reference, atomically replaces the session's current packet
path/digest and increments its revision. `ProjectSessionTransitionRequest`
therefore adds `launchPacketRef`, required only for `draft -> awaiting_launch`
and forbidden for every other public transition. The public operator path
shall reject every transition into or out of `launching` and every transition
into or out of `launch_ambiguous`. Public `operatorActionReconcile` shall reject
a launch intent. Only the daemon-internal launch-custody service may enter or
leave a launch-owned state or reconcile its provider action.

The operator action protocol adds `ProjectSessionLaunchIntent` to
`OperatorActionIntent` and maps it to the `launch` capability. Its closed wire
shape is:

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
  provider_authority_request_digest: exact-sha256
  resource_state_digest: exact-sha256
  retry_of:
    provider_adapter_id: exact-prior-adapter
    provider_action_id: exact-prior-action
```

`retry_of` is absent for a first attempt and required only after custody has
proved the referenced attempt failed before provider acceptance. It is a
closed object and is never accepted for an ambiguous, active or merely
unobserved attempt. Unknown keys are rejected.

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
  chair_authority: exact-AuthorityEnvelopeV2
  provider:
    adapter_id: exact-registered-adapter
    action_id: stable-launch-attempt-id
    contract_digest: exact-sha256
    authority_request: exact-providerActionAuthorityRequestV1
    input_schema_id: registered-strict-schema
    input: strict-adapter-launch-input
```

The intent's `provider_authority_request_digest` equality-copies the packet's
closed authority-request digest. The packet's chair authority is the complete
human envelope; the separate provider request selects one closed execution
profile and never carries provider-native settings.

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

The packet, resource plan and every nested object reject unknown or missing
fields. Provider input is validated by the exact schema selected by
`input_schema_id` under `contract_digest`; it cannot contain a capability,
secret, executable override, environment source or other trusted control
field. Artifact references and `project_run_directory` resolve from the exact
trusted project root and reject absolute paths, traversal and symlink escape.

Preview and commit apply all of these cross-checks:

- intent, packet, plan, stored project/session and topology identities match;
- for a first attempt, the session's current launch-packet path/digest equals
  `launch_packet_ref`; a retry instead binds the stored failed-attempt packet
  and the proposed new packet separately;
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
  canonical `(provider_adapter_id, provider_action_id)` pair; no reservation
  key or join is action-ID-only.

Preview persists these exact values and a canonical launch-binding digest.
Commit re-reads the artifacts and current state and rejects any changed packet,
plan, project/session revision, trust record, adapter contract or resource
state before mutation.

The launch-custody service owns a synchronous preparation hook inside the
operator-command transaction. An initial commit advances the session from
`awaiting_launch` to `launching`. A retry commit CASes `launch_failed` to
`launching`, replaces the session's current launch-packet path/digest with the
newly reviewed reference and increments its revision. Either form creates the
coordination run, narrowed authority, one chair, random chair-capability hash,
chair lease, mailbox/adapter binding, required memberships,
project/session/run resource scopes, launch reservation, prepared provider
action, immutable custody row and operator preparation in the same
transaction. Every predicate, including the coordinated/independent one-chair
rule, is rechecked there. Fault at any statement rolls back every launch-owned
row and, for retry, retains the failed attempt's packet binding. The generic
operator effect port cannot prepare, dispatch, status-reconcile or complete a
launch.

The immutable custody row binds one session attempt generation, run, chair,
operator command, provider adapter/action pair, capability hash, reservation,
artifact references and all preview digests. The provider action journal owns
outcome; custody metadata is never rewritten to represent progress. The pair
`(provider_adapter_id, provider_action_id)` is unique across the daemon and is
the immutable launch-attempt identity across all runs and adapter journals.

The chair credential is cryptographically random and never deterministically
rederived. Only its hash is durable. Its plaintext appears once in a volatile
post-commit handle passed to a dedicated, secret-bearing adapter handoff that
configures the launched chair's local Fabric access. It is not part of the
schema-validated provider input, prompt/model input, provider action payload or
history, operator result, preview, projection, event, receipt, discovery
material, log or adapter error. The adapter accepts this handoff at most once
for the exact launch attempt; replay cannot recover or redisclose the secret.

Possession of that credential by the adapter wrapper is not provider-session
continuity. Launch custody generates a 32-byte random challenge before adapter
I/O, persists only its digest and passes the raw challenge once in the volatile
private handle. Before returning terminal success, the exact launched provider
session must echo that challenge through the Fabric tool configured in that
session. The adapter contract, covered by `provider_contract_digest`, declares
its provider-native invocation-attribution mechanism. The real adapter returns
the verbatim bounded native invocation record: provider session reference and
generation, provider-assigned turn and tool-call IDs, adapter/action pair,
contract digest and challenge response. The daemon verifies the record against
the custody challenge and terminal outcome before activation and stores only a
canonical non-secret evidence digest.

The provider adapter is a trusted translation boundary, not a cryptographic
attestor against its own malicious code. The guarantee is narrower and
testable: shipped adapter code has no terminal-success path without an
attributable provider-native callback. A wrapper-side Fabric read, direct
bridge method call, adapter-generated assertion, missing provider turn/call ID
or wrong/replayed challenge cannot attest continuity. Conformance runs the real
adapter against a fake provider transport that emits native events; a fixture
with no provider tool event must remain unproved.

The supervisor retains the secret-consuming adapter/session bridge after a
successful launch. Later turns for that provider session reuse the same bridge;
the credential is not reissued, reconstructed or copied into model input or
history. Loss of the bridge before terminal evidence is ambiguous. Loss after
activation is explicit provider-context/chair loss and requires normal fencing,
handoff or takeover recovery; restart never fabricates continuity from the
resume reference alone. An adapter that cannot obtain session-originated
attestation must fail closed and cannot return terminal success.

The dispatch return and `lookup_action` response use the same closed
`launch_adapter_outcome_v1` union. A terminal success has this shape:

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

Each variant and nested object rejects unknown or missing fields and must match
the custody adapter/action pair and contract digest. Terminal success requires
a usable exact resume reference, positive provider-session generation,
session-originated continuity attestation under the live bridge and
resource-usage key for every and only reserved dimension. `accepted` without
that complete terminal evidence is an interim journal state and cannot activate
the session. Only an adapter-contract-validated proof that no provider session
or external effect exists for the pair may produce `terminal-no-effect`;
lookup absence, transport error, malformed output, adapter error, conflicting
evidence or a missing resume reference is `ambiguous`. The daemon validates the
proof under `schema_id` and requires its canonical hash to equal `digest`.

Operator projections use a closed typed reference rather than inventing an
artifact:

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

Launch `OperatorActionStatus` values in pending or ambiguous state and the
terminal `OperatorActionReceipt` require `launchProviderActionJournalRef`.
Its nested `actionRef` is byte-shape-identical to canonical
`ProviderActionRefV1` and equality-binds the custody/action journal pair. The launch
ambiguous variant no longer requires `effectRef`; an actual immutable effect
artifact may still be linked, but no synthetic `ArtifactRef` is created.
Non-launch action variants retain their existing artifact rules.

`ProviderActionRefV1` now means only the canonical closed two-field
`{adapterId, actionId}` pair at every public boundary. No compatibility alias
or decoder accepts the former launch-journal shape under that name.

Launch custody persists `dispatched` before adapter I/O. The internal
reconciler alone advances `launching` to `active`, `launch_failed` or
`launch_ambiguous` from persisted adapter evidence. `OperatorActionStatus` and
its terminal receipt are read-only projections of the provider-action journal;
they do not fabricate a later operator command or mutate its original audit.

Recovery is attempt-state-specific:

- a custody-owned `prepared` action causes zero adapter calls; recovery revokes
  its chair capability hash and chair lease, releases its reservation and
  terminalises the run/action/session as a proved pre-acceptance
  `launch_failed` attempt;
- a custody-owned `dispatched`, `accepted` or `ambiguous` action permits
  `lookup_action` only; it is never sent again; and
- `terminal-success` activates the same run exactly once,
  `terminal-no-effect` performs failed-attempt cleanup, and an ambiguous
  outcome retains its run, lease, capability hash, reservation and action
  identity in `launch_ambiguous`.

On `terminal-success`, custody reconciles the launch reservation in the same
transaction that persists the exact provider resume reference/generation and
performs the active-state CAS. For each exact usage value it records consumption
and releases the unused remainder. For an `unknown` value it marks that
dimension unknown at every affected ancestor and closes the reservation without
making unproved capacity available. Exact overrun is an integrity failure that
enters `recovery_required`; it is never truncated to the reservation.
`terminal-no-effect` records zero effect and releases the full reservation.
Ambiguity retains the reservation unchanged.

Generic provider startup and public reconciliation exclude every action owned
by launch custody. An ambiguous attempt prohibits retry and a second chair. A
proved failure may retry only after a fresh current-state preview with a newly
reviewed packet, new run ID, new provider adapter/action identity, next custody
attempt generation and `retry_of` bound to the failed attempt. The retry commit
atomically replaces the session's packet reference as described above. Failed
custody rows remain immutable.

Added requirements are:

- **FR-028:** Launch packet and resource-plan artifacts shall be closed,
  versioned, identity-cross-checked and bound to current trust, adapter and
  resource state before any launch mutation.
- **FR-029:** One internal custody transaction shall own launch preparation,
  dispatch fencing and outcome reconciliation; public transition, generic
  effect and generic recovery surfaces shall not own launch state.
- **FR-030:** Launch dispatch and lookup shall return the closed adapter-outcome
  union; operator status/receipt shall bind its typed provider-action reference,
  and terminal success shall reconcile every reserved resource dimension.
- **FR-031:** A proved-failure retry shall atomically replace the session launch
  packet while advancing the failed session under the next custody generation.
- **FR-032:** Terminal chair launch shall require a provider-session-originated,
  challenge-bound Fabric continuity attestation and a retained owning bridge;
  adapter-wrapper possession alone shall never attest continuity.
- **NFR-015:** Chair launch credentials shall be random, hash-only at rest and
  disclosed once only through the dedicated adapter secret handoff.
- **NFR-016:** Provider adapter/action identity shall be daemon-global, and
  crash recovery shall never duplicate a launch effect.
- **NFR-017:** A chair bridge shall retain credential material only in volatile
  session state and shall fail closed on bridge loss without reissuing it.

Acceptance additionally requires:

- **AC-021:** an untrusted/wrong-root bootstrap request, changed idempotent
  replay, stale trust digest, stale operator generation, invalid rotation or
  widened capability fails closed without creating a project or plaintext
  credential residue;
- **AC-022:** duplicate, stale, failed and ambiguous chair launch produces one
  project session, at most one run/action effect for the stable identity, no
  second coordinated chair and no secret in protocol responses, projections,
  logs or receipts;
- **AC-025:** public launch-state transition and reconciliation attempts fail
  with zero launch rows, while transaction fault injection and concurrent
  coordinated commits expose either no launch or one complete custody-owned
  launch; and
- **AC-026:** prepared, dispatched, accepted, failed and ambiguous crash points
  follow the recovery and retry rules above, global adapter/action reuse fails
  before adapter I/O, and secret-canary scans find no durable or model-visible
  credential copy. Terminal-outcome fixtures also prove resume-reference,
  no-effect-proof, typed status-reference and exact/unknown resource settlement
  behaviour. Session-attestation fixtures prove that wrapper self-probes,
  wrong-session challenges and immediate bridge teardown cannot activate.

### 32.10 Typed repository reads and Activity message binding

The public operator protocol adds `operator-repository-read.v1` with
`fabric.v1.operator-repository.read`. The request authenticates an operator,
binds the exact project and optional project session, carries the current
operator snapshot revision, and selects either the trusted project root or an
exact canonical worktree admitted to that session. It accepts only typed diff
selectors (`working-tree`, `staged`, or two exact object digests) plus bounded
log cursor and limit. It accepts no command, shell, argument vector, arbitrary
Git subcommand, environment override or caller-selected repository outside the
trusted project.

The daemon derives and rechecks the repository/worktree boundary, invokes only
its fixed Git-read port, and returns one `GitRepositoryProjection` containing:

- canonical repository and worktree paths;
- head ref, detached state and exact object digest;
- head, index, worktree and remote state digests compatible with
  `GitRepositoryBinding` mutation fences;
- bounded staged, unstaged, untracked and conflicted paths with an explicit
  truncation marker;
- typed merge, rebase, cherry-pick, bisect or clean operation state;
- optional remote/branch upstream with ahead/behind counts;
- an immutable diff artifact reference and its exact base/target digests;
- a bounded cursor-paged log of object digest, parent digests, subject and
  author timestamp;
- bounded typed branch and worktree records with explicit truncation; and
- a separately fresh `ProjectionFact` for optional hosted checks.

Local Git and hosted GitHub facts have independent source, revision, freshness
and observation time. GitHub absence, outage or staleness cannot make the
local Git result unavailable or stale. A changed operator snapshot returns
`resnapshot-required`; a repository change between observation and response
returns a new repository state digest and never fabricates snapshot stability.
The v2 Project row carries only bounded status/count/upstream fields and the
repository state digest; Project detail and repository-read results carry the
full typed projection. Pagination and truncation are explicit and bounded.

The protocol also adds:

```yaml
message_body_ref:
  project_id: exact-project
  project_session_id: exact-session
  coordination_run_id: exact-run
  message_id: exact-message
  expected_revision: positive-integer
```

`ActivityViewItem`, the v2 Activity summary and Activity detail carry
`messageBodyRef`. An Activity item of kind `message` requires the exact ref;
every other kind forbids it. Row, detail and `MessageBodyReadRequest` preserve
the same project/session/run, message and revision. The body read remains separately
authorised and revision-fenced; its result must still prove terminal-control
neutralisation and capability-value redaction. No event ID is guessed or
reinterpreted as a message ID.

Acceptance additionally requires:

- **AC-023:** status, diff, log, branches, worktrees, upstream and checks survive
  Project row-to-detail/repository-read projection with exact state digests,
  explicit pagination/truncation and independent Git/GitHub degradation; no
  typed or runtime surface accepts arbitrary Git execution; and
- **AC-024:** message Activity rows require and preserve the exact message-body
  reference, non-message rows reject one, stale revisions fail closed, and the
  Console can read the full neutralised/redacted body without deriving IDs.

Acceptance adds:

- **AC-014:** project lifecycle, membership, coordinated/independent topology
  and one-chair invariants survive races and restart;
- **AC-015:** the full operator-capability negative matrix and exact takeover
  bindings fail closed, including independent `drain` and `stop` authority;
- **AC-016:** each scoped-gate enforcement point blocks only its affected
  dependency set; added and removed descendants rebind atomically and policy
  auto-approval of a human-only gate fails;
- **AC-017:** concurrent resource admission cannot overbook any ancestor and
  unknown usage remains honest after restart;
- **AC-018:** duplicate discussion, restart and compaction retain one revisioned
  intake and one correlated request bound to the exact intake revision, gates
  and artifact digests;
- **AC-019:** crash injection exposes either all or none of task/request and
  reply/result/callback composite effects; and
- **AC-020:** safe-boundary delivery, busy/idle requester behaviour, overdue,
  retry, reassignment, abandonment and late reply preserve the dependent
  barrier and never use pane state as delivery evidence.

No session or run is imported from an earlier database epoch. Every current
session has an explicit current operator origin and every run enters through
reviewed launch custody.

### 32.11 Current-agent MCP parity and launched-chair surface

The canonical MCP descriptor set is the `tool` projection of the active
agent-principal operation registry and its closed protocol codecs. The registry,
not section 14 prose, is the sole membership and stable-name owner. Every active
agent operation is explicitly classified, and adding or removing an operation
without a projection classification fails the build. A descriptor owns
one stable tool name, protocol operation, input codec, output codec, receipt
renderer, optional resource-template URI and required negotiated feature. The
run-status, task-list, agent-list and receipt-list resource templates resolve
through their generated read descriptors; every projection exposes the read
tools even when it cannot expose MCP resources. Standalone proxies and provider-
session bridges import those descriptors; neither copies schemas or accepts an
arbitrary method name.

The standalone proxy authenticates once, negotiates an agent principal and
advertises only descriptors present in the negotiated grant. Every call uses
that connection identity and is reauthorised at the daemon. A tool argument
cannot substitute another capability, run, chair, session generation or
principal. Provider-session bridges apply the same rule and additionally bind
the live provider invocation to the launched session reference/generation and
retained bridge generation. Secret handoff material is never a tool argument,
model-visible descriptor, result, receipt or error.

One V1 descriptor projects one complete operation codec. Constant-bound aliases
are prohibited. A later exhaustive variant set may replace that descriptor only
when every admitted discriminator value is covered exactly once, every binding
is registry-owned and the daemon still parses and reauthorises the complete
canonical operation. Result descriptors are exact closed codec projections;
provider payload/result fields cannot remain open JSON at the model boundary.

Spawn/attach capability issuance uses the same hash-only, prepare-before-I/O,
dispatch-once and lookup-only custody owner as chair launch. Their public
results are secret-free. Bridge-capable adapters consume the target credential
only through volatile private handoff and retain the exact generation-bound
transport; bridge-incapable attach reports `bridgeState: none` while the attach
operation remains registry-classified `tool`. No wrapper,
calling model, MCP proxy persistence or protocol result relays a child token.

The launched-chair surface shall support real coordination, not only
attestation or mailbox probing. After attestation, a later provider-originated
turn must successfully perform at least one schema-derived Fabric operation
through the same retained bridge. Standalone Claude-labelled and Codex-labelled
MCP proxies, Claude SDK in-process MCP and Codex dynamic-tool projections must
produce schema-equivalent success and closed failure for the same authorised
fixture. Adapter or bridge loss removes/degrades the affected surface without
killing the daemon, acknowledging a message, completing a task or fabricating
continuity.

- **FR-033:** The current agent MCP surface shall be generated from the shared
  principal-scoped operation registry and closed protocol codecs, and a launched
  chair shall receive that same authorised surface through its retained bridge.
- **NFR-018:** MCP proxies and provider-session tool projections shall expose no
  generic arbitrary RPC, capability substitution, duplicated schema owner or
  wrapper-originated call evidence.
- **AC-027:** CI conformance uses the real Claude/Codex adapters against fake
  provider transports and proves complete tool-name/schema/resource-read parity,
  native provider invocation attribution, wrong-principal/generation/feature
  rejection, malformed input/output handling, wrapper-self-call rejection and
  bridge-loss fencing. A separate real-provider dogfood gate uses only an
  already authenticated installation under explicit run authority, performs a
  later-turn current-agent Fabric call through the original retained bridge and
  records `not-run` rather than passing when login or provider access would be
  required. No test may claim that fake transport proves provider authenticity.
- **FR-036:** Every active agent operation shall have one registry-owned MCP
  projection classification; the generated `tool` set is complete for the
  negotiated grant and every `none` operation is absent from all projections.
- **FR-037:** Spawn/attach shall return no bearer secret and shall use shared
  effect custody for any private target-bridge provisioning.
- **NFR-021:** Bootstrap authority, plaintext capabilities, raw provider output
  and open result schemas shall never reach an MCP descriptor, structured
  result, text receipt, resource, error, log or persisted proxy state.
- **AC-030:** Descriptor drift tests reject an unclassified operation, copied
  schema, duplicate operation name, secret-bearing result, bootstrap token,
  incomplete variant set or projection mismatch. Real-adapter/fake-provider
  spawn and attach tests prove secret-free results, exact bridge-state honesty,
  later-turn calls over supported retained bridges, post-activation child loss
  revocation/generation fencing and no fabricated surface for unsupported
  interactive attachment. The launch-attestation descriptor is registry-owned,
  grant-scoped to launch and absent from standalone proxies.

### 32.12 Chair-bridge recovery and one lifecycle mutation surface

Loss of a retained bridge after activation atomically creates an immutable
`chair_bridge_loss` record, freezes the old chair lease, delivery and new
authority grants, revokes the old Fabric capability, advances the affected run
and session to `recovery_required`, and captures a daemon-derived recovery
manifest digest over current task, mailbox, lease, checkpoint, provider and
membership revisions. This manifest is loss evidence, not a fabricated
chair-authored handoff.

The volatile registry supervises every retained chair and child bridge. Loss
of a non-chair spawn/attach bridge persists one immutable child-bridge loss,
revokes the exact target capability, advances `bridgeGeneration` and changes
the agent's `bridgeState` from `active` to `lost` or `none`. It does not promote
the child, fabricate provider death or force the whole run into
`recovery_required`; chair loss retains the stronger run/session fencing below.
Repeated observation is idempotent and a dead child bridge cannot authenticate
or replay a later call.

Recovery requires an explicit operator command with `takeover` authority bound
to that exact loss record, recovery manifest, run/session/chair generations,
provider adapter/contract and target revision. The operator chooses one closed
path:

1. `rebind`: retain the same chair identity and provider resume reference under
   a higher chair/principal/session generation. Recovery custody creates a new
   random capability and challenge, invokes a dedicated stable adapter action,
   and requires a fresh provider-native attestation before reactivation.
2. `takeover`: promote an explicitly named existing successor only after its
   live provider bridge and authority are proved; the loss manifest substitutes
   for a chair handoff only for this operator-authorised crash-recovery path.
3. `abandon`: preserve the loss evidence and enter the explicit cancel/failure
   terminal path without deleting provider history.

No path reconstructs or reissues the old credential. Rebind is a newly issued,
generation-bound capability after atomic revocation, not derivation from a hash
or resume reference. Its provider action uses the same prepare-before-I/O,
lookup-only ambiguity and one-effect custody rules as initial launch. Restart
discovers a missing live bridge and persists/fences the loss before admitting
another chair mutation. If no operator acts, the session remains safely
`recovery_required`; it is not silently resumed or promoted.

The typed two-phase `OperatorActionIntent` is the sole production owner of
project-session drain/stop and daemon drain/stop. The direct
`fabric.v1.project-session.{drain,stop}` and `fabric.v1.daemon.{drain,stop}`
operations are retired because their request shapes do not carry the complete
preview/global-revision contract. They are absent from grants and negotiated
clients; retained decoders return the typed retirement failure and point to
`fabric.v1.operator-action.preview`.

- **FR-034:** Post-activation bridge loss shall persist and fence one exact loss
  generation, and only explicit recovery custody may rebind, take over or
  abandon it.
- **FR-035:** All production lifecycle mutations shall use the typed operator-
  action preview/commit/status/reconcile path; incomplete direct lifecycle
  operations shall be retired and ungranted.
- **NFR-019:** Recovery shall never derive, reconstruct or reuse the old chair
  credential, and ambiguous recovery shall never duplicate a provider effect.
- **NFR-020:** The complete authorised MCP descriptor set shall be projected or
  the connection/launch shall fail closed; no projection may silently truncate.
- **AC-028:** daemon/adapter crash after activation creates one loss record and
  freezes the old generation; rebind requires a fresh capability, challenge,
  adapter action and native provider attestation, takeover requires an explicit
  successor with a live bridge, and abandon remains available. Resume-reference-
  only recovery and duplicate effects fail.
- **AC-029:** protocol negotiation exposes no direct lifecycle shortcut, while
  typed lifecycle preview/commit survives restart and preserves exact global,
  session, run and consequence fences.
