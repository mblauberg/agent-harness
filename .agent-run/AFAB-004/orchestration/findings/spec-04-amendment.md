# Spec 04 v1.1 amendment recommendation

Grounded in Spec 05 v1.0 at `c2fc623` and the live Spec 04/runtime. Spec 01 owns
the semantics of `project_session`, `coordination_run`, operator authority,
gates and `result_delivery`; this amendment owns their durable SQLite
realisation, daemon process lifecycle and recovery. Apply the following before
implementing those surfaces.

## Header and relationship edits

- Change the header to `Version: 1.1` and, until the new gates pass, `Status:
  Amendment approved; implementation pending`.
- Add to section 1: “Spec 05 extends this operational contract. Its approved
  implementation authority covers lock-safe on-demand daemon bootstrap, global
  daemon liveness and stop fencing, migration `0004`, restart recovery and
  durable native-notification delivery. Spec 01 remains the canonical owner of
  entity meaning and transition predicates.”

## Insert after section 3.8

### 3.9 Lock-safe on-demand bootstrap and global liveness

1. Every public client that may operate without an already-running daemon shall
   use one `connect-or-start` primitive on its first read or command. It resolves
   the canonical machine state/runtime/database/socket paths, first attempts a
   bounded authenticated `initialize`, and attaches to a compatible incumbent.
   It may enter election only when no compatible incumbent answers.
2. Election uses a short, generation-bearing bootstrap lease under the private
   runtime directory and an exclusive OS/SQLite lock, not PID inspection or
   socket absence alone. The receipt records attempt ID, owner PID, generation,
   acquired/expiry times and canonical paths. It is process-start coordination,
   not a Fabric bearer capability and grants no project, run or operator action.
   The existing create-run bootstrap capability remains create-run-only.
3. The election winner rechecks the socket while holding the lease, starts one
   daemon, and retains the lease until that daemon owns both canonical
   socket/database locks, completes migration and recovery, listens on the
   private socket and publishes an atomic ready receipt containing daemon ID,
   generation and protocol capabilities. Losers wait boundedly for that exact
   generation, attach to it, or retry election after expiry. They never unlink a
   socket or spawn a second transaction owner merely because connect failed.
4. A winner crash before readiness leaves no ready receipt. OS lock release plus
   lease expiry permits one higher-generation retry; stale receipts are retained
   as journal evidence or atomically replaced only after lock ownership is
   proven. Repeated first reads and commands are idempotent by client command ID
   and must not duplicate a `project_session` or `coordination_run`.
5. `initialize` advertises the daemon generation and the additive
   project-console/operator feature versions. A Console fails closed when the
   required feature is absent; there is no silent legacy downgrade. An operator
   connection authenticates as the distinct Spec 01 `operator_principal`, never
   as an agent, chair or create-run bootstrap principal.
6. A successful operator attach creates or renews an
   `operator_client_attachment` bound to project, principal/capability
   generation, daemon generation, connection ID and expiry. A heartbeat shorter
   than the transport idle timeout renews it. Socket close, explicit detach,
   capability revocation or expiry detaches it idempotently. Rows from an older
   daemon generation are not live after restart.
7. The authoritative daemon-live predicate is global, not project-local. Idle
   shutdown is eligible only when one consistent read proves all of the
   following: no non-terminal Spec 01 `project_session`; no non-terminal
   `coordination_run`; no active lease; no unresolved provider action; no live
   bootstrap lease; and no unexpired current-generation
   `operator_client_attachment`. Terminal session states are only `closed`,
   `cancelled`, and explicitly terminalised `launch_failed`; terminal run states
   are only `closed`, `cancelled`, and `failed`. Recovery/quarantine/ambiguity
   states are non-terminal.
8. A stop request first acquires a single daemon shutdown fence and moves the
   daemon generation to `quiescing`. The daemon rejects new membership,
   attachments and mutations, drains bounded in-flight commands, and rechecks
   the global predicate in the transaction that commits `stopping`. If any
   blocker exists it returns typed `DAEMON_BUSY` blocker kinds without capability
   values and resumes `running`. Attach/start and close/detach races therefore
   have one winner; duplicate stop/close/detach commands have one effect.
9. Closing a Console only detaches that client. It never sends an unconditional
   process signal. The final detach schedules bounded idle shutdown only when
   the global predicate passes. Graceful `SIGINT`/`SIGTERM` use the same fence;
   forced process/host loss is an unclean crash and is recovered on next start.
   Test-only forced teardown shall not be exposed as an operator API.
