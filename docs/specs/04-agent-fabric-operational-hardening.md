# Agent fabric operational hardening

Status: Console daemon-lifecycle, provider-budget, review-snapshot, route-lineage, decision-projection, seat-generation and answer-bearing review extension approved; implementation in progress; final human acceptance pending
Version: 1.26
Date: 13 July 2026
Risk: Crucial
Chair: Codex
Independent design peer: Claude Code

Version 1.26 makes complete delivery review bytes, publisher/session lineage,
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

Implement the remaining evidence-backed findings from the
[external review adjudication](../research/gpt-sol-pro-review-adjudication.md)
without reopening the accepted architecture in Specs 01–03.

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
This is the source of `provider_action_ref_v1`, not an artifact projection.
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
status and receipts expose the typed `provider_action_ref_v1`; they never
fabricate an effect artifact to represent journal state.

### 9.9 Atomic custody, outcomes and retry

For an initial attempt, `prepareInTransaction` CASes `awaiting_launch` to
`launching`. For a retry, it CASes `launch_failed` to `launching`, replaces the
session packet path/digest with the newly reviewed reference and increments the
session revision. It then atomically creates or revalidates all of these rows:
coordination run; narrowed authority and budget; exactly one chair; random
capability hash; chair lease and mailbox; adapter binding;
project/session/run resource scopes and dimensions; a launch reservation whose
daemon-derived ID and `operation_id` bind the provider action; prepared
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
authority_revision)`, its full authority tuple is unique, and it has a
composite foreign key to `runs`. Insert/update triggers require the current
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

Migration 0013 creates one hash-only integration credential table. Its unique
identity binds capability ID and token hash to integration ID, project,
principal generation, provider ID, provider-session reference, closed granted-
operation JSON, issue/expiry/revocation timestamps and revision. Insert/update
triggers reject unknown operations, empty grants, mutable identity fields,
generation rollback, expiry before issue and any grant outside operations whose
registry principal set includes `integration`. Revocation is monotonic. No raw
credential column, compatibility backfill or project-wide wildcard exists.

Trusted daemon composition owns provisioning; the public socket exposes no
credential-issuance operation. Provisioning is idempotent only for an identical
binding and token hash, uses the `afi_` family and returns the raw value once to
the in-process/provider bridge. Authentication uses constant-shape hash lookup,
expiry/revocation checks and the operation registry to produce the existing
closed integration principal/grant. Dispatch has an explicit integration
branch; it never falls through the operator dispatcher. For input attestation,
the branch reloads the credential by connection hash and supplies the bound
provider identity/session to `OperatorStore`, which compares them to the
provider-native event before insert.

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
- real Unix-socket integration negotiation and dispatch, one successful
  native callback flow, connection-hash rebinding checks and zero operator
  fallthrough;
- wrong, missing, extra, duplicate and reordered gate/release digest vectors
  at record and resolve time, plus sentinel and explicit-operator matching;
- every ineligible native-event arm, message/event replay, wrong provider/
  session/project/generation and changed gate/provenance with zero mutation;
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
envelope and action-only review-bundle portal. Its model-visible namespace has
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

The current evidence/artifact-kind catalogue explicitly contains delivery-
requirement-map.v1, implementation-delivery-manifest.v1 and coordination-gate-
snapshot.v1; none
is inferred by parsing generic receipt content. Their persistence owners are:

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
review_bundles(
  run_id, bundle_generation, delivery_run_id,
  review_basis_revision, review_basis_digest,
  delivery_artifact_id, delivery_artifact_revision,
  base_object_id, head_object_id, head_tree_id, index_tree_id,
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

~~~

Normalised changed-file, required-evidence and carried-open-finding child rows
own the complete sorted coverage manifest and foreign-key every object they
name. Carried findings include immutable safe ID/severity/summary/evidence and
origin target/action/result, artifact revision and source-state digest. A
repair-required successor must advance both artifact/delivery revision and
source-state digest from every origin; identical-byte reprepare fails. Checks enforce the
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

Digest construction follows Spec 01's acyclic order: JCS manifest body with no
self/later digest -> raw body pages -> JCS root -> JCS final bundle ref; each
digest is stored outside its own bytes. The mandatory set is root + every
manifest-body page, which contains every full carried finding, and
the delivery manifest/map plus required accepted-scope/spec/ADR/decision/gate-
decision/coordination-snapshot objects.
Target commit rejects more than 80 unique root/page/chunk responses or 6 MiB
mandatory bytes. Limits are 4,096 changed paths, 1,024 evidence rows, 256
carried findings, 16,384 objects, 32,768 deterministic 64-KiB chunks, 16 MiB per
object, 64 MiB unique object bytes, 4 MiB search index and 256 KiB risk-map
output. All changed-file diffs and other evidence remain completely available.
The AFAB-004 measured gate records the live
c2fc623a2529f87feca27982e1a140969ab5a258..baebc1e catalogue as 636,420
bytes and the prospective v4 owner-spec set as a separate 621,586-byte design
input. The final target recomputes exact bytes; with the full 2 MiB risk-sample
ceiling it must materialise under 6 MiB mandatory/10 MiB combined wire bytes.
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

Target preparation uses three phases without a long SQLite transaction:

1. phase A authenticates the current chair; captures the eligible delivery
   artifact/lineage, sealed delivery review basis, current chair/provider
   snapshot, activated adapter contracts/profile schema and exact trusted Git
   base/head/index/worktree state; and snapshots all four predecessor head
   revisions, attempt generations/states and canonical open/repair-record
   digests;
2. outside SQLite, the fixed Git/evidence readers enumerate every changed file,
   required evidence and full carried-open-finding record; no-follow read exact
   bytes; build all deterministic before/after/diff/finding objects; write
   create-exclusive chunks/pages/root under their digests; and fsync/re-read;
3. phase B reauthenticates and equality-CASes every captured revision/digest and
   all four head/attempt/open/repair tuples, rejects any nonterminal attempt,
   then inserts
   the bundle metadata/coverage, supersedes the old target, inserts one current
   review_completion_target and its resolved profile/slots, and creates four
   generation-zero review_slot_heads in one transaction.

A content collision, duplicate/omitted coverage row, dirty index/worktree,
source/evidence/head/attempt change or any digest mismatch leaves no target or metadata
row. Run-owned garbage collection may later remove only unreferenced,
manifest-classified private chunks under retention policy; it never touches
project or Git bytes.

review_completion_targets stores exact target generation, task, delivery
artifact/lineage, review basis/source state, bundle/coverage/manifest digests,
target chair agent/principal/lease generation/adapter/family/model/route,
resolved profile/schema, bundle-search/risk-map and mandatory-read-set/count/
byte digests. A partial unique index permits one current row
per run. The only update is current to superseded. Every operation invokes
the same pure currency predicate. Reads derive stale-target without a write or
global-revision advance. A new certifying dispatch or optional annotation
rejects stale currency without changing target state. The action-bound terminal
evidence transaction instead always settles and advances its reserved head.
Only new target preparation atomically supersedes the old row while inserting
its successor.

Prepare request uses expected target generation zero iff no target exists and
the exact positive current generation otherwise. The command receipt/input
digest stores that sentinel; wrong zero/positive/current combinations conflict
before bundle work.

review_profile_snapshots and review_profile_slots normalise the exact four-slot
target snapshot. The checked-in schema/profile catalogue digest is verified at
startup. Slot rows contain adapter class/ID/contract, family/model, aliases,
effort/source mode, provider/internal-step/read ceilings and explicit
reviewer-independence requirement. Publisher eligibility remains the separate
proved lineage/family-equals-target predicate. The baseline
requires exactly native, other-primary, cursor-grok and agy-gemini and enforces
the exact Spec 01 mapping. Native is exempt; all three external slots require
reviewer family distinct from target-chair family. No publisher-independence
column/blocker exists. Missing or extra slots prevent target commit.

The action-only portal authenticates an ephemeral capability hash bound to
action, target, bundle, coverage digest and expiry. Its MCP server name is
agent-fabric-review-bundle and its only tools are review_bundle_read and
review_bundle_search. initialize/initialized, ping and tools/list/call are
allowed. resources/list, resources/templates/list and prompts/list return exact
empty arrays; resource read/subscription, prompts/get and sampling/roots/
completion/elicitation/logging are denied. It reads only committed root/page/
object/chunk joins and verifies their complete digest chain.

Read payloads use RFC 4648 padded base64. Raw root/page/chunk bytes are at most
65,536; encoded payload is at most 87,384 bytes, all other canonical JSON-RPC/
MCP envelope and metadata bytes are at most 8,192, and the complete read
response is at most 98,304 bytes. The journal/ledgers debit exact complete
canonical wire bytes. Target prepare materialises every mandatory response and
proves aggregate fit. Search retains its separate 65,536-byte response limit;
exact-bound binary/page/root/empty/search fixtures gate activation.

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
the model tool namespace; model-visible non-secret env; empty read-only cwd;
one action-only portal, direct or through the pinned
agent-fabric-review-portal-helper stdio executable whose trusted absolute path,
inode/digest and fixed `--stdio` argv are contract-bound; no inherited user/project path, unrelated plugin/source
MCP effect, workspace index, shell/write/browser/general-network effect; outer
OS confinement and live canaries;
fixed provider transport; process-tree
deadline that sends TERM to the complete helper/CLI process group and KILL
after 250 ms, proving no descendant remains; and output/capsule/portal cleanup. Unsupported adapter/platform
combinations advertise false. The exact activated contract digest and source
mode are stored in each resolved profile slot and route.

Claude/Codex expose the named portal server/tools directly. Cursor/Agy launch
only the pinned helper as adapter-internal bootstrap. It connects to a per-
action daemon AF_UNIX broker that verifies UID, action PGID, executable path/
inode/digest and one-use private-descriptor binding; capability stays broker-
side. Their model allowlist is exactly
mcp(agent-fabric-review-bundle/review_bundle_read) and
mcp(agent-fabric-review-bundle/review_bundle_search). Every other model mcp,
command, filesystem, shell, browser/web/network, resource and prompt effect is
denied. Exact-empty list probes remain permitted as above.

Agy hooks allow only the two MCP tuples and adapter-owned bootstrap, then deny
read_url(*), execute_url(*), read_file(*), write_file(*), every other mcp(*) and
command(*). An auth file in synthetic HOME requires a passing absolute auth-read
denial canary. Cursor receives only per-action synthetic HOME/workspace/data
directories, no global CLI config, and exposes those two MCP tools while denying
Read/Write/Shell/WebSearch/WebFetch and all unrelated MCP/resources. Current-
build canaries prove both positive tool calls, exact discovery/empty list probes,
every negative, broker identity/one-use binding and process-group cleanup. They
also prove every pinned provider/helper/trampoline descendant cannot escape by
`setsid` or an equivalent daemonisation path; group cleanup alone is not proof.
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
file descriptors, process/peer identity, inherited binding and AF_UNIX bytes.
TypeScript retains JSON semantic framing, MCP schema, hook parsing/policy and
canonical journalling, so there is one protocol implementation and no native
JSON parser.
If any adapter cannot enforce the capability,
target prepare or dispatch fails before router/provider I/O and budget/action
insert.

provider_action_routes remains one insert-only row for every task-bound
answer-bearing action. For certifying review it additionally stores exact
target, slot, slot-head generation at dispatch, delivery artifact/lineage,
bundle/manifest/coverage, profile/schema, final-prompt and target-chair snapshot
fields. Non-review actions store those as null. Canonical route request/receipt
JSON follows the one checked-in structural model-route.v1 schema; no database
or artifact predicate exists in that codec.

Its normalised certifying columns map one-for-one to
providerRouteProjectionV1: route request/receipt digests, adapter/contract,
family/model, requested/effective effort, target/slot, reviewed artifact,
publication lineage, bundle/root/coverage/search/risk/mandatory-set/prompt
digests, target chair agent/principal/lease/adapter/family/model/route,
profile digest and slot-head/attempt generations. Public action read never
reconstructs a route. With `route_state=present` it joins that immutable row;
with `missing` or `integrity-failed` it instead projects a null route plus the
safe route-recovery evidence digest owned below. It then joins
provider_review_terminal_journal, whose unique key is
run/action/target/slot/attempt and whose immutable columns are terminal kind,
terminal-input digest, private answer/result/adapter-result digests,
authenticated-usage digest, read-journal digest, public terminal projection
digest and optional evidence-mutation-receipt digest. An append-only terminal
integrity-conflict row records a changed input digest without updating either
owner.

Replay/input digest classification occurs before router work. The in-process
mutex key is exactly run, authenticated actor and action. Its owner digest joins
exact concurrent retries; a different digest waits and conflicts before a
router call. A five-second process-group-bounded resolver produces only a
candidate receipt. The admission transaction then rechecks effort
applicability, target/artifact/source currency, slot-head generation,
chair/adapter contract and resolved adapter/family/model/effort against the
profile and provider payload. It inserts route/action/reservation/command
atomically.

For certifying dispatch, the authenticated principal must be the current target
chair at the target principal and lease generations. Exact durable replay is
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
- provider-terminal-failure: one closed max-turns-exhausted,
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
result_digest uses the exact answer/failure canonical domains in Spec 01 and
excludes usage.

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
  open_finding_digests_json,
  repair_required_finding_digests_json,
  prior_target_generation, prior_target_head_evidence_id,
  revision, updated_at,
  PRIMARY KEY(run_id, target_generation, slot)
)
~~~

Target creation inserts exactly four rows. It carries forward each predecessor
slot's complete safe open records and repair-required sets, but no predecessor
evidence becomes current for the new target. Head and attempt generations are
contiguous. Canonical arrays are sorted/unique/digest-valid. A head evidence
foreign key matches the same run/target/slot/generation.

provider_review_evidence is immutable and includes target/slot, prior and new
head generations, prior evidence, complete prior open set, separately stored
provider-reported-resolved and daemon-accepted-resolved prior sets, current
finding set, complete new open set,
repair-required set, action/result/route/bundle/coverage/profile/chair and safe
reviewer-independence/annotation/read-coverage fields. It also stores the exact
task, answer/result safety digests and final-prompt route join required by
reviewEvidenceReadV1. It contains no currency column.

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

fabric.v1.review-evidence.annotate writes only an optional current-chair
non-gating annotation against exact existing evidence/result/head. It cannot
create evidence or change head/verdict/findings/repair/reviewer-independence/
completion.
Exact annotation replay returns its immutable receipt before live-chair check.
The dispatch command's original prepared/dispatched receipt is immutable and
never gains terminal fields on replay. Terminalisation has a separate internal
action/target/slot/attempt idempotency journal and stores the canonical terminal-
input digest over terminal kind, private answer/adapter-result digests,
authenticated usage and read-coverage journal. Exact duplicate returns the
stored terminal projection. Changed live-callback/lookup input appends an
integrity quarantine, never overwrites result/evidence/head/settlement and makes
completion emit integrity-failure. provider-action.read exposes the terminal
result and automatic mutation receipt. Neither receipt contains currency.

A first or second FINDINGS action therefore always progresses linearly. A
repaired target carries each prior finding's full safe content and origin
action/result as mandatory bundle evidence, then permits CLEAN to close it.
Target prepare rejects any predecessor nonterminal action and cannot commit
until every safe/UNUSABLE terminal has atomically reached its head. No source
change can launder a late finding.

An ambiguous/awaiting-human-retire attempt remains nonterminal and owns its
target/slot/head/reservation. It blocks sibling dispatch, target reprepare/
supersession and review/run acceptance or close until proved terminal recovery
or confirmed retirement. This freezes budget and gates review/liveness.

Read/list responses join immutable evidence to a freshly derived
review_evidence_currency value. Exact command replay never performs that join.
Operator Evidence row/detail uses the exact operatorReviewEvidenceRowV1 union
under operator project/session/run scope. Its view joins task/action, terminal
kind/safety/failure code, answer/result, route/final-prompt, adapter/family/
model, bundle/coverage, severity/open counts, reviewer independence and safe
detail fields without raw content.

#### 9.21.5 Completion and deterministic projection

ReviewCompletionReducer first runs target currency checks, then reads one
current target, one resolved four-slot profile and exactly four slot heads.
It never scans for an unsuperseded latest row. For each head it validates the
latest action/evidence chain, target/bundle/route/chair/profile joins,
reviewer-independence and complete open-finding set.
Its query columns map one-for-one to reviewCompletionV1: target chair/artifact/
lineage/bundle/root/coverage/risk/mandatory/profile digests and, per slot, head/
attempt/action/evidence/verdict/result/route, resolved adapter/family/model,
read coverage, reviewer-independence disposition, certifying state, complete open
records and ordered blockers.

It emits only the ordered closed blockers in Spec 01. open-findings is the sole
finding blocker. A proved no-answer/max-turn terminal result emits
provider-terminal-failure; terminal no-effect and human-retired unknown emit
their exact blockers; route-integrity covers a terminal but unverifiable route
chain. ambiguous-action is reserved for unproved provider effect/outcome.
Missing head evidence emits missing-evidence. Zero/multiple targets or a missing
profile return the exact top-level blocker/empty-slot union in Spec 01. With a
valid profile, exactly four rows exist; stale-target is top-level and is not
copied into rows. Zero/multiple heads or a broken chain emits integrity-failure.

The operator System/Evidence projection and agent completion read call this
same reducer. Mutation receipts do not. fabric-receipt.json exports only closed
safe route, target, bundle/coverage/profile, slot-head, evidence and recovery
digests through exact `reviewCompletion`, `providerRoutes`, `providerReviews`
and `routeIntegrityRecoveries` codecs in Spec 01 section 19. It contains no raw
answer/error, private diagnostics, bundle bytes, portal transcript, prompt,
secret HMAC, adapter result or usage.

#### 9.21.6 ProviderRouteIntegrityRecoveryService

route_integrity_recoveries is one-to-one with an affected certifying provider
action and is the only startup/ambiguity recovery owner for every certifying
action, whether its joins are intact or contradictory:

~~~sql
route_integrity_recoveries(
  run_id, adapter_id, action_id,
  recovery_generation, owner_daemon_generation,
  state, reason, terminal_disposition, reservation_id, reservation_digest,
  route_state, route_receipt_digest, recovery_evidence_digest,
  lookup_state, lookup_evidence_digest, settlement_digest,
  created_at, updated_at,
  PRIMARY KEY(run_id, adapter_id, action_id)
)
~~~

State is detected, inspecting, terminal-proved-no-effect,
terminal-proved-usage, awaiting-human-retire or terminal-retired-unknown. The
row joins the exact action and reservation/digest. reason and terminal
disposition use the exact closed receipt-v2 enums. lookup_state is not-
attempted, in-flight or completed, with evidence digest non-null exactly for
completed. Nonterminal states have null disposition/settlement; proved-no-
effect, proved-usage and retired-unknown use their exact receipt-v2 disposition
arm and a non-null settlement digest. Insert fences further provider I/O,
marks the action noncertifying while unresolved and freezes only that
reservation's dimensions. All certifying route/action rows are excluded from
generic startup recovery and prepared-action re-enqueue.

`route_state` is exactly present, missing or integrity-failed. Present requires
the immutable route-receipt digest and an exact join to provider_action_routes;
missing/integrity-failed require that digest null and a non-null safe recovery-
evidence digest. The service owns that discriminator and evidence atomically;
no reader, receipt exporter or Console projection may infer or reconstruct a
route from provider, action, bundle or prompt remnants.

The service runs before generic provider recovery. Prepared with durable
zero-dispatch proof releases the full reservation and terminalises no-effect.
Every dispatched/accepted/ambiguous state permits at most one bounded pair-keyed
lookup when supported. Exact safe/unusable/failure terminal input enters the
ordinary action-bound terminaliser; complete authenticated usage settles
exactly and absent/partial usage charges the remaining spendable reservation.
Authenticated closed no-effect releases. A proved effect with an unverifiable
binding conservatively settles as integrity-terminal. Absent, timeout,
malformed, conflict or unavailable lookup enters awaiting-human-retire and
retains the reservation. No branch reconstructs route/bundle/prompt,
dispatches, retries or creates evidence outside the ordinary valid-answer
terminaliser.

provider-route-integrity-retire is a closed typed operator-action intent. It
binds the exact action/recovery generation, current state and reservation
digest; requires external-effect capability, one matching consequential gate
and independently attested direct-human confirmation; and has no provider port.
Confirmed Commit consumes the full remaining spendable reservation, releases
only terminal concurrency capacity, records terminal-retired-unknown and
terminalises the action. Wrong/stale authority, gate, generation, digest or
confirmation changes nothing. The human result is labelled retired-unknown,
never no-effect or provider-failed.

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
  before/during/phase-B source or delivery mutation; the AFAB fixture proves
  601 changes/1,434 objects/27,607,019 bytes/largest 4,097,314 bytes fit one
  bundle and 64 MiB+1 fails;
- target/profile creation, exact four-slot mapping and reviewer independence,
  target supersession after every source, chair generation/family and adapter
  contract advance;
- contract-bound Claude/Cursor/Agy exact server/tool/helper/broker sandbox
  canaries, empty list probes, denied extra methods/effects and no cross-bundle
  portal read;
- structural Python/TypeScript route-schema parity, post-router admission
  checks, process-tree kill, stable-key single-flight, changed concurrent input
  and replay without router;
- current-chair certifying dispatch and ordinary non-review authority parity;
- safe CLEAN/FINDINGS, UNUSABLE, proved max-turn/no-answer/provider failure and
  true ambiguity, including exact or conservative settlement for every proved-
  effect terminal, no-effect release, ambiguity retention, stale in-flight
  evidence, insufficient CLEAN/FINDINGS classification and private error scans;
- first/second FINDINGS, UNUSABLE, concurrent head forks, full open-set
  carry-forward, repaired-target CLEAN, immutable mutation replay and live read
  currency;
- every reducer top-level/slot blocker union, operator/agent projection and
  standalone receipt-v2 local codec/sort/equality/history/count/JCS hash; and
- every certifying-action recovery branch, bounded lookup, conservative
  consumption, direct-human retirement, liveness exit, generic-recovery
  exclusion and absence of redispatch/reconstruction.

The current catalogue explicitly rejects provider_review_packets,
model_routing_receipts, cross_family_reviews, modelRoutingReceipts,
crossFamilyReviews, recordModelRoutingEvidence and
recordCrossFamilyReviewEvidence and fabric.v1.review-evidence.record.

### 9.22 Asynchronous lifecycle rotation persistence

Spec 01 section 32.20 owns observable behaviour. lifecycle_rotation_custody is
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

lifecycle_rotation_custody(
  run_id, agent_id, custody_id, command_id, provider_action_id,
  recovery_source_kind, recovery_from_custody_id,
  recovery_from_generation_loss_id,
  bridge_owner_kind, state, terminal_disposition, revision,
  caller_turn_lease_id, caller_turn_generation,
  predecessor_turn_set_digest, quarantined_write_set_digest,
  delivery_cut_watermark, adoption_delivery_set_digest,
  checkpoint_ref, checkpoint_digest, checkpoint_validation_revision,
  task_revision, mailbox_revision, child_set_digest,
  source_provider_session_ref, source_capability_hash,
  source_custody_action_id, source_adapter_id, source_adapter_contract_digest,
  source_bridge_row_id, source_bridge_revision,
  source_provider_generation, source_principal_generation,
  source_bridge_generation, source_project_session_generation,
  source_run_generation, source_chair_lease_generation,
  target_provider_generation,
  target_principal_generation, target_bridge_generation,
  replacement_adapter_id, replacement_contract_digest,
  staged_capability_hash, launch_attest_challenge_digest,
  precondition_digest, terminal_evidence_digest,
  PRIMARY KEY(run_id, agent_id, custody_id),
  UNIQUE(run_id, provider_action_id)
)

lifecycle_generation_losses(
  run_id, agent_id, generation_loss_id, loss_kind, state,
  terminal_disposition, revision, old_provider_session_ref,
  new_provider_session_ref, old_provider_generation,
  new_provider_generation, old_context_revision, new_context_revision,
  source_custody_action_id, source_adapter_id, source_adapter_contract_digest,
  source_principal_generation, source_bridge_generation, bridge_owner_kind,
  source_bridge_row_id, source_bridge_revision, source_capability_hash,
  source_project_session_generation, source_run_generation,
  source_chair_lease_generation,
  checkpoint_state, checkpoint_ref, checkpoint_digest,
  loss_evidence_digest, active_recovery_custody_id,
  PRIMARY KEY(run_id, agent_id, generation_loss_id)
)

lifecycle_custody_adoption_deliveries(
  run_id, agent_id, custody_id, ordinal, delivery_id,
  delivery_generation, recipient_agent_id, source_state,
  PRIMARY KEY(run_id, agent_id, custody_id, ordinal),
  UNIQUE(run_id, delivery_id, delivery_generation),
  FOREIGN KEY(run_id, agent_id, custody_id)
    REFERENCES lifecycle_rotation_custody(run_id, agent_id, custody_id)
)

agent_lifecycle_recovery_capability_issues(
  issue_id, capability_hash, operator_id, project_id, session_id, run_id,
  agent_id, session_revision, session_generation, run_revision,
  recovery_source_kind, old_custody_id, old_action_id, old_custody_revision,
  generation_loss_id, generation_loss_revision,
  checkpoint_digest, source_provider_session_ref, source_capability_hash,
  source_custody_action_id, source_adapter_id, source_adapter_contract_digest,
  source_bridge_row_id, source_bridge_revision, source_provider_generation,
  source_principal_generation, source_bridge_generation,
  source_project_session_generation, source_run_generation,
  source_chair_lease_generation, bridge_owner_kind,
  parent_capability_id, consequential_gate_id,
  path, status, issued_at, expires_at,
  PRIMARY KEY(issue_id), UNIQUE(capability_hash)
)

agent_lifecycle_recovery_retirements(
  run_id, agent_id, recovery_intent_id, recovery_source_kind,
  old_custody_id, generation_loss_id,
  old_terminal_disposition, abandon_reason, consequence_digest,
  direct_human_attestation_digest, created_at,
  PRIMARY KEY(run_id, agent_id, recovery_intent_id)
)
~~~

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

High-water rows and custody identity/source/checkpoint/target fields are
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
daemon-validated checkpoint and all other revision/set digests;
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
challenge and checkpoint vector. Every other agent/task/mailbox/authority/
write/turn/barrier mutation is denied.

Triggers implement exactly the Spec 01 state-edge table and dispositions
adopted, no-effect, quarantined, superseded and abandoned. No state may skip an
edge. awaiting-boundary waits for the captured caller and every predecessor
turn to reach a terminal status at its exact generation. An operator-created
fresh rotation stores null caller turn and is not inserted until every
predecessor is terminal. Predispatch no-effect needs the durable zero-dispatch
journal. Postdispatch no-effect needs the activated adapter contract's
authenticated closed proof; timeout or absence never suffices.

Dispatch marks the one-time volatile handoff before I/O. The replacement
session answers challenge and checkpoint/task/mailbox/child vector through
launch.attest. The daemon verifies and retains the exact successor volatile
bridge before beginning the final database CAS. Adoption rechecks custody,
source/high-water targets and every precondition, inserts provider lineage,
swaps a child through agent_bridge_state or a chair through
launched_chair_bridge_state, activates the staged capability, revokes the old
principal/capability and sets ready. Postcommit cleanup retires the exact old
volatile bridge; a crash-left transport has no credential authority. Existing
write leases remain lifecycle-quarantined.

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
advance (new provider generation equals old and new context revision differs).
Generation-advance wins when provider and context both change, so one
observation has one canonical loss ID. checkpoint
state is absent, invalid or last-validated; ref/digest are non-null iff last-
validated. Detection requires no active custody, inserts open loss, fences the
source, and CAS-ratchets identity/owner-bridge high-water rows to at least every
observed generation before replacement can reserve. Generic scans exclude it.
Capability issuance equality-copies every immutable loss source action,
adapter/contract, principal/bridge/owner and chair session/run/lease field; it
never late-resolves a mutable bridge/session join.

Loss edges are open -> recovery-in-progress -> recovered-adopted|abandoned.
Fresh custody no-effect/quarantine/supersession returns it to open with attempt
history; only adopted custody terminalises recovered and clears freezes.
Absent/invalid checkpoint permits fresh rotation only after the read-only
recovery-checkpoint validator binds an existing daemon-valid artifact; otherwise
only abandon is reachable. The recovery capability/intent/retirement rows bind
the exact custody-or-loss union and phase-B CAS its revision.

Lifecycle remains the sole recovery owner for a rotating true chair until
adoption or confirmed abandon. The chair-loss scanner excludes a nonfinal
custody, open generation loss and finalized nonadopted lifecycle-recovery marker and creates no
chair_bridge_loss row. Child custody cannot update chair tables.

The private local issuer for agent-lifecycle-recovery-takeover requires the
same local subject's current session capability containing
agent-lifecycle-recovery-issue plus one independently attested consequential
gate bound to the exact recovery, validates the complete row binding above and
returns plaintext once while persisting only its hash. Its statuses are active,
consumed, revoked and expired. The narrow issue authorises only fresh-rotate;
generic session or takeover capabilities cannot reach Commit.
agent-lifecycle-recovery intent rows additionally bind path, exact replacement
adapter/activated contract/distinct action, current daemon-validated checkpoint
row/vector and proposed high-water reservation. Preview changes no lifecycle
or provider state. fresh-rotate Commit consumes the issue and inserts a
distinct null-caller awaiting-boundary custody with an immutable recovery-from
custody-or-loss link after all predecessor turns are terminal. A nonfinal custody predecessor may take
its legal superseded edge; a finalized no-effect/quarantined/superseded row is
never mutated. Commit performs no provider call.

abandon instead requires exact session cancel authority, a consequential gate
and independent destructive direct-human attestation. Its one transaction
moves a nonfinal custody through abandoned, or preserves a finalized custody
and inserts agent_lifecycle_recovery_retirements; a loss source takes its exact
abandoned edge. It archives the agent; revokes
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
observed high-water ratchet, custody-or-loss foreign keys, recovery/adopt/
reopen/abandon edges and absent/null/generic-resume negatives. No code in
this amendment adds automatic pressure, successor selection or Spec 06 policy.
