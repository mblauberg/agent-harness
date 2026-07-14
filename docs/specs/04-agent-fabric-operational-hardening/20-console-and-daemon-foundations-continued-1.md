
### 9.1 Lock-safe on-demand bootstrap

The first operator or Fabric client read or command shall call one shared
bootstrap client. It shall:

1. attempt a bounded protocol initialisation against the trusted Unix socket;
2. if no compatible incumbent answers because the socket is absent, stale,
   unreachable, timed out or negotiates an incompatible feature version,
   contend for a generation-bearing lease under the private runtime directory
   and the canonical exclusive daemon-election lock;
3. after acquiring the lease, check the socket again before spawning;
4. spawn the configured daemon with a stable bootstrap action ID;
5. wait for a successful version/capability handshake and authoritative daemon
   instance generation; and
6. release the bootstrap lease only after success or a recorded terminal
   failure.

The pre-daemon bootstrap lease and append-only attempt journal live only under
the private runtime directory; they never mutate Fabric SQLite or create a
second transaction owner. Socket absence or PID inspection alone never grants
election. A contender may reclaim only after lease expiry and release of the
exclusive lock. The winner rechecks the socket while holding the lock and
retains the lease until the daemon owns the canonical socket and database,
finishes migration/recovery and publishes an atomic ready receipt. A live but
incompatible incumbent that still owns the canonical locks produces a typed
compatibility failure, never a second daemon or socket replacement. Losers poll
the exact election generation or its bounded terminal result. Runtime
directories remain `0700`, socket and lease material private, and no
project-session record may be created before initialisation succeeds.

A compatible incumbent handshake precedes database inspection and returns an
attached client immediately. With no compatible incumbent, the caller performs
a mutation-free inspection before creating bootstrap artifacts, then repeats
the inspection while holding the winning election lock immediately before
spawn. This ordering permits attachment to a legitimate busy WAL writer while
retaining byte/mode/directory preservation for incompatible state and closing
the absent-to-incompatible publication race.

Election and shutdown use the same lock order: acquire the daemon-election lock
first, then begin the SQLite liveness/recovery transaction. The daemon imports
the winning bootstrap receipt into its audit journal only after it is the sole
database owner. Shutdown holds the election lock through its final liveness
recheck and socket close, so attach/start cannot race quiesce into a duplicate
owner.

### 9.2 Global liveness and idle stop

While holding the daemon-election lock, the daemon shall stop only after one
SQLite transaction proves there is no liveness-contributing project session or
coordination run, active current-generation task/agent lease, unresolved
provider action, unresolved operator-effect custody or unexpired
current-generation operator client. Required
result delivery remains a project-session closure blocker. Pending best-effort
notification delivery alone does not keep the daemon alive. An attached Console
intentionally keeps it alive. Closing the final Console permits, but does not
force, idle shutdown.

Liveness-contributing project-session states are `awaiting_launch`,
`launching`, `active`, `quiescing`, `awaiting_acceptance`, `launch_ambiguous`,
`reconciling`, `visibility_degraded`, `recovery_required` and `quarantined`.
Detached `draft`, `closed`, `cancelled` and explicitly terminalised
`launch_failed` sessions do not keep the process alive. Run liveness uses the
corresponding launching/active/quiescing/acceptance, ambiguity, recovery and
quarantine states; draft and terminal closed/cancelled/failed history does not.
Provider actions contribute only while `prepared`, `dispatched`, `accepted`,
`ambiguous` or `quarantined`. Historical terminal rows never block shutdown.
Generic `operator_effect_custody` contributes while `prepared`, `dispatching`,
`ambiguous` or `failed`; `terminal`, `no-effect` and `rejected` do not. A typed
launch, Git, bridge-recovery, registered external-effect or Herdr owner remains
the sole recovery owner for its joined generic row; liveness may count that
row only once, but it may never omit it because another projection also blocks.
Typed Git custody contributes while its four-owner mapping is `prepared`,
`dispatching`, `conflict`, `ambiguous` or `quarantined`; an operation draft
alone never contributes. Machine or human terminalisation removes only the
mapped custody/reservation contribution.

