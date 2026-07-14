
### 9.4.1 Externally authenticated lifecycle receipts

Lifecycle snapshot integrity does not rely on a digest that the same snapshot
can reseal. Every externally admitted project/run lifecycle scope, including a
generation-loss-only scope with no custody, receives a mandatory
`LifecycleIntegrityReceiptAuthorityPort` whose storage, authentication material
and append head live outside `LifecycleDomainSnapshotV1`. It exposes exactly:

~~~text
admitScope(exactLifecycleAdmittedRunScopeV1)
  -> authenticatedInitialScopeCheckpointV1
appendReceipt(intentDigest, exactSubject) -> authenticatedReceipt
readReceipt(kind, projectSessionId, runId, agentId, ownerRefDigest, ownerRevision)
  -> { exactSubject, authenticatedReceipt } | null
readScopeCheckpoint(projectSessionId, runId) -> authenticatedScopeCheckpoint
readScopeCheckpointAt(checkpointDigest) -> authenticatedScopeCheckpoint
readScopePageAt(checkpointDigest, afterAuthoritySequence, limit=256)
  -> { orderedRecords, nextAfter | null }
readNamespaceCheckpoint(projectId) -> authenticatedNamespaceCheckpoint
readNamespacePageAt(checkpointDigest, afterScopeKey, limit=256)
  -> { orderedScopeHeads, nextAfter | null }
verifyReceipt(exactSubject, authenticatedReceipt) -> boolean
verifyScopeCheckpoint(authenticatedScopeCheckpoint) -> boolean
verifyNamespaceCheckpoint(authenticatedNamespaceCheckpoint) -> boolean
~~~

Scope admission is one atomic authority operation that creates the exact scope,
its immutable zero checkpoint and its project namespace membership. Exact replay
returns that same initial checkpoint even after the live head advances. Reusing
`(projectId,projectSessionId,runId,authorityId)` with any changed scope byte is
`LIFECYCLE_SCOPE_ADMISSION_CONFLICT`; partial external creation is impossible.

Append is idempotent for the exact subject. Reusing the same
kind/project-session/run/agent/owner-ref/revision key with changed subject bytes
conflicts;
authority records cannot be updated or deleted. `ownerRefDigest=LD("receipt-
owner-ref",ownerRef)` over the exact selected closed owner-ref arm. Custody and
generation-loss refs carry their immutable positive revision and semantic/source
digests; a recovery-retirement ref carries its immutable plan revision one and
plan digest. Revision is canonical decimal.
Receipt sequence is positive, contiguous and
append-only within one authority/project-session/run scope.

The five exact closed subjects and their exact source union are:

~~~yaml
lifecycleCustodyTerminalReceiptSubjectV1:
  schemaVersion: 1
  kind: custody-terminal
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  ownerRef:
    kind: custody
    custodyRef: exact-lifecycle-custody-ref-v1
    sourceRefDigest: exact-custody-source-ref-digest
  admissionDigest: exact-lifecycle-admission-digest
  providerActionRef: exact-provider-action-ref
  fromState: exact-legal-nonterminal-custody-state
  disposition: adopted | no-effect | superseded | quarantined | abandoned
  terminalProofKind: exact-proof-kind-for-edge
  terminalEvidenceDigest: exact-digest
  recoverySource: exact-lifecycle-recovery-source-ref-v1
  recoverySourceDecisionDigest: exact-digest | null
  linkedLossEffectDigest: exact-digest | null
  transitionReplayDigest: exact-digest

lifecycleGenerationLossTerminalReceiptSubjectV1:
  schemaVersion: 1
  kind: generation-loss-terminal
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  ownerRef:
    kind: generation-loss
    generationLossRef: exact-generation-loss-ref-v1
    sourceRefDigest: exact-generation-loss-source-ref-digest
  admissionDigest: exact-lifecycle-admission-digest
  lossKind: generation-advance | context-advance
  fromState: open
  terminalState: abandoned
  abandonKind: direct-open
  recoveryCustodyRef: null
  recoveryActionRef: null
  operatorDecisionDigest: exact-digest
  terminalEvidenceDigest: exact-digest
  transitionReplayDigest: exact-digest

