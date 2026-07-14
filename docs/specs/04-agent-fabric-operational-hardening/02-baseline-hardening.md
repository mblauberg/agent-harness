
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
