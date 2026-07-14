
### 32.20 Asynchronous lifecycle rotation custody

This closes FR-013 and AC-009. It does not add an automatic context-pressure
controller, successor selector or research-only routing mode.

requestLifecycle with rotate or compact executes inside the caller's existing
lifecycle/tool turn and carries no caller-turn ID. After committing delivery
claim-expiry/reclaim and membership/delivery-watermark housekeeping, the daemon
derives exactly one active
provider_session_turn_lease from the authenticated capability, current live
bridge generation and provider-session generation. Zero, multiple, foreign or
quarantined candidates reject; any other active/quarantined predecessor lease
also rejects. released and revoked are the only terminal turn states;
quarantined is not. The delivery-claim path performs the same housekeeping and
rechecks lifecycle freeze immediately before its claim CAS. A stranded agent
cannot authenticate a synthetic self-rotation.

One request transaction first quarantines every active agent-owned write lease,
then validates and snapshots the exact daemon-validated checkpoint, task,
children, `openWorkSetDigest` and ordered predecessor-turn revisions. The open-
work set includes every nonterminal request-result obligation, especially
provider-accepted/unconsumed delivery, in canonical obligation-ID/revision
order. It fences delivery
claims, records one immutable delivery-cut watermark and captures only claimed
predecessor delivery IDs/generations in the adoption vector; ready/unclaimed
rows are successor-pending and excluded. It
rechecks the post-housekeeping freeze/lease set, fences new delivery/provider
turns, suspends the agent, reserves replacement generations, inserts custody in
awaiting-boundary and commits an immutable accepted LifecycleResult whose
lifecycle is suspended. No adapter I/O occurs. Accepted acknowledges durable
custody only; exact replay always returns that receipt. getAgentLifecycle is
the separate current-state read.

Durable delivery enqueue may continue while suspended, but claim and
acknowledgement are denied. Existing ready/unclaimed rows and every enqueue
after the cut remain ordered successor-pending; they do not enter or stale the
captured checkpoint/precondition/adoption digest. Adoption makes those same
rows claimable by the successor without replay or re-enqueue. A peer can add
pending work but cannot force repeated checkpoint supersession. The captured
caller turn is the sole in-band exception: its
old capability may finish only this lifecycle call and bounded lifecycle reads.
It cannot start another turn, mutate task/mailbox/authority, acquire a write
lease or close a barrier. The staged capability may invoke only the existing
grant-scoped launch.attest descriptor for action-bound activation, challenge
response and exact checkpoint-vector acknowledgement. Every other mutation,
turn, write or barrier operation fails while lifecycle custody owns the agent.

Each custody reservation increments durable per-run/agent global provider- and
principal-generation high-water marks plus a per-run/agent/bridge-owner bridge-
generation high-water mark. Each stored target is exactly its corresponding
predecessor high-water plus one, even when an earlier staged attempt was
superseded or quarantined; a generation is never reused. Only the bridge
sequence is distinct for chair versus child. Custody also snapshots the exact
source provider-session reference, capability hash, custody action, adapter and
contract, bridge row/revision and, for a chair, project-session/run/chair-lease
generations. Final adoption must CAS and revoke those exact source rows while
installing the reserved targets. Skipped, reused, crossed-owner or source-plus-
one substitutions reject.

The complete state/disposition edges are:

| From | Required proof/event | To | Terminal disposition |
| --- | --- | --- | --- |
| awaiting-boundary | captured caller and every predecessor turn terminal at the recorded generation | prepared | none |
| awaiting-boundary or prepared | durable journal proves zero dispatch | finalized | no-effect |
| awaiting-boundary or prepared | checkpoint/source drift before dispatch | finalized | superseded |
| prepared | action and one-time volatile handoff durably marked before I/O | dispatched | none |
| dispatched | authenticated provider acceptance, but not terminal outcome | accepted | none |
| dispatched or accepted | bounded observation cannot prove outcome/effect | ambiguous | none |
| dispatched, accepted or ambiguous | authenticated terminal activation/checkpoint or adapter-advertised closed no-effect proof | provider-terminal | none |
| provider-terminal | exact adoption preconditions remain current | committing | none |
| committing | atomic generation/bridge/capability CAS succeeds | finalized | adopted |
| provider-terminal or committing | checkpoint/source CAS drift | finalized | superseded |
| provider-terminal | authenticated closed post-dispatch no-effect proof | finalized | no-effect |
| any nonfinal state | malformed, crossed or conflicting evidence | finalized | quarantined |
| any nonfinal state | confirmed agent-lifecycle-recovery abandon | finalized | abandoned |

No other edge or disposition is legal. In particular, absence/timing alone
cannot produce post-dispatch no-effect; the activated adapter contract must
advertise and return its authenticated closed no-effect proof. `revoked` is a
terminal capability/turn-lease status, not a custody disposition.