lifecycleCustodyRecoveryRetirementReceiptSubjectV1:
  schemaVersion: 1
  kind: custody-recovery-retirement
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  ownerRef:
    kind: recovery-retirement
    retirementRef: exact-immutable-retirement-plan-ref-v1
    retirementPlanDigest: exact-retirement-plan-digest
  finalizedCustodyRef: exact-already-finalized-custody-ref-v1
  finalizedCustodySourceRefDigest: exact-finalized-custody-source-ref-digest
  finalizedCustodyJournalDigest: exact-finalized-custody-journal-digest
  admissionDigest: exact-confirmed-abandon-admission-digest
  finalizedDisposition: no-effect | superseded | quarantined
  finalizedTerminalEvidenceDigest: exact-digest
  terminalProofKind: confirmed-abandon
  transitionProofDigest: exact-digest
  mutationPlanDigest: exact-digest
  retirementEvidenceDigest: exact-digest
  transitionReplayDigest: exact-digest

lifecycleReviewDecisionReceiptSubjectV1:
  schemaVersion: 1
  kind: review-adoption-decision
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  ownerRef:
    kind: custody
    custodyRef: exact-lifecycle-custody-ref-v1
    sourceRefDigest: exact-custody-source-ref-digest
  custodyTerminalSubjectDigest: exact-ordinal-one-subject-digest
  lifecycleAdoptionEvidenceDigest: exact-digest
  reviewReservationDigest: exact-digest
  reviewDecisionDigest: exact-digest
  certificationCutDigest: exact-digest | null
  recoverySource: exact-lifecycle-recovery-source-ref-v1
  recoverySourceDecisionDigest: exact-digest | null
  transitionReplayDigest: exact-same-batch-replay-digest

lifecycleFreshOriginReceiptSubjectV1:
  schemaVersion: 1
  kind: fresh-origin
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  ownerRef:
    kind: custody
    custodyRef: exact-planned-revision-one-custody-ref-v1
    sourceRefDigest: exact-new-custody-source-ref-digest
  sourceMode: terminalize-nonfinal-custody | reuse-final-custody | open-generation-loss
  recoverySource: exact-lifecycle-recovery-source-ref-v1
  sourceJournalDigest: exact-source-journal-digest
  admissionDigest: exact-fresh-recovery-admission-digest
  freshHandoffDigest: exact-handoff-digest
  freshApplyPlanDigest: exact-handoff-plan-digest
  affectedGenerationLossBeforeRef: exact-generation-loss-ref-v1 | null
  affectedGenerationLossBeforeJournalDigest: exact-digest | null
  affectedGenerationLossAfterRef: exact-generation-loss-ref-v1 | null
  affectedGenerationLossAfterSemanticDigest: exact-digest | null
  freshOriginEffectDigest: exact-effect-digest
  transitionReplayDigest: exact-same-batch-replay-digest
~~~

`lifecycleReceiptOwnerRefV1` is exactly one closed arm:
`{kind:"custody",custodyRef,sourceRefDigest}`;
`{kind:"generation-loss",generationLossRef,sourceRefDigest}`; or
`{kind:"recovery-retirement",retirementRef,retirementPlanDigest}`. The first two
refs bind their immutable semantic revision. `retirementRef` is exactly
`{retirementId,revisionDec:"1"}` and its plan digest binds the finalized custody,
admission, proof and complete archival mutation plan before authority append.

`lifecycleRecoverySourceRefV1` is exactly one closed arm: `{kind:"none"}`;
`{kind:"custody",custodyRef,sourceRefDigest}`; or
`{kind:"generation-loss",generationLossRef,sourceRefDigest}`. Both refs contain
their positive immutable revision. No selected arm omits a required member or
contains a member from another arm. The source-ref digest binds the complete
immutable semantic revision, not the mutable head or post-authority journal
wrapper. Custody semantic digest is `LD("custody-semantic",closedSemantic)`;
generation-loss semantic digest uses `LD("generation-loss-semantic",
closedSemantic)`. Both semantic objects exclude batch, intent, authority receipt,
authorization, apply and journal digests.

The standalone generation-loss subject has only the exact
`open -> abandoned/direct-open` null-action arm. A recovery-in-progress loss is
owned by its exact active custody: adopted custody produces linked
`recovered-adopted`, abandoned custody produces linked
`abandoned/recovery-attempt`, and no-effect/superseded/quarantined custody
returns it to open with immutable attempt history, except the proved zero-dispatch
fresh-handoff supersession that atomically transfers its active recovery owner to
the newly created custody. Those exact before/after loss
revisions and their effect digest occur in the custody terminal subject and
authenticated transition replay, so no second subject represents the same
semantic transition. Absence of a provider action never exempts standalone
direct-open abandonment from external integrity evidence.