Operator attachment is a persisted generation-fenced lease with heartbeat and
bounded crash expiry. Stop uses a daemon-instance compare-and-set transition
from `running` to `quiescing`, records the observed global-state revision and
rechecks the idle predicate before closing the socket. A concurrent attach,
project launch or recovered active member cancels the quiesce or advances the
revision so the stop fails closed. Project close and client detach are
idempotent and cannot stop another project's work.

### 9.3 Current baseline and invariants

The single current baseline shall create:

- project sessions and explicit membership;
- coordination-run project/session links, lifecycle revision and chair
  generation, plus persisted delivery workstreams;
- operator principals, capabilities, client attachments, input attestations
  and idempotent commands;
- revisioned intakes, scoped gates and gate-to-task/operation/barrier links;
- hierarchical resource scopes and reservations;
- request-result delivery and transactional outbox state;
- attention items and notification delivery journal;
- daemon runtime epochs and current bootstrap audit receipts; and
- one active MCP seat generation per project plus its exact session/run/chair,
  roster, principal-generation and token bindings; and
- immutable artifact-publication lineage, review targets/bundles,
  provider-action route/result custody and terminal review evidence; and
- schema-versioned operator projection cursors.

The baseline installs same-project/run foreign-key and
enumeration/generation triggers plus indexes for active membership, gate
enforcement, intake revision, callback deadline/claim, resource admission,
notification dedupe and global-idle queries. It is created only for an absent
database path and is verified before atomic publication.

MCP roster rotation is one prepare/activate compare-and-swap. The caller
supplies the expected active generation and a content-derived immutable next
generation. Activation rechecks the current project session, run, chair lease,
revisions and every principal, supersedes the prior generation and revokes its
seat tokens in the same transaction. Initialisation and every later capability
use join through the one active seat generation; a stale token or manually
rolled-back filesystem pointer therefore fails closed. Filesystem staging holds
one private project lock, publishes only when `current.json` equals the expected
prior generation (or already equals the exact replay), and never replaces a
newer pointer. Interrupted prepare/activation is recoverable without reviving a
superseded roster.

The baseline includes the append-only launch-attempt owner. Its closed logical
shape is:

```sql
CREATE TABLE project_session_launch_custody (
  project_session_id TEXT NOT NULL,
  attempt_generation INTEGER NOT NULL CHECK (attempt_generation >= 1),
  run_id TEXT NOT NULL UNIQUE,
  chair_agent_id TEXT NOT NULL,
  provider_adapter_id TEXT NOT NULL,
  provider_action_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  capability_token_hash TEXT NOT NULL UNIQUE,
  resource_reservation_id TEXT NOT NULL UNIQUE,
  launch_packet_path TEXT NOT NULL,
  launch_packet_digest TEXT NOT NULL,
  resource_plan_path TEXT NOT NULL,
  resource_plan_digest TEXT NOT NULL,
  expected_project_revision INTEGER NOT NULL
    CHECK (expected_project_revision >= 1),
  prepared_from_session_revision INTEGER NOT NULL
    CHECK (prepared_from_session_revision >= 1),
  session_generation INTEGER NOT NULL CHECK (session_generation >= 1),
  trust_record_digest TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  resource_state_digest TEXT NOT NULL,
  launch_binding_digest TEXT NOT NULL,
  retry_of_adapter_id TEXT,
  retry_of_action_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_session_id, attempt_generation),
  UNIQUE (provider_adapter_id, provider_action_id),
  UNIQUE (operator_id, command_id),
  CHECK ((retry_of_adapter_id IS NULL) = (retry_of_action_id IS NULL)),
  FOREIGN KEY (project_session_id, run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY (run_id, chair_agent_id)
    REFERENCES agents(run_id, agent_id),
  FOREIGN KEY (provider_adapter_id, provider_action_id)
    REFERENCES provider_actions(adapter_id, action_id),
  FOREIGN KEY (operator_id, command_id)
    REFERENCES operator_commands(operator_id, command_id),
  FOREIGN KEY (capability_token_hash) REFERENCES capabilities(token_hash),
  FOREIGN KEY (resource_reservation_id)
    REFERENCES resource_reservations(reservation_id),
  FOREIGN KEY (retry_of_adapter_id, retry_of_action_id)
    REFERENCES project_session_launch_custody(
      provider_adapter_id, provider_action_id
    )
);
```

