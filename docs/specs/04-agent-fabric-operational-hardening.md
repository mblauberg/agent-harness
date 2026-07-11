# Agent fabric operational hardening

Status: Console daemon-lifecycle extension approved; implementation in progress; final human acceptance pending
Version: 1.2
Date: 11 July 2026
Risk: Crucial
Chair: Codex
Independent design peer: Claude Code

Version 1.2 closes the implementation-discovered private operator bootstrap
and generation-bound chair-launch boundary required by Spec 05.

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
5. Bootstrap authority remains limited after initialisation to legacy
   create-run compatibility and exact-root local operator provisioning as
   defined in section 9.7. It is never accepted on the public operator
   protocol and cannot perform project-session, gate, Git or provider actions.

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

1. Migration `0003` preflights existing state, adds operational indexes and
   enforces critical enumerations, booleans, generations and same-run
   relationships using additive SQLite triggers where table rebuilding would
   create unnecessary cutover risk.
2. Migration failure is transactional. There is no destructive down migration;
   recovery is a forward repair or verified backup restore.
3. Startup runs bounded integrity/foreign-key checks after an unclean marker.
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

### 3.6 Deterministic receipt v2

1. The canonical snapshot contains committed state only and is byte-identical
   across repeated exports of unchanged state.
2. Export metadata is separate from the hashable snapshot.
3. `taskOwners` replaces the false `stageOwners` label. Deliveries are counted
   by explicit state; no total-row count is called delivered.
4. The snapshot includes an event watermark and state hash. Nested structures
   are closed and versioned.
5. Historical v1 receipts remain readable as archival evidence; the runtime
   emits v2 only. No immutable historical receipt is rewritten.

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

1. `Fabric` remains the compatibility façade and sole cross-domain transaction
   owner. This programme extracts only stable seams created by the changes:
   wire framing/negotiation, workspace trust, retention/archive, database
   maintenance and receipt snapshot projection.
2. No network microservices, parallel mutation owners or second authority
   store are introduced.
3. Deterministic tests cover oversized frames, connection/in-flight overload,
   pre-handshake methods, mixed versions, backpressure, trust symlink/expiry,
   invalid legacy rows, migration rollback, query plans, repeated receipt
   export, archive integrity and daemon restart.
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
| WP3 SQLite integrity | Persistence worker | Spec invariants | migration 0003, persistence, migration/query-plan tests |
| WP4 trust/status/retention | Operations worker | wire status contract | CLI/application modules and focused tests |
| WP5 receipt v2 | Receipt worker | event watermark | exports/schemas and focused tests |
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

## 7. Rollback and migration

1. Backup/checkpoint the live database before migration verification.
2. Preflight every trigger invariant against existing rows before installing
   enforcement.
3. Create indexes and triggers transactionally, then run
   `foreign_key_check`, `quick_check` and query-plan assertions.
4. A failure rolls back migration 0003 and leaves the prior binary/schema
   usable. After successful cutover, rollback is forward repair or verified
   restore, not trigger/table deletion in production.
5. Protocol clients and daemon are deployed together locally. Version mismatch
   fails closed; there is no silent legacy downgrade.
6. Workspace trust and archive metadata are independent private files and can
   be revoked without database mutation.
7. Receipt v1 remains archival; consumers must opt into v2 before treating new
   fields as enforcement claims.

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
provider action or unexpired current-generation operator client. Required
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

Operator attachment is a persisted generation-fenced lease with heartbeat and
bounded crash expiry. Stop uses a daemon-instance compare-and-set transition
from `running` to `quiescing`, records the observed global-state revision and
rechecks the idle predicate before closing the socket. A concurrent attach,
project launch or recovered active member cancels the quiesce or advances the
revision so the stop fails closed. Project close and client detach are
idempotent and cannot stop another project's work.

### 9.3 Additive migration and invariants

Migration `0004-project-session-operations.sql` shall add, without rewriting historical
tables:

- project sessions and explicit membership;
- coordination-run project/session links, lifecycle revision and chair
  generation, plus persisted delivery workstreams;