10. The daemon is on-demand, not a login service. Pending best-effort
    notifications alone do not keep it alive; the active project/session work
    that caused them does.

### 3.10 Migration `0004` and crash recovery

1. Add one additive, checksum-bound migration
   `0004-project-session-operations.sql`. It materialises the accepted Spec 01
   project-session, coordination-run/workstream, operator-principal/capability,
   scoped-gate, intake, hierarchical-resource and result-delivery records; it
   also adds the Spec 04 operational records `daemon_runtime_epoch`,
   `operator_client_attachment` and `notification_delivery`.
2. `daemon_runtime_epoch` records daemon ID/generation, state, canonical socket,
   recovery/shutdown revisions and timestamps. `operator_client_attachment`
   records stable attachment/connection IDs, project session, operator
   principal and capability generation, daemon generation, heartbeat/expiry,
   detach time and revision. `notification_delivery` records source attention
   item/revision, project session, channel, stable dedupe key, state, claim
   generation/deadline, bounded attempt metadata, availability, timestamps and
   typed failure/ambiguity without credential or capability values.
3. Enumerations, non-negative revisions/generations, same-project/session/run
   references, one active chair generation, unique command/dedupe identities and
   parent-budget narrowing receive database constraints or additive triggers.
   Indexes cover global liveness, session membership/closure, attachment
   generation/expiry, unresolved provider/result delivery, resource admission,
   due notifications and notification dedupe. Each is mapped into the central
   invariant catalogue and query-plan tests.
4. Existing v3 runs are never silently declared terminal. Migration backfills
   each into a deterministic imported project session without combining its
   authority with another run: a proven closed final run barrier maps to closed;
   otherwise the imported session/run enters `recovery_required` until explicit
   reconciliation. Uncanonical roots, identity collisions or inconsistent
   legacy state fail preflight before schema mutation.
5. Startup order is: acquire long-lived locks; open and integrity-check SQLite;
   apply/verify migrations; create a higher daemon epoch; run recovery; start
   workers; listen and publish readiness. No client command is accepted before
   recovery commits.
6. Recovery fences all prior-generation operator attachments, expires stale
   bootstrap receipts, releases expired mailbox/result claims according to
   their canonical state machines, reconciles resource reservations/unknown
   usage, quarantines expired write/turn ownership, and reconciles ambiguous
   launch/provider actions by stable action ID. It never blindly redispatches an
   external effect or promotes a replacement chair.
7. Project-session state, membership, intakes, gates, commands, resource
   reservations, result-delivery callbacks and notification intents replay from
   committed SQLite state. A crash between reply, task completion and callback
   publication exposes either the prior state or the one atomic committed state,
   never partial completion.
8. Recovery emits typed, revisioned events for every release, fence,
   reconciliation, ambiguity and quarantine. Integrity failure stops mutation,
   preserves the database and ready receipt as unavailable, and requires forward
   repair or verified restore.

### 3.11 Durable native-notification delivery

1. A daemon-owned worker consumes durable notification intents only for the
   Spec 05 consequential classes. The attention item is authoritative;
   notification delivery is best-effort and cannot acknowledge, approve,
   consume or mutate it.
2. Intent creation commits with the source attention item and revision. The
   unique dedupe identity is `(project_session, attention_item, revision,
   channel)`; repeated events journal `deduplicated` instead of invoking the OS
   again. Routine activity is aggregated into bounded summary intents.
3. Delivery states are `pending`, `claimed`, `sent`, `failed`, `deduplicated`
   or `ambiguous`. Claims are generation-bearing and bounded. A daemon crash
   after claim but before a terminal journal makes that attempt `ambiguous`, not
   silently sent and not blindly retried; the Console continues to show the
   attention item.
4. The worker runs while relevant project work is live even if no Console is
   attached. Adapter discovery and failures set delivery availability to
   `available`, `unavailable` or `stale`; retries are bounded and every sent,
   failed, deduplicated or ambiguous attempt is journalled without secrets.
5. A notification focus action is emitted only when a contract-tested
   terminal/Herdr adapter binds the exact project, attention item and revision.
   Otherwise it directs the operator to the Attention view. No notification
   action enters an approval or command path.