Finalized `no-effect` and `superseded` revoke only the staged replacement,
release only delivery/turn/write freeze contributions owned by that custody,
retain the still-valid predecessor bridge/capability and return the agent to
`ready`. They do not require an operator recovery gate. Finalized
`quarantined` keeps the agent `suspended` and marks it `recovery-required`;
owned freezes remain until the narrow recovery/abandon path resolves them.
Finalized `abandoned` uses the explicit archival transaction below. These
lifecycle exits are part of the same terminal custody transaction and cannot be
performed by generic Resume.

awaiting-boundary becomes prepared only after the in-band caller turn is
released and every captured predecessor is terminal at its recorded
generation. An operator-created fresh rotation has no caller-turn exception and
cannot enter awaiting-boundary until every predecessor turn is terminal. It
binds an exact replacement adapter, activated contract, new action ID, current
validated checkpoint row and reserved high-water targets.

After dispatch the replacement session must use launch.attest to return the
grant challenge and exact checkpoint/task/mailbox/child/open-work vector. The daemon
verifies and retains that successor volatile bridge before database adoption.
The final transaction rechecks custody and source/high-water/CAS bindings,
persists the session, swaps child custody through agent_bridge_state or chair
custody through launched_chair_bridge_state, activates the staged capability,
revokes the predecessor, transfers the exact open-work obligations and returns
the agent to ready. Only after commit does
the daemon best-effort retire the exact old volatile bridge; its revoked
capability makes a crash-safe leftover powerless. Existing write leases remain
quarantined and require explicit recovery or reacquisition.

For a true chair, that same serialization point captures the section 32.19
review certification cut and performs deterministic binding rebind-or-stale.
Review actions, ambiguity and capacity state cannot reject or roll back
lifecycle adoption; their existing recovery/preparation fences remain owned by
the review subsystem.

Checkpoint identity never floats. A provider acknowledgement of A cannot adopt
B. A becomes finalized/superseded, its staged capability/bridge is revoked and
its reserved generations remain spent. B needs a new custody, action,
capability, challenge, high-water reservation and acknowledgement.

LifecycleRotationRecoveryService runs before all generic provider/bridge
scans, and every lifecycle-linked action/bridge is excluded from those generic
owners. awaiting-boundary/prepared uses only durable zero-dispatch proof;
restart loss of the predecessor volatile bridge never restores ready.
dispatched/accepted/ambiguous performs at most pair-keyed lookup. It adopts only
exact activation/checkpoint evidence, accepts no-effect only under the closed
proof above, supersedes drift and quarantines absent/malformed/crossed/conflict.
It never dispatches, redispatches, reconstructs a secret or treats a resume
reference as continuity.

Each adapter normalises provider context telemetry to
`providerContextObservationV1 {sourceEventId: stable adapter event ID,
providerGeneration: positive integer, contextRevision: nonnegative integer,
evidenceDigest: sha256 digest}` before lifecycle logic. Revision is
monotonic only within its provider generation; a jump is legal and no `+1`
assumption exists. The daemon stores one high-water pair per run/agent/provider
generation and classifies each authenticated `sourceEventId` exactly once:

1. lower provider generation, or the same generation with lower context
   revision: append `reordered-observation` audit evidence and make no lifecycle,
   bridge, high-water or receipt mutation;
2. equal generation and equal context revision: exact replay, no mutation;
3. equal generation and greater context revision: one `context-advance` loss
   whose `newContextRevision > oldContextRevision`; and
4. greater provider generation: one `generation-advance` loss regardless of its
   context revision, and install that revision as the new generation baseline.

The final database compare-and-set repeats this ordering, so simultaneous
events, restart and a delayed callback cannot regress state. When both provider
generation and context revision advance, only generation-advance exists.
Unannounced provider compaction/generation advance with no active lifecycle
custody has an explicit predecessor, never inferred null custody:

~~~yaml
lifecycleRecoverySourceV1:
  oneOf:
    - kind: custody
      custodyRef: exact-lifecycle-custody/revision
    - kind: generation-loss
      oldCustodyRef: null
      generationLossRef: exact-generation-loss/revision
      lossKind: generation-advance-or-context-advance
      oldProviderSessionRef: exact-session
      newProviderSessionRef: exact-observed-session
      oldProviderGeneration: positive-generation
      newProviderGeneration: positive-generation
      oldContextRevision: null-or-nonnegative-revision
      newContextRevision: nonnegative-observed-revision
      sourceBridgeRef: exact-bridge/revision
      sourceCapabilityHash: exact-hash
      checkpointState: absent-or-invalid-or-last-validated
      checkpointRef: null-or-exact-checkpoint
      checkpointDigest: null-or-sha256-prefixed-digest
      lossEvidenceDigest: sha256-prefixed-digest