Confirmed abandonment of an already-finalized nonadopted custody is the distinct
`custody-recovery-retirement` subject. Preparation first persists its immutable
revision-one retirement plan. Apply never rewrites the finalized custody or
appends another custody revision: the subject equality-copies that exact custody
ref, source and journal, while its replay covers the destructive archival,
lease, delivery, obligation, membership, barrier, grant and freeze writes.
Adopted or already-abandoned custody cannot select this path.

`reviewDecisionDigest=LD("review-adoption-decision",decision)` for the final
closed arm defined below. `recoverySourceDecisionDigest=LD("recovery-source-
decision",decision)` for a linked prior-custody terminal decision or generation-
loss recovery decision and is nonnull exactly when recovery source is not
`none`. The cut digest/null arm must match the selected final decision. None of
these preimages contains a receipt, intent, batch or apply digest. Thus custody,
adoption evidence, decision, cut and linked recovery outcome cannot be rewritten
together inside a resealed snapshot.

Every custody and generation-loss mutation appends one immutable revision row,
then moves a small head pointer to that exact row. Revision one is creation and
each legal edge increments by exactly one. Terminal owner revision is therefore
the immutable final journal revision, not a hardcoded creation revision. Both
receipt subjects and every review cut/binding equality-copy that exact ref.
Authority lookup uses `(kind,projectSessionId,runId,agentId,ownerRefDigest,
ownerRevision)`. Goldens include revision two and the maximum safe integer;
creation/final confusion, leading-zero, mutable-head and crossed-owner forms
fail.

`admissionDigest=LD("admission",lifecycleAdmissionV1)`. The exact admission is
one closed arm: `self-request` contains the full accepted rotate/compact request;
`fresh-recovery` contains the accepted fresh-rotate handoff request, exact issue,
preparation and apply plan, but no batch/intent/receipt/apply/final commit; and
`confirmed-abandon` contains the full
accepted operator commit, source, gate and direct-human confirmation. Each arm
also contains schema version, project/session/run, actor principal and stable
command ID. Command/attempt replay stores that same digest. No terminal subject
accepts a caller-supplied or separately reconstructed digest.

The authenticated receipt has exactly `schemaVersion=1`, matching `kind`,
nonempty `authorityId`, positive safe-integer `authoritySequence`,
`previousReceiptDigest|null`, `subjectDigest`, `intentDigest`, `receiptDigest`
and nonempty opaque `attestation`. Receipt sequence one has null previous digest;
every later sequence has the exact preceding receipt digest.

Lifecycle canonical JSON is RFC 8785 JCS UTF-8 with no BOM, prefix, suffix or
trailing newline. Every object is closed and every selected-arm member is
present; `undefined` is inadmissible and null appears only where the displayed
codec says null. A JSON integer is an integer in `0..9007199254740991`; a
positive integer excludes zero. A `*Dec` member is a JSON string equal to `"0"`
or `[1-9][0-9]{0,15}` and its numeric value is at most 9007199254740991. IDs are
nonempty UTF-8 strings of at most 256 bytes without NUL; digests match
`sha256:[0-9a-f]{64}`; timestamps, where admitted, are RFC 3339 UTC with exactly
three fractional digits. Arrays preserve the specified order and are duplicate-
free. No non-finite, fractional, negative or exponent-form lifecycle number is
admissible.

Every digest below uses one function:

~~~text
LD(domain, value) =
  "sha256:" + lowerhex(SHA256(
    UTF8("agent-fabric.lifecycle.v1\u0000" + domain + "\u0000") ||
    RFC8785_JCS_UTF8(value)))
~~~

`domain` is the exact lowercase ASCII literal named below. The two NUL bytes
are literal single bytes; `||` is byte concatenation. A digest member is never
inside its own preimage. `subjectDigest=LD("receipt-subject", exactSubject)`.
`receiptDigest=LD("authenticated-receipt", receiptBodyV1)`, where
`receiptBodyV1` contains exactly schema version, kind, authority ID/sequence,
previous receipt digest, intent digest and subject digest; it excludes
`receiptDigest` and attestation. Attestation algorithm and key custody are
authority-adapter owned and never enter the snapshot. Closed-shape/digest
validation, `verifyReceipt` and authoritative ledger membership are all
required.

