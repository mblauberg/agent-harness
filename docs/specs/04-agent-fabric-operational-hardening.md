# Agent fabric operational hardening

Status: Draft v1.31 amendment under re-audit and repair; implementation and
final human acceptance pending
Version: 1.31
Date: 13 July 2026
Risk: Crucial
Chair: Codex
Independent design peer: Claude Code

Version 1.31 is a draft amendment pending a fresh anchored audit, repair and
independent review
of its externally authenticated lifecycle-receipt persistence. It owns the
daemon and persistence side of the final Console read
surface. It adds indexed current-preparation and provider-route reads, binds
every task/agent/evidence/activity projection to its exact project/session/run scope,
and uses the immutable per-run route ordinal watermark to keep pagination
coherent. It also closes portal cleanup around same-filesystem trusted claims,
pre-artifact intent, an exact pre-exec registration/ACK and provider-exec
closure, a closed provider launch/source-contract grammar, durable HOME/temp/
entry/directory phases and kind-specific identity. Lifecycle terminal and
review-adoption decisions additionally require an external append-only receipt
authority. It adds no
legacy schema, automatic router or second projection store. Version 1.30 closes capability-body refresh, discovery-manifest, effective-
configuration, actual review identity, context-pressure and topology-wave
persistence. It also repairs the authority/cut composite keys and retains one
daemon owner without a legacy path. Version 1.29 persists the shared capability and deployed-route codecs, binds
capability currency into admission and the final pre-dispatch CAS, and keeps
context pressure separate from spend. It reuses the existing lifecycle owner
and adds no automatic pressure controller or legacy schema. Version 1.28 makes receipt/bundle digest domains, paged finding custody,
certification cuts, live route recovery, lifecycle exits and minimum terminal
geometry directly enforceable in persistence. It closes the remaining
crossed-key, crash-path and observation-replay gaps without a legacy path.
Version 1.27 makes review-target construction asynchronous and crash-recoverable,
retains review evidence across proved same-agent lifecycle rotation, and
replaces the impossible inherited-descriptor helper handoff with a peer-
authenticated per-action Unix-socket supervisor. It also makes the provider
action pair globally canonical, freezes the review-diff and standalone receipt
catalogues, and enforces monotonic provider-context telemetry. Version 1.26
makes complete delivery review bytes, publisher/session lineage,
chair/profile lineage, slot heads and safe output immutable daemon custody. It
adds content-addressed bundle objects/chunks, a digest-bound bundle-only portal,
bounded stable-key router admission, explicit terminal failure/integrity
states, and one certifying-action recovery/retirement owner. Raw answers/errors remain
private. Lifecycle rotation is accepted-suspended and finishes asynchronously
under dedicated provider/bridge custody with global identity and owner-scoped
bridge high-water fencing. The squashed baseline contains no
predecessor routing/review table, API or receipt shape. Version 1.25 makes provider-review routing and certification daemon-owned. The
current baseline binds one canonical trusted-router request/receipt pair to
each task-bound answer-bearing action before provider I/O, stores one
chair-created but daemon-derived review-lineage record after terminal result,
and exports the exact route, action, task, answer/result and artifact-publisher
chain. Exact replay never reruns the router and recovery never reconstructs a
route from caller bytes. The pre-release baseline replaces the caller-writable
post-hoc routing and cross-family review tables and APIs; no legacy import or
compatibility projection is retained. This amendment does not approve later
continuity-routing features. Version 1.24 makes answer-bearing task work asynchronous behind the binding
30-second public request maximum. Dispatch returns only after immutable action,
budget custody and command receipt commit, then a bounded FIFO daemon worker
claims and settles the same row. Read supplies the terminal answer; disconnect
and retry cannot duplicate the provider effect, and shutdown drains tracked
work before closing its adapter and SQLite. Version 1.23 makes vector-valued ephemeral
provider-budget custody durable in
the current SQLite baseline, derives Console gate/intake bindings from
authoritative rows, and confines Claude review tooling to `Read`, `Glob` and
`Grep` beneath the trusted realpath of the admitted working root. Recovery
retains validated answer-bearing terminal results, settles exact usage once
from terminal evidence and freezes only unprovable dimensions on quarantine
until authenticated reconciliation. No adapter
may widen the read root, follow a symlink outside it or gain Bash, edit or
network authority from a review prompt. Version 1.22 completes the current MCP seat cutover as a database and
filesystem compare-and-swap rather than a client-side pointer convention. The
daemon owns immutable generation/member records and one active project pointer;
activation transactionally revokes the prior roster. Every private and public
credential check revalidates that active generation, the current session/run,
chair lease, lifecycle and capability identity. Filesystem staging is immutable,
fsynced and `flock`-serialised against the exact predecessor. Version 1.21
permits one closed public text field for answer-bearing work without weakening
the raw-result boundary. A task-bound ephemeral spawn must use an adapter that
advertises answer-bearing support; Fabric validates a nonempty bounded UTF-8
provider result string and persists the complete private result. Version 1.26
narrows certifying-review projection to answer digest plus safe parsed result;
non-review work retains the bounded answer contract.
Resume references, usage, transport data, credentials and arbitrary result
members remain private. Version 1.20 binds busy-incumbent attach before SQLite
inspection and makes the
current MCP seat roster a daemon-owned generation CAS. A compatible incumbent
is authenticated through its private handshake without racing its live WAL;
only the elected no-incumbent spawn path inspects/publishes state. Seat
activation atomically supersedes and revokes the prior roster, and private
filesystem publication compare-and-swaps the same expected generation so a
delayed writer cannot roll the roster back. Version 1.19 remains the normative
pre-release consolidation. It owns one current
database baseline and manifest, one current public protocol, the current
private-control wire, exact project/session/run topology, coordinated
workstreams, generation-bound live chair handoff and typed operator effects.
Earlier amendment requirements remain only where they describe current
behaviour. Any later reference to an incremental migration number, vintage
daemon/client, implicit run import, retired decoder, coarse authority bundle or
compatibility retry is superseded and is not an implementation requirement.
Current optional-feature negotiation, provider capability checks and pinned
adapter artifacts remain security controls, not backward-compatibility paths.

## 1. Decision and relationship to existing specs

Implement the accepted evidence-backed operational hardening without reopening
the accepted architecture in Specs 01–03. Superseded review transcripts and
adjudication notes are run evidence, not durable research owners.

- Spec 01 remains the fabric behaviour contract.
- Spec 02 remains the domain-neutral delivery lifecycle and explicitly does
  not reimplement the fabric.
- Spec 03 remains the adapter activation and local-operations contract.
- This spec owns operational bounds, portability, deterministic exports,
  database enforcement and repository assurance.

The human's instruction to review the source, select the exact design and
implement it entirely is the implementation authority for this spec. It does
not authorise Git push, public release, remote listeners, provider login
changes, destructive pruning or production promotion.

## 2. Outcome

Turn the activated local fabric into a bounded, versioned, migratable and
reproducibly tested shared system that can be safely admitted to exact project
roots. Preserve one daemon, one SQLite transaction owner, provider-neutral MCP
access and Herdr's non-authoritative visibility role.

Because the system has not reached its first accepted release, hardening
targets the current baseline rather than historical installation compatibility.
The checked-in schema is squashed to one fresh-state migration. Startup against
any earlier migration registry or unknown schema fingerprint returns a typed
cutover-required failure before mutation. It leaves the database and filesystem
evidence untouched. Preflight/backfill code, fixtures and fallback branches
whose only purpose is importing those earlier shapes shall be removed.

Protocol initialization still rejects mismatched peers, but it does not retry
an old profile or translate old result shapes. Independently optional current
features continue to use exact negotiation, and adapter compatibility manifests
continue to pin executable, wrapper and schema artifacts.

## 3. Required behaviour

### 3.1 Repository assurance

1. Pull-request CI runs the Python/harness gate and the full Node fabric gate:
   clean install, typecheck, unit/integration/acceptance tests, build,
   evaluation, load and production dependency audit.
2. GitHub Actions use immutable commit SHAs with least-privilege workflow
   permissions.
3. CODEOWNERS, dependency-update policy and a PR evidence template cover the
   fabric, migrations, schemas, routing and security-sensitive configuration.
4. A deterministic repository test rejects mutable Action references or a CI
   workflow that omits either harness or fabric gates.

### 3.2 Bounded, versioned local protocol

1. One shared bounded-NDJSON module owns incremental UTF-8 framing for daemon,
   client and adapter-server transports. It rejects oversized or malformed
   frames before unbounded buffering.
2. Trusted limits cover frame bytes, simultaneous daemon connections,
   per-connection in-flight commands, client pending calls, adapter in-flight
   requests and idle/deadline behaviour. Projects may narrow but not widen
   global maxima.
3. Daemon connections perform an `initialize` handshake before ordinary
   methods. The response identifies protocol version, daemon version,
   capabilities and effective limits. Unsupported versions and pre-handshake
   commands fail closed.
4. Response writes respect stream backpressure. Overload returns typed errors;
   it does not start more work and hope the process survives.
5. Bootstrap authority remains limited after initialisation to exact-root local
   operator provisioning and current private-control discovery. It cannot
   create a run, is never accepted on the public operator protocol and cannot
   perform project-session, gate, Git or provider actions.

### 3.3 Exact workspace trust

1. Machine-local trust lives under the private fabric state directory, never
   in Git. Each entry records canonical root, approval time, optional expiry
   and allowed execution profiles.
2. `workspace trust`, `inspect`, `list` and `revoke` are explicit operator CLI
   actions. Symlinks, ancestor broadening, `$HOME`-wide trust and malformed or
   expired entries fail closed.
3. The portable configuration defines the maximum policy. The local registry
   admits exact additional roots; project and run authority only narrow them.
4. Trust changes use private files, atomic replace and deterministic metadata;
   bearer capabilities are never stored in the registry.

### 3.4 Database integrity and maintenance

1. `0001-current-baseline.sql` creates the complete current schema from an
   absent database path. A checked-in manifest binds its file digest and
   canonical SQLite catalogue digest.
2. Any pre-existing path is inspected read-only first. Empty, non-SQLite,
   earlier, future, missing-metadata or catalogue-mismatched state returns
   `SCHEMA_CUTOVER_REQUIRED` before permission, WAL, marker, socket or sidecar
   mutation.
3. Exact current state may reopen read/write. Startup runs bounded
   integrity/foreign-key checks after an unclean marker.
   Long-lived connections run documented `PRAGMA optimize` maintenance.
4. Query-plan tests prove the mailbox, task-owner/state, lease-expiry,
   event-cursor and unresolved-provider-action paths use intended indexes.
5. A central invariant catalogue maps every enforced invariant to tests.

### 3.5 Retention and archive controls

1. `retention status` and `retention preview` classify terminal-run data and
   report what a project policy could archive or prune.
2. `archive` produces a hash-bound, non-destructive coordination snapshot.
3. This spec does not implement automatic deletion. Any future `apply` command,
   duration defaults or legal-hold semantics require a separate human-approved
   policy and destructive-action gate.
4. Unknown files, active/quarantined runs, provider-native sessions,
   capabilities and substantive project artifacts are never deletion
   candidates.

### 3.6 Deterministic current receipt

1. The canonical snapshot contains committed state only and is byte-identical
   across repeated exports of unchanged state.
2. Export metadata is separate from the hashable snapshot.
3. `taskOwners` replaces the false `stageOwners` label. Deliveries are counted
   by explicit state; no total-row count is called delivered.
4. The snapshot includes an event watermark and state hash. Nested structures
   are closed and versioned.
5. Schema version 2 is the sole current fabric-receipt schema. The runtime has
   no v1 decoder, importer, projection or compatibility fixture. An older file
   is preserved as an unknown user artifact but is not protocol evidence.
   Immutable schema-v2 receipt history is never rewritten.
6. Export uses bounded two-phase publication. Phase A fixes the database
   watermark/owner revisions plus exact Git HEAD/tree/index/worktree and
   registered external source/evidence currency tokens and writes a private
   candidate. Phase B equality-rechecks database revisions and reruns fixed no-
   follow external reads before atomic publication. Drift discards and retries
   or fails; a receipt cannot publish review completion against stale bytes.

### 3.7 Machine status and documentation

1. `agent-fabric status --json` reports daemon reachability, protocol,
   configured/active adapters, trusted roots and current project seat metadata
   without capability values.
2. `agent-fabric doctor --json` verifies configuration, compatibility pins,
   state permissions, database checks and socket ownership with typed results.
3. Repository documentation describes expected setup. Current workstation run
   IDs, project keys, expiry and pane IDs come from status output, not committed
   prose.

### 3.8 Incremental modularity and testing

1. `Fabric` remains the current coordination façade and sole cross-domain transaction
   owner. This programme extracts only stable seams created by the changes:
   wire framing/negotiation, workspace trust, retention/archive, database
   maintenance and receipt snapshot projection.
2. No network microservices, parallel mutation owners or second authority
   store are introduced.
3. Deterministic tests cover oversized frames, connection/in-flight overload,
   pre-handshake methods, mixed versions, backpressure, trust symlink/expiry,
   invalid current rows, baseline atomicity and preservation, query plans,
   repeated receipt export, archive integrity and daemon restart.
4. Fresh native and other-primary reviews must report no unresolved P0–P2
   findings before human acceptance.

## 4. Explicit rejections

- The model router does not decide topology; the accountable chair and
  `orchestrate` do.
- No weighted quality/cost scoring without a calibrated evaluation proving the
  factors predict outcomes.
- No second canonical skill registry; the active skill-portfolio effort owns
  skill governance.
- No automatic evidence deletion or age-implied authority.
- No mandatory autonomous self-halt that contradicts a human `until STOP`
  contract; authority expiry and bounded retries still fail safe.
- No provider rollback, A2A gateway, remote listener, external dashboard or
  daemon microservices.
- No wholesale rewrite of `Fabric` or all protocol surfaces in one change.

## 5. Implementation sequence and ownership

| Package | Owner | Depends on | Write scope |
| --- | --- | --- | --- |
| WP1 CI and repository policy | CI worker | Spec | `.github/`, CI policy tests |
| WP2 bounded wire protocol | Protocol worker | Spec limits | transport, daemon/adapter server, protocol tests |
| WP3 SQLite integrity | Persistence worker | Spec invariants | current baseline, persistence, catalogue/query-plan tests |
| WP4 trust/status/retention | Operations worker | wire status contract | CLI/application modules and focused tests |
| WP5 current receipt | Receipt worker | event watermark | exports/schemas and focused tests |
| WP6 serial integration | Chair | WP1–WP5 | shared configuration, façade wiring, docs, receipts |
| WP7 independent verification | read-only reviewers | integrated tree | findings only |

No two workers edit the same source surface. Cross-cutting application is
serial through the chair.

## 6. Defaults and hard maxima

Initial global maxima are conservative local-process limits:

```yaml
protocol:
  version: 1
  maximumFrameBytes: 1048576
  maximumConnections: 32
  maximumInFlightPerConnection: 16
  maximumTotalInFlight: 128
  maximumClientPending: 32
  maximumAdapterInFlight: 8
  idleTimeoutMs: 300000
```

These are operational safety bounds, not throughput targets. Load evidence may
support a later human-approved change.

## 7. Cutover and rollback

1. There is no in-place pre-release database migration. A pre-existing path is
   evidence and is inspected read-only against the exact current manifest.
2. Fresh initialization writes a private temporary database, installs the
   complete baseline transactionally, runs `foreign_key_check`, `quick_check`
   and catalogue assertions, fsyncs, then publishes without overwrite.
3. Failure leaves either no final path or one complete current database.
   Existing incompatible state and its sidecars, mode, timestamps and directory
   entries remain unchanged.
4. Protocol clients and daemon are deployed together locally. Version mismatch
   fails closed; there is no downgrade or translation path.
5. Workspace trust and archive metadata are independent private files and can
   be revoked without database mutation.
6. Receipt consumers and producers use schema version 2 together. Any other
   version fails closed without translation or import.

## 8. Acceptance

- Full runtime and harness gates pass from a clean install-compatible state.
- CI-policy tests prove immutable Actions and complete fabric coverage.
- All resource, protocol, trust, database, retention, receipt and status
  acceptance tests pass.
- The existing five adapter smokes and five-seat MCP health/round-trip remain
  green after hardening.
- Spec 03 rollback to coordination-only remains possible.
- Fresh OpenAI-native and Anthropic-primary reviews are clean at P0–P2.
- Canonical delivery receipt validates at `awaiting_acceptance`.
- Human final acceptance remains pending; Git push and release remain separate
  gates.

## 9. Project Console daemon and persistence amendment

This amendment is approved by Spec 05 v1.0 and the direct implementation
instruction of 11 July 2026. Spec 01 owns the new protocol entities and atomic
coordination invariants. This spec owns their additive persistence, lock-safe
on-demand daemon bootstrap, global liveness and stop predicates, notification
outbox and crash recovery.

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

The four direct lifecycle protocol operations are retired and never granted.
Only `OperatorActionIntent` lifecycle variants may reach production state/effect
ports because they bind preview, exact global state, session/run generation,
consequence evidence and confirmation. Compatibility decoders may explain the
replacement but cannot capture a current revision or execute.

Verification adds crash points before/after every loss/recovery statement,
daemon restart with an active launched chair, same-action lookup recovery,
wrong loss/manifest/generation, stale resume reference, missing native callback,
successor-without-live-bridge, explicit abandon and duplicate observation. It
also asserts the direct lifecycle operations are absent from every grant/client
and return retirement errors if sent manually. Child-bridge coverage drops a
post-activation transport and proves loss persistence, capability revocation,
generation advance, honest projection and later-call rejection without
chair-level run fencing.

### 9.13 Typed Git grants, effect custody and recovery

Spec 01 section 32.13 owns `GitActionAuthorisation` and the observable Git
semantics. This section owns their additive persistence, the one production Git
effect owner and crash recovery. It does not authorise a Git mutation, push,
pull-request merge, release or deployment.

The next unused additive migration after the operator-lifecycle schema shall
add immutable revisioned Git grants and a one-to-one Git binding for the
existing `operator_effect_custody` owner. Its ordinal is assigned at serial
integration so it cannot collide with another already approved additive
migration. The migration shall not create a second operator command journal or
a parallel effect state machine.

The migration adds `runs.authority_revision` and `runs.git_allowlist_epoch`,
each initialised to one, plus nullable `runs.git_allowlist_digest` and immutable
`run_authority_revisions(project_session_id, coordination_run_id,
authority_revision, authority_ref, git_allowlist_epoch, git_allowlist_digest,
activated_at_run_revision, created_at)`.
`runs` is the current revision owner. Authority rotation compare-and-sets the
current tuple, appends the next contiguous history row, increments both
authority and run revisions and revokes every active Git grant under the old
tuple in one transaction. `runs.dependency_revision` remains the canonical
dependency owner; no grant-local counter may substitute for either revision.
The history primary key is `(project_session_id, coordination_run_id,
authority_revision)`. The exact four-column tuple `(project_session_id,
coordination_run_id, authority_revision, authority_ref)` is `UNIQUE`, so the
existing `operator_git_effect_bindings` composite foreign key has a valid parent
key; the exact six-column tuple `(project_session_id, coordination_run_id,
authority_revision, authority_ref, git_allowlist_epoch, git_allowlist_digest)`
is likewise declared `UNIQUE`, so the allow-list-bound `operator_git_grants`
composite foreign key also has a valid parent key.
The history has a composite foreign key to `runs`. Insert/update triggers require the current
`runs` authority tuple to have exactly one matching immutable history row.
Adding, replacing or removing `git_allowlist_v1` appends authority history and
advances the run's authority revision/ref and allow-list epoch/digest in the
same transaction. No other run/session/dependency revision change advances the
allow-list epoch.

The daemon also persists two trusted registries before accepting a grant:

- `git_execution_profiles` binds profile ID/revision, Git binary path/version/
  digest, object format, deterministic backend IDs, sanitised config/environment
  digest, helper/sandbox registry digest and hard result bounds. Trusted machine
  configuration alone may add a profile; project configuration may only select
  an allow-listed profile.
- `git_remote_registrations` binds registration ID/revision/generation,
  project, display name, normalised secret-free target identity/digest,
  transport kind, remote-port adapter/contract and credential-selector digest.
  Retargeting appends a revision and advances generation. One display name may
  have only one active target per project, but that name is never a foreign key
  or authority identity.

Registry lifecycle changes increment daemon global state. Profiles and remote
registrations contain no credential value or project-selected executable. A
grant/action/recovery lookup references their exact composite identity and
digest; it never resolves authority from `.git/config`.

The closed logical grant shape is:

```sql
CREATE TABLE operator_git_grants (
  grant_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  session_generation INTEGER NOT NULL CHECK (session_generation >= 1),
  issuing_session_revision INTEGER NOT NULL CHECK (issuing_session_revision >= 1),
  coordination_run_id TEXT NOT NULL,
  issuing_run_revision INTEGER NOT NULL CHECK (issuing_run_revision >= 1),
  issuing_dependency_revision INTEGER NOT NULL CHECK (issuing_dependency_revision >= 1),
  authority_ref TEXT NOT NULL,
  authority_revision INTEGER NOT NULL CHECK (authority_revision >= 1),
  git_allowlist_epoch INTEGER NOT NULL CHECK (git_allowlist_epoch >= 1),
  git_allowlist_digest TEXT NOT NULL,
  repository_root TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  execution_profile_id TEXT NOT NULL,
  execution_profile_revision INTEGER NOT NULL CHECK (execution_profile_revision >= 1),
  execution_profile_digest TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('launch-envelope','operator-command')),
  source_digest TEXT NOT NULL,
  constraints_json TEXT NOT NULL,
  grant_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active','revoked')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (grant_id, revision),
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY (project_session_id, coordination_run_id,
               authority_revision, authority_ref,
               git_allowlist_epoch, git_allowlist_digest)
    REFERENCES run_authority_revisions(
      project_session_id, coordination_run_id, authority_revision,
      authority_ref, git_allowlist_epoch, git_allowlist_digest),
  FOREIGN KEY (execution_profile_id, execution_profile_revision)
    REFERENCES git_execution_profiles(profile_id, revision),
  CHECK (length(authority_ref)=71 AND substr(authority_ref,1,7)='sha256:'),
  CHECK (length(grant_digest)=71 AND substr(grant_digest,1,7)='sha256:'),
  CHECK ((state='active' AND revoked_at IS NULL) OR
         (state<>'active' AND revoked_at IS NOT NULL))
);
```

`constraints_json` is a canonical hash mirror, not the enforcement owner. The
migration normalises closed child rows for concrete operation variants,
registered remote identities/revisions/generations/target digests, fully
qualified refs and canonical path prefixes. Operation variants use a closed
enumeration and reject every gate-only value. Composite foreign keys bind each
remote child to `git_remote_registrations`. Empty child sets mean unavailable
for that category; no query treats absence as wildcard.

`grant_digest` hashes the immutable grant identity, captured issuing session/
run/dependency provenance, authority and allow-list tuple, repository/worktree,
execution profile, normalised child constraints, source authority and expiry;
later revocation fields are excluded. Launch custody may insert a grant only
from the exact approved launch-envelope digest. Later creation/revision/revocation uses a
separate previewed `git-authorise` operator command, verifies its capability and
independently attested human provenance, and proves every child row is a
positive subset of the current run `git_allowlist_v1`. `git` cannot call this
path. Missing parent allow-list rows, negative-only authority or any widened
dimension fails before insert.

A revision's binding and constraints are immutable; replacement appends the
next contiguous revision and revokes the prior active revision atomically. Only
one compare-and-set `active -> revoked` lifecycle change is allowed. At most
one revision of a grant is active. Point-of-use indexes cover expiry,
revocation/state, session generation, authority revision/ref, allow-list
epoch/digest, execution profile and remote registration generation. Separate
audit indexes expose issuing session/run/dependency provenance; current-value
queries never compare those issuance fields with the live orchestration
revisions. A grant record never contains a bearer capability, remote
credential, URL with credentials, Git argument vector or executable.

Gate-only identity is owned before gate creation by one bounded table:

```sql
CREATE TABLE git_operation_drafts (
  draft_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  draft_request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  observed_session_revision INTEGER NOT NULL,
  session_generation INTEGER NOT NULL,
  coordination_run_id TEXT NOT NULL,
  observed_run_revision INTEGER NOT NULL,
  observed_dependency_revision INTEGER NOT NULL,
  authority_ref TEXT NOT NULL,
  authority_revision INTEGER NOT NULL,
  git_allowlist_epoch INTEGER NOT NULL,
  git_allowlist_digest TEXT,
  draft_kind TEXT NOT NULL
    CHECK (draft_kind IN ('mutation','custody-resolution')),
  operation_id TEXT NOT NULL UNIQUE,
  operation_kind TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  binding_json TEXT NOT NULL,
  draft_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN
    ('open','gate-bound','consumed','stale','expired','cancelled')),
  expires_at INTEGER NOT NULL,
  consumed_command_id TEXT,
  terminal_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (operator_id, project_id, project_session_id, draft_request_id),
  UNIQUE (draft_id, operation_id),
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY (operation_id) REFERENCES operation_admissions(operation_id),
  CHECK ((state='consumed')=(consumed_command_id IS NOT NULL)),
  CHECK ((state IN ('stale','expired','cancelled'))=
         (terminal_reason IS NOT NULL))
);
```

The canonical closed `binding_json` is decoded by the same mutation or custody-
resolution codec as Spec 01, never as open JSON. Identity/binding/authority/
observation/expiry fields are immutable; only one-step revisioned lifecycle
fields advance. `draft_digest` hashes every immutable field including
`operation_id`; lifecycle/consumption fields are excluded. Draft creation and
its `prepared` operation admission commit together. Exact request replay
returns the same row; changed request content
under the dedupe key conflicts. Drafts have a bounded expiry and no repository
reservation, generic effect custody, grant use or liveness contribution.
The existing operator command journal owns draft `create`/`cancel` Preview/
Commit; the draft table is not another command or effect journal.

One active gate association is permitted per draft operation. Gate binding
compare-and-sets `open -> gate-bound`. Confirmed final Commit alone may consume
`gate-bound -> consumed` and admission `prepared -> authorised` in the same
transaction that creates mutation custody/reservation or records custody
resolution. Final Preview performs no lifecycle write. A binding mismatch
reported by Preview changes nothing; draft reconciliation or a confirmed Commit
compare-and-sets the draft to `stale` without creating effect rows. Expiry or
explicit cancellation uses its matching terminal state. Each terminal path
cancels the prepared admission and supersedes every associated gate
transactionally. No terminal draft can be reopened, rebound or copied into a
new operation ID. Gate rejection/cancellation/supersession cancels its draft;
gate deferral leaves the bounded draft `gate-bound` until another terminal path.

The common-directory reservation is also a persisted logical owner, not an
in-memory mutex:

```sql
CREATE TABLE git_mutation_reservations (
  custody_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  git_common_dir TEXT NOT NULL,
  common_dir_identity_digest TEXT NOT NULL,
  lock_plan_digest TEXT NOT NULL,
  state TEXT NOT NULL
    CHECK (state IN
      ('reserved','dispatching','conflict','ambiguous','quarantined',
       'released','retired')),
  owner_instance_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (custody_id, generation),
  FOREIGN KEY (custody_id) REFERENCES operator_effect_custody(custody_id),
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id)
);
CREATE UNIQUE INDEX one_active_git_mutation_per_common_dir
  ON git_mutation_reservations(git_common_dir)
  WHERE state IN
    ('reserved','dispatching','conflict','ambiguous','quarantined');
```

Canonical/no-follow common-directory identity, digest and lock plan are
immutable. State and owner advance only through custody-coupled compare-and-set
transitions. A terminal machine-proved applied/no-effect/rejected outcome
releases the row in the same transaction; conflict, ambiguity and quarantine
retain it. A separately authorised typed continue or abort atomically
transfers a predecessor conflict
reservation to the successor custody/generation before dispatch. Reclaim
requires proof that the recorded daemon instance is dead and may remove only
that instance's private reservation artifact, never a Git lock or project file.
Only the gate-bound human-resolution transaction below may retire an unprovable
reservation without machine outcome proof.

The one-to-one binding for the existing custody owner is logically:

```sql
CREATE TABLE operator_git_effect_bindings (
  custody_id TEXT PRIMARY KEY
    REFERENCES operator_effect_custody(custody_id),
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  prepared_session_revision INTEGER NOT NULL
    CHECK (prepared_session_revision >= 1),
  session_generation INTEGER NOT NULL CHECK (session_generation >= 1),
  coordination_run_id TEXT NOT NULL,
  prepared_run_revision INTEGER NOT NULL CHECK (prepared_run_revision >= 1),
  prepared_dependency_revision INTEGER NOT NULL
    CHECK (prepared_dependency_revision >= 1),
  authority_ref TEXT NOT NULL,
  authority_revision INTEGER NOT NULL CHECK (authority_revision >= 1),
  git_allowlist_epoch INTEGER NOT NULL CHECK (git_allowlist_epoch >= 1),
  git_allowlist_digest TEXT,
  grant_id TEXT,
  grant_revision INTEGER,
  draft_id TEXT,
  draft_revision INTEGER CHECK (draft_revision IS NULL OR draft_revision >= 1),
  gate_id TEXT,
  gate_revision INTEGER,
  repository_root TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  repository_state_digest TEXT NOT NULL,
  execution_profile_id TEXT NOT NULL,
  execution_profile_revision INTEGER NOT NULL
    CHECK (execution_profile_revision >= 1),
  execution_profile_digest TEXT NOT NULL,
  remote_registration_id TEXT,
  remote_registration_revision INTEGER,
  remote_generation INTEGER,
  remote_target_digest TEXT,
  operation_id TEXT NOT NULL,
  operation_variant TEXT NOT NULL,
  effect_binding_digest TEXT NOT NULL,
  result_recipe_digest TEXT NOT NULL,
  decision_digest TEXT NOT NULL,
  before_git_state_json TEXT NOT NULL,
  expected_terminal_state_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN
    ('prepared','dispatching','conflict','conflict-transferred','ambiguous',
     'quarantined','applied','no-effect','rejected','failed',
     'human-resolved')),
  state_revision INTEGER NOT NULL CHECK (state_revision >= 1),
  terminal_basis TEXT CHECK (terminal_basis IS NULL OR terminal_basis IN
    ('machine-proof','conflict-transfer','human-adjudication')),
  predecessor_custody_id TEXT,
  predecessor_conflict_generation INTEGER CHECK (
    predecessor_conflict_generation IS NULL OR
    predecessor_conflict_generation >= 1),
  owned_conflict_generation INTEGER CHECK (
    owned_conflict_generation IS NULL OR owned_conflict_generation >= 1),
  mutation_reservation_generation INTEGER NOT NULL
    CHECK (mutation_reservation_generation >= 1),
  lock_plan_digest TEXT NOT NULL,
  lookup_generation INTEGER NOT NULL CHECK (lookup_generation >= 0),
  lookup_evidence_digest TEXT,
  lookup_outcome TEXT CHECK (lookup_outcome IS NULL OR lookup_outcome IN
    ('exact-conflict','exact-applied','exact-no-effect','incomplete',
     'unavailable','inconsistent','inspector-unavailable',
     'remote-proof-permanently-unavailable','mixed-local-remote-evidence',
     'evidence-integrity-failure','conflict-state-unverifiable')),
  lookup_failure_signature_digest TEXT,
  lookup_observed_at INTEGER,
  resolution_eligible INTEGER NOT NULL CHECK (resolution_eligible IN (0,1)),
  resolution_eligible_lookup_generation INTEGER,
  resolution_eligible_evidence_digest TEXT,
  resolution_eligibility_reason TEXT CHECK (
    resolution_eligibility_reason IS NULL OR resolution_eligibility_reason IN
      ('inspector-unavailable','remote-proof-permanently-unavailable',
       'mixed-local-remote-evidence','evidence-integrity-failure',
       'conflict-state-unverifiable')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY (project_session_id, coordination_run_id,
               authority_revision, authority_ref)
    REFERENCES run_authority_revisions(
      project_session_id, coordination_run_id, authority_revision,
      authority_ref),
  FOREIGN KEY (grant_id, grant_revision)
    REFERENCES operator_git_grants(grant_id, revision),
  FOREIGN KEY (draft_id, operation_id)
    REFERENCES git_operation_drafts(draft_id, operation_id),
  FOREIGN KEY (gate_id, operation_id)
    REFERENCES scoped_gate_operations(gate_id, operation_id),
  FOREIGN KEY (operation_id) REFERENCES operation_admissions(operation_id),
  FOREIGN KEY (execution_profile_id, execution_profile_revision)
    REFERENCES git_execution_profiles(profile_id, revision),
  FOREIGN KEY (remote_registration_id, remote_registration_revision)
    REFERENCES git_remote_registrations(registration_id, revision),
  FOREIGN KEY (predecessor_custody_id)
    REFERENCES operator_git_effect_bindings(custody_id),
  FOREIGN KEY (custody_id, mutation_reservation_generation)
    REFERENCES git_mutation_reservations(custody_id, generation),
  CHECK ((grant_id IS NULL)=(grant_revision IS NULL)),
  CHECK ((draft_id IS NULL)=(draft_revision IS NULL)),
  CHECK ((gate_id IS NULL)=(gate_revision IS NULL)),
  CHECK ((draft_id IS NULL)=(gate_id IS NULL)),
  CHECK ((grant_id IS NULL)<>(gate_id IS NULL)),
  CHECK ((remote_registration_id IS NULL)=
         (remote_registration_revision IS NULL)),
  CHECK ((remote_registration_id IS NULL)=(remote_generation IS NULL)),
  CHECK ((remote_registration_id IS NULL)=(remote_target_digest IS NULL)),
  CHECK ((predecessor_custody_id IS NULL)=
         (predecessor_conflict_generation IS NULL)),
  CHECK ((lookup_generation=0)=(lookup_evidence_digest IS NULL)),
  CHECK ((lookup_generation=0)=(lookup_outcome IS NULL)),
  CHECK ((lookup_generation=0)=(lookup_observed_at IS NULL)),
  CHECK (lookup_evidence_digest IS NULL OR
         (length(lookup_evidence_digest)=71 AND
          substr(lookup_evidence_digest,1,7)='sha256:')),
  CHECK (lookup_failure_signature_digest IS NULL OR
         (length(lookup_failure_signature_digest)=71 AND
          substr(lookup_failure_signature_digest,1,7)='sha256:')),
  CHECK (
    (lookup_outcome IN
      ('incomplete','unavailable','inconsistent','inspector-unavailable',
       'remote-proof-permanently-unavailable','mixed-local-remote-evidence',
       'evidence-integrity-failure') AND
     lookup_failure_signature_digest IS NOT NULL) OR
    ((lookup_outcome IS NULL OR lookup_outcome NOT IN
      ('incomplete','unavailable','inconsistent','inspector-unavailable',
       'remote-proof-permanently-unavailable','mixed-local-remote-evidence',
       'evidence-integrity-failure')) AND
     lookup_failure_signature_digest IS NULL)),
  CHECK ((resolution_eligible=0)=
         (resolution_eligible_lookup_generation IS NULL)),
  CHECK ((resolution_eligible=0)=
         (resolution_eligible_evidence_digest IS NULL)),
  CHECK ((resolution_eligible=0)=
         (resolution_eligibility_reason IS NULL)),
  CHECK (resolution_eligible=0 OR
         resolution_eligible_lookup_generation=lookup_generation),
  CHECK (resolution_eligible=0 OR
         resolution_eligible_evidence_digest=lookup_evidence_digest),
  CHECK (resolution_eligible=0 OR
         resolution_eligibility_reason=lookup_outcome),
  CHECK (resolution_eligibility_reason<>'conflict-state-unverifiable' OR
         (state='quarantined' AND
          (owned_conflict_generation IS NOT NULL OR
           predecessor_conflict_generation IS NOT NULL)))
);
```

The binding's `prepared_session_revision`, `prepared_run_revision` and
`prepared_dependency_revision` are the final action's compare-and-set snapshot,
not grant-lifetime fields. They may differ from the grant's issuing provenance;
the grant remains valid if its live fences still match.

The migration transactionally widens the canonical
`operator_effect_custody.state` check with `conflict` and `quarantined`, and
widens `operation_admissions.state` with `conflict`, `ambiguous` and
`quarantined`. These are refinements of the existing owners, not parallel
journals. Generic-owner triggers reject those new states unless the exact Git
binding/admission/reservation join exists. Git lifecycle triggers permit only
the following row combinations
and update every named row in one transaction:

| Event | Git binding | Generic custody | Target admission | Reservation | Liveness |
| --- | --- | --- | --- | --- | --- |
| unconsumed gate draft | absent | absent | `prepared` | absent | no |
| final Commit prepared | `prepared` | `prepared` | `authorised` | `reserved` | yes |
| dispatch begins | `dispatching` | `dispatching` | `executing` | `dispatching` | yes |
| exact bounded conflict | `conflict` | `conflict` | `conflict` | `conflict` | yes |
| persisted owned/inherited conflict proved destroyed/altered | `quarantined` | `quarantined` | `quarantined` | `quarantined` | yes |
| outcome unknown | `ambiguous` | `ambiguous` | `ambiguous` | `ambiguous` | yes |
| machine proof permanently unavailable | `quarantined` | `quarantined` | `quarantined` | `quarantined` | yes |
| machine-proved applied | `applied` | `terminal` | `terminal` | `released` | no |
| machine-proved no effect | `no-effect` | `no-effect` | `terminal` | `released` | no |
| post-prepare proved reject/failure | `rejected`/`failed` | same | `cancelled` | `released` | no |
| conflict handed to typed successor | `conflict-transferred` | `terminal` | `terminal` | `released`; successor is `reserved` | successor only |
| human custody adjudication | `human-resolved` | `terminal` | `terminal` | `released` or `retired` | no |

An `applied`/`no-effect` terminal basis is `machine-proof`; a transferred
conflict is `conflict-transfer`; `human-resolved` is
`human-adjudication`. Triggers reject a terminal basis inconsistent with the
row combination, a conflict without one positive
`owned_conflict_generation`, an eligible-resolution marker outside
`ambiguous`/`quarantined`, or a marker whose generation/evidence does not equal
the latest lookup. There is exactly one current conflict owner and one active
reservation for a Git common directory.

An explicit authenticated conflict reconciliation binds the exact custody,
lineage generation, binding state revision, common-directory identity and prior
evidence. The Git-only `owned-conflict` form requires outer/binding state
`conflict`, positive owned generation and exact nullable predecessor
generation. The Git-only `inherited-successor` form requires positive
predecessor generation, null owned generation and one exact mapping of outer
status to binding state: `pending -> prepared`, `ambiguous -> ambiguous` or
`quarantined -> quarantined`. Both forms name the original target command and
compare-and-set reservation generation, lookup generation and nullable prior
evidence digest, and require the current resolution-eligibility discriminator
to be `none`. The original target's project/session are reauthenticated, but
the discriminator requires the distinct `git-custody-resolve` capability; the
original `git` capability alone is insufficient. Missing/stale/crossed lineage
fields, an existing eligibility marker or use by another action family changes
nothing. The inspector uses only
the sealed no-process typed local reader.
Complete proof that native operation state, index stages or the bounded
conflict-path manifest no longer equals the persisted conflict atomically
increments lookup and binding-state revisions, records the complete evidence
digest/outcome/time, moves the
Git binding, generic custody, admission and reservation from `conflict` to
`quarantined`, and sets the matching generation-bound `resolution_eligible`
marker with reason `conflict-state-unverifiable`. The reservation and liveness
blocker remain. Exact intact proof retains `conflict`; incomplete, unavailable
or internally inconsistent observation also retains it and creates no
eligibility marker; each accepted inspection still appends the next bounded
lookup evidence/outcome/time so a later request can compare-and-set it. This
transition invokes no Git process, remote call or mutation and cannot continue,
abort or restore the native operation.

For an inherited successor, exact intact proof atomically changes
`prepared|ambiguous|quarantined` to `conflict`, assigns the next positive owned
generation and retains the reservation. Complete proof that the inherited
native state/index/path manifest no longer holds atomically changes or retains
all four owners as `quarantined`, keeps owned generation null, retains the
positive predecessor generation and reservation, and sets the matching
`conflict-state-unverifiable` eligibility tuple. Incomplete, unavailable or
inconsistent proof moves `prepared` to `ambiguous` or retains the existing
ambiguity/quarantine without eligibility. No branch releases the transferred
reservation or rewrites predecessor machine evidence.

The same owned/inherited all-four-owner quarantine mapping is used for a closed
permanent `inspector-unavailable` or `evidence-integrity-failure` outcome, with
that exact outcome as the eligibility reason. Immediate permanent classification
is permitted only when the digest-pinned reader or trusted execution-profile
contract is absent/revoked for the target generation, or the sealed reader can
read the bounded canonical files but proves their format/hash relationship
cannot yield any complete observation. Otherwise `unavailable` and
`inconsistent` are transient. They become permanent only on the third
consecutive accepted lookup for the same custody/lineage and identical
normalised failure-signature digest, under distinct reconciliation commands
spanning at least 60 seconds with no intervening different outcome/signature.
The immutable reconciliation command results are the streak owner; the current
binding mirrors only the latest signature digest. Project files, operator text
and the caller cannot select a permanent code. Attempts one and two retain the
existing conflict or ambiguity/quarantine blocker without eligibility. The
third final-CAS transaction persists the permanent code/evidence/time, moves or
retains every owner in `quarantined`, retains the reservation and sets the exact
latest-generation eligibility tuple. Any different outcome/signature resets
the derived streak.

The public reconciliation codec is the exhaustive three-variant union in Spec
01: the generic `pending|ambiguous` form rejects `git_conflict`; the
`owned-conflict` form requires `conflict -> conflict`; and the
`inherited-successor` form requires one of the three exact outer/binding-state
mappings above. Each Git form requires every custody, lineage, binding-state,
reservation, common-directory and lookup compare-and-set field and rejects
extras, including any target whose resolution eligibility is not `none`. Their
required operator action is `git-custody-resolve`. The
daemon first journals the reconciliation command as observe-only/in-flight,
projected as `pending/observing` at exactly the next attempt generation, then
performs the bounded read. Its final transaction rechecks every requested
field, increments lookup and binding-state revisions, persists the closed
outcome/evidence/time, fixes the target at that same next attempt generation,
applies either the all-four-owner retained-conflict or
all-four-owner quarantine mapping, and stores the closed resulting
`OperatorActionStatus` snapshot in the same command row. A stale final recheck
atomically changes no custody/admission/reservation row and instead stores a
terminal `rejected` result with `state-changed` for a custody tuple mismatch,
`generation-stale` for principal/session generation mismatch or
`authority-insufficient` for expired/revoked/insufficient capability, plus the
target intent digest and original bounded evidence references in that
reconciliation command row. Crash
before either final branch leaves no custody transition; exact retry may repeat
only the read-only inspection. Once a status snapshot or stale rejection
commits, exact replay performs no inspection, status returns it immutably and
changed replay under that command ID conflicts. A later inspection uses a new
command over the latest target tuple.

`fabric.v1.operator-action.status` projects Git custody in `pending/prepared`,
`ambiguous`, `conflict` and `quarantined` only
through the closed `git_custody` status union in Spec 01. A target-command query
reads the current binding/generic-custody/admission/reservation join and rejects
an impossible combination. Only an inherited successor with binding
`prepared`, positive predecessor lineage, null owned generation and no
eligibility may use the `pending` status with `phase=prepared`; generic pending
effects retain the generic status without `git_custody`. A
reconciliation-command query returns
`pending/observing` while its bounded read has no terminal command result, then returns
the immutable stored status snapshot or closed stale rejection;
it never parses either as an operator-action receipt. Status requires `read`,
has no inspection side effect and exposes no repository path, Git output,
credential or command vector.

Confirmed Commit of `merge-continue`, `merge-abort`, `rebase-continue` or
`rebase-abort` revalidates the current conflict owner and generation. In one
transaction it terminalises that predecessor as `conflict-transferred`,
releases its reservation and creates the successor as
`prepared`/`authorised`/`reserved` over the exact conflict before-state. If the
successor never dispatches, or dispatch proves the identical conflict remains
with no other effect, recovery uses the sealed no-process typed local reader to
move the successor to `conflict` and make it the new owner instead of releasing
the repository. If exact unchanged-conflict proof is unavailable it becomes
ambiguous/quarantined without eligibility and defers any destroyed/altered
classification to the explicit `inherited-successor` observe path above. Exact
resolution releases
the reservation; another exact conflict records a higher owned generation;
ambiguity/quarantine follows the table. An old owner/generation, concurrent
successor or partial transfer fails atomically.

Draft rows never contribute liveness. Prepared through quarantined Git custody
does; conflict blocks project-session acceptance without forcing an unrelated
session state, ambiguity contributes `recovery_required`, and quarantine uses
the existing `quarantined` session/run state. Terminal rows do not contribute.
Restart joins all four owners and fails closed on any impossible combination;
it never repairs one row by guessing from another. Human resolution removes
the custody blocker only through the transaction defined below and does not
silently advance the session lifecycle.

Human adjudication has one immutable owner:

```sql
CREATE TABLE git_custody_resolutions (
  resolution_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES git_operation_drafts(draft_id),
  resolution_operation_id TEXT NOT NULL UNIQUE
    REFERENCES operation_admissions(operation_id),
  target_custody_id TEXT NOT NULL UNIQUE
    REFERENCES operator_git_effect_bindings(custody_id),
  target_operation_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  expected_lookup_generation INTEGER NOT NULL,
  lookup_evidence_digest TEXT NOT NULL,
  eligibility_reason TEXT NOT NULL CHECK (eligibility_reason IN
    ('inspector-unavailable','remote-proof-permanently-unavailable',
     'mixed-local-remote-evidence','evidence-integrity-failure',
     'conflict-state-unverifiable')),
  adjudication TEXT NOT NULL CHECK (adjudication IN
    ('applied','no-effect','quarantine-accepted')),
  reason TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  gate_revision INTEGER NOT NULL,
  resolved_by_operator_id TEXT NOT NULL,
  operator_input_record_digest TEXT NOT NULL,
  reservation_disposition TEXT NOT NULL CHECK (reservation_disposition IN
    ('released','retired')),
  resolution_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY (target_operation_id)
    REFERENCES operation_admissions(operation_id),
  FOREIGN KEY (gate_id, resolution_operation_id)
    REFERENCES scoped_gate_operations(gate_id, operation_id),
  CHECK ((adjudication='quarantine-accepted')=
         (reservation_disposition='retired'))
);
```

The insert trigger joins the target binding and its generic custody, target
admission and active reservation; requires one identical project/session/run,
target operation ID, `ambiguous`/`quarantined` state and exact current eligible
lookup generation/evidence; and validates the consumed
`custody-resolution` draft, exact approved human-required gate and independently
attested operator-input record. The reason is bounded and non-empty. The
resolution digest covers all immutable fields and the original machine evidence,
excluding only itself.

Confirmed Commit inserts the resolution, advances the target binding to
`human-resolved` with `human-adjudication` basis, target generic custody and
target admission to `terminal`, and target reservation to `released` for
`applied`/`no-effect` or `retired` for `quarantine-accepted`. It also consumes
the draft, advances the resolution admission through `authorised` to
`terminal`, copies the eligibility reason into the immutable resolution and
clears the target's eligibility marker/three eligibility fields. It then
commits the operator command/receipt. All statements are one transaction; a
crash exposes all or none. No update changes the target's lookup evidence,
machine outcome or expected terminal state. The receipt and projections always
prefix the selected result with `human-adjudicated-`.

Resolution performs zero Git/remote/process/filesystem calls. Exact replay is
read-only and returns the immutable row. A second resolution, stale lookup,
changed evidence, ineligible state, reused/mismatched gate, policy resolver,
ordinary `git`/`decide` capability or direct SQL partial write fails with no
reservation or liveness change. `quarantine-accepted` satisfies only the
existing explicit abandonment with reason closure predicate; it never proves
the effect outcome or closes/promotes the session by itself.

The implementation shall install the exhaustive Spec 01 operation-variant
enumeration and stricter same-project/session/run/profile/remote triggers; they
are not optional implementation detail. Binding, before-state, result-recipe
and expected-terminal columns are immutable after insert. Only the closed Git/
generic/admission/reservation lifecycle fields, owned conflict generation,
bounded outcome, lookup/eligibility fields and timestamps may advance through
the mapped compare-and-set transitions. The custody ID is daemon-derived from
operator, project, session and command identity. Exact replay returns the
same record; changed intent, decision or binding conflicts.

The preauthorised final Commit inserts one exact `authorised`
`operation_admissions` row with generic custody and the Git binding. Its
operation ID derives from operator, project session, stable Preview ID and
effect-binding digest. A later Preview of identical Git state receives a
different ID. A gate-only mutation or custody resolution instead uses the
immutable operation ID/payload digest already inserted as a `prepared`
admission with `git_operation_drafts`; final Commit compare-and-sets draft
`gate-bound -> consumed` and admission `prepared -> authorised` while creating
the mutation custody rows or human-resolution row. `operation_kind` is the
closed mutation variant or `git-custody-resolve`; `payload_digest` equals the
immutable draft binding digest.

The gate path requires the persisted exact
`scoped_gate_operations(gate_id, operation_id)` row and operation-draft
identity. A preparation trigger rechecks draft state/revision/digest/expiry,
its observed session/run/dependency revisions and session generation, the
gate's exact session/run/revision, `approved` status, human-required flag and
resolver, dependency revision, operation enforcement point and blocked-
operation membership. The preauthorised variant has no draft or gate
association but still owns one admission. No draft association is inferred
from operation kind or payload similarity.

The current baseline installs an `operation_gate_block` trigger that joins on
`NEW.operation_id`, never
`NEW.operation_kind`, and rejects any admission/gate/binding mismatch before
custody becomes prepared. Direct SQL and public-protocol paths use the same
triggers. Missing grant/draft/gate, admission, binding or required resolution
row rolls back the operator command and every owned row.

Preparation first performs all capability, the applicable positive allow-list/
grant or draft/gate checks, issuance-provenance integrity, current action CAS,
repository, worktree, writer-admission, execution-profile, remote-target and
typed Git-state checks
inside the custody transaction. It persists canonical before state, the exact
bounded result recipe and the states that would prove applied, conflict or no
effect. It also creates one generation-bearing `git_mutation_reservations` row
for the canonical Git common directory. At most one active Fabric Git mutation
reservation may exist per common directory; it coordinates all project
worktrees but is not claimed as a physical fence against an external process.

After the prepared transaction commits, the single Git owner follows this
lock-and-dispatch protocol:

1. acquire the private daemon reservation lock and the operation-specific
   Git/filesystem locks named by immutable `lock_plan_digest`, without changing
   an index, ref, config, worktree or remote;
2. open and bind every affected path with no-follow handles where content is an
   input, and re-observe repository common directory, worktree identity, HEAD,
   index, worktree bytes, refs, worktree registry, config, execution profile and
   registered remote target while those locks are held;
3. in one SQLite transaction recheck global/session/run/dependency/authority,
   grant/gate/admission, profile/remote and reservation generations, require the
   observation to equal custody, then CAS generic custody `prepared ->
   dispatching` and operation admission `authorised -> executing`;
4. begin the first mutation immediately while retaining the native locks or an
   exact native compare-and-set over every affected state; and
5. release native locks only after terminal/conflict/ambiguous custody and the
   operation admission have committed, or after proved pre-dispatch cleanup;
   conflict/ambiguity retains its persisted common-directory reservation.

The operation-specific minimum is:

- index effects use the native index-lock convention, build from pinned exact
  bytes in a private index, verify the original index digest and atomically
  install it; a changed path cannot be re-read under the old Preview;
- commit, branch, merge and rebase ref changes use Git reference transactions
  or `update-ref` old-object compare-and-set; commit-producing objects follow
  the authorised result recipe before any ref becomes visible;
- merge/rebase additionally require substrate-enforced exclusive access to the
  admitted worktree, the index lock and exact path manifest; if the substrate
  cannot prevent an overlapping admitted writer, the variant is unavailable;
- worktree create/move/remove use exclusive destination creation or no-replace
  rename, exact registry/inode/digest checks and the common-directory
  reservation; force removal never bypasses a locked worktree;
- upstream set/unset uses the local-config lock, exact prior config digest and
  atomic replace of only the two typed branch keys; and
- remote effects use the exact registered remote-port target and its native
  fast-forward/lease CAS where applicable. A remote without the required
  compare-and-set or inspection contract makes that variant unavailable.

An injected change after initial observation, after lock acquisition, during
the final SQLite recheck or immediately before the first CAS must fail before
an authority-visible mutation. Active writer admission or later quarantine
alone is insufficient. A crash while still `prepared` may remove only a
proved-owned stale lock/reservation and records no effect; it cannot clean an
unowned Git lock.

The bound execution profile constructs a minimal environment: all caller
`GIT_*`, editor, pager, signing, askpass, SSH and helper variables are removed;
system/global configuration and includes are disabled; the repository config
is never consulted for executable selection; hooks resolve to a sealed empty
directory; submodule recursion is off; and project attributes selecting
clean/process filters, custom merge/diff drivers or working-tree transforms are
rejected for affected paths. The port uses raw/plumbing operations and the
pinned built-in backend. Remote access goes only through the registered remote
port; any allowed absolute helper is digest-checked, receives fixed arguments
and runs in its declared sandbox. No shell, alias, arbitrary command/option,
remote URL or interactive prompt is accepted. Bounded stdin, stdout, stderr,
deadline and child cleanup apply to every operation. Credentials are neither
persisted nor returned.

Each operation produces a closed result tied to the persisted
`git_result_recipe_v1` digest and execution-profile digest: command exit class,
bounded output digests, exact recipe branch and one fresh typed repository,
configuration and, when applicable, registered-target observation. Terminal
success is committed only when the observation matches the recipe's exact
object IDs, ref/config transitions, commit-parent/tree/identity/timestamp/
message fields, source-to-new-commit mapping, index/worktree manifest and
remote result. The persisted recipe bounds of 64 ref/config updates, 128 commit
mappings and 4096 conflict paths are hard admission limits, not truncation
limits.

An exit failure is `no-effect` only when the inspector proves every affected
local and remote ref, object, index, worktree, registry entry and config key
remains at the persisted before state. Otherwise it is `ambiguous` or
`quarantined`. A merge, pull-merge, rebase or pull-rebase start may record only
the recipe's exact bounded `conflict` state, including native operation state,
index stages, conflict paths and generation. It never continues or aborts in
that custody. `merge-continue`, `merge-abort`, `rebase-continue` and
`rebase-abort` are new previewed, gate-authorised operations that bind the
predecessor custody and conflict generation, re-observe the complete conflict
state and use a new recipe, admission and reservation generation. A start gate
or admission cannot authorise any successor. Partial pull, unknown hook-like
external behaviour, remote observation failure or any mismatch between process
result and repository state is never silently normalised to success.

Startup and live reconciliation use this closed policy:

- `prepared`: perform zero Git process or remote calls; after proving dispatch
  never began, remove only a proved-owned daemon-private reservation artifact,
  release its persisted reservation and record `no-effect` once; never remove
  a Git lock or project file. A prepared typed conflict successor instead
  uses the sealed no-process typed local reader to prove the inherited conflict
  unchanged and atomically becomes the current `conflict` owner/reservation
  without executing its requested action; unavailable/mismatched proof retains
  an ambiguity/quarantine blocker without eligibility rather than releasing
  it, and only an explicit `git-custody-resolve`-capable
  `inherited-successor` observation may classify complete destroyed/altered
  proof;
- `dispatching` or `ambiguous`: call only the fixed read-only Git effect
  inspector for the exact custody ID and increment `lookup_generation`; never
  execute, abort, continue, retry or reconstruct the mutation;
- `quarantined`: perform no automatic repeated lookup. An explicit bounded
  reconciliation request may call only that same inspector and either append a
  higher lookup generation with machine proof or retain quarantine; it never
  mutates Git;
- `conflict`: startup and passive supervision perform no lookup. An explicit
  authenticated request bound to the exact custody, owned conflict generation,
  state revision, reservation generation, common-directory identity, lookup
  generation and nullable prior evidence may call only
  the sealed no-process typed local reader. Every accepted observation appends
  exactly one lookup generation with bounded evidence, outcome and time under a
  final compare-and-set. Exact bounded conflict proof retains the predecessor
  and reservation for a separately previewed typed
  continue/abort decision. Complete proof that the persisted native state,
  index stages or conflict-path manifest was destroyed or altered out of band
  atomically moves all four owners to `quarantined`, retains the reservation,
  and sets only the matching
  `conflict-state-unverifiable` eligibility marker. Incomplete, unavailable or
  inconsistent proof retains `conflict` without eligibility while transient;
  a closed permanent inspector/integrity outcome moves all four owners to
  `quarantined` with matching eligibility. The inspection
  never invokes a Git process, remote call, continue, abort, restore or other
  mutation;
- inherited typed successor in `prepared|ambiguous|quarantined`: an explicit
  `git-custody-resolve`-capable request bound to the exact predecessor
  generation and null owned generation uses the same one-lookup/final-CAS
  protocol. Exact intact proof assigns the next owned conflict generation and
  moves every owner to `conflict`; complete destroyed/altered proof retains the
  transferred reservation and moves/retains every owner in `quarantined` with
  matching `conflict-state-unverifiable` eligibility; incomplete, unavailable
  or inconsistent proof retains an ambiguity/quarantine blocker without
  eligibility while transient, while a closed permanent inspector/integrity
  outcome uses the same retained-reservation quarantine/eligibility mapping.
  It performs no Git process, remote call or mutation;
- exact applied proof: record terminal success and the after-state digest once;
- exact no-effect proof: record terminal no-effect once;
- incomplete, unavailable, conflicting or mixed local/remote evidence: retain
  `ambiguous` or enter `quarantined` with its evidence digest. Only a closed
  permanent-unprovability reason may set the exact generation-bound
  `resolution_eligible` marker; and
- terminal, no-effect, rejected or failed-with-proof: return the stored outcome
  on replay with zero Git I/O. `human-resolved` returns its separately labelled
  immutable adjudication and never re-runs lookup.

Lookup of fetch, pull or push opens only the custody's exact remote registration
ID/revision/generation/target digest and exact refs. A same-name registration
with a changed target is a mismatch, not a lookup route. Remote absence,
timeout or changed/unreadable advertised state cannot prove no effect. Lookup
of commit, branch and worktree actions resolves exact objects and all registered
worktrees. Upstream lookup reads only the two typed local branch keys under the
persisted config digest and target binding. Merge and rebase lookup records
their native operation state but never invokes automatic `--abort` or
`--continue`. An unresolved binding is a project-session membership/closure
blocker; the affected session remains in an existing liveness-contributing
ambiguity or quarantine state. Pending Git custody is not discarded merely to
permit daemon idle stop.

Migration preflight shall reject malformed/non-canonical paths, unknown effect,
variant, recipe or state values, invalid digests, missing run authority history,
missing execution-profile or target-bound remote records, non-contiguous grant
revisions, two active grant revisions, missing normalised constraint children,
widened/gate-only constraints, malformed or impossible issuance provenance,
cross-project/session/run references and an existing generic Git custody row
without a complete typed binding. A valid historical issuing revision lower
than the current orchestration revision is not stale. Preflight also rejects an
impossible draft/admission/gate state, a non-exact gate-operation association,
any mismatch in the four-owner Git state table, duplicate active common-
directory reservations, a partial/duplicate human resolution and unowned/
native Git locks that prevent a safe initial observation. It shall not infer a
grant, draft, target, profile, admission, resolution or human gate for
historical data.

Authority/allow-list history, profile, remote, normalised grant-child, draft,
reservation, binding, custody-resolution, operation-admission and exact
`(gate_id, operation_id)` foreign keys, indexes and triggers install in one
transaction in the fresh baseline. The operation-ID join is the only
`operation_gate_block` trigger. Binding/reservation
immutability, mapped state-transition, digest, positive-containment, live-
authority, same-run and global-revision triggers become live before the schema
version advances. Recovery is forward repair or verified restore under
section 7.

Acceptance additionally requires deterministic oracles for:

- migration preflight/rollback, every composite foreign key, immutable
  draft/binding/resolution content, contiguous grant revisions, one-active-
  revision, exclusive grant/gate choice, every four-owner state combination,
  one active reservation per common directory and indexed current-grant/
  draft/recovery queries;
- grant issue/revise/revoke requiring `git-authorise`, a Preview-bound
  direct-human decision and positive subset of every `git_allowlist_v1`
  dimension; missing/stale parents, wildcard/negative-only rows, widened
  variants/refs/paths/remotes/profile, gate-only variants, reused human
  provenance and an ordinary `git` caller all fail before insert/update;
- absent, expired, revoked/non-active, tampered/nonexistent issuance provenance,
  wrong project/session/generation, authority/allow-list/profile/remote fence,
  repository/worktree or constraint-mismatched grants causing zero Git process
  I/O, including a sibling operation variant or same remote name with another
  target;
- ordinary session/run/dependency and repository HEAD/ref/index/content
  revision advancement after issuance leaving the grant valid, while a stale
  action Preview fails its own CAS and a fresh Preview reuses that grant.
  Authority/allow-list rotation, session-generation, canonical repository/
  worktree identity, profile or remote-target change at Preview, prepare, lock,
  final recheck or first mutation invalidates it without rewriting issuance
  provenance;
- exact draft replay returning one prepared admission/operation ID and no
  custody/reservation/liveness; changed payload, duplicate ID, early effect row,
  expiry/cancel/stale reopen and gate association by operation kind all fail;
- final gate Preview making no write, while confirmed Commit alone atomically
  consumes the exact draft, authorises its admission and creates custody/
  reservation. Direct-SQL negatives vary draft/gate operation ID, revision,
  digest, resolver, run, dependency revision, enforcement point and blocked
  effect; the removed operation-kind trigger accepts no same-kind substitute;
- one real temporary-repository operation for every Spec 01 operation variant,
  including upstream set/unset and typed merge/rebase continue/abort, with
  fixed profile/backend, bounded I/O and a receipt matching a fresh typed read;
- hostile local/system/global config, includes, hooks, attributes, filters,
  merge/diff drivers, aliases, credential/remote helpers, SSH/editor/pager/
  signing/askpass variables, prompts and submodule recursion canaries proving
  rejection or the sealed trusted path before any project-selected executable;
- byte-identical merge, pull-merge, rebase and pull-rebase recipe output for one
  pinned profile across wall-clock, locale and caller-config changes, plus exact
  parent/tree/identity/timestamp/message, source-to-new mapping, conflict
  manifest and hard-bound checks; a Git binary/version/digest change invalidates
  the old Preview, and an unpinned backend is unavailable;
- exact start-conflict proof followed by separately drafted/gated typed
  continue and abort, with predecessor custody/generation, atomic terminal/
  successor transfer and one-reservation checks. Crash before successor
  dispatch makes the successor the conflict owner without Git I/O; old-owner,
  concurrent-successor, automatic recovery and start gate/admission reuse fail;
- an out-of-band abort, manual resolution or conflict-state edit makes the
  persisted predecessor conflict, or the inherited conflict after successor
  Commit but before successor dispatch, fail a complete sealed-reader comparison.
  Explicit reconciliation atomically quarantines every owner, retains the
  reservation and records `conflict-state-unverifiable`; incomplete evidence
  and the first two identical transient unavailable/inconsistent signatures
  advance only the bounded lookup audit and retain the blocker. A missing/
  revoked pinned inspector, proved canonical-evidence integrity failure or the
  third identical failure signature under the bounded time/command rule
  quarantines every owner with matching `inspector-unavailable` or
  `evidence-integrity-failure` eligibility. A different signature resets the
  streak. Closed
  codec negatives reject missing/extra/cross-variant fields, nullable-evidence
  mismatch, stale binding/conflict/reservation/lookup generations and `git`
  without `git-custody-resolve`. Target and reconciliation command status
  queries distinguish target `pending/prepared`, `ambiguous`, `conflict` and
  `quarantined`, plus reconciliation-command `pending/observing`, for both owned
  and inherited-successor lineage;
  exact replay returns the immutable snapshot with zero inspection, changed
  replay conflicts, and a crash before final CAS may repeat only the read-only
  inspection. A race that transfers custody or completes another lookup between
  inspection and final CAS stores one terminal closed rejection command
  with zero owner update; exact replay performs no second inspection and a new
  command must bind the latest tuple. A separately drafted/gated custody adjudication
  then releases or retires exactly that reservation with zero Git/remote/
  process/filesystem mutation, while an unchanged conflict still permits only
  typed continue/abort;
- fault injection before binding/reservation insert, after generic custody,
  after prepare commit, after private lock, after each native lock, before the
  SQLite CAS and immediately before the first mutation/CAS for index, ref,
  merge/rebase worktree, worktree registry, config/upstream and remote families;
  every injected competing change fails with zero authority-visible mutation;
- restart of `prepared` making no Git/remote call and cleaning only its owned
  private artifact (or retaining an inherited conflict), restart of
  `dispatching`/`ambiguous` making exactly one bounded lookup and no mutation,
  quarantine making no automatic lookup, retained conflict making no automatic
  action, and exact machine/human terminal replay making no call;
- commit/branch/worktree/upstream local proof, target-bound fetch/pull/push
  remote proof, same-name target retarget invalidation, merge/rebase conflict,
  partial pull and unavailable remote observation remaining honest;
- unresolved Git custody blocking project-session closure and surviving daemon
  and Console restart without a duplicate effect, followed by
  `git-custody-resolve` negatives for ineligible or intact-conflict custody,
  stale lookup/evidence, wrong gate/capability/human provenance and changed
  replay. Faults
  before/after every resolution statement leave all rows unchanged or one
  immutable human-labelled result, make zero Git/remote/process call, preserve
  machine evidence, release/retire one reservation and remove only its closure
  blocker; and
- capability, remote-credential, command, output and receipt canaries proving
  that no secret, arbitrary argument or unbounded process output reaches
  persistence, projection, logs or Console rendering.

### 9.14 Artifact-content read boundary

Spec 01 section 32.14 owns the public operation and result semantics. This
section owns its daemon implementation, filesystem containment, bounded codec,
negotiation and restart behaviour. It adds no artifact authority and no second
artifact store.

The operation registry and generated protocol manifests shall advertise
`artifact-registry.v1` / `fabric.v1.evidence.publish` and
`artifact-content-read.v1` /
`fabric.v1.operator-artifact-content.read` only when their complete closed
codecs and daemon handlers are available. A client without the latter exact
feature/operation has no `artifacts.readContent` surface. Feature absence is an
honest unavailable state, not a fallback to direct filesystem access.

The handler uses two short SQLite transactions with bounded filesystem work
between them. It never holds a database transaction or the synchronous daemon
owner across file I/O:

1. phase A authenticates the `afop_` credential at point of use for the exact
   project, optional session, current principal generation and `read` action;
2. phase A selects one active `artifacts` registration, compares its revision
   and complete ref, captures the exact project/session/run/source/publisher
   tuple and derives its trusted source root;
3. outside SQLite, the daemon canonicalises that root, rejects traversal and
   opens the exact regular file read-only with a no-follow primitive;
4. it rejects a symbolic link, link count other than one, non-regular file or
   any pre-open/post-open path, device or inode mismatch;
5. it reads at most 1 MiB plus an overflow sentinel, rechecks device, inode,
   size and modification time and verifies raw source SHA-256 before strict
   UTF-8/media validation;
6. it applies whole-artifact terminal/credential safety transformation, bounds
   the inert rendering, validates the cursor and returns one monotonic UTF-8-
   bounded page with complete-rendering/page digests and an exact whole/start/
   middle/end line-fragment label; and
7. phase B opens a fresh transaction, reauthenticates every credential/
   principal/project/session generation and compares the captured evidence,
   source-owner/root and ref tuple immediately before response. Any change is
   `stale`. Unrelated global Fabric activity is not an artifact-content fence.

A second database connection must be able to commit while a deliberately slow
filesystem read is between phase A and phase B. The final transaction must see
that connection's relevant changes; SQLite snapshot reuse or event-loop
serialization is not proof of stability.

Source routing is closed and registration-owned. `project-file` joins the
canonical project root and is admitted only when an authenticated agent's
artifact-path authority covered the path at registration. `run-file` joins the
project root to the run's normalised project-relative artifact directory;
content projection requires that directory to be a dedicated strict descendant
of the project root. `git-private-diff` joins the configured canonical daemon-
private root and exact reserved
`private/git-diffs/<source-digest-without-prefix>.patch`; only the fixed Git
service may register it. Caller values never select a route or root.

The daemon shall not resolve through process current directory or a symlinked
ancestor. It rejects absent/non-canonical roots, sensitive path classes such as
credential stores, VCS internals and environment/secret files, and any
`project-file` registration outside its sealed publication authority. A
platform that cannot prove the no-follow and identity invariants reports the
operation unavailable. Reading never shells out, executes a renderer, follows
an include, invokes a pager or parses project-controlled configuration. JSON
validation is an in-process bounded syntax parse only. Markdown, diff and plain
text are projected as inert text; they are not rendered into terminal control
sequences.

The source inspection ceiling is independent of the caller's response limits.
`maximumBytes` (`4..131072`) and `maximumLines` (`1..2000`) may narrow the response but never widen the
131,072-byte, 2,000-line page maxima, 1 MiB source ceiling or 2 MiB inert-
rendering ceiling. Safety transformation precedes pagination. Each cursor is a
bounded integrity-protected, stateless encoding of the exact evidence revision,
source/rendered digests, algorithm version, page index and next rendered byte/
boundary. The pager prefers the last LF within the requested byte limit; when
one logical line exceeds that limit it advances at a UTF-8 code-point boundary
and labels the fragment without changing the complete rendered line count. It
expires when any binding changes and cannot be used to skip,
repeat or reorder a page as a complete review. The handler retains no source
bytes after the response and writes no cache, event, acknowledgement or audit
row merely for reading. Ordinary bounded request telemetry may record only the
operation name and closed error code, never content, path-derived filesystem
authority or credential text.

The shared message/artifact redactor derives current bearer families from the
credential registries and includes `afb_`, `afc_` and `afop_` as mandatory
canaries. Its versioned daemon-owned credential classifier also covers exact
runtime-known secret values, private-key blocks, authorisation headers, URL
userinfo, recognised cloud/provider token forms and assignment values whose
closed key vocabulary denotes password, token, secret, credential or private
key. It replaces a complete classified value before pagination and cannot leave
a prefix, suffix or length-correlated fragment. If a sensitive construct cannot
be boundedly classified/redacted, the result is `unsafe-content`, not a partial
rendering. This deterministic vocabulary is a safety boundary; project content
cannot add or remove patterns.

Terminal neutralisation covers CSI, OSC, DCS, APC, PM, SOS, C0/C1 controls,
carriage-return rewrites, bidi overrides and other sequences able to alter or
disguise the operator display. Newline and ordinary tab semantics may be
preserved only within page bounds. The source, complete rendered and page
digests are calculated over their explicitly named byte domains after the
closed transformation order.

Migration 0010 rebuilds `artifacts` as the one evidence metadata registry while
leaving all bytes with their existing owners. Additive closed columns are exact
`project_id`, nullable `project_session_id`/`run_id`/`task_id`, publisher kind
and ref, source kind, evidence kind, canonical prefixed SHA-256, registry state,
quarantine reason and positive revision. Active source/scope/path/digest are
immutable. Partial unique indexes enforce one project-, session- or run-scoped
identity. `project-file`, `run-file` and `git-private-diff` have disjoint CHECK
shapes and producer-owned namespaces. Evidence projection reads only active
rows and takes kind, revision, ref and provenance from this registry rather
than hard-coding them.

The squashed baseline `artifacts` table declares exact
`UNIQUE(artifact_id, revision)` in addition to its `artifact_id` primary key.
That apparently redundant composite key is mandatory: every immutable evidence
child in section 9.23 uses the exact two-column registration revision as a
SQLite foreign-key parent. A child can never cite a revision value merely
because the artifact ID exists.

The current baseline stores only the wire `sha256:` artifact digest form.
Publication applies the closed source classification; result completion must
prove the replying agent's persisted path authority and rejects an unprovable
root-equal registration.
`fabric.v1.evidence.publish` and every other registry producer apply that same
derive/reclassify-or-reject rule regardless of the requested source kind. A
database invariant/postflight query rejects every active `run-file` whose
normalised run root is `.`.
Invalid paths or digest-identity collisions likewise remain explicitly
quarantined and unprojected rather than crashing a codec or guessing
provenance. Existing receipts and intake bindings gain exact registry IDs.
Every new intake binding has a foreign key and trigger proving its repeated
path/digest equal one active same-scope registry row.

`intakes` and `intake_revisions` gain an accepted-scope registry ID and closed
state. New accepted revisions require the one explicit registered
`acceptedScopeRef`; other states forbid one. Zero, multiple or quarantined
candidates are rejected; the runtime never chooses the first ref.
Changing accepted scope increments the project revision in the same transaction
so Project row/detail references cannot remain current.

The baseline has an explicit run-directory basis. Operator-launched relative
roots resolve only beneath joined `projects.canonical_root`; absolute run roots
are not admitted. Outside, ambiguous or symlinked roots fail before state. One
shared `resolveRunArtifactRoot` replaces direct/cwd-relative use in publish,
results, receipts, checkpoints, provider evidence, retention and content reads.

Preflight stages every normalised row and binding before table replacement;
postflight runs foreign-key/integrity checks, identity/count reconciliation,
canonical path/digest queries and registry-trigger probes. Fault injection at
each staging, rebuild, binding and migration-record boundary exposes the
complete old or complete new schema. `artifact-registry.v1` and
`artifact-content-read.v1` advertise only after postflight passes. Spec 05 owns
all Console paging, disclosure, acceptance and viewport behaviour; this spec
owns only the daemon/client capability boundary.

Deterministic verification additionally covers:

- zero filesystem I/O for wrong/expired/revoked credential, action, project,
  session, generation, evidence revision, ID, ref or cursor;
- exact project/run/private source routing and rejection of caller-selected
  source/root, arbitrary, absolute, traversal, sensitive, replaced-ancestor,
  symlink, hard-link, FIFO, device and socket paths, including races before
  open, during read and before response;
- source digest mismatch, size growth/shrink, inode replacement, invalid UTF-8,
  NUL/binary content, malformed or deeply nested bounded JSON, unsupported
  extension, unsafe credential construct and source/rendering overflow;
- byte/line caps at below, exact and above bounds, empty source, CRLF,
  combining/multibyte characters and transformation/page boundaries, including
  complete multi-page reconstruction and duplicate/skip/reorder/cross-ref
  cursor negatives;
- every terminal family, bidi control and bootstrap/agent/operator capability
  plus private-key/auth-header/URL/provider/assignment canaries proving literal
  safety flags only when output is inert and no credential fragment remains;
- untransformed source/rendered/page digest equality and independent transformed
  complete-rendering and per-page digest verification;
- concurrent credential/session/evidence/source-root/file changes producing
  only `stale`, never mixed/current content, while unrelated global activity
  does not starve a valid read;
- a second connection committing a relevant change between the two short
  transactions, and a writer completing during slow filesystem I/O;
- operator-relative roots, prefixed digests, receipts/intake bindings and
  accepted scope; invalid/ambiguous roots fail, while unrepresentable artifacts
  quarantine without parser crash;
- idempotent authorised project/run publication, result/receipt registration,
  private Git-diff registration and exact intake/gate/acceptance binding, with
  cross-scope/unregistered refs rejected atomically; root-equal requests from
  every producer reclassify only with exact authority proof or reject, and no
  active root-equal `run-file` survives direct SQL/postflight checks;
- negotiated client presence/absence, malformed closed variants, restart and
  at least 32 concurrent bounded reads without unbounded memory, descriptor
  drift or database writer starvation; and
- the Spec 05 production Console evidence workflow over every source kind, with
  raw terminal output free of controls and credential canaries.

### 9.15 Notification result-shape negotiation and revision invalidation

Spec 01 section 32.15 owns the public result semantics. This section owns the
daemon/client negotiation boundary and persistence enforcement. Feature
`native-notification-projection.v1` is a result-shape capability with no
operation grant: it may be advertised only when the daemon can condition all
three affected projection operations on the authenticated connection's
negotiated features and the client can enforce the same condition after
decoding.

The closed v1 summary is within the exact operator credential's existing
project/session Attention visibility. It exposes no destination, bearer value,
deep link or cross-scope integration record. No per-field redaction arm exists
in v1 because every authorised Attention reader is authorised for this bounded
status; any future visibility or payload change requires another feature
version.

The generated wire codecs represent `nativeNotification` as an optional schema
property solely because the affected operations each have two negotiated
closed shapes. The connection-aware boundaries restore strictness: server
dispatch passes an explicit include/omit mode into snapshot, projection-page
and view-page construction; the client rejects absence in include mode and
presence in omit mode before the value reaches the Console. Internal callers
use omit mode unless they request the extension explicitly. Validation
recursively walks every Attention-typed value and conflict candidate at the
single public send and receive choke points. Mixed presence invalidates the
whole result. A mismatch closes the attempted attach and emits typed
`protocol-incompatible` state; no cached, replayed, partial or fallback
projection from that result may enter the Console.

Console protocol binding records whether the feature was negotiated. A
Console-local discriminated presentation value separates a real
`daemon-journal` summary from `feature-unavailable`; the latter is never
inserted into the wire `NativeNotificationDeliverySummary`. When the optional
feature is unavailable its presenter, evaluation and export say `notification status unavailable
(feature not negotiated)` and do not fabricate a journal state, delivery
revision, claim generation, integration observation or observation time.
It contributes neither zero nor an empty bucket to notification aggregates,
and exports retain explicit unknown/unavailable state. Protocol incompatibility
is a connection failure, never a per-row delivery summary or unavailable value.

The local Console makes one current-protocol connection attempt. It requires
the exact current project/run/session projection and artifact-read features;
it does not retry an alternate optional profile or translate another result shape.
The request parser admits no more than 64 unique well-formed
feature names combined across required and optional arrays, each at most 64
bytes, ignores unknown optional names during negotiation and reports unknown
required names as unavailable. Unknown names
can never enter the offered result feature set or operation-grant calculation.
Count overflow, duplicates, uppercase or invalid grammar, non-ASCII or
over-64-byte names reject the whole request as `PROTOCOL_INVALID` before
classification. Comparison is exact ASCII byte equality with no truncation,
folding or Unicode normalisation. The exact grammar is
`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*\.v[1-9][0-9]*$`;
duplicates within or across the two arrays reject.

The current baseline adds `AFTER INSERT`, `AFTER UPDATE` and `AFTER DELETE` triggers
on `notification_deliveries` that increment `daemon_global_state.revision` in
the mutating transaction. They follow the existing projection-trigger policy,
compose with the evidence-registry constraints in the same schema and do
not create events, Attention mutations or delivery retries. Existing
`integration_availability` triggers remain mandatory and are verified rather
than duplicated. Baseline catalogue verification rejects missing trigger
coverage before the result-shape feature is advertised.

Multiple row-trigger increments in one SQLite transaction are valid. The
Console preserves stable IDs, focus, scroll, drafts and pending actions when an
eventless revision change reloads otherwise identical rows, and load tests
bound repeated refresh work under notification churn. The gate uses one
Console, 1,000 open Attention rows, 2,000 delivery transitions in 200
transactions of 10 over a simulated 10 seconds and exactly twenty 500 ms poll
ticks. After warm-up it requires no overlapping refresh, at most twenty
completed resnapshots, p95 refresh at most 250 ms, total wall and process CPU
time at most five seconds and additional heap at most 32 MiB; host and Node
version are recorded.

Deterministic verification additionally covers:

- negotiated and unnegotiated server responses for snapshot, projection-page
  Attention and view-page, including closed unknown/missing/malformed, mixed-
  presence and conflict-candidate negatives at both mandatory choke points;
- current client/server fixtures proving required-feature rejection, honest
  optional notification unavailability, whole-result/attach rejection of an
  unnegotiated extra field and no partial projection;
- forward-compatible bounded unknown-feature parsing, combined-count,
  cross-list duplicate and exact-grammar rejection, one connection attempt and
  zero fabricated or aggregate journal/freshness claims;
- delivery insert/update/delete plus availability changes advancing revision,
  invalidating a stale page/read transaction and refreshing Console polling
  while resize/resnapshot preserves UI state under bounded churn;
  and
- baseline reopen/catalogue behavior and absence of any notification-caused
  Attention acknowledgement, approval, focus or other authority effect.

### 9.16 Scoped-operation enforcement, operator-effect custody and Herdr seam

The additive persistence change for operation enforcement shall bind each
gate-operation predicate to the gate's exact project session and coordination
run. The public check supplies the Spec 01 section 32.16 `operationTarget` and
current dependency revision. For `{kind: task}`, the transaction proves the
task belongs to that run and joins the operation kind to the gate's current
`scoped_gate_tasks` row at the same bound dependency revision. For
`{kind: run}`, task/subtree gates never match. Run/release gates remain bounded
to their exact run. Preparation triggers and service checks use the same
predicate, so a target-less call, same-kind sibling substitution, stale graph
or cross-run task cannot authorise or block an effect accidentally.

Project-session closure and global idle-stop use one exhaustive classification
of `operator_effect_custody`. `prepared`, `dispatching`, `ambiguous` and
`failed` are unresolved; `terminal`, `no-effect` and `rejected` are terminal.
Every unresolved row is a closure blocker for its exact project session and a
daemon-liveness contributor. Each row maps to exactly one daemon recovery
owner. Specialised launch, Git, chair/child bridge, registered external-effect
and Herdr owners exclude their rows from generic mutation while retaining the
blocker. An unowned prepared row may be terminalised as no-effect only with
durable proof that dispatch never began. Every post-dispatch or failed row uses
bounded evidence-only lookup; an absent port, unknown owner, malformed outcome
or incomplete evidence remains ambiguous/quarantined and moves the owning
session/run to the corresponding existing recovery state. Recovery never
replays an effect merely to permit acceptance or daemon shutdown.

The optional Herdr package composes through one daemon-owned
`herdr-control-v1` action owner. The daemon prepares one stable action for only
the closed Spec 01 operation family, persists dispatch before Herdr I/O and
completes it only from a closed receipt matching the prepared intent. Restart
leaves prepared actions undispatched and performs lookup only for dispatched or
ambiguous actions. Herdr presence is a separate bounded observation with
`available`, `unavailable` or `stale` freshness; loss records
`visibility_degraded` without inferring provider death, task state, delivery or
completion. When the optional package is disabled or unavailable, action calls
return typed unavailability and the daemon, Console and all non-Herdr protocol
paths remain fully operable.

Deterministic verification additionally covers:

- same-operation sibling tasks under task/subtree gates, exact run targets,
  cross-run task rejection and atomic dependency-revision rebinding through
  both public checks and preparation triggers;
- every operator-effect state in idle and closure queries, single-owner
  classification, typed-owner exclusion, unknown-owner fail-closed behaviour
  and crash points before prepare, before/after dispatch and before terminal
  evidence commit; and
- every closed Herdr action, disabled/unavailable portability, separate
  presence degradation, stable replay, prepared-with-zero-I/O restart,
  lookup-only dispatched/ambiguous recovery and negative pane-inference
  canaries.

### 9.17 Integration-principal and direct-human attestation enforcement

The current squashed baseline creates one hash-only integration credential
table. Its unique identity binds capability ID and token hash to integration
ID, project, project session, coordination run, principal generation, provider
ID, provider-session reference, closed granted-operation JSON,
issue/expiry/revocation timestamps and revision. Insert/update
triggers reject unknown operations, empty grants, mutable identity fields,
generation rollback, expiry before issue and any grant outside operations whose
registry principal set includes `integration`. Revocation is monotonic. No raw
credential column, compatibility backfill or project-wide wildcard exists.

The registry's exact integration set is provider-state report, provider-action
reconcile, operator-intervention record, visibility-failure record, budget
usage record/reconcile, integration input-attest, resource reconcile and result-
delivery claim/provider-accept/consume. Baseline constraints require the bound
project session to belong to the project and the run to belong to that session;
the principal generation is current for that exact integration/run binding.
No integration grant contains provider-action dispatch, lifecycle, topology,
lease, capability, gate-resolution or operator-control operations.

Trusted daemon composition owns provisioning; the public socket exposes no
credential-issuance operation. Provisioning is idempotent only for an identical
binding and token hash, uses the `afi_` family and returns the raw value once to
the in-process/provider bridge. Authentication uses constant-shape hash lookup,
expiry/revocation checks and the operation registry to produce the existing
closed integration principal/grant. Dispatch has an exhaustive integration
branch for the eleven operations above; it never falls through the agent or
operator dispatcher. Every arm reloads the credential by connection hash and
rechecks expiry, revocation, grant, project/session/run/generation and the
operation-specific action/resource/budget/delivery owner before mutation. For
input attestation, the branch supplies the bound provider identity/session to
`OperatorStore`, which compares them to the provider-native event before insert.

One production `DirectHumanInputEventSource` boundary accepts only a closed
native event union. The successful arm has provider-native attribution, exact
provider/session/message/event identity, immutable event digest, `user` role
and exact utterance. Assistant, tool, system, echo, wrapper, terminal, pane,
CLI, injected, ambiguous and unavailable arms have no conversion to
`direct-human`. Conformance invokes the actual adapter classifier with a fake
native transport and proves no direct store or self-assertion shortcut. When no
eligible provider event source is configured, conversational attestation is
honestly unavailable; typed Console decision remains independent.

The operator store and gate store share one canonical digest-binding function.
It parses stored references through the public closed codecs, de-duplicates by
first occurrence and appends release receipt/artifact digests. It compares
length, order and every value both when recording and resolving. Resolution
also requires the operator command's attested-provider provenance to match the
same attestation ID, integration ID and generation. Any parse failure or state
change fails closed without changing gate or membership state.

Deterministic verification additionally covers:

- migration rollback/checksum/restart, immutable identity, monotonic
  revocation and all operation-registry/grant negatives;
- real Unix-socket integration negotiation and each of the eleven dispatch
  arms, one successful native callback flow, connection-hash rebinding checks
  and zero agent/operator fallthrough;
- wrong, missing, extra, duplicate and reordered gate/release digest vectors
  at record and resolve time, plus sentinel and explicit-operator matching;
- every ineligible native-event arm, message/event replay, wrong provider/
  provider-session/project/project-session/run/generation, expired/revoked or
  insufficient grant, every non-integration operation and changed gate/
  provenance with zero mutation;
  and
- public-tree, SQLite, logs, errors, receipts, projection and rendering scans
  proving no `afi_` bearer fragment survives.

### 9.18 Final acceptance and chair-membership reconciliation

Accepted project-session close recomputes Spec 01 section 32.3's canonical
final-acceptance reference from `scoped_gates`; caller-supplied digest syntax is
never authority. The canonical sorted set contains exactly one matching row
for each run currently awaiting acceptance and no historical terminal run.
Each row must belong to the exact session/run, be human-required, approved,
run-scoped, operation-enforced for `fabric.v1.project-session.close`, resolve
to the current operator under the expected-approver rule and carry one
persisted explicit-confirmation arm. Lookup and validation occur inside the
close command transaction before any run, lease, capability, agent or session
mutation. Zero, missing, extra, duplicate or non-identical matches fail closed.
The gate resolver applies the same non-final obligation predicate before it may
write approved final-close status, and requires both session and owning run to
be quiescing. It excludes only current run/chair membership, other exact final-
close gates awaiting their resolutions and the owning in-progress project-
drain custody. Approval while active or after any post-drain new-work canary
fails with zero gate mutation.

Acceptance preparation classifies every session run from durable state. A
`quiescing` run must have its exact current chair lease and active run/lease
memberships, then moves atomically to `awaiting_acceptance`, freezes that lease
and reconciles those memberships. An already `awaiting_acceptance` run is
validated without replaying the transition. A historical `closed` run must
already have reconciled required membership; a terminal `cancelled` or
`launch_failed` run must have explicit abandoned membership and no active
current chair lease. Other states fail closed. Reopen and accepted close update
only `awaiting_acceptance` runs, preserving historical terminal states.

The quiesce-exit/reopen transaction supersedes every gate in the session whose exact
operation binding names `fabric.v1.project-session.close`, advances those gate
revisions and reconciles any still-active gate memberships before it restores
run/lease memberships. New work may then proceed, but the next acceptance
cycle cannot reach `awaiting_acceptance` or `closed` until a fresh gate per
affected run is created and explicitly resolved. Crash rollback exposes either
the entire prior cycle or the entire superseded/new-active lifecycle, never a
reopened session with a reusable approved gate.
For `quiescing -> active` it also restores every affected run to active; for a
reconciliation/recovery/quarantine exit it moves the affected runs to the same
exceptional state and freezes their current chair leases. Only the exact
receipt-bound `quiescing -> awaiting_acceptance` path preserves approved close
gates.
Every non-close exit from `awaiting_acceptance` uses the same invalidation
transaction and restores or abandons the exact affected run/current-chair
memberships according to their new durable source state. Public transition
cannot enter `quiescing`; only typed project-drain custody may do so.
Transitions among active, visibility-degraded and exceptional session states
also CAS the affected run lifecycle and current chair-lease status, and crash
rollback exposes neither half. A work-admitting target requires exact active
required run and current-chair membership plus a live current-chair
capability. A lost launched-chair bridge blocks every generic departure until
its typed recovery custody commits or abandons the loss. Legacy imports bind
both memberships, and a forward-only migration repairs earlier task, message
and chair-lease membership dispositions plus session revisions idempotently.
Protocol parsing and projection distinguish a human decision from the closed
system-supersession disposition. Reopen may write the latter only while moving
a pending/deferred close gate to `superseded`; it never satisfies a gate,
acceptance receipt or consequential-operation authority check.
The disposition's cause is a closed `{kind, ref}` union, so an internal chair-
loss event is never mislabeled as an operator command and every reference names
an existing durable owner record.
Daemon dispatch checks the negotiated `gate-system-supersession.v1` result
feature before returning a gate carrying that arm. Old-client/new-daemon
fixtures prove read and dedupe replay fail with typed feature unavailability
and zero mutation, rather than failing later during client decode.
Gate create, human terminal resolution and reopen supersession update the gate
row, membership row and owning session membership/session revisions in one
transaction. Exact command replay returns the committed revisions without a
second increment; crash rollback exposes none of them.

Every takeover and chair-bridge recovery transaction that increments chair
generation also revokes the predecessor chair lease, abandons its membership
with `chair-takeover` or `chair-bridge-recovery`, inserts the successor as the
sole active required lease member and advances the session membership revision.
No superseded chair lease remains frozen after the atomic successor commit.
Generic membership target/disposition validation recognises write, chair and
task-owner lease tables with exact session/run binding.

Deterministic verification additionally covers arbitrary/stale/cross-session
acceptance references, non-human and wrong-operation gates, typed and native
confirmation arms, multi-run terminal history, close/reopen preservation,
post-reopen work with old-reference rejection and fresh-gate acceptance,
takeover and bridge-recovery crash rollback, and released/revoked membership
validation for all three lease owners.

### 9.19 Terminal bridges, singleton topology and multi-session operation

Migration 0013 is forward-only. Its preflight rejects more than one
non-terminal run per project session, a missing/ambiguous current chair, or a
terminal lost/pending bridge; it never edits migrations 0001–0012. It installs
an all-mode partial unique run index and a partial unique active-chair-lease
index. It re-derives run/current-and-predecessor chair lease, task,
required-message, write/task-owner lease, workstream and provider-action
membership from source truth, updates each changed membership, and advances
each affected session membership/session revision exactly once. Upgrade and
restart fixtures cover zero-delivery messages, expired/abandoned delivery,
cancelled/degraded tasks, missing current chair membership and superseded
predecessor leases.

Clean accepted/cancelled/failed close, typed project stop and chair-recovery
abandon persist immutable bridge-retirement evidence in their transaction.
The retirement binding names the session/run, terminal kind/reference, exact
owner command or recovery and timestamp. It is admitted only after terminal
run/session state, revoked current chair lease/capability and archived agent
are rechecked. Child bridge rows move from `active` to `none` with provider and
capability fields cleared. Existing terminal rows are backfilled only under the
same proof; otherwise migration fails for explicit recovery. Startup excludes
retired launched bridges and `none` child bridges. After commit, supervision
best-effort closes and removes volatile transport/action/generation mappings;
process crash already closes those transports and cannot undo durable fences.

Cancelled or failed close owns only `draft`, `awaiting_launch`,
`launch_failed` and `awaiting_acceptance`. The last source supersedes all final-
close gates before the closure predicate; pending/deferred memberships become
abandoned and human-resolved history stays reconciled. Active/quiescing stop,
launch ambiguity, lost-chair recovery and quarantine remain with their typed
owners. Recovery-abandon rejects any unrelated active membership or durable
source obligation, then abandons exactly the current run/lease memberships,
revokes all run capabilities, archives agents, retires bridges and increments
membership revision once with crash rollback.

Launched-chair graceful replacement has a distinct live-handoff custody. Its
prepare/dispatch/observe/commit state is generation-bound and promotes only an
already retained successor child bridge under the same provider contract.
Generic chair takeover rejects both active and lost launched-chair rows; lost
rows use recovery custody. No path can leave the durable launched bridge naming
the predecessor while the run names the successor.

The recovery supervisor enumerates retained bridge keys globally but fences
each exact project-session/run/revision in its own SQLite transaction. One
corrupt or unavailable session reports typed recovery evidence without rolling
back a sibling session already fenced. Retries are idempotent per stable loss
ID.

`workstreams.v1` owns the chair-authenticated coordinated-workstream create and
terminal-state operations described by Spec 01. The daemon transaction binds
the root task/team, narrowed authority/budget, resource scope, workstream and
membership and proves that no second chair/run was created. Operator
projection includes `projectSessionId` in every run reference, summary and
detail. The Console retains its project-scoped client, opens a secondary exact
selected-session client, auto-selects only one attachable session and otherwise
requires an explicit stable session choice; it never discards project-level
authority needed to start another independent session.

`run-session-projection.v1` is a closed result-shape feature for operator
snapshot, projection-page, view-page and detail-read results. When negotiated,
every returned run projection and every run row summary/reference/detail
contains the same exact `projectSessionId`; missing or mixed presence rejects
the whole result before the client consumes it. When unnegotiated those fields
are omitted from the generic protocol shape. The pre-release Console requires
the feature during initialise and performs no retry or identity
inference. A peer that cannot negotiate it is explicitly incompatible.

### 9.20 Provider-budget custody and Console decision projections

The current baseline gives each task-bound ephemeral provider action an
immutable authority, task and canonical JSON reservation/settlement vector.
Each vector key is a recognised qualified unit; the settlement value is an
exact non-negative amount or the closed `unknown` marker, and action custody is
`reserved | settled | usage-unknown`. SQLite
triggers validate same-run authority/task ownership, non-terminal task state,
available `granted - reserved - consumed` capacity and complete vector shape,
then couple every insert/state transition to `authority_budget`. They reject
direct contradictory writes, rebinding, reversal, status mismatch, negative
capacity and task terminal transition while a bound action remains open.

Fabric injects default `maxTurns: 1` for ordinary one-shot work before hashing
or dispatch. Certifying review is the closed exception owned by the resolved
target profile: direct-portal Claude/Codex may reserve up to 128 SDK turns and
112 portal calls/10 MiB, preserving 16 planning/final turns, while portal-helper
Cursor/Agy reserve one Fabric turn plus at most 128 instrumented helper calls/10
MiB. Both reserve the exact at-most-80-read/6-MiB mandatory set plus 32 direct
or 48 helper exploration calls/4 MiB. An adapter
that cannot enforce or reach them advertises
certifying-review-packet-only.v1 false.
The custody reserves `turns`, `review_read_ops`, `review_read_bytes`, one `provider_calls` and one
`concurrent_turns` when configured, plus each delegated cost,
provider-qualified token and wall-clock dimension. It does not debit unrelated
descendant, message or artifact capacity.

Because provider turns may exceed the public protocol's 30-second request
maximum, task-bound answer-bearing spawn is a durable asynchronous action.
Dispatch commits `prepared` custody and its command receipt atomically, then
returns promptly while exactly one tracked daemon completion owns adapter I/O.
A bounded FIFO worker claims `prepared -> dispatched` only within the shared
provider-turn ceiling. The chair uses `provider-action.read` to observe the
terminal answer digest and safe structured review result; it does not
redispatch. Raw certifying-review output remains daemon-private. Ordinary
noncertifying local reconciliation cannot look up or quarantine queued or
active work. Every certifying action instead enters the sole section 9.21
recovery owner before generic scans. Transport loss leaves the action live,
daemon shutdown drains tracked work before adapter/database close, and restart
uses the typed owner without blind replay.

Terminal adapter evidence moves exact usage to consumed and releases unused
and concurrency reservation. A missing applicable usage value becomes unknown;
an ambiguous action retains its reservation. Recovery validates an
answer-bearing terminal lookup or replay before settlement. Empty, oversized
or invalid non-review answer evidence is quarantined and freezes unproved
dimensions. Unsafe/malformed certifying-review output commits `UNUSABLE`,
remains private/non-certifying and may still settle independently exact usage.
A later authenticated reconciliation may retry
the adapter's stable lookup and move unknown dimensions to exact settlement;
clearing the authority-level unknown flag requires no other unknown owner.
Section 9.21 is the closed certifying exception: every proved-effect terminal
settles exact authenticated usage or charges the remaining reservation, and its
single recovery owner performs at most one pair lookup.

Operator projection joins an Attention gate only by exact gate ID, project
session and coordination run, and exposes only pending/deferred rows. Intake
read reconstructs a successor-request seed from stored message context and the
current chair row; changed conversation correlation is recovery-required, and
missing provider-session continuity yields no seed. Both paths use strict
current protocol schemas and add no Console-owned state.

The Claude certifying-review adapter receives only the bounded daemon-composed
envelope and action-pair-only review-bundle portal. Its model-visible namespace has
an empty read-only cwd and no HOME; any trusted per-action auth capsule remains
outside that namespace under OS confinement. It has no project/workspace/plugin/source MCP,
Glob/Grep/Bash/edit/write/browser/general-network tool, and no portal other than
the exact digest-bound Fabric portal. Cursor and Agy apply the same substrate
rule. Unsupported adapters/platforms advertise
certifying-review-packet-only.v1 false and
fail before provider I/O. Explicit opus effort max does not change those bounds.
Non-review provider work retains its separately admitted source-tool policy.

Deterministic verification additionally covers conditional vector-reserve
races, task-completion races, crash/restart settlement, direct-SQL invariant
attacks, immutable action/budget binding, replay after task completion,
adapter turn-cap enforcement, mixed exact/unknown usage and later
reconciliation, recovered-answer validation, gate/intake positive and negative
projections, and Claude traversal/absolute/symlink/tool-denial fixtures.

### 9.21 Complete-review custody, linear heads and route recovery

Spec 01 section 32.19 owns public behaviour. This section owns the current
baseline relations, private content store, transaction boundaries and recovery.
There is no compatibility import.

#### 9.21.1 Publication and eligible delivery source

artifact_publication_lineage is insert-only and one-to-one with an artifact
revision. Its canonical JSON mirrors artifactPublicationLineageV1 and normalised
columns include publisher agent/principal/bridge generations, provider custody
adapter/action, provider-session generation, adapter contract, family, model,
route receipt digest, state/reason and lineage digest.

Both chair launch activation and retained-child activation write the same
immutable provider_session_lineage row. Its owner discriminator joins either
launched_chair_bridge_state plus project-session launch custody, or child
agent_bridge_state plus provider-agent custody. An agent publication joins its
authenticated principal/bridge generation to exactly one such active row.
Composite foreign keys require one run, agent, principal generation, bridge,
provider session and adapter contract. Family/model are mandatory; route digest
is nullable only when that launch/provider custody owns none. Zero, multiple,
absent or crossed joins insert unproved with the exact closed reason. No caller
field can make it proved. Update/delete triggers make all lineage content
immutable.

Only an active project-file or strict-descendant run-file registration of
explicit evidence kind implementation-delivery-manifest.v1, published by an agent with
proved lineage, is target-eligible. spec05-four-slot-v1 additionally requires
an equality join to implementation_delivery_manifests and the one current
delivery_review_bases row produced by fabric-seal, and that publisher family
equal target-chair family. A generic artifact registration carrying the same
kind/content cannot satisfy that join. git-private-diff,
operator-, Fabric- and project-published rows remain valid bundle evidence but
are never silently promoted to eligible root targets.

The current evidence/artifact-kind catalogue explicitly contains
delivery-requirement-map.v1, implementation-delivery-manifest.v1,
coordination-gate-snapshot.v1 and discovery-surface.v1; none is inferred by
parsing generic receipt content. The first three use the persistence owners
below. Discovery-surface.v1 is registered only by the section 9.23 daemon
renderer and is rejected by public/agent evidence publication.

~~~sql
delivery_run_starts(
  project_session_id, run_id, delivery_run_id, repository_object_format,
  approved_base_object_id, authority_digest, created_revision,
  PRIMARY KEY(project_session_id, run_id, delivery_run_id)
)

delivery_requirement_maps(
  run_id, delivery_run_id, map_generation, closure_digest, catalogue_digest,
  accepted_scope_artifact_id, accepted_scope_revision,
  accepted_scope_digest, source_set_digest, requirement_set_digest,
  artifact_id, artifact_revision, content_digest, current, private_cas_path,
  PRIMARY KEY(run_id, delivery_run_id, map_generation),
  UNIQUE(content_digest)
)

coordination_gate_snapshots(
  run_id, delivery_run_id, snapshot_generation, event_watermark,
  chair_snapshot_digest, authority_digest, accepted_scope_digest,
  requirement_map_digest, gate_closure_digest, objective_evidence_digest,
  artifact_id, artifact_revision, content_digest, private_cas_path,
  PRIMARY KEY(run_id, delivery_run_id, snapshot_generation),
  UNIQUE(content_digest)
)

implementation_delivery_manifests(
  run_id, delivery_run_id, seal_generation, command_id,
  snapshot_generation, profile_digest, accepted_scope_digest,
  requirement_map_digest, evidence_closure_digest,
  base_object_id, head_object_id, head_tree_id, index_tree_id,
  repository_source_state_digest, artifact_id, artifact_revision,
  content_digest, publication_lineage_digest, private_cas_path,
  PRIMARY KEY(run_id, delivery_run_id, seal_generation),
  UNIQUE(content_digest)
)

delivery_review_bases(
  run_id, delivery_run_id, review_basis_revision,
  manifest_artifact_id, manifest_artifact_revision, manifest_digest,
  snapshot_digest, profile_digest, repository_source_state_digest,
  requirement_map_digest, evidence_closure_digest, current, basis_digest,
  PRIMARY KEY(run_id, delivery_run_id, review_basis_revision)
)
~~~

Run start is immutable; AFAB-004 stores the full
c2fc623a2529f87feca27982e1a140969ab5a258 base. Snapshot/manifest content has no
self-digest or final-basis reference. `fabric.v1.implementation-delivery.seal`
implements replay and stable run/delivery-run single-flight before work. Phase
A captures the exact chair principal/lease/bridge/session lineage, run-start,
delivery RUN/scope/full requirement-map entries, profile, authority/gate/
evidence/artifact revisions and Git HEAD/index/worktree tokens. The request's
expected HEAD is only an optimistic lock; no caller field selects base or
closure content.

Before manifest seal, `fabric.v1.delivery-requirement-map.seal` derives the one
current closed map from accepted scope and the checked-in
spec05-delivery-requirements.v1 catalogue. Only the authenticated current chair
may call it. Its closed request contains command/project-session/run/delivery-
run IDs, expected current map generation (zero iff none), expected current
accepted-scope revision and expected checked-in catalogue digest. A wrong zero/
positive/current sentinel conflicts before work. It equality-CASes catalogue/
scope/source/evidence revisions, requires every binding ID exactly once and
proved, and registers delivery-requirement-map.v1 bytes. Stable run/delivery-
run single-flight precedes phase A: exact command replay returns its immutable
result, changed replay conflicts and different commands serialize. Before
generation allocation, `closure_digest` hashes RFC 8785 JCS of the complete
prospective map with only map generation and closure digest omitted. Equality
with current returns its existing bytes/registration/generation; otherwise the
daemon allocates current generation plus one and inserts. Only changed
catalogue, accepted-scope/binding-source or selected evidence closure advances
generation; command-ID churn cannot stale a basis. delivery-run v1 remains
unchanged; no mutable RUN.json digest becomes a review-basis dependency.

Outside SQLite, fixed no-follow readers validate the complete profile-derived
requirement/evidence closure and clean base-to-HEAD state. They write the
coordination snapshot and manifest to reserved digest-named run-file CAS paths
create-exclusive, fsync, re-read and verify. Phase B reauthenticates, equality-
CASes every captured row/token and atomically inserts both artifact
registrations, authenticated-agent publication lineage, final review-basis row
and immutable command receipt. `producer_kind=fabric-seal` is distinct from the
authenticated agent publisher. Failure leaves no DB row; unreferenced CAS bytes
are run-owned GC. Exact replay returns the stored result; changed replay
conflicts. Any source/scope/map/profile/gate/evidence/lineage revision makes the
basis stale and requires a new seal.

#### 9.21.2 Bundle store and target transaction

The private bundle owner uses these logical current relations:

~~~sql
review_target_preparation_high_water(
  run_id PRIMARY KEY,
  preparation_generation INTEGER NOT NULL CHECK(preparation_generation >= 0),
  target_generation INTEGER NOT NULL CHECK(target_generation >= 0),
  bundle_generation INTEGER NOT NULL CHECK(bundle_generation >= 0),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  CHECK(preparation_generation = target_generation),
  CHECK(target_generation = bundle_generation)
)

review_target_preparations(
  run_id, preparation_id,
  preparation_generation INTEGER NOT NULL CHECK(preparation_generation >= 1),
  owner_command_id, semantic_input_digest, full_input_digest,
  actor_principal_digest, task_id, expected_target_generation,
  delivery_manifest_artifact_id,
  delivery_manifest_artifact_revision INTEGER NOT NULL
    CHECK(delivery_manifest_artifact_revision >= 1),
  reserved_target_generation INTEGER NOT NULL
    CHECK(reserved_target_generation >= 1),
  reserved_bundle_generation INTEGER NOT NULL
    CHECK(reserved_bundle_generation >= 1),
  state, revision INTEGER NOT NULL CHECK(revision >= 1),
  worker_claim_generation INTEGER NOT NULL
    CHECK(worker_claim_generation >= 0), worker_instance_id,
  worker_lease_expires_at, captured_precondition_digest,
  progress_kind, progress_plan_digest, progress_total, progress_completed,
  built_bundle_digest, built_manifest_root_digest,
  terminal_kind, terminal_code, terminal_evidence_digest, target_generation,
  accepted_receipt_digest, created_at, updated_at,
  PRIMARY KEY(run_id, preparation_id),
  UNIQUE(run_id, preparation_generation),
  UNIQUE(run_id, reserved_target_generation),
  UNIQUE(run_id, reserved_bundle_generation),
  UNIQUE(owner_command_id),
  CHECK(preparation_generation = reserved_target_generation),
  CHECK(reserved_target_generation = reserved_bundle_generation)
)
CREATE UNIQUE INDEX one_active_review_target_preparation_per_run
  ON review_target_preparations(run_id)
  WHERE state IN ('prepared','building','built');

review_bundles(
  run_id, bundle_generation, delivery_run_id,
  review_basis_revision, review_basis_digest,
  delivery_artifact_id, delivery_artifact_revision,
  base_object_id, head_object_id, head_tree_id, index_tree_id,
  review_diff_codec_digest, review_diff_rules_digest,
  review_diff_set_digest,
  repository_source_state_digest,
  publication_lineage_digest,
  coverage_digest, manifest_body_digest, manifest_root_digest, bundle_digest,
  bundle_search_index_digest, risk_read_map_digest,
  mandatory_read_set_digest, mandatory_read_count, mandatory_read_bytes,
  changed_path_count, required_evidence_count, carried_finding_count,
  object_count, chunk_count, total_object_bytes,
  manifest_page_bytes, search_index_bytes, risk_map_bytes,
  private_manifest_body_path, private_manifest_root_path,
  private_bundle_ref_path, created_at,
  PRIMARY KEY(run_id, bundle_generation),
  UNIQUE(bundle_digest)
)

review_bundle_objects(
  bundle_digest, object_digest, media_type, byte_length, ordinal,
  PRIMARY KEY(bundle_digest, object_digest),
  UNIQUE(bundle_digest, ordinal)
)

review_bundle_chunks(
  bundle_digest, object_digest, ordinal, chunk_digest, byte_length,
  private_chunk_path,
  PRIMARY KEY(bundle_digest, object_digest, ordinal)
)

review_bundle_manifest_pages(
  bundle_digest, ordinal, page_digest, byte_length, private_page_path,
  PRIMARY KEY(bundle_digest, ordinal)
)

review_finding_sets(
  finding_set_digest PRIMARY KEY, finding_count, page_count,
  canonical_byte_length, created_at
)

review_finding_pages(
  page_digest PRIMARY KEY, member_count, canonical_byte_length,
  private_page_path, created_at
)

review_finding_set_pages(
  finding_set_digest, ordinal, page_digest, member_count,
  first_finding_digest, last_finding_digest,
  PRIMARY KEY(finding_set_digest, ordinal),
  UNIQUE(finding_set_digest, page_digest),
  FOREIGN KEY(finding_set_digest) REFERENCES review_finding_sets(finding_set_digest),
  FOREIGN KEY(page_digest) REFERENCES review_finding_pages(page_digest)
)

review_finding_members(
  page_digest, member_ordinal, finding_digest,
  finding_id, severity, safe_record_json,
  PRIMARY KEY(page_digest, member_ordinal),
  UNIQUE(page_digest, finding_digest, finding_id),
  FOREIGN KEY(page_digest) REFERENCES review_finding_pages(page_digest)
)

provider_action_pair_preflights(
  adapter_id NOT NULL, action_id NOT NULL,
  scope_kind NOT NULL CHECK(scope_kind IN ('provider-smoke','run-action')),
  run_id,
  owner_digest NOT NULL, actor_principal_digest NOT NULL, input_digest NOT NULL,
  state NOT NULL CHECK(state IN ('resolving','admitted','released')),
  created_at NOT NULL, updated_at NOT NULL,
  PRIMARY KEY(adapter_id, action_id),
  UNIQUE(adapter_id, action_id, owner_digest),
  UNIQUE(run_id, adapter_id, action_id),
  UNIQUE(run_id, adapter_id, action_id, owner_digest),
  FOREIGN KEY(run_id) REFERENCES runs(run_id),
  CHECK(
    (scope_kind = 'provider-smoke' AND run_id IS NULL) OR
    (scope_kind = 'run-action' AND run_id IS NOT NULL)
  )
)

review_finding_capacity_reservations(
  adapter_id NOT NULL, action_id NOT NULL, run_id NOT NULL,
  target_generation NOT NULL CHECK(target_generation >= 1),
  slot NOT NULL CHECK(slot IN
    ('native','other-primary','cursor-grok','agy-gemini')),
  attempt_generation CHECK(
    attempt_generation IS NULL OR attempt_generation >= 1),
  owner_digest NOT NULL,
  finding_window_mode NOT NULL, prior_open_finding_set_digest NOT NULL,
  maximum_new_findings NOT NULL, maximum_new_finding_bytes NOT NULL,
  reservation_digest NOT NULL,
  state NOT NULL CHECK(state IN ('preflight','attached','released','settled')),
  created_at NOT NULL, updated_at NOT NULL,
  PRIMARY KEY(adapter_id, action_id),
  UNIQUE(adapter_id, action_id, reservation_digest),
  UNIQUE(run_id, target_generation, slot, attempt_generation),
  UNIQUE(adapter_id, action_id, run_id, target_generation, slot,
    attempt_generation, reservation_digest),
  FOREIGN KEY(run_id, adapter_id, action_id, owner_digest)
    REFERENCES provider_action_pair_preflights(
      run_id, adapter_id, action_id, owner_digest),
  FOREIGN KEY(run_id, target_generation, slot)
    REFERENCES review_slot_heads(run_id, target_generation, slot),
  CHECK(
    (state IN ('preflight','released') AND attempt_generation IS NULL) OR
    (state IN ('attached','settled') AND attempt_generation IS NOT NULL)
  )
)

review_terminal_sequence_high_water(
  run_id PRIMARY KEY, terminal_sequence, revision
)

review_certification_cuts(
  run_id, target_generation, predecessor_binding_generation,
  predecessor_binding_digest, terminal_sequence_high_water,
  lifecycle_custody_agent_id, lifecycle_custody_id,
  lifecycle_custody_revision, lifecycle_adoption_evidence_digest,
  lifecycle_review_decision_digest, lifecycle_review_authority_receipt_digest,
  cut_digest, created_at,
  PRIMARY KEY(run_id, target_generation, lifecycle_custody_agent_id,
    lifecycle_custody_id, lifecycle_custody_revision),
  UNIQUE(cut_digest),
  UNIQUE(run_id, target_generation, lifecycle_custody_agent_id,
    lifecycle_custody_id, lifecycle_custody_revision,
    predecessor_binding_generation,lifecycle_review_decision_digest,
    lifecycle_review_authority_receipt_digest,cut_digest),
  UNIQUE(run_id,target_generation,lifecycle_custody_agent_id,
    lifecycle_custody_id,lifecycle_custody_revision,
    predecessor_binding_generation,cut_digest),
  FOREIGN KEY(run_id, lifecycle_custody_agent_id, lifecycle_custody_id,
      lifecycle_custody_revision)
    REFERENCES lifecycle_rotation_custody_revisions(
      run_id, agent_id, custody_id, revision),
  FOREIGN KEY(lifecycle_review_authority_receipt_digest,run_id,
      lifecycle_custody_agent_id,lifecycle_custody_id,
      lifecycle_custody_revision,lifecycle_review_decision_digest,cut_digest)
    REFERENCES lifecycle_review_authority_bindings(
      receipt_digest,run_id,agent_id,custody_id,custody_revision,
      review_decision_digest,certification_cut_digest)
)

review_completion_targets(
  run_id, target_generation, preparation_id, review_subject_digest,
  task_id, reviewed_artifact_id, reviewed_artifact_revision,
  publication_lineage_digest, delivery_review_basis_revision,
  delivery_review_basis_digest, repository_source_state_digest,
  bundle_generation, bundle_digest, manifest_body_digest, manifest_root_digest,
  coverage_digest, bundle_search_index_digest, risk_read_map_digest,
  mandatory_read_set_digest, mandatory_read_count, mandatory_read_bytes,
  object_count, chunk_count, total_object_bytes,
  profile_id, profile_schema_digest, resolved_profile_digest,
  initial_chair_binding_digest, state, created_at,
  PRIMARY KEY(run_id, target_generation),
  UNIQUE(run_id, target_generation, review_subject_digest),
  UNIQUE(run_id, review_subject_digest),
  UNIQUE(preparation_id),
  CHECK(state IN ('current', 'superseded'))
)

review_target_chair_bindings(
  run_id, target_generation, binding_generation,
  predecessor_binding_generation, predecessor_binding_digest,
  predecessor_certification_cut_sequence,
  predecessor_certification_cut_digest,
  predecessor_certification_cut_custody_agent_id,
  predecessor_certification_cut_custody_id,
  predecessor_certification_cut_custody_revision,
  agent_id, principal_generation,
  chair_lease_generation, provider_session_generation, bridge_generation,
  adapter_id, adapter_contract_digest, model_family, model,
  review_subject_digest,
  route_receipt_digest, profile_digest, task_id, reviewed_artifact_id,
  delivery_review_basis_digest, repository_source_state_digest, bundle_digest,
  lifecycle_custody_id, lifecycle_custody_revision, checkpoint_digest,
  lifecycle_adoption_evidence_digest,lifecycle_review_decision_digest,
  lifecycle_review_authority_receipt_digest,
  binding_digest, created_at,
  PRIMARY KEY(run_id, target_generation, binding_generation),
  UNIQUE(run_id, target_generation, binding_generation, binding_digest),
  FOREIGN KEY(run_id, target_generation, review_subject_digest)
    REFERENCES review_completion_targets(
      run_id, target_generation, review_subject_digest),
  FOREIGN KEY(run_id, target_generation,
      predecessor_certification_cut_custody_agent_id,
      predecessor_certification_cut_custody_id,
      predecessor_certification_cut_custody_revision,
      predecessor_binding_generation,
      predecessor_certification_cut_digest)
    REFERENCES review_certification_cuts(
      run_id, target_generation, lifecycle_custody_agent_id,
      lifecycle_custody_id, lifecycle_custody_revision,
      predecessor_binding_generation, cut_digest),
  FOREIGN KEY(run_id, agent_id, lifecycle_custody_id,
      lifecycle_custody_revision)
    REFERENCES lifecycle_rotation_custody_revisions(
      run_id, agent_id, custody_id, revision),
  FOREIGN KEY(lifecycle_review_authority_receipt_digest,run_id,agent_id,
      lifecycle_custody_id,lifecycle_custody_revision,
      lifecycle_review_decision_digest,predecessor_certification_cut_digest)
    REFERENCES lifecycle_review_authority_bindings(
      receipt_digest,run_id,agent_id,custody_id,custody_revision,
      review_decision_digest,certification_cut_digest)
)

review_target_chair_binding_heads(
  run_id, target_generation, active_binding_generation, revision,
  PRIMARY KEY(run_id, target_generation),
  FOREIGN KEY(run_id, target_generation, active_binding_generation)
    REFERENCES review_target_chair_bindings(
      run_id, target_generation, binding_generation)
)

review_target_rebind_receipts(
  run_id, target_generation, lifecycle_custody_agent_id,
  lifecycle_custody_id, lifecycle_custody_revision, command_id,
  review_subject_digest, prior_binding_generation, new_binding_generation,
  prior_binding_digest, new_binding_digest, lifecycle_adoption_digest,
  lifecycle_review_decision_digest,lifecycle_certification_cut_digest,
  lifecycle_review_authority_receipt_digest,
  bundle_digest, profile_digest, slot_head_set_digest,
  open_and_repair_finding_set_digest, rebind_receipt_digest, created_at,
  PRIMARY KEY(run_id, target_generation, lifecycle_custody_agent_id,
    lifecycle_custody_id, lifecycle_custody_revision),
  UNIQUE(command_id), UNIQUE(rebind_receipt_digest),
  FOREIGN KEY(run_id, target_generation)
    REFERENCES review_completion_targets(run_id, target_generation),
  FOREIGN KEY(run_id, target_generation, review_subject_digest)
    REFERENCES review_completion_targets(
      run_id, target_generation, review_subject_digest),
  FOREIGN KEY(run_id, target_generation, prior_binding_generation)
    REFERENCES review_target_chair_bindings(
      run_id, target_generation, binding_generation),
  FOREIGN KEY(run_id, target_generation, new_binding_generation)
    REFERENCES review_target_chair_bindings(
      run_id, target_generation, binding_generation),
  FOREIGN KEY(run_id, lifecycle_custody_agent_id, lifecycle_custody_id,
      lifecycle_custody_revision)
    REFERENCES lifecycle_rotation_custody_revisions(
      run_id, agent_id, custody_id, revision),
  FOREIGN KEY(lifecycle_review_authority_receipt_digest,run_id,
      lifecycle_custody_agent_id,lifecycle_custody_id,
      lifecycle_custody_revision,lifecycle_review_decision_digest,
      lifecycle_certification_cut_digest)
    REFERENCES lifecycle_review_authority_bindings(
      receipt_digest,run_id,agent_id,custody_id,custody_revision,
      review_decision_digest,certification_cut_digest),
  CHECK(new_binding_generation = prior_binding_generation + 1)
)

review_certifying_slot_availability_revisions(
  project_session_id, profile_id, profile_schema_digest,
  target_chair_family, slot, adapter_id, adapter_contract_digest,
  provider_family, model, source_mode, runtime_identity_digest,
  platform_identity_digest, availability_revision, state, reason,
  created_at,
  PRIMARY KEY(project_session_id, profile_id, profile_schema_digest,
    target_chair_family, slot, adapter_id, adapter_contract_digest,
    provider_family, model, source_mode, runtime_identity_digest,
    platform_identity_digest, availability_revision)
)

review_certifying_slot_availability_heads(
  project_session_id, profile_id, profile_schema_digest,
  target_chair_family, slot, adapter_id, adapter_contract_digest,
  provider_family, model, source_mode, runtime_identity_digest,
  platform_identity_digest, current_availability_revision, revision,
  PRIMARY KEY(project_session_id, profile_id, profile_schema_digest,
    target_chair_family, slot, adapter_id, adapter_contract_digest,
    provider_family, model, source_mode, runtime_identity_digest,
    platform_identity_digest),
  FOREIGN KEY(project_session_id, profile_id, profile_schema_digest,
    target_chair_family, slot, adapter_id, adapter_contract_digest,
    provider_family, model, source_mode, runtime_identity_digest,
    platform_identity_digest, current_availability_revision)
    REFERENCES review_certifying_slot_availability_revisions(
      project_session_id, profile_id, profile_schema_digest,
      target_chair_family, slot, adapter_id, adapter_contract_digest,
      provider_family, model, source_mode, runtime_identity_digest,
      platform_identity_digest, availability_revision)
)

~~~

Normalised changed-file and required-evidence rows plus finding-set/page/member
relations own the complete sorted coverage manifest and foreign-key every
object they name. Finding members include the immutable safe record, exact
origin action/result/manifest/basis/bundle and source/evidence/mixed repair
currency. Successor checks require later manifest/basis/bundle for every
finding, source advance only for source/mixed and each named evidence revision
plus changed content for evidence/mixed. Identical-byte or Git-only evidence
repair fails. Checks enforce the
Spec 01 counts and byte limits, exact before/after/diff shapes per Git status,
contiguous object/chunk/manifest-page ordinals and one computed coverage,
manifest-body, bounded-root and bundle digest. Identical chunk bytes may recur
at multiple ordinals; the ordinal key preserves the object sequence while the
private CAS deduplicates physical storage by chunk digest. Each page is at most 65,536
bytes, there are at most 16 pages/1 MiB, and the root is at most 49,152 bytes
and lists every ordered page digest. Empty
objects have no chunk; every nonempty object has complete contiguous chunk
coverage. Insert/update triggers reject partial manifests and make every
committed row immutable.

Finding pages are exact RFC 8785 JCS, contain whole strictly ordered unique
members and are at most 65,536 bytes. Set-page ranges are contiguous,
nonoverlapping and equality-copy page count/member/range data; the root count is
the exact sum. No fixed finding-count cap exists. Each bundle foreign-keys one
complete set root and all its pages as mandatory objects. A normal action
capacity reservation proves room for 32 maximum-size new records and resulting
set roots before router I/O. `resolution-only` stores zero maxima and can only
remove up to 32 prior digests; it is noncertifying. Triggers reject result
insertion beyond reservation. Physical minimum-root/page exhaustion creates the
typed operator gate; no referenced finding row is deleted or overwritten.

Changed-file rows additionally store exact status, old/new UTF-8 paths,
before/after mode, object and byte-length arms plus `diff_object_digest` under
the review-diff.v1 codec in Spec 01. Startup verifies the checked-in codec and
rules digests and the immutable conformance fixture manifest, which binds full
base/head object IDs, object format, source-object-set digest, exact expected
counts/bytes and diff-set digest. The fixed Git reader disables mutable config
and implements exact-content rename pairing plus the closed Myers/binary arms;
it never parses porcelain output. Triggers enforce arm nullability, path/status
ordering and equality between the bundle's stored codec/rules/set digests and
the complete child set. A codec/rules/fixture mismatch disables target
preparation before a worker claim.

Generated canonicalisers own the exact Spec 01 preimages for requirement-map,
evidence-closure, repository-source-state, coverage and mandatory-read-set
digests. Stored map/evidence/source/object digests equality-copy their registered
bytes. Child tables enforce every body ordinal plus changed-file, evidence,
object, finding-page and mandatory-entry order/uniqueness. Startup golden vectors
and permutation negatives cover every domain; a generated-code/schema/vector
digest mismatch disables seal/prepare before filesystem work.

Digest construction follows Spec 01's acyclic order: JCS manifest body with no
self/later digest -> raw body pages -> JCS root -> JCS final bundle ref; each
digest is stored outside its own bytes. The mandatory set is root + every
manifest-body page + finding-set root/page, and the delivery manifest/map plus required accepted-scope/spec/ADR/decision/gate-
decision/coordination-snapshot objects.
Target commit rejects more than 80 unique root/page/chunk responses or 6 MiB
mandatory bytes. Limits are 4,096 changed paths, 1,024 evidence rows, 16,384
objects, 32,768 deterministic 64-KiB chunks, 16 MiB per
object, 64 MiB unique object bytes, 4 MiB search index and 256 KiB risk-map
output. All changed-file diffs and other evidence remain completely available.
The final target recomputes exact review-diff.v1/body/object/wire bytes from its
immutable approved run-start to actual sealed HEAD; with the full 2 MiB risk-
sample ceiling it must materialise under 6 MiB mandatory/10 MiB combined wire
bytes. No earlier delivery-HEAD count is a gate. The immutable pre-codec sizing
observation for
`c2fc623a2529f87feca27982e1a140969ab5a258..0a04d161c5d4fa027c96410b3cc0cf887e1c6e42`
is 601 changes, 1,434 objects, 27,766,213 bytes and largest object 4,097,314
bytes; it is deliberately not stored as final target expected output.
The daemon also writes an immutable bundle-search.v1 index and applies the
checked-in review-risk-map.v1 to every manifest entry. The rules score and sort
changed objects deterministically, then select exact highest-risk diff chunks
from every nonempty group, at most 32 chunks/2 MiB total. Those caller/provider-
independent sample digests join the mandatory set; target prepare fails if the
whole mandatory set cannot remain within 80 reads/6 MiB. Literal search is
available for deeper exploration but never substitutes for the sample; it is
limited to 16 calls/1 MiB aggregate response per action. Target state binds
search/risk/sample/mandatory digests and budgets. Each target owns one logical
bundle/root; pages/chunks are internal and CAS reuse never creates a bundle
chain. Bundle digest covers manifest/object/search/risk/mandatory components.
This coverage is transitive through body -> root -> final ref; no digest domain
contains itself.

The required coordination-gate-snapshot.v1 object is produced by the seal owner
above. It excludes review/final-acceptance/release/final-receipt state.
fabric-receipt.json is never a bundle input and cannot advance/stale the basis.

Target preparation is a durable daemon job. The public acceptance transaction
authenticates the current chair; checks the exact zero/current target sentinel,
task, eligible manifest row and persisted four-slot capability availability;
runs command replay and active semantic-digest join/conflict; increments the
run's preparation/target/bundle high-water row; inserts one immutable
`prepared` row with every database precondition and accepted-receipt digest;
and returns. It performs no Git, evidence, CAS-store, provider or network I/O.
The operation therefore cannot spend the public 30-second deadline building a
64-MiB closure. A missing slot capability fails
`CERTIFYING_REVIEW_CAPABILITY_UNAVAILABLE` before preparation insert and remains
visible in completion availability rows.

`semantic_input_digest` covers run, authenticated actor/principal and the full
closed request with command ID omitted only for active-job joining;
`full_input_digest` includes the complete request and owns command replay. One
partial unique index admits one active `prepared|building|built` row per run.
The same semantic digest under another command joins the existing accepted
receipt; a different digest conflicts before high-water update. Reserved target
and bundle generations are never reused after any terminal outcome.

A bounded FIFO worker claims `prepared` by incrementing
`worker_claim_generation` and assigning a leased daemon instance, then moves it
to `building`. It captures the eligible delivery artifact/lineage, sealed
review basis, adopted current chair/provider binding, activated adapter
contracts/profile schema, exact trusted Git base/head/index/worktree state and
all four predecessor head/attempt/open/repair tuples. Outside SQLite it uses the
fixed Git/evidence readers to enumerate every review-diff.v1 change, required
evidence and complete carried finding; reads exact bytes no-follow; builds all
objects/index/pages/root; writes create-exclusive CAS content; fsyncs and re-
reads. A verified complete build moves `building -> built` with immutable
digests. Build failure moves to failed. No filesystem work occurs while a write
transaction is open.

Phase B for `built` reauthenticates and equality-CASes every captured tuple and
all four heads. Preparation and lifecycle rotation serialize here. If same-
agent lifecycle adoption occurred during build, Phase B may create generation-
one against that adopted current binding only when adapter/contract/family/
model/profile/task/artifact/basis/source/bundle are unchanged; otherwise it
commits `chair-binding-changed`. Existing effect ambiguity keeps the row built
and fenced at Committing while route recovery proceeds; lifecycle adoption is
never blocked. A changed/new nonterminal predecessor tuple conflicts as
`predecessor-action-nonterminal`. Success
atomically inserts the reserved bundle metadata/coverage, supersedes the old
target, inserts one current immutable `review_completion_target`, generation-
one chair binding/head, resolved profile/slots and four generation-zero review
slot heads, then transitions `built -> succeeded` and stores the target ref.
The only other Phase-B outcomes are conflicted or failed; no partial target is
visible.

The only preparation edges are `prepared -> building`, `building -> built|
failed` and `built -> succeeded|conflicted|failed`. State, terminal code/evidence
and target-ref triggers enforce the exact Spec 01 union. Conflicts are only
target-generation, chair-binding, task-or-authority, delivery-basis, repository-
source, profile, predecessor-head or predecessor-action change. Failures are
only bundle-too-large, unsupported-repository-state, source-read-failed,
content-integrity-failed or certifying-capability-unavailable. Succeeded carries
only target ref; nonterminal carries null.
Public
`review-target-preparation.read` is an indexed read of this row and accepted
receipt. It maps the three nonterminal states to Preparing, Building and
Committing and exposes no invented percentage. Progress is required as either
phase-only or finite verified-build-items. A finite plan writes immutable
plan-digest/total once; completed may only increase after the corresponding
item fsync and re-read and must equal total before built. Triggers reject
downgrade, total/plan change, regression or completed above total.

ReviewTargetPreparationRecoveryService runs before private-CAS garbage
collection and generic jobs. It reclaims an expired worker lease by advancing
the same claim generation. Prepared restarts at build; building validates and
reuses only exact digest-verified CAS bytes; built reruns only Phase B. It never
allocates another generation or creates a second target. CAS GC excludes every
digest reachable from an active preparation, target or bundle; unreferenced
bytes become eligible only after the owning preparation is terminal. PID/daemon
restart and fault injection at every write/fsync/state/Phase-B statement prove
one resumable row or one complete target.

`review_completion_targets` stores exact preparation/target generation,
review-subject digest, task,
delivery artifact/lineage, review basis/source state, bundle/coverage/manifest,
resolved profile/schema, bundle-search/risk-map and mandatory-read-set/count/
byte digests plus initial chair-binding digest. It does not duplicate mutable
chair generations. A partial unique index permits one current row per run.
Drift never updates it; reads derive stale. The only current-to-superseded
update occurs in successful successor preparation Phase B. Every operation invokes the same pure
currency predicate and active binding join. Reads derive stale-target without a
write/global-revision advance. A new dispatch or optional annotation rejects
stale currency. The action-bound terminal transaction still settles and
advances its reserved head. Only a newly succeeded preparation supersedes the
old target.

`review_target_chair_bindings` is insert-only. Generation one is created with
the target; later generations require the exact prior binding foreign key and
one finalized adopted `lifecycle_rotation_custody_revisions` row for the same
agent whose head points to that exact journal revision.
Triggers require contiguous generation and equality of adapter, contract,
family, model, profile, task, artifact, review basis, repository source and
bundle. They require the exact predecessor binding digest and certification-cut
custody/row/digest/sequence; the cut custody must equal the binding's adopting
`(run_id,agent_id,lifecycle_custody_id,lifecycle_custody_revision)` ref.
Generation one has all predecessor/cut/custody fields
null; every successor has all of them nonnull. They permit only principal, chair-lease, provider-session, bridge and
route-receipt generations to advance. `review_target_chair_binding_heads` is
the sole active pointer and advances by one CAS. A different agent or any
non-generation binding change cannot insert and leaves the target stale.

`review_target_rebind_receipts` is insert-only and unique by run/target/exact
agent/custody/revision ref plus command replay. It stores the exact Spec 01 receipt and
digest, prior/new binding generations/digests, immutable subject/bundle/profile
digests and before/after head/open/repair set digests. Both tables equality-copy
the exact target `review_subject_digest`; triggers reject any receipt or binding
whose immutable target fields do not reproduce that digest. The public
`review-target.rebind` transaction authenticates the current chair, derives the
target/custody/current-binding tuples, rechecks every immutable subject field
and four head/open/repair tuples, then inserts the successor binding, advances
the pointer and records the receipt atomically. It performs no router/provider/
portal/lookup I/O. The true-chair adoption transaction invokes this same store
mutation directly; an exact later command joins the existing custody-keyed
receipt. Wrong or non-adopted custody, crossed agent/generation/subject, stale
pointer/head, duplicate generation or changed replay changes nothing.

Every successor binding, certification cut and rebind receipt equality-copies
the Spec 01 lifecycle review-decision digest and externally authenticated
receipt digest. They are inserted only inside the post-authority lifecycle apply
and composite-reference `lifecycle_review_authority_bindings`, which in turn
binds the exact immutable reservation, ordinal-two intent/authority receipt,
finalized custody revision and apply. Subject custody, adoption evidence,
decision, cut/null and linked recovery-loss decision byte-equal the reserved
rows. The separately verified scope/namespace checkpoint proves external
membership; a point read alone cannot. Missing authority/row, stale chain,
crossed receipt or verification failure is lifecycle integrity failure and
inserts no review row. The mutable lifecycle decision audit is corroboration
only.

Every certifying first terminal transaction increments
`review_terminal_sequence_high_water` and stores that stable sequence in the
terminal journal/result digest. True-chair lifecycle adoption reads that high-
water in its own serialization transaction, inserts the exact custody-keyed certification cut
and either appends/activates a same-subject successor binding or leaves the
target read-derived stale. Review state never rejects or rolls back adoption.
A later stale adoption may append another cut for the same target/predecessor
because the exact agent/custody/revision ref, not predecessor generation, is the primary identity; the
unique cut digest and exact successor foreign key prevent reuse across custody.
Old-binding prepared/zero-dispatch attempts fail their worker currency check and
the route-recovery owner terminalises them no-effect once; dispatched/accepted/
ambiguous attempts recover normally. Evidence certifies through a successor
only when its terminal sequence is at or before the first successor cut and the
complete binding chain/digests are contiguous. Later terminals remain adverse
and permanently noncertifying. No target/head/evidence/finding row is cloned or
rewritten. Broken chains/cuts or multiple active pointers are integrity-failure.

Evidence stores only `certificationBasisAtTerminal` and its immutable receipt
digest. Read/list, operator projection and completion derive a separate
`currentCertificationBasis` from the active binding chain. Rotation may change
that live arm from active-binding to predecessor-cut without rewriting evidence;
a terminal after the first successor cut uses the exact post-cut arm and is
permanently noncertifying. A broken/missing chain yields null live basis plus the
existing integrity/stale blocker, never a fabricated predecessor-cut.

`review_finding_capacity_reservations` is a pre-router child of the pair
preflight, not of `provider_actions`. Its closed state is
`preflight|attached|released|settled`. The pre-router row binds the global pair,
run, target, closed slot and owner/reservation digests with null attempt
generation. After a successful resolver result, the one binding admission/
dispatch transaction from Spec 01 CAS-increments the slot head, assigns that
positive attempt to the reservation exactly once, inserts action and route, and
moves the reservation from `preflight` to `attached`; none can commit alone.
That null-to-positive attach is the only tuple finalisation. Thereafter run,
target, slot, attempt and digest are immutable. Resolver/admission failure moves
the reservation to `released` with attempt still null, returns its
physical capacity exactly once and creates no provider action, route or budget
row. Exact retry observes the released route failure; a new action pair may
reserve normally. Startup releases only expired preflight rows after proving no
matching action/route, while attached rows remain owned by terminal/recovery
settlement. Released/settled rows are immutable audit/replay history and consume
zero live capacity. Thus only successful dispatch consumes a contiguous attempt
generation, exactly as Spec 01 sections 32.19.4 and 32.19.6 require.
After attach, every terminal branch writes only `settled`, including the
`proved-no-effect-release` disposition: that disposition returns the complete
physical capacity but does not use the pre-admission `released` state. `released`
is reachable only from `preflight` with null attempt generation; no attached
path nulls or changes its attempt custody.

The append-only availability revision/head tables are the safe current
activation projection keyed by the complete project-session/profile/schema/
target-family/slot/adapter/contract/family/model/source/runtime/platform tuple.
Each revision is available with null reason or unavailable with
exactly one of `adapter-inactive`, `contract-mismatch`, `confinement-unproved`,
`portal-unavailable` or `provider-runtime-unavailable`. Adapter activation,
canary or contract change appends a revision, CAS-advances its head and global revision in one
transaction. Target-preparation admission and completion use this same table;
neither infers capability from a missing target or raw adapter error.

review_profile_snapshots and review_profile_slots normalise the exact four-slot
target snapshot. The checked-in schema/profile catalogue digest is verified at
startup. Slot rows byte-match resolvedReviewProfileSlotV1: adapter class/ID/
contract, family/model, requested/tagged resolved effort, aliases,
source/runtime/platform identity, provider/internal-step/read ceilings and explicit
reviewer-family relation. Publisher eligibility remains the separate
proved lineage/family-equals-target predicate. The baseline
requires exactly native, other-primary, cursor-grok and agy-gemini and enforces
the exact Spec 01 mapping. Native is exempt; all three external slots require
reviewer family distinct from target-chair family. No publisher-independence
column/blocker exists. Missing or extra slots prevent target commit.

The action-pair-only portal authenticates an ephemeral capability hash bound to
adapter/action pair, target, bundle, coverage digest and expiry. Its MCP server name is
agent-fabric-review-bundle and its only tools are review_bundle_read and
review_bundle_search. initialize/initialized, ping and tools/list/call are
allowed. resources/list, resources/templates/list and prompts/list return exact
empty arrays; resource read/subscription, prompts/get and sampling/roots/
completion/elicitation/logging are denied. It reads only committed root/page/
object/chunk joins and verifies their complete digest chain.

Read payloads use RFC 4648 padded base64. Raw root/page/chunk bytes are at most
65,536 and encoded payload is at most 87,384 bytes. There is no independent
metadata allowance: generated closed response templates bind every field,
maximum value, escaping rule, JSON-RPC envelope and final LF and prove the
complete read response is at most 98,304 bytes. Requests are exactly one UTF-8
JSON object plus LF, with no BOM, CRLF, batch, duplicate key or trailing bytes.
ID is integer `0..2147483647` or an ASCII string matching
`^[A-Za-z0-9._:-]{1,64}$`; response is exact RFC 8785 JCS plus LF.

Preparation reserves every mandatory response using the maximum 64-byte string
ID sentinel, then materialises it after bundle digest construction. Runtime
journal/ledgers debit the exact complete response for the admitted actual ID.
Direct dynamic-tool transports use the identical equivalent JSON-RPC charge and
Fabric-assigned action-local integer ID when no provider ID is exposed. Search
retains its separate 65,536-byte response limit. Generated exact-bound fixtures
cover both ID arms, binary/page/root/empty/error/search responses and reject any
runtime byte count above reservation before activation.

The read journal owns separate nonfungible mandatory and exploration counters.
The first response for each mandatory digest debits mandatory; duplicate/
optional reads, search and authenticated malformed/out-of-bundle calls debit
exploration. Direct mode reserves mandatory <=80 calls/6 MiB plus 32 calls/4
MiB exploration; helper mode reserves mandatory plus 48 calls/4 MiB. Both have
a 10 MiB combined wire-byte ceiling. Search is
inside exploration and is bounded to 16 calls/1 MiB aggregate plus 256 query
bytes, 100 results, 65,536 result bytes and 250 ms CPU per call. Each row stores
subledger/ordinal/tool/request/result/status/exact canonical response bytes.
Unique root/page/chunk responses alone satisfy mandatory; call order is free.
Portal-helper stream/hook events join the same journal. The portal resolves no
caller path or filesystem locator. Response/prompt bounds apply before adapter
I/O.

#### 9.21.3 Adapter capability and route admission

adapter-compatibility activation gains one digest-bound closed capability,
certifying-review-packet-only.v1. Its conformance record covers a daemon-built
per-action 0700 synthetic HOME with only exact 0600 auth/config bytes outside
the model tool namespace; exactly three non-secret helper locator environment
values; empty read-only cwd; one action-pair-only portal, direct or through the
pinned `agent-fabric-review-portal-supervisor portal-stdio-v1` Rust binary whose
trusted absolute path/device/inode/digest/code identity and fixed mode are
contract-bound; no inherited provider descriptor, HOME, user/project path,
unrelated plugin/source MCP effect, workspace index, shell/write/browser/
general-network effect; outer OS confinement and live canaries; fixed provider
transport; and crash-owned output/capsule/portal cleanup. Unsupported adapter/platform
combinations advertise false. The exact activated contract digest and source
mode are stored in each resolved profile slot and route.

Claude/Codex may expose the named portal server/tools directly only after
schema/ledger/source-denial/process-cleanup parity canaries pass; Codex has its
own mandatory confinement proof. Otherwise a provider uses the helper when the
same outer isolation can be proved, or advertises false. Cursor/Agy launch only
the pinned helper as adapter-internal bootstrap. Its environment is exactly
`AGENT_FABRIC_REVIEW_SOCKET`, `AGENT_FABRIC_REVIEW_ACTION` and
`AGENT_FABRIC_REVIEW_CONTRACT`; all are non-secret locators. It connects to the
per-action daemon AF_UNIX broker; capability stays broker-side. Their model
allowlist is exactly
mcp(agent-fabric-review-bundle/review_bundle_read) and
mcp(agent-fabric-review-bundle/review_bundle_search). Every other model mcp,
command, filesystem, shell, browser/web/network, resource and prompt effect is
denied. Exact-empty list probes remain permitted as above.

The current baseline separates pre-process filesystem intent from process
custody so no artifact or child exists without a durable locator:

~~~sql
review_portal_provider_launch_policies(
  adapter_id NOT NULL, contract_digest NOT NULL,
  launch_policy_json NOT NULL, launch_policy_digest NOT NULL,
  created_at NOT NULL,
  PRIMARY KEY(adapter_id,contract_digest),
  UNIQUE(adapter_id,contract_digest,launch_policy_digest),
  UNIQUE(launch_policy_digest)
)

review_portal_provider_activation_roots(
  daemon_instance_id NOT NULL,
  role NOT NULL CHECK(role IN ('synthetic-home','synthetic-temp')),
  canonical_path NOT NULL, device NOT NULL, inode NOT NULL,
  root_contract_json NOT NULL, root_contract_digest NOT NULL,
  created_at NOT NULL,
  PRIMARY KEY(daemon_instance_id,role),
  UNIQUE(root_contract_digest),
  UNIQUE(daemon_instance_id,role,root_contract_digest)
)

review_portal_provider_launch_source_contract_sets(
  adapter_id NOT NULL, action_id NOT NULL, daemon_instance_id NOT NULL,
  member_count NOT NULL CHECK(member_count >= 1),
  source_contract_set_digest NOT NULL,
  state NOT NULL CHECK(state IN ('building','sealed')),
  revision NOT NULL CHECK(revision IN (1,2)), created_at NOT NULL,
  sealed_at,
  PRIMARY KEY(adapter_id,action_id),
  UNIQUE(source_contract_set_digest),
  UNIQUE(adapter_id,action_id,daemon_instance_id,source_contract_set_digest),
  UNIQUE(adapter_id,action_id,daemon_instance_id,member_count,
    source_contract_set_digest,state),
  CHECK((state='building' AND revision=1 AND sealed_at IS NULL) OR
        (state='sealed' AND revision=2 AND sealed_at IS NOT NULL))
)

review_portal_provider_launch_source_contracts(
  adapter_id NOT NULL, action_id NOT NULL, daemon_instance_id NOT NULL,
  source_contract_set_digest NOT NULL,
  ordinal NOT NULL CHECK(ordinal >= 1),
  source_selector NOT NULL, source_contract_kind NOT NULL CHECK(
    source_contract_kind IN ('effective-configuration-field',
      'activated-executable','action-identity','review-socket',
      'synthetic-home','synthetic-temp','credential-capsule','empty-cwd',
      'policy-stdin-mode','adapter-secret-version')),
  path_class NOT NULL, source_contract_json NOT NULL,
  source_contract_digest NOT NULL, created_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id,ordinal),
  UNIQUE(adapter_id,action_id,source_selector,source_contract_digest),
  UNIQUE(adapter_id,action_id,source_contract_digest),
  UNIQUE(adapter_id,action_id,daemon_instance_id,
    source_contract_set_digest,source_contract_kind,source_contract_digest),
  FOREIGN KEY(adapter_id,action_id,daemon_instance_id,
      source_contract_set_digest)
    REFERENCES review_portal_provider_launch_source_contract_sets(
      adapter_id,action_id,daemon_instance_id,source_contract_set_digest)
)

review_portal_provider_launch_envelopes(
  adapter_id NOT NULL, action_id NOT NULL, contract_digest NOT NULL,
  daemon_instance_id NOT NULL,
  configuration_subject_kind NOT NULL CHECK(
    configuration_subject_kind='provider-action'),
  configuration_id NOT NULL, configuration_revision NOT NULL,
  configuration_digest NOT NULL, effective_configuration_digest NOT NULL,
  executable_identity_digest NOT NULL,
  launch_policy_digest NOT NULL, launch_envelope_json NOT NULL,
  launch_envelope_digest NOT NULL, source_contract_member_count NOT NULL,
  source_contract_set_digest NOT NULL,
  source_contract_set_state NOT NULL CHECK(source_contract_set_state='sealed'),
  created_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id),
  UNIQUE(launch_envelope_digest),
  UNIQUE(adapter_id,action_id,daemon_instance_id,launch_envelope_digest,
    source_contract_set_digest),
  UNIQUE(adapter_id,action_id,configuration_subject_kind,contract_digest,
    configuration_id,configuration_revision,configuration_digest,
    effective_configuration_digest,executable_identity_digest,
    launch_envelope_digest,daemon_instance_id,source_contract_set_digest),
  FOREIGN KEY(adapter_id,action_id,configuration_subject_kind,contract_digest,
      configuration_id,configuration_revision,configuration_digest,
      effective_configuration_digest,executable_identity_digest)
    REFERENCES adapter_effective_configurations(
      subject_action_adapter_id,subject_action_id,subject_kind,
      adapter_contract_digest,configuration_id,configuration_revision,
      configuration_digest,effective_configuration_digest,
      executable_identity_digest),
  FOREIGN KEY(adapter_id,contract_digest,launch_policy_digest)
    REFERENCES review_portal_provider_launch_policies(
      adapter_id,contract_digest,launch_policy_digest),
  FOREIGN KEY(adapter_id,action_id,daemon_instance_id,
      source_contract_member_count,source_contract_set_digest,
      source_contract_set_state)
    REFERENCES review_portal_provider_launch_source_contract_sets(
      adapter_id,action_id,daemon_instance_id,member_count,
      source_contract_set_digest,state)
)

review_portal_provider_exec_closures(
  adapter_id NOT NULL, action_id NOT NULL, contract_digest NOT NULL,
  daemon_instance_id NOT NULL,
  configuration_subject_kind NOT NULL CHECK(
    configuration_subject_kind='provider-action'),
  configuration_id NOT NULL, configuration_revision NOT NULL,
  configuration_digest NOT NULL, effective_configuration_digest NOT NULL,
  executable_identity_digest NOT NULL,
  launch_envelope_digest NOT NULL, source_contract_set_digest NOT NULL,
  provider_closure_json NOT NULL, provider_closure_digest NOT NULL,
  created_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id),
  UNIQUE(adapter_id,action_id,contract_digest,daemon_instance_id,
    provider_closure_digest),
  UNIQUE(adapter_id,action_id,contract_digest,daemon_instance_id,
    provider_closure_digest,launch_envelope_digest,source_contract_set_digest),
  UNIQUE(provider_closure_digest),
  FOREIGN KEY(adapter_id,action_id,configuration_subject_kind,contract_digest,
      configuration_id,configuration_revision,configuration_digest,
      effective_configuration_digest,executable_identity_digest,
      launch_envelope_digest,daemon_instance_id,source_contract_set_digest)
    REFERENCES review_portal_provider_launch_envelopes(
      adapter_id,action_id,configuration_subject_kind,contract_digest,
      configuration_id,configuration_revision,
      configuration_digest,effective_configuration_digest,
      executable_identity_digest,launch_envelope_digest,daemon_instance_id,
      source_contract_set_digest)
)

review_portal_filesystem_directory_name_claims(
  recovery_root_device NOT NULL, recovery_root_inode NOT NULL,
  directory_basename NOT NULL,
  adapter_id NOT NULL, action_id NOT NULL,
  role NOT NULL CHECK(role IN ('custody','claim')),
  PRIMARY KEY(recovery_root_device,recovery_root_inode,directory_basename),
  UNIQUE(adapter_id,action_id,role),
  UNIQUE(adapter_id,action_id,role,recovery_root_device,
    recovery_root_inode,directory_basename)
)

review_portal_action_artifact_name_claims(
  daemon_instance_id NOT NULL,
  artifact_role NOT NULL CHECK(
    artifact_role IN ('synthetic-home','synthetic-temp')),
  activated_root_contract_digest NOT NULL, basename NOT NULL,
  adapter_id NOT NULL, action_id NOT NULL,
  name_role NOT NULL CHECK(name_role IN ('canonical','claim')),
  PRIMARY KEY(activated_root_contract_digest,basename),
  UNIQUE(adapter_id,action_id,artifact_role,name_role),
  UNIQUE(adapter_id,action_id,artifact_role,name_role,daemon_instance_id,
    activated_root_contract_digest,basename),
  FOREIGN KEY(daemon_instance_id,artifact_role,
      activated_root_contract_digest)
    REFERENCES review_portal_provider_activation_roots(
      daemon_instance_id,role,root_contract_digest),
  CHECK(basename NOT IN ('','.','..') AND instr(basename,'/')=0)
)

review_portal_action_artifact_intents(
  adapter_id NOT NULL, action_id NOT NULL, daemon_instance_id NOT NULL,
  role NOT NULL CHECK(role IN ('synthetic-home','synthetic-temp')),
  source_contract_set_digest NOT NULL, source_contract_digest NOT NULL,
  activated_root_contract_digest NOT NULL,
  canonical_path NOT NULL, canonical_basename NOT NULL,
  canonical_path_digest NOT NULL,
  entry_manifest_digest NOT NULL,
  canonical_name_role NOT NULL CHECK(canonical_name_role='canonical'),
  claim_basename NOT NULL,
  claim_name_role NOT NULL CHECK(claim_name_role='claim'),
  artifact_intent_digest NOT NULL, created_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id,role),
  UNIQUE(artifact_intent_digest),
  UNIQUE(activated_root_contract_digest,canonical_path),
  UNIQUE(activated_root_contract_digest,canonical_basename),
  UNIQUE(activated_root_contract_digest,claim_basename),
  UNIQUE(adapter_id,action_id,role,daemon_instance_id,
    source_contract_set_digest,source_contract_digest,
    activated_root_contract_digest,canonical_path,canonical_basename,
    canonical_path_digest,
    entry_manifest_digest,canonical_name_role,claim_basename,
    claim_name_role,artifact_intent_digest),
  FOREIGN KEY(adapter_id,action_id,daemon_instance_id,
      source_contract_set_digest,role,source_contract_digest)
    REFERENCES review_portal_provider_launch_source_contracts(
      adapter_id,action_id,daemon_instance_id,source_contract_set_digest,
      source_contract_kind,source_contract_digest),
  FOREIGN KEY(daemon_instance_id,role,activated_root_contract_digest)
    REFERENCES review_portal_provider_activation_roots(
      daemon_instance_id,role,root_contract_digest),
  FOREIGN KEY(adapter_id,action_id,role,canonical_name_role,
      daemon_instance_id,activated_root_contract_digest,canonical_basename)
    REFERENCES review_portal_action_artifact_name_claims(
      adapter_id,action_id,artifact_role,name_role,daemon_instance_id,
      activated_root_contract_digest,basename),
  FOREIGN KEY(adapter_id,action_id,role,claim_name_role,
      daemon_instance_id,activated_root_contract_digest,claim_basename)
    REFERENCES review_portal_action_artifact_name_claims(
      adapter_id,action_id,artifact_role,name_role,daemon_instance_id,
      activated_root_contract_digest,basename),
  CHECK(canonical_basename <> claim_basename),
  CHECK(canonical_basename NOT IN ('','.','..') AND
    claim_basename NOT IN ('','.','..') AND
    instr(canonical_basename,'/')=0 AND instr(claim_basename,'/')=0)
)

review_portal_action_artifact_states(
  adapter_id NOT NULL, action_id NOT NULL,
  role NOT NULL CHECK(role IN ('synthetic-home','synthetic-temp')),
  artifact_intent_digest NOT NULL,
  phase NOT NULL CHECK(phase IN
    ('reserved','captured','claimed','removed','integrity-failure')),
  capture_kind CHECK(capture_kind IS NULL OR capture_kind IN
    ('complete','partial-recovery')),
  actual_device, actual_inode, actual_link_count,
  actual_entry_manifest_digest, actual_identity_digest,
  cleanup_evidence_digest, revision NOT NULL CHECK(revision >= 1),
  updated_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id,role),
  FOREIGN KEY(adapter_id,action_id,role,artifact_intent_digest)
    REFERENCES review_portal_action_artifact_intents(
      adapter_id,action_id,role,artifact_intent_digest),
  CHECK(
    (phase='reserved' AND capture_kind IS NULL AND
      actual_device IS NULL AND actual_inode IS NULL AND
      actual_link_count IS NULL AND actual_entry_manifest_digest IS NULL AND
      actual_identity_digest IS NULL AND cleanup_evidence_digest IS NULL) OR
    (phase IN ('captured','claimed') AND capture_kind IS NOT NULL AND
      actual_device IS NOT NULL AND
      actual_inode IS NOT NULL AND actual_link_count IS NOT NULL AND
      actual_entry_manifest_digest IS NOT NULL AND
      actual_identity_digest IS NOT NULL AND cleanup_evidence_digest IS NULL) OR
    (phase IN ('removed','integrity-failure') AND
      cleanup_evidence_digest IS NOT NULL)
  )
)

review_portal_filesystem_custody_intents(
  adapter_id NOT NULL, action_id NOT NULL, contract_digest NOT NULL,
  daemon_instance_id NOT NULL,
  recovery_root_path NOT NULL, recovery_root_device NOT NULL,
  recovery_root_inode NOT NULL, recovery_root_identity_digest NOT NULL,
  custody_directory_role NOT NULL CHECK(custody_directory_role='custody'),
  custody_directory_basename NOT NULL,
  custody_directory_contract_digest NOT NULL,
  claim_directory_role NOT NULL CHECK(claim_directory_role='claim'),
  claim_directory_basename NOT NULL,
  socket_basename NOT NULL, capsule_basename NOT NULL,
  expected_capsule_content_digest NOT NULL,
  provider_closure_digest NOT NULL, launch_envelope_digest NOT NULL,
  source_contract_set_digest NOT NULL, launch_nonce_digest NOT NULL,
  home_artifact_role NOT NULL CHECK(home_artifact_role='synthetic-home'),
  home_artifact_intent_digest NOT NULL,
  temp_artifact_role NOT NULL CHECK(temp_artifact_role='synthetic-temp'),
  temp_artifact_intent_digest NOT NULL,
  claim_name_codec NOT NULL CHECK(
    claim_name_codec='agent-fabric-custody-claim-v1'),
  intent_digest NOT NULL, created_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id),
  UNIQUE(launch_nonce_digest),
  UNIQUE(adapter_id,action_id,intent_digest),
  UNIQUE(adapter_id,action_id,intent_digest,contract_digest,daemon_instance_id,
    provider_closure_digest,launch_envelope_digest,source_contract_set_digest,
    launch_nonce_digest,home_artifact_role,home_artifact_intent_digest,
    temp_artifact_role,temp_artifact_intent_digest,
    recovery_root_path,recovery_root_device,recovery_root_inode,
    recovery_root_identity_digest,custody_directory_basename,
    custody_directory_contract_digest,claim_directory_basename,
    socket_basename,capsule_basename,expected_capsule_content_digest,
    claim_name_codec),
  FOREIGN KEY(adapter_id,action_id,custody_directory_role,
      recovery_root_device,recovery_root_inode,custody_directory_basename)
    REFERENCES review_portal_filesystem_directory_name_claims(
      adapter_id,action_id,role,recovery_root_device,recovery_root_inode,
      directory_basename),
  FOREIGN KEY(adapter_id,action_id,contract_digest,daemon_instance_id,
      provider_closure_digest,launch_envelope_digest,source_contract_set_digest)
    REFERENCES review_portal_provider_exec_closures(
      adapter_id,action_id,contract_digest,daemon_instance_id,
      provider_closure_digest,launch_envelope_digest,
      source_contract_set_digest),
  FOREIGN KEY(adapter_id,action_id,home_artifact_role,
      home_artifact_intent_digest)
    REFERENCES review_portal_action_artifact_intents(
      adapter_id,action_id,role,artifact_intent_digest),
  FOREIGN KEY(adapter_id,action_id,temp_artifact_role,
      temp_artifact_intent_digest)
    REFERENCES review_portal_action_artifact_intents(
      adapter_id,action_id,role,artifact_intent_digest),
  FOREIGN KEY(adapter_id,action_id,claim_directory_role,
      recovery_root_device,recovery_root_inode,claim_directory_basename)
    REFERENCES review_portal_filesystem_directory_name_claims(
      adapter_id,action_id,role,recovery_root_device,recovery_root_inode,
      directory_basename),
  CHECK(substr(recovery_root_path,1,1)='/'),
  CHECK(custody_directory_basename <> claim_directory_basename),
  CHECK(socket_basename <> capsule_basename),
  CHECK(instr(custody_directory_basename,'/')=0 AND
    instr(claim_directory_basename,'/')=0 AND
    instr(socket_basename,'/')=0 AND instr(capsule_basename,'/')=0),
  CHECK(custody_directory_basename NOT IN ('','.','..') AND
    claim_directory_basename NOT IN ('','.','..') AND
    socket_basename NOT IN ('','.','..') AND
    capsule_basename NOT IN ('','.','..'))
)

review_portal_filesystem_custody_state(
  adapter_id NOT NULL, action_id NOT NULL,
  state NOT NULL CHECK(state IN
    ('open','cleaned','integrity-failure')),
  revision NOT NULL CHECK(revision >= 1), cleanup_evidence_digest,
  updated_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id),
  FOREIGN KEY(adapter_id,action_id)
    REFERENCES review_portal_filesystem_custody_intents(adapter_id,action_id),
  CHECK((state IN ('cleaned','integrity-failure')) =
    (cleanup_evidence_digest IS NOT NULL))
)

review_portal_process_custody(
  adapter_id NOT NULL, action_id NOT NULL, contract_digest NOT NULL,
  daemon_instance_id NOT NULL, filesystem_intent_digest NOT NULL,
  launch_nonce_digest NOT NULL, launch_action_binding_digest NOT NULL,
  launch_registration_digest NOT NULL,
  process_custody_launch_digest NOT NULL, launch_ack_digest NOT NULL,
  launch_row_revision NOT NULL CHECK(launch_row_revision=1),
  supervisor_pid NOT NULL CHECK(supervisor_pid > 0),
  supervisor_start_time NOT NULL CHECK(supervisor_start_time > 0),
  provider_root_pid NOT NULL CHECK(provider_root_pid > 0),
  provider_root_start_time NOT NULL CHECK(provider_root_start_time > 0),
  process_group_id NOT NULL CHECK(process_group_id > 0),
  session_id NOT NULL CHECK(session_id > 0),
  supervisor_executable_identity_digest NOT NULL,
  launch_stub_identity_digest NOT NULL, provider_closure_digest NOT NULL,
  launch_envelope_digest NOT NULL, source_contract_set_digest NOT NULL,
  home_artifact_role NOT NULL CHECK(home_artifact_role='synthetic-home'),
  home_artifact_intent_digest NOT NULL,
  temp_artifact_role NOT NULL CHECK(temp_artifact_role='synthetic-temp'),
  temp_artifact_intent_digest NOT NULL,
  ancestry_manifest_digest NOT NULL,
  recovery_root_path NOT NULL, recovery_root_device NOT NULL,
  recovery_root_inode NOT NULL, recovery_root_identity_digest NOT NULL,
  custody_directory_basename NOT NULL,
  custody_directory_contract_digest NOT NULL,
  claim_directory_basename NOT NULL,
  custody_directory_device NOT NULL, custody_directory_inode NOT NULL,
  claim_directory_device NOT NULL,
  claim_directory_inode NOT NULL,
  claim_name_codec NOT NULL CHECK(
    claim_name_codec='agent-fabric-custody-claim-v1'),
  socket_basename NOT NULL, socket_claim_basename NOT NULL,
  socket_file_device NOT NULL, socket_file_inode NOT NULL,
  socket_link_count NOT NULL CHECK(socket_link_count=1),
  socket_identity_digest NOT NULL,
  socket_cleanup_state NOT NULL,
  capsule_basename NOT NULL, capsule_claim_basename NOT NULL,
  capsule_file_device NOT NULL, capsule_file_inode NOT NULL,
  capsule_link_count NOT NULL CHECK(capsule_link_count=1),
  capsule_content_digest NOT NULL, capsule_cleanup_state NOT NULL,
  control_fd_number NOT NULL CHECK(control_fd_number=3),
  registration_fd_number NOT NULL CHECK(registration_fd_number=4),
  provider_exec_fd_number NOT NULL CHECK(provider_exec_fd_number=5),
  provider_cwd_fd_number NOT NULL CHECK(provider_cwd_fd_number=6),
  executable_parent_fd_number NOT NULL CHECK(executable_parent_fd_number=7),
  connection_state NOT NULL CHECK(
    connection_state IN ('waiting','consumed','closed')),
  process_state NOT NULL CHECK(process_state IN
    ('preparing','running','terminating','cleaned','integrity-failure')),
  directory_cleanup_state NOT NULL,
  directory_cleanup_evidence_digest,
  cleanup_generation NOT NULL CHECK(cleanup_generation >= 0),
  cleanup_evidence_digest, revision NOT NULL CHECK(revision >= 1),
  created_at NOT NULL, updated_at NOT NULL,
  PRIMARY KEY(adapter_id, action_id),
  UNIQUE(launch_nonce_digest),
  FOREIGN KEY(adapter_id,action_id,filesystem_intent_digest,
      contract_digest,daemon_instance_id,provider_closure_digest,
      launch_envelope_digest,source_contract_set_digest,launch_nonce_digest,
      home_artifact_role,home_artifact_intent_digest,
      temp_artifact_role,temp_artifact_intent_digest,
      recovery_root_path,recovery_root_device,recovery_root_inode,
      recovery_root_identity_digest,custody_directory_basename,
      custody_directory_contract_digest,claim_directory_basename,
      socket_basename,capsule_basename,capsule_content_digest,
      claim_name_codec)
    REFERENCES review_portal_filesystem_custody_intents(
      adapter_id,action_id,intent_digest,
      contract_digest,daemon_instance_id,provider_closure_digest,
      launch_envelope_digest,source_contract_set_digest,launch_nonce_digest,
      home_artifact_role,home_artifact_intent_digest,
      temp_artifact_role,temp_artifact_intent_digest,
      recovery_root_path,recovery_root_device,recovery_root_inode,
      recovery_root_identity_digest,custody_directory_basename,
      custody_directory_contract_digest,claim_directory_basename,
      socket_basename,capsule_basename,expected_capsule_content_digest,
      claim_name_codec),
  CHECK(claim_directory_basename <> custody_directory_basename),
  CHECK(claim_directory_device = custody_directory_device),
  CHECK(claim_directory_inode <> custody_directory_inode),
  CHECK(socket_basename <> capsule_basename),
  CHECK(socket_claim_basename <> capsule_claim_basename),
  CHECK(socket_claim_basename NOT IN (socket_basename,capsule_basename)),
  CHECK(capsule_claim_basename NOT IN (socket_basename,capsule_basename)),
  CHECK(instr(socket_basename,'/')=0 AND
    instr(socket_claim_basename,'/')=0 AND
    instr(capsule_basename,'/')=0 AND
    instr(capsule_claim_basename,'/')=0),
  CHECK(socket_basename NOT IN ('','.','..') AND
    socket_claim_basename NOT IN ('','.','..') AND
    capsule_basename NOT IN ('','.','..') AND
    capsule_claim_basename NOT IN ('','.','..')),
  CHECK(socket_cleanup_state IN
    ('canonical','claimed','removed','integrity-failure')),
  CHECK(capsule_cleanup_state IN
    ('canonical','claimed','removed','integrity-failure')),
  CHECK(directory_cleanup_state IN
    ('active','children-removed','canonical-removed','removed',
     'integrity-failure')),
  CHECK((directory_cleanup_state='active') =
    (directory_cleanup_evidence_digest IS NULL)),
  CHECK(directory_cleanup_state NOT IN
    ('children-removed','canonical-removed','removed') OR
    (socket_cleanup_state='removed' AND capsule_cleanup_state='removed')),
  CHECK(process_state <> 'cleaned' OR directory_cleanup_state='removed'),
  CHECK(directory_cleanup_state <> 'removed' OR
    process_state IN ('cleaned','integrity-failure')),
  CHECK((process_state IN ('cleaned','integrity-failure')) =
    (cleanup_evidence_digest IS NOT NULL))
)
~~~

All displayed locator/identity path, device, inode, basename and kind-specific
digest fields are nonnull and immutable. Phase evidence digests are null only in
their declared pre-evidence state and become immutable nonnull values in the
owning state CAS. Before any per-action HOME/temp directory, custody/claim
directory, filesystem portal socket, capsule or process exists, one transaction
reserves their four role/name claims, inserts the exact HOME/temp artifact
intents and their `reserved` states,
reserves both globally unique recovery-root child names and inserts the
immutable filesystem intent plus `open` state. `open` with no
process row is the reserved arm; `open` with its exact process row is the
process-bound arm. Process-row existence, not a separately mutable flag, is the
atomic ownership transition.
Daemon-created anonymous stdio pipes/socketpairs or an OS-owned PTY may be
captured for the closure before that transaction only while every endpoint
remains in the daemon, no child exists and no project/provider namespace entry
is created. Transaction failure closes them; daemon death lets the kernel close
them, leaving no recoverable path or external effect. The HOME/temp, listener
path, capsule and custody directories remain strictly post-intent.
Exactly two role-distinct name claims must join each intent; orphan, missing,
crossed or post-insert-mutated claims are rejected, and neither claim is reused
while its immutable intent remains registered.
It binds an already-opened 0700 daemon recovery root by path/device/inode plus
all create-exclusive relative basenames and expected capsule digest. The daemon
then creates the canonical and distinct 0700 claim directories only beneath
that no-follow root, writes/binds each artifact and fsyncs every file/directory/
parent before launch. A crash while reserved can see absent or partially created
objects but no provider has executed; recovery uses the exact root/intent and
the same trusted-claim revalidation, removes only a proved daemon-created object,
fsyncs the root after each removal and CASes the open/no-process state to cleaned.
It permits only the two reserved recovery-root directory basenames/their two
declared children plus the exact HOME/temp paths/manifests named by the two
artifact intents; any extra, crossed or substituted object records integrity
failure without deletion. Fully captured
identities, contract and daemon instance are equality-copied through the
displayed composite FK when the process row is inserted in the pre-ACK
transaction. That row is nondeletable and its identity fields are immutable.
Only it then owns live cleanup; state becomes cleaned or integrity-failed only
after the matching process/directory and both action-artifact terminals, and is
never a second owner.
Direct-SQL fixtures reject process insertion against non-open state, crossed
intent/contract/daemon/root/name/content, a process-less process-bound claim and
delete/reversion. It provisions both
directories on the same filesystem while sharing neither inode nor basename,
and current-build activation probes same-mount
atomic no-replace rename plus provider denial of read/list/write access to the
claim namespace. The row also persists both claim basenames and
`claim_name_codec=agent-fabric-custody-claim-v1`. For each entry the claim name
is `.agent-fabric-claim-` plus lowercase hex SHA-256 of the ASCII bytes
`agent-fabric-custody-claim-v1` followed by one `0x00` byte, then the canonical-
basename UTF-8 bytes,
u64be(device), u64be(inode), one kind byte (`0x00` socket, `0x01` regular file)
and the raw 32 digest bytes, concatenated in that order. The Rust boundary
recomputes and equality-checks the persisted name. Admission rejects either
claim name matching any canonical name or the other claim name. Thus executable
upgrade cannot silently change a live record's locator.
`socket_identity_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-custody-socket-v1` followed by one `0x00` byte, then
`u64be(device) || u64be(inode)`. The entry must be `S_IFSOCK`;
`capsule_content_digest` is `sha256:` plus lowercase
SHA-256 of the exact bounded regular-file bytes and the persisted device/inode
must also match. Both persisted link counts are exactly one. Golden vectors pin both exact domain preimages, the socket
digest and both claim names across Rust and TypeScript. No socket-content digest
exists. Failure refuses launch and
leaves capability false. These
private crash-locating fields never cross internal boundaries; only their
nonsecret correlation digests may do so, and none is public/model-visible.

The HOME/temp artifact intent is independently reproducible.
`artifact_intent_digest` uses domain
`agent-fabric-portal-action-artifact-intent-v1`, `0x00` and JCS of every
immutable intent-row field except that digest and `created_at`. Its claim name
is `.agent-fabric-action-claim-` plus lowercase SHA-256 hex of the ASCII bytes
`agent-fabric-portal-action-artifact-claim-v1`, `0x00`, role UTF-8, one `0x00`,
canonical-path-digest raw bytes, activated-root-contract-digest raw bytes and
source-contract-digest raw bytes. Home and temp claim names are distinct direct
siblings of their canonical action directory beneath the exact same cited
activated root. The root is never exposed; outer confinement grants the
provider only its canonical child and current-build canaries deny parent/claim
lookup, open and mutation. Same-root sibling rename supplies the proved atomic
same-filesystem boundary without an unstored claim-root locator.

After creating a directory no-follow and fsyncing its manifest/root, the daemon
captures device, inode, the root's positive observed link count and the actual
entry-manifest digest, which includes every entry's actual link count.
The captured manifest is exactly:

~~~yaml
reviewPortalActionArtifactCapturedManifestV1:
  schemaVersion: 1
  role: synthetic-home | synthetic-temp
  captureKind: complete | partial-recovery
  expectedEntryCountDec: nonnegative
  capturedEntryCountDec: nonnegative
  entries:
    - ordinalDec: positive-contiguous
      relativePath: exact-source-relative-path
      fileType: directory | regular
      modeOctal: "0700" | "0600"
      actualLinkCountDec: positive
      contentLengthDec: nonnegative | null
      contentDigest: exact-sha256 | null
~~~

Entries preserve source-manifest ordinal order. Directory content fields are
null; regular files have actual link count one and equality-copy source length/
digest. Expected count equals the source count. Complete capture has captured
count equal expected; partial recovery has a strictly smaller captured count and
the exact source prefix. Temp is the complete zero/zero/empty arm. The
`actual_entry_manifest_digest` uses domain
`agent-fabric-portal-action-artifact-captured-manifest-v1`, `0x00` and JCS of
this complete object. Rust/TypeScript goldens cover empty temp, zero/nonzero
HOME, nested-directory link counts and every valid prefix; permutation,
nonprefix and guessed-link mutants fail.
`actual_identity_digest` uses domain
`agent-fabric-portal-action-artifact-identity-v1`, `0x00` and JCS of exactly
`[role,captureKind,deviceDec,inodeDec,linkCountDec,
actualEntryManifestDigest,sourceContractDigest]`. `captureKind` is `complete`
after normal construction or `partial-recovery` only while recovering a
reserved pre-process crash. Captured root identity and manifest never change.
Process insert/ACK requires both roles captured as `complete` and exact intent/
envelope/source-contract equality; process and intent copy both artifact-intent
digests.

The exact phase/presence machine is:

- `reserved` with canonical and claim both absent writes no-effect cleanup
  evidence and CASes directly to `removed`. With canonical present and claim
  absent, recovery opens it no-follow and accepts only the complete expected
  pre-exec manifest or an exact no-extra ordinal prefix produced by the
  deterministic parent-before-child builder; it captures the corresponding
  kind and CASes to `captured`. Any claim presence or unproved canonical object
  is integrity failure;
- `captured` accepts either the exact canonical inode with claim absent, in
  which case it renames canonical to claim no-replace and fsyncs the root, or
  canonical absent with that exact inode already at claim, the crash-after-
  rename arm. It then CASes to `claimed`. Both present, both absent or another
  inode is integrity failure;
- `claimed` accepts canonical absent plus the exact claimed root, removes it as
  below, fsyncs the root and CASes to `removed`; canonical and claim both absent
  is the crash-after-remove arm and also fsyncs before that CAS. Any canonical
  reappearance, crossed inode or both present is integrity failure; and
- `removed` requires both names absent. `integrity-failure` never deletes.

Before provider exec, a partial prefix never becomes process-bound. After the
provider root is killed and reaped, provider-created cache/temp descendants and
content drift inside the proved root are expected: cleanup first atomically
claims the unchanged root inode, then performs a bounded no-follow postorder
walk using retained directory FDs. It may unlink arbitrary descendant names,
regular hard links, symlinks, sockets and regular files without following or
reading them, but never crosses the root device, a nested mount, descriptor
identity or the activated-root boundary. The activated adapter contract pins
and enforces lifetime quotas no larger than 65,536 descendants, depth 32 and
1 GiB allocated bytes; exceeding a quota is integrity failure, not unbounded
work. Reserved pre-process recovery remains strict-prefix only because no
provider has run. Every removed child/directory and final parent is fsynced; a
closed cleanup-evidence manifest binds encountered relative path/type/device/
inode, deletion order and final absence without exposing file content.

Crash/direct-SQL fixtures cover absent `reserved -> removed`, every entry-
creation prefix, complete/partial capture, before/after rename/fsync/CAS,
before/after every child and root removal, provider-created cache/temp/symlink/
socket entries, quota and nested-mount rejection, both accepted crash-presence
arms and every crossed name/inode/root combination.

The activated adapter contract registers exactly one immutable certifying
provider launch policy. `launch_policy_json` byte-equals RFC 8785 JCS of this
closed object; `launch_policy_digest` is `sha256:` plus lowercase SHA-256 of the
ASCII bytes `agent-fabric-portal-provider-launch-policy-v1`, one `0x00` byte and
those exact JCS bytes:

~~~yaml
reviewPortalProviderLaunchPolicyV1:
  schemaVersion: 1
  adapterId: exact-adapter
  contractDigest: exact-contract
  argv:
    maxCountDec: positive
    maxTotalUtf8BytesDec: positive
    template:
      - ordinalDec: positive-contiguous
        tokenKind: fixed-literal | option-name | sourced-value
        exactValue: exact-nul-free-utf8 | null
        exactValueDigest: exact-sha256 | null
        optionValueSlotOrdinalsDec: [strictly-increasing-positive-decimal]
        ownerOptionOrdinalDec: nonnegative
        ownerOptionValueIndexDec: nonnegative
        sourceKind: none | resolved-model | resolved-effort |
          executable-path | action-locator | stdin-mode | synthetic-path
        sourceSelector: none | effective-config-model |
          effective-config-effort | activated-executable-path |
          review-socket-locator | review-action-id | review-contract-digest |
          provider-stdin-mode | synthetic-home-path | synthetic-temp-path |
          credential-capsule-path | empty-cwd-path
        pathClass: not-path | review-socket | synthetic-home |
          synthetic-temp | credential-capsule | empty-cwd | executable
        sourceContractRule: none | effective-configuration-field |
          effective-configuration-executable | action-identity |
          action-review-socket | action-synthetic-home |
          action-synthetic-temp | action-credential-capsule |
          activation-empty-cwd | launch-policy-stdin-mode
        slotDigest: exact-digest
    forbidUnknownOption: true
    forbidShellOrInterpreterEval: true
    forbidWorkspaceCwdConfigPluginMcpToolOverrides: true
  environment:
    maxCountDec: positive
    maxTotalValueBytesDec: positive
    admitted:
      - name: exact-name
        sourceKind: fixed-literal | synthetic-home | synthetic-temp |
          credential-capsule | action-locator | adapter-secret
        sourceSelector: policy-fixed-literal | daemon-synthetic-home |
          daemon-synthetic-temp | prospective-credential-capsule |
          review-socket-locator | review-action-id | review-contract-digest |
          adapter-secret-version
        pathClass: not-path | review-socket | synthetic-home |
          synthetic-temp | credential-capsule
        allowEmpty: true | false
        fixedValue: exact-nul-free-utf8 | null
        fixedValueDigest: exact-sha256 | null
        sourceContractRule: none | action-synthetic-home |
          action-synthetic-temp | action-credential-capsule |
          action-review-socket | action-identity | adapter-secret-version
        entryDigest: exact-digest
    inheritParent: false
    mandatoryDeniedNames: [BASH_ENV, ENV, GIT_CONFIG, GIT_CONFIG_COUNT,
      GIT_DIR, GIT_WORK_TREE, LD_AUDIT, LD_LIBRARY_PATH, LD_PRELOAD,
      NODE_OPTIONS, PERL5OPT, PYTHONINSPECT, PYTHONPATH, RUBYOPT]
    mandatoryDeniedPrefixes: [DYLD_, GIT_CONFIG_KEY_, GIT_CONFIG_VALUE_]
  pathClasses:
    synthetic-home: action-private-directory-under-activated-home-root
    synthetic-temp: action-private-directory-under-activated-temp-root
    credential-capsule: action-private-regular-file-under-custody-directory
    empty-cwd: activation-owned-empty-read-only-directory
    review-socket: action-private-unix-socket-under-custody-directory
    executable: effective-configuration-opened-executable
    real-home-user-project-workspace-provider-source: denied
~~~

`argv.template` is the complete ordered grammar, including argv[0], every
literal, every option and every option/positional value. Its ordinals are
positive and contiguous. Each entry has exactly the displayed fields and the
following closed truth table:

- `fixed-literal` has non-null `exactValue`/matching digest, an empty option-
  slot array, zero owner ordinals, and `none`/`none`/`not-path`/null source
  fields and `sourceContractRule=none`;
- `option-name` has non-null exact option spelling/matching digest, a nonempty
  strictly increasing unique list of the sourced-value ordinals it owns, zero
  owner ordinals, and the same null source fields. Its declared arity is exactly
  that list's length; and
- `sourced-value` has null exact value fields and an empty option-slot array.
  A positional value uses owner/index zero. An option value names one earlier
  `option-name` ordinal and its positive one-based index, and the inverse option
  list must name that ordinal in the same position. Its non-`none` source kind,
  selector, path class and source-contract rule must match the closed selector
  table below. No other combination exists.

`slotDigest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-provider-launch-policy-argv-slot-v1`, one `0x00` byte and
RFC 8785 JCS of the complete slot object with only `slotDigest` omitted.
Consequently option name, arity, value ownership, source and path class are one
contract-pinned unit, rather than labels supplied by an action. Fixed literal
and option values are pinned both in clear and by digest; they are nonsecret.

`environment.admitted` is strictly increasing by raw UTF-8 `name`, names are
unique, and every entry has exactly the displayed fields. `fixed-literal` uses
selector `policy-fixed-literal`, `not-path`, non-null fixed value/matching digest
and source-contract rule `none`. Every other arm has null fixed fields and a
non-`none` exact source-contract rule. Its selector uniquely selects its source
kind; synthetic/capsule/socket selectors use the identically named path class,
while action-id, contract-digest and adapter-secret use `not-path`.
`entryDigest` uses domain
`agent-fabric-portal-provider-launch-policy-environment-entry-v1`, `0x00` and
JCS of the complete entry with only `entryDigest` omitted. Mandatory denied-name
and denied-prefix arrays are each strictly increasing by raw UTF-8 bytes and
duplicate-free. Every option-value ordinal array is also strictly increasing
and duplicate-free. JCS object-key ordering is not used as a substitute for
these array invariants.

Selectors have exactly this policy mapping:

| selector | source kind | path class | source-contract rule |
|---|---|---|---|
| `none` | `none` | `not-path` | `none` |
| `effective-config-model` | `resolved-model` | `not-path` | `effective-configuration-field` |
| `effective-config-effort` | `resolved-effort` | `not-path` | `effective-configuration-field` |
| `activated-executable-path` | `executable-path` | `executable` | `effective-configuration-executable` |
| `review-socket-locator` | `action-locator` | `review-socket` | `action-review-socket` |
| `review-action-id` / `review-contract-digest` | `action-locator` | `not-path` | `action-identity` |
| `provider-stdin-mode` | `stdin-mode` | `not-path` | `launch-policy-stdin-mode` |
| `synthetic-home-path` | `synthetic-path` | `synthetic-home` | `action-synthetic-home` |
| `synthetic-temp-path` | `synthetic-path` | `synthetic-temp` | `action-synthetic-temp` |
| `credential-capsule-path` | `synthetic-path` | `credential-capsule` | `action-credential-capsule` |
| `empty-cwd-path` | `synthetic-path` | `empty-cwd` | `activation-empty-cwd` |
| `policy-fixed-literal` | `fixed-literal` | `not-path` | `none` |
| `daemon-synthetic-home` | `synthetic-home` | `synthetic-home` | `action-synthetic-home` |
| `daemon-synthetic-temp` | `synthetic-temp` | `synthetic-temp` | `action-synthetic-temp` |
| `prospective-credential-capsule` | `credential-capsule` | `credential-capsule` | `action-credential-capsule` |
| `adapter-secret-version` | `adapter-secret` | `not-path` | `adapter-secret-version` |

The environment `review-socket-locator`, `review-action-id` and
`review-contract-digest` selectors reuse the matching argv tuples. No selector
may appear under any other kind/class/rule tuple.

A contract may narrow the displayed selectors or add denied names/prefixes; it
may not remove a mandatory denial. The exact template leaves no unknown option,
arity or free literal. Shell/interpreter evaluation, arbitrary command strings
and any cwd/workspace/config/plugin/MCP/tool or real user/HOME/project/provider-
source path override are structurally unrepresentable. The trusted activation
loader, not an action caller, inserts the one policy row and recomputes every
entry/slot/policy digest; it is immutable and nondeletable while any
configuration/envelope cites it.

The policy is contract-global. It contains only the displayed stable rule
enums, never an action path, daemon instance, current inode, secret version or
prospective artifact identity. Every `*Dec` in policy, envelope, source-contract
and closure JSON is a canonical unsigned decimal string with no leading zero;
positive excludes `"0"`. Template/source-contract ordinals are contiguous and
unique. All other digest-bearing arrays are either explicitly ordered above or
strictly increasing by their stated raw UTF-8/digest key and duplicate-free;
no implementation-defined set iteration may enter a digest preimage.

`launch_envelope_json` byte-equals RFC 8785 JCS of this exact closed action
object:

~~~yaml
reviewPortalProviderLaunchEnvelopeV1:
  schemaVersion: 1
  adapterId: exact-adapter
  actionId: exact-action
  contractDigest: exact-contract
  daemonInstanceId: exact-daemon
  configurationId: exact-id
  configurationRevisionDec: positive
  configurationDigest: exact-digest
  effectiveConfigurationDigest: exact-digest
  executableIdentityDigest: exact-digest
  launchPolicyDigest: exact-policy-digest
  sourceContractMemberCountDec: positive
  sourceContractSetDigest: exact-digest
  sourceContractSetState: sealed
  sourceContracts:
    - ordinalDec: positive-contiguous
      sourceSelector: exact-policy-selector
      sourceContractKind: effective-configuration-field |
        activated-executable | action-identity | review-socket |
        synthetic-home | synthetic-temp | credential-capsule | empty-cwd |
        policy-stdin-mode | adapter-secret-version
      pathClass: exact-policy-path-class
      sourceContract: exact-closed-arm-object
      sourceContractDigest: exact-digest
  argv:
    - ordinalDec: positive-contiguous
      policySlotDigest: exact-digest
      tokenKind: fixed-literal | option-name | sourced-value
      value: exact-nul-free-utf8
      valueLengthDec: nonnegative
      valueDigest: exact-sha256
      ownerOptionOrdinalDec: nonnegative
      ownerOptionValueIndexDec: nonnegative
      sourceKind: none | resolved-model | resolved-effort | executable-path |
        action-locator | stdin-mode | synthetic-path
      sourceSelector: none | effective-config-model |
        effective-config-effort | activated-executable-path |
        review-socket-locator | review-action-id | review-contract-digest |
        provider-stdin-mode | synthetic-home-path | synthetic-temp-path |
        credential-capsule-path | empty-cwd-path
      pathClass: not-path | review-socket | synthetic-home | synthetic-temp |
        credential-capsule | empty-cwd | executable
      sourceContractRule: exact-policy-rule
      sourceContractDigest: exact-digest | null
      sourceIdentityDigest: exact-digest
  environment:
    - name: exact-name
      valueLengthDec: nonnegative
      valueDigest: exact-sha256
      sourceKind: fixed-literal | synthetic-home | synthetic-temp |
        credential-capsule | action-locator | adapter-secret
      sourceSelector: policy-fixed-literal | daemon-synthetic-home |
        daemon-synthetic-temp | prospective-credential-capsule |
        review-socket-locator | review-action-id | review-contract-digest |
        adapter-secret-version
      pathClass: not-path | review-socket | synthetic-home |
        synthetic-temp | credential-capsule
      sourceContractRule: exact-policy-rule
      sourceContractDigest: exact-digest | null
      sourceIdentityDigest: exact-digest
~~~

Every envelope argv row equality-copies its policy slot digest, token/owner
fields, source selector, path class and source-contract rule. Fixed-literal and option-name values
must byte-equal their policy value. A sourced value is derived only from its
selector and references the one matching source-contract child digest; it
cannot relabel itself. Every environment row equality-copies the
matching policy entry's name/source selector/path class and, for fixed literals,
must byte-equal the policy value. The envelope has exactly all policy template
and environment rows and no other argv token or environment name. Fixed rows
use a null source-contract digest; every nonfixed row uses the digest of exactly
one `sourceContracts` member whose selector/kind/path class satisfies its policy
rule.

Every `sourceContracts` member has exactly the displayed wrapper and one closed
arm object. Effective-configuration field, executable, action-identity, policy-
stdin and secret-version arms contain respectively the exact effective-
configuration field/value commitment, opened-executable identity/closure
commitment, action/contract semantic value, policy slot/value commitment, or
private secret id/revision/version commitment. Filesystem arms contain the
prospective canonical path, parent/root identity digest, basename, expected
file type, owner/mode/ACL/xattr/mount policy, link count and expected content
digest where applicable. `review-socket` requires socket/link-count one;
`credential-capsule` requires regular/0600/link-count one and the expected
capsule-content digest; synthetic HOME requires a private 0700 directory with
only its exact auth/config manifest, synthetic temp requires a private 0700
empty directory under its activated root, and empty cwd equality-copies
the activation-owned 0500/empty/read-only contract. No prospective arm contains
a guessed child inode.

`sourceContract` is exactly this common closed object; `bindingKind` byte-equals
the enclosing `sourceContractKind`, and `binding` is exactly one object from the
exhaustive list below:

~~~yaml
reviewPortalLaunchSourceContractV1:
  schemaVersion: 1
  adapterId: exact-outer-adapter
  actionId: exact-outer-action
  contractDigest: exact-outer-contract
  daemonInstanceId: exact-outer-daemon
  sourceSelector: exact-outer-selector
  sourceContractKind: exact-outer-kind
  pathClass: exact-outer-path-class
  bindingKind: exact-outer-kind
  binding: exact-kind-object-below
~~~

The `effective-configuration-field` object is:

~~~yaml
reviewPortalEffectiveConfigurationFieldSourceV1:
  fieldName: model | effort
  effectiveConfigurationDigest: exact-envelope-digest
  fieldValue: exact-nul-free-utf8
  fieldValueLengthDec: nonnegative
  fieldValueDigest: exact-sha256
~~~

`fieldName=model` is permitted only for selector `effective-config-model` and
`fieldName=effort` only for `effective-config-effort`; the value/length/digest
byte-equal the corresponding envelope argv row and effective configuration.

The `activated-executable` object is:

~~~yaml
reviewPortalActivatedExecutableSourceV1:
  effectiveConfigurationDigest: exact-envelope-digest
  executableIdentityDigest: exact-envelope-digest
  canonicalPath: exact-absolute-path
  canonicalPathDigest: exact-sha256
  transitiveExecutableClosureDigest: exact-closure-digest
~~~

It is permitted only for `activated-executable-path`; the path byte-equals
argv[0], and identity/closure byte-equal the no-follow opened executable fields
in the provider closure; this introduces no second executable-closure digest.
`canonicalPathDigest` is `sha256:` plus lowercase
SHA-256 of `agent-fabric-portal-canonical-path-v1`, `0x00` and the exact UTF-8
path bytes. This is also the definition wherever that field appears below.

The `action-identity` object is:

~~~yaml
reviewPortalActionIdentitySourceV1:
  identityKind: action-id | contract-digest
  exactValue: exact-nul-free-utf8
  exactValueLengthDec: nonnegative
  exactValueDigest: exact-sha256
~~~

The kind/selector is respectively `action-id`/`review-action-id` or `contract-
digest`/`review-contract-digest`; `exactValue` byte-equals the common outer
action ID or contract digest and its envelope value.

The `review-socket` object is:

~~~yaml
reviewPortalProspectiveSocketSourceV1:
  recoveryRootPath: exact-intent-root-path
  recoveryRootIdentityDigest: exact-intent-root-identity
  custodyDirectoryBasename: exact-intent-basename
  custodyDirectoryContractDigest: exact-digest
  canonicalPath: exact-prospective-path
  canonicalPathDigest: exact-sha256
  basename: exact-intent-socket-basename
  fileType: unix-socket
  socketType: stream
  modeOctal: "0600"
  linkCountDec: "1"
  listenerOwner: typescript-daemon
  providerRole: connecting-client
~~~

The path is the byte-exact canonical join of recovery root, custody basename and
socket basename; its directory is prospective and no child inode appears.

`recoveryRootIdentityDigest` is `sha256:` plus lowercase SHA-256 of the ASCII
bytes `agent-fabric-portal-recovery-root-identity-v1`, one `0x00` byte and RFC
8785 JCS of exactly this object:

~~~yaml
reviewPortalRecoveryRootIdentityV1:
  canonicalPath: exact-intent-recovery-root-path
  deviceDec: nonnegative
  inodeDec: positive
~~~

All three fields equality-copy the opened recovery-root FD and intent columns.
`custodyDirectoryContractDigest` is formed the same way with domain
`agent-fabric-portal-prospective-custody-directory-v1` and JCS of exactly:

~~~yaml
reviewPortalProspectiveCustodyDirectoryContractV1:
  adapterId: exact-outer-adapter
  actionId: exact-outer-action
  daemonInstanceId: exact-outer-daemon
  recoveryRootIdentityDigest: exact-digest-above
  basename: exact-intent-custody-basename
  fileType: directory
  ownerUidDec: nonnegative
  ownerGidDec: nonnegative
  modeOctal: "0700"
  socketBasename: exact-intent-socket-basename
  capsuleBasename: exact-intent-capsule-basename
  exactChildRoles: [socket, credential-capsule]
  exclusiveCreateNoFollow: true
~~~

`exactChildRoles` has that literal order. Intent, socket and capsule source arms
equality-copy both digests; Rust/TypeScript goldens cross root path/device/inode,
action, daemon, directory name, child name, owner and role order.

The daemon first registers each synthetic root as this exact immutable object:

~~~yaml
reviewPortalActivatedSyntheticRootV1:
  schemaVersion: 1
  daemonInstanceId: exact-outer-daemon
  role: synthetic-home | synthetic-temp
  canonicalPath: exact-absolute-path
  deviceDec: nonnegative
  inodeDec: positive
  ownerUidDec: nonnegative
  ownerGidDec: nonnegative
  modeOctal: "0700"
  acl: []
  mountIdentity:
    platform: darwin | linux
    mountPointPath: exact-canonical-path
    deviceDec: nonnegative
    fsidWordsDec: [exactly-two-u32-bit-pattern-decimal-values]
    filesystemType: exact-lowercase-ascii-kernel-type
    mountFlags:
      - strictly-ordered-subset-of: [read-only, no-suid, no-device, no-exec,
          synchronous, no-atime, journaled, local]
~~~

Its `rootContractDigest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-activated-synthetic-root-v1`, one `0x00` byte and JCS of
that complete object. Root JSON/digest and path/device/inode byte-equal the
immutable activation row. The mount object uses the same unsigned fsid,
known-flag ordering and unknown-flag rejection rules as the exact cwd mount
identity below. Role, daemon, path/stat/owner/mode/ACL/mount permutations have
cross-language goldens.

`synthetic-home` uses this exact object:

~~~yaml
reviewPortalProspectiveSyntheticHomeSourceV1:
  role: synthetic-home
  activatedRoot: exact-reviewPortalActivatedSyntheticRootV1-object
  activatedRootContractDigest: exact-defined-root-digest
  canonicalPath: exact-action-private-path
  canonicalPathDigest: exact-sha256
  basename: exact-action-derived-basename
  fileType: directory
  ownerUidDec: nonnegative
  ownerGidDec: nonnegative
  modeOctal: "0700"
  aclDigest: exact-empty-acl-digest
  entryCountDec: nonnegative
  entries:
    - ordinalDec: positive-contiguous
      relativePath: exact-normalised-relative-path
      fileType: directory | regular
      modeOctal: "0700" | "0600"
      linkCountPolicy: positive-observed-after-create | exactly-one
      contentLengthDec: nonnegative | null
      contentDigest: exact-sha256 | null
  entryManifestDigest: exact-digest
  xattrCountDec: "0"
  xattrSetDigest: exact-empty-xattr-set-digest
  mountIdentityDigest: exact-digest
  exclusiveCreateNoFollow: true
~~~

The home path is one direct action-derived child of its named activated root;
root stat/owner/ACL/mount come from activation rather than caller input. Entries
are strictly increasing by raw UTF-8 relative path, unique, parent-before-child,
contain no empty/`.`/`..` segment and are only daemon-generated auth/config
content admitted by the adapter contract. Directories have mode 0700 and null
content fields and use `positive-observed-after-create`; regular files have mode
0600, `exactly-one` and exact non-null length/digest. Prospective manifest bytes
contain no guessed directory link count. The artifact-custody capture persists
each actual positive directory count and revalidates it during cleanup.
`entryCountDec` equals array length and may be zero only for an adapter requiring
no auth/config file. `entryManifestDigest` uses domain
`agent-fabric-portal-synthetic-home-entry-manifest-v1`, `0x00` and JCS of the
complete entries array. Symlinks, regular-file hard links, devices and extra
files are forbidden. Directory alias denial uses exclusive no-follow creation
beneath the retained activation root plus mount/namespace custody checks; it
never assumes a POSIX directory has link count one. Linux/macOS goldens cover
nested directories with their platform-observed positive counts.

`synthetic-temp` is separate and exactly empty:

~~~yaml
reviewPortalProspectiveSyntheticTempSourceV1:
  role: synthetic-temp
  activatedRoot: exact-reviewPortalActivatedSyntheticRootV1-object
  activatedRootContractDigest: exact-defined-root-digest
  canonicalPath: exact-action-private-path
  canonicalPathDigest: exact-sha256
  basename: exact-action-derived-basename
  fileType: directory
  ownerUidDec: nonnegative
  ownerGidDec: nonnegative
  modeOctal: "0700"
  aclDigest: exact-empty-acl-digest
  entryCountDec: "0"
  entrySetDigest: exact-empty-entry-set-digest
  xattrCountDec: "0"
  xattrSetDigest: exact-empty-xattr-set-digest
  mountIdentityDigest: exact-digest
  exclusiveCreateNoFollow: true
~~~

It is one direct action-derived child of the activated temp root and remains
empty through post-ACK validation. Cross-language goldens cover empty and
nonempty HOME manifests, nested parent ordering, and the empty temp arm.

The `credential-capsule` object is:

~~~yaml
reviewPortalProspectiveCredentialCapsuleSourceV1:
  recoveryRootPath: exact-intent-root-path
  recoveryRootIdentityDigest: exact-intent-root-identity
  custodyDirectoryBasename: exact-intent-basename
  custodyDirectoryContractDigest: exact-digest
  canonicalPath: exact-prospective-path
  canonicalPathDigest: exact-sha256
  basename: exact-intent-capsule-basename
  directoryModeOctal: "0700"
  fileType: regular
  fileModeOctal: "0600"
  linkCountDec: "1"
  expectedContentDigest: exact-intent-capsule-content-digest
  exclusiveCreateNoFollow: true
~~~

The path is the byte-exact canonical join of recovery root, custody basename and
capsule basename and equality-copies the intent/closure prospective capsule.

The `empty-cwd` object is:

~~~yaml
reviewPortalActivationEmptyCwdSourceV1:
  canonicalPath: exact-closure-cwd-path
  fileType: directory
  deviceDec: nonnegative
  inodeDec: positive
  ownerUidDec: nonnegative
  ownerGidDec: nonnegative
  modeOctal: "0500"
  aclDigest: exact-empty-acl-digest
  filesystemFlags: []
  entryCountDec: "0"
  entrySetDigest: exact-empty-entry-set-digest
  xattrCountDec: "0"
  xattrSetDigest: exact-empty-xattr-set-digest
  mountIdentityDigest: exact-digest
  readOnlyEnforcementDigest: exact-digest
  provenance: daemon-activation-empty-cwd
  daemonInstanceId: exact-outer-daemon
  contractDigest: exact-outer-contract
~~~

It byte-equals the later closure `cwd` object and contains actual activation-
owned directory identity, not an action-created prospective inode. Its common
outer daemon/contract must equal its two identically named fields.

The `policy-stdin-mode` object is:

~~~yaml
reviewPortalPolicyStdinModeSourceV1:
  launchPolicyDigest: exact-policy-digest
  policySlotDigest: exact-slot-digest
  exactValue: exact-nul-free-utf8
  exactValueLengthDec: nonnegative
  exactValueDigest: exact-sha256
~~~

Its value byte-equals the selected contract-pinned stdin mode and envelope row.

The `adapter-secret-version` object is:

~~~yaml
reviewPortalAdapterSecretVersionSourceV1:
  configurationId: exact-configuration-id
  configurationRevisionDec: positive
  effectiveConfigurationDigest: exact-envelope-digest
  secretId: exact-private-secret-id
  secretRevisionDec: positive
  secretMaterialDigest: exact-private-digest
  secretVersionCommitmentDigest: exact-private-digest
~~~

It is permitted only for selector `adapter-secret-version`; the commitment is
recomputed from the effective configuration's selected secret version and
material digest. It contains neither material nor environment value bytes.
`secretMaterialDigest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-adapter-secret-material-v1`, one `0x00` byte and the exact
raw secret bytes. `secretVersionCommitmentDigest` uses domain
`agent-fabric-portal-adapter-secret-version-v1`, `0x00` and RFC 8785 JCS of
exactly `[adapterId,configurationId,configurationRevisionDec,
effectiveConfigurationDigest,secretId,secretRevisionDec,secretMaterialDigest]`.
Both digests remain private; daemon and stub recompute them from the selected
version, and goldens include leading-zero raw bytes and crossed revisions.

No field is optional and no additional field is admitted in the common object
or any arm. The arm's common outer identities are equality-checked before its
member digest. Rust and TypeScript share one golden and one crossed-identity/
wrong-field negative for every arm, plus home-versus-temp, action-id-versus-
contract, model-versus-effort and prospective-versus-actual-inode negatives.

Each child `source_contract_json` byte-equals JCS of the complete common
`reviewPortalLaunchSourceContractV1` object, including its exact arm object.
`source_contract_digest` uses domain
`agent-fabric-portal-launch-source-contract-v1`, `0x00` and JCS of the complete
envelope member wrapper -- exactly `ordinalDec`, `sourceSelector`,
`sourceContractKind`, `pathClass` and that parsed common `sourceContract` --
with only `sourceContractDigest` omitted. The child row's integer ordinal is
rendered to its canonical `ordinalDec`; its selector/kind/path-class columns
must byte-equal the wrapper/common-object values. `sourceContractSetDigest` uses domain
`agent-fabric-portal-launch-source-contract-set-v1`, `0x00` and JCS of the
ordinal-ordered array of canonical persisted `sha256:` plus 64 lowercase-
hexadecimal member-digest strings. Rust/TypeScript golden vectors include an
empty-leading-byte digest and reject raw-byte, base64, uppercase and bare-hex
encodings. The relational child rows
are exactly the envelope array: contiguous, no missing/extra/duplicate selector
or digest. They first reference one `building` header. A generated sealing
trigger recomputes every child JCS/digest and the ordered set root, requires
exactly `member_count` rows with ordinals `1..member_count`, then performs the
only header transition `building/revision 1 -> sealed/revision 2`. A sealed
header and all its rows are immutable and nondeletable. An envelope can reference
only the exact sealed header/member-count/root through its composite FK, so a
zero, partial or reordered set cannot admit an envelope. The daemon commits
set rows, seal, envelope, closure and custody intent in one transaction; every
failure rolls the whole transaction back.

Each `sourceIdentityDigest` is `sha256:` plus lowercase SHA-256 of its arm's
ASCII domain label, one `0x00` byte and RFC 8785 JCS of the exact array shown:

| source arm | domain suffix after `agent-fabric-portal-launch-source-` | exact JCS array |
|---|---|---|
| fixed argv/environment value | `fixed-literal-v1` | `[launchPolicyDigest,policySlotOrEnvironmentEntryDigest,valueDigest]` |
| resolved model | `resolved-model-v1` | `[effectiveConfigurationDigest,"model",sourceContractDigest,valueDigest]` |
| resolved effort | `resolved-effort-v1` | `[effectiveConfigurationDigest,"effort",sourceContractDigest,valueDigest]` |
| activated executable path | `activated-executable-v1` | `[effectiveConfigurationDigest,executableIdentityDigest,sourceContractDigest,canonicalPathDigest,valueDigest]` |
| stdin mode | `stdin-mode-v1` | `[launchPolicyDigest,policySlotDigest,sourceContractDigest,valueDigest]` |
| synthetic home/temp/empty cwd | `synthetic-root-v1` | `[daemonInstanceId,pathClass,sourceContractDigest,canonicalPathDigest,valueDigest]` |
| prospective credential capsule | `prospective-capsule-v1` | `[adapterId,actionId,sourceContractDigest,expectedCapsuleContentDigest,valueDigest]` |
| action locator | `action-locator-v1` | `[adapterId,actionId,contractDigest,sourceSelector,sourceContractDigest,valueDigest]` |
| adapter secret version | `adapter-secret-version-v1` | `[adapterId,secretId,secretRevisionDec,secretVersionCommitmentDigest,sourceContractDigest,valueDigest]` |

The full domain is the prefix plus the displayed suffix. The prospective-
capsule contract is the pre-intent path/name/mode/type/link-count/content
contract below, never a guessed inode. Synthetic-root contracts bind the
activation-owned root path/stat/owner/mode/ACL/mount/empty-state/read-only
commitment. The action-locator contract binds its semantic role and prospective
object contract. The adapter-secret commitment is the effective
configuration's private secret-id/revision/material-digest commitment; raw
secret bytes never enter policy, envelope, closure or logs. Fixed option-name
rows use the fixed-value arm. These are the only source identity preimages.
Rust/TypeScript golden and negative vectors cover the activated-executable arm,
including crossed effective configuration, executable identity, canonical path,
source contract and argv[0] bytes.

Envelope admission recomputes every source contract and identity from the
outer adapter/action/contract/daemon, the effective configuration, activated
root contracts, policy, daemon-owned locators and private secret version. It
rejects an inner outer-identity mismatch. The exec closure equality-copies the
complete source-contract array/set digest. The custody intent equality-copies
the envelope/set digests and recomputes prospective home/temp/socket/capsule
paths, names, types, modes, link counts and content digests from those children;
the process-custody row equality-copies the same digests. Generated immutable
triggers plus the daemon's pre-commit closed-object validator reject any crossed
action/daemon/configuration, substituted arm, missing child, or envelope-
closure-intent field mismatch. Actual post-create identities may refine only
the matching prospective arm and must preserve its contract; they never replace
or self-certify it.

`launch_envelope_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-provider-launch-envelope-v1`, one `0x00` byte and those JCS
bytes. The trusted renderer derives the envelope only from the exact provider-
action effective configuration, activated contract/policy and daemon-owned
action locators/secrets; caller argv/environment is never an input. It validates
every argv value/slot/owner/source identity, path class, limit, environment
name/source/value identity
and mandatory denial, then stores the envelope through the displayed composite
FKs. The exec closure equality-copies `launchEnvelopeDigest`; its raw ordered
argv rows and environment name/length/value-digest/source-selector/path-class/
source-identity sequence must byte-equal the envelope. Daemon and stub hash
their actual argv/environment bytes and
require that equality before registration and after ACK. Configuration A with
self-consistent argv/environment B, inherited parent environment, loader
variables, real HOME/XDG/config paths or unsafe flags is terminal no-exec.

The provider exec closure is also closed and independently reproducible.
`provider_closure_json` byte-equals RFC 8785 JCS of exactly this private object;
every `*Dec` value is a canonical unsigned decimal string, all paths are
absolute canonical UTF-8 with no NUL, `argv` order is executable order, and the
environment/FD arrays use the stated order with no duplicate:

~~~yaml
reviewPortalProviderExecClosureV1:
  adapterId: exact-adapter
  actionId: exact-action
  contractDigest: exact-activated-contract
  daemonInstanceId: exact-daemon
  launchEnvelopeDigest: exact-digest
  sourceContractMemberCountDec: positive
  sourceContractSetDigest: exact-digest
  sourceContractSetState: sealed
  sourceContracts: exact-byte-for-byte-envelope-source-contract-array
  configuration:
    configurationId: exact-id
    configurationRevisionDec: positive
    configurationDigest: exact-digest
    effectiveConfigurationDigest: exact-digest
    executableIdentityDigest: exact-digest
  executable:
    identityDigest: exact-digest
    canonicalPath: exact-path
    parentPath: exact-path
    basename: one-name
    parentDeviceDec: nonnegative
    parentInodeDec: positive
    deviceDec: nonnegative
    inodeDec: positive
    modeDec: positive
    sizeDec: nonnegative
    contentDigest: exact-sha256
    codeIdentityDigest: exact-digest
    transitiveExecutableClosureDigest: exact-digest
  argv:
    - ordinalDec: positive-contiguous
      policySlotDigest: exact-digest
      tokenKind: fixed-literal | option-name | sourced-value
      value: exact-nul-free-utf8
      valueLengthDec: nonnegative
      valueDigest: exact-sha256
      ownerOptionOrdinalDec: nonnegative
      ownerOptionValueIndexDec: nonnegative
      sourceKind: none | resolved-model | resolved-effort | executable-path |
        action-locator | stdin-mode | synthetic-path
      sourceSelector: exact-policy-selector
      pathClass: exact-policy-path-class
      sourceContractRule: exact-policy-rule
      sourceContractDigest: exact-digest | null
      sourceIdentityDigest: exact-digest
  cwd:
    canonicalPath: exact-path
    fileType: directory
    deviceDec: nonnegative
    inodeDec: positive
    ownerUidDec: nonnegative
    ownerGidDec: nonnegative
    modeOctal: "0500"
    aclDigest: exact-empty-acl-digest
    filesystemFlags: []
    entryCountDec: "0"
    entrySetDigest: exact-empty-entry-set-digest
    xattrCountDec: "0"
    xattrSetDigest: exact-empty-xattr-set-digest
    mountIdentityDigest: exact-digest
    readOnlyEnforcementDigest: exact-digest
    provenance: daemon-activation-empty-cwd
    daemonInstanceId: exact-daemon
    contractDigest: exact-contract
  environment:
    - name: exact-utf8-name
      valueLengthDec: nonnegative
      valueDigest: exact-sha256
      sourceKind: fixed-literal | synthetic-home | synthetic-temp |
        credential-capsule | action-locator | adapter-secret
      sourceSelector: exact-policy-selector
      pathClass: exact-policy-path-class
      sourceContractRule: exact-policy-rule
      sourceContractDigest: exact-digest | null
      sourceIdentityDigest: exact-digest
  capsule:
    directoryPath: exact-path
    directoryModeOctal: "0700"
    basename: exact-basename
    fileType: regular
    fileModeOctal: "0600"
    linkCountDec: "1"
    contentDigest: exact-sha256
  stdio:
    - fdDec: "0"
      purpose: stdin
      identityDigest: exact-digest
      topologyAttestation: reviewPortalStdioTopologyAttestationV1
    - fdDec: "1"
      purpose: stdout
      identityDigest: exact-digest
      topologyAttestation: reviewPortalStdioTopologyAttestationV1
    - fdDec: "2"
      purpose: stderr
      identityDigest: exact-digest
      topologyAttestation: reviewPortalStdioTopologyAttestationV1
  providerInheritedFdNumbersDec: ["0", "1", "2"]
  preExecFds:
    - {fdDec: "4", purpose: launch-handshake, disposition: close-before-exec}
    - {fdDec: "5", purpose: provider-executable, disposition: cloexec}
    - {fdDec: "6", purpose: provider-cwd, disposition: cloexec}
    - {fdDec: "7", purpose: executable-parent, disposition: cloexec}
~~~

For certifying portal actions, the effective configuration's formerly opaque
`executableIdentityDigest` is specialised to
`agent-fabric-portal-executable-identity-v1`. It is `sha256:` plus lowercase
SHA-256 of the ASCII bytes of that label, one `0x00` byte and RFC 8785 JCS of
the exact `executable` object above with only `identityDigest` omitted. The
closure's `executable.identityDigest`, the effective-configuration value and
the value recomputed by both daemon and stub from the opened executable must be
byte-equal. The stub obtains path/parent/basename, stat fields and content from
the actual FD/path; it independently invokes the activated platform code-
identity verifier and transitive executable-closure verifier for their two
digests. Copying those two digests from configuration without verifying the
actual executable is forbidden. Thus a self-consistent closure built from
configuration A and executable B cannot be inserted or registered.

The cwd is one daemon-activation-owned empty directory created before any
provider action, then opened no-follow as FD 6 and made mode 0500. It is not a
workspace, HOME, auth, project or provider directory. `aclDigest`,
`entrySetDigest` and `xattrSetDigest` hash, under respectively
`agent-fabric-portal-empty-acl-v1`,
`agent-fabric-portal-empty-directory-entry-set-v1` and
`agent-fabric-portal-empty-xattr-set-v1` plus one `0x00`, RFC 8785 JCS of the
exact empty array. `mountIdentityDigest` uses the activated platform's closed
mount identity. It is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-cwd-mount-identity-v1`, one `0x00` byte and RFC 8785 JCS
of exactly this object:

~~~yaml
reviewPortalCwdMountIdentityV1:
  platform: darwin | linux
  mountPointPath: exact-canonical-path
  deviceDec: nonnegative
  fsidWordsDec: [exactly-two-u32-bit-pattern-decimal-values]
  filesystemType: exact-lowercase-ascii-kernel-type
  mountFlags:
    - strictly-ordered-subset-of: [read-only, no-suid, no-device, no-exec,
        synchronous, no-atime, journaled, local]
~~~

The two fsid words are decoded to their unsigned 32-bit bit patterns before
decimal encoding; native signedness, padding and endian never enter the
preimage. Unknown persistent mount flags fail activation rather than disappear.
Rust/TypeScript golden vectors cover both platform arms, high-bit fsid words,
flag permutations and different native padding/endian layouts.
`readOnlyEnforcementDigest` hashes the
ASCII bytes `agent-fabric-portal-cwd-read-only-v1`, one `0x00` byte and JCS of
this exact object:

~~~yaml
reviewPortalCwdReadOnlyEnforcementV1:
  platformIdentityDigest: exact-digest
  mountIdentityDigest: exact-digest
  canonicalPath: exact-path
  deviceDec: nonnegative
  inodeDec: positive
  ownerUidDec: nonnegative
  ownerGidDec: nonnegative
  modeOctal: "0500"
  aclDigest: exact-empty-acl-digest
  filesystemFlags: []
  outerSandboxContractDigest: exact-contract-digest
  enumerateEmptyCanaryDigest: exact-current-build-digest
  createWriteRenameDeleteMetadataDenyCanaryDigest: exact-current-build-digest
~~~

The daemon insert and stub independently enumerate FD 6 and require exactly no
entry other than kernel `.`/`..`, no xattr, exact directory/stat/owner/mode/ACL/
mount identity and the activated read/write/metadata-denial evidence. The stub
does so immediately before registration, again after ACK and once more after
`fchdir(FD 6)` adjacent to exec; it also proves the canonical path still names
that FD. Replacement, population, symlink, mount, mode, owner, ACL, xattr,
sandbox or denial-canary drift is terminal no-exec. The provider receives no
directory FD, and capability is false unless current-build confinement canaries
prove it cannot populate or mutate the cwd after exec.

Each `stdio[].identityDigest` is `sha256:` plus lowercase SHA-256 of the ASCII
bytes `agent-fabric-portal-stdio-fd-identity-v1`, one `0x00` byte and RFC 8785
JCS of this exact kind-tagged object derived from the actual descriptor:

~~~yaml
reviewPortalStdioFdIdentityV1:
  fdDec: "0" | "1" | "2"
  purpose: stdin | stdout | stderr
  fileType: fifo | unix-stream | unix-seqpacket | character
  deviceDec: nonnegative
  inodeDec: positive
  rdevDec: nonnegative
  modeDec: positive
  accessMode: read-only | write-only | read-write
  statusFlags: [append | nonblocking | synchronous | data-synchronous]
  descriptorFlags: []
  canonicalDevicePath: exact-path | null
  localEndpointDigest: exact-sha256 | null
  peerEndpointDigest: exact-sha256 | null
  peerCredentialDigest: exact-sha256 | null
~~~

Each adjacent `topologyAttestation` is this exact object. Its `digest` is
`sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-stdio-topology-attestation-v1`, one `0x00` byte and RFC
8785 JCS of the object with only `digest` omitted:

~~~yaml
reviewPortalStdioTopologyAttestationV1:
  digest: exact-sha256
  daemonInstanceId: exact-daemon
  adapterId: exact-adapter
  actionId: exact-action
  contractDigest: exact-contract
  purpose: stdin | stdout | stderr
  topology: daemon-pipe | daemon-socketpair | daemon-pty | dev-null
  localIdentityDigest: exact-stdio-fd-identity-digest
  retention: daemon-until-provider-terminal
  peerDescriptor:
    oneOf:
      - null
      - owner: daemon
        ownerPidDec: positive
        ownerStartTimeDec: positive
        fdDec: nonnegative
        fileType: fifo | unix-stream | unix-seqpacket | character
        deviceDec: nonnegative
        inodeDec: positive
        rdevDec: nonnegative
        modeDec: positive
        accessMode: read-only | write-only | read-write
        statusFlags: [append | nonblocking | synchronous | data-synchronous]
        descriptorFlags: [cloexec]
        canonicalDevicePath: exact-path | null
        localEndpointDigest: exact-sha256 | null
        peerEndpointDigest: exact-sha256 | null
        peerCredentialDigest: exact-sha256 | null
~~~

The root daemon/action/contract and purpose equal the enclosing closure/stdio
entry, and `localIdentityDigest` equals that entry's `identityDigest`. Dev-null
alone has null peer; every daemon-created topology has the exact nonnull daemon
peer descriptor above. Peer `descriptorFlags` is exactly `[cloexec]`, so it
cannot leak if the daemon later launches another process.

The three endpoint fields are null for FIFO/character and nonnull for a
socket. A local or peer endpoint digest hashes, under respectively
`agent-fabric-portal-fd-local-endpoint-v1` or
`agent-fabric-portal-fd-peer-endpoint-v1` plus one `0x00`, RFC 8785 JCS of this
closed object:

~~~yaml
reviewPortalFdEndpointV1:
  platform: darwin | linux
  family: AF_UNIX
  socketType: stream | seqpacket
  addressKind: unnamed | pathname | abstract
  addressLengthDec: nonnegative
  addressBase64url: unpadded-base64url-of-exact-logical-address-bytes
~~~

The effective `sun_path` span comes from the returned socket-address length, not
`sizeof(sockaddr_un)`. Unnamed has zero length/empty bytes. Pathname removes
exactly one terminal NUL when present and rejects any embedded NUL. Linux
abstract retains its leading NUL and every later byte. No native padding,
uninitialised byte or host-endian integer enters the preimage.

`peerCredentialDigest` hashes the ASCII domain
`agent-fabric-portal-fd-peer-credential-v1`, one `0x00` byte and RFC 8785 JCS of
exactly one closed arm:

~~~yaml
reviewPortalFdPeerCredentialV1:
  oneOf:
    - platform: darwin
      pidDec: positive
      effectiveUidDec: nonnegative
      groupIdsDec: [strictly-increasing-nonnegative]
      auditTokenWordsDec: [exactly-eight-u32-decimal-values]
    - platform: linux
      pidDec: positive
      uidDec: nonnegative
      gidDec: nonnegative
~~~

Fields are decoded from kernel APIs before hashing; native credential-struct
padding/endian is forbidden. `statusFlags` is the strictly ordered observed subset of the four
displayed semantic flags; any other persistent status flag fails activation.
The exact empty `descriptorFlags` proves stdio survives exec without
`FD_CLOEXEC`. Creation-only flags are not part of `F_GETFL` and have no field.
Daemon and stub derive this local object independently; fd number/purpose/type/
stat/access/flags/local-endpoint/observable-peer mismatch fails before
registration and again after ACK. The stub does not derive or claim visibility
of the daemon-private `topologyAttestation.peerDescriptor`.
Rust/TypeScript vectors cover unnamed, terminal-NUL pathname, embedded-NUL
rejection, Linux abstract addresses, returned-length truncation and deliberately
different native padding/endian layouts that must canonicalise identically.

Stdio is an admitted daemon-created topology, never an arbitrary inherited
vnode or connection. The daemon alone derives each exact topology attestation
from both descriptors while it owns them, embeds it beside the local identity
in the closure, and revalidates its retained peer immediately before the
process-row commit/ACK. The challenge's `providerClosureDigest` therefore binds
the attestation, its local-identity digest and the action/contract/daemon tuple
seen by the stub. The stub independently derives and rechecks only its local
identity; copying either local digest without that check is forbidden.
Pipe endpoints must share exact device/inode and opposite access. Socketpairs
must be the two exact endpoints and prove the declared daemon peer credentials.
A PTY must bind its daemon-created master/slave pair and contract-pinned device
identity. Dev-null requires the attestation's null peer and local canonical path
exactly `/dev/null`, revalidated as the platform's null character device.

Purpose/access admission is closed: stdin is daemon-pipe read-only,
daemon-socketpair/daemon-pty read-write or `/dev/null` read-only; stdout/stderr
are daemon-pipe write-only, daemon-socketpair/daemon-pty read-write or
`/dev/null` write-only. Regular files, unrelated character devices, FIFOs not
created for this action, arbitrary sockets/TTYs, wrong-direction endpoints and
any descriptor whose vnode/endpoint is derived from a project, user, HOME,
auth or provider path are no-exec. The daemon retains every peer; it never hands
one to the supervisor. Closure insertion cannot accept caller-supplied
provenance.

`argv` contains at least one element, `argv[0]` is the configured executable
argument, and every element is NUL-free UTF-8. The environment array is
strictly increasing by raw UTF-8 name bytes; each name is nonempty and contains
neither NUL nor `=`, and each exact value is NUL-free. No duplicate is allowed.
`valueDigest` is `sha256:` plus lowercase SHA-256 of the exact value bytes and
the private closure row is never public, logged or model-visible. `stdio` and
`preExecFds` have exactly the displayed order and membership. The closure has
no unknown key. `provider_closure_digest` is `sha256:` plus lowercase SHA-256
of the ASCII bytes `agent-fabric-portal-provider-closure-v1`, one `0x00` byte
and those exact JCS bytes. Its row composite-foreign-keys the one provider-
action effective configuration, action pair and activated contract; the intent
and process row equality-copy that same digest. Intent triggers additionally
require the capsule directory path to be the recovery-root/custody-basename
join and equality-copy its basename and expected content digest; the fixed
0700/0600/regular/single-link policy admits no alternative. Insert triggers
recompute the JCS/digest and every displayed configuration/action/contract/
daemon field. Triggers recompute every `topologyAttestation.digest`, equality-
copy its daemon/adapter/action/contract/purpose/local-identity values to the
enclosing closure and stdio entry, enforce the exact topology/peer-null arm and
reject caller-supplied attestation evidence.

The closure's capsule arm is prospective: it binds the canonical intended path,
basename, exact modes/type/link policy and expected content, never a device or
inode that cannot exist before intent. Its directory path is the byte-exact join
of the already canonical recovery-root path and reserved custody basename; it
does not claim `realpath` of a not-yet-created directory. Before intent commit, the daemon opens
the executable and its parent no-follow, opens the cwd, captures stdio, closes
all unlisted descriptors and builds the closure from the actual argv/environment
bytes it will give the stub. Only after the intent/open transaction commits may
it create/fsync the capsule and directories and capture their actual device/
inode/link/content identities into process custody. The pinned stub inherits
the closure values in private memory plus executable FD 5, cwd FD 6 and
executable-parent FD 7. Immediately
before registration it independently rehashes the executable through FD 5,
revalidates its parent/basename with FD 7, enumerates the complete FD table,
revalidates cwd/stdio and opens the actual capsule no-follow to prove it meets
every prospective capsule field, reconstructs the exact argv/environment and
closure JCS and equality-checks both expected closure bytes and digest. After a
valid ACK it repeats that derivation, capsule proof and equality check, uses FD 6 for `fchdir`,
performs one final no-follow executable path-to-FD identity check and invokes
the executable with those same argv/environment bytes with no intervening
callback or provider code. Platforms with an identity-stable exec-from-FD
primitive must use it; otherwise the activated contract must prove the final
daemon-private executable path cannot be mutated by the provider and run the
last check immediately adjacent to `execve`. Failure keeps capability false.
FDs 5, 6 and 7 are close-on-exec and FD 4 is already closed, so provider entry
has exactly 0, 1 and 2. The stub never owns supervisor control FD 3. Swapped executable/path/inode/content/code
identity, argv, environment value/order, cwd, capsule, stdio, extra/missing FD
or post-ACK substitution is terminal no-exec.

`control_fd_number` is always 3 and identifies the supervisor-only daemon
channel; the stub never inherits it. Its pre-exec-only
`registration_fd_number` is always 4; provider-executable, cwd and executable-
parent FDs are always 5, 6 and 7.
The daemon obtains exactly 32 raw bytes from the OS CSPRNG before the intent
transaction. `launch_nonce_digest` is `sha256:` plus lowercase SHA-256 of the
ASCII bytes `agent-fabric-portal-launch-nonce-v1`, one `0x00` byte and those raw
nonce bytes. `intent_digest` is `sha256:` plus lowercase SHA-256 of the ASCII
bytes `agent-fabric-portal-filesystem-intent-v1`, one `0x00` byte and RFC 8785
JCS of the closed row object containing that nonce digest and every other
immutable intent field except `intent_digest` itself. The digest is globally unique; a collision or attempted
reuse aborts setup. Raw nonce bytes exist only in daemon memory and the private
FD-4 exchange, are never logged or persisted, and are destroyed when that
exchange closes. Reserved-arm recovery never reconstructs or reuses them.

`launch_action_binding_digest` is `sha256:` plus lowercase SHA-256 of the ASCII
bytes `agent-fabric-portal-action-binding-v1`, one `0x00` byte and RFC 8785 JCS
of this exact array, in order:

~~~json
["reviewPortalLaunchActionBindingV1", "adapterId", "actionId",
 "contractDigest", "daemonInstanceId", "filesystemIntentDigest",
 "launchNonceDigest", "providerClosureDigest", "launchEnvelopeDigest",
 "sourceContractSetDigest", "homeArtifactIntentDigest",
 "tempArtifactIntentDigest"]
~~~

The quoted field labels above denote their exact row values, not literal
placeholder strings. All persisted SHA-256 values use `sha256:` plus 64
lowercase hexadecimal characters. A wire field named `*Digest` is the raw 32
bytes decoded from that representation.

FD 4 is one private `AF_UNIX/SOCK_STREAM` socketpair created with close-on-exec.
The daemon endpoint is never inherited. The supervisor closes its duplicate of
the child endpoint immediately after fork; only the pinned launch stub retains
it. Before fork, the supervisor receives and pins the expected action-binding,
intent, stub-identity and provider-closure digests in private launch memory.
The handshake uses exactly these three binary frames; integers are unsigned
64-bit big-endian and every magic includes its displayed terminal NUL:

~~~text
launchChallengeV1 — exactly 136 bytes
  0..7     ASCII "AFCHAL1\0"
  8..39    raw launch nonce
  40..71   launchActionBindingDigest
  72..103  filesystemIntentDigest
  104..135 providerClosureDigest

launchRegistrationV1 — exactly 216 bytes
  0..7     ASCII "AFREGV1\0"
  8..39    raw launch nonce
  40..71   launchActionBindingDigest
  72..103  filesystemIntentDigest
  104..111 supervisorPid
  112..119 supervisorStartTime
  120..127 providerRootPid
  128..135 providerRootStartTime
  136..143 processGroupId
  144..151 sessionId
  152..183 launchStubIdentityDigest
  184..215 providerClosureDigest

launchAckV1 — exactly 208 bytes
  0..7     ASCII "AFACKV1\0"
  8..39    raw launch nonce
  40..71   launchActionBindingDigest
  72..103  filesystemIntentDigest
  104..135 launchRegistrationDigest
  136..167 processCustodyLaunchDigest
  168..175 launchRowRevision
  176..207 providerClosureDigest
~~~

The daemon writes exactly one challenge. The stub validates its magic, nonce
length and all three expected digests before changing process topology, then
establishes the group/session, captures the six positive process integers,
writes exactly one registration and calls `shutdown(SHUT_WR)`. The daemon reads
that direction to EOF and accepts only exactly 216 bytes; EOF/timeout before
216, any byte after 216, a second frame, a nonpositive or out-of-signed-64-bit
integer, crossed digest, wrong nonce, wrong directly observed PID/start/PGID/
session/parentage or wrong independently measured stub/provider identity fails
without a custody insert or ACK. `launch_registration_digest` is `sha256:` plus
lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-launch-registration-v1`, one `0x00` byte and the exact 216
registration bytes.

`process_custody_launch_digest` is `sha256:` plus lowercase SHA-256 of the ASCII
bytes `agent-fabric-portal-process-custody-launch-v1`, one `0x00` byte and RFC
8785 JCS of this exact array in order. Every SQL integer is represented in the
array as its canonical unsigned base-10 string with no sign or leading zero;
the displayed nulls are JSON nulls:

~~~json
["reviewPortalProcessCustodyLaunchV1",
 "adapterId", "actionId", "contractDigest", "daemonInstanceId",
 "filesystemIntentDigest", "launchNonceDigest",
 "launchActionBindingDigest", "launchRegistrationDigest", "1",
 "supervisorPid", "supervisorStartTime", "providerRootPid",
 "providerRootStartTime", "processGroupId", "sessionId",
 "supervisorExecutableIdentityDigest", "launchStubIdentityDigest",
 "providerClosureDigest", "launchEnvelopeDigest", "sourceContractSetDigest",
 "synthetic-home", "homeArtifactIntentDigest", "synthetic-temp",
 "tempArtifactIntentDigest",
 "ancestryManifestDigest", "recoveryRootPath",
 "recoveryRootDevice", "recoveryRootInode", "recoveryRootIdentityDigest",
 "custodyDirectoryBasename", "custodyDirectoryContractDigest",
 "claimDirectoryBasename", "custodyDirectoryDevice",
 "custodyDirectoryInode", "claimDirectoryDevice", "claimDirectoryInode",
 "agent-fabric-custody-claim-v1", "socketBasename",
 "socketClaimBasename", "socketFileDevice", "socketFileInode", "1",
 "socketIdentityDigest", "canonical", "capsuleBasename",
 "capsuleClaimBasename", "capsuleFileDevice", "capsuleFileInode", "1",
 "capsuleContentDigest", "canonical", "3", "4", "5", "6", "7", "waiting",
 "preparing", "active", null, "0", null, "1", "createdAt", "updatedAt"]
~~~

Again, camel-case labels denote exact corresponding row values; quoted enum and
fixed-number values are literal. The first `"1"` is
`launch_row_revision`; the final `"1"` is the initial mutable row `revision`.
The launch digest deliberately excludes itself and `launch_ack_digest`, making
the construction acyclic. `createdAt` and `updatedAt` are the exact canonical
stored timestamps and are equal at insertion.

Golden vectors cover every binding/registration/launch/ACK digest with distinct
envelope-daemon and source-set values. Negative fixtures cross an otherwise
self-consistent envelope, closure, intent or process row from another daemon,
action or set, omit/duplicate/reorder a source-contract child, and mutate one
prospective path/type/mode/link/content field; every arm is terminal no-exec
before ACK.

The daemon constructs the ACK from that committed launch object.
`launch_ack_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-launch-ack-v1`, one `0x00` byte and the exact 208 ACK
bytes. One transaction inserts the row with both computed digests,
`launch_row_revision=revision=1` and the displayed initial states. Only after
that transaction commits may the daemon write the one ACK and call
`shutdown(SHUT_WR)`. The stub reads the daemon direction to EOF after the
challenge already consumed and accepts only exactly 208 remaining bytes with
all nonce/action/intent/registration/revision/provider-closure fields equal.
Partial, trailing, duplicate, replayed or crossed ACK input closes FD 4 and
exits without provider exec. A valid ACK also closes FD 4 completely before the
final parent-liveness check and in-place exec. The entire exchange has the
contract-pinned 5,000-ms monotonic deadline; EOF/HUP or expiry at any stage is
terminal no-exec.

connection_state is `waiting|consumed|closed`; process_state is
`preparing|running|terminating|cleaned|integrity-failure`. Only the owning
supervisor/recovery CAS may advance them. The daemon starts the provider child
by first creating/retaining the per-action listener, a one-use registration
socketpair and the pinned supervisor with control FD 3. The supervisor forks a
pinned Rust launch stub, not provider code, and passes only the other registration
endpoint as FD 4. The stub establishes its dedicated group/session, reports its
exact registration directly to the daemon, then remains blocked pre-exec while
watching both daemon and parent liveness. The daemon validates that report,
commits the complete custody row with the exact nonce/action/registration/row/
ACK digests above, and sends the one matching ACK. Only then may the stub close
FD 4, recheck parent liveness and exec the pinned provider closure in place.
EOF, mismatch or parent death before ACK exits without exec. Thus no
provider code exists before durable custody. Rust supervisor FD 3 is its
exclusive private daemon control channel; it never passes to the stub. Stub FD
4 is closed and its fixed executable/cwd/parent FDs 5–7 are close-on-exec;
provider configuration or children inherit none of FDs 3–7.
Every phase, identity, generation and revision column displayed as nonnull is
validated by direct-SQL NULL negatives; wrong type/socket substitution, claim-
name version/collision, hard-link aliasing, crossed evidence/state and partial terminal rows also
fail before recovery logic.
Checked-in Rust and TypeScript golden vectors freeze all three frame byte
sequences and the nonce, action-binding, registration, process-custody-launch
and ACK digest preimages/results. Cross-language tests cover every byte offset
and half-close. Wrong magic/length/order, partial EOF at every boundary,
trailing byte, duplicate frame, zero/overflow integer, stale or repeated nonce,
cross-action/contract/intent/daemon/provider-closure/stub/PID/start/PGID/session,
old row revision, ACK-before-commit and ACK replay on a fresh FD are mandatory
no-exec negatives.
Closure fixtures independently derive the digest in Rust and TypeScript and
then swap the effective configuration, executable path/device/inode/content/
code identity, argv element/order, environment name/value/order, cwd, capsule,
stdio and each inherited/pre-exec FD both before registration and after ACK;
configuration-A with an initially self-consistent envelope-B, inherited parent
environment, every mandatory denied name/prefix, unsafe option and wrong
name/source/path class are separate pre-closure no-exec negatives;
source/project/auth-file stdin, project-file stdout/stderr, arbitrary socket/TTY,
forged topology/peer attestation and every wrong purpose/access-mode pairing are
also covered. Every variant is no-exec.

For each entry the daemon alone owns an independent persisted
`canonical -> claimed -> removed` cleanup phase; `integrity-failure` is terminal.
It constructs every native call only from the persisted row, never caller paths.
The Rust boundary verifies the persisted v1 claim basename, opens both
directories no-follow and equality-checks both identities. Capture, the final
canonical check, post-rename claim revalidation and the pre-unlink check all
require the persisted `st_nlink=1` for both socket and capsule. Under persisted
canonical phase, exact canonical plus absent claim is atomically renamed with
no-replace and revalidated inside the trusted namespace; absent canonical plus
exact claim is the crash-after-rename recovery arm. Both return claimed evidence,
after which the owner fsyncs both canonical and claim directories and only then
CASes claimed durably; unlink is not admitted before that CAS. Canonical
with both absent is integrity failure, not success. Under persisted claimed
phase, canonical must be absent; an exact claim is unlinked and both absent is
the crash-after-unlink recovery arm. The owner fsyncs the claim directory before
CASing removed. Persisted removed requires both absent. Both present, any wrong
claim, source substitution, changed directory identity, illegal phase/presence,
cross-device layout or unavailable atomic no-replace support records integrity
failure and keeps certifying capability false. Canonical and claim directory
removal occurs only after both entry phases are durably removed and both opened
directories have been fsynced. The owner then CASes `active -> children-removed`
with nonnull phase evidence before any `rmdir`. In that phase it removes only
the canonical directory, fsyncs its parent and CASes `canonical-removed`; an
absent canonical directory is accepted as crash-after-rmdir only while the exact
claim directory still exists. Only from canonical-removed may it remove the
claim directory, fsync its parent and CAS `removed`; claim absence is then the
crash-after-rmdir arm. Removed requires both absent. Any other phase/presence is
integrity failure. `process_state=cleaned` is committed only with directory
removed. A prior PID/start or other process-integrity failure remains
`process_state=integrity-failure` even when identity-safe path cleanup later
reaches directory removed; cleanup never erases terminal evidence or re-enables
capability. Exact replay after that final CAS is inert. PID-reuse plus successful
path-removal is a direct database/recovery fixture.

On Darwin the TypeScript broker obtains `LOCAL_PEERTOKEN` and `LOCAL_PEERPID`
and equality-checks UID, PID/start time, PGID/session, ancestry beneath the
persisted provider root and exact helper path/device/inode/digest/code identity.
The first valid connection atomically changes waiting to consumed; reconnect
or a second peer fails. A platform without equivalent peer/process proof keeps
the capability false. Rust relays bounded opaque bytes only; TypeScript alone
parses JSON-RPC/MCP, rejects duplicate keys, applies policy, debits ledgers and
journals canonical bytes.

Control EOF/HUP, deadline, cancellation or provider exit makes the supervisor
TERM the complete process group, wait 250 ms, KILL and reap, then close its
descriptors. As the provider-root parent it retains the group leader unreaped
through TERM, the bounded wait, KILL and descendant-absence proof, so the PID/
PGID cannot be reused between proof and signal; only then may it reap. It never removes persisted socket/capsule paths because it cannot
advance daemon-owned cleanup phases. The daemon watches supervisor death and is
the sole phase-aware path-cleanup owner; after daemon death, restart resumes from
the unchanged custody row. PID/start inspection is observation, never signal
authority. Any daemon signal to a process it does not directly parent requires
an OS identity-stable handle, acquired before provider continue and retained for
the action, that cannot retarget after exit. If the supervisor dies or the daemon
restarts without such a valid handle, the daemon never signals orphaned persisted
PIDs/PGIDs; on Darwin this is the required no-signal path unless an activated
build proves an equivalent primitive. A live or ambiguous record is quarantined
with capability false until the surviving direct-parent supervisor finishes or exact absence is proved.
Mismatch records integrity failure without signalling. Path cleanup uses the canonical-to-trusted-claim
transition above; direct unlink from the canonical namespace and digest-only
location are invalid. A surviving supervisor observes FD-3 closure after daemon
death without removing custody paths. Canaries cover daemon-only, supervisor-only and combined crash, crash
after Phase-A intent/name commit and after each directory create, listener bind,
capsule write/fsync and parent fsync; before/after process-row promotion; at
fork, before/after stub report, custody commit and ACK; and prove no provider
exec or untracked child on every pre-ACK failure; they also cover crash
before/after each entry fsync, hard-link alias before canonical claim and after
claim attempt, claim-phase and removed-phase CAS, after each directory `rmdir` and
after final cleaned CAS, exact claimed retry, source/claim substitution,
canonical-both-absent and duplicate-presence refusal, cross-device provisioning
denial, PID reuse and exit/reuse exactly between observation and attempted
restart or supervisor-death signal (zero signal), retained-unreaped-leader supervisor TERM/KILL/reap
plus daemon-owned remove, and failed `setsid`, `setpgid`/job-control group split, double-fork,
daemonisation and reparent escape. Any surviving descendant/listener/capsule or
unprovable startup cleanup advertises false.

Agy hooks allow only the two MCP tuples and adapter-owned bootstrap, then deny
read_url(*), execute_url(*), read_file(*), write_file(*), every other mcp(*) and
command(*). An auth file in synthetic HOME requires a passing absolute auth-read
denial canary. Cursor receives only per-action synthetic HOME/workspace/data
directories, no global CLI config, and exposes those two MCP tools while denying
Read/Write/Shell/WebSearch/WebFetch and all unrelated MCP/resources. Current-
build canaries prove both positive tool calls, exact discovery/empty list probes,
every negative, broker identity/one-use binding and crash cleanup. Direct Claude
and Codex run the same source/auth/shell/write/web/MCP/bundle-crossing negatives
and identical ledger/result-shape checks; success by one never certifies the
other. Every pinned provider/helper/trampoline descendant must fail `setsid`,
`setpgid`/job-control group split, double-fork, reparent and equivalent
daemonisation escape; group cleanup alone
is not proof.
Hardened wrappers mediate native effects; stock/tool-policy-only CLI advertises
false. Provider auth/config never appears in model-visible env/files/tools.

Executable policy separates trusted adapter bootstrap from model-triggerable
effects. The outer adapter supervisor may execute only the exact activated
provider-runtime closure; its provider MCP manager may internally launch only
the exact helper/broker closure. Neither launch is model-command authority; the
model exposes no executable and only the two portal tools. Cursor
activation resolves/bypasses its shell launcher to a pinned real target where
possible; otherwise launcher, shell, Node, index and private cache/data closure
plus fixed argv are all pinned/confined. Agy pins its signed native executable
by path/code identity/digest and proves direct execution; a hook that transits
`/bin/sh` instead requires one exact path/inode/digest-pinned fixed-argv
trampoline and a proved complete child closure. Seatbelt/`sandbox-exec` is an
exact-OS-version canary capability: unavailable/deprecated behaviour, semantic
drift or any failed positive/negative canary advertises false. Any unresolved
closure advertises false.

When provider API transport and model web tools share a process, activation
requires provider-native proof of policy separation or a contract-pinned,
destination-constrained provider proxy; otherwise capability is false. The
threat model covers accidental or model-induced misuse of an authentic pinned
runtime, not a deliberately compromised provider binary, which fails the
separate binary provenance/code-identity gate. The hardened containment shim is
a `std`-only Rust opaque byte relay for bounded fixed binary transport framing,
file descriptors, process/peer identity, supervisor custody and AF_UNIX bytes.
TypeScript retains JSON semantic framing, MCP schema, hook parsing/policy and
canonical journalling, so there is one protocol implementation and no native
JSON parser.
If any adapter cannot enforce the capability,
target-preparation acceptance returns capability unavailable before creating a
preparation, and dispatch fails before router/provider I/O and budget/action
insert. The completion reducer projects the exact unavailable slot/reason even
when no target exists.

provider_action_routes remains one insert-only row for every task-bound
answer-bearing canonical `(adapter_id, action_id)` pair. For certifying review it additionally stores exact
target, slot, slot-head generation at dispatch, delivery artifact/lineage,
bundle/manifest/coverage, profile/schema, final-prompt and active target-chair
binding generation/snapshot
fields. Non-review actions store those as null. Canonical route request/receipt
JSON follows the one checked-in structural model-route.v1 schema; no database
or artifact predicate exists in that codec.

Route columns store nullable `requested_effort`, closed
`resolved_effort_kind=applied|inapplicable` and nullable
`resolved_effort_value`; CHECK requires value nonnull only for applied and
requested effort null for inapplicable. `reviewed_artifact_id` is nullable for
the non-review arm. No sentinel or model-label-derived effort is stored.

~~~sql
provider_failure_substitution_events(
  adapter_id, action_id, event_generation, run_id,
  requested_family, requested_model, resolved_adapter_id,
  resolved_family, resolved_model, code, evidence_digest, created_at,
  PRIMARY KEY(adapter_id, action_id, event_generation),
  FOREIGN KEY(adapter_id, action_id)
    REFERENCES provider_action_pair_preflights(adapter_id, action_id)
)
~~~

Event generations are contiguous per pair and rows are immutable, so
substitution followed by provider/routing failure is representable and ordered
even when resolver failure correctly creates no provider action. The pair
preflight is the parent of routes/actions, finding-capacity reservations and
failure/substitution history. Its closed state is `resolving|admitted|released`;
owner/input identity is immutable, and only the one admission/release CAS may
advance state. `admitted` requires the same-transaction provider action and
route; `released` forbids them and consumes no finding/budget capacity. Exact
replay returns the persisted ordered event/failure without rerunning the router;
changed pair input conflicts. A pre-event crash may rerun only the pure resolver
under the same owner digest.

Its normalised certifying columns map one-for-one to
providerRouteProjectionV1: route request/receipt digests, adapter/contract,
family/model, requested effort/tagged resolved effort, target/slot, reviewed artifact,
publication lineage, bundle/root/coverage/search/risk/mandatory-set/prompt
digests, target chair agent/principal/lease/adapter/family/model/route,
provider-session/bridge/binding generations, adapter contract, profile digest
and slot-head/attempt generations. Public action read never
reconstructs a route. With `route_state=present` it joins that immutable row;
with `missing` or `integrity-failed` it instead projects a null route plus the
safe route-recovery evidence digest owned below. It then joins
provider_review_terminal_journal, whose unique key is
adapter/action/target/slot/attempt and whose immutable columns are terminal kind,
run-global terminal sequence, terminal-input digest, private answer/result/adapter-result digests,
authenticated-usage digest, read-journal digest, public terminal projection
digest and optional evidence-mutation-receipt digest. An append-only terminal
integrity-conflict row records a changed input digest without updating either
owner.

Replay/input digest classification occurs before router work. Durable preflight
and the in-process mutex key are exactly `(adapter_id, action_id)`. Its owner
digest hashes run, authenticated actor/principal and the full canonical input.
An exact retry joins; a different digest waits and conflicts before a router
call. Cross-run same-pair use therefore runs the router at most once and
conflicts pre-router, while the same action ID under another adapter is legal.
Every provider action, route, terminal, recovery, budget and adapter journal
foreign key uses the pair; no action-ID-only index/lookup/sort remains. A five-
second process-group-bounded resolver produces only a candidate receipt. After
pair replay classification but before that resolver, certifying dispatch CASes
the exact open finding-set root and inserts either a normal worst-case
32-finding capacity reservation or a zero-new-finding resolution-only row.
Capacity failure inserts no action/budget/route row and invokes no router or
provider. The
admission transaction then rechecks effort
applicability, target/artifact/source currency, slot-head generation,
active chair binding/adapter contract and resolved adapter/family/model/effort
against the profile and provider payload. Resolved adapter must equal requested
action adapter and slot adapter. It inserts route/action/reservation/command
atomically.

For certifying dispatch, the authenticated principal must be the current target
chair at the active binding's principal/lease/provider-session/bridge
generations. Exact durable replay is
classified first and remains readable after rotation. A partial unique index
permits only one nonterminal certifying action per target/slot/head generation.
The slot head records its latest attempt/action atomically at dispatch; a
concurrent sibling action loses the CAS.

#### 9.21.4 Terminal results and linear evidence heads

provider_review_results is insert-only and has one closed discriminator:

- safe-answer: exact provider-answer digest/length, safe canonical
  review-result.v1, result/finding/resolved-finding digests, classifier and
  secret-selector identity;
- unusable-answer: exact provider-answer digest/length, safety identity and no
  public text/result/findings; or
- provider-terminal-failure: exactly one of max-turns-exhausted,
  provider-rejected, terminal-no-answer or adapter-terminal-failure code,
  private normalised diagnostic digest, no answer digest and no public error.

The joined public action terminal discriminator additionally admits
terminal-no-effect, integrity-terminal and retired-unknown from the route-
integrity owner. These never create provider_review_evidence. ambiguous remains
strictly nonterminal; a terminal row cannot also project ambiguous.

A terminal failure is terminal, not ambiguous. Every proved-effect terminal --
safe answer, unusable answer or provider-terminal-failure -- settles complete
authenticated usage exactly. If usage is absent or partial, the same
transaction conservatively consumes the full remaining spendable reservation.
Each releases terminal concurrency capacity. Proved no-effect releases the
reservation; ambiguity retains it. No retry or redispatch occurs. Raw answers,
raw errors, diagnostics and adapter results stay private.
result_digest uses the exact six-arm Spec 01 canonical domain, including the
stable run terminal sequence and coverage-summary digest where applicable, and
excludes usage. Generated golden vectors reject generic terminal-state or
cross-arm fields.

A safe answer becomes certifying only when the trusted journal covers the
mandatory set including every deterministic risk sample and hashes to
read_coverage_digest.
With insufficient reads, syntactic CLEAN is publicly UNUSABLE and resolves
nothing; safely parsed FINDINGS stays visible FINDINGS/noncertifying, accepts no
resolution and retains all safe new findings. Raw unsafe output is UNUSABLE.
Provider text cannot attest consumption. The daemon
derives a manifest-complete-risk-directed gap summary with per-group total/read/
unread counts and unread-set digests; byteComplete is false unless every object
was fully read.

review_slot_heads is the sole linear current evidence owner:

~~~sql
review_slot_heads(
  run_id, target_generation, slot,
  head_generation, head_evidence_id,
  latest_attempt_generation,
  latest_action_adapter_id, latest_action_id, latest_action_state,
  open_finding_set_digest,
  repair_required_finding_set_digest,
  prior_target_generation, prior_target_head_evidence_id,
  revision, updated_at,
  PRIMARY KEY(run_id, target_generation, slot)
)
~~~

Target creation inserts exactly four rows. It carries forward each predecessor
slot's complete safe open records and repair-required sets, but no predecessor
evidence becomes current for the new target. Head and attempt generations are
contiguous. Canonical paged set roots are complete/sorted/unique/digest-valid. A head evidence
foreign key matches the same run/target/slot/generation.

provider_review_evidence is immutable and includes target/slot, prior and new
head generations, prior evidence, complete prior open set, separately stored
provider-reported-resolved and daemon-accepted-resolved prior sets, current
finding set, complete new open set,
repair-required set, finding-window reservation, terminal sequence,
certification-basis-at-terminal digest, canonical action pair/result/route/bundle/coverage/profile/
chair-binding, `route_observation_digest`, nullable
`actual_route_identity_digest` and safe reviewer-family-relation/read-coverage
fields. The actual digest is nonnull only for a closed proved endpoint-provider/
family/model object bound to admission and observation. Profile/admission or
other observed-field inequality retains that digest as mismatch evidence; its
absence/mismatch blocker and resolution-denial outcome are immutable. It also stores the exact
task, answer/result safety digests and final-prompt route join required by
reviewEvidenceReadV1. It contains no currency column.

`fabric.v1.review-finding-page.read` joins an authenticated session/run to an
authorised evidence/completion/receipt finding-set root, then equality-checks
the requested page membership and digest before returning its complete safe
members plus the next ordered page digest. It never accepts a bare globally
guessable page digest. Cross-set/orphan/missing/digest-mismatch rows fail with no
partial content. Receipt v2 materialises exactly every reachable finding page,
deduplicated and sorted by page digest, so all set refs are standalone-resolvable
and no unreferenced page is exported.

Dispatch CAS-increments attempt generation and reserves one exact
target/slot/head. The safe/UNUSABLE provider terminal transaction automatically
inserts evidence plus reviewEvidenceMutationReceiptV1 and CAS-advances that
head before exposing terminal result. There is no terminal-unrecorded state.
UNUSABLE resolves none. The daemon accepts reported resolutions only for a
safe, sufficient-read answer whose target/source/delivery/chair/profile remains
current and whose carried finding is eligible on this successor target. A
stale, insufficient-read or same-target repair-required result accepts none.
Every safe P0-P2 finding becomes repair-required automatically. The action-
bound terminal transaction is exempt from live dispatch/annotation currency
fences: it always settles and advances its reserved head before visibility,
even after currency drift. Such stale evidence is noncertifying and keeps all
safe new findings open for successor preparation. Provider failure,
no-effect/integrity/retired terminal states close only the attempt and create no
review evidence. A later attempt may then reserve the unchanged evidence head.
The receipt projector emits provider terminal failure from the terminal/result/
route joins with unchanged head/open/repair set digests and no evidence/new-head
fields.

Annotation is owned by separate append-only relations:

~~~sql
review_evidence_annotations(
  run_id, evidence_id, annotation_revision, prior_annotation_revision,
  command_id, chair_binding_generation, disposition, note,
  note_digest, annotation_digest, created_at,
  PRIMARY KEY(run_id, evidence_id, annotation_revision),
  UNIQUE(command_id)
)
review_evidence_annotation_heads(
  run_id, evidence_id, current_annotation_revision, revision,
  PRIMARY KEY(run_id, evidence_id),
  FOREIGN KEY(run_id, evidence_id, current_annotation_revision)
    REFERENCES review_evidence_annotations(
      run_id, evidence_id, annotation_revision)
)
~~~

Disposition CHECK is exactly `substantiated|unsubstantiated|duplicate|needs-
more-evidence`; note is inert UTF-8 at most 512 bytes. Rows are immutable,
revisions are contiguous and the head CAS gives one current projection.
`fabric.v1.review-evidence.annotate` writes only this relation against exact
evidence/result/head and active chair binding. It cannot create evidence or
change head/verdict/findings/repair/reviewer-family relation/currency/completion.
Exact replay returns its immutable receipt before live-chair check. Receipt v2
and completion queries never join either annotation table.
The dispatch command's original prepared/dispatched receipt is immutable and
never gains terminal fields on replay. Terminalisation has a separate internal
action-pair/target/slot/attempt idempotency journal and stores the canonical terminal-
input digest over terminal kind, private answer/adapter-result digests,
authenticated usage and read-coverage journal. Exact duplicate returns the
stored terminal projection. Changed live-callback/lookup input appends an
integrity quarantine, never overwrites result/evidence/head/settlement and makes
completion emit integrity-failure. provider-action.read exposes the terminal
result and automatic mutation receipt. Neither receipt contains currency.

A first or second FINDINGS action therefore always progresses linearly. A
repaired target carries each prior finding's full safe content and origin
action/result as mandatory bundle evidence, then permits CLEAN to close it.
Target preparation Phase B rejects any predecessor nonterminal action and cannot commit
until every safe/UNUSABLE terminal has atomically reached its head. No source
change can launder a late finding.

An ambiguous/awaiting-human-retire attempt remains nonterminal and owns its
target/slot/head/reservation. It blocks sibling dispatch, target reprepare/
supersession and review/run acceptance or close until proved terminal recovery
or confirmed retirement. This freezes budget and gates review/liveness.

Read/list responses join immutable evidence to a freshly derived
review_evidence_currency value. Exact command replay never performs that join.
Operator Evidence row/detail uses the exact operatorReviewEvidenceRowV1 union
under operator project/session/run scope. Its view joins task/action pair, terminal
kind/safety/failure code, answer/result, route/final-prompt, adapter/family/
model, bundle/coverage, severity/open counts, reviewer-family relation, active
chair binding and the one current annotation disposition/revision/digest plus
safe detail fields without raw content.

#### 9.21.5 Completion and deterministic projection

ReviewCompletionReducer first reads the persisted required-slot availability.
Any false slot returns `certifying-review-capability-unavailable` plus exact
profile-ordered `unavailableSlots[]`, even when no target exists. Finding-
capacity exhaustion has the next target-wide branch and empty slots. Otherwise it
runs target currency and contiguous active-chair-binding checks, then reads one
current target, one resolved four-slot profile and exactly four slot heads.
It never scans for an unsuperseded latest row. For each head it validates the
latest action-pair/evidence chain, target/bundle/route/active-chair-binding/profile joins,
reviewer-family relation and complete open-finding set.
Its query columns map one-for-one to reviewCompletionV1: target chair/artifact/
lineage/bundle/root/coverage/risk/mandatory/profile digests and, per slot, head/
attempt/action-pair/evidence/verdict/result/route, resolved adapter/family/model,
read coverage, reviewer-family relation, certifying state, complete open
records and ordered blockers.

It emits only the ordered closed blockers in Spec 01. open-findings is the sole
finding blocker. A proved no-answer/max-turn terminal result emits
provider-terminal-failure; terminal no-effect and human-retired unknown emit
their exact blockers; route-integrity covers a terminal but unverifiable route
chain. ambiguous-action is reserved for unproved provider effect/outcome.
Missing head evidence emits the slot code only for a structurally valid head
whose current action should own evidence. Zero/multiple/no trustworthy targets
use target-null integrity. A trustworthy target with broken chair binding,
profile/head cardinality, CAS chain or immutable join uses target-present
integrity: immutable target fields remain exact, chair/profile are null and
slots empty. Missing profile uses its own arm. With a valid structure exactly
four rows exist; stale-target is top-level only. Top and slot blocker enums are
disjoint, `superseded` exists only in historical currency, and a terminal
failure row projects unchanged head/open/repair sets with evidence null.
Generated truth-table tests enumerate every arm/cause and reject duplication.

The operator System/Evidence projection and agent completion read call this
same reducer. Mutation receipts do not. fabric-receipt.json exports only closed
safe route, target, bundle/coverage/profile, slot-head, evidence and recovery
digests through exact `reviewCompletion`, `providerRoutes`, `providerReviews`
and `routeIntegrityRecoveries` codecs in Spec 01 section 19. It contains no raw
answer/error, private diagnostics, bundle bytes, portal transcript, prompt,
secret HMAC, adapter result, usage or annotation. The generated standalone
Draft 2020-12 schema embeds literal local enums for objective-check kind,
provider failure/substitution code and every registry-closed operator value it
uses. It has no external resolver/dynamic catalogue;
an unknown future value rejects and raw provider-specific detail remains
private behind evidence digest.

#### 9.21.6 ProviderRouteIntegrityRecoveryService

route_integrity_recoveries is one-to-one with an affected certifying provider
action and is the only startup/ambiguity recovery owner for every certifying
action, whether its joins are intact or contradictory:

~~~sql
route_integrity_recoveries(
  run_id NOT NULL, adapter_id NOT NULL, action_id NOT NULL, task_id NOT NULL,
  route_ordinal NOT NULL CHECK(route_ordinal >= 1),
  target_generation NOT NULL CHECK(target_generation >= 1),
  slot NOT NULL CHECK(slot IN
    ('native','other-primary','cursor-grok','agy-gemini')),
  attempt_generation NOT NULL CHECK(attempt_generation >= 1),
  recovery_generation, owner_daemon_generation,
  state, reason, terminal_disposition,
  reservation_digest NOT NULL,
  route_state, route_receipt_digest, recovery_evidence_digest,
  lookup_state, lookup_evidence_digest, settlement_digest,
  created_at, updated_at,
  PRIMARY KEY(adapter_id, action_id),
  FOREIGN KEY(adapter_id, action_id, run_id, task_id, route_ordinal)
    REFERENCES provider_actions(
      adapter_id, action_id, run_id, task_id, route_ordinal),
  FOREIGN KEY(adapter_id, action_id, run_id, target_generation, slot,
      attempt_generation, reservation_digest)
    REFERENCES review_finding_capacity_reservations(
      adapter_id, action_id, run_id, target_generation, slot,
      attempt_generation, reservation_digest)
)
~~~

State is detected, inspecting, terminal-proved-no-effect,
terminal-proved-usage, awaiting-human-retire or terminal-retired-unknown. The
row joins the exact daemon-global action pair, run and reservation digest; no
second free-form reservation identifier exists.
Its task/ordinal/target/slot/attempt tuple is daemon-derived at insert from the
affected certifying action's immutable action/reservation/head custody and never
changes; baseline triggers reject any tuple, pair, run or digest mutation. The
displayed composite foreign keys, not mapper prose, bind both custody owners; this
tuple remains trustworthy when the route row itself is missing or integrity-
failed. It supplies the existing public recovery read and scoped route-list
filters without reconstructing route bytes.
reason and terminal
disposition use the exact closed receipt-v2 enums. lookup_state is not-
attempted, in-flight or completed, with evidence digest non-null exactly for
completed. Nonterminal states have null disposition/settlement; proved-no-
effect, proved-usage and retired-unknown use their exact receipt-v2 disposition
arm and a non-null settlement digest. Insert fences further provider I/O,
marks the action noncertifying while unresolved and freezes only that
reservation's dimensions. All certifying route/action rows are excluded from
generic startup recovery and prepared-action re-enqueue.

The indexed public read by scoped canonical pair returns the exact Spec 01
providerRouteIntegrityRecoveryProjectionV1, including target/slot/attempt,
recovery generation/state/reason, reservation digest, route/lookup/settlement/
evidence fields and derived retirement eligibility. Operator Evidence emits its
closed recovery-action arm. Receipt recovery rows are watermark audit only and
are never accepted as mutation authority.

`route_state` is exactly present, missing or integrity-failed. Present requires
the immutable route-receipt digest and an exact join to provider_action_routes;
missing/integrity-failed require that digest null and a non-null safe recovery-
evidence digest. The service owns that discriminator and evidence atomically;
no reader, receipt exporter or Console projection may infer or reconstruct a
route from provider, action, bundle or prompt remnants.

The service runs before generic provider recovery. Prepared with durable
zero-dispatch proof returns the full reservation, writes `settled`, and
terminalises no-effect.
Every dispatched/accepted/ambiguous state permits at most one bounded pair-keyed
lookup when supported. Exact safe/unusable/failure terminal input enters the
ordinary action-bound terminaliser; complete authenticated usage settles
exactly and absent/partial usage charges the remaining spendable reservation.
Authenticated closed no-effect returns full capacity under `settled`. A proved effect with an unverifiable
binding conservatively settles as integrity-terminal. Absent, timeout,
malformed, conflict or unavailable lookup enters awaiting-human-retire and
retains the reservation. No branch reconstructs route/bundle/prompt,
dispatches, retries or creates evidence outside the ordinary valid-answer
terminaliser.

provider-route-integrity-retire is a closed typed operator-action intent. It
binds the exact adapter/action pair, recovery generation, current state and reservation
digest; requires external-effect capability, one matching consequential gate
and independently attested direct-human confirmation; and has no provider port.
Confirmed Commit consumes the full remaining spendable reservation, releases
only terminal concurrency capacity, records terminal-retired-unknown and
terminalises the action. Wrong/stale authority, gate, generation, digest or
confirmation changes nothing. The human result is labelled retired-unknown,
never no-effect or provider-failed.

Preview/Commit load the live row and require exactly
`state=awaiting-human-retire` plus the same pair, recovery generation and
reservation digest. The Console cannot construct this action from completion or
receipt data and shows it only when the live projection says eligible.

Each terminal branch atomically settles the reservation, clears its
dimension-freeze contribution, terminalises the action as noncertifying,
persists recovery evidence and exits run recovery state when no other blocker
exists. After its bounded inspection deadline, a nonterminal row must be
awaiting-human-retire; every other nonterminal state is an invariant failure.
If store corruption prevents identifying the
reservation, startup stops mutations under the existing store-corruption
contract rather than leaving a normal route freeze.

#### 9.21.7 Verification

Deterministic verification covers:

- exact publication-time principal/bridge/custody/session/adapter/model/route
  joins and target eligibility for each source/publisher kind;
- complete base/head changed-file and required-evidence coverage, all bundle
  limits/digests/chunk chains, create-exclusive collision handling and every
  before/during/phase-B source or delivery mutation; review-diff.v1 exact
  status/mode/binary/rename/path/order/digest fixtures bind one immutable full-
  ID range, the dynamic final target computes its own values and 64 MiB+1 fails;
- preparation acceptance/read, semantic join/conflict, high-water nonreuse,
  every durable state edge, worker-lease restart and CAS/Phase-B crash point,
  proving one accepted job becomes at most one complete target; the first poll
  uses only the accepted preparation ID and exact session/run scope;
- target/profile creation, exact four-slot reviewer-family mapping,
  same-agent binding continuity and target supersession after source or every
  unrebindable chair/family/adapter/contract/model/profile advance; public
  rebind execution/replay, non-adopted/crossed/pointer-head negatives and
  sequential no-ABA binding chains preserve target/evidence/finding identity;
  review-subject JCS golden/permutation/extra/omission/equality-copy fixtures
  fail every crossed nested bundle/profile field;
- contract-bound Claude/Codex/Cursor/Agy exact server/tool/helper/broker sandbox
  canaries, peer credentials, stopped-child persistence, exact provider-closure
  derivation/substitution negatives, supervisor-FD-3 isolation and stub-FD-4–
  FD-7 closure,
  daemon/supervisor/startup/PID-reuse cleanup, empty list probes, denied extra
  methods/effects and no cross-bundle portal read;
- structural Python/TypeScript route-schema parity, post-router admission
  checks, process-tree kill, daemon-global pair single-flight, requested/
  resolved adapter equality, cross-run conflict, different-adapter same-ID
  allowance, changed concurrent input and replay without router;
- current-chair certifying dispatch and ordinary non-review authority parity;
- safe CLEAN/FINDINGS, UNUSABLE, proved max-turn/no-answer/provider failure and
  true ambiguity, including exact or conservative settlement for every proved-
  effect terminal, no-effect release, ambiguity retention, stale in-flight
  evidence, insufficient CLEAN/FINDINGS classification and private error scans;
- first/second FINDINGS, UNUSABLE, concurrent head forks, full open-set
  carry-forward, repaired-target CLEAN, immutable mutation replay and live read
  currency;
- every reducer top-level/slot blocker union, operator/agent projection and
  standalone resolver-free receipt-v2 literal catalogues/sort/equality/history/
  count/JCS hash, including capability-unavailable-before-target; append-only
  annotation vocabulary/current projection and annotation-free completion/
  receipt; and
- every certifying-action recovery branch, bounded lookup, conservative
  consumption, direct-human retirement, liveness exit, generic-recovery
  exclusion and absence of redispatch/reconstruction. Direct-SQL shape tests
  prove digest-only reservation custody and reject any free-form
  `reservation_id` column or mapper input.

The current catalogue explicitly rejects provider_review_packets,
model_routing_receipts, cross_family_reviews, modelRoutingReceipts,
crossFamilyReviews, recordModelRoutingEvidence and
recordCrossFamilyReviewEvidence and fabric.v1.review-evidence.record.

### 9.22 Asynchronous lifecycle rotation persistence

Spec 01 section 32.20 owns observable behaviour.
`lifecycle_rotation_custodies` plus its append-only revisions and exact head is
the dedicated owner for rotate/compact provider and bridge effects, including a
true chair rotation.

The current baseline relations are:

~~~sql
agent_lifecycle_identity_high_water(
  run_id, agent_id, provider_generation, principal_generation, revision,
  PRIMARY KEY(run_id, agent_id)
)

agent_lifecycle_bridge_high_water(
  run_id, agent_id, bridge_owner_kind, bridge_generation, revision,
  PRIMARY KEY(run_id, agent_id, bridge_owner_kind)
)

agent_lifecycle_context_high_water(
  run_id, agent_id, provider_generation, context_revision, revision,
  PRIMARY KEY(run_id, agent_id, provider_generation)
)

provider_context_observation_audit(
  observation_id PRIMARY KEY, source_event_id, run_id, agent_id,
  provider_generation, context_revision, classification, evidence_digest,
  observed_at, UNIQUE(run_id, agent_id, source_event_id),
  UNIQUE(run_id, agent_id, source_event_id, provider_generation,
    context_revision, evidence_digest)
)

lifecycle_rotation_custodies(
  project_session_id, run_id, agent_id, custody_id, command_id,
  admission_digest, provider_action_adapter_id, provider_action_id,
  recovery_source_kind, recovery_from_custody_id,
  recovery_from_custody_revision, recovery_from_generation_loss_id,
  recovery_from_generation_loss_revision, recovery_source_ref_digest,
  recovery_source_journal_digest,
  bridge_owner_kind, caller_turn_lease_id, caller_turn_generation,
  predecessor_turn_set_digest, quarantined_write_set_digest,
  delivery_cut_watermark, adoption_delivery_set_digest,
  checkpoint_ref, checkpoint_digest, checkpoint_validation_revision,
  checkpoint_validation_digest, checkpoint_validation_key,
  task_revision, mailbox_revision, child_set_digest, open_work_set_digest,
  source_provider_session_ref, source_capability_hash,
  source_custody_action_id, source_adapter_id, source_adapter_contract_digest,
  source_bridge_row_id, source_bridge_revision,
  source_provider_generation, source_principal_generation,
  source_bridge_generation, source_project_session_generation,
  source_run_generation, source_chair_lease_generation,
  target_provider_generation, target_principal_generation,
  target_bridge_generation, replacement_adapter_id,
  replacement_contract_digest, staged_capability_hash,
  launch_attest_challenge_digest, precondition_digest,
  origin_fresh_handoff_id, origin_fresh_handoff_digest,
  origin_operation, origin_fresh_apply_plan_digest,
  creation_json, creation_digest, created_at,
  PRIMARY KEY(run_id,agent_id,custody_id),
  UNIQUE(project_session_id,run_id,agent_id,custody_id),
  UNIQUE(provider_action_adapter_id,provider_action_id),
  UNIQUE(creation_digest),
  CHECK((recovery_source_kind='none' AND
      recovery_from_custody_id IS NULL AND
      recovery_from_custody_revision IS NULL AND
      recovery_from_generation_loss_id IS NULL AND
      recovery_from_generation_loss_revision IS NULL AND
      recovery_source_ref_digest IS NULL AND
      recovery_source_journal_digest IS NULL AND
      origin_fresh_handoff_id IS NULL AND origin_fresh_handoff_digest IS NULL AND
      origin_operation IS NULL AND origin_fresh_apply_plan_digest IS NULL) OR
    (recovery_source_kind='custody' AND
      recovery_from_custody_id IS NOT NULL AND
      recovery_from_custody_revision IS NOT NULL AND
      recovery_from_generation_loss_id IS NULL AND
      recovery_from_generation_loss_revision IS NULL AND
      recovery_source_ref_digest IS NOT NULL AND
      recovery_source_journal_digest IS NOT NULL AND
      origin_fresh_handoff_id IS NOT NULL AND
      origin_fresh_handoff_digest IS NOT NULL AND
      origin_operation='fresh-rotate' AND
      origin_fresh_apply_plan_digest IS NOT NULL) OR
    (recovery_source_kind='generation-loss' AND
      recovery_from_custody_id IS NULL AND
      recovery_from_custody_revision IS NULL AND
      recovery_from_generation_loss_id IS NOT NULL AND
      recovery_from_generation_loss_revision IS NOT NULL AND
      recovery_source_ref_digest IS NOT NULL AND
      recovery_source_journal_digest IS NOT NULL AND
      origin_fresh_handoff_id IS NOT NULL AND
      origin_fresh_handoff_digest IS NOT NULL AND
      origin_operation='fresh-rotate' AND
      origin_fresh_apply_plan_digest IS NOT NULL)),
  CHECK((checkpoint_validation_digest IS NULL AND
      checkpoint_validation_key='none') OR
    (checkpoint_validation_digest IS NOT NULL AND
      checkpoint_validation_key=checkpoint_validation_digest)),
  CHECK(origin_fresh_handoff_id IS NULL OR
    (provider_action_adapter_id=replacement_adapter_id AND
      replacement_contract_digest IS NOT NULL)),
  FOREIGN KEY(provider_action_adapter_id,provider_action_id)
    REFERENCES provider_actions(adapter_id,action_id),
  FOREIGN KEY(source_adapter_id,source_custody_action_id)
    REFERENCES provider_actions(adapter_id,action_id),
  FOREIGN KEY(project_session_id,run_id,agent_id,recovery_from_custody_id,
      recovery_from_custody_revision,recovery_source_ref_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,source_ref_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,
      recovery_from_generation_loss_id,recovery_from_generation_loss_revision,
      recovery_source_ref_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      source_ref_digest),
  FOREIGN KEY(origin_fresh_handoff_id,origin_fresh_handoff_digest,
      project_session_id,run_id,agent_id,recovery_source_kind,
      recovery_source_ref_digest,recovery_source_journal_digest,custody_id,
      provider_action_adapter_id,provider_action_id,checkpoint_ref,
      checkpoint_digest,checkpoint_validation_key,replacement_contract_digest,
      origin_operation,target_provider_generation,target_principal_generation,
      target_bridge_generation,admission_digest,origin_fresh_apply_plan_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
      new_custody_id,provider_action_adapter_id,provider_action_id,checkpoint_ref,
      checkpoint_digest,checkpoint_validation_key,adapter_contract_digest,
      operation,reserved_provider_generation,reserved_principal_generation,
      reserved_bridge_generation,admission_digest,fresh_apply_plan_digest)
    DEFERRABLE INITIALLY DEFERRED
)

lifecycle_rotation_custody_revisions(
  project_session_id, run_id, agent_id, custody_id,
  revision CHECK(revision >= 1), prior_revision, prior_journal_digest,
  state CHECK(state IN ('awaiting-boundary','prepared','dispatched','accepted',
    'ambiguous','provider-terminal','committing','finalized')),
  disposition_code CHECK(disposition_code IN
    ('none','adopted','no-effect','quarantined','superseded','abandoned')),
  proof_kind CHECK(proof_kind IN ('none','zero-dispatch-no-effect',
    'predispatch-superseded','postterminal-adoption-cas-superseded',
    'fresh-handoff-superseded','provider-terminal','provider-no-effect',
    'integrity-quarantine','confirmed-abandon')),
  terminal_evidence_digest,
  semantic_json, semantic_digest, source_ref_digest,
  origin_fresh_apply_id, origin_fresh_apply_digest,
  receipt_batch_id, receipt_apply_id, receipt_apply_digest,
  journal_json, journal_digest, recorded_at,
  PRIMARY KEY(run_id,agent_id,custody_id,revision),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    source_ref_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    semantic_digest,source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    semantic_digest,source_ref_digest,journal_digest,origin_fresh_apply_id,
    origin_fresh_apply_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,state,
    disposition_code,semantic_digest,source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    disposition_code,source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,revision,
    disposition_code,terminal_evidence_digest,source_ref_digest,journal_digest),
  UNIQUE(semantic_digest), UNIQUE(source_ref_digest), UNIQUE(journal_digest),
  CHECK((revision=1 AND prior_revision IS NULL AND
      prior_journal_digest IS NULL) OR
    (revision>1 AND prior_revision=revision-1 AND
      prior_journal_digest IS NOT NULL)),
  CHECK((state='finalized')=(disposition_code<>'none')),
  CHECK((state='finalized')=
    (receipt_batch_id IS NOT NULL AND receipt_apply_id IS NOT NULL AND
      receipt_apply_digest IS NOT NULL)),
  CHECK((receipt_batch_id IS NULL)=(receipt_apply_id IS NULL)),
  CHECK((receipt_batch_id IS NULL)=(receipt_apply_digest IS NULL)),
  CHECK((origin_fresh_apply_id IS NULL)=(origin_fresh_apply_digest IS NULL)),
  CHECK(origin_fresh_apply_id IS NULL OR
    (revision=1 AND state<>'finalized' AND receipt_batch_id IS NULL)),
  CHECK((state IN ('provider-terminal','committing','finalized'))=
    (terminal_evidence_digest IS NOT NULL)),
  CHECK((state='finalized')=(proof_kind<>'none')),
  FOREIGN KEY(project_session_id,run_id,agent_id,custody_id)
    REFERENCES lifecycle_rotation_custodies(
      project_session_id,run_id,agent_id,custody_id),
  FOREIGN KEY(project_session_id,run_id,agent_id,custody_id,prior_revision,
      prior_journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,journal_digest),
  FOREIGN KEY(receipt_batch_id,receipt_apply_id,project_session_id,run_id,agent_id,
      custody_id,revision,semantic_digest,source_ref_digest)
    REFERENCES lifecycle_receipt_custody_effects(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,custody_id,
      final_revision,final_semantic_digest,final_source_ref_digest)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(receipt_apply_id,receipt_apply_digest,receipt_batch_id)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,receipt_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(receipt_apply_id,receipt_batch_id)
    REFERENCES lifecycle_transition_applies(apply_id,receipt_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(origin_fresh_apply_id,origin_fresh_apply_digest,custody_id,
      semantic_digest,source_ref_digest)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,new_custody_id,new_custody_semantic_digest,
      new_custody_source_ref_digest)
    DEFERRABLE INITIALLY DEFERRED
)

lifecycle_rotation_custody_heads(
  project_session_id, run_id, agent_id, custody_id, current_revision,
  state, disposition_code, semantic_digest, source_ref_digest, journal_digest,
  terminal CHECK(terminal IN (0,1)), head_revision,
  PRIMARY KEY(run_id,agent_id,custody_id),
  UNIQUE(project_session_id,run_id,agent_id,custody_id),
  FOREIGN KEY(project_session_id,run_id,agent_id,custody_id,current_revision,
      state,disposition_code,semantic_digest,source_ref_digest,journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,state,
      disposition_code,semantic_digest,source_ref_digest,journal_digest),
  CHECK((terminal=1)=(state='finalized'))
)

CREATE UNIQUE INDEX one_nonfinal_lifecycle_custody_per_agent
  ON lifecycle_rotation_custody_heads(run_id,agent_id)
  WHERE terminal=0;

lifecycle_scope_admission_outbox(
  admission_request_id PRIMARY KEY, project_id, project_session_id, run_id,
  authority_id, admission_digest, admitted_at, scope_json, scope_digest UNIQUE,
  created_at,
  UNIQUE(project_id,project_session_id,run_id,authority_id),
  UNIQUE(admission_request_id,project_id,project_session_id,run_id,authority_id,
    scope_digest)
)

CREATE TRIGGER lifecycle_scope_admission_outbox_no_update
BEFORE UPDATE ON lifecycle_scope_admission_outbox
BEGIN
  SELECT RAISE(ABORT,'lifecycle-scope-admission-outbox-immutable');
END;

CREATE TRIGGER lifecycle_scope_admission_outbox_no_delete
BEFORE DELETE ON lifecycle_scope_admission_outbox
BEGIN
  SELECT RAISE(ABORT,'lifecycle-scope-admission-outbox-immutable');
END;

lifecycle_admitted_run_scopes(
  project_id, project_session_id, run_id, authority_id,
  admission_request_id UNIQUE, admission_digest, scope_digest UNIQUE,
  initial_scope_checkpoint_digest UNIQUE, admission_resolution_digest UNIQUE,
  admitted_at,
  PRIMARY KEY(project_session_id,run_id),
  UNIQUE(project_id,project_session_id,run_id),
  UNIQUE(project_session_id,run_id,authority_id),
  FOREIGN KEY(admission_request_id,project_id,project_session_id,run_id,
      authority_id,scope_digest)
    REFERENCES lifecycle_scope_admission_outbox(
      admission_request_id,project_id,project_session_id,run_id,authority_id,
      scope_digest),
  FOREIGN KEY(admission_request_id,project_session_id,run_id,authority_id,
      scope_digest,initial_scope_checkpoint_digest,admission_resolution_digest)
    REFERENCES lifecycle_scope_admission_resolutions(
      admission_request_id,project_session_id,run_id,authority_id,scope_digest,
      initial_scope_checkpoint_digest,resolution_digest)
    DEFERRABLE INITIALLY DEFERRED
)

lifecycle_receipt_scope_checkpoints(
  project_session_id, run_id, authority_id,
  receipt_count CHECK(receipt_count >= 0),
  head_authority_sequence CHECK(head_authority_sequence >= 0),
  head_receipt_digest, ordered_record_set_digest,
  checkpoint_json, checkpoint_digest, attestation, verified_at,
  PRIMARY KEY(project_session_id,run_id,receipt_count),
  UNIQUE(checkpoint_digest),
  UNIQUE(project_session_id,run_id,checkpoint_digest),
  UNIQUE(project_session_id,run_id,receipt_count,checkpoint_digest,
    head_receipt_digest),
  UNIQUE(project_session_id,run_id,authority_id,receipt_count,
    checkpoint_digest,head_receipt_digest),
  UNIQUE(project_session_id,run_id,authority_id,receipt_count,
    head_authority_sequence,head_receipt_digest,ordered_record_set_digest,
    checkpoint_digest),
  CHECK(receipt_count=head_authority_sequence),
  CHECK((receipt_count=0)=(head_receipt_digest IS NULL)),
  FOREIGN KEY(project_session_id,run_id,authority_id)
    REFERENCES lifecycle_admitted_run_scopes(
      project_session_id,run_id,authority_id)
)

lifecycle_scope_admission_resolutions(
  admission_request_id PRIMARY KEY, project_id, project_session_id, run_id,
  authority_id, scope_digest, initial_scope_checkpoint_digest UNIQUE,
  initial_receipt_count CHECK(initial_receipt_count=0),
  initial_head_receipt_digest CHECK(initial_head_receipt_digest IS NULL),
  namespace_checkpoint_digest NOT NULL, resolution_json, resolution_digest UNIQUE,
  verified_at,
  UNIQUE(admission_request_id,project_session_id,run_id,authority_id,
    scope_digest,initial_scope_checkpoint_digest,resolution_digest),
  FOREIGN KEY(admission_request_id,project_id,project_session_id,run_id,
      authority_id,scope_digest)
    REFERENCES lifecycle_scope_admission_outbox(
      admission_request_id,project_id,project_session_id,run_id,authority_id,
      scope_digest),
  FOREIGN KEY(project_session_id,run_id,authority_id,initial_receipt_count,
      initial_scope_checkpoint_digest,initial_head_receipt_digest)
    REFERENCES lifecycle_receipt_scope_checkpoints(
      project_session_id,run_id,authority_id,receipt_count,checkpoint_digest,
      head_receipt_digest),
  FOREIGN KEY(project_id,namespace_checkpoint_digest,authority_id)
    REFERENCES lifecycle_receipt_namespace_checkpoints(
      project_id,checkpoint_digest,authority_id),
  FOREIGN KEY(project_id,namespace_checkpoint_digest,project_session_id,run_id,
      authority_id,initial_scope_checkpoint_digest,initial_receipt_count,
      initial_head_receipt_digest)
    REFERENCES lifecycle_receipt_namespace_members(
      project_id,checkpoint_digest,project_session_id,run_id,authority_id,
      scope_checkpoint_digest,receipt_count,head_receipt_digest)
)

lifecycle_receipt_scope_heads(
  project_session_id, run_id, authority_id, receipt_count,
  head_authority_sequence, head_receipt_digest,
  ordered_record_set_digest, checkpoint_digest, revision,
  PRIMARY KEY(project_session_id,run_id),
  FOREIGN KEY(project_session_id,run_id,checkpoint_digest)
    REFERENCES lifecycle_receipt_scope_checkpoints(
      project_session_id,run_id,checkpoint_digest),
  FOREIGN KEY(project_session_id,run_id,authority_id,receipt_count,
      head_authority_sequence,head_receipt_digest,ordered_record_set_digest,
      checkpoint_digest)
    REFERENCES lifecycle_receipt_scope_checkpoints(
      project_session_id,run_id,authority_id,receipt_count,
      head_authority_sequence,head_receipt_digest,ordered_record_set_digest,
      checkpoint_digest)
)

CREATE TRIGGER lifecycle_scope_admission_resolution_requires_initial_head
BEFORE INSERT ON lifecycle_scope_admission_resolutions
BEGIN
  SELECT RAISE(
    ABORT,'lifecycle-scope-admission-initial-head-missing-or-crossed')
  WHERE NOT EXISTS (
    SELECT 1 FROM lifecycle_receipt_scope_heads h
    WHERE h.project_session_id=NEW.project_session_id AND
      h.run_id=NEW.run_id AND h.authority_id=NEW.authority_id AND
      h.receipt_count=NEW.initial_receipt_count AND
      h.head_authority_sequence=NEW.initial_receipt_count AND
      h.head_receipt_digest IS NEW.initial_head_receipt_digest AND
      h.checkpoint_digest=NEW.initial_scope_checkpoint_digest AND
      h.revision=1
  );
  SELECT RAISE(
    ABORT,'lifecycle-scope-admission-namespace-member-missing-or-crossed')
  WHERE NOT EXISTS (
    SELECT 1 FROM lifecycle_receipt_namespace_members m
    WHERE m.project_id=NEW.project_id AND
      m.checkpoint_digest=NEW.namespace_checkpoint_digest AND
      m.project_session_id=NEW.project_session_id AND
      m.run_id=NEW.run_id AND m.authority_id=NEW.authority_id AND
      m.scope_checkpoint_digest=NEW.initial_scope_checkpoint_digest AND
      m.receipt_count=NEW.initial_receipt_count AND
      m.head_receipt_digest IS NEW.initial_head_receipt_digest
  );
END;

CREATE TRIGGER lifecycle_scope_admission_resolution_no_update
BEFORE UPDATE ON lifecycle_scope_admission_resolutions
BEGIN
  SELECT RAISE(ABORT,'lifecycle-scope-admission-resolution-immutable');
END;

CREATE TRIGGER lifecycle_scope_admission_resolution_no_delete
BEFORE DELETE ON lifecycle_scope_admission_resolutions
BEGIN
  SELECT RAISE(ABORT,'lifecycle-scope-admission-resolution-immutable');
END;

lifecycle_receipt_namespace_checkpoints(
  project_id, authority_id, scope_count CHECK(scope_count >= 1),
  ordered_scope_head_set_digest, checkpoint_json, checkpoint_digest,
  attestation, verified_at,
  PRIMARY KEY(project_id,checkpoint_digest),
  UNIQUE(checkpoint_digest),
  UNIQUE(project_id,checkpoint_digest,authority_id),
  UNIQUE(project_id,authority_id,scope_count,ordered_scope_head_set_digest,
    checkpoint_digest)
)

lifecycle_receipt_namespace_members(
  project_id, checkpoint_digest, ordinal CHECK(ordinal >= 1),
  project_session_id, run_id, authority_id, scope_checkpoint_digest, receipt_count,
  head_receipt_digest,
  PRIMARY KEY(project_id,checkpoint_digest,ordinal),
  UNIQUE(project_id,checkpoint_digest,project_session_id,run_id),
  UNIQUE(project_id,checkpoint_digest,project_session_id,run_id,authority_id,
    scope_checkpoint_digest,receipt_count,head_receipt_digest),
  CHECK(receipt_count >= 0),
  CHECK((receipt_count=0)=(head_receipt_digest IS NULL)),
  FOREIGN KEY(project_id,checkpoint_digest,authority_id)
    REFERENCES lifecycle_receipt_namespace_checkpoints(
      project_id,checkpoint_digest,authority_id),
  FOREIGN KEY(project_id,project_session_id,run_id)
    REFERENCES lifecycle_admitted_run_scopes(
      project_id,project_session_id,run_id),
  FOREIGN KEY(project_session_id,run_id,authority_id,receipt_count,
      scope_checkpoint_digest,head_receipt_digest)
    REFERENCES lifecycle_receipt_scope_checkpoints(
      project_session_id,run_id,authority_id,receipt_count,checkpoint_digest,
      head_receipt_digest)
)

CREATE TRIGGER lifecycle_receipt_namespace_checkpoint_no_update
BEFORE UPDATE ON lifecycle_receipt_namespace_checkpoints
BEGIN
  SELECT RAISE(ABORT,'lifecycle-receipt-namespace-checkpoint-immutable');
END;

CREATE TRIGGER lifecycle_receipt_namespace_checkpoint_no_delete
BEFORE DELETE ON lifecycle_receipt_namespace_checkpoints
BEGIN
  SELECT RAISE(ABORT,'lifecycle-receipt-namespace-checkpoint-immutable');
END;

CREATE TRIGGER lifecycle_receipt_namespace_member_no_update
BEFORE UPDATE ON lifecycle_receipt_namespace_members
BEGIN
  SELECT RAISE(ABORT,'lifecycle-receipt-namespace-member-immutable');
END;

CREATE TRIGGER lifecycle_receipt_namespace_member_no_delete
BEFORE DELETE ON lifecycle_receipt_namespace_members
BEGIN
  SELECT RAISE(ABORT,'lifecycle-receipt-namespace-member-immutable');
END;

CREATE TRIGGER lifecycle_scope_admission_resolution_requires_complete_namespace
BEFORE INSERT ON lifecycle_scope_admission_resolutions
BEGIN
  SELECT RAISE(
    ABORT,'lifecycle-scope-admission-namespace-set-incomplete')
  WHERE NOT EXISTS (
    SELECT 1
    FROM lifecycle_receipt_namespace_checkpoints c
    WHERE c.project_id=NEW.project_id AND
      c.authority_id=NEW.authority_id AND
      c.checkpoint_digest=NEW.namespace_checkpoint_digest AND
      (SELECT COUNT(*)
       FROM lifecycle_receipt_namespace_members m
       WHERE m.project_id=c.project_id AND
         m.checkpoint_digest=c.checkpoint_digest)=c.scope_count AND
      (SELECT MIN(m.ordinal)
       FROM lifecycle_receipt_namespace_members m
       WHERE m.project_id=c.project_id AND
         m.checkpoint_digest=c.checkpoint_digest)=1 AND
      (SELECT MAX(m.ordinal)
       FROM lifecycle_receipt_namespace_members m
       WHERE m.project_id=c.project_id AND
         m.checkpoint_digest=c.checkpoint_digest)=c.scope_count
  );
END;

lifecycle_receipt_namespace_heads(
  project_id PRIMARY KEY, authority_id, scope_count,
  ordered_scope_head_set_digest, checkpoint_digest, head_revision,
  FOREIGN KEY(project_id,authority_id,scope_count,
      ordered_scope_head_set_digest,checkpoint_digest)
    REFERENCES lifecycle_receipt_namespace_checkpoints(
      project_id,authority_id,scope_count,ordered_scope_head_set_digest,
      checkpoint_digest)
)

lifecycle_recovery_retirement_plans(
  retirement_id NOT NULL PRIMARY KEY, revision NOT NULL CHECK(revision=1),
  project_session_id NOT NULL, run_id NOT NULL, agent_id NOT NULL,
  custody_id NOT NULL, custody_revision NOT NULL,
  custody_source_ref_digest NOT NULL, custody_journal_digest NOT NULL,
  finalized_disposition NOT NULL CHECK(finalized_disposition IN
    ('no-effect','superseded','quarantined')),
  finalized_terminal_evidence_digest NOT NULL, admission_digest NOT NULL,
  transition_proof_json NOT NULL, transition_proof_digest NOT NULL,
  mutation_plan_json NOT NULL, mutation_plan_digest NOT NULL,
  retirement_evidence_digest NOT NULL,
  planned_apply_id NOT NULL UNIQUE, recorded_at NOT NULL, plan_json NOT NULL,
  retirement_plan_digest NOT NULL UNIQUE,
  UNIQUE(retirement_id,revision,retirement_plan_digest),
  UNIQUE(retirement_id,retirement_plan_digest,planned_apply_id),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,custody_revision),
  UNIQUE(retirement_id,retirement_plan_digest,planned_apply_id,
    project_session_id,run_id,agent_id,mutation_plan_digest),
  UNIQUE(retirement_id,planned_apply_id,project_session_id,run_id,agent_id,
    custody_id,custody_revision,custody_source_ref_digest,custody_journal_digest,
    finalized_disposition,finalized_terminal_evidence_digest,admission_digest,
    transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
    retirement_plan_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,custody_id,custody_revision,
      finalized_disposition,finalized_terminal_evidence_digest,
      custody_source_ref_digest,custody_journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,disposition_code,
      terminal_evidence_digest,source_ref_digest,journal_digest)
)

lifecycle_receipt_batches(
  batch_id PRIMARY KEY, planned_apply_id UNIQUE,
  project_session_id, run_id, agent_id,
  transition_kind CHECK(transition_kind IN
    ('custody-terminal','generation-loss-terminal',
      'custody-recovery-retirement','fresh-origin')),
  planned_apply_kind NOT NULL CHECK(
    planned_apply_kind IN ('terminal','terminal-fresh','fresh')),
  effects_set_digest, mutation_plan_digest,
  transition_replay_json, transition_replay_digest,
  ordered_subject_set_digest,
  receipt_intent_count CHECK(receipt_intent_count IN (1,2)),
  secondary_intent_kind NOT NULL CHECK(secondary_intent_kind IN
    ('none','fresh-origin','review-adoption-decision')),
  review_adoption_reservation_id, review_adoption_reservation_digest,
  review_decision_loss_effect_key NOT NULL,
  review_decision_loss_effect_role, review_decision_loss_effect_digest,
  review_decision_loss_after_id, review_decision_loss_after_revision,
  review_decision_loss_after_semantic_digest,
  review_decision_loss_after_source_ref_digest,
  fresh_handoff_id, fresh_handoff_digest, fresh_handoff_source_mode,
  fresh_handoff_key NOT NULL,
  recovery_retirement_id, recovery_retirement_plan_digest, created_at,
  UNIQUE(project_session_id,run_id,agent_id,transition_replay_digest),
  UNIQUE(batch_id,planned_apply_id),
  UNIQUE(batch_id,transition_kind,receipt_intent_count),
  UNIQUE(batch_id,transition_kind,receipt_intent_count,secondary_intent_kind),
  UNIQUE(batch_id,transition_kind,planned_apply_kind),
  UNIQUE(batch_id,planned_apply_id,transition_replay_digest,
    mutation_plan_digest),
  UNIQUE(batch_id,project_session_id,run_id),
  UNIQUE(batch_id,project_session_id,run_id,agent_id),
  UNIQUE(batch_id,planned_apply_id,project_session_id,run_id,agent_id),
  UNIQUE(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
    review_adoption_reservation_digest),
  UNIQUE(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
    transition_kind),
  UNIQUE(batch_id,planned_apply_id,transition_replay_digest,
    mutation_plan_digest,fresh_handoff_id,fresh_handoff_digest),
  UNIQUE(batch_id,planned_apply_id,transition_kind,planned_apply_kind,
    transition_replay_digest,mutation_plan_digest,fresh_handoff_key),
  UNIQUE(batch_id,review_decision_loss_effect_role,
    review_decision_loss_effect_digest),
  UNIQUE(batch_id,review_decision_loss_effect_key),
  UNIQUE(batch_id,review_decision_loss_effect_role,
    review_decision_loss_effect_digest,project_session_id,run_id,agent_id,
    review_decision_loss_after_id,review_decision_loss_after_revision,
    review_decision_loss_after_semantic_digest,
    review_decision_loss_after_source_ref_digest),
  UNIQUE(batch_id,review_decision_loss_effect_key,
    review_decision_loss_effect_role,review_decision_loss_effect_digest,
    project_session_id,run_id,agent_id,review_decision_loss_after_id,
    review_decision_loss_after_revision,
    review_decision_loss_after_semantic_digest,
    review_decision_loss_after_source_ref_digest),
  CHECK((review_adoption_reservation_id IS NULL)=
    (review_adoption_reservation_digest IS NULL)),
  CHECK((fresh_handoff_id IS NULL)=(fresh_handoff_digest IS NULL)),
  CHECK((fresh_handoff_id IS NULL)=(fresh_handoff_source_mode IS NULL)),
  CHECK((planned_apply_kind='terminal' AND fresh_handoff_id IS NULL AND
      fresh_handoff_source_mode IS NULL AND fresh_handoff_key='none') OR
    (planned_apply_kind='terminal-fresh' AND
      transition_kind='custody-terminal' AND fresh_handoff_id IS NOT NULL AND
      fresh_handoff_source_mode='terminalize-nonfinal-custody' AND
      fresh_handoff_key=fresh_handoff_digest) OR
    (planned_apply_kind='fresh' AND transition_kind='fresh-origin' AND
      fresh_handoff_id IS NOT NULL AND fresh_handoff_source_mode IN
        ('reuse-final-custody','open-generation-loss') AND
      fresh_handoff_key=fresh_handoff_digest)),
  CHECK((recovery_retirement_id IS NULL)=
    (recovery_retirement_plan_digest IS NULL)),
  CHECK((transition_kind='custody-recovery-retirement')=
    (recovery_retirement_id IS NOT NULL)),
  CHECK(
    (transition_kind='custody-terminal' AND planned_apply_kind='terminal' AND
      secondary_intent_kind='none' AND receipt_intent_count=1 AND
      review_adoption_reservation_id IS NULL) OR
    (transition_kind='custody-terminal' AND planned_apply_kind='terminal' AND
      secondary_intent_kind='review-adoption-decision' AND
      receipt_intent_count=2 AND review_adoption_reservation_id IS NOT NULL) OR
    (transition_kind='custody-terminal' AND
      planned_apply_kind='terminal-fresh' AND
      secondary_intent_kind='fresh-origin' AND receipt_intent_count=2 AND
      review_adoption_reservation_id IS NULL) OR
    (transition_kind='generation-loss-terminal' AND
      planned_apply_kind='terminal' AND secondary_intent_kind='none' AND
      receipt_intent_count=1 AND review_adoption_reservation_id IS NULL) OR
    (transition_kind='custody-recovery-retirement' AND
      planned_apply_kind='terminal' AND secondary_intent_kind='none' AND
      receipt_intent_count=1 AND review_adoption_reservation_id IS NULL) OR
    (transition_kind='fresh-origin' AND planned_apply_kind='fresh' AND
      secondary_intent_kind='none' AND receipt_intent_count=1 AND
      review_adoption_reservation_id IS NULL)),
  CHECK(
    (review_adoption_reservation_id IS NULL AND
      review_decision_loss_effect_key='none' AND
      review_decision_loss_effect_role IS NULL AND
      review_decision_loss_effect_digest IS NULL AND
      review_decision_loss_after_id IS NULL AND
      review_decision_loss_after_revision IS NULL AND
      review_decision_loss_after_semantic_digest IS NULL AND
      review_decision_loss_after_source_ref_digest IS NULL) OR
    (review_adoption_reservation_id IS NOT NULL AND
      review_decision_loss_effect_key='none' AND
      review_decision_loss_effect_role IS NULL AND
      review_decision_loss_effect_digest IS NULL AND
      review_decision_loss_after_id IS NULL AND
      review_decision_loss_after_revision IS NULL AND
      review_decision_loss_after_semantic_digest IS NULL AND
      review_decision_loss_after_source_ref_digest IS NULL) OR
    (review_adoption_reservation_id IS NOT NULL AND
      review_decision_loss_effect_key<>'none' AND
      review_decision_loss_effect_role='linked' AND
      review_decision_loss_effect_digest IS NOT NULL AND
      review_decision_loss_effect_digest=review_decision_loss_effect_key AND
      review_decision_loss_after_id IS NOT NULL AND
      review_decision_loss_after_revision IS NOT NULL AND
      review_decision_loss_after_semantic_digest IS NOT NULL AND
      review_decision_loss_after_source_ref_digest IS NOT NULL)),
  FOREIGN KEY(review_adoption_reservation_id,
      review_adoption_reservation_digest,review_decision_loss_effect_key)
    REFERENCES lifecycle_review_adoption_reservations(
      reservation_id,reservation_digest,decision_loss_effect_key),
  FOREIGN KEY(review_adoption_reservation_id,
      review_adoption_reservation_digest,review_decision_loss_effect_key,
      review_decision_loss_after_id,review_decision_loss_after_revision,
      review_decision_loss_after_semantic_digest,
      review_decision_loss_after_source_ref_digest)
    REFERENCES lifecycle_review_adoption_reservations(
      reservation_id,reservation_digest,decision_loss_effect_key,
      decision_loss_after_id,decision_loss_after_revision,
      decision_loss_after_semantic_digest,decision_loss_after_source_ref_digest),
  FOREIGN KEY(fresh_handoff_id,fresh_handoff_digest,planned_apply_id,
      fresh_handoff_source_mode)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,planned_apply_id,source_mode),
  FOREIGN KEY(recovery_retirement_id,recovery_retirement_plan_digest,
      planned_apply_id,project_session_id,run_id,agent_id,mutation_plan_digest)
    REFERENCES lifecycle_recovery_retirement_plans(
      retirement_id,retirement_plan_digest,planned_apply_id,
      project_session_id,run_id,agent_id,mutation_plan_digest),
  FOREIGN KEY(batch_id,review_decision_loss_effect_role,
      review_decision_loss_effect_digest,project_session_id,run_id,agent_id,
      review_decision_loss_after_id,review_decision_loss_after_revision,
      review_decision_loss_after_semantic_digest,
      review_decision_loss_after_source_ref_digest)
    REFERENCES lifecycle_receipt_generation_loss_effects(
      batch_id,role,effect_digest,project_session_id,run_id,agent_id,
      generation_loss_id,final_revision,final_semantic_digest,
      final_source_ref_digest)
    DEFERRABLE INITIALLY DEFERRED
)

lifecycle_receipt_custody_effects(
  batch_id, ordinal CHECK(ordinal=1), role CHECK(role='primary'),
  transition_kind CHECK(transition_kind='custody-terminal'),
  planned_apply_id, project_session_id, run_id, agent_id, custody_id,
  pre_revision CHECK(pre_revision >= 1), pre_journal_digest,
  final_revision CHECK(final_revision >= 2), final_semantic_digest,
  final_source_ref_digest, effect_digest,
  PRIMARY KEY(batch_id,ordinal), UNIQUE(batch_id), UNIQUE(effect_digest),
  UNIQUE(batch_id,effect_digest),
  UNIQUE(batch_id,effect_digest,project_session_id,run_id,agent_id,custody_id,
    final_revision),
  UNIQUE(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
    custody_id,final_revision,final_semantic_digest,final_source_ref_digest),
  FOREIGN KEY(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind)
    REFERENCES lifecycle_receipt_batches(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind),
  FOREIGN KEY(project_session_id,run_id,agent_id,custody_id,pre_revision,
      pre_journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,journal_digest),
  CHECK(final_revision=pre_revision+1)
)

lifecycle_receipt_generation_loss_effects(
  batch_id, ordinal CHECK(ordinal IN (1,2)),
  role CHECK(role IN ('primary','linked')), planned_apply_id,
  batch_transition_kind,
  project_session_id, run_id, agent_id, generation_loss_id,
  pre_revision CHECK(pre_revision >= 1), pre_journal_digest,
  final_revision CHECK(final_revision >= 2), final_semantic_digest,
  final_source_ref_digest, effect_digest,
  PRIMARY KEY(batch_id,ordinal), UNIQUE(batch_id,role), UNIQUE(effect_digest),
  UNIQUE(batch_id,role,effect_digest),
  UNIQUE(batch_id,role,effect_digest,project_session_id,run_id,agent_id,
    generation_loss_id,final_revision),
  UNIQUE(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
    generation_loss_id,final_revision,final_semantic_digest,
    final_source_ref_digest),
  FOREIGN KEY(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      batch_transition_kind)
    REFERENCES lifecycle_receipt_batches(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      pre_revision,pre_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      journal_digest),
  CHECK(final_revision=pre_revision+1),
  CHECK((role='primary' AND ordinal=1 AND
      batch_transition_kind='generation-loss-terminal') OR
    (role='linked' AND ordinal=2 AND
      batch_transition_kind='custody-terminal'))
)

lifecycle_receipt_recovery_retirement_effects(
  batch_id NOT NULL PRIMARY KEY, ordinal NOT NULL CHECK(ordinal=1),
  role NOT NULL CHECK(role='primary'),
  transition_kind NOT NULL CHECK(transition_kind='custody-recovery-retirement'),
  planned_apply_id NOT NULL, project_session_id NOT NULL, run_id NOT NULL,
  agent_id NOT NULL, retirement_id NOT NULL UNIQUE,
  retirement_revision NOT NULL CHECK(retirement_revision=1),
  retirement_plan_digest NOT NULL,
  custody_id NOT NULL, custody_revision NOT NULL,
  custody_source_ref_digest NOT NULL, custody_journal_digest NOT NULL,
  finalized_disposition NOT NULL,
  finalized_terminal_evidence_digest NOT NULL, admission_digest NOT NULL,
  transition_proof_digest NOT NULL, mutation_plan_digest NOT NULL,
  retirement_evidence_digest NOT NULL,
  effect_digest NOT NULL UNIQUE,
  UNIQUE(batch_id,effect_digest),
  UNIQUE(batch_id,effect_digest,project_session_id,run_id,agent_id,
    retirement_id,retirement_revision),
  UNIQUE(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
    retirement_id,retirement_plan_digest,custody_id,custody_revision,
    custody_source_ref_digest,custody_journal_digest,finalized_disposition,
    finalized_terminal_evidence_digest,admission_digest,
    transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
    effect_digest),
  FOREIGN KEY(batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind)
    REFERENCES lifecycle_receipt_batches(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      transition_kind),
  FOREIGN KEY(retirement_id,planned_apply_id,project_session_id,run_id,agent_id,
      custody_id,custody_revision,custody_source_ref_digest,
      custody_journal_digest,finalized_disposition,
      finalized_terminal_evidence_digest,admission_digest,
      transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
      retirement_plan_digest)
    REFERENCES lifecycle_recovery_retirement_plans(
      retirement_id,planned_apply_id,project_session_id,run_id,agent_id,
      custody_id,custody_revision,custody_source_ref_digest,
      custody_journal_digest,finalized_disposition,
      finalized_terminal_evidence_digest,admission_digest,
      transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
      retirement_plan_digest)
)

lifecycle_receipt_fresh_origin_effects(
  batch_id, ordinal CHECK(ordinal IN (1,2)),
  role CHECK(role IN ('primary','secondary')),
  transition_kind CHECK(transition_kind IN ('custody-terminal','fresh-origin')),
  batch_intent_count, batch_secondary_intent_kind,
  planned_apply_id, project_session_id, run_id, agent_id,
  handoff_id, handoff_digest, source_mode CHECK(source_mode IN
    ('terminalize-nonfinal-custody','reuse-final-custody',
      'open-generation-loss')),
  recovery_source_kind, recovery_from_custody_id, recovery_from_custody_revision,
  recovery_from_generation_loss_id, recovery_from_generation_loss_revision,
  recovery_source_ref_digest, source_journal_digest,
  admission_digest, fresh_apply_plan_digest,
  new_custody_id, new_custody_revision CHECK(new_custody_revision=1),
  new_custody_semantic_digest, new_custody_source_ref_digest,
  affected_generation_loss_id, affected_generation_loss_before_revision,
  affected_generation_loss_before_source_ref_digest,
  affected_generation_loss_before_journal_digest,
  affected_generation_loss_after_revision,
  affected_generation_loss_after_semantic_digest,
  affected_generation_loss_after_source_ref_digest,
  affected_generation_loss_after_key NOT NULL,
  effect_digest UNIQUE,
  PRIMARY KEY(batch_id,ordinal),
  UNIQUE(batch_id,ordinal,role,effect_digest),
  UNIQUE(batch_id,effect_digest,project_session_id,run_id,agent_id,
    new_custody_id,new_custody_revision),
  UNIQUE(batch_id,ordinal,effect_digest,project_session_id,run_id,agent_id,
    new_custody_id,new_custody_revision),
  FOREIGN KEY(batch_id,transition_kind,batch_intent_count,
      batch_secondary_intent_kind)
    REFERENCES lifecycle_receipt_batches(
      batch_id,transition_kind,receipt_intent_count,secondary_intent_kind),
  FOREIGN KEY(handoff_id,handoff_digest,planned_apply_id,project_session_id,
      run_id,agent_id,source_mode,recovery_source_kind,
      recovery_from_custody_id,recovery_from_custody_revision,
      recovery_from_generation_loss_id,recovery_from_generation_loss_revision,
      recovery_source_ref_digest,source_journal_digest,admission_digest,
      fresh_apply_plan_digest,new_custody_id,new_custody_semantic_digest,
      new_custody_source_ref_digest,affected_generation_loss_id,
      affected_generation_loss_before_revision,
      affected_generation_loss_before_source_ref_digest,
      affected_generation_loss_before_journal_digest,
      affected_generation_loss_after_revision,
      affected_generation_loss_after_semantic_digest,
      affected_generation_loss_after_source_ref_digest,
      affected_generation_loss_after_key)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,planned_apply_id,project_session_id,run_id,
      agent_id,source_mode,recovery_source_kind,old_custody_id,
      old_custody_revision,generation_loss_id,generation_loss_revision,
      recovery_source_ref_digest,source_journal_digest,admission_digest,
      fresh_apply_plan_digest,
      new_custody_id,new_custody_semantic_digest,new_custody_source_ref_digest,
      affected_generation_loss_id,affected_generation_loss_before_revision,
      affected_generation_loss_before_source_ref_digest,
      affected_generation_loss_before_journal_digest,
      affected_generation_loss_after_revision,
      affected_generation_loss_after_semantic_digest,
      affected_generation_loss_after_source_ref_digest,
      affected_generation_loss_after_key),
  CHECK((transition_kind='fresh-origin' AND ordinal=1 AND role='primary' AND
      batch_intent_count=1 AND batch_secondary_intent_kind='none' AND
      source_mode IN ('reuse-final-custody','open-generation-loss')) OR
    (transition_kind='custody-terminal' AND ordinal=2 AND role='secondary' AND
      batch_intent_count=2 AND batch_secondary_intent_kind='fresh-origin' AND
      source_mode='terminalize-nonfinal-custody')),
  CHECK((source_mode='terminalize-nonfinal-custody' AND
      recovery_source_kind='custody' AND
      recovery_from_custody_id IS NOT NULL AND
      recovery_from_custody_revision IS NOT NULL AND
      recovery_from_generation_loss_id IS NULL AND
      recovery_from_generation_loss_revision IS NULL) OR
    (source_mode='reuse-final-custody' AND recovery_source_kind='custody' AND
      recovery_from_custody_id IS NOT NULL AND
      recovery_from_custody_revision IS NOT NULL AND
      recovery_from_generation_loss_id IS NULL AND
      recovery_from_generation_loss_revision IS NULL AND
      affected_generation_loss_after_key='none') OR
    (source_mode='open-generation-loss' AND
      recovery_source_kind='generation-loss' AND
      recovery_from_custody_id IS NULL AND
      recovery_from_custody_revision IS NULL AND
      recovery_from_generation_loss_id=affected_generation_loss_id AND
      recovery_from_generation_loss_revision=
        affected_generation_loss_before_revision AND
      affected_generation_loss_after_key<>'none')),
  CHECK((affected_generation_loss_after_key='none' AND
      affected_generation_loss_id IS NULL AND
      affected_generation_loss_before_revision IS NULL AND
      affected_generation_loss_before_source_ref_digest IS NULL AND
      affected_generation_loss_before_journal_digest IS NULL AND
      affected_generation_loss_after_revision IS NULL AND
      affected_generation_loss_after_semantic_digest IS NULL AND
      affected_generation_loss_after_source_ref_digest IS NULL) OR
    (affected_generation_loss_after_key<>'none' AND
      affected_generation_loss_id IS NOT NULL AND
      affected_generation_loss_before_revision IS NOT NULL AND
      affected_generation_loss_before_source_ref_digest IS NOT NULL AND
      affected_generation_loss_before_journal_digest IS NOT NULL AND
      affected_generation_loss_after_revision=
        affected_generation_loss_before_revision+1 AND
      affected_generation_loss_after_semantic_digest IS NOT NULL AND
      affected_generation_loss_after_source_ref_digest=
        affected_generation_loss_after_key))
)

CREATE TRIGGER lifecycle_fresh_origin_effect_requires_exact_handoff
BEFORE INSERT ON lifecycle_receipt_fresh_origin_effects
BEGIN
  SELECT RAISE(
    ABORT,'lifecycle-fresh-origin-effect-handoff-missing-or-crossed')
  WHERE NOT EXISTS (
    SELECT 1 FROM lifecycle_fresh_recovery_handoffs h
    WHERE h.handoff_id=NEW.handoff_id AND
      h.handoff_digest=NEW.handoff_digest AND
      h.planned_apply_id=NEW.planned_apply_id AND
      h.project_session_id=NEW.project_session_id AND
      h.run_id=NEW.run_id AND h.agent_id=NEW.agent_id AND
      h.source_mode=NEW.source_mode AND
      h.recovery_source_kind=NEW.recovery_source_kind AND
      h.old_custody_id IS NEW.recovery_from_custody_id AND
      h.old_custody_revision IS NEW.recovery_from_custody_revision AND
      h.generation_loss_id IS NEW.recovery_from_generation_loss_id AND
      h.generation_loss_revision IS
        NEW.recovery_from_generation_loss_revision AND
      h.recovery_source_ref_digest=NEW.recovery_source_ref_digest AND
      h.source_journal_digest=NEW.source_journal_digest AND
      h.admission_digest=NEW.admission_digest AND
      h.fresh_apply_plan_digest=NEW.fresh_apply_plan_digest AND
      h.new_custody_id=NEW.new_custody_id AND
      h.new_custody_semantic_digest=NEW.new_custody_semantic_digest AND
      h.new_custody_source_ref_digest=NEW.new_custody_source_ref_digest AND
      h.affected_generation_loss_id IS NEW.affected_generation_loss_id AND
      h.affected_generation_loss_before_revision IS
        NEW.affected_generation_loss_before_revision AND
      h.affected_generation_loss_before_source_ref_digest IS
        NEW.affected_generation_loss_before_source_ref_digest AND
      h.affected_generation_loss_before_journal_digest IS
        NEW.affected_generation_loss_before_journal_digest AND
      h.affected_generation_loss_after_revision IS
        NEW.affected_generation_loss_after_revision AND
      h.affected_generation_loss_after_semantic_digest IS
        NEW.affected_generation_loss_after_semantic_digest AND
      h.affected_generation_loss_after_source_ref_digest IS
        NEW.affected_generation_loss_after_source_ref_digest AND
      h.affected_generation_loss_after_key=NEW.affected_generation_loss_after_key
  );
END;

lifecycle_receipt_intents(
  batch_id, ordinal CHECK(ordinal IN (1,2)),
  batch_transition_kind, batch_intent_count, batch_secondary_intent_kind,
  kind CHECK(kind IN ('custody-terminal','generation-loss-terminal',
    'custody-recovery-retirement','fresh-origin','review-adoption-decision')),
  project_session_id, run_id, agent_id,
  subject_owner_kind CHECK(subject_owner_kind IN
    ('custody','generation-loss','recovery-retirement')),
  subject_owner_id, subject_owner_revision CHECK(subject_owner_revision >= 1),
  custody_effect_digest, generation_loss_effect_role,
  generation_loss_effect_digest, recovery_retirement_effect_digest,
  fresh_origin_effect_digest,
  subject_json, subject_digest, intent_digest, created_at,
  PRIMARY KEY(batch_id,ordinal), UNIQUE(intent_digest),
  UNIQUE(intent_digest,batch_id,ordinal,project_session_id,run_id,agent_id,
    kind,subject_owner_kind,subject_owner_id,subject_owner_revision,
    subject_digest),
  UNIQUE(kind,project_session_id,run_id,agent_id,subject_owner_kind,
    subject_owner_id,subject_owner_revision),
  FOREIGN KEY(batch_id,project_session_id,run_id,agent_id)
    REFERENCES lifecycle_receipt_batches(
      batch_id,project_session_id,run_id,agent_id),
  FOREIGN KEY(batch_id,batch_transition_kind,batch_intent_count)
    REFERENCES lifecycle_receipt_batches(
      batch_id,transition_kind,receipt_intent_count),
  FOREIGN KEY(batch_id,batch_transition_kind,batch_intent_count,
      batch_secondary_intent_kind)
    REFERENCES lifecycle_receipt_batches(
      batch_id,transition_kind,receipt_intent_count,secondary_intent_kind),
  FOREIGN KEY(batch_id,custody_effect_digest,project_session_id,run_id,
      agent_id,subject_owner_id,subject_owner_revision)
    REFERENCES lifecycle_receipt_custody_effects(
      batch_id,effect_digest,project_session_id,run_id,agent_id,custody_id,
      final_revision),
  FOREIGN KEY(batch_id,generation_loss_effect_role,
      generation_loss_effect_digest,project_session_id,run_id,agent_id,
      subject_owner_id,subject_owner_revision)
    REFERENCES lifecycle_receipt_generation_loss_effects(
      batch_id,role,effect_digest,project_session_id,run_id,agent_id,
      generation_loss_id,final_revision),
  FOREIGN KEY(batch_id,recovery_retirement_effect_digest,project_session_id,
      run_id,agent_id,subject_owner_id,subject_owner_revision)
    REFERENCES lifecycle_receipt_recovery_retirement_effects(
      batch_id,effect_digest,project_session_id,run_id,agent_id,retirement_id,
      retirement_revision),
  FOREIGN KEY(batch_id,ordinal,fresh_origin_effect_digest,project_session_id,
      run_id,agent_id,subject_owner_id,subject_owner_revision)
    REFERENCES lifecycle_receipt_fresh_origin_effects(
      batch_id,ordinal,effect_digest,project_session_id,run_id,agent_id,
      new_custody_id,new_custody_revision),
  CHECK((ordinal=1 AND kind=batch_transition_kind) OR
    (ordinal=2 AND batch_transition_kind='custody-terminal' AND
      batch_intent_count=2 AND
      kind=batch_secondary_intent_kind AND
      kind IN ('fresh-origin','review-adoption-decision'))),
  CHECK(
    (kind IN ('custody-terminal','review-adoption-decision') AND
      subject_owner_kind='custody' AND custody_effect_digest IS NOT NULL AND
      generation_loss_effect_role IS NULL AND
      generation_loss_effect_digest IS NULL AND
      recovery_retirement_effect_digest IS NULL AND
      fresh_origin_effect_digest IS NULL) OR
    (kind='generation-loss-terminal' AND
      subject_owner_kind='generation-loss' AND
      custody_effect_digest IS NULL AND
      generation_loss_effect_role='primary' AND
      generation_loss_effect_digest IS NOT NULL AND
      recovery_retirement_effect_digest IS NULL AND
      fresh_origin_effect_digest IS NULL) OR
    (kind='custody-recovery-retirement' AND
      subject_owner_kind='recovery-retirement' AND
      custody_effect_digest IS NULL AND
      generation_loss_effect_role IS NULL AND
      generation_loss_effect_digest IS NULL AND
      recovery_retirement_effect_digest IS NOT NULL AND
      fresh_origin_effect_digest IS NULL) OR
    (kind='fresh-origin' AND subject_owner_kind='custody' AND
      custody_effect_digest IS NULL AND generation_loss_effect_role IS NULL AND
      generation_loss_effect_digest IS NULL AND
      recovery_retirement_effect_digest IS NULL AND
      fresh_origin_effect_digest IS NOT NULL))
)

lifecycle_authority_receipts(
  intent_digest PRIMARY KEY, batch_id, ordinal,
  project_session_id, run_id, agent_id, kind, subject_owner_kind,
  subject_owner_id, subject_owner_revision, subject_digest,
  authority_id, authority_sequence CHECK(authority_sequence >= 1),
  previous_authority_sequence, previous_receipt_digest,
  receipt_json, receipt_digest UNIQUE, attestation, verified_at,
  UNIQUE(project_session_id,run_id,authority_id,authority_sequence),
  UNIQUE(project_session_id,run_id,authority_id,authority_sequence,
    receipt_digest),
  UNIQUE(batch_id,ordinal,intent_digest,subject_digest,receipt_digest),
  UNIQUE(receipt_digest,kind,project_session_id,run_id,agent_id,
    subject_owner_kind,subject_owner_id,subject_owner_revision),
  UNIQUE(receipt_digest,intent_digest,batch_id,ordinal,kind,project_session_id,
    run_id,agent_id,subject_owner_kind,subject_owner_id,subject_owner_revision,
    subject_digest),
  UNIQUE(kind,project_session_id,run_id,agent_id,subject_owner_kind,
    subject_owner_id,subject_owner_revision),
  FOREIGN KEY(intent_digest,batch_id,ordinal,project_session_id,run_id,agent_id,
      kind,subject_owner_kind,subject_owner_id,subject_owner_revision,
      subject_digest)
    REFERENCES lifecycle_receipt_intents(
      intent_digest,batch_id,ordinal,project_session_id,run_id,agent_id,kind,
      subject_owner_kind,subject_owner_id,subject_owner_revision,subject_digest),
  FOREIGN KEY(project_session_id,run_id,authority_id)
    REFERENCES lifecycle_admitted_run_scopes(
      project_session_id,run_id,authority_id),
  FOREIGN KEY(project_session_id,run_id,authority_id,
      previous_authority_sequence,previous_receipt_digest)
    REFERENCES lifecycle_authority_receipts(
      project_session_id,run_id,authority_id,authority_sequence,receipt_digest),
  CHECK((authority_sequence=1 AND previous_authority_sequence IS NULL AND
      previous_receipt_digest IS NULL) OR
    (authority_sequence>1 AND
      previous_authority_sequence=authority_sequence-1 AND
      previous_receipt_digest IS NOT NULL))
)

lifecycle_receipt_batch_completions(
  batch_id PRIMARY KEY, transition_kind, receipt_intent_count,
  secondary_intent_kind,
  ordinal_one CHECK(ordinal_one=1), ordinal_one_intent_digest,
  ordinal_one_subject_digest,
  ordinal_one_receipt_digest,
  ordinal_two CHECK(ordinal_two IS NULL OR ordinal_two=2),
  ordinal_two_intent_digest, ordinal_two_subject_digest,
  ordinal_two_receipt_digest,
  primary_custody_effect_digest,
  primary_loss_effect_role CHECK(
    primary_loss_effect_role IS NULL OR primary_loss_effect_role='primary'),
  primary_loss_effect_digest, primary_retirement_effect_digest,
  linked_loss_effect_role CHECK(
    linked_loss_effect_role IS NULL OR linked_loss_effect_role='linked'),
  linked_loss_effect_digest,
  primary_fresh_effect_ordinal, primary_fresh_effect_role,
  primary_fresh_effect_digest,
  secondary_fresh_effect_ordinal, secondary_fresh_effect_role,
  secondary_fresh_effect_digest,
  ordered_authority_receipt_set_digest,
  completion_json, completion_digest UNIQUE, completed_at,
  UNIQUE(batch_id,completion_digest,ordered_authority_receipt_set_digest),
  FOREIGN KEY(batch_id,transition_kind,receipt_intent_count,
      secondary_intent_kind)
    REFERENCES lifecycle_receipt_batches(
      batch_id,transition_kind,receipt_intent_count,secondary_intent_kind),
  FOREIGN KEY(batch_id,ordinal_one,ordinal_one_intent_digest,
      ordinal_one_subject_digest,ordinal_one_receipt_digest)
    REFERENCES lifecycle_authority_receipts(
      batch_id,ordinal,intent_digest,subject_digest,receipt_digest),
  FOREIGN KEY(batch_id,ordinal_two,ordinal_two_intent_digest,
      ordinal_two_subject_digest,ordinal_two_receipt_digest)
    REFERENCES lifecycle_authority_receipts(
      batch_id,ordinal,intent_digest,subject_digest,receipt_digest),
  FOREIGN KEY(batch_id,primary_custody_effect_digest)
    REFERENCES lifecycle_receipt_custody_effects(batch_id,effect_digest),
  FOREIGN KEY(batch_id,primary_loss_effect_role,primary_loss_effect_digest)
    REFERENCES lifecycle_receipt_generation_loss_effects(
      batch_id,role,effect_digest),
  FOREIGN KEY(batch_id,primary_retirement_effect_digest)
    REFERENCES lifecycle_receipt_recovery_retirement_effects(
      batch_id,effect_digest),
  FOREIGN KEY(batch_id,linked_loss_effect_role,linked_loss_effect_digest)
    REFERENCES lifecycle_receipt_generation_loss_effects(
      batch_id,role,effect_digest),
  FOREIGN KEY(batch_id,primary_fresh_effect_ordinal,
      primary_fresh_effect_role,primary_fresh_effect_digest)
    REFERENCES lifecycle_receipt_fresh_origin_effects(
      batch_id,ordinal,role,effect_digest),
  FOREIGN KEY(batch_id,secondary_fresh_effect_ordinal,
      secondary_fresh_effect_role,secondary_fresh_effect_digest)
    REFERENCES lifecycle_receipt_fresh_origin_effects(
      batch_id,ordinal,role,effect_digest),
  CHECK((secondary_intent_kind='none' AND receipt_intent_count=1 AND
      ordinal_two IS NULL AND
      ordinal_two_intent_digest IS NULL AND
      ordinal_two_subject_digest IS NULL AND ordinal_two_receipt_digest IS NULL) OR
    (secondary_intent_kind<>'none' AND receipt_intent_count=2 AND ordinal_two=2 AND
      ordinal_two_intent_digest IS NOT NULL AND
      ordinal_two_subject_digest IS NOT NULL AND
      ordinal_two_receipt_digest IS NOT NULL)),
  CHECK((linked_loss_effect_role IS NULL)=(linked_loss_effect_digest IS NULL)),
  CHECK((transition_kind='custody-terminal' AND
      primary_custody_effect_digest IS NOT NULL AND
      primary_loss_effect_role IS NULL AND primary_loss_effect_digest IS NULL AND
      primary_retirement_effect_digest IS NULL AND
      primary_fresh_effect_ordinal IS NULL AND
      primary_fresh_effect_role IS NULL AND primary_fresh_effect_digest IS NULL AND
      ((secondary_intent_kind='fresh-origin' AND
          secondary_fresh_effect_ordinal=2 AND
          secondary_fresh_effect_role='secondary' AND
          secondary_fresh_effect_digest IS NOT NULL) OR
        (secondary_intent_kind<>'fresh-origin' AND
          secondary_fresh_effect_ordinal IS NULL AND
          secondary_fresh_effect_role IS NULL AND
          secondary_fresh_effect_digest IS NULL))) OR
    (transition_kind='generation-loss-terminal' AND
      primary_custody_effect_digest IS NULL AND
      primary_loss_effect_role='primary' AND
      primary_loss_effect_digest IS NOT NULL AND
      primary_retirement_effect_digest IS NULL AND
      linked_loss_effect_digest IS NULL AND
      primary_fresh_effect_ordinal IS NULL AND
      primary_fresh_effect_role IS NULL AND primary_fresh_effect_digest IS NULL AND
      secondary_fresh_effect_ordinal IS NULL AND
      secondary_fresh_effect_role IS NULL AND
      secondary_fresh_effect_digest IS NULL) OR
    (transition_kind='custody-recovery-retirement' AND
      primary_custody_effect_digest IS NULL AND
      primary_loss_effect_role IS NULL AND primary_loss_effect_digest IS NULL AND
      primary_retirement_effect_digest IS NOT NULL AND
      linked_loss_effect_digest IS NULL AND
      primary_fresh_effect_ordinal IS NULL AND
      primary_fresh_effect_role IS NULL AND primary_fresh_effect_digest IS NULL AND
      secondary_fresh_effect_ordinal IS NULL AND
      secondary_fresh_effect_role IS NULL AND
      secondary_fresh_effect_digest IS NULL) OR
    (transition_kind='fresh-origin' AND
      primary_custody_effect_digest IS NULL AND
      primary_loss_effect_role IS NULL AND primary_loss_effect_digest IS NULL AND
      primary_retirement_effect_digest IS NULL AND
      linked_loss_effect_digest IS NULL AND
      primary_fresh_effect_ordinal=1 AND
      primary_fresh_effect_role='primary' AND
      primary_fresh_effect_digest IS NOT NULL AND
      secondary_fresh_effect_ordinal IS NULL AND
      secondary_fresh_effect_role IS NULL AND
      secondary_fresh_effect_digest IS NULL))
)

lifecycle_review_authority_bindings(
  receipt_digest PRIMARY KEY, intent_digest UNIQUE, batch_id UNIQUE,
  ordinal CHECK(ordinal=2), subject_digest,
  kind CHECK(kind='review-adoption-decision'),
  subject_owner_kind CHECK(subject_owner_kind='custody'),
  project_session_id, run_id, agent_id, custody_id, custody_revision,
  review_reservation_digest, review_decision_digest,
  certification_cut_digest, certification_cut_key,
  decision_loss_after_id, decision_loss_after_revision,
  decision_loss_after_semantic_digest, decision_loss_after_source_ref_digest,
  decision_loss_after_key, decision_loss_effect_key NOT NULL,
  decision_loss_effect_role, decision_loss_effect_digest,
  apply_id UNIQUE,
  UNIQUE(receipt_digest,run_id,agent_id,custody_id,custody_revision,
    review_decision_digest,certification_cut_digest),
  FOREIGN KEY(receipt_digest,intent_digest,batch_id,ordinal,kind,
      project_session_id,run_id,agent_id,subject_owner_kind,custody_id,
      custody_revision,subject_digest)
    REFERENCES lifecycle_authority_receipts(
      receipt_digest,intent_digest,batch_id,ordinal,kind,project_session_id,run_id,
      agent_id,subject_owner_kind,subject_owner_id,subject_owner_revision,
      subject_digest),
  FOREIGN KEY(batch_id,apply_id,project_session_id,run_id,agent_id,
      review_reservation_digest)
    REFERENCES lifecycle_receipt_batches(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      review_adoption_reservation_digest),
  FOREIGN KEY(run_id,agent_id,custody_id,custody_revision)
    REFERENCES lifecycle_rotation_custody_revisions(
      run_id,agent_id,custody_id,revision),
  FOREIGN KEY(review_reservation_digest,project_session_id,run_id,agent_id,
      custody_id,custody_revision,review_decision_digest,certification_cut_key,
      decision_loss_after_key)
    REFERENCES lifecycle_review_adoption_reservations(
      reservation_digest,project_session_id,run_id,agent_id,custody_id,
      finalized_custody_revision,review_decision_digest,certification_cut_key,
      decision_loss_after_key),
  FOREIGN KEY(review_reservation_digest,decision_loss_after_id,
      decision_loss_after_revision,decision_loss_after_semantic_digest,
      decision_loss_after_source_ref_digest)
    REFERENCES lifecycle_review_adoption_reservations(
      reservation_digest,decision_loss_after_id,decision_loss_after_revision,
      decision_loss_after_semantic_digest,decision_loss_after_source_ref_digest),
  FOREIGN KEY(batch_id,decision_loss_effect_key)
    REFERENCES lifecycle_receipt_batches(
      batch_id,review_decision_loss_effect_key),
  FOREIGN KEY(batch_id,decision_loss_effect_key,
      decision_loss_effect_role,decision_loss_effect_digest,
      project_session_id,run_id,agent_id,decision_loss_after_id,
      decision_loss_after_revision,decision_loss_after_semantic_digest,
      decision_loss_after_source_ref_digest)
    REFERENCES lifecycle_receipt_batches(
      batch_id,review_decision_loss_effect_key,
      review_decision_loss_effect_role,review_decision_loss_effect_digest,
      project_session_id,run_id,agent_id,review_decision_loss_after_id,
      review_decision_loss_after_revision,
      review_decision_loss_after_semantic_digest,
      review_decision_loss_after_source_ref_digest),
  FOREIGN KEY(apply_id,batch_id)
    REFERENCES lifecycle_transition_applies(apply_id,receipt_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK(certification_cut_key IS NOT NULL AND
    decision_loss_after_key IS NOT NULL),
  CHECK((certification_cut_digest IS NULL AND certification_cut_key='none') OR
    (certification_cut_digest IS NOT NULL AND
      certification_cut_key=certification_cut_digest)),
  CHECK((decision_loss_after_key='none' AND decision_loss_after_id IS NULL AND
      decision_loss_after_revision IS NULL AND
      decision_loss_after_semantic_digest IS NULL AND
      decision_loss_after_source_ref_digest IS NULL) OR
    (decision_loss_after_key<>'none' AND decision_loss_after_id IS NOT NULL AND
      decision_loss_after_revision IS NOT NULL AND
      decision_loss_after_semantic_digest IS NOT NULL AND
      decision_loss_after_source_ref_digest=decision_loss_after_key)),
  CHECK((decision_loss_effect_key='none' AND
      decision_loss_effect_role IS NULL AND
      decision_loss_effect_digest IS NULL) OR
    (decision_loss_effect_key<>'none' AND
      decision_loss_effect_role='linked' AND
      decision_loss_effect_digest IS NOT NULL AND
      decision_loss_effect_digest=decision_loss_effect_key))
)

lifecycle_receipt_batch_authorizations(
  batch_id PRIMARY KEY, project_session_id, run_id, batch_completion_digest,
  ordered_authority_receipt_set_digest, verified_scope_checkpoint_digest,
  authorized_at, authorization_digest UNIQUE,
  UNIQUE(batch_id,verified_scope_checkpoint_digest),
  UNIQUE(batch_id,ordered_authority_receipt_set_digest,
    verified_scope_checkpoint_digest),
  UNIQUE(batch_id,batch_completion_digest,
    ordered_authority_receipt_set_digest,verified_scope_checkpoint_digest),
  FOREIGN KEY(batch_id,project_session_id,run_id)
    REFERENCES lifecycle_receipt_batches(batch_id,project_session_id,run_id),
  FOREIGN KEY(batch_id,batch_completion_digest,
      ordered_authority_receipt_set_digest)
    REFERENCES lifecycle_receipt_batch_completions(
      batch_id,completion_digest,ordered_authority_receipt_set_digest),
  FOREIGN KEY(project_session_id,run_id,verified_scope_checkpoint_digest)
    REFERENCES lifecycle_receipt_scope_checkpoints(
      project_session_id,run_id,checkpoint_digest)
)

lifecycle_transition_applies(
  apply_id PRIMARY KEY,
  apply_kind CHECK(apply_kind IN ('terminal','terminal-fresh','fresh')),
  batch_transition_kind NOT NULL CHECK(batch_transition_kind IN
    ('custody-terminal','generation-loss-terminal',
      'custody-recovery-retirement','fresh-origin')),
  receipt_batch_id UNIQUE, batch_completion_digest, transition_replay_digest,
  ordered_authority_receipt_set_digest, verified_scope_checkpoint_digest,
  applied_mutation_plan_digest,
  fresh_handoff_id UNIQUE, fresh_handoff_digest, fresh_handoff_key NOT NULL,
  fresh_project_session_id, fresh_run_id, fresh_agent_id, fresh_source_mode,
  fresh_apply_plan_digest, new_custody_id UNIQUE, new_custody_semantic_digest,
  new_custody_source_ref_digest, fresh_generation_loss_id,
  fresh_generation_loss_after_revision,
  fresh_generation_loss_after_semantic_digest,
  fresh_generation_loss_after_source_ref_digest,
  fresh_generation_loss_after_key NOT NULL, local_write_set_digest,
  apply_json, apply_digest UNIQUE, applied_at,
  UNIQUE(apply_id,apply_digest),
  UNIQUE(apply_id,apply_digest,apply_kind),
  UNIQUE(apply_id,receipt_batch_id),
  UNIQUE(apply_id,apply_digest,receipt_batch_id),
  UNIQUE(apply_id,fresh_handoff_id),
  UNIQUE(apply_id,apply_digest,fresh_handoff_id),
  UNIQUE(apply_id,apply_digest,fresh_handoff_id,apply_kind),
  UNIQUE(apply_id,apply_digest,new_custody_id,new_custody_semantic_digest,
    new_custody_source_ref_digest),
  UNIQUE(apply_id,apply_digest,fresh_generation_loss_after_key),
  UNIQUE(apply_id,apply_digest,fresh_project_session_id,fresh_run_id,
    fresh_agent_id,fresh_generation_loss_id,
    fresh_generation_loss_after_revision,
    fresh_generation_loss_after_semantic_digest,
    fresh_generation_loss_after_source_ref_digest),
  FOREIGN KEY(receipt_batch_id,apply_id,batch_transition_kind,apply_kind,
      transition_replay_digest,applied_mutation_plan_digest,fresh_handoff_key)
    REFERENCES lifecycle_receipt_batches(
      batch_id,planned_apply_id,transition_kind,planned_apply_kind,
      transition_replay_digest,mutation_plan_digest,fresh_handoff_key),
  FOREIGN KEY(receipt_batch_id,batch_completion_digest,
      ordered_authority_receipt_set_digest,verified_scope_checkpoint_digest)
    REFERENCES lifecycle_receipt_batch_authorizations(
      batch_id,batch_completion_digest,ordered_authority_receipt_set_digest,
      verified_scope_checkpoint_digest),
  FOREIGN KEY(fresh_handoff_id,fresh_handoff_digest,apply_id,
      fresh_project_session_id,fresh_run_id,fresh_agent_id,fresh_source_mode,
      new_custody_id,
      new_custody_semantic_digest,new_custody_source_ref_digest,
      fresh_apply_plan_digest,fresh_generation_loss_after_key)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,planned_apply_id,project_session_id,run_id,
      agent_id,source_mode,new_custody_id,new_custody_semantic_digest,
      new_custody_source_ref_digest,fresh_apply_plan_digest,
      affected_generation_loss_after_key),
  FOREIGN KEY(fresh_handoff_id,apply_id,fresh_generation_loss_id,
      fresh_generation_loss_after_revision,
      fresh_generation_loss_after_semantic_digest,
      fresh_generation_loss_after_source_ref_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,planned_apply_id,affected_generation_loss_id,
      affected_generation_loss_after_revision,
      affected_generation_loss_after_semantic_digest,
      affected_generation_loss_after_source_ref_digest),
  CHECK((apply_kind='terminal' AND
      batch_transition_kind IN ('custody-terminal','generation-loss-terminal',
        'custody-recovery-retirement') AND receipt_batch_id IS NOT NULL AND
      batch_completion_digest IS NOT NULL AND
      transition_replay_digest IS NOT NULL AND
      ordered_authority_receipt_set_digest IS NOT NULL AND
      verified_scope_checkpoint_digest IS NOT NULL AND
      applied_mutation_plan_digest IS NOT NULL AND fresh_handoff_id IS NULL AND
      fresh_handoff_digest IS NULL AND fresh_handoff_key='none' AND
      fresh_project_session_id IS NULL AND
      fresh_run_id IS NULL AND fresh_agent_id IS NULL AND
      fresh_source_mode IS NULL AND fresh_apply_plan_digest IS NULL AND
      new_custody_id IS NULL AND new_custody_semantic_digest IS NULL AND
      new_custody_source_ref_digest IS NULL AND
      fresh_generation_loss_id IS NULL AND
      fresh_generation_loss_after_revision IS NULL AND
      fresh_generation_loss_after_semantic_digest IS NULL AND
      fresh_generation_loss_after_source_ref_digest IS NULL AND
      fresh_generation_loss_after_key='none') OR
    (apply_kind='terminal-fresh' AND
      batch_transition_kind='custody-terminal' AND receipt_batch_id IS NOT NULL AND
      batch_completion_digest IS NOT NULL AND
      transition_replay_digest IS NOT NULL AND
      ordered_authority_receipt_set_digest IS NOT NULL AND
      verified_scope_checkpoint_digest IS NOT NULL AND
      applied_mutation_plan_digest IS NOT NULL AND fresh_handoff_id IS NOT NULL AND
      fresh_handoff_digest IS NOT NULL AND
      fresh_handoff_key=fresh_handoff_digest AND
      fresh_project_session_id IS NOT NULL AND
      fresh_run_id IS NOT NULL AND fresh_agent_id IS NOT NULL AND
      fresh_source_mode='terminalize-nonfinal-custody' AND
      fresh_apply_plan_digest IS NOT NULL AND
      new_custody_id IS NOT NULL AND new_custody_semantic_digest IS NOT NULL AND
      new_custody_source_ref_digest IS NOT NULL AND
      ((fresh_generation_loss_after_key='none' AND
          fresh_generation_loss_id IS NULL AND
          fresh_generation_loss_after_revision IS NULL AND
          fresh_generation_loss_after_semantic_digest IS NULL AND
          fresh_generation_loss_after_source_ref_digest IS NULL) OR
        (fresh_generation_loss_after_key<>'none' AND
          fresh_generation_loss_id IS NOT NULL AND
          fresh_generation_loss_after_revision IS NOT NULL AND
          fresh_generation_loss_after_semantic_digest IS NOT NULL AND
          fresh_generation_loss_after_source_ref_digest=
            fresh_generation_loss_after_key))) OR
    (apply_kind='fresh' AND batch_transition_kind='fresh-origin' AND
      receipt_batch_id IS NOT NULL AND
      batch_completion_digest IS NOT NULL AND
      transition_replay_digest IS NOT NULL AND
      ordered_authority_receipt_set_digest IS NOT NULL AND
      verified_scope_checkpoint_digest IS NOT NULL AND
      applied_mutation_plan_digest IS NOT NULL AND fresh_handoff_id IS NOT NULL AND
      fresh_handoff_digest IS NOT NULL AND
      fresh_handoff_key=fresh_handoff_digest AND
      fresh_project_session_id IS NOT NULL AND
      fresh_run_id IS NOT NULL AND fresh_agent_id IS NOT NULL AND
      fresh_source_mode IN ('reuse-final-custody','open-generation-loss') AND
      fresh_apply_plan_digest IS NOT NULL AND
      new_custody_id IS NOT NULL AND new_custody_semantic_digest IS NOT NULL AND
      new_custody_source_ref_digest IS NOT NULL AND
      applied_mutation_plan_digest=fresh_apply_plan_digest AND
      ((fresh_source_mode='reuse-final-custody' AND
          fresh_generation_loss_after_key='none' AND
          fresh_generation_loss_id IS NULL AND
          fresh_generation_loss_after_revision IS NULL AND
          fresh_generation_loss_after_semantic_digest IS NULL AND
          fresh_generation_loss_after_source_ref_digest IS NULL) OR
        (fresh_source_mode='open-generation-loss' AND
          fresh_generation_loss_after_key<>'none' AND
          fresh_generation_loss_id IS NOT NULL AND
          fresh_generation_loss_after_revision IS NOT NULL AND
          fresh_generation_loss_after_semantic_digest IS NOT NULL AND
          fresh_generation_loss_after_source_ref_digest=
            fresh_generation_loss_after_key))))
)

lifecycle_review_adoption_reservations(
  reservation_id PRIMARY KEY, reservation_digest UNIQUE,
  project_session_id, run_id, agent_id, custody_id,
  finalized_custody_revision, target_generation,
  predecessor_binding_generation, predecessor_binding_digest,
  terminal_sequence_high_water, lifecycle_adoption_evidence_digest,
  review_decision_json, review_decision_digest,
  certification_cut_json, certification_cut_digest, certification_cut_key,
  recovery_source_kind CHECK(
    recovery_source_kind IN ('none','custody','generation-loss')),
  recovery_from_custody_id, recovery_from_custody_revision,
  recovery_from_generation_loss_id, recovery_from_generation_loss_revision,
  recovery_source_ref_digest,
  decision_loss_after_id, decision_loss_after_revision,
  decision_loss_after_semantic_digest, decision_loss_after_source_ref_digest,
  decision_loss_after_key, decision_loss_effect_key NOT NULL,
  recovery_source_decision_json, recovery_source_decision_digest,
  local_write_set_digest, reservation_json, created_at,
  UNIQUE(reservation_id,reservation_digest),
  UNIQUE(reservation_id,reservation_digest,decision_loss_effect_key),
  UNIQUE(reservation_id,reservation_digest,decision_loss_effect_key,
    decision_loss_after_id,decision_loss_after_revision,
    decision_loss_after_semantic_digest,
    decision_loss_after_source_ref_digest),
  UNIQUE(reservation_digest,project_session_id,run_id,agent_id,custody_id,
    finalized_custody_revision,review_decision_digest,certification_cut_key,
    decision_loss_after_key),
  UNIQUE(reservation_digest,decision_loss_after_id,decision_loss_after_revision,
    decision_loss_after_semantic_digest,decision_loss_after_source_ref_digest),
  UNIQUE(project_session_id,run_id,agent_id,custody_id,
    finalized_custody_revision),
  CHECK(certification_cut_key IS NOT NULL AND
    decision_loss_after_key IS NOT NULL AND
    decision_loss_effect_key IS NOT NULL),
  FOREIGN KEY(project_session_id,run_id,agent_id,custody_id)
    REFERENCES lifecycle_rotation_custodies(
      project_session_id,run_id,agent_id,custody_id),
  CHECK((certification_cut_digest IS NULL AND certification_cut_key='none') OR
    (certification_cut_digest IS NOT NULL AND
      certification_cut_key=certification_cut_digest)),
  CHECK((recovery_source_kind='none' AND
      recovery_from_custody_id IS NULL AND
      recovery_from_custody_revision IS NULL AND
      recovery_from_generation_loss_id IS NULL AND
      recovery_from_generation_loss_revision IS NULL AND
      recovery_source_ref_digest IS NULL AND
      decision_loss_after_id IS NULL AND decision_loss_after_revision IS NULL AND
      decision_loss_after_semantic_digest IS NULL AND
      decision_loss_after_source_ref_digest IS NULL AND
      decision_loss_after_key='none' AND
      decision_loss_effect_key='none' AND
      recovery_source_decision_json IS NULL AND
      recovery_source_decision_digest IS NULL) OR
    (recovery_source_kind='custody' AND
      recovery_from_custody_id IS NOT NULL AND
      recovery_from_custody_revision IS NOT NULL AND
      recovery_from_generation_loss_id IS NULL AND
      recovery_from_generation_loss_revision IS NULL AND
      recovery_source_ref_digest IS NOT NULL AND
      decision_loss_after_id IS NULL AND decision_loss_after_revision IS NULL AND
      decision_loss_after_semantic_digest IS NULL AND
      decision_loss_after_source_ref_digest IS NULL AND
      decision_loss_after_key='none' AND
      decision_loss_effect_key='none' AND
      recovery_source_decision_json IS NOT NULL AND
      recovery_source_decision_digest IS NOT NULL) OR
    (recovery_source_kind='generation-loss' AND
      recovery_from_custody_id IS NULL AND
      recovery_from_custody_revision IS NULL AND
      recovery_from_generation_loss_id IS NOT NULL AND
      recovery_from_generation_loss_revision IS NOT NULL AND
      recovery_source_ref_digest IS NOT NULL AND
      decision_loss_after_id=recovery_from_generation_loss_id AND
      decision_loss_after_revision IS NOT NULL AND
      decision_loss_after_semantic_digest IS NOT NULL AND
      decision_loss_after_source_ref_digest IS NOT NULL AND
      decision_loss_after_key=decision_loss_after_source_ref_digest AND
      decision_loss_effect_key<>'none' AND
      recovery_source_decision_json IS NOT NULL AND
      recovery_source_decision_digest IS NOT NULL)),
  FOREIGN KEY(project_session_id,run_id,agent_id,recovery_from_custody_id,
      recovery_from_custody_revision,recovery_source_ref_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,
      source_ref_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,
      recovery_from_generation_loss_id,recovery_from_generation_loss_revision,
      recovery_source_ref_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,
      revision,source_ref_digest),
  CHECK((decision_loss_effect_key='none')=
    (decision_loss_after_id IS NULL))
)

lifecycle_fresh_rotation_preparations(
  preparation_id PRIMARY KEY, attempt_id UNIQUE, issue_id UNIQUE,
  project_session_id, run_id, agent_id,
  recovery_source_kind CHECK(
    recovery_source_kind IN ('custody','generation-loss')),
  old_custody_id, old_custody_revision,
  generation_loss_id, generation_loss_revision,
  recovery_source_ref_digest, source_journal_digest,
  provider_action_adapter_id, provider_action_id,
  checkpoint_ref, checkpoint_digest, checkpoint_validation_digest,
  checkpoint_validation_key,
  adapter_contract_digest, operation,
  reserved_provider_generation, reserved_principal_generation,
  reserved_bridge_generation, preparation_json, preparation_digest,
  created_at,
  UNIQUE(preparation_id,preparation_digest),
  UNIQUE(preparation_id,attempt_id,issue_id,project_session_id,run_id,agent_id,
    recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
    preparation_digest),
  UNIQUE(preparation_id,attempt_id,issue_id,project_session_id,run_id,agent_id,
    recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
    provider_action_adapter_id,provider_action_id,checkpoint_ref,
    checkpoint_digest,checkpoint_validation_digest,checkpoint_validation_key,
    adapter_contract_digest,
    operation,reserved_provider_generation,reserved_principal_generation,
    reserved_bridge_generation,preparation_digest),
  UNIQUE(preparation_id,attempt_id,issue_id,project_session_id,run_id,agent_id,
    recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
    provider_action_adapter_id,provider_action_id,checkpoint_ref,
    checkpoint_digest,checkpoint_validation_key,adapter_contract_digest,operation,
    reserved_provider_generation,reserved_principal_generation,
    reserved_bridge_generation,preparation_digest),
  UNIQUE(provider_action_adapter_id,provider_action_id),
  FOREIGN KEY(issue_id,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest)
    REFERENCES agent_lifecycle_recovery_capability_issues(
      issue_id,project_session_id,run_id,agent_id,recovery_source_kind,
      recovery_source_ref_digest,source_journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,old_custody_id,
      old_custody_revision,recovery_source_ref_digest,source_journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,
      source_ref_digest,journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      generation_loss_revision,recovery_source_ref_digest,source_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,
      revision,source_ref_digest,journal_digest),
  CHECK((checkpoint_validation_digest IS NULL AND
      checkpoint_validation_key='none') OR
    (checkpoint_validation_digest IS NOT NULL AND
      checkpoint_validation_key=checkpoint_validation_digest)),
  CHECK((recovery_source_kind='custody' AND old_custody_id IS NOT NULL AND
      old_custody_revision IS NOT NULL AND generation_loss_id IS NULL AND
      generation_loss_revision IS NULL) OR
    (recovery_source_kind='generation-loss' AND old_custody_id IS NULL AND
      old_custody_revision IS NULL AND generation_loss_id IS NOT NULL AND
      generation_loss_revision IS NOT NULL))
)

lifecycle_fresh_recovery_handoffs(
  handoff_id PRIMARY KEY, preparation_id UNIQUE, attempt_id UNIQUE,
  preparation_digest, issue_id NOT NULL UNIQUE, project_session_id, run_id,
  agent_id,
  source_mode CHECK(source_mode IN ('terminalize-nonfinal-custody',
    'reuse-final-custody','open-generation-loss')),
  recovery_source_kind CHECK(
    recovery_source_kind IN ('custody','generation-loss')),
  old_custody_id, old_custody_revision,
  generation_loss_id, generation_loss_revision,
  recovery_source_ref_digest, source_journal_digest,
  new_custody_id UNIQUE, planned_apply_id UNIQUE, new_custody_semantic_digest,
  new_custody_source_ref_digest,
  affected_generation_loss_id, affected_generation_loss_before_revision,
  affected_generation_loss_before_state,
  affected_generation_loss_before_source_ref_digest,
  affected_generation_loss_before_journal_digest,
  affected_generation_loss_after_revision,
  affected_generation_loss_after_semantic_digest,
  affected_generation_loss_after_source_ref_digest,
  affected_generation_loss_after_key NOT NULL,
  provider_action_adapter_id, provider_action_id,
  checkpoint_ref, checkpoint_digest, checkpoint_validation_digest,
  checkpoint_validation_key,
  adapter_contract_digest, operation,
  reserved_provider_generation, reserved_principal_generation,
  reserved_bridge_generation, admission_digest,
  fresh_apply_plan_json, fresh_apply_plan_digest,
  handoff_json, handoff_digest UNIQUE, created_at,
  UNIQUE(handoff_id,handoff_digest),
  UNIQUE(handoff_id,handoff_digest,planned_apply_id),
  UNIQUE(handoff_id,handoff_digest,planned_apply_id,source_mode),
  UNIQUE(handoff_id,handoff_digest,affected_generation_loss_after_key),
  UNIQUE(handoff_id,provider_action_adapter_id,provider_action_id),
  UNIQUE(handoff_id,admission_digest,fresh_apply_plan_digest),
  UNIQUE(handoff_id,handoff_digest,project_session_id,run_id,agent_id,
    source_mode,recovery_source_kind,old_custody_id,old_custody_revision,
    generation_loss_id,generation_loss_revision,recovery_source_ref_digest,
    source_journal_digest,new_custody_id,provider_action_adapter_id,
    provider_action_id,checkpoint_ref,checkpoint_digest,
    checkpoint_validation_digest,checkpoint_validation_key,
    adapter_contract_digest,operation,
    reserved_provider_generation,reserved_principal_generation,
    reserved_bridge_generation,admission_digest,fresh_apply_plan_digest),
  UNIQUE(handoff_id,handoff_digest,project_session_id,run_id,agent_id,
    recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
    new_custody_id,provider_action_adapter_id,provider_action_id,checkpoint_ref,
    checkpoint_digest,checkpoint_validation_key,adapter_contract_digest,operation,
    reserved_provider_generation,reserved_principal_generation,
    reserved_bridge_generation,admission_digest,fresh_apply_plan_digest),
  UNIQUE(handoff_id,handoff_digest,planned_apply_id,project_session_id,run_id,
    agent_id,source_mode,new_custody_id,new_custody_semantic_digest,
    new_custody_source_ref_digest,
    fresh_apply_plan_digest,affected_generation_loss_id,
    affected_generation_loss_after_revision,
    affected_generation_loss_after_semantic_digest,
    affected_generation_loss_after_source_ref_digest),
  UNIQUE(handoff_id,planned_apply_id,affected_generation_loss_id,
    affected_generation_loss_after_revision,
    affected_generation_loss_after_semantic_digest,
    affected_generation_loss_after_source_ref_digest),
  UNIQUE(handoff_id,handoff_digest,planned_apply_id,project_session_id,run_id,
    agent_id,source_mode,new_custody_id,new_custody_semantic_digest,
    new_custody_source_ref_digest,fresh_apply_plan_digest,
    affected_generation_loss_after_key),
  UNIQUE(handoff_id,handoff_digest,planned_apply_id,project_session_id,run_id,
    agent_id,source_mode,recovery_source_kind,old_custody_id,
    old_custody_revision,generation_loss_id,generation_loss_revision,
    recovery_source_ref_digest,source_journal_digest,admission_digest,
    fresh_apply_plan_digest,
    new_custody_id,new_custody_semantic_digest,new_custody_source_ref_digest,
    affected_generation_loss_id,affected_generation_loss_before_revision,
    affected_generation_loss_before_source_ref_digest,
    affected_generation_loss_before_journal_digest,
    affected_generation_loss_after_revision,
    affected_generation_loss_after_semantic_digest,
    affected_generation_loss_after_source_ref_digest,
    affected_generation_loss_after_key),
  UNIQUE(handoff_id,preparation_id,attempt_id,issue_id,project_session_id,
    run_id,agent_id,source_mode,recovery_source_kind,recovery_source_ref_digest,
    source_journal_digest,preparation_digest,fresh_apply_plan_digest,
    handoff_digest),
  UNIQUE(provider_action_adapter_id,provider_action_id),
  FOREIGN KEY(issue_id)
    REFERENCES agent_lifecycle_recovery_source_heads(issue_id),
  FOREIGN KEY(preparation_id,attempt_id,issue_id,project_session_id,run_id,
      agent_id,recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest,preparation_digest)
    REFERENCES lifecycle_fresh_rotation_preparations(
      preparation_id,attempt_id,issue_id,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
      preparation_digest),
  FOREIGN KEY(preparation_id,attempt_id,issue_id,project_session_id,run_id,
      agent_id,recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest,provider_action_adapter_id,provider_action_id,
      checkpoint_ref,checkpoint_digest,checkpoint_validation_digest,
      checkpoint_validation_key,
      adapter_contract_digest,operation,reserved_provider_generation,
      reserved_principal_generation,reserved_bridge_generation,
      preparation_digest)
    REFERENCES lifecycle_fresh_rotation_preparations(
      preparation_id,attempt_id,issue_id,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
      provider_action_adapter_id,provider_action_id,checkpoint_ref,
      checkpoint_digest,checkpoint_validation_digest,checkpoint_validation_key,
      adapter_contract_digest,
      operation,reserved_provider_generation,reserved_principal_generation,
      reserved_bridge_generation,preparation_digest),
  FOREIGN KEY(preparation_id,attempt_id,issue_id,project_session_id,run_id,
      agent_id,recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest,provider_action_adapter_id,provider_action_id,
      checkpoint_ref,checkpoint_digest,checkpoint_validation_key,
      adapter_contract_digest,operation,
      reserved_provider_generation,reserved_principal_generation,
      reserved_bridge_generation,preparation_digest)
    REFERENCES lifecycle_fresh_rotation_preparations(
      preparation_id,attempt_id,issue_id,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
      provider_action_adapter_id,provider_action_id,checkpoint_ref,
      checkpoint_digest,checkpoint_validation_key,adapter_contract_digest,operation,
      reserved_provider_generation,reserved_principal_generation,
      reserved_bridge_generation,preparation_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,old_custody_id,
      old_custody_revision,recovery_source_ref_digest,source_journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,
      source_ref_digest,journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      generation_loss_revision,recovery_source_ref_digest,source_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      source_ref_digest,journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,affected_generation_loss_id,
      affected_generation_loss_before_revision,
      affected_generation_loss_before_state,
      affected_generation_loss_before_source_ref_digest,
      affected_generation_loss_before_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      state,source_ref_digest,journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,affected_generation_loss_id,
      affected_generation_loss_before_revision,
      affected_generation_loss_before_state,old_custody_id,
      affected_generation_loss_before_source_ref_digest,
      affected_generation_loss_before_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,state,
      active_recovery_custody_id,source_ref_digest,journal_digest),
  CHECK((checkpoint_validation_digest IS NULL AND
      checkpoint_validation_key='none') OR
    (checkpoint_validation_digest IS NOT NULL AND
      checkpoint_validation_key=checkpoint_validation_digest)),
  CHECK((source_mode='terminalize-nonfinal-custody' AND
      recovery_source_kind='custody' AND
      old_custody_id IS NOT NULL AND old_custody_revision IS NOT NULL AND
      generation_loss_id IS NULL AND generation_loss_revision IS NULL AND
      ((affected_generation_loss_id IS NULL AND
          affected_generation_loss_before_revision IS NULL AND
          affected_generation_loss_before_state IS NULL AND
          affected_generation_loss_before_source_ref_digest IS NULL AND
          affected_generation_loss_before_journal_digest IS NULL AND
          affected_generation_loss_after_revision IS NULL AND
          affected_generation_loss_after_semantic_digest IS NULL AND
          affected_generation_loss_after_source_ref_digest IS NULL AND
          affected_generation_loss_after_key='none') OR
        (affected_generation_loss_id IS NOT NULL AND
          affected_generation_loss_before_revision IS NOT NULL AND
          affected_generation_loss_before_state='recovery-in-progress' AND
          affected_generation_loss_before_source_ref_digest IS NOT NULL AND
          affected_generation_loss_before_journal_digest IS NOT NULL AND
          affected_generation_loss_after_revision=
            affected_generation_loss_before_revision+1 AND
          affected_generation_loss_after_semantic_digest IS NOT NULL AND
          affected_generation_loss_after_source_ref_digest IS NOT NULL AND
          affected_generation_loss_after_key=
            affected_generation_loss_after_source_ref_digest))) OR
    (source_mode='reuse-final-custody' AND recovery_source_kind='custody' AND
      old_custody_id IS NOT NULL AND old_custody_revision IS NOT NULL AND
      generation_loss_id IS NULL AND generation_loss_revision IS NULL AND
      affected_generation_loss_id IS NULL AND
      affected_generation_loss_before_revision IS NULL AND
      affected_generation_loss_before_state IS NULL AND
      affected_generation_loss_before_source_ref_digest IS NULL AND
      affected_generation_loss_before_journal_digest IS NULL AND
      affected_generation_loss_after_revision IS NULL AND
      affected_generation_loss_after_semantic_digest IS NULL AND
      affected_generation_loss_after_source_ref_digest IS NULL AND
      affected_generation_loss_after_key='none') OR
    (source_mode='open-generation-loss' AND
      recovery_source_kind='generation-loss' AND old_custody_id IS NULL AND
      old_custody_revision IS NULL AND generation_loss_id IS NOT NULL AND
      generation_loss_revision IS NOT NULL AND
      affected_generation_loss_id=generation_loss_id AND
      affected_generation_loss_before_revision=generation_loss_revision AND
      affected_generation_loss_before_state='open' AND
      affected_generation_loss_before_source_ref_digest=
        recovery_source_ref_digest AND
      affected_generation_loss_before_journal_digest=source_journal_digest AND
      affected_generation_loss_after_revision=generation_loss_revision+1 AND
      affected_generation_loss_after_semantic_digest IS NOT NULL AND
      affected_generation_loss_after_source_ref_digest IS NOT NULL AND
      affected_generation_loss_after_key=
        affected_generation_loss_after_source_ref_digest))
)

lifecycle_fresh_rotation_commits(
  commit_id PRIMARY KEY, handoff_id UNIQUE, preparation_id UNIQUE,
  handoff_digest, preparation_digest, attempt_id UNIQUE, issue_id UNIQUE,
  project_session_id, run_id, agent_id,
  source_mode, recovery_source_kind, recovery_source_ref_digest,
  source_journal_digest, new_custody_id UNIQUE,
  new_custody_revision CHECK(new_custody_revision=1),
  new_custody_semantic_digest, new_custody_source_ref_digest,
  new_custody_journal_digest,
  generation_loss_after_id, generation_loss_after_revision,
  generation_loss_after_semantic_digest,
  generation_loss_after_source_ref_digest, generation_loss_after_journal_digest,
  generation_loss_after_key NOT NULL,
  provider_action_adapter_id, provider_action_id,
  checkpoint_ref, checkpoint_digest, checkpoint_validation_digest,
  checkpoint_validation_key,
  adapter_contract_digest, operation,
  reserved_provider_generation, reserved_principal_generation,
  reserved_bridge_generation,
  admission_digest, fresh_apply_plan_digest,
  apply_kind CHECK(apply_kind IN ('terminal-fresh','fresh')), fresh_apply_digest,
  source_terminal_receipt_apply_digest, apply_id UNIQUE,
  commit_json, commit_digest UNIQUE, created_at,
  UNIQUE(handoff_id,preparation_id,attempt_id,issue_id,project_session_id,
    run_id,agent_id,source_mode,recovery_source_kind,recovery_source_ref_digest,
    source_journal_digest,preparation_digest,fresh_apply_plan_digest),
  FOREIGN KEY(handoff_id,handoff_digest,generation_loss_after_key)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,affected_generation_loss_after_key),
  FOREIGN KEY(apply_id,fresh_apply_digest,generation_loss_after_key)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,fresh_generation_loss_after_key)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(handoff_id,preparation_id,attempt_id,issue_id,
      project_session_id,run_id,agent_id,source_mode,recovery_source_kind,
      recovery_source_ref_digest,source_journal_digest,preparation_digest,
      fresh_apply_plan_digest,handoff_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,preparation_id,attempt_id,issue_id,project_session_id,run_id,
      agent_id,source_mode,recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest,preparation_digest,fresh_apply_plan_digest,
      handoff_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,new_custody_id,
      new_custody_revision,new_custody_semantic_digest,
      new_custody_source_ref_digest,new_custody_journal_digest,apply_id,
      fresh_apply_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,semantic_digest,
      source_ref_digest,journal_digest,origin_fresh_apply_id,
      origin_fresh_apply_digest),
  FOREIGN KEY(handoff_id,handoff_digest,apply_id,project_session_id,run_id,
      agent_id,source_mode,new_custody_id,new_custody_semantic_digest,
      new_custody_source_ref_digest,fresh_apply_plan_digest,
      generation_loss_after_id,generation_loss_after_revision,
      generation_loss_after_semantic_digest,
      generation_loss_after_source_ref_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,planned_apply_id,project_session_id,run_id,
      agent_id,source_mode,new_custody_id,new_custody_semantic_digest,
      new_custody_source_ref_digest,fresh_apply_plan_digest,
      affected_generation_loss_id,affected_generation_loss_after_revision,
      affected_generation_loss_after_semantic_digest,
      affected_generation_loss_after_source_ref_digest),
  FOREIGN KEY(apply_id,fresh_apply_digest,project_session_id,run_id,agent_id,
      generation_loss_after_id,generation_loss_after_revision,
      generation_loss_after_semantic_digest,
      generation_loss_after_source_ref_digest)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,fresh_project_session_id,fresh_run_id,fresh_agent_id,
      fresh_generation_loss_id,fresh_generation_loss_after_revision,
      fresh_generation_loss_after_semantic_digest,
      fresh_generation_loss_after_source_ref_digest)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_after_id,
      generation_loss_after_revision,generation_loss_after_semantic_digest,
      generation_loss_after_source_ref_digest,
      generation_loss_after_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      semantic_digest,source_ref_digest,journal_digest),
  FOREIGN KEY(handoff_id,provider_action_adapter_id,provider_action_id)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,provider_action_adapter_id,provider_action_id),
  FOREIGN KEY(handoff_id,handoff_digest,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
      new_custody_id,provider_action_adapter_id,provider_action_id,checkpoint_ref,
      checkpoint_digest,checkpoint_validation_key,adapter_contract_digest,operation,
      reserved_provider_generation,reserved_principal_generation,
      reserved_bridge_generation,admission_digest,fresh_apply_plan_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,handoff_digest,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,source_journal_digest,
      new_custody_id,provider_action_adapter_id,provider_action_id,checkpoint_ref,
      checkpoint_digest,checkpoint_validation_key,adapter_contract_digest,operation,
      reserved_provider_generation,reserved_principal_generation,
      reserved_bridge_generation,admission_digest,fresh_apply_plan_digest),
  FOREIGN KEY(handoff_id,admission_digest,fresh_apply_plan_digest)
    REFERENCES lifecycle_fresh_recovery_handoffs(
      handoff_id,admission_digest,fresh_apply_plan_digest),
  FOREIGN KEY(apply_id,handoff_id)
    REFERENCES lifecycle_transition_applies(apply_id,fresh_handoff_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(apply_id,fresh_apply_digest,handoff_id,apply_kind)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,fresh_handoff_id,apply_kind)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(apply_id,source_terminal_receipt_apply_digest,handoff_id)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,fresh_handoff_id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK((checkpoint_validation_digest IS NULL AND
      checkpoint_validation_key='none') OR
    (checkpoint_validation_digest IS NOT NULL AND
      checkpoint_validation_key=checkpoint_validation_digest)),
  CHECK((source_mode='terminalize-nonfinal-custody' AND
      apply_kind='terminal-fresh' AND
      source_terminal_receipt_apply_digest=fresh_apply_digest AND
      ((generation_loss_after_id IS NULL AND
          generation_loss_after_revision IS NULL AND
          generation_loss_after_semantic_digest IS NULL AND
          generation_loss_after_source_ref_digest IS NULL AND
          generation_loss_after_journal_digest IS NULL AND
          generation_loss_after_key='none') OR
        (generation_loss_after_id IS NOT NULL AND
          generation_loss_after_revision IS NOT NULL AND
          generation_loss_after_semantic_digest IS NOT NULL AND
          generation_loss_after_source_ref_digest IS NOT NULL AND
          generation_loss_after_journal_digest IS NOT NULL AND
          generation_loss_after_key=
            generation_loss_after_source_ref_digest))) OR
    (source_mode='reuse-final-custody' AND apply_kind='fresh' AND
      source_terminal_receipt_apply_digest IS NULL AND
      generation_loss_after_id IS NULL AND
      generation_loss_after_revision IS NULL AND
      generation_loss_after_semantic_digest IS NULL AND
      generation_loss_after_source_ref_digest IS NULL AND
      generation_loss_after_journal_digest IS NULL AND
      generation_loss_after_key='none') OR
    (source_mode='open-generation-loss' AND apply_kind='fresh' AND
      source_terminal_receipt_apply_digest IS NULL AND
      generation_loss_after_id IS NOT NULL AND
      generation_loss_after_revision IS NOT NULL AND
      generation_loss_after_semantic_digest IS NOT NULL AND
      generation_loss_after_source_ref_digest IS NOT NULL AND
      generation_loss_after_journal_digest IS NOT NULL AND
      generation_loss_after_key=generation_loss_after_source_ref_digest)),
  CHECK(source_mode IN ('terminalize-nonfinal-custody',
    'reuse-final-custody','open-generation-loss')),
  CHECK(recovery_source_kind IN ('custody','generation-loss'))
)

lifecycle_generation_losses(
  project_session_id, run_id, agent_id, generation_loss_id, loss_kind,
  old_provider_session_ref,
  new_provider_session_ref, old_provider_generation,
  new_provider_generation, old_context_revision, new_context_revision,
  source_custody_action_id, source_adapter_id, source_adapter_contract_digest,
  source_principal_generation, source_bridge_generation, bridge_owner_kind,
  source_bridge_row_id, source_bridge_revision, source_capability_hash,
  source_project_session_generation, source_run_generation,
  source_chair_lease_generation,
  checkpoint_state, checkpoint_ref, checkpoint_digest,
  loss_evidence_digest, creation_json, creation_digest, created_at,
  PRIMARY KEY(run_id,agent_id,generation_loss_id),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id),
  UNIQUE(creation_digest),
  CHECK(loss_kind IN ('generation-advance','context-advance')),
  FOREIGN KEY(source_adapter_id, source_custody_action_id)
    REFERENCES provider_actions(adapter_id,action_id)
)

lifecycle_generation_loss_revisions(
  project_session_id, run_id, agent_id, generation_loss_id,
  revision CHECK(revision >= 1), prior_revision, prior_journal_digest,
  state CHECK(state IN
    ('open','recovery-in-progress','recovered-adopted','abandoned')),
  abandon_kind_code CHECK(
    abandon_kind_code IN ('none','direct-open','recovery-attempt')),
  recovery_action_adapter_id, recovery_action_id, active_recovery_custody_id,
  terminal_evidence_digest, semantic_json, semantic_digest, source_ref_digest,
  origin_fresh_apply_id, origin_fresh_apply_digest,
  receipt_batch_id, receipt_apply_id, receipt_apply_digest,
  journal_json, journal_digest, recorded_at,
  PRIMARY KEY(run_id,agent_id,generation_loss_id,revision),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    source_ref_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    semantic_digest,source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    semantic_digest,source_ref_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,state,
    source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,state,
    active_recovery_custody_id,source_ref_digest,journal_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,
    semantic_digest,source_ref_digest,journal_digest,origin_fresh_apply_id,
    origin_fresh_apply_digest),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id,revision,state,
    abandon_kind_code,recovery_action_adapter_id,recovery_action_id,
    active_recovery_custody_id,semantic_digest,source_ref_digest,journal_digest),
  UNIQUE(semantic_digest), UNIQUE(source_ref_digest), UNIQUE(journal_digest),
  CHECK((revision=1 AND prior_revision IS NULL AND
      prior_journal_digest IS NULL) OR
    (revision>1 AND prior_revision=revision-1 AND
      prior_journal_digest IS NOT NULL)),
  CHECK((receipt_batch_id IS NULL)=(receipt_apply_id IS NULL)),
  CHECK((receipt_batch_id IS NULL)=(receipt_apply_digest IS NULL)),
  CHECK((origin_fresh_apply_id IS NULL)=(origin_fresh_apply_digest IS NULL)),
  CHECK((revision=1 AND state='open' AND receipt_batch_id IS NULL AND
      origin_fresh_apply_id IS NULL) OR
    (revision>1 AND
      ((receipt_batch_id IS NOT NULL AND origin_fresh_apply_id IS NULL) OR
        (receipt_batch_id IS NULL AND origin_fresh_apply_id IS NOT NULL)))),
  CHECK(origin_fresh_apply_id IS NULL OR state='recovery-in-progress'),
  CHECK(state NOT IN ('recovered-adopted','abandoned') OR
    receipt_batch_id IS NOT NULL),
  CHECK((state='open' AND abandon_kind_code='none' AND
      recovery_action_id IS NULL AND active_recovery_custody_id IS NULL AND
      terminal_evidence_digest IS NULL) OR
    (state='recovery-in-progress' AND abandon_kind_code='none' AND
      recovery_action_id IS NOT NULL AND
      active_recovery_custody_id IS NOT NULL AND
      terminal_evidence_digest IS NULL) OR
    (state='recovered-adopted' AND abandon_kind_code='none' AND
      recovery_action_id IS NOT NULL AND
      active_recovery_custody_id IS NOT NULL AND
      terminal_evidence_digest IS NOT NULL) OR
    (state='abandoned' AND abandon_kind_code='direct-open' AND
      recovery_action_id IS NULL AND active_recovery_custody_id IS NULL AND
      terminal_evidence_digest IS NOT NULL) OR
    (state='abandoned' AND abandon_kind_code='recovery-attempt' AND
      recovery_action_id IS NOT NULL AND
      active_recovery_custody_id IS NOT NULL AND
      terminal_evidence_digest IS NOT NULL)),
  CHECK((recovery_action_adapter_id IS NULL)=(recovery_action_id IS NULL)),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id)
    REFERENCES lifecycle_generation_losses(
      project_session_id,run_id,agent_id,generation_loss_id),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      prior_revision,prior_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      journal_digest),
  FOREIGN KEY(recovery_action_adapter_id,recovery_action_id)
    REFERENCES lifecycle_rotation_custodies(
      provider_action_adapter_id,provider_action_id),
  FOREIGN KEY(run_id,agent_id,active_recovery_custody_id)
    REFERENCES lifecycle_rotation_custodies(run_id,agent_id,custody_id),
  FOREIGN KEY(receipt_batch_id,receipt_apply_id,project_session_id,run_id,agent_id,
      generation_loss_id,revision,semantic_digest,source_ref_digest)
    REFERENCES lifecycle_receipt_generation_loss_effects(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,
      generation_loss_id,final_revision,final_semantic_digest,
      final_source_ref_digest)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(receipt_apply_id,receipt_apply_digest,receipt_batch_id)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,receipt_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(receipt_apply_id,receipt_batch_id)
    REFERENCES lifecycle_transition_applies(apply_id,receipt_batch_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(origin_fresh_apply_id,origin_fresh_apply_digest,
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      semantic_digest,source_ref_digest)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,fresh_project_session_id,fresh_run_id,fresh_agent_id,
      fresh_generation_loss_id,fresh_generation_loss_after_revision,
      fresh_generation_loss_after_semantic_digest,
      fresh_generation_loss_after_source_ref_digest)
    DEFERRABLE INITIALLY DEFERRED
)

lifecycle_generation_loss_heads(
  project_session_id, run_id, agent_id, generation_loss_id, current_revision,
  state, abandon_kind_code, recovery_action_adapter_id, recovery_action_id,
  active_recovery_custody_id, semantic_digest, source_ref_digest,
  journal_digest, terminal CHECK(terminal IN (0,1)), head_revision,
  PRIMARY KEY(run_id,agent_id,generation_loss_id),
  UNIQUE(project_session_id,run_id,agent_id,generation_loss_id),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      current_revision,semantic_digest,source_ref_digest,journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      semantic_digest,source_ref_digest,journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      current_revision,state,abandon_kind_code,recovery_action_adapter_id,
      recovery_action_id,active_recovery_custody_id,semantic_digest,
      source_ref_digest,journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,state,
      abandon_kind_code,recovery_action_adapter_id,recovery_action_id,
      active_recovery_custody_id,semantic_digest,source_ref_digest,
      journal_digest),
  CHECK((terminal=1)=(state IN ('recovered-adopted','abandoned')))
)

CREATE UNIQUE INDEX one_nonterminal_generation_loss_per_agent
  ON lifecycle_generation_loss_heads(run_id,agent_id)
  WHERE terminal=0;

lifecycle_custody_adoption_deliveries(
  run_id, agent_id, custody_id, ordinal, delivery_id,
  delivery_generation, recipient_agent_id, source_state, active_owner,
  PRIMARY KEY(run_id, agent_id, custody_id, ordinal),
  UNIQUE(run_id, agent_id, custody_id, delivery_id, delivery_generation),
  FOREIGN KEY(run_id, agent_id, custody_id)
    REFERENCES lifecycle_rotation_custodies(run_id, agent_id, custody_id)
)
CREATE UNIQUE INDEX one_nonfinal_custody_per_delivery_generation
  ON lifecycle_custody_adoption_deliveries(run_id, delivery_id,
    delivery_generation)
  WHERE active_owner = 1;

agent_lifecycle_recovery_capability_issues(
  issue_id, capability_hash, operator_id, project_id, project_session_id, run_id,
  agent_id, session_revision, session_generation, run_revision,
  recovery_source_kind, old_custody_id, old_action_adapter_id, old_action_id,
  old_custody_revision,
  generation_loss_id, generation_loss_revision,
  recovery_source_ref_digest, source_journal_digest,
  checkpoint_digest, source_provider_session_ref, source_capability_hash,
  source_custody_action_id, source_adapter_id, source_adapter_contract_digest,
  source_bridge_row_id, source_bridge_revision, source_provider_generation,
  source_principal_generation, source_bridge_generation,
  source_project_session_generation, source_run_generation,
  source_chair_lease_generation, bridge_owner_kind,
  parent_capability_id, consequential_gate_id,
  path CHECK(path='fresh-rotate'), issuance_json, issuance_digest,
  issued_at, expires_at,
  PRIMARY KEY(issue_id), UNIQUE(capability_hash), UNIQUE(issuance_digest),
  UNIQUE(issue_id,project_session_id,run_id,agent_id,
    recovery_source_kind,recovery_source_ref_digest,source_journal_digest),
  CHECK((recovery_source_kind='custody' AND old_custody_id IS NOT NULL AND
      old_custody_revision IS NOT NULL AND generation_loss_id IS NULL AND
      generation_loss_revision IS NULL) OR
    (recovery_source_kind='generation-loss' AND old_custody_id IS NULL AND
      old_custody_revision IS NULL AND generation_loss_id IS NOT NULL AND
      generation_loss_revision IS NOT NULL)),
  FOREIGN KEY(project_session_id,run_id,agent_id,old_custody_id,
      old_custody_revision,recovery_source_ref_digest,source_journal_digest)
    REFERENCES lifecycle_rotation_custody_revisions(
      project_session_id,run_id,agent_id,custody_id,revision,
      source_ref_digest,journal_digest),
  FOREIGN KEY(project_session_id,run_id,agent_id,generation_loss_id,
      generation_loss_revision,recovery_source_ref_digest,source_journal_digest)
    REFERENCES lifecycle_generation_loss_revisions(
      project_session_id,run_id,agent_id,generation_loss_id,revision,
      source_ref_digest,journal_digest)
)

agent_lifecycle_recovery_source_heads(
  project_session_id NOT NULL, run_id NOT NULL, agent_id NOT NULL,
  recovery_source_kind NOT NULL CHECK(
    recovery_source_kind IN ('custody','generation-loss')),
  recovery_source_ref_digest NOT NULL, issue_id NOT NULL,
  source_journal_digest NOT NULL,
  head_revision NOT NULL CHECK(head_revision >= 1),
  PRIMARY KEY(project_session_id,run_id,agent_id,recovery_source_kind,
    recovery_source_ref_digest),
  UNIQUE(project_session_id,run_id,agent_id,recovery_source_kind,
    recovery_source_ref_digest,issue_id,source_journal_digest),
  UNIQUE(issue_id),
  FOREIGN KEY(issue_id,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest)
    REFERENCES agent_lifecycle_recovery_capability_issues(
      issue_id,project_session_id,run_id,agent_id,
      recovery_source_kind,recovery_source_ref_digest,
      source_journal_digest)
)

agent_lifecycle_recovery_issue_revocations(
  issue_id PRIMARY KEY, revocation_kind CHECK(
    revocation_kind IN ('operator-revoked','source-stale')),
  evidence_digest, revoked_at,
  FOREIGN KEY(issue_id)
    REFERENCES agent_lifecycle_recovery_capability_issues(issue_id)
)

CREATE TRIGGER lifecycle_recovery_issue_claim_source
AFTER INSERT ON agent_lifecycle_recovery_capability_issues
BEGIN
  INSERT INTO agent_lifecycle_recovery_source_heads(
    project_session_id,run_id,agent_id,recovery_source_kind,
    recovery_source_ref_digest,issue_id,source_journal_digest,head_revision)
  SELECT
    NEW.project_session_id,NEW.run_id,NEW.agent_id,NEW.recovery_source_kind,
    NEW.recovery_source_ref_digest,NEW.issue_id,NEW.source_journal_digest,1
  WHERE NOT EXISTS (
    SELECT 1 FROM agent_lifecycle_recovery_source_heads AS head
    WHERE head.project_session_id=NEW.project_session_id
      AND head.run_id=NEW.run_id
      AND head.agent_id=NEW.agent_id
      AND head.recovery_source_kind=NEW.recovery_source_kind
      AND head.recovery_source_ref_digest=NEW.recovery_source_ref_digest);

  UPDATE agent_lifecycle_recovery_source_heads
  SET
    issue_id=NEW.issue_id,
    source_journal_digest=NEW.source_journal_digest,
    head_revision=agent_lifecycle_recovery_source_heads.head_revision+1
  WHERE project_session_id=NEW.project_session_id
    AND run_id=NEW.run_id
    AND agent_id=NEW.agent_id
    AND recovery_source_kind=NEW.recovery_source_kind
    AND recovery_source_ref_digest=NEW.recovery_source_ref_digest
    AND issue_id<>NEW.issue_id
    AND NOT EXISTS (
      SELECT 1 FROM lifecycle_fresh_recovery_handoffs AS handoff
      WHERE handoff.issue_id=
        agent_lifecycle_recovery_source_heads.issue_id)
    AND (
      EXISTS (
        SELECT 1 FROM agent_lifecycle_recovery_issue_revocations AS revocation
        WHERE revocation.issue_id=
          agent_lifecycle_recovery_source_heads.issue_id)
      OR EXISTS (
        SELECT 1
        FROM agent_lifecycle_recovery_capability_issues AS old_issue
        WHERE old_issue.issue_id=
            agent_lifecycle_recovery_source_heads.issue_id
          AND old_issue.expires_at<=NEW.issued_at));

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM agent_lifecycle_recovery_source_heads AS head
    WHERE head.project_session_id=NEW.project_session_id
      AND head.run_id=NEW.run_id
      AND head.agent_id=NEW.agent_id
      AND head.recovery_source_kind=NEW.recovery_source_kind
      AND head.recovery_source_ref_digest=NEW.recovery_source_ref_digest
      AND head.issue_id=NEW.issue_id)
  THEN RAISE(ABORT,'LIFECYCLE_RECOVERY_SOURCE_BUSY') END;
END;

CREATE TRIGGER lifecycle_recovery_source_head_reinsert_denied
BEFORE INSERT ON agent_lifecycle_recovery_source_heads
WHEN EXISTS (
    SELECT 1 FROM agent_lifecycle_recovery_source_heads AS head
    WHERE (head.project_session_id=NEW.project_session_id
        AND head.run_id=NEW.run_id
        AND head.agent_id=NEW.agent_id
        AND head.recovery_source_kind=NEW.recovery_source_kind
        AND head.recovery_source_ref_digest=NEW.recovery_source_ref_digest)
      OR head.issue_id=NEW.issue_id)
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_SOURCE_HEAD_REINSERT_DENIED');
END;

CREATE TRIGGER lifecycle_recovery_source_head_update_guard
BEFORE UPDATE ON agent_lifecycle_recovery_source_heads
WHEN NEW.project_session_id<>OLD.project_session_id
  OR NEW.run_id<>OLD.run_id
  OR NEW.agent_id<>OLD.agent_id
  OR NEW.recovery_source_kind<>OLD.recovery_source_kind
  OR NEW.recovery_source_ref_digest<>OLD.recovery_source_ref_digest
  OR NEW.issue_id=OLD.issue_id
  OR NEW.head_revision<>OLD.head_revision+1
  OR EXISTS (
    SELECT 1 FROM lifecycle_fresh_recovery_handoffs AS handoff
    WHERE handoff.issue_id=OLD.issue_id)
  OR NOT EXISTS (
    SELECT 1
    FROM agent_lifecycle_recovery_capability_issues AS new_issue
    WHERE new_issue.issue_id=NEW.issue_id
      AND new_issue.project_session_id=NEW.project_session_id
      AND new_issue.run_id=NEW.run_id
      AND new_issue.agent_id=NEW.agent_id
      AND new_issue.recovery_source_kind=NEW.recovery_source_kind
      AND new_issue.recovery_source_ref_digest=NEW.recovery_source_ref_digest
      AND new_issue.source_journal_digest=NEW.source_journal_digest)
  OR NOT EXISTS (
    SELECT 1
    FROM agent_lifecycle_recovery_capability_issues AS old_issue
    JOIN agent_lifecycle_recovery_capability_issues AS new_issue
      ON new_issue.issue_id=NEW.issue_id
    WHERE old_issue.issue_id=OLD.issue_id
      AND (new_issue.issued_at>old_issue.issued_at
        OR (new_issue.issued_at=old_issue.issued_at
          AND new_issue.issue_id>old_issue.issue_id)))
  OR EXISTS (
    SELECT 1
    FROM agent_lifecycle_recovery_capability_issues AS later_issue
    JOIN agent_lifecycle_recovery_capability_issues AS new_issue
      ON new_issue.issue_id=NEW.issue_id
    WHERE later_issue.project_session_id=NEW.project_session_id
      AND later_issue.run_id=NEW.run_id
      AND later_issue.agent_id=NEW.agent_id
      AND later_issue.recovery_source_kind=NEW.recovery_source_kind
      AND later_issue.recovery_source_ref_digest=
        NEW.recovery_source_ref_digest
      AND (later_issue.issued_at>new_issue.issued_at
        OR (later_issue.issued_at=new_issue.issued_at
          AND later_issue.issue_id>new_issue.issue_id)))
  OR NOT (
    EXISTS (
      SELECT 1 FROM agent_lifecycle_recovery_issue_revocations AS revocation
      WHERE revocation.issue_id=OLD.issue_id)
    OR EXISTS (
      SELECT 1
      FROM agent_lifecycle_recovery_capability_issues AS old_issue
      JOIN agent_lifecycle_recovery_capability_issues AS new_issue
        ON new_issue.issue_id=NEW.issue_id
      WHERE old_issue.issue_id=OLD.issue_id
        AND old_issue.expires_at<=new_issue.issued_at))
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_SOURCE_BUSY');
END;

CREATE TRIGGER lifecycle_recovery_source_head_delete_guard
BEFORE DELETE ON agent_lifecycle_recovery_source_heads
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_SOURCE_HEAD_DELETE_DENIED');
END;

CREATE TRIGGER lifecycle_recovery_handoff_guard
BEFORE INSERT ON lifecycle_fresh_recovery_handoffs
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM agent_lifecycle_recovery_issue_revocations AS revocation
    WHERE revocation.issue_id=NEW.issue_id)
  THEN RAISE(ABORT,'LIFECYCLE_RECOVERY_ISSUE_REVOKED') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM agent_lifecycle_recovery_capability_issues AS issue
    WHERE issue.issue_id=NEW.issue_id
      AND issue.expires_at<=NEW.created_at)
  THEN RAISE(ABORT,'LIFECYCLE_RECOVERY_ISSUE_EXPIRED') END;
END;

CREATE TRIGGER lifecycle_recovery_handoff_reinsert_denied
BEFORE INSERT ON lifecycle_fresh_recovery_handoffs
WHEN EXISTS (
  SELECT 1 FROM lifecycle_fresh_recovery_handoffs AS handoff
  WHERE handoff.handoff_id=NEW.handoff_id OR handoff.issue_id=NEW.issue_id)
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_HANDOFF_REINSERT_DENIED');
END;

CREATE TRIGGER lifecycle_recovery_revocation_guard
BEFORE INSERT ON agent_lifecycle_recovery_issue_revocations
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM lifecycle_fresh_recovery_handoffs AS handoff
    WHERE handoff.issue_id=NEW.issue_id)
  THEN RAISE(ABORT,'LIFECYCLE_RECOVERY_ISSUE_COMMIT_PENDING') END;
END;

CREATE TRIGGER lifecycle_recovery_revocation_reinsert_denied
BEFORE INSERT ON agent_lifecycle_recovery_issue_revocations
WHEN EXISTS (
  SELECT 1 FROM agent_lifecycle_recovery_issue_revocations AS revocation
  WHERE revocation.issue_id=NEW.issue_id)
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_REVOCATION_REINSERT_DENIED');
END;

CREATE TRIGGER lifecycle_recovery_issue_update_denied
BEFORE UPDATE ON agent_lifecycle_recovery_capability_issues
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_ISSUE_IMMUTABLE');
END;

CREATE TRIGGER lifecycle_recovery_issue_delete_denied
BEFORE DELETE ON agent_lifecycle_recovery_capability_issues
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_ISSUE_IMMUTABLE');
END;

CREATE TRIGGER lifecycle_recovery_handoff_update_denied
BEFORE UPDATE ON lifecycle_fresh_recovery_handoffs
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_HANDOFF_IMMUTABLE');
END;

CREATE TRIGGER lifecycle_recovery_handoff_delete_denied
BEFORE DELETE ON lifecycle_fresh_recovery_handoffs
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_HANDOFF_IMMUTABLE');
END;

CREATE TRIGGER lifecycle_recovery_revocation_update_denied
BEFORE UPDATE ON agent_lifecycle_recovery_issue_revocations
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_REVOCATION_IMMUTABLE');
END;

CREATE TRIGGER lifecycle_recovery_revocation_delete_denied
BEFORE DELETE ON agent_lifecycle_recovery_issue_revocations
BEGIN
  SELECT RAISE(ABORT,'LIFECYCLE_RECOVERY_REVOCATION_IMMUTABLE');
END;

The source-head row is the sole current-issue pointer for one immutable
`(project_session_id,run_id,agent_id,recovery_source_kind,
recovery_source_ref_digest)` source. It does not copy issue clocks. A replacement
may advance the head only when the current issue has no handoff and is revoked,
or its authoritative `expires_at` is at or before the replacement's `issued_at`.
The new issue's canonical `(issued_at,issue_id)` tuple must be strictly greater
than the current tuple, and `head_revision` advances by exactly one. Handoffs
reference `agent_lifecycle_recovery_source_heads(issue_id)`, so an old issue
cannot commit after replacement. Issue, handoff, revocation and source-head rows
are immutable except for that guarded monotonic head advance.
Issue claim uses a plain insert-if-absent followed by the guarded monotonic
`UPDATE`; it never uses UPSERT or `INSERT OR REPLACE`. Existing source heads,
handoffs and revocations reject every colliding insert before SQLite can apply
replacement semantics, independently of `recursive_triggers`.

Every issue, handoff and revocation writer uses `BEGIN IMMEDIATE` before its
first read or write and retains the writer transaction through commit. This
makes the claim, replacement, handoff and revocation guards observe the prior
committed winner rather than independently accepting crossed decisions.

agent_lifecycle_recovery_retirements(
  retirement_id NOT NULL PRIMARY KEY, project_session_id NOT NULL,
  run_id NOT NULL, agent_id NOT NULL, retirement_plan_digest NOT NULL,
  custody_id NOT NULL, custody_revision NOT NULL,
  custody_source_ref_digest NOT NULL, custody_journal_digest NOT NULL,
  finalized_disposition NOT NULL,
  finalized_terminal_evidence_digest NOT NULL, admission_digest NOT NULL,
  transition_proof_digest NOT NULL, mutation_plan_digest NOT NULL,
  retirement_evidence_digest NOT NULL,
  retirement_effect_digest NOT NULL,
  receipt_batch_id NOT NULL UNIQUE, receipt_apply_id NOT NULL UNIQUE,
  receipt_apply_digest NOT NULL, retirement_json NOT NULL,
  retirement_digest NOT NULL UNIQUE, created_at NOT NULL,
  UNIQUE(retirement_id,receipt_batch_id,receipt_apply_id,receipt_apply_digest),
  UNIQUE(retirement_digest),
  FOREIGN KEY(retirement_id,receipt_apply_id,project_session_id,run_id,agent_id,
      custody_id,custody_revision,custody_source_ref_digest,
      custody_journal_digest,finalized_disposition,
      finalized_terminal_evidence_digest,admission_digest,
      transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
      retirement_plan_digest)
    REFERENCES lifecycle_recovery_retirement_plans(
      retirement_id,planned_apply_id,project_session_id,run_id,agent_id,
      custody_id,custody_revision,custody_source_ref_digest,
      custody_journal_digest,finalized_disposition,
      finalized_terminal_evidence_digest,admission_digest,
      transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
      retirement_plan_digest),
  FOREIGN KEY(receipt_batch_id,receipt_apply_id,project_session_id,run_id,agent_id,
      retirement_id,retirement_plan_digest,custody_id,custody_revision,
      custody_source_ref_digest,custody_journal_digest,finalized_disposition,
      finalized_terminal_evidence_digest,admission_digest,
      transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
      retirement_effect_digest)
    REFERENCES lifecycle_receipt_recovery_retirement_effects(
      batch_id,planned_apply_id,project_session_id,run_id,agent_id,retirement_id,
      retirement_plan_digest,custody_id,custody_revision,
      custody_source_ref_digest,custody_journal_digest,finalized_disposition,
      finalized_terminal_evidence_digest,admission_digest,
      transition_proof_digest,mutation_plan_digest,retirement_evidence_digest,
      effect_digest),
  FOREIGN KEY(receipt_apply_id,receipt_apply_digest,receipt_batch_id)
    REFERENCES lifecycle_transition_applies(
      apply_id,apply_digest,receipt_batch_id)
    DEFERRABLE INITIALLY DEFERRED
)

CREATE TRIGGER lifecycle_completion_effect_set_exact
BEFORE INSERT ON lifecycle_receipt_batch_completions
BEGIN
  SELECT RAISE(ABORT,'lifecycle-effect-set-incomplete')
  WHERE NOT (
    (NEW.transition_kind='custody-terminal' AND
      NEW.primary_custody_effect_digest IS NOT NULL AND
      NEW.primary_loss_effect_role IS NULL AND
      NEW.primary_loss_effect_digest IS NULL AND
      NEW.primary_retirement_effect_digest IS NULL AND
      (SELECT count(*) FROM lifecycle_receipt_custody_effects
        WHERE batch_id=NEW.batch_id)=1 AND
      EXISTS (SELECT 1 FROM lifecycle_receipt_custody_effects
        WHERE batch_id=NEW.batch_id AND
          effect_digest=NEW.primary_custody_effect_digest) AND
      (SELECT count(*) FROM lifecycle_receipt_recovery_retirement_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      ((NEW.secondary_fresh_effect_digest IS NULL AND
          (SELECT count(*) FROM lifecycle_receipt_fresh_origin_effects
            WHERE batch_id=NEW.batch_id)=0) OR
        (NEW.secondary_fresh_effect_ordinal=2 AND
          NEW.secondary_fresh_effect_role='secondary' AND
          NEW.secondary_fresh_effect_digest IS NOT NULL AND
          (SELECT count(*) FROM lifecycle_receipt_fresh_origin_effects
            WHERE batch_id=NEW.batch_id)=1 AND
          EXISTS (SELECT 1 FROM lifecycle_receipt_fresh_origin_effects
            WHERE batch_id=NEW.batch_id AND ordinal=2 AND role='secondary' AND
              effect_digest=NEW.secondary_fresh_effect_digest))) AND
      ((NEW.linked_loss_effect_role IS NULL AND
          NEW.linked_loss_effect_digest IS NULL AND
          (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects
            WHERE batch_id=NEW.batch_id)=0) OR
        (NEW.linked_loss_effect_role='linked' AND
          NEW.linked_loss_effect_digest IS NOT NULL AND
          (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects
            WHERE batch_id=NEW.batch_id)=1 AND
          EXISTS (SELECT 1 FROM lifecycle_receipt_generation_loss_effects
            WHERE batch_id=NEW.batch_id AND role='linked' AND
              effect_digest=NEW.linked_loss_effect_digest)))) OR
    (NEW.transition_kind='generation-loss-terminal' AND
      NEW.primary_custody_effect_digest IS NULL AND
      NEW.primary_loss_effect_role='primary' AND
      NEW.primary_loss_effect_digest IS NOT NULL AND
      NEW.primary_retirement_effect_digest IS NULL AND
      NEW.linked_loss_effect_role IS NULL AND
      NEW.linked_loss_effect_digest IS NULL AND
      (SELECT count(*) FROM lifecycle_receipt_custody_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects
        WHERE batch_id=NEW.batch_id)=1 AND
      EXISTS (SELECT 1 FROM lifecycle_receipt_generation_loss_effects
        WHERE batch_id=NEW.batch_id AND role='primary' AND
          effect_digest=NEW.primary_loss_effect_digest) AND
      (SELECT count(*) FROM lifecycle_receipt_recovery_retirement_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_fresh_origin_effects
        WHERE batch_id=NEW.batch_id)=0) OR
    (NEW.transition_kind='custody-recovery-retirement' AND
      NEW.primary_custody_effect_digest IS NULL AND
      NEW.primary_loss_effect_role IS NULL AND
      NEW.primary_loss_effect_digest IS NULL AND
      NEW.primary_retirement_effect_digest IS NOT NULL AND
      NEW.linked_loss_effect_role IS NULL AND
      NEW.linked_loss_effect_digest IS NULL AND
      (SELECT count(*) FROM lifecycle_receipt_custody_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_recovery_retirement_effects
        WHERE batch_id=NEW.batch_id)=1 AND
      EXISTS (SELECT 1 FROM lifecycle_receipt_recovery_retirement_effects
        WHERE batch_id=NEW.batch_id AND
          effect_digest=NEW.primary_retirement_effect_digest) AND
      (SELECT count(*) FROM lifecycle_receipt_fresh_origin_effects
        WHERE batch_id=NEW.batch_id)=0) OR
    (NEW.transition_kind='fresh-origin' AND
      NEW.primary_custody_effect_digest IS NULL AND
      NEW.primary_loss_effect_role IS NULL AND
      NEW.primary_loss_effect_digest IS NULL AND
      NEW.primary_retirement_effect_digest IS NULL AND
      NEW.linked_loss_effect_role IS NULL AND
      NEW.linked_loss_effect_digest IS NULL AND
      NEW.primary_fresh_effect_ordinal=1 AND
      NEW.primary_fresh_effect_role='primary' AND
      NEW.primary_fresh_effect_digest IS NOT NULL AND
      NEW.secondary_fresh_effect_ordinal IS NULL AND
      NEW.secondary_fresh_effect_role IS NULL AND
      NEW.secondary_fresh_effect_digest IS NULL AND
      (SELECT count(*) FROM lifecycle_receipt_custody_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_generation_loss_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_recovery_retirement_effects
        WHERE batch_id=NEW.batch_id)=0 AND
      (SELECT count(*) FROM lifecycle_receipt_fresh_origin_effects
        WHERE batch_id=NEW.batch_id)=1 AND
      EXISTS (SELECT 1 FROM lifecycle_receipt_fresh_origin_effects
        WHERE batch_id=NEW.batch_id AND ordinal=1 AND role='primary' AND
          effect_digest=NEW.primary_fresh_effect_digest))
  );
END;

CREATE TRIGGER lifecycle_custody_effect_set_closed
BEFORE INSERT ON lifecycle_receipt_custody_effects
BEGIN
  SELECT RAISE(ABORT,'lifecycle-effect-set-closed')
  WHERE EXISTS (SELECT 1 FROM lifecycle_receipt_batch_completions
    WHERE batch_id=NEW.batch_id);
END;

CREATE TRIGGER lifecycle_loss_effect_set_closed
BEFORE INSERT ON lifecycle_receipt_generation_loss_effects
BEGIN
  SELECT RAISE(ABORT,'lifecycle-effect-set-closed')
  WHERE EXISTS (SELECT 1 FROM lifecycle_receipt_batch_completions
    WHERE batch_id=NEW.batch_id);
END;

CREATE TRIGGER lifecycle_retirement_effect_set_closed
BEFORE INSERT ON lifecycle_receipt_recovery_retirement_effects
BEGIN
  SELECT RAISE(ABORT,'lifecycle-effect-set-closed')
  WHERE EXISTS (SELECT 1 FROM lifecycle_receipt_batch_completions
    WHERE batch_id=NEW.batch_id);
END;

CREATE TRIGGER lifecycle_fresh_origin_effect_set_closed
BEFORE INSERT ON lifecycle_receipt_fresh_origin_effects
BEGIN
  SELECT RAISE(ABORT,'lifecycle-effect-set-closed')
  WHERE EXISTS (SELECT 1 FROM lifecycle_receipt_batch_completions
    WHERE batch_id=NEW.batch_id);
END;

CREATE TRIGGER lifecycle_apply_post_state_complete
BEFORE INSERT ON lifecycle_transition_applies
BEGIN
  SELECT RAISE(ABORT,'lifecycle-apply-post-state-incomplete')
  WHERE NOT (
    (NEW.apply_kind='terminal' AND
      NEW.batch_transition_kind='custody-terminal' AND
      EXISTS (
        SELECT 1
        FROM lifecycle_receipt_custody_effects e
        JOIN lifecycle_rotation_custody_revisions r
          ON r.project_session_id=e.project_session_id AND
             r.run_id=e.run_id AND r.agent_id=e.agent_id AND
             r.custody_id=e.custody_id AND r.revision=e.final_revision AND
             r.semantic_digest=e.final_semantic_digest AND
             r.source_ref_digest=e.final_source_ref_digest AND
             r.receipt_batch_id=e.batch_id AND
             r.receipt_apply_id=NEW.apply_id AND
             r.receipt_apply_digest=NEW.apply_digest
        JOIN lifecycle_rotation_custody_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.custody_id=r.custody_id AND h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE e.batch_id=NEW.receipt_batch_id
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_receipt_batch_completions c
        WHERE c.batch_id=NEW.receipt_batch_id AND
          ((c.linked_loss_effect_role IS NULL AND
              c.linked_loss_effect_digest IS NULL AND
              NOT EXISTS (
                SELECT 1 FROM lifecycle_receipt_generation_loss_effects e
                WHERE e.batch_id=c.batch_id AND e.role='linked'
              )) OR
            (c.linked_loss_effect_role='linked' AND
              c.linked_loss_effect_digest IS NOT NULL AND EXISTS (
                SELECT 1
                FROM lifecycle_receipt_generation_loss_effects e
                JOIN lifecycle_generation_loss_revisions r
                  ON r.project_session_id=e.project_session_id AND
                     r.run_id=e.run_id AND r.agent_id=e.agent_id AND
                     r.generation_loss_id=e.generation_loss_id AND
                     r.revision=e.final_revision AND
                     r.semantic_digest=e.final_semantic_digest AND
                     r.source_ref_digest=e.final_source_ref_digest AND
                     r.receipt_batch_id=e.batch_id AND
                     r.receipt_apply_id=NEW.apply_id AND
                     r.receipt_apply_digest=NEW.apply_digest
                JOIN lifecycle_generation_loss_heads h
                  ON h.project_session_id=r.project_session_id AND
                     h.run_id=r.run_id AND h.agent_id=r.agent_id AND
                     h.generation_loss_id=r.generation_loss_id AND
                     h.current_revision=r.revision AND
                     h.semantic_digest=r.semantic_digest AND
                     h.source_ref_digest=r.source_ref_digest AND
                     h.journal_digest=r.journal_digest
                WHERE e.batch_id=c.batch_id AND e.role='linked' AND
                  e.effect_digest=c.linked_loss_effect_digest
              )))
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_receipt_batches b
        WHERE b.batch_id=NEW.receipt_batch_id AND
          ((b.review_adoption_reservation_id IS NULL AND NOT EXISTS (
              SELECT 1 FROM lifecycle_review_authority_bindings v
              WHERE v.batch_id=b.batch_id
            )) OR
            (b.review_adoption_reservation_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM lifecycle_review_authority_bindings v
              WHERE v.batch_id=b.batch_id AND v.apply_id=NEW.apply_id AND
                v.review_reservation_digest=
                  b.review_adoption_reservation_digest
            )))
      )) OR
    (NEW.apply_kind='terminal' AND
      NEW.batch_transition_kind='generation-loss-terminal' AND EXISTS (
        SELECT 1
        FROM lifecycle_receipt_generation_loss_effects e
        JOIN lifecycle_generation_loss_revisions r
          ON r.project_session_id=e.project_session_id AND
             r.run_id=e.run_id AND r.agent_id=e.agent_id AND
             r.generation_loss_id=e.generation_loss_id AND
             r.revision=e.final_revision AND
             r.semantic_digest=e.final_semantic_digest AND
             r.source_ref_digest=e.final_source_ref_digest AND
             r.receipt_batch_id=e.batch_id AND
             r.receipt_apply_id=NEW.apply_id AND
             r.receipt_apply_digest=NEW.apply_digest
        JOIN lifecycle_generation_loss_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.generation_loss_id=r.generation_loss_id AND
             h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE e.batch_id=NEW.receipt_batch_id AND e.role='primary'
      )) OR
    (NEW.apply_kind='terminal' AND
      NEW.batch_transition_kind='custody-recovery-retirement' AND EXISTS (
        SELECT 1
        FROM lifecycle_receipt_recovery_retirement_effects e
        JOIN agent_lifecycle_recovery_retirements r
          ON r.retirement_id=e.retirement_id AND
             r.receipt_batch_id=e.batch_id AND
             r.receipt_apply_id=NEW.apply_id AND
             r.receipt_apply_digest=NEW.apply_digest AND
             r.retirement_effect_digest=e.effect_digest
        WHERE e.batch_id=NEW.receipt_batch_id
      )) OR
    (NEW.apply_kind='terminal-fresh' AND
      NEW.batch_transition_kind='custody-terminal' AND
      EXISTS (
        SELECT 1
        FROM lifecycle_receipt_custody_effects e
        JOIN lifecycle_rotation_custody_revisions r
          ON r.project_session_id=e.project_session_id AND
             r.run_id=e.run_id AND r.agent_id=e.agent_id AND
             r.custody_id=e.custody_id AND r.revision=e.final_revision AND
             r.semantic_digest=e.final_semantic_digest AND
             r.source_ref_digest=e.final_source_ref_digest AND
             r.receipt_batch_id=e.batch_id AND
             r.receipt_apply_id=NEW.apply_id AND
             r.receipt_apply_digest=NEW.apply_digest
        JOIN lifecycle_rotation_custody_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.custody_id=r.custody_id AND h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE e.batch_id=NEW.receipt_batch_id
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_receipt_batch_completions c
        WHERE c.batch_id=NEW.receipt_batch_id AND
          ((c.linked_loss_effect_role IS NULL AND
              c.linked_loss_effect_digest IS NULL AND
              NEW.fresh_generation_loss_after_key='none' AND
              NOT EXISTS (
                SELECT 1 FROM lifecycle_receipt_generation_loss_effects e
                WHERE e.batch_id=c.batch_id AND e.role='linked'
              )) OR
            (c.linked_loss_effect_role='linked' AND
              c.linked_loss_effect_digest IS NOT NULL AND
              NEW.fresh_generation_loss_after_key<>'none' AND EXISTS (
                SELECT 1
                FROM lifecycle_receipt_generation_loss_effects e
                JOIN lifecycle_generation_loss_revisions r
                  ON r.project_session_id=e.project_session_id AND
                     r.run_id=e.run_id AND r.agent_id=e.agent_id AND
                     r.generation_loss_id=e.generation_loss_id AND
                     r.revision=e.final_revision AND
                     r.semantic_digest=e.final_semantic_digest AND
                     r.source_ref_digest=e.final_source_ref_digest AND
                     r.receipt_batch_id=e.batch_id AND
                     r.receipt_apply_id=NEW.apply_id AND
                     r.receipt_apply_digest=NEW.apply_digest
                JOIN lifecycle_generation_loss_heads h
                  ON h.project_session_id=r.project_session_id AND
                     h.run_id=r.run_id AND h.agent_id=r.agent_id AND
                     h.generation_loss_id=r.generation_loss_id AND
                     h.current_revision=r.revision AND
                     h.semantic_digest=r.semantic_digest AND
                     h.source_ref_digest=r.source_ref_digest AND
                     h.journal_digest=r.journal_digest
                WHERE e.batch_id=c.batch_id AND e.role='linked' AND
                  e.effect_digest=c.linked_loss_effect_digest AND
                  e.project_session_id=NEW.fresh_project_session_id AND
                  e.run_id=NEW.fresh_run_id AND
                  e.agent_id=NEW.fresh_agent_id AND
                  e.generation_loss_id=NEW.fresh_generation_loss_id AND
                  e.final_revision=NEW.fresh_generation_loss_after_revision AND
                  e.final_semantic_digest=
                    NEW.fresh_generation_loss_after_semantic_digest AND
                  e.final_source_ref_digest=
                    NEW.fresh_generation_loss_after_source_ref_digest
              )))
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_receipt_batches b
        WHERE b.batch_id=NEW.receipt_batch_id AND
          ((b.review_adoption_reservation_id IS NULL AND NOT EXISTS (
              SELECT 1 FROM lifecycle_review_authority_bindings v
              WHERE v.batch_id=b.batch_id
            )) OR
            (b.review_adoption_reservation_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM lifecycle_review_authority_bindings v
              WHERE v.batch_id=b.batch_id AND v.apply_id=NEW.apply_id AND
                v.review_reservation_digest=
                  b.review_adoption_reservation_digest
            )))
      ) AND
      EXISTS (
        SELECT 1
        FROM lifecycle_rotation_custody_revisions r
        JOIN lifecycle_rotation_custody_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.custody_id=r.custody_id AND h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE r.project_session_id=NEW.fresh_project_session_id AND
          r.run_id=NEW.fresh_run_id AND r.agent_id=NEW.fresh_agent_id AND
          r.custody_id=NEW.new_custody_id AND r.revision=1 AND
          r.semantic_digest=NEW.new_custody_semantic_digest AND
          r.source_ref_digest=NEW.new_custody_source_ref_digest AND
          r.origin_fresh_apply_id=NEW.apply_id AND
          r.origin_fresh_apply_digest=NEW.apply_digest
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_fresh_rotation_commits c
        WHERE c.handoff_id=NEW.fresh_handoff_id AND
          c.apply_id=NEW.apply_id AND
          c.fresh_apply_digest=NEW.apply_digest AND
          c.new_custody_id=NEW.new_custody_id AND
          c.generation_loss_after_id IS NEW.fresh_generation_loss_id AND
          c.generation_loss_after_revision IS
            NEW.fresh_generation_loss_after_revision AND
          c.generation_loss_after_semantic_digest IS
            NEW.fresh_generation_loss_after_semantic_digest AND
          c.generation_loss_after_source_ref_digest IS
            NEW.fresh_generation_loss_after_source_ref_digest
      )) OR
    (NEW.apply_kind='fresh' AND
      NEW.fresh_source_mode='reuse-final-custody' AND
      EXISTS (
        SELECT 1
        FROM lifecycle_rotation_custody_revisions r
        JOIN lifecycle_rotation_custody_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.custody_id=r.custody_id AND h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE r.project_session_id=NEW.fresh_project_session_id AND
          r.run_id=NEW.fresh_run_id AND r.agent_id=NEW.fresh_agent_id AND
          r.custody_id=NEW.new_custody_id AND r.revision=1 AND
          r.semantic_digest=NEW.new_custody_semantic_digest AND
          r.source_ref_digest=NEW.new_custody_source_ref_digest AND
          r.origin_fresh_apply_id=NEW.apply_id AND
          r.origin_fresh_apply_digest=NEW.apply_digest
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_fresh_rotation_commits c
        WHERE c.handoff_id=NEW.fresh_handoff_id AND
          c.apply_id=NEW.apply_id AND
          c.fresh_apply_digest=NEW.apply_digest AND
          c.new_custody_id=NEW.new_custody_id AND
          c.generation_loss_after_id IS NULL
      )) OR
    (NEW.apply_kind='fresh' AND
      NEW.fresh_source_mode='open-generation-loss' AND
      EXISTS (
        SELECT 1
        FROM lifecycle_rotation_custody_revisions r
        JOIN lifecycle_rotation_custody_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.custody_id=r.custody_id AND h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE r.project_session_id=NEW.fresh_project_session_id AND
          r.run_id=NEW.fresh_run_id AND r.agent_id=NEW.fresh_agent_id AND
          r.custody_id=NEW.new_custody_id AND r.revision=1 AND
          r.semantic_digest=NEW.new_custody_semantic_digest AND
          r.source_ref_digest=NEW.new_custody_source_ref_digest AND
          r.origin_fresh_apply_id=NEW.apply_id AND
          r.origin_fresh_apply_digest=NEW.apply_digest
      ) AND
      EXISTS (
        SELECT 1
        FROM lifecycle_generation_loss_revisions r
        JOIN lifecycle_generation_loss_heads h
          ON h.project_session_id=r.project_session_id AND
             h.run_id=r.run_id AND h.agent_id=r.agent_id AND
             h.generation_loss_id=r.generation_loss_id AND
             h.current_revision=r.revision AND
             h.semantic_digest=r.semantic_digest AND
             h.source_ref_digest=r.source_ref_digest AND
             h.journal_digest=r.journal_digest
        WHERE r.project_session_id=NEW.fresh_project_session_id AND
          r.run_id=NEW.fresh_run_id AND r.agent_id=NEW.fresh_agent_id AND
          r.generation_loss_id=NEW.fresh_generation_loss_id AND
          r.revision=NEW.fresh_generation_loss_after_revision AND
          r.semantic_digest=NEW.fresh_generation_loss_after_semantic_digest AND
          r.source_ref_digest=
            NEW.fresh_generation_loss_after_source_ref_digest AND
          r.origin_fresh_apply_id=NEW.apply_id AND
          r.origin_fresh_apply_digest=NEW.apply_digest
      ) AND
      EXISTS (
        SELECT 1 FROM lifecycle_fresh_rotation_commits c
        WHERE c.handoff_id=NEW.fresh_handoff_id AND
          c.apply_id=NEW.apply_id AND
          c.fresh_apply_digest=NEW.apply_digest AND
          c.new_custody_id=NEW.new_custody_id AND
          c.generation_loss_after_id=NEW.fresh_generation_loss_id AND
          c.generation_loss_after_revision=
            NEW.fresh_generation_loss_after_revision AND
          c.generation_loss_after_semantic_digest=
            NEW.fresh_generation_loss_after_semantic_digest AND
          c.generation_loss_after_source_ref_digest=
            NEW.fresh_generation_loss_after_source_ref_digest
      ))
  );
END;
~~~

Lifecycle receipt persistence implements Spec 01 section 9.4.1 without a
mutable row that can disagree with its history. Custody and generation-loss
identity rows are immutable; every state edge appends one semantic/journal
revision and CASes the exact head to that foreign-keyed tuple. Revision one has
no predecessor, every successor names revision minus one and its journal digest,
and no terminal head accepts another successor. All shown tables are `STRICT`;
the generated DDL marks every field nonnull except the exact discriminator/null
arms shown here and in Spec 01. UPDATE/DELETE is denied for identity, revision,
scope-admission outbox/resolution, batch, effect, intent, authority-receipt,
checkpoint, authorization,
reservation, handoff, commit and apply rows. Only head pointers use guarded
UPDATE.

The TypeScript daemon validates closed RFC 8785 JCS, every Spec 01 domain-
separated digest, authority attestation and cross-object equality before opening
the write transaction. SQLite enforces identities, exact composite foreign keys,
arm nullability, monotonic revisions, legal edge/cardinality and immutable rows.
No trigger invokes a JavaScript hash UDF: production keeps
`PRAGMA trusted_schema=OFF`, so cryptographic validation cannot be delegated to
an unsafe/unavailable application-defined trigger function. Direct-SQL negative
fixtures still prove every relational and state invariant.

Before the first lifecycle identity or issue for a project/session/run, the
daemon writes only one immutable `lifecycle_scope_admission_outbox` row. Its
worker point-reads or idempotently admits that exact scope at the external
authority, verifies the returned authenticated zero-receipt checkpoint and
project-namespace membership, then atomically inserts the local admitted scope,
checkpoint/head and admission resolution. Return loss and every local insert
boundary replay from the retained outbox; changed scope bytes conflict. No
custody, loss, issue, handoff, receipt batch or apply may precede that verified
resolution.

The prepare transaction locks the exact current head/source rows, verifies one
closed proof, and writes an immutable review reservation or fresh handoff first
when applicable. It then writes one immutable batch, its exact primary/linked
effects and one or two immutable intents. A custody batch has exactly one primary
custody effect and at most one linked loss effect; a standalone direct-open loss
batch has exactly one primary loss effect. Adopted true-chair custody has
ordinal-two review intent/reservation; terminal-fresh instead has ordinal-two
fresh-origin, and pure fresh has ordinal-one fresh-origin. No lifecycle,
provider, review, archive,
history, audit or issue-consumption mutation occurs before authority. No external
call occurs while SQLite is locked.

Each intent equality-binds its subject owner kind, identity and revision to the
exact typed effect in the same batch. The generated SQLite DDL declares
`lifecycle_completion_effect_set_exact` as a `BEFORE INSERT` guard on completion:
custody has exactly one primary custody effect plus only its declared optional
linked loss and terminal-fresh secondary fresh-origin effect; standalone loss
has exactly one primary loss effect; retirement has exactly one primary
retirement effect; pure fresh has exactly one primary fresh-origin effect; every
other effect table is empty for
that arm. A missing, crossed or extra effect aborts with
`lifecycle-effect-set-incomplete`. Every custody, generation-loss, retirement
and fresh-origin effect table also rejects insertion after completion with
`lifecycle-effect-set-closed`. Completion is therefore both membership proof and
an anti-extra fence; the daemon independently validates the canonical effect-set
digest without a trigger hash UDF.

The apply marker remains the final statement. The generated SQLite DDL declares
`lifecycle_apply_post_state_complete` as its `BEFORE INSERT` guard and aborts
with `lifecycle-apply-post-state-incomplete` unless the selected arm is complete.
Custody terminal requires its exact effect-selected final revision and current
head, its declared linked-loss revision/head when present, and its review binding
when the batch selected review. Standalone loss requires its primary final
revision/head. Retirement requires its exact effect-selected retirement result.
Terminal-fresh additionally requires the exact new custody revision-one/head and
fresh commit, plus its declared affected-loss revision/head when present. Pure
reuse-final fresh requires its exact new custody revision-one/head and fresh
commit; pure open-loss fresh also requires its exact recovery-in-progress loss
revision/head. Child-to-apply foreign keys in custody/loss revisions, review
binding, fresh commit and retirement result are `DEFERRABLE INITIALLY DEFERRED`;
the guard never creates a missing child.

The worker point-reads before append, appends only on authoritative absence and
point-reads again after a return, throw or timeout. Exact verified results insert
separate immutable `lifecycle_authority_receipts`; intent rows never mutate.
Once all declared receipts belong to one verified pinned scope checkpoint, one
`lifecycle_receipt_batch_authorizations` row is inserted. The apply transaction
then equality-checks the current journal and complete semantic write/effect set,
appends final revision journal(s), advances exact heads, performs every reserved
review/archive/fresh write and inserts one `lifecycle_transition_applies` row.
Derived state is prepared, authority-complete or applied from child-row
existence; no state column duplicates it. Exact pre-state or exact post-state
replay succeeds; any third state fails integrity. Provider no-effect/history/
audit and linked loss state are never changed before apply.

Hydration is read-only and starts at the authenticated project namespace, not
local custody rows. It resolves every historical scope checkpoint named by that
pinned namespace, pages each immutable checkpoint through the 256-row API and
reconciles every zero-receipt member to its exact local immutable admission
outbox/resolution/scope tuple before reconciling the external set against local
pending/applied intents. Whole-
custody/run deletion, extra external rows, missing committed receipts, chain/
head/count/set drift, crossed authority or invalid attestation is
`SNAPSHOT_INVALID`. A pending intent alone may be externally absent. Only after
successful hydration may `LifecycleReceiptRecoveryService` resume append or
apply; point lookup is response-loss recovery, never completeness proof.

The review reservation is immutable and has no batch back-pointer or mutable
consumed state; its exact batch points one way to it and the apply proves
consumption. A generation-loss reservation names the planned linked effect key
and after tuple without foreign-keying the not-yet-materialized revision. The
same prepare batch equality-copies that tuple and binds it, deferred, to its
exact linked effect; the apply-time review binding equality-copies the batch
tuple and is deferred to the apply marker. It freezes
decision/cut/high-water/predecessor at the adoption
linearization point while permitting later provider terminals as post-cut.
Review cut, successor binding and rebind receipt equality-copy the decision and
ordinal-two external receipt; recovery never rereads later high-water or re-
enters the review owner.

Fresh preparation and handoff are immutable. A nonfinal awaiting-boundary/
prepared custody with zero dispatch uses `fresh-handoff-superseded`: the source
and issue remain unchanged while its custody-terminal batch is pending, then one
`terminal-fresh` apply finalizes the source, creates new custody revision one,
inserts the commit and derives issue consumption. A finalized custody or open
generation loss uses one externally authenticated `fresh-origin` batch and one
`fresh` apply from the same handoff; the loss moves to
recovery-in-progress, not terminal. Issue state is derived as active, commit-
pending, consumed, revoked or expired; a handoff freezes later revoke/expiry.
Composite keys enforce the preparation/handoff/commit/issue/source/custody/
action bijection and both source arms without nullable-FK vacuity.

Verification mutates every proof arm and arm discriminator; faults each
prepare/append/reread/receipt/checkpoint/authorization/apply statement; injects
success-then-throw, invalid attestation and live-head advance during pinned
paging; deletes whole custody/run histories; advances review high-water after
reservation; and crosses request, semantic/journal revision, source, linked loss,
issue, preparation, handoff, commit, decision, cut, effect, receipt and apply.
Every changed-input replay fails for the right reason.

Context observation classification is closed: `generation-advance`, `context-
advance`, `replay` or `reordered-observation`. Adapter input is a positive
provider generation plus nonnegative normalised context revision and stable
source event ID/evidence digest. Natural uniqueness makes replay return the one
existing classification/audit row and bounds audit growth. The high-
water trigger accepts equal replay, requires strict revision increase for
same-generation context-advance, and makes a lower generation or lower same-
generation revision append audit only with no high-water/lifecycle change. A
greater provider generation creates generation-advance regardless of context
revision and installs that generation's baseline. Final CAS repeats the order.
Only provider/context high-water moves from this telemetry. Principal and bridge
high-water move solely from authenticated daemon custody reservation/adoption
tuples; provider integers cannot infer either authority generation.

`abandon_kind_code` is the nonnull sentinel `none` outside terminal abandoned.
Direct `open -> abandoned`
requires `direct-open` and both recovery-action columns null. Abandon from
recovery-in-progress requires `recovery-attempt` and a complete global provider
action pair equal to the active recovery custody. Recovered-adopted and every
nonterminal state require `none`. Composite CHECK/foreign keys reject
half-null, crossed adapter/action and invented direct-open actions.
`lifecycle_generation_loss_revisions` has no free terminal-disposition column:
public disposition is derived exactly from state plus abandon kind. Custody
`disposition_code` is `none` before finalized and exactly one closed terminal
value at finalized; journal/head triggers enforce the Spec 01 edge table. Partial unique
indexes prevent a second nonfinal custody or nonterminal loss for one agent.

Adoption-delivery history is unique inside its custody. `active_owner=1` only
while that custody is nonfinal; terminalisation flips it to zero in the same
transaction. The partial index permits only one nonfinal custody to own a
delivery/generation, while a later retry may reinsert the same predecessor under
its new custody without deleting immutable history.

No delivery schema/state is added. `successor-pending` is the pure joined
projection for which delivery state is `ready`, delivery recipient equals the
agent, and the active lifecycle-delivery owner is exactly one of: a nonfinal
custody, a standalone open generation loss, or a recovery-in-progress loss
whose `active_recovery_custody_id` exactly names that nonfinal custody. A
standalone recovery-in-progress loss or crossed/multiple unrelated rows is an
integrity failure and remains claim-fenced. The existing recipient/state/
sequence and lifecycle-owner indexes serve it. Mailbox/operator reads expose that row as
stored state ready plus routing disposition successor-pending; receipt ready
counts include it and no successor-pending counter exists. Claim reuses the
same predicate under its CAS. Adoption finalises custody and any linked loss
without mutating the ready delivery, clearing the disposition and making it claimable; abandon
updates every matching ready row to abandoned with reason/watermark before
finalising custody. Enqueue before/after the delivery cut needs no extra field.

Identity, bridge and per-provider-generation context high-water rows plus
custody identity/source/checkpoint/target fields are
immutable except through their named CAS transactions. Custody target
provider/principal generations are each the prior run/agent-global high-water
plus one; target bridge is the prior run/agent/owner-kind bridge high-water plus
one. Each high-water increments in the reservation transaction. A superseded,
quarantined or abandoned attempt does not return a number. Activation equality-
CASes the exact provider-session, capability/action, adapter/contract and bridge
row/revision snapshots plus, for a true chair, exact project-session/run/chair-
lease generations. It then installs the reserved targets. Source-plus-one,
skipped, reused or crossed-owner values fail.

Self-request carries no turn ID. The transaction first commits delivery claim-
expiry/reclaim and membership/delivery-watermark housekeeping, then derives one active caller turn from the
authenticated capability plus current bridge/provider generations. Zero,
multiple, foreign or quarantined matches reject, as does any second active or
quarantined predecessor. Terminal predecessor states are released and revoked.
It then changes every active agent-owned write lease to
lifecycle-quarantined before computing the checkpoint/precondition digest;
fences claims, records delivery_cut_watermark, captures only claimed predecessor
delivery IDs/generations in adoption_delivery_set_digest, and captures the exact
daemon-validated checkpoint, `open_work_set_digest` and all other revision/set
digests. Open work includes every nonterminal request-result obligation and its
revision, including provider-accepted/unconsumed callbacks;
rechecks the post-housekeeping lease/freeze set; inserts custody; fences new
claims/turns; sets suspended; and commits accepted-suspended without adapter
I/O. Exact replay returns that immutable receipt; current lifecycle is a read.
Every delivery-claim transaction performs the same expiry/reclaim/watermark
housekeeping and rechecks lifecycle freeze immediately before its claim CAS.
The request transaction inserts the exact claimed rows into
lifecycle_custody_adoption_deliveries with contiguous ordinals/source state;
their canonical digest must equal adoption_delivery_set_digest. Adoption CASes
those foreign-keyed IDs/generations, never a fresh query over current claims.

Delivery enqueue remains durable, but ready/unclaimed rows at the cut and later
enqueues are successor-pending and excluded from checkpoint/precondition/
adoption digests. They cannot stale rotation; adoption makes the same rows
claimable without replay. Delivery claim/ack and write acquisition are trigger-
denied while custody owns the agent. The old grant
may finish only the captured lifecycle call and bounded reads. The staged grant
exposes only the existing launch.attest descriptor bound to custody/action,
challenge and checkpoint/open-work vector. Every other agent/task/mailbox/authority/
write/turn/barrier mutation is denied.

Triggers implement exactly the Spec 01 state-edge table and dispositions
adopted, no-effect, quarantined, superseded and abandoned. No state may skip an
edge. awaiting-boundary waits for the captured caller and every predecessor
turn to reach a terminal status at its exact generation. An operator-created
fresh rotation stores null caller turn and is not inserted until every
predecessor is terminal. Predispatch no-effect needs the durable zero-dispatch
journal. Postdispatch no-effect needs the activated adapter contract's
authenticated closed proof; timeout or absence never suffices.

Final no-effect/superseded transactions revoke the staged replacement, clear
only this custody's freeze-owner rows, retain the valid predecessor and set the
agent ready. Quarantined finalisation retains its freeze-owner rows, keeps the
agent suspended and sets recovery-required. Abandon uses the archival owner
below. Generic Resume cannot execute any of these exits.

Rotation dispatch always creates a distinct provider context under the new
action/custody. Same-history attach/resume is accepted only by crash recovery
for the same custody and cannot satisfy rotation. The adopted bridge receives
only the bounded canonical checkpoint/handoff after commit; no predecessor
transcript or hidden provider history is copied.

Dispatch marks the one-time volatile handoff before I/O. The replacement
session answers challenge and checkpoint/task/mailbox/child/open-work vector through
launch.attest. The daemon verifies and retains the exact successor volatile
bridge before beginning the final database CAS. Adoption rechecks custody,
source/high-water targets and every precondition, inserts provider lineage,
swaps a child through agent_bridge_state or a chair through
launched_chair_bridge_state, activates the staged capability, revokes the old
principal/capability, transfers the exact open-work obligations unchanged and
sets ready. Postcommit cleanup retires the exact old
volatile bridge; a crash-left transport has no credential authority. Existing
write leases remain lifecycle-quarantined. A true-chair adoption captures the
review certification cut and performs same-subject binding rebind-or-stale in
the same serialization point. Review actions/ambiguity never block or roll back
adoption; old actions retain their normal recovery owner.

LifecycleRotationRecoveryService runs before and excludes lifecycle-linked
rows from every generic provider-action/bridge recovery query.
awaiting-boundary/prepared performs no adapter call and can close no-effect only
from the zero-dispatch journal. dispatched/accepted/ambiguous permits at most
one pair lookup. Exact launch.attest terminal proof may resume adoption; closed
no-effect closes; drift supersedes; malformed/crossed/conflicting proof
quarantines. No path dispatches, redispatches, reconstructs a secret or treats
a resume reference as continuity. Checkpoint A can never adopt B; B reserves a
new action/capability/challenge and new high-water targets.

The generation-loss table is the second explicit lifecycleRecoverySourceV1
arm; custody and loss foreign keys are exclusive/non-null by discriminator.
loss_kind is generation-advance (new provider generation > old) or context-
advance (new provider generation equals old and new context revision is
strictly greater than old).
Generation-advance wins when provider and context both change, so one
observation has one canonical loss ID. checkpoint
state is absent, invalid or last-validated; ref/digest are non-null iff last-
validated. Detection requires no active custody, inserts open loss, fences the
source, and ratchets only provider/context high-water from the observation.
Principal/bridge high-water changes only under authenticated custody/adoption
CAS inputs, never by comparing provider telemetry. Generic scans exclude it.
Capability issuance equality-copies every immutable loss source action,
adapter/contract, principal/bridge/owner and chair session/run/lease field; it
never late-resolves a mutable bridge/session join.

Loss edges are open -> recovery-in-progress -> recovered-adopted|abandoned,
recovery-in-progress -> open and direct open -> abandoned.
Fresh custody no-effect/quarantine/supersession returns it to open with attempt
history; only adopted custody terminalises recovered and clears freezes.
Absent/invalid checkpoint permits fresh rotation only after the read-only
recovery-checkpoint validator binds an existing daemon-valid artifact; otherwise
only abandon is reachable. Direct-open abandon persists null recovery action;
attempted-recovery abandon persists its exact adapter/action pair. The recovery
capability/intent/retirement rows bind the exact custody-or-loss union and
phase-B CAS its revision.

Lifecycle remains the sole recovery owner for a rotating true chair until
adoption or confirmed abandon. The chair-loss scanner excludes a nonfinal
custody, open generation loss and finalized nonadopted lifecycle-recovery marker and creates no
chair_bridge_loss row. Child custody cannot update chair tables.

The private local issuer for agent-lifecycle-recovery-takeover requires the
same local subject's current session capability containing
agent-lifecycle-recovery-issue plus one independently attested consequential
gate bound to the exact recovery, validates the complete row binding above and
returns plaintext once while persisting only its hash. Its derived statuses are
active, commit-pending, consumed, revoked and expired; no mutable status column
duplicates the issue/handoff/commit/revocation facts. The narrow issue authorises only fresh-rotate;
generic session or takeover capabilities cannot reach Commit.
agent-lifecycle-recovery intent rows additionally bind path, exact replacement
adapter/activated contract/distinct canonical action pair, current daemon-validated checkpoint
row/vector and proposed high-water reservation. Preview changes no lifecycle
or provider state. Fresh-rotate Commit first persists the immutable handoff. A
nonfinal zero-dispatch predecessor becomes commit-pending until its externally
authorized terminal-fresh apply atomically supersedes it and inserts the
distinct null-caller awaiting-boundary custody/commit. A finalized custody or
open loss uses the direct fresh apply; finalized rows are never mutated and the
open loss moves to recovery-in-progress. Commit performs no provider call.

abandon instead requires exact session cancel authority, a consequential gate
and independent destructive direct-human attestation. It first prepares the
exact terminal batch; only post-authority apply moves a nonfinal custody through
abandoned or preserves a finalized custody
and inserts agent_lifecycle_recovery_retirements; an open loss takes direct-open
abandon with no recovery pair, while a recovery-in-progress loss takes recovery-
attempt abandon with its exact pair. It archives the agent; revokes
old/staged capability, principal and bridge; terminally revokes turns; and
moves lifecycle-quarantined write leases to revoked-abandoned. It terminally
abandons every owned or sole-recipient ready/claimed delivery, task owner lease,
required-result obligation and membership with reason; advances message/
delivery membership watermarks; terminalises dependent owned barriers as
abandoned-failure; appends grant revocations without changing immutable
authority envelopes; and clears only exact freeze contributions whose owners
are terminal. No required delivery/barrier is orphaned. Child abandon preserves
unrelated run work and moves affected parents to explicit failure/recovery;
chair abandon enters the existing run/session cancel-failure terminal path
atomically. Status returns intent, issue and custody state; Reconcile pair-looks
up only a new dispatched action. Generic Resume cannot mutate these rows.

Verification covers schema/catalogue and every legal/illegal state edge and
transaction crash; unique self-turn inference and operator null-caller
boundary; housekeeping/quarantine/delivery-cut ordering; successor-pending
stored-as-ready state/count and enqueue without adoption starvation versus
claim/ack fencing for custody, open loss and exact linked loss/custody owners;
adoption/abandon and crossed/multiple-owner negatives; old/staged
operation negatives; accepted/current-read separation;
global identity/owner-scoped bridge high-water A-to-B nonreuse and exact source/
target final CAS; launch.attest attribution;
retained-successor-before-CAS, child/chair table swap and postcommit retirement;
predispatch versus advertised postdispatch no-effect; sole-chair lifecycle
ownership and generic recovery exclusion. Operator fixtures cover capability
parent issuance grant/gate/revoke/consume, fresh adapter/contract/action/
checkpoint binding, finalized-custody immutability, exact abandon delivery/
watermark/barrier transitions and generic-resume/chair-loss negatives.
Generation-loss fixtures cover both loss kinds, every checkpoint state,
simultaneous provider/context advance classified once as generation-advance,
restart replay, lower generation, lower same-generation revision, arbitrary
forward context jump, strict context inequality and observed high-water
ratchet; custody-or-loss foreign keys, recovery/adopt/reopen/direct-open versus
recovery-attempt abandon edges/action-pair nullability and absent/null/generic-
resume negatives. No code in
this amendment adds automatic pressure, successor selection or research-only
routing policy.

### 9.23 Capability, route-lineage and context-pressure persistence

Spec 01 section 32.21 owns the closed public capability/discovery/route,
context-pressure, topology-wave and operational-span semantics; Spec 03 owns
`adapterEffectiveConfigurationV1` activation semantics. The daemon owns their generated codecs,
persistence and compare-and-set enforcement. The TypeScript caller and any
offline Python route resolver validate the same checked-in JSON Schemas; the
resolver receives capability input explicitly and may not read daemon
activation configuration behind the caller.

The current generated-contract inventory adds exactly:

- `adapter-capability-snapshot.v1.schema.json`;
- `capability-snapshot-ref.v1.schema.json`;
- `capability-snapshot-summary.v1.schema.json`;
- `discovery-surface-manifest.v1.schema.json`;
- `discovery-surface-ref.v1.schema.json`;
- `deployed-route-admission.v1.schema.json`;
- `deployed-route-dispatch.v1.schema.json`;
- `deployed-route-observation.v1.schema.json`;
- `actual-review-route-identity.v1.schema.json`;
- `adapter-effective-configuration.v1.schema.json`;
- `adapter-effective-configuration-ref.v1.schema.json`;
- `provider-context-pressure.v1.schema.json`;
- `provider-context-pressure-read-request.v1.schema.json`;
- `provider-context-pressure-read.v1.schema.json`;
- `topology-wave-plan-ref.v1.schema.json`;
- `topology-wave-plan.v1.schema.json`;
- `topology-wave-plan-current.v1.schema.json`;
- `topology-wave-plan-input.v1.schema.json`;
- `topology-wave-append-request.v1.schema.json`;
- `topology-wave-append-receipt.v1.schema.json`;
- `topology-wave-current-read-request.v1.schema.json`;
- `topology-wave-current-read.v1.schema.json`;
- `topology-wave-list-request.v1.schema.json`;
- `topology-wave-list.v1.schema.json`;
- `fabric-operational-span.v1.schema.json`;
- generated TypeScript validators/types; and
- the same hash-bound schemas as explicit Python validator inputs.

There is no hand-written parallel route codec. Generation checks fail when any
generated surface or schema digest differs. The pre-release database baseline
is updated in place; no predecessor table, decoder, import or compatibility
view is retained.

```sql
adapter_capability_snapshots(
  adapter_id, snapshot_generation, snapshot_id,
  adapter_contract_digest, host_id, host_version, source,
  observed_at, expires_at, capability_body_digest,
  snapshot_json, snapshot_digest, created_at,
  PRIMARY KEY(adapter_id, snapshot_generation),
  UNIQUE(snapshot_id), UNIQUE(snapshot_digest),
  UNIQUE(adapter_id, snapshot_generation, snapshot_digest,
    capability_body_digest)
)

adapter_capability_current(
  adapter_id PRIMARY KEY,
  snapshot_generation, snapshot_digest, capability_body_digest, revision,
  FOREIGN KEY(adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest)
    REFERENCES adapter_capability_snapshots(
      adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest)
)
```

`snapshot_json` byte-equals JCS of the closed Spec 01 object. Insert validates
the exact stable body preimage/digest, snapshot digest, contiguous positive
generation, `expires_at > observed_at`, sorted
unique catalogues and the activated contract. Snapshot rows are insert-only.
The single current-pointer row advances by generation/digest/revision CAS in the
activation transaction and additionally equality-checks the referenced row's
digest. An expired or unavailable snapshot remains immutable audit evidence but
cannot be selected by admission.

Discovery surfaces and effective configurations are immutable daemon evidence:

```sql
discovery_surface_manifests(
  evidence_id, evidence_revision, artifact_path, artifact_digest,
  host_id, host_version, provider_profile, raw_native_mode,
  permission_profile_digest, manifest_json, manifest_digest, created_at,
  PRIMARY KEY(evidence_id, evidence_revision),
  UNIQUE(evidence_id, evidence_revision, manifest_digest),
  FOREIGN KEY(evidence_id, evidence_revision)
    REFERENCES artifacts(artifact_id, revision)
)

adapter_activation_subjects(
  adapter_id, activation_id, activation_revision,
  evidence_id, evidence_revision, created_at,
  PRIMARY KEY(adapter_id, activation_id, activation_revision),
  UNIQUE(evidence_id, evidence_revision),
  FOREIGN KEY(evidence_id, evidence_revision)
    REFERENCES artifacts(artifact_id, revision)
)

adapter_provider_smoke_subjects(
  adapter_id, smoke_id, action_adapter_id, action_id,
  evidence_id, evidence_revision, created_at,
  PRIMARY KEY(adapter_id, smoke_id),
  UNIQUE(action_adapter_id, action_id),
  UNIQUE(evidence_id, evidence_revision),
  CHECK(action_adapter_id = adapter_id),
  FOREIGN KEY(evidence_id, evidence_revision)
    REFERENCES artifacts(artifact_id, revision),
  FOREIGN KEY(action_adapter_id, action_id)
    REFERENCES provider_action_pair_preflights(adapter_id, action_id)
)

adapter_effective_configurations(
  configuration_id, configuration_revision,
  adapter_id TEXT NOT NULL, adapter_contract_digest NOT NULL,
  executable_identity_digest NOT NULL,
  capability_snapshot_generation, capability_snapshot_digest,
  capability_body_digest,
  subject_kind TEXT NOT NULL CHECK(subject_kind IN
    ('activation','provider-smoke','provider-action')),
  subject_ref_digest TEXT NOT NULL,
  subject_activation_id, subject_activation_revision, subject_smoke_id,
  subject_action_adapter_id, subject_action_id,
  activation_configuration_id, activation_configuration_revision,
  activation_configuration_digest, requested_configuration_digest,
  effective_configuration_digest, permission_profile_digest,
  discovery_surface_evidence_id, discovery_surface_evidence_revision,
  evidence_id, evidence_revision,
  configuration_json, configuration_digest, created_at,
  PRIMARY KEY(configuration_id, configuration_revision),
  UNIQUE(configuration_id, configuration_revision, configuration_digest),
  UNIQUE(evidence_id, evidence_revision),
  UNIQUE(configuration_digest),
  UNIQUE(subject_action_adapter_id,subject_action_id,subject_kind,
    adapter_contract_digest,configuration_id,configuration_revision,
    configuration_digest,effective_configuration_digest,
    executable_identity_digest),
  FOREIGN KEY(evidence_id, evidence_revision)
    REFERENCES artifacts(artifact_id, revision),
  FOREIGN KEY(adapter_id, capability_snapshot_generation,
      capability_snapshot_digest, capability_body_digest)
    REFERENCES adapter_capability_snapshots(
      adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest),
  FOREIGN KEY(discovery_surface_evidence_id,
      discovery_surface_evidence_revision)
    REFERENCES discovery_surface_manifests(evidence_id, evidence_revision),
  FOREIGN KEY(adapter_id, subject_activation_id, subject_activation_revision)
    REFERENCES adapter_activation_subjects(
      adapter_id, activation_id, activation_revision),
  FOREIGN KEY(adapter_id, subject_smoke_id)
    REFERENCES adapter_provider_smoke_subjects(adapter_id, smoke_id),
  FOREIGN KEY(subject_action_adapter_id, subject_action_id)
    REFERENCES provider_action_pair_preflights(adapter_id, action_id),
  FOREIGN KEY(activation_configuration_id,
      activation_configuration_revision,
      activation_configuration_digest)
    REFERENCES adapter_effective_configurations(
      configuration_id, configuration_revision, configuration_digest),
  CHECK(
    (subject_kind='activation' AND subject_activation_id IS NOT NULL AND
      subject_activation_revision IS NOT NULL AND subject_smoke_id IS NULL AND
      subject_action_adapter_id IS NULL AND subject_action_id IS NULL) OR
    (subject_kind='provider-smoke' AND subject_activation_id IS NULL AND
      subject_activation_revision IS NULL AND subject_smoke_id IS NOT NULL AND
      subject_action_adapter_id IS NULL AND subject_action_id IS NULL) OR
    (subject_kind='provider-action' AND subject_activation_id IS NULL AND
      subject_activation_revision IS NULL AND subject_smoke_id IS NULL AND
      subject_action_adapter_id IS NOT NULL AND
      subject_action_adapter_id=adapter_id AND subject_action_id IS NOT NULL))
)

CREATE UNIQUE INDEX one_effective_configuration_per_activation_subject
  ON adapter_effective_configurations(
    adapter_id, subject_activation_id, subject_activation_revision)
  WHERE subject_kind='activation';
CREATE UNIQUE INDEX one_effective_configuration_per_smoke_subject
  ON adapter_effective_configurations(adapter_id, subject_smoke_id)
  WHERE subject_kind='provider-smoke';
CREATE UNIQUE INDEX one_effective_configuration_per_provider_action
  ON adapter_effective_configurations(
    subject_action_adapter_id, subject_action_id)
  WHERE subject_kind='provider-action';
```

Each discovery row composite-foreign-keys the exact existing
`EvidenceArtifactRegistration` revision. Its `manifest_json` byte-equals RFC
8785 JCS of the digest-free `discoverySurfaceManifestV1`; `manifest_digest`,
`artifact_digest` and the registered artifact digest are equal, and the exact
registered bytes reproduce them. Triggers equality-copy host/version/profile/
raw-mode and permission fields from the manifest. Only the daemon renderer may
insert this evidence kind.

The two subject tables are immutable identity/evidence registries, not new
activation or action state machines; their evidence tuples foreign-key exact
daemon registrations. A provider-smoke/action pair preflight exists before its
subject/config row, so the later route-to-configuration FK creates no cycle.

Effective-configuration insert validates the closed Spec 03 object and its
digest. A closed discriminator CHECK requires exactly the activation columns,
smoke column, or provider-action pair columns for its `subject_kind`; every
other subject column is null. Adapter ID, subject kind and subject-ref digest
are nonnull, and the provider-action arm separately proves its action-adapter
column nonnull before equality, so SQLite's NULL CHECK semantics cannot bypass
an arm or its partial index. The selected columns reproduce `subjectRef` and
`subject_ref_digest` and must satisfy the displayed foreign key. The three
partial unique indexes make the selected ref—not a caller-selected value—the
one-to-one subject identity. A different configuration ID, revision or digest
cannot create a second effective configuration for the same subject. The nullable
activation-configuration triple is all null only for an activation
subject; smoke/action subjects require a same-adapter activation parent and
cannot update it. Subject arm/ref digest, executable, snapshot instance/body,
permission and discovery-surface tuples must reproduce the JSON. Each row is
also registered through the existing daemon-owned evidence registration path;
no public publisher may forge its evidence kind. There is no host-global config
mutation, compatibility decoder or update path.

Certifying-review availability/admission/dispatch additionally require the
referenced capability body to state `safety.enforcedReadOnly=true` and the
effective permission profile to be the exact enforced read-only profile.
Generic routes instead enforce their own matched profile and may be write-
capable inside task authority; no store trigger globally rewrites them to read-
only.

The existing `provider_action_routes` row gains non-null
`capability_snapshot_generation`, `capability_snapshot_digest`,
`capability_body_digest`,
`effective_configuration_id`, `effective_configuration_revision`,
`effective_configuration_ref_digest`,
`requested_configuration_digest`, `effective_route_configuration_digest`,
`deployed_route_admission_json`, `deployed_route_admission_digest`,
`route_policy_revision`, `harness_revision`, `harness_digest`,
`context_policy_revision`, `context_policy_digest`,
`permission_profile_digest`,
`discovery_surface_evidence_id`, `discovery_surface_evidence_revision` and
`discovery_surface_digest` for every new
answer-bearing action. Foreign keys bind the exact adapter/generation/digest.

```sql
provider_action_routes(
  ...existing columns...,
  capability_snapshot_generation, capability_snapshot_digest,
  capability_body_digest,
  effective_configuration_id, effective_configuration_revision,
  effective_configuration_ref_digest,
  requested_configuration_digest, effective_route_configuration_digest,
  discovery_surface_evidence_id, discovery_surface_evidence_revision,
  discovery_surface_digest,
  ...new admission columns...,
  FOREIGN KEY(adapter_id, capability_snapshot_generation,
    capability_snapshot_digest, capability_body_digest)
    REFERENCES adapter_capability_snapshots(
      adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest),
  FOREIGN KEY(effective_configuration_id, effective_configuration_revision,
      effective_configuration_ref_digest)
    REFERENCES adapter_effective_configurations(
      configuration_id, configuration_revision, configuration_digest),
  FOREIGN KEY(discovery_surface_evidence_id,
      discovery_surface_evidence_revision, discovery_surface_digest)
    REFERENCES discovery_surface_manifests(
      evidence_id, evidence_revision, manifest_digest)
)
```

The explicit composite foreign key means a digest cannot cross another
adapter/generation. Historical routes reference immutable snapshots, never the
mutable current pointer.
The route-admission action pair equals the row primary key; its admitted
adapter, contract and snapshot instance/body equal the foreign row. Its
discovery-surface ref foreign-keys `discovery_surface_manifests` and the exact
existing `EvidenceArtifactRegistration` revision/artifact digest. Host/version/
profile/raw-mode, permission and manifest digest must equality-bind route,
snapshot, launch and registration; evidence kind is `discovery-surface.v1`,
`publisherKind=fabric` and `producer=fabric-daemon`.
The effective-configuration foreign row must have `subject_kind='provider-action'`
and its exact subject ref must equal the route action pair; adapter/contract,
snapshot body, permission and surface fields reproduce admission.
Requested and admitted arms are immutable.

Every provider-I/O attempt appends its actual point-of-use snapshot:

```sql
provider_action_route_dispatches(
  adapter_id, action_id, dispatch_ordinal, admission_digest,
  capability_snapshot_generation, capability_snapshot_digest,
  capability_body_digest,
  effective_configuration_id, effective_configuration_revision,
  effective_configuration_ref_digest, permission_profile_digest,
  discovery_surface_evidence_id, discovery_surface_evidence_revision,
  dispatched_at, dispatch_json, dispatch_digest,
  PRIMARY KEY(adapter_id, action_id, dispatch_ordinal),
  UNIQUE(dispatch_digest),
  FOREIGN KEY(adapter_id, action_id)
    REFERENCES provider_action_routes(adapter_id, action_id),
  FOREIGN KEY(adapter_id, capability_snapshot_generation,
      capability_snapshot_digest, capability_body_digest)
    REFERENCES adapter_capability_snapshots(
      adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest),
  FOREIGN KEY(effective_configuration_id, effective_configuration_revision,
      effective_configuration_ref_digest)
    REFERENCES adapter_effective_configurations(
      configuration_id, configuration_revision, configuration_digest),
  FOREIGN KEY(discovery_surface_evidence_id,
      discovery_surface_evidence_revision)
    REFERENCES discovery_surface_manifests(evidence_id, evidence_revision)
)
```

Ordinals are contiguous and rows insert immediately before their provider I/O.
The snapshot must be current and unexpired at insertion, but may be a newer
instance than admission only when its body digest and adapter/contract/host are
identical. Effective-configuration, permission and surface tuples remain
admission-equal and the effective row must still reproduce all of them. The public
capability summary joins admission and latest dispatch snapshots separately,
including each one's source and clocks; no clock is copied between arms.

Terminal observation is append-only and separate:

```sql
provider_action_route_observations(
  adapter_id, action_id, admission_digest,
  observation_json, observation_digest, observed_at,
  PRIMARY KEY(adapter_id, action_id), UNIQUE(observation_digest),
  FOREIGN KEY(adapter_id, action_id)
    REFERENCES provider_action_routes(adapter_id, action_id)
)
```

Insert equality-checks the parent action/admission digest and every closed
field-evidence union. A missing provider field persists its explicit
unavailable arm rather than admission data. No update, replacement or
recomputed admission digest is legal. Public reads left-join zero or one
observation and expose both immutable digests.

Certifying review evidence additionally stores nullable
`route_observation_digest` and `actual_route_identity_digest`. The latter can be
nonnull only when observation endpoint provider/family/model are proved by
provider result or contract-defined adapter attestation; equality is evaluated
separately against admission and resolved profile requirements. Every other
observed route arm is also equality-checked against admission; unavailable is
honest but proved inequality is mismatch. Missing proof and mismatch retain
safe adverse findings but accept no resolution and persist the respective
closed blocker. Generic provider actions bypass this certification-only test.

Admission and dispatch use this order:

1. classify exact command/action-pair replay and create/attach the canonical pair
   preflight before any route/config subject;
2. run the bounded pure resolver against explicit pinned inputs;
3. in one transaction validate authority/budget plus the current unexpired
   capability instance/body, adapter contract/host, model, raw effort, raw
   native mode, per-action effective configuration, permission profile,
   context-policy revision/digest and
   harness revision/digest plus discovery-surface registration/digest, then insert
   the provider-action effective configuration followed by its route/action/
   reservations in that order;
4. immediately before initial provider I/O or a permitted no-effect retry, read
   the current unexpired snapshot, require admitted body/contract/host/model/
   effort/mode plus fixed effective-configuration/permission/harness/context/
   surface/route equality, and
   append the exact dispatch snapshot row; an instance-only refresh with equal
   body proceeds;
5. on body/permission/surface or other pre-effect drift, terminalise/supersede
   the zero-effect action and resolve
   afresh under a new action pair. After ambiguous effect, retain the original
   route and invoke only its existing pair-keyed recovery owner.

The pure resolver never persists, performs provider/network I/O or becomes the
route owner. Its existing five-second process-group TERM/KILL boundary remains
binding. The daemon persistence wrapper is not callable as a resolver.

Topology waves use one append-only store and one current pointer:

The authority foreign key below depends on the exact four-column parent
`UNIQUE(project_session_id, coordination_run_id, authority_revision,
authority_ref)` already declared by section 9.13 for the squashed baseline.

```sql
topology_wave_plans(
  project_session_id, coordination_run_id, task_id,
  wave_id, wave_revision,
  predecessor_wave_id, predecessor_wave_revision, predecessor_plan_digest,
  chair_agent_id, principal_generation, chair_lease_generation,
  authority_revision, authority_ref, authority_digest,
  policy_revision, policy_ref, policy_digest,
  rationale_evidence_id, rationale_evidence_revision,
  state, plan_json, plan_digest, created_at,
  PRIMARY KEY(project_session_id, coordination_run_id, task_id,
    wave_id, wave_revision),
  UNIQUE(project_session_id, coordination_run_id, task_id,
    wave_id, wave_revision, plan_digest),
  UNIQUE(plan_digest),
  FOREIGN KEY(rationale_evidence_id, rationale_evidence_revision)
    REFERENCES artifacts(artifact_id, revision),
  FOREIGN KEY(coordination_run_id, task_id)
    REFERENCES tasks(run_id, task_id),
  FOREIGN KEY(coordination_run_id, chair_agent_id)
    REFERENCES agents(run_id, agent_id),
  FOREIGN KEY(project_session_id, coordination_run_id,
      authority_revision, authority_ref)
    REFERENCES run_authority_revisions(
      project_session_id, coordination_run_id,
      authority_revision, authority_ref),
  FOREIGN KEY(project_session_id, coordination_run_id, task_id,
      predecessor_wave_id, predecessor_wave_revision,
      predecessor_plan_digest)
    REFERENCES topology_wave_plans(
      project_session_id, coordination_run_id, task_id,
      wave_id, wave_revision, plan_digest)
)

topology_wave_current(
  project_session_id, coordination_run_id, task_id,
  wave_id, wave_revision, plan_digest, revision,
  PRIMARY KEY(project_session_id, coordination_run_id, task_id),
  FOREIGN KEY(project_session_id, coordination_run_id, task_id,
      wave_id, wave_revision, plan_digest)
    REFERENCES topology_wave_plans(
      project_session_id, coordination_run_id, task_id,
      wave_id, wave_revision, plan_digest)
)

topology_wave_append_receipts(
  command_id PRIMARY KEY, request_digest, actor_principal_digest,
  project_session_id, coordination_run_id, task_id,
  prior_wave_id, prior_wave_revision, prior_plan_digest,
  wave_id, wave_revision, plan_digest, pointer_revision,
  receipt_json, receipt_digest, created_at,
  UNIQUE(receipt_digest),
  FOREIGN KEY(project_session_id, coordination_run_id, task_id,
      wave_id, wave_revision, plan_digest)
    REFERENCES topology_wave_plans(
      project_session_id, coordination_run_id, task_id,
      wave_id, wave_revision, plan_digest)
)
```

`plan_json` validates the closed Spec 01 object; scalar columns equality-copy it
and the plan digest is exact JCS. Nested triggers validate canonical order,
dependency/decomposability, topology, chair, stage owners, write partitions,
contention, budgets and stop conditions. The rationale tuple foreign-keys the
exact existing evidence registration. A revision is immutable; any rationale or
state change appends the next contiguous revision. The current pointer advances
by exact CAS. Predecessor refs foreign-key the exact earlier plan tuple, and
authority/policy/chair/dependency currency is checked at append and derived
again at read. Read currency treats a missing/noncontiguous/digest-invalid
predecessor chain as stale; it never requires the historical predecessor itself
to remain the current pointer. `fabric.v1.topology-wave.append` authenticates the current chair,
derives predecessor as null only for the zero-pointer arm or as the exact
expected/current plan ref, plus all plan-owned identity/authority/policy/time/
digest fields, and commits
plan, pointer and immutable receipt together. Exact command replay by request
digest returns the receipt before live checks; changed replay conflicts.
Current/list operations map only the discriminated Spec 01 projection and
ordinary scoped page envelope; missing pointer is unavailable/null and an
existing pointed plan is always the nonnull current or stale arm. No row grants authority, automatically chooses a
topology or creates a second chair/policy state machine.

Context pressure is operational state, not spend or authority budget. Existing
provider generation/context-revision telemetry remains append-only and
lifecycle-owned as specified in sections 9.22 and Spec 01 section 32.20. The
baseline `agent_adapter_bindings` relation adds exact
`UNIQUE(run_id, agent_id, adapter_id)` beside its existing `(run_id,agent_id)`
primary key. The separate truthful projection foreign-keys that exact active
agent/adapter identity:

```sql
provider_context_pressure_current(
  run_id, agent_id, adapter_id, provider_generation,
  context_revision, observation_source_event_id,
  pressure, source, confidence,
  window_tokens, used_tokens, remaining_tokens,
  observed_at, expires_at, evidence_digest, revision,
  PRIMARY KEY(run_id, agent_id),
  FOREIGN KEY(run_id, agent_id, adapter_id)
    REFERENCES agent_adapter_bindings(run_id, agent_id, adapter_id),
  FOREIGN KEY(run_id, agent_id, observation_source_event_id,
      provider_generation, context_revision, evidence_digest)
    REFERENCES provider_context_observation_audit(
      run_id, agent_id, source_event_id, provider_generation,
      context_revision, evidence_digest),
  CHECK(pressure IN ('low','medium','high','unknown')),
  CHECK(source IN ('native-exact','native-estimated','hook-boundary','unavailable')),
  CHECK(confidence IN ('exact','estimated','unknown')),
  CHECK(expires_at > observed_at),
  CHECK(source != 'unavailable' OR
    (pressure='unknown' AND confidence='unknown' AND window_tokens IS NULL AND
     used_tokens IS NULL AND remaining_tokens IS NULL)),
  CHECK(source != 'native-exact' OR
    (confidence='exact' AND window_tokens IS NOT NULL AND
     used_tokens IS NOT NULL AND remaining_tokens IS NOT NULL AND
     used_tokens + remaining_tokens = window_tokens)),
  CHECK(source != 'native-estimated' OR
    (confidence='estimated' AND window_tokens IS NOT NULL AND
     used_tokens IS NOT NULL AND remaining_tokens IS NOT NULL AND
     used_tokens + remaining_tokens = window_tokens)),
  CHECK(source != 'hook-boundary' OR
    (confidence IN ('exact','estimated') AND
     ((window_tokens IS NULL AND used_tokens IS NULL AND remaining_tokens IS NULL) OR
      (window_tokens IS NOT NULL AND used_tokens IS NOT NULL AND
       remaining_tokens IS NOT NULL AND
       used_tokens + remaining_tokens = window_tokens)))),
  CHECK(confidence != 'unknown' OR pressure='unknown')
)
```

Token fields are nullable nonnegative integers and satisfy the displayed closed
source/confidence/nullability/arithmetic checks. `pressure='unknown'` whenever
the current-window basis cannot be proved. Cumulative provider usage cannot populate current-window
pressure unless the adapter contract defines it as such. No row reserves,
consumes or releases provider budget. Observation update CASes the same
provider-generation/context-revision ordering already owned by lifecycle;
lower/reordered input is audit-only and cannot regress the projection or infer
principal/bridge generations.

`fabric.v1.provider-context-pressure.read` and the negotiated scoped operator
System projection map this row exactly to Spec 01
`providerContextPressureV1`. The row's adapter and composite observation-audit
foreign key populate the corresponding wire fields. Read snapshot time derives
the discriminated Spec 01 current/stale nonnull or unavailable-null arm and
`ageSeconds` from `observed_at/expires_at` without a write; no stored or
projected percentage exists. Missing row projects unavailable, not zero
pressure.

Automatic pressure thresholds, hysteresis, maximum compaction counts and
successor selection are absent. Existing explicit lifecycle custody remains
the only rotation/compaction mutator, preserves fresh-rotation versus
same-history recovery, and keeps parent/child custody independent.

Operational spans are append-only, bounded and content-free. Export validates
the Spec 01 codec and rejects prompts, answers, tool arguments/results,
artifact bytes, private messages, capabilities and absolute paths rather than
redacting after persistence. Generic span export never satisfies receipt,
authority, review, disclosure or gate evidence.

Verification adds schema-generation parity; discovery manifest/artifact digest
equality and exact registration-revision foreign keys; capability current-
pointer, expiry and same-body refresh races;
effective-configuration subject/activation lineage; raw/normalised effort and
duplicate-subject rejection by all three partial unique indexes;
native-mode round-trip; actual review-route proof and every observed route-
field mismatch; exact cut-custody ref joins; point-of-use body/
permission/surface drift before effect; ambiguous-effect non-rerouting; honest
observed unknown; topology append/CAS/stale/authority joins; context-pressure/
budget separation, composite observation join, discriminated stale read,
crossed-arm rejection and no percentage;
lower/reordered observation; and telemetry content-denial fixtures. Full crash
matrices prove there is one route owner and that lifecycle recovery remains
ahead of generic provider recovery.

The generated baseline schema audit prepares every relation under
`PRAGMA foreign_keys=ON`, runs `PRAGMA foreign_key_check`, and inserts negative
fixtures for crossed artifact revision, agent adapter, topology task/chair,
rationale registration and route discovery-surface identities. No child relies
on trigger prose where the displayed composite foreign key can enforce the
relationship.

### 9.24 Exact Console read persistence and daemon owner

The daemon is the sole owner of the section 32.22 read surface. It reuses the
current baseline, the existing operator snapshot revision and existing route
and preparation codecs. No Console database, materialised route copy,
action-ID-only lookup, legacy projection or migration shim is permitted.

`review-target-preparation.current.read` authenticates the point-of-use
operator credential for the exact project/session/run, proves the credential's
project ID, then reads `review_target_preparation_high_water`. An existing run
with no high-water row, or generation zero with no preparation row, maps to
unavailable. A missing or zero high water while any preparation row exists for
that run is integrity failure, as is any unequal preparation/target/bundle
high-water triple. A positive equal triple must equal the run's greatest stored
preparation generation, have exactly one matching row, and equal that row's
reserved target and bundle generations. A NULL, negative or otherwise out-of-
domain high-water or preparation generation is always integrity failure; no
aggregate may hide it. The same read transaction first rejects invalid-domain
rows, then compares all three high waters, `MAX(preparation_generation)` and the
matching row. Both active and terminal rows are eligible; state is not a locator
filter. The existing per-ID read mapper
produces the nested value so
phase, progress and terminal correlation cannot drift. The wrapper generation
equals the high-water/row generation, while the accepted receipt reproduces
the exact session/run and preparation ID. Operation failures use the existing
closed `reviewTargetPreparationReadErrorV1` codec unchanged.

Stable route-list membership uses an allocation ordinal, not the daemon-global
projection revision. The current squashed baseline extends its existing
relations as follows; these are current columns, not a compatibility migration:

~~~sql
provider_route_list_high_water(
  run_id PRIMARY KEY, route_ordinal NOT NULL, revision NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(run_id),
  CHECK(route_ordinal >= 0), CHECK(revision >= 1)
)

provider_actions(
  ...existing pair-keyed columns...,
  route_ordinal, route_listed_at,
  UNIQUE(run_id, route_ordinal),
  UNIQUE(adapter_id, action_id, run_id, task_id, route_ordinal),
  CHECK((task_id IS NULL) = (route_ordinal IS NULL)),
  CHECK((route_ordinal IS NULL) = (route_listed_at IS NULL)),
  CHECK(route_ordinal IS NULL OR route_ordinal >= 1)
)

provider_action_routes(
  adapter_id NOT NULL, action_id NOT NULL, run_id NOT NULL, task_id NOT NULL,
  route_ordinal NOT NULL,
  certifying_review NOT NULL CHECK(certifying_review IN (0, 1)),
  target_generation, slot, attempt_generation, reservation_digest,
  created_at NOT NULL,
  ...existing route/admission/configuration columns...,
  PRIMARY KEY(adapter_id, action_id),
  UNIQUE(run_id, route_ordinal),
  FOREIGN KEY(adapter_id, action_id, run_id, task_id, route_ordinal)
    REFERENCES provider_actions(
      adapter_id, action_id, run_id, task_id, route_ordinal),
  FOREIGN KEY(adapter_id, action_id, run_id, target_generation, slot,
      attempt_generation, reservation_digest)
    REFERENCES review_finding_capacity_reservations(
      adapter_id, action_id, run_id, target_generation, slot,
      attempt_generation, reservation_digest),
  FOREIGN KEY(run_id, target_generation, slot)
    REFERENCES review_slot_heads(run_id, target_generation, slot),
  CHECK(route_ordinal >= 1),
  CHECK(
    (certifying_review = 1 AND
      target_generation IS NOT NULL AND slot IS NOT NULL AND
      attempt_generation IS NOT NULL AND reservation_digest IS NOT NULL) OR
    (certifying_review = 0 AND
      target_generation IS NULL AND slot IS NULL AND
      attempt_generation IS NULL AND reservation_digest IS NULL)
  )
)
~~~

Task-bound answer-bearing action admission increments the run high water,
keeps it equal to the run's greatest allocated route ordinal and equality-
copies that positive ordinal to action and route in the same transaction. It
also writes the action's immutable `route_listed_at` and equality-copies that
timestamp to the route row's `created_at`; every read arm exposes
that action column as `createdAt`, including when the route row is missing or
untrusted. The route row's own `created_at` remains internal and is equality-
checked against `route_listed_at` when present; it does not extend or replace
the canonical nested `providerRouteV1` shape.
Resolver/preflight failure that creates no action allocates no
ordinal. Ordinals never recycle. The provider action survives legitimate route
missing/integrity recovery and therefore remains the list membership owner.
Task-bound provider-action rows cannot be deleted and their run, task, ordinal
and `route_listed_at` fields are immutable; current-baseline triggers abort
either mutation.
Every route, dispatch, observation or recovery-state advance also increments
that action's existing `journal_revision`; the read wrapper exposes it as
`routeRevision`. No route bytes or freshness label is copied into another
store.

The current baseline adds these supporting indexes:

~~~sql
CREATE INDEX review_target_preparations_current_lookup
  ON review_target_preparations(
    run_id, preparation_generation DESC, preparation_id
  );

CREATE INDEX provider_actions_operator_route_page
  ON provider_actions(run_id, route_ordinal, adapter_id, action_id)
  WHERE route_ordinal IS NOT NULL;

CREATE INDEX provider_action_routes_operator_task_page
  ON provider_action_routes(
    run_id, task_id, route_ordinal, adapter_id, action_id
  );

CREATE INDEX provider_action_routes_operator_review_page
  ON provider_action_routes(
    run_id, target_generation, slot, route_ordinal, adapter_id, action_id
  ) WHERE certifying_review = 1;
~~~

The route read starts from exact `(adapter_id,action_id)` in
`provider_actions`, then equality-joins task/run/requested session and left-
joins the pair-keyed route, dispatch, observation and live route-recovery
owner. An exact action pair whose `route_ordinal` is null is not an answer-
bearing route-list member and returns `NOT_FOUND`; its lack of route/recovery is
legitimate. An intact listed row maps through the existing full
`PROVIDER_ROUTE_V1_CODEC`.
A recovery-owned missing/integrity-failed state maps the null route/evidence
arm and copies immutable action `route_listed_at` to wrapper `createdAt`. No
route plus no exact recovery evidence is an operation integrity error, not an
invented missing arm. Every child is pair-keyed; no caller-stamped
adapter ID and no action-only query may participate. Crossed parents are scope
or integrity errors, never partial route objects.

Route list starts from exact authenticated run actions with nonnull route
ordinal. Every page scans at most 256 consecutive unfiltered members strictly
after the cursor's last-scanned tuple and at or below the watermark. It first
classifies each scanned member through either the canonical present route or the
composite-FK-bound recovery arm. Any orphaned, crossed or unparseable member
fails the whole list with `INTEGRITY_FAILURE`. Only then does it apply nullable
task, target and slot predicates in SQL. Target/slot filters join either the
immutable certifying route fields or the exact daemon-derived recovery-custody
tuple; they never trust a route whose integrity failed or silently exclude an
unclassifiable member. Its immutable order is
`(route_ordinal,adapter_id,action_id)`. The first
page captures `provider_route_list_high_water.route_ordinal` and applies
`route_ordinal <= :watermark` to its rows in the same SQLite read transaction;
later pages bind and apply the same watermark. A missing high-water row while
any run action has a nonnull route ordinal, or a stored high water that differs
from the greatest allocated ordinal (zero when there is no such action), is
`INTEGRITY_FAILURE`, never an empty or truncated page. Greatest ordinal is read
by the declared route-page index's last key, not a whole-set count.
A missing high-water row when the run has no nonnull route ordinal is exactly
watermark zero.
In the first-page read transaction, before any nullable filter, the daemon
begins incremental contiguity proof at ordinal one. Each later bounded
scan begins at the authenticated cursor's last-scanned ordinal plus one; every
row must equal the expected successor. Missing that successor at or below the
watermark is `INTEGRITY_FAILURE`, and the cursor becomes null only when last-
scanned equals a positive watermark; watermark zero returns null immediately.
Unique positive ordinals plus the non-delete/
immutability triggers complete the proof without a whole-run count.
Continuous appends therefore
cannot force resnapshot or starve progress. Each page derives the latest pair-
keyed state, action journal
revision and freshness at its single `readAt`; all item read clocks equal the
page clock. The authenticated opaque cursor binds capability/principal,
operation, project/session/run, filters, watermark and last-scanned ordering tuple;
decode validates its closed version, bounds and strict forward progress before
query construction. Request and result use the same closed opaque cursor codec
with a 1,024-byte UTF-8 maximum and bind the last-scanned, not merely last-
returned, tuple. `pageSize` is at most 8. Generated schema bounds prove the
complete encoded RPC response containing 8 maximal routes, actual request ID
and maximal next cursor fits the negotiated 1,048,576-byte maximum. The bound
uses the exact JSON encoder and worst legal UTF-8-to-JSON expansion, including
six wire bytes for an escapable one-byte control character, maximal numeric/
timestamp values and every key/delimiter/final LF; schema examples are not the
bound. The scan stops before another member once the requested `pageSize` matches (at most 8)
are collected or after 256 members.
It advances the cursor across classified nonmatches; an empty page with a
nonnull cursor is progress, and null means the watermark was exhausted. No
ordinal is classified twice in one traversal; watermark zero is immediately
exhausted. Reads never persist freshness or
duplicate route bytes.

Operator projection source queries are likewise exactly scoped. Work, Agent and
Activity
rows join `projects -> project_sessions -> runs -> tasks|agents`; source rows,
summary builders, detail references and detail readers carry the same project/
session/run/local-ID tuple. Activity message-body refs and reads equality-carry
that tuple, and embedded task/agent IDs inherit it. Evidence derives the closed project/session/run
scope arm from its actual nullable registration columns and always includes
project ID; nonnull Evidence task ID requires the run arm. It never flattens on `evidence_id` alone, never invents a run for a
project file or private Git diff, and never drops those approved Evidence rows.
The existing projection transaction constructs the section 32.22 composite ID
with the pinned view prefix and rejects duplicate item IDs before publication.
Detail reads equality-check outer scope, detail-ref scope and source row at the
requested snapshot. Run-local IDs reused under another run therefore coexist
without collision and cannot cross-select.
Work source pages order by
`(project_id,project_session_id,run_id,task_id)` and Agent source pages by
`(project_id,project_session_id,run_id,agent_id)`. The existing numeric cursor
is the position in that exact snapshot order; local-ID-only ordering is
forbidden. Activity pages retain reverse source revision and total tie-break by
`(source_revision DESC,project_id,project_session_id,run_id,event_id)`.

The operation registry declares all three as operator-only under
`console-read-identity.v1`. The current Console requires that feature and the
1,048,576-byte frame maximum during initialize; absence is incompatible, not a
legacy fallback. When the daemon's offered registry contains the feature,
current-project operator `read` credential provisioning shall preissue all
three exact operation names; initialize never mints them. Initialize intersects
those preissued operations with the negotiated required feature and operator
principal, and current-Console initialize fails incompatible unless the
resulting `allowedOperations` contains all three. Every request carries that credential and project ID;
point-of-use authentication revalidates
project authority generation, active seat, project/session/run, principal
generation, operation subset and expiry. These reads do not require or mint
chair authority. The private control protocol exposes no new mutation or
filesystem path.

Implementation is TDD. Database fixtures deliberately reuse task and agent IDs
across two runs. Distinct Activity rows in both runs prove row/summary/detail/
message-body reads
must stay in the exact run. Evidence retains its globally unique artifact ID while a
cross-scope detail request must fail for the right reason. Tests cover absent/
zero/positive, NULL/negative, crossed-triple and lagging high water, NULL/
negative or crossed reserved preparation generations, active and every terminal
preparation state, pair-
keyed route reads, declared columns and conjunctive indexes, ordinal allocation
and non-reuse, continuous-append page progress, generic versus certifying
filters, missing/integrity-failed recovery arms, cursor/filter/principal/
watermark substitution, expired capability freshness, action journal revision
on every route child change, closed error/digest arms, maximal digest item IDs,
maximal single-route frame fit, worst-case 8-route page fit and a no-
action-ID-only-query source assertion. Frame limits use a maximal 1,024-byte
request/result cursor. Negative route-arm fixtures reject null
and half-null certifying identity plus crossed/null/mutated recovery custody and
crossed present-route target/slot/attempt/reservation custody, plus direct-SQL
null high-water/route identity. Attempt-allocation fixtures reject
gap, reuse, crossed capacity target/slot, null owner/state, nonnull preflight/
released state and split slot-head/reservation/
action/route admission commit. An interior ordinal-gap fixture on a later page fails before
task, target or slot filtering; crash/restart tests prove admitted action
membership cannot be deleted or renumbered.
An exact non-answer-bearing action-pair read returns `NOT_FOUND`, while only a
nonnull-ordinal member lacking both route and recovery fails integrity.
Target/slot filters cannot hide that orphan, and multi-page Work/Agent/Activity fixtures
with reused local IDs prove total-order pagination without gaps or replay.
A selective-filter load fixture accepts empty progress pages, scans no more than
256 members per page and classifies every ordinal at most once.
The zero-watermark fixture returns an empty page with null cursor immediately.
Initialize fixtures reject a missing feature, each missing preissued or
intersected operation and a narrowed frame maximum; the positive arm returns all
three, and a wrong-reason negative proves initialize never adds an operation to
the credential.
Protocol/daemon contract tests prove the nested preparation and present route
values are produced by their existing codecs. Full migration generation,
foreign-key check, schema, runtime, evaluation and load gates remain binding.
