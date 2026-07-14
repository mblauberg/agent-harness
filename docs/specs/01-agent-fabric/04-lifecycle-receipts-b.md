
For a pure `fresh-origin` batch, `primaryOwnerBeforeRef` is the closed authority
ref `{kind:"fresh-handoff",handoffId,handoffDigest,preparationId,
preparationDigest,plannedApplyId,sourceMode,recoverySource,sourceJournalDigest,
freshApplyPlanDigest}` and `primaryOwnerAfterRef` is the planned revision-one
custody owner ref. The before journal is the handoff source journal; the after
semantic is the planned custody semantic. This batch authority ref does not add
an owner-ref union arm. `freshHandoffRef` is the exact closed six-member object
`{handoffId,handoffDigest,preparationId,preparationDigest,sourceMode,
freshApplyPlanDigest}`; no recovery source, journal, owner or planned-apply
member is implicit in that ref.

The four affected-loss members in the fresh subject/effect/replay are one
closed null-or-nonnull arm. `reuse-final-custody` is all null;
`open-generation-loss` copies the recovery source before row and its exact
revision-plus-one `recovery-in-progress` after row; terminal-fresh is all null or
copies the old custody's active loss and its exact transferred after row. The
fresh effect role is `primary` for pure fresh and `secondary` for
terminal-fresh. `freshOriginEffectDigest=LD("lifecycle-effect",exactEffect)`.
Batch IDs, ordinals and apply IDs are relational bindings outside that effect
preimage.

The batch/intent/completion union has exactly seven arms:

| primary transition | qualifier | secondary | count | review | handoff mode | effects |
| --- | --- | --- | ---: | --- | --- | --- |
| custody-terminal | ordinary nonadopted | none | 1 | null | null | custody + optional linked loss |
| custody-terminal | adopted true-chair | review-adoption-decision | 2 | nonnull | null | custody + optional linked loss |
| custody-terminal | terminal-fresh | fresh-origin | 2 | null | terminalize-nonfinal-custody | custody + optional linked loss + secondary fresh |
| generation-loss-terminal | direct-open abandonment | none | 1 | null | null | primary loss |
| custody-recovery-retirement | confirmed retirement | none | 1 | null | null | primary retirement |
| fresh-origin | reuse final custody | none | 1 | null | reuse-final-custody | primary fresh |
| fresh-origin | open generation loss | none | 1 | null | open-generation-loss | primary composite fresh |

No review-plus-fresh, count-two-plus-none, nonfresh handoff or eighth arm is
valid. Completion reconstructs effects in primary/linked/secondary order and
requires the digest to equal the batch `effectsSetDigest`.

`retirementPlanDigest=LD("recovery-retirement-plan",body)` over every displayed
plan member except the digest. Its plan, proof and evidence are byte-identical to
the retirement subject/replay/batch; a changed archival write cannot reuse the
same plan or authority receipt.

The finalized custody candidate key roots its exact
`finalizedTerminalEvidenceDigest`. The immutable retirement plan binds that
root with the other four values into the nonnull tuple
`(finalizedTerminalEvidenceDigest,admissionDigest,transitionProofDigest,
mutationPlanDigest,retirementEvidenceDigest)`; subject, primary effect and
materialised retirement result equality-copy the entire plan tuple.
Only the plan stores proof/plan JSON bodies. No result can restore archival state
from an application-only join or substitute evidence under the same receipt.

The transition replay is exactly `lifecycleTransitionReplayV1`:

~~~yaml
schemaVersion: 1
transactionId: exact-stable-transaction
projectSessionId: exact-project-session
runId: exact-run
agentId: exact-agent
transitionKind: custody-terminal | generation-loss-terminal | custody-recovery-retirement
primaryOwnerBeforeRef: exact-ref
primaryOwnerAfterRef: exact-same-identity/revision-plus-one-or-same-retirement-plan-ref
primaryOwnerBeforeJournalDigest: exact-current-journal-digest
primaryOwnerAfterSemanticDigest: exact-planned-semantic-digest
effectsSetDigest: exact-batch-effect-set
admissionDigest: exact-digest
providerActionRef: exact-provider-action-ref | null
recoverySource: exact-lifecycle-recovery-source-ref-v1
terminalDisposition: adopted | no-effect | superseded | quarantined | abandoned | recovery-retired
terminalEvidenceDigest: exact-digest
transitionProof: exact-proof-arm
transitionProofDigest: exact-digest
mutationPlan: exact-lifecycle-mutation-plan-v1
mutationPlanDigest: exact-digest
reviewReservationDigest: exact-digest | null
freshHandoffDigest: exact-digest | null
~~~