- operator principals, capabilities, client attachments, input attestations
  and idempotent commands;
- revisioned intakes, scoped gates and gate-to-task/operation/barrier links;
- hierarchical resource scopes and reservations;
- request-result delivery and transactional outbox state;
- attention items and notification delivery journal;
- daemon runtime epochs and imported bootstrap audit receipts; and
- schema-versioned operator projection cursors.

The migration shall preflight legacy rows, install same-project/run foreign-key
and enumeration/generation triggers, and add indexes for active membership,
gate enforcement, intake revision, callback deadline/claim, resource
admission, notification dedupe and global-idle queries. It runs in one
transaction after a verified backup. Failure leaves schema 0003 usable; after
successful cutover recovery remains forward repair or verified restore, not a
destructive down migration.

Existing schema-v3 runs shall receive one deterministic independent imported
project session per run without combining authority. Its stable ID, generation
and launch-packet digest derive from a synthetic migration manifest bound to the
legacy run ID, canonical root, authority and budget rows. The project-session
origin is `legacy-migration`, never a human operator or approval. Its authority
and root budget can only equal or narrow the legacy records. A run with a
proven closed final barrier may import as closed; every other legacy run imports
as `recovery_required` until explicitly reconciled. Uncanonical roots, identity
collisions or inconsistent legacy state fail preflight before mutation.

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
- quarantines ambiguous provider, Git, Herdr or notification effects until
  lookup/reconciliation proves their outcome.

No pane, process absence or Console-local cache may infer coordination state.
The Console may rebuild its complete projection from an authoritative snapshot
plus monotonic event cursor after any restart.

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

The daemon's private legacy/control connection owns one additional bootstrap
method, `provisionLocalOperator`. It is available only after the normal daemon
initialisation handshake with the current private bootstrap capability. The
method rechecks an exact canonical root and trust-record digest, derives the
local subject binding, and transactionally creates or revalidates the project,
operator principal and bounded project capability described by Spec 01
section 32.9. `projects.canonical_root` plus a nullable
`projects.trust_record_digest` own that binding; legacy-migration projects may
remain null, but operator provisioning requires an exact current digest. It
cannot widen an existing project/root binding. Exact replay is idempotent;
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

The public operator connection may create a draft session but may launch a
chair only through preview/commit of `ProjectSessionLaunchIntent`. The daemon
owns a launch-custody port behind the operator action service. On commit it:

1. revalidates the trusted project root, session generation/revision, launch
   packet and resource-plan digests and registered adapter contract;
2. in one SQLite transaction advances `awaiting_launch` to `launching`, creates
   the run, one chair, hashed capability, chair lease, membership and
   project/session/run resource hierarchy, and a prepared provider action with
   the stable action ID;
3. passes the plaintext chair credential directly to the registered local
   adapter without returning or journalling it on the operator protocol; and
4. lets the daemon-internal launch-custody reconciler CAS `launching` to
   `active`, `launch_failed` or `launch_ambiguous` from the persisted provider
   action outcome; no later operator credential or fabricated operator command
   performs that transition.

The operator command journal commits the local preparation and stable provider
action ID. Pending, ambiguous and terminal `OperatorActionStatus` values and
the terminal receipt are projections of the provider-action journal; the
daemon does not rewrite the original operator command's before/after audit as
though the asynchronous effect were already terminal.

Startup recovery never reconstructs or redispatches plaintext launch
material. A still-prepared action has no external effect: recovery revokes its
prepared chair capability hash and requires a fresh preview/attempt generation
with a newly minted token. Launch custody persists `dispatched` before calling
the adapter, so dispatched or uncertain actions are observe-only until adapter
lookup proves their outcome. Global liveness counts the prepared/ambiguous run
and action throughout reconciliation.

Deterministic gates cover private/public principal separation, trust-root
recheck, secret non-disclosure, duplicate provision, launch crash injection at
every transaction/effect boundary, coordinated-mode double-chair races and
restart without blind provider respawn.