The lifecycle digest registry is exact:

| Value | `LD` domain |
| --- | --- |
| lifecycle admission | `admission` |
| custody semantic revision | `custody-semantic` |
| custody journal wrapper | `custody-journal` |
| generation-loss semantic revision | `generation-loss-semantic` |
| generation-loss journal wrapper | `generation-loss-journal` |
| recovery source ref | `recovery-source-ref` |
| receipt owner ref | `receipt-owner-ref` |
| recovery retirement plan | `recovery-retirement-plan` |
| review adoption decision | `review-adoption-decision` |
| review adoption reservation | `review-adoption-reservation` |
| recovery source decision | `recovery-source-decision` |
| transition proof | `transition-proof` |
| affected-row mutation plan | `mutation-plan` |
| one lifecycle owner effect | `lifecycle-effect` |
| ordered lifecycle effect set | `effect-set` |
| transition replay | `transition-replay` |
| receipt subject | `receipt-subject` |
| ordered receipt subject set | `receipt-subject-set` |
| receipt batch ID body | `receipt-batch-id` |
| receipt intent body | `receipt-intent` |
| authenticated receipt body | `authenticated-receipt` |
| ordered authority receipt set | `authority-receipt-set` |
| receipt batch completion | `batch-completion` |
| receipt batch authorization | `batch-authorization` |
| transition apply body | `transition-apply` |
| ordered scope record set | `scope-record-set` |
| scope checkpoint body | `scope-checkpoint` |
| namespace scope-head set | `namespace-scope-head-set` |
| namespace checkpoint body | `namespace-checkpoint` |
| admitted run scope | `admitted-scope` |
| scope-admission outbox ID | `scope-admission-outbox` |
| scope-admission resolution | `scope-admission-resolution` |
| fresh preparation | `fresh-preparation` |
| fresh handoff reservation | `fresh-handoff` |
| fresh commit | `fresh-commit` |
| lifecycle domain snapshot | `lifecycle-domain-snapshot` |

The accepted request codecs used by `lifecycleAdmissionV1` are exact:

~~~yaml
lifecycleCheckpointV1:
  relativePath: canonical-relative-path
  sha256: exact-digest
  mailboxWatermark: nonnegative-safe-integer
  acknowledgedAboveWatermark: strictly-ascending-unique-nonnegative-safe-integers
  inFlightChildren: strictly-ascending-unique-ids
  openWork: strictly-ascending-unique-ids
  nextAction: nonempty-bounded-string
  providerResumeReference: nonempty-bounded-string

rotationRequestV1:
  schemaVersion: 1
  action: compact | rotate
  agentId: exact-agent
  taskId: exact-task
  taskRevision: positive-safe-integer
  checkpoint: exact-lifecycleCheckpointV1
  commandId: stable-command-id

freshRotateCommitRequestV1:
  schemaVersion: 1
  commandId: stable-command-id
  projectId: exact-project
  previewId: exact-preview
  expectedPreviewRevision: positive-safe-integer
  previewDigest: exact-digest
  expectedIntentDigest: exact-digest
  confirmation: {kind: explicit, confirmationId: exact-id} | {kind: echo, echoedPreviewDigest: exact-equal-preview-digest}
  attemptId: exact-attempt
  issueId: exact-active-issue
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  recoverySource: exact-lifecycle-recovery-source-ref-v1
  replacementAdapterId: exact-adapter
  replacementContractDigest: exact-digest
  replacementActionRef: exact-new-provider-action-ref
  checkpointRef: exact-checkpoint-ref
  checkpointDigest: exact-digest
  checkpointValidationReceiptDigest: exact-digest | null
  preparationDigest: exact-fresh-preparation-digest
  handoffId: exact-handoff
  plannedApplyId: exact-transition-apply
  handoffApplyPlanDigest: exact-lifecycle-mutation-plan-digest