The baseline also adds positive `journal_revision` and nullable
`outcome_digest` columns to `provider_actions`. Every state or outcome CAS
increments the revision; a non-null digest hashes the canonical closed outcome.
This is the source of `LaunchProviderActionJournalRefV1`, not an artifact
projection. Its nested action reference equality-binds the canonical
ProviderActionRefV1 pair.
The baseline creates the parent unique index before the custody table and a
trigger that also requires the referenced provider action's `run_id` to equal
the custody `run_id`. It preflights and enforces daemon-global
`provider_actions(adapter_id, action_id)` uniqueness across runs; the core and
every adapter journal key the same pair. Duplicate existing pairs fail
preflight before mutation. Attempt generations are contiguous per session, and
a retry must reference that session's immediately prior proved-failed attempt.
Update and delete triggers make custody rows immutable; provider-action and
lifecycle rows own outcome. No run or session is imported from an earlier
database epoch.

### 9.4 Restart and ambiguous-effect recovery

Under the daemon-election lock and before opening SQLite, startup reconciles an
expired runtime bootstrap lease and records its terminal attempt receipt. It
does not treat that lease as database state. An unclean marker then triggers
bounded integrity and foreign-key checks before mutation. Startup then,
transactionally:

- restores project-session and operator projection revisions;
- expires only operator attachments whose deadline and daemon-generation
  predicates are proven;
- requeues unacknowledged mailbox deliveries under their existing rules;
- returns only an expired `claimed` result-delivery lease to `pending` with a
  higher claim generation;
- preserves `provider-accepted`, `overdue`, `abandoned` and `consumed` result
  deliveries without regression, reinjection or reassignment;
- marks expired response deadlines `overdue` without redispatch;
- resumes notification attempts from their durable dedupe keys; and
- assigns every unresolved generic operator-effect custody to exactly one
  recovery owner: an unowned `prepared` row may become `no-effect` only after
  proving dispatch never began; `dispatching`, `ambiguous` and `failed` use
  lookup/observe only, never redispatch, and remain blocking when no complete
  proof is available; and
- quarantines ambiguous provider, Git, Herdr or notification effects until
  lookup/reconciliation proves their outcome.

No pane, process absence or Console-local cache may infer coordination state.
The Console may rebuild its complete projection from an authoritative snapshot
plus monotonic event cursor after any restart.

Generic provider-action recovery shall exclude every row joined to
`project_session_launch_custody`, regardless of provider state. Launch recovery
uses the immutable custody owner and applies this closed policy:

- `prepared`: make no adapter call, revoke the chair capability hash and chair
  lease, release the resource reservation, terminalise the run/action and CAS
  the session to `launch_failed`;
- `dispatched`, `accepted` or `ambiguous`: call only the adapter's pair-keyed
  `lookup_action`; never dispatch, replay or reconstruct launch material; and
- a strict `terminal-success` with an exact resume reference lets the internal
  reconciler activate and settle resources once; strict `terminal-no-effect`
  proof lets it fail and clean up; every absent, error, malformed, incomplete
  or conflicting result remains `launch_ambiguous` with its run, lease, hash
  and reservation.