~~~

generation-advance is canonical whenever the new provider generation is
greater than old, including when context revision also changes. context-advance
requires equal provider generations and a strictly greater proved new context
revision. The arms are therefore disjoint. checkpoint ref/digest are both non-null only for last-
validated and both null for absent/invalid.

Detection equality-checks that no custody owns the transition, inserts one
immutable generation-loss row, revokes/fences the observed bridge/capability,
CAS-ratchets only provider/context high-water from this telemetry, quarantines writes, turns and delivery claims,
sets context-unreconciled and
assigns LifecycleRotationRecoveryService before generic scans. Repeated
source event is idempotent and returns its existing classification/audit row.
Principal and bridge high-water may advance only from authenticated daemon
custody reservation/adoption inputs that name those exact generations; they
are never inferred from provider generation or context revision. The loss arm permits no self-request, Resume or pair
lookup that could bless the unannounced generation; only the exact operator
fresh-rotate/abandon paths below can close it.

Generation-loss edges are `open -> recovery-in-progress -> recovered-adopted`,
`recovery-in-progress -> abandoned`, `recovery-in-progress -> open` and direct
`open -> abandoned`.
fresh-rotate binds its new custody and canonical provider action pair to the
loss and moves open to recovery-in-progress. Only adopted custody atomically
records recovered-adopted and clears loss freezes. A no-effect/quarantined/
superseded custody returns the loss to open (the `recovery-in-progress -> open`
edge) with immutable attempt history.
Direct-open abandon records `abandonKind: direct-open` and
`recoveryActionRef: null`; abandon after a recovery attempt records
`abandonKind: recovery-attempt` and that custody's exact
`{adapterId, actionId}` pair. Crossed null/discriminator/pair combinations are
invalid. Both terminal arms perform the same owner-row cleanup below; no action
is fabricated for direct abandon.

Lifecycle custody is the sole owner even when the rotating agent is the true
chair. ChairBridgeLossRecoveryService excludes any chair with nonfinal custody,
an open generation-loss row or a finalized nonadopted lifecycle-recovery marker;
no chair_bridge_loss row is created for that bridge. Ownership ends only at
lifecycle adoption or confirmed abandon. Child custody cannot promote a chair,
and generic Resume cannot own either case.

A stranded suspended/context-unreconciled agent has one reachable operator
surface: the closed agent-lifecycle-recovery intent on
fabric.v1.operator-action.preview/commit/status/reconcile. Before Preview, the
private local control plane may issue an
agent-lifecycle-recovery-takeover capability only to the same authenticated
local operator holding an exact current session capability containing
agent-lifecycle-recovery-issue and one independently attested consequential
gate bound to this recovery. Its immutable issuance row binds operator/project/
session/run/agent, session/run revisions and generations, one exact
lifecycleRecoverySourceV1 arm, current validated checkpoint digest, exact source session/capability/
action/adapter/contract/bridge-row identity and revisions, provider/principal/
bridge generations, current chair-lease generation when applicable, bridge-
owner kind, fresh-rotate only, gate, issue/expiry and capability hash. Status is
active, commit-pending, consumed, revoked or expired; a handoff without commit is
commit-pending and freezes later expiry/revocation until exact apply or explicit
integrity recovery (see section 9.4.1). Neither a generic session grant nor broad
takeover reaches fresh-rotate Commit directly.

The intent additionally binds one closed path:

- fresh-rotate requires that narrow active capability and binds the replacement
  adapter, activated contract digest, distinct new canonical provider action
  pair and the exact
  current daemon-validated checkpoint row/vector. For an absent/invalid loss
  checkpoint it additionally requires an exact existing checkpoint artifact
  accepted by the read-only
  fabric.v1.agent-lifecycle-recovery-checkpoint.validate operation under the
  recovery gate; without one, fresh-rotate rejects and only abandon is
  reachable. Commit consumes the issue,
  reserves new high-water targets and creates one distinct awaiting-boundary
  custody/capability/challenge with an empty caller-turn exception and immutable
  recovery-from custody-or-generation-loss link. If a referenced old custody is
  nonfinal, Commit may take its legal
  superseded edge; if it is already finalized no-effect/quarantined/superseded,
  its row/disposition remains unchanged. It calls neither old nor new provider;
  the lifecycle owner dispatches later after the boundary.