confirmedAbandonCommitRequestV1:
  schemaVersion: 1
  commandId: stable-command-id
  projectId: exact-project
  previewId: exact-preview
  expectedPreviewRevision: positive-safe-integer
  previewDigest: exact-digest
  expectedIntentDigest: exact-digest
  confirmation: {kind: explicit, confirmationId: exact-id} | {kind: echo, echoedPreviewDigest: exact-equal-preview-digest}
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  recoverySource: exact-lifecycle-recovery-source-ref-v1
  gateId: exact-approved-gate
  gateRevision: positive-safe-integer
  reason: nonempty-bounded-string
  directHumanAttestationDigest: exact-digest

lifecycleAdmissionV1:
  oneOf:
    - schemaVersion: 1
      admissionKind: self-request
      projectId: exact-project
      projectSessionId: exact-project-session
      runId: exact-run
      actorPrincipal: {kind: agent, agentId: exact-agent, principalGeneration: positive-safe-integer}
      commandId: exact-request-command
      request: exact-rotationRequestV1
    - schemaVersion: 1
      admissionKind: fresh-recovery
      projectId: exact-project
      projectSessionId: exact-project-session
      runId: exact-run
      actorPrincipal: {kind: operator, operatorId: exact-operator, sessionGeneration: positive-safe-integer}
      commandId: exact-request-command
      request: exact-freshRotateCommitRequestV1
    - schemaVersion: 1
      admissionKind: confirmed-abandon
      projectId: exact-project
      projectSessionId: exact-project-session
      runId: exact-run
      actorPrincipal: {kind: operator, operatorId: exact-operator, sessionGeneration: positive-safe-integer}
      commandId: exact-request-command
      request: exact-confirmedAbandonCommitRequestV1
~~~

Every brace-form union above is a closed object, not shorthand for an open map.
Outer scope, command and actor equality-copy the selected request and
authenticated principal. Echo confirmation requires byte-equal preview digest.
Checkpoint-validation receipt is nonnull exactly when the selected source lacked
a currently valid checkpoint and the separate validator supplied one.
`freshRotateCommitRequestV1` is the operator's Commit request name, not a
`FreshCommitRecord`: its handoff/apply plan is fixed before any authority append,
and the final record can only equality-copy its admission digest after apply.

Every scope page carries one byte-identical checkpoint:

~~~yaml
lifecycleAdmittedRunScopeV1:
  schemaVersion: 1
  projectId: exact-project
  projectSessionId: exact-project-session
  runId: exact-run
  authorityId: exact-authority
  admissionDigest: exact-first-lifecycle-admission
  admittedAt: exact-timestamp

lifecycleScopeAdmissionOutboxV1:
  schemaVersion: 1
  admissionRequestId: LD("scope-admission-outbox", {schemaVersion: 1, scopeDigest})
  scope: exact-lifecycleAdmittedRunScopeV1
  scopeDigest: LD("admitted-scope", scope)
  createdAt: exact-timestamp

lifecycleScopeAdmissionResolutionV1:
  schemaVersion: 1
  admissionRequestId: exact-outbox-id
  scopeDigest: exact-outbox-scope-digest
  initialScopeCheckpoint: exact-authenticated-zero-checkpoint
  namespaceCheckpointDigest: exact-verified-pinned-namespace-checkpoint
  namespaceMember:
    projectSessionId: exact-scope-project-session
    runId: exact-scope-run
    authorityId: exact-scope-authority
    scopeCheckpointDigest: exact-returned-zero-checkpoint-digest
    receiptCountDec: "0"
    headReceiptDigest: null
  verifiedAt: exact-timestamp
  resolutionDigest: LD("scope-admission-resolution", exact-body-without-digest)

lifecycleReceiptScopeCheckpointV1:
  schemaVersion: 1
  authorityId: exact-authority
  projectSessionId: exact-project-session
  runId: exact-run
  receiptCountDec: nonnegative
  headAuthoritySequenceDec: nonnegative
  headReceiptDigest: exact-digest | null
  orderedRecordSetDigest: exact-digest
  checkpointDigest: exact-digest
  attestation: nonempty-opaque

lifecycleReceiptNamespaceCheckpointV1:
  schemaVersion: 1
  authorityId: exact-authority
  projectId: exact-project
  scopeCountDec: nonnegative
  orderedScopeHeadSetDigest: exact-digest
  checkpointDigest: exact-digest
  attestation: nonempty-opaque
~~~