The three terminal transition kinds select the terminal replay fields above.
Pure fresh selects `lifecycleFreshOriginReplayV1`; it has no terminal
disposition/proof fallback. Terminal-fresh retains the single custody-terminal
replay and equality-copies its digest into the ordinal-two fresh subject.

`lifecycleMutationPlanV1` (the `mutationPlan` member above and every
`freshApplyPlan`) contains exactly `schemaVersion`, a complete strictly sorted
`writes` array and `writeSetDigest`. Each write contains `{relation,keyDigest,
operation,expectedSemanticDigest,afterSemanticJcs,afterSemanticDigest}`.
`operation` is `insert|update|delete`; expected digest is null only for insert;
after semantic body and digest are null only for delete. `afterSemanticJcs` is
the exact closed canonical state/effect body, not SQL or caller-selected
relation data. It excludes every batch, intent, authority receipt,
authorization, apply and journal-wrapper member; those downstream links occur
only in immutable effect/apply rows after authority. The closed relation enum is:
`agent-state`, `provider-session`, `provider-lineage`, `principal-capability`,
`agent-bridge`, `chair-bridge`, `turn-lease`, `write-lease`, `delivery`,
`task-owner`, `result-obligation`, `membership`, `barrier`, `freeze-owner`,
`custody-revision`, `custody-head`, `generation-loss-revision`, `generation-loss-
head`, `review-cut`, `review-binding`, `review-binding-pointer`, `recovery-
issue`, `fresh-preparation`, `fresh-handoff`, `fresh-commit`, `recovery-
retirement`, and `audit`. `writeSetDigest=LD("mutation-plan",
{schemaVersion:1,writes})`; `mutationPlanDigest` equality-copies it, and
`freshApplyPlanDigest` equality-copies it when this codec is the handoff plan.
Every row
changed by adoption, no-effect, supersession, quarantine or abandonment,
including archival delivery/task/barrier effects and a linked generation loss,
must occur exactly once. No unplanned lifecycle-affecting write may share the
apply transaction.

Each custody/loss owner-transition effect is exactly `{schemaVersion:1,effectKind,role,
ownerBeforeRef,beforeJournalDigest,ownerAfterRef,afterSemanticDigest}` and has
`effectDigest=LD("lifecycle-effect",body)` and
`effectKind:"owner-transition"`. Recovery retirement and fresh origin use their
separate exact composite effects above; the retirement effect carries every
archival evidence digest. Effect order is primary owner effect, optional linked
generation-loss effect, then optional secondary fresh-origin effect;
`effectsSetDigest=LD("effect-set",members)`. A custody batch has exactly one
primary custody effect; a standalone loss batch exactly one primary loss effect;
a recovery-retirement batch exactly one primary retirement effect; pure fresh
has one primary fresh-origin effect. Only custody may add the linked loss;
terminal-fresh also has one secondary fresh-origin effect. The set
equality-copies every corresponding mutation-plan semantic write.