- abandon requires exact session cancel authority plus consequential-gate and
  independently attested destructive direct-human confirmation. In one
  transaction it moves a nonfinal custody through its legal abandoned edge, or
  preserves an already-final custody and appends a distinct immutable lifecycle-
  recovery-retirement row; an open generation-loss source takes direct-open
  abandon with a null recovery action, while a recovery-in-progress source
  takes recovery-attempt abandon with its exact action pair. It archives the
  agent; revokes old and staged
  capabilities, principal and bridge; terminally revokes turn leases;
  changes quarantined write leases to revoked-abandoned without a write;
  terminally abandons every owned or sole-recipient ready/claimed delivery,
  task owner lease, required result obligation and agent/task/run membership
  with reason; advances their message/delivery membership watermarks; and
  terminalises dependent owned barriers as abandoned-failure, never success.
  It appends revocations for active grants without mutating immutable authority
  envelopes and clears only freeze contributions whose exact owned rows are now
  terminal. No delivery or barrier is orphaned. Child abandon leaves unrelated
  run work intact and makes any affected parent explicitly failed/recovery-
  required; chair abandon enters the existing explicit run/session cancel-
  failure terminal path in the same transaction.

Preview performs no lifecycle/provider mutation. Status returns the current
intent, issuance and custody state. Reconcile uses pair lookup only for a new
action that may have dispatched. Wrong/stale checkpoint, adapter/contract,
action, source/high-water, capability issue or confirmation changes nothing.

- **FR-061:** rotate/compact shall return immutable accepted-suspended after
  durable boundary fencing; asynchronous custody alone may swap
  provider/principal/bridge generations.
- **NFR-031:** nonterminal custody shall restrict predecessor/staged
  capabilities as above, quarantine writes before checkpoint binding, wait for
  every captured turn and recover as the sole owner before generic scans
  without replay.
- **FR-068:** An open generation loss shall support direct confirmed abandon
  with a null recovery action reference; attempted-recovery abandon shall carry
  the exact provider action pair and a distinct provenance discriminator.
- **NFR-032:** Adapter-normalised context revision shall be nonnegative and
  monotonic within one provider generation; reordered/lower observations shall
  be audited without lifecycle mutation.
- **FR-075:** Lifecycle custody and launch.attest shall bind the exact open-work
  set so accepted/unconsumed result obligations survive fresh-context adoption.
- **FR-076:** Final no-effect/superseded custody shall restore ready while
  releasing only owned freezes; quarantined custody shall remain suspended and
  recovery-required.
- **NFR-033:** Provider observation replay shall be naturally idempotent by
  stable source event, and provider telemetry shall never infer principal or
  bridge generations.
- **AC-051:** crash tests cover awaiting-boundary, every provider/custody state,
  every legal edge/disposition, unique caller inference, terminal predecessor
  ordering, private handoff, launch.attest attribution, pre-CAS retained bridge,
  child/true-chair owner swap and post-commit old-bridge retirement. They prove
  accepted-versus-current-read separation, durable high-water-plus-one targets
  across A-to-B supersession, global identity versus owner-scoped bridge
  sequences, exact source-row/reserved-generation CAS, delivery-cut successor-
  pending enqueue without checkpoint starvation, open-work handoff across
  compaction, pre/post-dispatch no-effect distinction, ready restoration for
  no-effect/superseded, suspended recovery for quarantine, retained write
  quarantine and generic-recovery exclusion.
  Unannounced compaction fixtures prove the fully bound generation-loss union
  arm, classify simultaneous provider/context advance only as generation-
  advance, and reject absent/null inference and generic Resume. Delivery
  fixtures prove successor-pending remains stored/counted ready for custody,
  open loss and exact linked loss/custody owners, becomes claimable on adoption,
  becomes abandoned on retirement and rejects crossed/multiple owners. Operator fixtures prove reachable
  parent-grant/gate and narrow-capability fresh-rotate with distinct custody/
  action/adapter/contract, empty caller boundary and finalized-predecessor
  immutability; confirmed abandon proves exact delivery/watermark/barrier and
  other owner-row terminal transitions without orphaning required work;
  self-rotate, generic resume and chair-loss recovery cannot bypass the sole
  lifecycle owner.
- **AC-054:** context fixtures cover restart, exact duplicate, lower provider
  generation, lower same-generation revision, arbitrary forward jump and
  simultaneous provider/context advance. Only same-generation strict increase
  creates context-advance and its receipt always has
  `newContextRevision > oldContextRevision`; greater provider generation wins.
  Direct-open abandon persists null action/direct-open provenance, while
  recovery-attempt abandon persists the exact adapter/action pair, and every
  crossed discriminator/nullability combination fails atomically.
- **AC-055:** policy-required rotation starts a distinct fresh provider context
  and injects only the bounded canonical checkpoint/handoff after adoption;
  same-history attach/resume passes crash-recovery fixtures but fails rotation.
  Duplicate/lower/reordered context callbacks with the same source event create
  one bounded audit row, and provider values cannot ratchet principal/bridge
  high-water.