The checkpoint returned by `admitScope` is the existing scope-checkpoint codec
with `receiptCountDec:"0"`, `headAuthoritySequenceDec:"0"`, null head and
`orderedRecordSetDigest=LD("scope-record-set",[])`. Before local finalisation,
the daemon verifies that checkpoint and one pinned authenticated namespace
checkpoint containing exactly the displayed zero member. An absent, duplicate,
crossed, nonzero or unverifiable member is `SNAPSHOT_INVALID`.

`createdAt` is local outbox evidence, never an authority-scope member. Retry
sends only the byte-identical stored `scope`; the resolution stores the complete
attested initial checkpoint and namespace proof. Its local digest is equality
evidence, not a substitute for either authority verification.

Count and head sequence are equal; both zero exactly with null head and an empty
record set. `orderedRecordSetDigest=LD("scope-record-set",records)` for the
complete authority-sequence-ordered array of exactly
`[authoritySequenceDec,receiptDigest,intentDigest,kind,agentId,ownerKind,
ownerId,ownerRevisionDec]`. `checkpointDigest=LD("scope-checkpoint",body)` for
the complete checkpoint object with checkpoint digest and attestation omitted.
The first read pins that immutable checkpoint; every continuation is
`readScopePageAt(checkpointDigest,after,256)`. Normal live-head advancement does
not change or starve that pinned view. Only an inconsistent, absent or
unsupported pinned checkpoint restarts the scan, with at most three bounded
restarts. Pages contain at most 256 contiguous records;
`nextAfter` is the last returned sequence or null only at the pinned head.
Hydration rejects gap, duplicate/reorder/head drift and more than 65,536 receipts
per run, and calls `verifyScopeCheckpoint`. A point lookup alone is never
completeness evidence.

The namespace checkpoint covers all externally admitted authority scopes in the
project, including zero-receipt scopes. Its ordered members are exactly
`[projectSessionId,runId,authorityId,scopeCheckpointDigest,receiptCountDec,
headReceiptDigest]`, strictly sorted by project-session ID then run ID.
`orderedScopeHeadSetDigest=LD("namespace-scope-head-set",members)` and
`checkpointDigest=LD("namespace-checkpoint",body)` with checkpoint digest and
attestation omitted. Namespace pages are pinned and bounded exactly like scope
pages, with at most 256 members and at most 65,536 scopes. Hydration starts from
this authenticated directory, not locally discovered custody/run rows, so a
whole run removed from an older resealed snapshot remains externally visible.
Every namespace member is resolved through
`readScopeCheckpointAt(scopeCheckpointDigest)` and must exact-match that
separately verified historical checkpoint even when the live scope head
advances. Missing, extra, crossed or unverifiable scope membership is
`SNAPSHOT_INVALID`.

External append is driven by a durable local outbox, never by already-mutated
lifecycle state. One immutable batch and all its immutable intents are persisted
before any external append or terminal/adoption/archive mutation:

Preparation uses immediate foreign keys in this exact order: immutable review
reservation or fresh handoff, then batch, then every selected effect, then its
intent row(s). In particular fresh preparation is `handoff -> batch -> fresh
effect -> intent(s)`; effect-before-batch is invalid. The transaction commits
before any authority call.

~~~yaml
lifecycleRecoveryRetirementPlanV1:
  schemaVersion: 1
  retirementId: exact-stable-retirement
  revisionDec: "1"
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  finalizedCustodyRef: exact-finalized-nonadopted-custody
  finalizedCustodySourceRefDigest: exact-source-ref-digest
  finalizedCustodyJournalDigest: exact-journal-digest
  finalizedDisposition: no-effect | superseded | quarantined
  admissionDigest: exact-confirmed-abandon-admission
  transitionProof: exact-confirmed-abandon-proof
  transitionProofDigest: exact-digest
  mutationPlan: exact-complete-archival-plan
  mutationPlanDigest: exact-digest
  retirementEvidenceDigest: exact-digest
  plannedApplyId: exact-transition-apply
  recordedAt: exact-prepared-timestamp
  retirementPlanDigest: exact-digest