`transitionProofDigest=LD("transition-proof",transitionProof)` and
`transitionReplayDigest=LD("transition-replay",transitionReplay)`. Pure fresh
uses only the separately closed `lifecycleFreshOriginReplayV1`; it is not a
fourth arm of `lifecycleTransitionReplayV1`. Ordered
subject members are exactly `{ordinalDec,kind,ownerRefDigest,ownerRevisionDec,
subjectDigest}`, and `orderedSubjectSetDigest=LD("receipt-subject-set",members)`.
Ordinal one is the primary custody terminal, standalone generation-loss terminal,
recovery retirement or pure fresh origin. Ordinal two is exactly either the
adopted true-chair review decision or terminal-fresh origin; the two are
mutually exclusive. A linked generation-loss effect is authenticated in the
effect set, not another terminal subject. `batchId=LD("receipt-batch-id",body)`
where the exact 17-member body is `{schemaVersion,projectSessionId,runId,
agentId,plannedApplyId,transitionKind,primaryOwnerBeforeRef,
primaryOwnerAfterRef,primaryOwnerBeforeJournalDigest,
primaryOwnerAfterSemanticDigest,effectsSetDigest,transitionReplayDigest,
orderedSubjectSetDigest,receiptIntentCountDec,secondaryIntentKind,
reviewReservationRef,freshHandoffRef}`. The displayed `batchId`, expanded
`transitionReplay` and expanded `intents` are excluded; every other displayed
batch member is present exactly once. Each
`intentDigest=LD("receipt-intent",{schemaVersion:1,batchId,ordinalDec,kind,
subjectDigest,transitionReplayDigest})`.

`orderedAuthorityReceiptSetDigest=LD("authority-receipt-set",members)`, where
members are in batch ordinal order and each is exactly `{ordinalDec,
intentDigest,authorityId,authoritySequenceDec,receiptDigest,subjectDigest}`.
`completionDigest=LD("batch-completion",body)` over every displayed completion
member except itself. Completion exists only after every declared intent and its
exact verified authority receipt exist. `secondaryIntentKind=none` requires
count one and null ordinal two; either non-none value requires count two and both
ordinals. Primary-effect kind must match transition kind; only custody-terminal
may name one linked loss, and only terminal-fresh may name a secondary fresh
effect. Authorization and apply
both equality-copy the same completion and ordered receipt-set digests, so neither
can exist for a childless, partial or crossed batch.
`authorizationDigest=LD("batch-authorization",body)` over every displayed
authorization member except itself.
`applyDigest=LD("transition-apply",body)` where body is every displayed selected
`lifecycleTransitionApplyV1` member except `applyDigest`. The terminal arm has no
fresh values; terminal-fresh equality-copies its batch handoff and secondary
fresh effect; pure fresh equality-copies its fresh-origin batch and primary
fresh effect. `localWriteSetDigest` covers every row
written by the one transaction, including journal wrappers and the apply marker,
but is a digest of sorted relation/key/operation identities rather than row
contents; it therefore cannot introduce a digest cycle. Only after any apply is
externally authorized does the transaction construct its journal wrappers.

`LD("custody-journal",wrapper)` or `LD("generation-loss-journal",wrapper)`
hashes exactly `{schemaVersion,ownerRef,priorJournalDigest,semanticDigest,
sourceRefDigest,authorityBatchId,authorityApplyId,authorityApplyDigest,
originFreshApplyId,originFreshApplyDigest,recordedAt}`. The five downstream
members form one exact arm: an ordinary creation/intermediate revision has all
five null; a directly receipt-effect-owned revision has the three authority
members nonnull and both origin members null; and every fresh-created custody or
fresh-advanced generation-loss revision has the three authority members null
and both origin members nonnull, even though its origin apply is itself
externally authorised. The two nonnull provenance arms are mutually exclusive
at the revision row. Thus a linked loss `recovery-in-progress -> open` still
binds the owning custody batch/apply, while `open -> recovery-in-progress` binds
the fresh apply that created its custody. `recordedAt`, apply ID and write identities were fixed
in the prepared transition plan; the apply digest is computed after authority but
before the transaction. No journal value enters its apply, semantic/source,
subject, replay, batch or intent preimage.

Batch and intent rows never update or delete. Returned receipts are separate
append-only rows keyed by batch/ordinal; apply is a separate append-only marker.
Derived state is `prepared` for batch+effects+all intents without the exact
completion/authorization/apply set, `authority-complete` for one exact completion
covering all verified authority rows/effects plus one verified scope checkpoint
without apply, and `applied` only with the exact apply marker. There are no
independently mutable copies of those states. Direct SQL
cannot expose a half receipt, half review or half apply.

