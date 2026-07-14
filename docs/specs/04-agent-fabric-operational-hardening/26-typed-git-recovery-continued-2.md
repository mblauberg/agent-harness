
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