lifecycleIntegrityReceiptBatchV1:
  schemaVersion: 1
  batchId: exact-digest-derived-id
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  plannedApplyId: exact-transition-transaction-id
  transitionKind: custody-terminal | generation-loss-terminal | custody-recovery-retirement | fresh-origin
  primaryOwnerBeforeRef: exact-selected-terminal-ref-or-fresh-handoff-authority-ref
  primaryOwnerAfterRef: exact-terminal-revision-retirement-plan-or-revision-one-custody-ref
  primaryOwnerBeforeJournalDigest: exact-current-journal-digest
  primaryOwnerAfterSemanticDigest: exact-planned-semantic-digest
  effectsSetDigest: exact-ordered-primary-plus-optional-linked-plus-optional-secondary-effect-set-digest
  transitionReplay: exact-closed-object
  transitionReplayDigest: exact-digest
  orderedSubjectSetDigest: exact-digest
  receiptIntentCountDec: "1" | "2"
  secondaryIntentKind: none | fresh-origin | review-adoption-decision
  reviewReservationRef: exact-review-reservation-ref | null
  freshHandoffRef: exact-fresh-handoff-ref | null
  intents:
    - ordinalDec: "1" | "2"
      kind: custody-terminal | generation-loss-terminal | custody-recovery-retirement | review-adoption-decision | fresh-origin
      subject: exact-closed-subject-above
      subjectDigest: exact-digest
      intentDigest: exact-digest

lifecycleRecoveryRetirementEffectV1:
  schemaVersion: 1
  effectKind: recovery-retirement
  role: primary
  retirementPlanRef: exact-immutable-retirement-plan-ref-v1
  finalizedCustodyRef: exact-plan-custody-ref
  finalizedCustodySourceRefDigest: exact-plan-source-ref-digest
  finalizedCustodyJournalDigest: exact-plan-journal-digest
  finalizedDisposition: exact-plan-disposition
  finalizedTerminalEvidenceDigest: exact-plan-terminal-evidence-digest
  admissionDigest: exact-plan-admission-digest
  transitionProofDigest: exact-plan-transition-proof-digest
  mutationPlanDigest: exact-plan-mutation-plan-digest
  retirementEvidenceDigest: exact-plan-retirement-evidence-digest

lifecycleFreshOriginEffectV1:
  schemaVersion: 1
  effectKind: fresh-origin
  role: primary | secondary
  sourceMode: exact-fresh-subject-source-mode
  recoverySource: exact-fresh-subject-recovery-source
  sourceJournalDigest: exact-fresh-subject-source-journal
  freshHandoffDigest: exact-fresh-subject-handoff-digest
  admissionDigest: exact-fresh-subject-admission-digest
  freshApplyPlanDigest: exact-fresh-subject-plan-digest
  newCustodyRef: exact-fresh-subject-owner-custody-ref
  newCustodySemanticDigest: exact-planned-custody-semantic-digest
  newCustodySourceRefDigest: exact-fresh-subject-owner-source-ref-digest
  affectedGenerationLossBeforeRef: exact-fresh-subject-value
  affectedGenerationLossBeforeJournalDigest: exact-fresh-subject-value
  affectedGenerationLossAfterRef: exact-fresh-subject-value
  affectedGenerationLossAfterSemanticDigest: exact-fresh-subject-value

lifecycleFreshOriginReplayV1:
  schemaVersion: 1
  transactionId: exact-handoff-planned-apply-id
  projectSessionId: exact-project-session
  runId: exact-run
  agentId: exact-agent
  transitionKind: fresh-origin
  primaryOwnerBeforeRef: exact-fresh-handoff-authority-ref
  primaryOwnerAfterRef: exact-planned-revision-one-custody-owner-ref
  primaryOwnerBeforeJournalDigest: exact-source-journal-digest
  primaryOwnerAfterSemanticDigest: exact-new-custody-semantic-digest
  effectsSetDigest: exact-fresh-effect-set-digest
  admissionDigest: exact-fresh-admission-digest
  recoverySource: exact-recovery-source
  sourceMode: reuse-final-custody | open-generation-loss
  freshHandoffDigest: exact-handoff-digest
  freshApplyPlanDigest: exact-handoff-plan-digest
  affectedGenerationLossBeforeRef: exact-fresh-subject-value
  affectedGenerationLossBeforeJournalDigest: exact-fresh-subject-value
  affectedGenerationLossAfterRef: exact-fresh-subject-value
  affectedGenerationLossAfterSemanticDigest: exact-fresh-subject-value