The terminal-proof union exhaustively matches the lifecycle edge table:
`zero-dispatch-no-effect` embeds the exact zero-dispatch journal;
`predispatch-superseded` embeds the awaiting-boundary/prepared source/checkpoint
drift proof; `postterminal-adoption-cas-superseded` embeds the exact provider-
terminal-or-committing source state, authenticated terminal observation,
replacement candidate, checkpoint, precondition and local write-set values that
were equality-checked by the failed adoption CAS; `fresh-handoff-superseded`
embeds the zero-dispatch nonfinal-source handoff, issue, preparation and complete
fresh apply plan;
`provider-terminal` embeds the authenticated closed terminal observation and
replacement candidate; `provider-no-effect` embeds the activated adapter's
authenticated no-effect proof; `integrity-quarantine` embeds malformed/crossed/
conflict evidence; and `confirmed-abandon` embeds the exact operator authority,
gate, direct-human attestation and archival write set. Provider observation is
absent in every nonprovider arm. Kind, source phase, disposition, evidence and
nullability are a closed truth table. In particular, predispatch supersession is
legal only from awaiting-boundary/prepared, postterminal adoption-CAS
supersession only from provider-terminal/committing, and neither proof arm may
justify the other. Fixtures cover every legal from-state/proof/disposition edge
and reject using one arm to justify another.

Each proof arm is a closed object with `schemaVersion:1`, its literal `kind`, and
exactly these remaining members:

~~~yaml
zero-dispatch-no-effect:
  sourceState: awaiting-boundary | prepared
  providerActionRef: exact-ref
  zeroDispatchJournalDigest: exact-digest
  dispatchCountDec: "0"
  expectedSourceJournalDigest: exact-digest
  expectedCheckpointDigest: exact-digest

predispatch-superseded:
  sourceState: awaiting-boundary | prepared
  driftKind: source | checkpoint
  expectedSourceJournalDigest: exact-digest
  observedSourceJournalDigest: exact-digest
  expectedCheckpointDigest: exact-digest
  observedCheckpointDigest: exact-digest

postterminal-adoption-cas-superseded:
  sourceState: provider-terminal | committing
  terminalObservationDigest: exact-digest
  replacementCandidateDigest: exact-digest
  expectedSourceJournalDigest: exact-digest
  observedSourceJournalDigest: exact-digest
  expectedCheckpointDigest: exact-digest
  observedCheckpointDigest: exact-digest
  expectedMutationPreconditionDigest: exact-digest
  failedCasEvidenceDigest: exact-digest

fresh-handoff-superseded:
  sourceState: awaiting-boundary | prepared
  providerActionRef: exact-old-ref
  zeroDispatchJournalDigest: exact-digest
  dispatchCountDec: "0"
  issueId: exact-issue
  preparationDigest: exact-digest
  freshHandoffDigest: exact-digest
  freshApplyPlanDigest: exact-digest
  replacementActionRef: exact-distinct-new-ref

provider-terminal:
  sourceState: provider-terminal | committing
  terminalObservationDigest: exact-digest
  replacementCandidateDigest: exact-digest
  launchAttestationDigest: exact-digest
  adoptionPreconditionDigest: exact-digest

provider-no-effect:
  sourceState: provider-terminal
  providerActionRef: exact-ref
  adapterContractDigest: exact-digest
  authenticatedNoEffectProofDigest: exact-digest
  reason: provider-declared-no-effect

integrity-quarantine:
  sourceState: awaiting-boundary | prepared | dispatched | accepted | ambiguous | provider-terminal | committing
  failureKind: malformed | crossed | conflicting | unverifiable
  integrityEvidenceDigest: exact-digest
  conflictingRecordDigest: exact-digest | null