Recovery never derives plaintext from a hash or durable payload. It performs
the prepared cleanup or lookup before admitting a retry or idle shutdown. A
public transition or `operatorActionReconcile` request cannot invoke this
path.

### 9.5 Notification worker

The daemon-owned notification worker consumes durable attention items while
project work remains active. Notification attempts are best-effort and
non-authoritative. Each has a stable dedupe key, target integration, exact item
revision and state `pending`, `claimed`, `sent`, `failed`, `deduplicated` or
`ambiguous`; integration availability is separately `available`, `unavailable`
or `stale`. Retries append attempts and never approve, acknowledge or consume
the attention item. A crash after claim but before terminal journalling records
ambiguity and never blindly retries. An exact focus action is emitted only for
an integration whose discovered contract advertises a tested link/action
capability.

### 9.6 Verification additions

Acceptance requires deterministic tests for:

- simultaneous first reads producing one daemon and one socket owner;
- stale/unreachable sockets, bounded initialisation timeout and incompatible
  handshakes without duplicate spawn or socket replacement;
- crash at every bootstrap phase and safe stale-lease reconciliation;
- two projects launching/closing while clients attach/detach without premature
  shutdown;
- restart through every project-session and result-delivery state;
- migration preflight, rollback, trigger and query-plan enforcement;
- global-idle false positives for every liveness predicate;
- every unresolved generic operator-effect state blocking idle stop and
  project-session closure until its exact recovery owner proves a terminal
  outcome, including an unknown/missing owner failing closed;
- detached draft sessions and terminal historical rows not blocking idle stop;
- election racing quiesce/stop through the canonical lock order;
- Console crash/restart without task cancellation or duplicate commands;
- notification dedupe, restart, unavailable/stale labelling and
  non-authoritative action handling; and
- deterministic projection snapshot plus cursor replay.

Load evidence shall cover concurrent session membership, scoped-gate reads,
budget admission, result callbacks and operator projection alongside the
existing 32-agent/1,000-operation coordination mix.

### 9.7 Private project/operator provisioning and launch custody

The daemon's current private-control connection owns the bootstrap
method, `provisionLocalOperator`. It is available only after the normal daemon
initialisation handshake with the current private bootstrap capability. The
method rechecks an exact canonical root and trust-record digest, derives the
local subject binding, and transactionally creates or revalidates the project,
operator principal and bounded project capability described by Spec 01
section 32.9. `projects.canonical_root` plus non-null
`projects.trust_record_digest` own that current binding. It cannot widen an
existing project/root binding. Exact replay is idempotent;
changed input or stale generation fails closed. `OperatorStore.rotatePrincipal`
is the only rotation surface: it compare-and-sets and increments
`principal_generation` and revokes every older capability in the same
transaction. The returned
plaintext token is a one-time local handoff and is never placed in the daemon
discovery receipt or durable audit. Revocation and later bounded issuance use
the same generation fences.

After the public `projectSessionCreate` call has committed a draft, the private
method `issueLocalOperatorSessionCapability` rechecks the local subject,
project/trust binding, session generation and requested action subset. It
returns a session-bound token whose expiry is no later than the project
capability and reviewed launch-envelope expiry. A `project-launch` capability
remains forbidden for session-targeted commands, and neither public creation
nor projections return credentials.

### 9.8 Closed launch inspection and private effect boundary

The public operator connection may create a draft session and prepare
`draft -> awaiting_launch`; preparation requires the reviewed packet reference,
atomically replaces the session packet path/digest and increments its revision.
The transition request carries that packet reference only for this preparation.
The public path shall reject every request to enter or leave `launching`, enter
or leave `launch_ambiguous` or reconcile a launch provider action. Chair launch
occurs only through preview/commit of the strict
`ProjectSessionLaunchIntent`, `launch_packet_v1` and
`launch_resource_plan_v1` contracts in Spec 01 section 32.9.