lifecycleAuthorityReceiptV1:
  schemaVersion: 1
  batchId: exact-batch
  ordinalDec: exact-intent-ordinal
  intentDigest: exact-intent
  authorityReceipt: exact-authenticated-receipt

lifecycleReceiptBatchCompletionV1:
  schemaVersion: 1
  batchId: exact-batch
  transitionKind: exact-batch-transition-kind
  receiptIntentCountDec: "1" | "2"
  secondaryIntentKind: none | fresh-origin | review-adoption-decision
  ordinalOne: {intentDigest: exact-intent, subjectDigest: exact-subject, authorityReceiptDigest: exact-receipt}
  ordinalTwo: {intentDigest: exact-intent, subjectDigest: exact-subject, authorityReceiptDigest: exact-receipt} | null
  primaryEffect: {kind: custody | generation-loss | recovery-retirement | fresh-origin, effectDigest: exact-effect}
  linkedLossEffectDigest: exact-effect | null
  secondaryEffect: {kind: fresh-origin, effectDigest: exact-effect} | null
  orderedAuthorityReceiptSetDigest: exact-digest
  completionDigest: exact-digest

lifecycleReceiptBatchAuthorizationV1:
  schemaVersion: 1
  batchId: exact-batch
  batchCompletionDigest: exact-completion
  orderedAuthorityReceiptSetDigest: exact-digest
  verifiedScopeCheckpointDigest: exact-scope-checkpoint
  authorizedAt: exact-prepared-timestamp
  authorizationDigest: exact-digest

lifecycleTransitionApplyV1:
  oneOf:
    - schemaVersion: 1
      applyKind: terminal
      applyId: exact-batch-planned-apply-id
      receiptBatchId: exact-batch
      batchCompletionDigest: exact-batch-completion
      transitionReplayDigest: exact-batch-replay
      orderedAuthorityReceiptSetDigest: exact-digest
      verifiedScopeCheckpointDigest: exact-scope-checkpoint
      primaryOwnerAfterRef: exact-batch-after-ref
      freshHandoffRef: null
      freshSourceMode: null
      freshApplyPlanDigest: null
      newCustodyRef: null
      generationLossAfterRef: null
      freshOriginEffectDigest: null
      appliedMutationPlanDigest: exact-batch-plan
      localWriteSetDigest: exact-complete-write-set
      applyDigest: exact-digest
    - schemaVersion: 1
      applyKind: terminal-fresh
      applyId: exact-batch-planned-apply-id
      receiptBatchId: exact-batch
      batchCompletionDigest: exact-batch-completion
      transitionReplayDigest: exact-batch-replay
      orderedAuthorityReceiptSetDigest: exact-digest
      verifiedScopeCheckpointDigest: exact-scope-checkpoint
      primaryOwnerAfterRef: exact-batch-after-ref
      freshHandoffRef: exact-batch-handoff-ref
      freshSourceMode: terminalize-nonfinal-custody
      freshApplyPlanDigest: exact-handoff-plan
      newCustodyRef: exact-created-revision-one-custody
      generationLossAfterRef: exact-recovery-in-progress-transfer-ref | null
      freshOriginEffectDigest: exact-secondary-fresh-effect
      appliedMutationPlanDigest: exact-batch-plan
      localWriteSetDigest: exact-complete-write-set
      applyDigest: exact-digest
    - schemaVersion: 1
      applyKind: fresh
      applyId: exact-handoff-planned-apply-id
      receiptBatchId: exact-fresh-origin-batch
      batchCompletionDigest: exact-batch-completion
      transitionReplayDigest: exact-batch-replay
      orderedAuthorityReceiptSetDigest: exact-digest
      verifiedScopeCheckpointDigest: exact-scope-checkpoint
      primaryOwnerAfterRef: exact-created-revision-one-custody
      freshHandoffRef: exact-handoff-ref
      freshSourceMode: reuse-final-custody | open-generation-loss
      freshApplyPlanDigest: exact-handoff-plan
      newCustodyRef: exact-created-revision-one-custody
      generationLossAfterRef: exact-recovery-in-progress-ref | null
      freshOriginEffectDigest: exact-primary-fresh-effect
      appliedMutationPlanDigest: exact-handoff-plan
      localWriteSetDigest: exact-complete-write-set
      applyDigest: exact-digest
~~~