confirmed-abandon:
  oneOf:
    - sourceKind: custody | generation-loss
      sourceState: exact-nonterminal-source-state
      operatorId: exact-operator
      gateId: exact-gate
      gateRevision: positive
      directHumanAttestationDigest: exact-digest
      archivalMutationPlanDigest: exact-equal-transition-plan-digest
    - sourceKind: recovery-retirement
      retirementRef: exact-revision-one-retirement-plan-ref
      finalizedCustodyRef: exact-finalized-nonadopted-custody-ref
      finalizedCustodySourceRefDigest: exact-digest
      finalizedCustodyJournalDigest: exact-digest
      finalizedDisposition: no-effect | superseded | quarantined
      operatorId: exact-operator
      gateId: exact-gate
      gateRevision: positive
      directHumanAttestationDigest: exact-digest
      archivalMutationPlanDigest: exact-equal-mutation-plan-digest
~~~

`zero-dispatch-no-effect` maps only to no-effect;
`predispatch-superseded`, `postterminal-adoption-cas-superseded` and `fresh-
handoff-superseded` only to superseded; `provider-terminal` only to adopted (and may carry a linked loss
recovered-adopted write); `provider-no-effect` only to no-effect;
`integrity-quarantine` only to quarantined; and `confirmed-abandon` only to
abandoned for a nonfinal custody/loss or `recovery-retired` for an already-final
nonadopted custody plan. For standalone generation loss, only confirmed-abandon is terminal;
linked recovered-adopted is proved by the adopted custody's provider-terminal
arm plus the exact linked-loss before/after writes. Digests cannot substitute for
wrong-arm members because the closed proof codec is validated before hashing.
The fresh handoff arm is legal only for an awaiting-boundary/prepared nonfinal
source with proved zero dispatch. A dispatched/accepted/ambiguous source must
first reach an authenticated ordinary terminal/no-effect/abandon path; fresh
recovery cannot repurpose this arm.

For an adopted chair, preparation occurs at the lifecycle/review serialization
point. Before the batch it persists one immutable
`lifecycleReviewAdoptionReservationV1` containing exactly schema version,
reservation ID, project/session/run/agent, finalized custody ref, lifecycle
adoption evidence digest, terminal-sequence high-water, active target/pointer and
predecessor binding snapshots (or exact null target arm), recovery-source ref and
decision, the final decision below, certification cut or null, and local mutation
plan digest. `reviewReservationDigest=LD("review-adoption-reservation",body)`
over all those members except the digest. It contains no batch, intent, receipt,
apply, successor-row or reservation digest.

The final decision is one exact arm:

~~~yaml
reviewAdoptionDecisionV1:
  oneOf:
    - schemaVersion: 1
      outcome: rebound
      targetGeneration: exact-target
      predecessorBindingGeneration: exact-active-binding
      predecessorBindingDigest: exact-active-binding-digest
      terminalSequenceHighWater: nonnegative
      lifecycleCustodyRef: exact-finalized-custody-ref
      lifecycleAdoptionEvidenceDigest: exact-digest
      certificationCut: exact-reviewCertificationCutV1
      successorBindingGeneration: predecessor-plus-one
      successorBindingDigest: exact-planned-binding-digest
      targetSubjectDigest: exact-unchanged-subject
      reviewStateSetDigest: exact-current-head/open/repair-set
    - schemaVersion: 1
      outcome: left-stale
      reason: no-current-target | target-subject-changed | binding-changed | target-head-changed | recovery-source-conflict
      targetGeneration: exact-target | null
      predecessorBindingGeneration: positive | null
      predecessorBindingDigest: exact-digest | null
      terminalSequenceHighWater: nonnegative
      lifecycleCustodyRef: exact-finalized-custody-ref
      lifecycleAdoptionEvidenceDigest: exact-digest
      certificationCut: exact-reviewCertificationCutV1 | null
      observedReviewStateDigest: exact-digest
~~~