Before preview, the daemon parses both artifacts with closed schemas, resolves
all paths from the trusted project root and validates provider input through
the exact registered adapter contract digest. Inspection normalises the chair
authority and computes the project revision, session revision/generation,
trust-record digest, adapter-contract digest, resource-state digest and one
canonical launch-binding digest. It cross-checks packet, plan, intent, stored
identity, topology, budget, resource hierarchy and provider action. Preview
persists every binding. Commit repeats inspection and requires byte-identical
canonical bindings; stale or changed state has zero effect. An initial preview
requires the stored packet to equal the proposed reference. A retry preview
instead binds both the prior failed-attempt packet and a newly reviewed
proposed packet.

One daemon-owned `LaunchCustodyService` has four operations:

1. `inspect(intent)` safely reads, parses, normalises and binds current state;
2. `prepareInTransaction(...)` executes synchronously inside the operator
   commit transaction and returns only a volatile post-commit dispatch handle;
3. `dispatchPrepared(handle)` persists `dispatched` before adapter I/O and
   invokes the dedicated secret-bearing adapter handoff; and
4. `recover()` applies prepared cleanup or observe-only lookup under the rules
   in section 9.4.

The generic operator effect port and generic provider startup path never own a
launch step. The operator command journal records preparation and the stable
provider adapter/action pair. Pending, ambiguous and terminal
`OperatorActionStatus` values and the receipt project the provider-action
journal without rewriting the original command's before/after audit.

The service generates the chair credential with a cryptographically secure
random source and stores only its hash. Plaintext exists once in the volatile
post-commit handle. A dedicated versioned adapter method consumes that handle
at most once to configure the chair's local Fabric access. The secret is a
separate argument from the persisted, strict public launch payload; it is never
prompt/model input, provider payload/history, operator JSON, event, discovery
material, log or error detail. Adapter implementations shall redact the secret
before propagating any failure.

The provider session, not an adapter-local probe, supplies continuity evidence.
Launch custody creates a 32-byte one-use random challenge, persists only its
digest and sends the raw value only in the volatile private handoff. The exact
session must echo it in a native provider tool invocation. The provider contract
declares its invocation-attribution mechanism; the shipped adapter returns the
bounded provider-emitted session, turn and call identifiers plus response and
launch bindings. The daemon verifies them against custody before accepting the
canonical non-secret attestation digest. The adapter is the trusted translation
boundary, so conformance exercises its real code against a fake native provider
transport; adapter-local invocation with no provider event is rejected. Neither
challenge nor attestation may carry the credential.

On success the supervisor retains the owning adapter/session bridge for later
turns. The adapter may keep the credential only in volatile bridge state and
must not redisclose it or place it in model input/history. Pre-terminal bridge
loss is ambiguous. Post-terminal bridge loss is explicit context/chair loss:
the persisted resume reference alone cannot recreate continuity, and recovery
must fence or take over the chair under the existing generation/handoff rules.
Providers that cannot originate the attestation remain unproved and cannot
produce terminal success.

Dispatch return and lookup both parse the closed
`launch_adapter_outcome_v1` union from Spec 01. Only `terminal-success` with the
exact action pair, usable resume reference, positive provider generation and
complete per-reservation usage may activate. Only `terminal-no-effect` with a
contract-validated proof may fail cleanly. Accepted-only, absent, error,
malformed, incomplete or conflicting evidence becomes `ambiguous`. Launch
status and receipts expose the typed `LaunchProviderActionJournalRefV1`;
they never
fabricate an effect artifact to represent journal state.

### 9.9 Atomic custody, outcomes and retry