## Section 5 implementation rows

Append these non-overlapping packages; shared façade/protocol registration is a
serial integration surface.

| Package | Owner | Depends on | Write scope |
| --- | --- | --- | --- |
| WP8 connect/start and liveness | Daemon worker | amended Specs 01/04 | daemon process/client/discovery and focused tests |
| WP9 project-session persistence/recovery | Persistence worker | accepted Spec 01 records | migration `0004`, invariant catalogue, recovery/query-plan tests |
| WP10 notification outbox | Notification worker | attention projection and WP9 | notification adapter/worker and focused tests |
| WP11 serial integration/review | Chair/read-only reviewers | WP8-WP10 | protocol registration, docs, full gates and findings |

## Append to section 7 rollback and migration

8. Before applying `0004`, checkpoint the WAL and create a permission-preserving
   verified backup. Preflight legacy identity/state and every new invariant.
9. `0004`, its registry row and all backfill commit in one transaction. Any
   injected DDL/backfill/invariant failure leaves schema v3 and the prior binary
   usable and publishes no ready receipt.
10. After successful cutover, the old binary fails closed on the future schema.
    Rollback is forward repair or restoration of the verified pre-cutover
    database plus matching private runtime metadata; there is no destructive
    down migration and immutable notification/audit evidence is not rewritten.
11. A crash after migration commit but before readiness is safe to restart at
    v4: migration replay is a checksum-verified no-op and startup recovery runs
    before the socket is advertised.

## Append to section 8 acceptance

- Concurrent first reads from at least two projects elect exactly one daemon,
  database owner and socket generation; all clients attach to it. Cover absent
  socket, stale socket/receipt, winner crash before ready, loser retry and
  duplicate launch command.
- Concurrent project start/close and operator attach/detach prove the global
  stop predicate. Every blocker kind denies shutdown; unrelated project work
  continues; only final detach plus no work permits idle stop.
- An idle attached Console survives through heartbeat despite the transport
  idle bound. Closing/restarting it neither stops nor duplicates active work.
- Crash-point tests cover migration, bootstrap handoff, attachment/detach,
  project close, atomic reply/task/result delivery, resource reservation and
  notification claim/terminal journalling.
- `0004` passes fresh-v3, representative legacy-v3, repeat/no-op, checksum,
  future-version, invalid-preflight, injected-failure, backup/restore,
  invariant and query-plan tests.
- Notifications deduplicate, journal sent/failed/ambiguous state, operate with a
  detached Console while project work is active, degrade honestly when the OS
  adapter is absent, and cannot approve, acknowledge or consume attention.
- Load tests race bootstrap contenders and sustained cross-project
  attach/detach/liveness reads within existing protocol bounds with no duplicate
  daemon, leaked lease, premature shutdown or unbounded queue.

## Current conflicts and placement

| Current surface | Conflict | Required resolution |
| --- | --- | --- |
| `src/daemon/client.ts:282-343` | `startFabricDaemon` always spawns | Add the public attach-first `connect-or-start`; keep raw spawn internal/test-only. |
| `src/daemon/process.ts:260-275` and `tests/integration/daemon-attached-client-shutdown.integration.test.ts:9-36` | Shutdown destroys attached sockets unconditionally and the test requires it | Replace production stop with the global fenced predicate; invert this test and isolate forced teardown. |
| `src/daemon/process.ts:104-187` | Connections are in-memory and idle sockets are destroyed; no operator attachment survives as liveness evidence | Register generation-bound operator attachments and heartbeat below `idleTimeoutMs`. |
| `src/daemon/client.ts:309-321` / Spec 04 section 3.2.5 | “bootstrap” currently means a create-run bearer capability | Keep that scope unchanged; name the new pre-authority record the daemon-election bootstrap lease. |
| `migrations/0001-core.sql:14-20` | Runs have no project-session link, lifecycle state or revision | Extend through accepted Spec 01 `coordination_run` fields in `0004`; do not redefine them here. |
| `src/core/migrations.ts:36-53` | Registry ends at `0003` | Register checksum-bound `0004` and its preflight. |
| `src/core/fabric.ts:805-897` | Recovery covers old deliveries/leases/provider sessions only | Extend recovery before readiness for every new durable record above. |
| Runtime tree | No native-notification journal or worker exists | Add the durable outbox/adapter seam from section 3.11; keep Attention authoritative. |