The rebound arm requires a nonnull cut and all nonnull binding fields. The stale
arm has null target/binding/cut exactly for `no-current-target`; every other
reason requires all three nonnull and preserves the observed target without
mutation. `recoverySourceDecisionV1` is exactly either
`{schemaVersion:1,kind:"custody",sourceRef,terminalDisposition,
terminalEvidenceDigest,transitionProofDigest}` or
`{schemaVersion:1,kind:"generation-loss",sourceRef,linkedLossAfterRef,
linkedLossAfterSemanticDigest,state,abandonKind,terminalEvidenceDigest,
recoveryActionRef}`. `sourceRef` remains the immutable original recovery source;
the after ref/semantic equality-copy the same batch's linked loss effect and the
state/abandon/action tuple describes that after revision. It obeys the exact
generation-loss truth table and contains no receipt-derived
value. The reservation is the adoption linearization point: it fences target
preparation/rebind/another adoption but does not block later provider terminals,
which are post-cut. External subject and apply equality-copy this reservation;
no recovery rereads or recomputes a later high-water, decision or binding.

After the prepared transaction commits, the worker processes local intent order
without assuming adjacent global authority sequences. It point-reads before
append; exact verified presence succeeds, absence permits one idempotent append,
and mismatch conflicts. If append returns, throws or times out, the worker
point-reads again; exact verified presence succeeds, while absence/unavailability
leaves the intent pending and returns a retryable error. It never infers failure
from a lost response. Each verified result inserts one immutable authority-
receipt child. No terminal/review/provider/history/audit mutation occurs yet.

When all declared children and exact effect rows exist, the worker inserts one
immutable batch-completion row, pins and verifies the full scope checkpoint and
proves every child sequence is at or below its count and is a member of its
ordered set. It then inserts one immutable batch-authorization row
and scope checkpoint/head history. A following transaction equality-checks the
exact primary current journal, transition replay and complete mutation plan;
applies all planned custody/review/source/binding/archive/fresh-handoff writes;
and inserts one apply marker. Exact post-state replay returns that apply; any
state other than the exact pre-state or exact applied post-state is integrity
failure. Later provider terminal/high-water/evidence rows allowed by the review
reservation are post-cut and do not stale apply; it consumes the reserved cut
without comparing it to the later high-water. Unrelated target/binding mutation
remains fenced until apply. A transient authority failure leaves the batch
prepared and the source unchanged; it never converts no-effect to quarantine.
Crash fixtures stop after pre-read, append success, append-success-then-throw,
receipt insert, checkpoint authorization, every planned write boundary and apply
insert.

New-scope creation commits only one immutable scope-admission outbox row. Its
worker calls `admitScope` with the stored exact scope; return, timeout and lost
response all retry that same operation. After verifying the returned zero
checkpoint and pinned zero namespace member, one local transaction inserts the
admitted scope, verified zero checkpoint, canonical scope head and resolution,
in that order, then commits their deferred cycle. It writes no custody, loss,
batch, intent, handoff, commit, apply, lease or provider state. Exact replay is
a no-op; crossed local state is `SNAPSHOT_INVALID`.

Startup drains or proves every unresolved outbox before hydration. Authority
unavailability is `RECOVERY_PENDING`: lifecycle work and hydration do not start.
An external scope whose local outbox was rolled back remains visible in the
namespace and is `SNAPSHOT_INVALID`; hydration cannot recreate it.

Hydration is read-only: it first pages the authenticated project namespace,
then every listed scope at one pinned checkpoint, including scopes absent from
the local snapshot. It never calls `admitScope`, appends or writes a resolution.
It exact-reconciles each external record to
one local immutable intent plus either pending or applied state. A pending intent
may be externally absent; an applied intent may not. Any external row without an
exact local intent proves whole-custody/run rollback; any local authority receipt
absent externally proves ledger loss. Only after successful hydration may the
runtime recovery worker resume a pending append/apply. Missing, extra, crossed,
deleted, downgraded, chain-invalid, digest-invalid, unverifiable or coordinated-
resealed evidence is `SNAPSHOT_INVALID`; an admitted lifecycle scope without its
authority fails closed. Each admitted scope must equality-copy exactly one
outbox and one resolution across request ID, exact scope/digest, authority and
admission tuple, verified zero checkpoint, initial canonical head and pinned
zero namespace member. An extra, unresolved, missing or crossed outbox,
resolution, admitted scope, scope head or namespace member is
`SNAPSHOT_INVALID` before any lifecycle recovery write.