For an initial attempt, `prepareInTransaction` CASes `awaiting_launch` to
`launching`. For a retry, it CASes `launch_failed` to `launching`, replaces the
session packet path/digest with the newly reviewed reference and increments the
session revision. It then atomically creates or revalidates all of these rows:
coordination run; narrowed authority and budget; exactly one chair; random
capability hash; chair lease and mailbox; adapter binding;
project/session/run resource scopes and dimensions; a launch reservation whose
daemon-derived ID and `operation_id` bind the canonical provider adapter/action
pair; prepared
provider action; immutable custody ownership; required project-session
memberships; and the operator preparation. Every topology, revision,
generation, trust, resource and idempotency predicate is rechecked inside the
write transaction. Rollback retains the prior packet reference.

The custody row never stores outcome or plaintext and is never updated. Its
session attempt generation, run, chair, command, provider pair, capability
hash, reservation and binding digests permanently identify the attempt.
`provider_actions` owns progress and outcome. The daemon and every adapter
journal enforce the same global `(adapter_id, action_id)` identity, including
cross-run use.

The internal custody reconciler alone CASes `launching` to `active`,
`launch_failed` or `launch_ambiguous` from persisted provider evidence. A
`terminal-no-effect` result revokes the capability hash and chair lease,
releases the reservation and terminalises the run/action. An ambiguous result
retains its run, lease, hash, reservation and action identity and permits
lookup only. Neither restart nor duplicate commit dispatches it again.

For `terminal-success`, the active-state CAS and reservation reconciliation are
one transaction with persistence of the exact resume reference and provider
generation. Exact usage consumes each reported amount and releases the
remainder. An `unknown` dimension marks every affected ancestor unknown and
closes the reservation without restoring unproved capacity. Usage above the
reservation enters `recovery_required` rather than truncating evidence. A
`terminal-no-effect` result releases every reserved unit; ambiguity settles
nothing.

`launch_ambiguous` prohibits a retry or second chair. After lookup proves
failure, retry requires a fresh current-state preview, newly reviewed packet,
new run ID, new provider adapter/action pair, next custody attempt generation
and exact `retry_of` binding to the failed row. Its commit atomically replaces
the session packet reference; no public transition performs that launch-owned
CAS. An exact duplicate commit returns the existing public result without
another transaction effect or adapter call; a changed replay conflicts. Failed
and ambiguous custody rows remain immutable.

### 9.10 Launch-custody verification additions

Deterministic fake-adapter and crash-injection gates shall prove:

- a fresh `decide`/transition command cannot enter or leave launch-owned state,
  and leaves zero run, action, lease, reservation or custody rows;
- a fault after every preparation statement rolls back every launch-owned row;
- a crash after prepared commit and before dispatch makes zero adapter calls on
  restart, revokes the capability hash and chair lease, releases the
  reservation and records proved failure;
- a crash after persisted `dispatched`, before or during adapter I/O, performs
  pair-keyed lookup only on restart;
- provider acceptance before core outcome persistence activates the same run
  exactly once after lookup only when terminal success includes the exact
  resume reference and provider generation;
- wrapper-only probes, wrong-session or replayed challenges and a bridge closed
  at launch return cannot produce terminal success; the exact provider session
  must originate attestation and remain reachable through its owning bridge;
- accepted-only, missing-resume, absent, error, malformed and conflicting
  lookup fixtures remain ambiguous, while a contract-valid no-effect proof
  alone produces failed cleanup;
- two concurrent coordinated commits produce at most one non-terminal run,
  chair and provider action;
- an exact duplicate commit dispatches once, while a changed replay conflicts;
- packet, plan, project/session revision, trust record, adapter contract or
  resource state change after preview rejects with zero effect;
- unknown/extra artifact fields, symlink escape, authority widening and
  forbidden provider controls reject before persistence;
- cross-run reuse of one adapter/action pair fails before adapter I/O, including
  migration preflight and adapter-journal coverage;
- an ambiguous launch retains the run, lease, capability hash and reservation,
  and cannot retry or create another chair;
- terminal success consumes exact reported usage, releases its remainder and
  propagates unknown dimensions without restoring unproved capacity; no-effect
  failure releases the full reservation;
