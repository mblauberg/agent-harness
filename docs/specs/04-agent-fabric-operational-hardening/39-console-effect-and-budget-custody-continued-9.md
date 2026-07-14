
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