`LifecycleDomainSnapshotV1` is the exact closed root
`{schemaVersion,projectId,domainRevision,scopeAdmissionOutbox,
scopeAdmissionResolutions,admittedRunScopes,custodyIdentities,
custodyRevisions,custodyHeads,generationLossIdentities,generationLossRevisions,
generationLossHeads,receiptBatches,receiptIntents,authorityReceipts,
custodyReceiptEffects,generationLossReceiptEffects,recoveryRetirementEffects,
freshOriginReceiptEffects,
batchCompletions,scopeCheckpoints,scopeHeads,namespaceCheckpoints,namespaceMembers,
namespaceHeads,batchAuthorizations,transitionApplies,reviewReservations,
reviewAuthorityBindings,
recoveryRetirementPlans,recoveryRetirements,freshPreparations,freshHandoffs,
freshCommits,recoveryIssues,recoveryIssueRevocations,recoverySourceHeads,
snapshotDigest}`. Arrays use the exact Spec 04 row codecs, are strictly sorted by
their displayed primary keys and contain no duplicate. `snapshotDigest=LD(
"lifecycle-domain-snapshot",root)` with only snapshot digest omitted. Every
append-only array is mandatory, including an empty array; no undefined or
legacy optional receipt field exists.

Fresh recovery uses three immutable closed records:

~~~yaml
freshRotationPreparationV1:
  schemaVersion: 1
  preparationId: exact-preparation
  attemptId: exact-attempt
  issueId: exact-issue
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  recoverySource: exact-source-ref
  sourceJournalDigest: exact-current-journal
  replacementActionRef: exact-new-pair
  checkpointRef: exact-checkpoint
  checkpointDigest: exact-digest
  checkpointValidationReceiptDigest: exact-digest | null
  adapterContractDigest: exact-digest
  operation: fresh-rotate
  reservedProviderGeneration: positive
  reservedPrincipalGeneration: positive
  reservedBridgeGeneration: positive
  preparationDigest: exact-digest

freshRecoveryHandoffV1:
  schemaVersion: 1
  handoffId: exact-handoff
  preparationId: exact-preparation
  preparationDigest: exact-digest
  attemptId: exact-attempt
  issueId: exact-issue
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  sourceMode: terminalize-nonfinal-custody | reuse-final-custody | open-generation-loss
  recoverySource: exact-source-ref
  sourceJournalDigest: exact-current-journal
  newCustodyId: exact-reserved-custody
  plannedApplyId: exact-transition-apply
  newCustodySemanticDigest: exact-planned-revision-one-semantic
  newCustodySourceRefDigest: exact-planned-revision-one-source-ref
  generationLossAfterRef: exact-planned-recovery-in-progress-ref | null
  replacementActionRef: exact-new-pair
  reservedProviderGeneration: positive
  reservedPrincipalGeneration: positive
  reservedBridgeGeneration: positive
  admissionDigest: exact-fresh-recovery-admission
  freshApplyPlan: exact-lifecycleMutationPlanV1
  freshApplyPlanDigest: exact-digest
  handoffDigest: exact-digest

freshCommitRecordV1:
  schemaVersion: 1
  commitId: exact-commit
  handoffId: exact-handoff
  handoffDigest: exact-digest
  preparationId: exact-preparation
  preparationDigest: exact-digest
  attemptId: exact-attempt
  issueId: exact-issue
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  recoverySource: exact-source-ref
  sourceJournalDigest: exact-handoff-source-journal
  newCustodyRef: exact-created-revision-one-custody
  newCustodySemanticDigest: exact-created-semantic
  newCustodySourceRefDigest: exact-created-source-ref
  newCustodyJournalDigest: exact-created-journal
  generationLossAfterRef: exact-created-recovery-in-progress-ref | null
  replacementActionRef: exact-new-pair
  admissionDigest: exact-fresh-recovery-admission
  freshApplyPlanDigest: exact-handoff-plan
  freshApplyId: exact-transition-apply
  freshApplyDigest: exact-transition-apply-digest
  sourceTerminalReceiptApplyDigest: exact-digest | null
  commitDigest: exact-digest
~~~