- pending, ambiguous and terminal launch projections preserve the exact typed
  provider-action reference without a synthetic effect artifact;
- a secret canary is absent from protocol responses, previews, projections,
  commands, provider payload/history, events, receipts, discovery material,
  logs and adapter errors;
- a proved-failure retry requires a new reviewed packet, run, action pair and
  incremented custody attempt generation with the exact prior binding, and its
  packet replacement rolls back with any failed commit; and
- public `operatorActionReconcile` rejects launch, while internal custody
  lookup alone may resolve it.

These gates also cover private/public principal separation, trust-root recheck,
duplicate local provisioning and daemon restart without blind chair respawn.

### 9.11 Schema-derived MCP and provider-session tool projection

One daemon-owned authenticated agent protocol is the transport authority for
both standalone MCP proxies and retained launched-chair bridges. MCP tool
descriptors are generated from the exhaustive `tool` classifications in the
active agent-principal operation registry and the protocol's closed input/output
codecs. The registry is the only membership/name owner; documentation and
provider projections consume its generated artifact. Startup negotiates the
current feature and operation grant before `tools/list`; a stale descriptor, missing
feature or revoked generation is removed or rejected before daemon mutation.
The current private-control method vocabulary cannot own the MCP tool list or
bypass public principal/generation checks.

`bindCurrentMcpSeats` requires the exact expected prior generation and a
content-addressed immutable replacement. The database persists immutable
generation/member rows, owns one active generation per project and revokes the
prior member capabilities in the activation transaction. Exact replay of the
active generation is safe; reuse of a retired generation, a stale predecessor
or a crossed project/session/run binding is rejected. Filesystem publication
stages and fsyncs a complete immutable generation, then under an OS-backed
per-project lock compare-and-swaps `current.json`, including its predecessor.
Interrupted staging leaves the prior complete pointer active and a delayed old
writer cannot restore an earlier generation. No flat-file or prior-generation
authentication fallback exists.

The standalone proxy accepts only an `afc_` agent capability and requests an
agent principal. A bootstrap `afb_` credential is rejected before `tools/list`;
there is no private run-creation descriptor. Every active agent
operation is classified `tool` or `none`, and the build fails for an absent or
stale classification. V1 projects exactly one complete descriptor per operation
and permits no constant-bound aliases. Secret-bearing `registerAgent` and
`rotateCapability` remain `none`.

Provider adapters project the same descriptors into their supported native
tool mechanism. The Claude SDK bridge owns one in-process MCP server per live
chair session. The Codex app-server bridge owns dynamic tools on the exact
retained thread/connection. Both validate the provider-emitted invocation,
closed arguments and exact closed daemon result; both retain only volatile
credential and transport state. The attestation challenge is an additional private tool and
is not a substitute for the coordination surface. It remains a registry-owned
`tool` operation, projected only by the launch-attestation feature/grant and
excluded from standalone proxies. Successful launch retains
the adapter process/connection so a later provider turn can call a normal
Fabric tool. Release or supervisor shutdown closes it once. Unexpected loss
before terminal launch is ambiguous; loss after activation journals provider-
context/chair loss and fences normal delivery/turn authority.

Spawn and attach use the existing custody owner rather than a parallel secret
path. The daemon prepares the target capability hash and stable provider action
before I/O. A bridge-capable adapter consumes plaintext once through private
volatile handoff, journals the stable action and retains a generation-bound
bridge; lookup alone resolves ambiguity after restart. Public protocol and MCP
results replace the token with target identity plus `bridgeState` and
`bridgeGeneration`. An adapter without bridge provisioning reports that closed
capability before dispatch; attach may remain an honest bridge-less participant,
but no surface claims provider-originated Fabric access. Raw adapter result JSON
is never model-visible: the public codec exposes only typed contract evidence
and canonical digests. A non-review task-bound ephemeral action may retain its
validated bounded `providerAnswer`; a certifying review exposes only answer
digest and safe parsed result. Every variant has `additionalProperties: false`.