Preparation digest omits itself and uses `LD("fresh-preparation",body)`;
handoff digest similarly uses `LD("fresh-handoff",body)`; commit digest uses
`LD("fresh-commit",body)`. No handoff contains a batch/intent/receipt/apply/
commit back-pointer. For `terminalize-nonfinal-custody`, the immutable handoff is
referenced by a custody-terminal batch using `fresh-handoff-superseded`; source
custody and issue remain unchanged while authority is pending. One authorized
apply finalizes the old custody as superseded, appends its journal, creates the
new custody at revision one, inserts the commit and derives issue consumption.
Append failure creates none of those effects. `freshApplyId` and
`freshApplyDigest` identify the same `terminal-fresh` apply for
`terminalize-nonfinal-custody` and the same `fresh` apply for both other modes;
`sourceTerminalReceiptApplyDigest` equals `freshApplyDigest` exactly in the
terminal-fresh arm and is null otherwise. `reuse-final-custody` requires the
exact terminal journal and creates the new custody/commit directly from the same
handoff. `open-generation-loss` requires the exact open loss journal and one
transaction creates the new custody/commit and moves the loss to recovery-in-
progress; it is nonterminal and has no terminal receipt batch.
For `open-generation-loss`, `generationLossAfterRef` is nonnull, is the source
loss revision plus one and equality-copies across handoff, fresh apply, new loss
journal and commit; that journal selects the origin-fresh apply arm. A
`terminalize-nonfinal-custody` whose old custody actively owns a loss instead
transfers that same loss `recovery-in-progress(A) -> recovery-in-progress(B)` as
the authenticated linked batch effect, so the field is its receipt-backed next
revision; it is null when no loss is linked. `reuse-final-custody` requires no
nonterminal loss and therefore null. If a finalized custody's prior terminal
effect reopened a loss, the operator source is canonically that open loss rather
than the finalized custody. Recovery retirement likewise rejects while any
nonterminal loss or custody owns the agent.

Issue status is a derived projection, not a mutable duplicate: valid unexpired
issue without handoff/apply is `active`; handoff without commit is `commit-
pending`; commit is `consumed`; revocation/expiry may win only before the handoff
linearization. A pending handoff freezes later expiry/revocation until exact
apply or explicit integrity recovery. The relation is bidirectional: every
fresh recovery custody has exactly one preparation, handoff, commit, issue,
attempt and source; every commit/consumed issue has that exact set; none is
shared. A commit-pending issue without one handoff, a committed issue projected
active/revoked/expired, an orphan consumed issue or an active issue with a
commit/custody is `SNAPSHOT_INVALID`. Exact Preview replay precedes source-state
validation; exact Commit replay precedes live checks and never reopens a loss.

The digest dependency order is binding and acyclic. The transition branch is:
leaf request/state objects; preparation, review reservation and handoff core;
transition proof and mutation plan; retirement plan; owner semantic/source ref;
effect/replay; terminal, retirement, review or fresh-origin subject; ordered
subject set; batch ID; intents; authority receipts; transition-apply body/digest;
post-authority journal wrapper; atomic apply marker and final commit. The
scope-admission branch is: exact admitted scope; scope digest and outbox ID;
verified zero scope checkpoint and pinned namespace proof; admission resolution.
The branches meet only through the verified checkpoint used by authorization.
Final
journal/apply/receipt/batch/intent digests never feed an earlier node. Checked-in
cross-Rust/TypeScript goldens freeze every JCS preimage and digest. Mutants cover
every omitted/extra/null/wrong-type member, array reorder/duplicate, domain swap,
cycle-producing downstream field, integer/decimal boundary, proof-arm swap,
crossed owner/revision/source, linked-loss drift and altered fresh/review plan.

Runtime append failures are `LIFECYCLE_RECEIPT_AUTHORITY_UNAVAILABLE`,
`LIFECYCLE_RECEIPT_APPEND_FAILED` or `LIFECYCLE_RECEIPT_INVALID`. Hydration
normalises every absent/untrusted/crossed receipt failure to `SNAPSHOT_INVALID`.