The hard projection limits are 96 tools, 32 KiB canonical JSON per descriptor
and 512 KiB for the complete descriptor set. The complete authorised set must
fit and match across projections; exceeding any bound rejects MCP connection or
chair launch with the exact excess descriptor names. It is never truncated.
Arguments/results use the negotiated 1 MiB frame, 32 pending-call, 16 in-flight,
30-second request and five-minute idle maxima from the public protocol. The
runtime shall bound buffered output and error detail. It shall never
forward terminal control, credentials, raw transport failures or unvalidated
provider output. Duplicate tool calls retain the underlying protocol command
identity and idempotency behavior; a proxy or provider crash cannot blindly
replay a side effect. Closing one MCP proxy or provider bridge does not stop the
shared daemon while any authoritative liveness predicate remains.

Deterministic acceptance adds:

- generated descriptor parity against every active Spec 05 agent operation and
  negative drift fixtures for an added/removed/unclassified operation or feature;
- bootstrap-credential rejection before tool advertisement; no
  `fabric_run_create`; exhaustive `tool`/`none` classification and no copied or
  constant-bound alias descriptors;
- codec-wide secret scans plus spawn/attach custody tests proving secret-free
  public/MCP results, exact bridge-state honesty, supported later-turn calls and
  unsupported bridge absence without fabricated continuity;
- identical tool names and closed schemas across standalone Claude/Codex MCP,
  Claude SDK MCP and Codex dynamic-tool projections;
- point-of-use wrong-run, wrong-chair, wrong-session-generation, revoked,
  expired and action-insufficient rejection through every projection;
- provider-originated attestation followed by a distinct later-turn mailbox or
  coordination call over the same bridge, with zero wrapper self-probe path;
- bridge/proxy crash, timeout, malformed argument/result, oversize, duplicate
  and concurrent-call coverage without daemon loss, duplicate external effect
  or false task/message completion; and
- end-to-end MCP proxy and production Console/TUI dogfood against one real
  elected daemon and canonical socket; real-provider later-turn dogfood uses an
  already authenticated installation only when the run has explicit provider
  authority, performs no login or persistent MCP registration, and otherwise
  records a non-passing `not-run` gate rather than substituting a fake.

### 9.12 Bridge-loss recovery and lifecycle retirement

Startup and live adapter supervision compare every active retained chair and
child bridge with the volatile retained-bridge registry. A missing/closed chair
bridge atomically persists one immutable loss row under the daemon generation, freezes the old
chair lease/delivery/grants, revokes the old capability and CASes the run and
session to `recovery_required`. The recovery manifest hashes current task,
mailbox, lease, checkpoint, membership, provider and revision facts. Repeated
observation is idempotent; absence of a bridge is never inferred as provider
death or a safe retry.

A missing/closed non-chair child bridge instead persists one immutable child
loss, revokes its exact capability, advances the bridge generation and projects
`lost`/`none` without forcing the run or project session into
`recovery_required`. Repeated detection is idempotent; the dead transport cannot
authenticate or replay a provider call. Chair-only recovery custody below does
not silently rebind a child.

An operator-authorised recovery custody row binds the loss, manifest, selected
path, expected generations/revisions, adapter contract and stable action ID.
`rebind` prepares a new hash-only capability and daemon challenge under a higher
generation, then dispatches once to the dedicated adapter reattach operation.
The same provider resume reference is context only: fresh native tool-call
attestation is mandatory. `takeover` requires a named successor whose live
bridge and narrowed authority are current. `abandon` records the terminal loss
path. Prepared restart performs zero adapter I/O; dispatched/accepted/ambiguous
restart performs pair-keyed lookup only. Terminal success atomically activates
the new generation and retains its bridge. Failure cleans only proved no-effect;
ambiguity retains custody and remains fenced.
