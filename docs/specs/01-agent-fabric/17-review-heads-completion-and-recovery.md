
#### 32.19.6 Linear slot heads and immutable mutation receipts

Each target owns exactly four review_slot_heads keyed by run, target generation
and slot. A new target creates generation-zero heads with no current evidence
and carries forward the predecessor's complete open finding records and
repair-required set. Head and attempt generations are contiguous.

Certifying dispatch atomically reserves the exact target/slot/head generation,
increments its attempt generation and snapshots prior evidence/open findings
into the action/prompt. One nonterminal attempt may own that tuple. Target
prepare rejects while any prior-target attempt is nonterminal; it cannot
leapfrog a late result. Provider failure/no-effect/integrity retirement closes
the attempt without advancing evidence, after which a later action may reserve
the same evidence head under the next attempt generation.

A provider-terminal-failure therefore exports the receipt's closed
`reviewTerminalFailureRecord`, not a review-evidence record. It binds the
action/target/slot/task/attempt and terminal sequence, exact four-code failure
and digest, terminal/route/prompt/provider/model/bundle/profile identities, and
the unchanged head/open/repair set digests. It has no answer, verdict,
evidence ID, prior/new head or mutation receipt. Completion may project that
terminal action with evidence null and the unchanged head; review-evidence
read/list remain evidence-only.

A safe or UNUSABLE provider terminal transaction is different: it
automatically creates one daemon-derived immutable evidence ID and
reviewEvidenceMutationReceiptV1 and CAS-advances exactly that slot head before
the terminal result becomes visible. There is no terminal-unrecorded state and
no chair choice to discard an adverse result. The transaction validates
provider-reportedResolvedFindingDigests against the action's complete prior set.
It stores both that reported set and daemon-acceptedResolvedFindingDigests.
The accepted set equals the reported set only when the answer is safe, the
mandatory-read predicate is satisfied, the target/source/delivery/chair/profile
snapshot is still current at terminalisation, and each finding is eligible for
resolution on this successor target. Otherwise it is empty. In particular an
in-flight result against a logically stale target, an insufficient-coverage
result and a same-target repair-required finding resolve nothing. The daemon
computes:

~~~text
new open set =
  sorted unique((prior open set - daemon-accepted-resolved set)
                + new safe finding digests)
~~~

UNUSABLE resolves none. Insufficient-coverage CLEAN is UNUSABLE;
insufficient-coverage FINDINGS remains visible FINDINGS/noncertifying and adds
all safe findings while accepting no resolution. Every safe P0-P2 finding
enters the repair-required set automatically and cannot resolve on the same
target. A stale-target terminal result is still settled, recorded and head-
advancing against its reserved tuple; its currency is stale/noncertifying, its
accepted resolution set is empty and its safe new findings remain open for the
successor bundle. The record/receipt carry prior/new head and attempt
generations, prior evidence, complete prior open records, reported and accepted
resolved subsets, current findings, complete new open records,
readCoverageDigest and immutable gap summary. A second FINDINGS action begins
from the returned head and advances normally. A repaired target carries the
full safe ID/severity/summary/evidence plus origin target/action/result and lets
a fresh current, sufficient-coverage CLEAN resolve their digests.

~~~yaml
reviewEvidenceMutationReceiptV1:
  schemaVersion: 1
  evidenceId: exact-daemon-derived-id
  actionRef:
    adapterId: exact-adapter
    actionId: exact-action
  authorityCompilationReceiptRef: providerAuthorityCompilationReceiptRefV1
  terminalSequence: positive-run-sequence
  targetGeneration: positive-generation
  slot: exact-profile-slot
  attemptGeneration: positive-generation
  priorHeadGeneration: nonnegative-generation
  newHeadGeneration: positive-generation
  priorEvidenceId: null-or-exact-id
  terminalResultDigest: sha256-prefixed-digest
  terminalInputDigest: sha256-prefixed-private-journal-digest
  reportedResolvedSetDigest: sha256-prefixed-digest
  acceptedResolvedSetDigest: sha256-prefixed-digest
  findingSetDigest: sha256-prefixed-digest
  newOpenSetDigest: sha256-prefixed-digest
  repairRequiredSetDigest: sha256-prefixed-digest
  readCoverageDigest: sha256-prefixed-digest
  coverageSummaryDigest: sha256-prefixed-digest
  findingWindowDigest: sha256-prefixed-digest
  certificationBasisAtTerminalDigest: sha256-prefixed-digest
  mutationReceiptDigest: sha256-prefixed-canonical-receipt-digest
~~~

The mutation receipt and evidence record equality-copy the action route's
admitted authority-compilation ref. For certifying work its requested and
effective profiles are both `review-readonly`; its native-settings digest
equals the effective-configuration permission digest. The evidence transaction
rejects a crossed, rejected or missing ref and cannot create an evidence row or
advance the head. The receipt contains no live currency, usage, raw answer or
mutable annotation.

`fabric.v1.review-evidence.annotate` is the current chair's optional non-gating
annotation of an already automatic evidence record. Its disposition is exactly
one of `substantiated`, `unsubstantiated`, `duplicate` or
`needs-more-evidence`; no free-form or provider-specific disposition is valid.
The request supplies exact evidence/result/head equality and one bounded inert
note. The daemon appends this separate record and advances one annotation head:

~~~yaml
reviewEvidenceAnnotationV1:
  schemaVersion: 1
  evidenceId: exact-evidence
  annotationRevision: positive-contiguous-revision
  priorAnnotationRevision: null-for-one-otherwise-exact-prior
  commandId: exact-chair-command
  chairBindingGeneration: exact-active-target-binding
  disposition: substantiated-or-unsubstantiated-or-duplicate-or-needs-more-evidence
  note: bounded-inert-utf8-at-most-512-bytes
  noteDigest: sha256-prefixed-digest
  annotationDigest: sha256-prefixed-canonical-record-digest
~~~

Annotation rows are append-only; the head is a compare-and-set pointer, so one
current annotation projection exists per evidence while history remains
immutable. `review-evidence.read/list` returns current `annotation` as a sibling
of immutable `record` and live `currency`. The Console displays its disposition,
note digest/revision and note when safe. Annotation cannot create evidence,
change a head, verdict, findings, repair-required set, reviewer-family relation, currency or
completion. Fabric receipt v2 and `reviewCompletionV1` contain no annotation
field or count. Exact command replay returns its immutable annotation receipt
before any live-chair check; changed replay conflicts.

The original dispatch command receipt never changes: exact dispatch replay
always returns its committed prepared/dispatched receipt. Terminalisation uses
the internal idempotency key action pair/target/slot/attempt-generation and stores a
separate immutable terminal journal plus a canonical terminal-input digest over
the terminal discriminator, private answer/adapter-result digests,
authenticated usage and read-coverage journal digest. An exact duplicate
returns the stored terminal projection. A changed live-callback/lookup input
digest is an integrity conflict: it appends a quarantine record, cannot
overwrite terminal result, evidence, head or settlement, and makes the reducer
emit integrity-failure. provider-action.read exposes the terminal result plus
automatic evidence mutation receipt. Neither that nor annotation
receipt contains currency. review-evidence.read/list return immutable record
plus fresh reviewEvidenceCurrencyV1. No command replay calls that reducer.

Only a succeeded target-preparation Phase B supersedes a target, and it first proves every old-target
attempt terminal and every safe/UNUSABLE terminal already atomically reflected
in its head. It then carries the complete open records forward in the successor
bundle. A source change can never launder a late finding.

An ambiguous certifying action is nonterminal and owns the target/slot attempt,
reservation and head fence. While it remains ambiguous or awaiting-human-
retire, the daemon rejects every new action for that slot, every successor
Phase-B supersession and review/run acceptance or close. Preparation may be
accepted and built, but remains fenced at Committing until recovery terminalises
the action or retirement succeeds. It is therefore an
explicit review-and-liveness recovery gate as well as a budget hold. Only
proved terminal reconciliation or confirmed provider-route-integrity-retire
releases the fence; ordinary retry, Resume, annotation or source change cannot.

#### 32.19.7 Completion reducer and deterministic blockers

fabric.v1.review-completion.read is the sole agent/operator reducer. It reads
the one current target, its resolved profile and the four slot heads, not
unsuperseded timestamps or a latest-row guess. Operator calls require exact
project/session/run read authority. The Console receives the same result
through Evidence/System projection.

The public read/annotation wires are exact closed objects:

~~~yaml
reviewEvidenceReadRequestV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  evidenceId: exact-evidence

reviewEvidenceListRequestV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  targetGeneration: null-or-positive-generation
  slot: null-or-native-or-other-primary-or-cursor-grok-or-agy-gemini
  pageSize: integer-1-through-100
  cursor: null-or-daemon-issued-opaque-cursor-at-most-256-bytes

reviewEvidenceListResultV1:
  schemaVersion: 1
  entries: ordered-reviewEvidenceReadV1-at-most-pageSize
  nextCursor: null-or-daemon-issued-opaque-cursor-at-most-256-bytes

reviewCompletionReadRequestV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run

reviewEvidenceAnnotationAppendRequestV1:
  schemaVersion: 1
  commandId: stable-command-id
  projectSessionId: exact-session
  coordinationRunId: exact-run
  evidenceId: exact-evidence
  expectedResultDigest: sha256-prefixed-digest
  expectedHeadGeneration: nonnegative-generation
  expectedAnnotationRevision: nonnegative-zero-if-none
  disposition: substantiated-or-unsubstantiated-or-duplicate-or-needs-more-evidence
  note: inert-UTF8-at-most-512-bytes

reviewEvidenceAnnotationCurrentReadRequestV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  evidenceId: exact-evidence

reviewEvidenceAnnotationCurrentReadResultV1:
  schemaVersion: 1
  evidenceId: exact-evidence
  annotation: null-or-reviewEvidenceAnnotationV1

reviewFindingPageReadRequestV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  findingSetDigest: exact-authorised-finding-set-digest
  pageDigest: exact-page-digest-listed-by-that-set

reviewFindingPageReadResultV1:
  schemaVersion: 1
  findingSetDigest: exact-request-digest
  pageDigest: exact-request-digest
  members: ordered-nonempty-safeFinding-records
  nextPageDigest: null-or-next-page-digest-in-set-order

reviewReadErrorV1:
  schemaVersion: 1
  code: NOT_FOUND-or-AUTHORITY_DENIED-or-SCOPE_MISMATCH-or-STALE_CURSOR-or-STALE_REVISION-or-INTEGRITY_FAILURE
  currentRevision: null-or-nonnegative-integer
  evidenceDigest: null-or-sha256-prefixed-digest
~~~

`review-evidence.read/list`, `review-finding-page.read`, `review-completion.read`,
`review-evidence.annotate` and `review-evidence-annotation.current.read` accept
only their displayed request, return only their displayed success shape or
`reviewReadErrorV1`, and reject unknown fields. List order is target generation,
slot profile rank, new-head generation and evidence ID. Cursors bind the exact
scope/filter/watermark and never carry authority. Annotation append returns the
immutable `reviewEvidenceAnnotationV1`; exact command replay precedes live CAS.
The finding-page read requires its set to be reachable from authorised evidence,
completion or receipt state and the page to occur in that set's ordered vector.
Its members hash to `pageDigest`; `nextPageDigest` is the next vector member or
null. Missing/cross-set/orphan/digest-mismatch reads return no partial members.

The result names target/chair/bundle/coverage/profile digests and one row per
slot. A slot is clean only when its head names one current terminal safe
certifying CLEAN evidence record, its complete open-finding set is empty and
every profile requirement matches. A proved provider terminal failure is
noncertifying and yields provider-terminal-failure; it is never ambiguous.

review-evidence.read/list return this closed shape (list repeats entries under
one page envelope); completion returns the same immutable identities rather
than a lossy Console-only model. `record` is byte-shape-identical to receipt
`$defs.reviewEvidenceRecord`, every finding is receipt `$defs.safeFinding`,
`coverageSummary` is receipt `$defs.coverageSummary`, and
`reviewCompletionV1` is byte-shape-identical to receipt
`$defs.reviewCompletion`; implementation defines each once and reuses it:

~~~yaml
reviewEvidenceReadV1:
  schemaVersion: 1
  record: receipt.$defs.reviewEvidenceRecord
  currency:
    target: current-or-stale-or-superseded
    source: current-or-stale
    chair: current-or-stale
    profile: current-or-stale
    currentCertificationBasis: null-or-reviewCertificationBasis
    certifying: true-or-false
    blockerCodes: ordered-closed-codes
  annotation: null-or-current-reviewEvidenceAnnotationV1

reviewCompletionV1:
  schemaVersion: 1
  blockers: ordered-unique-target-wide-blocker-codes
  targetGeneration: null-or-positive-generation
  targetChair: null-or-exact-target-chair-snapshot
  reviewedArtifactRef: null-or-exact-artifact-revision
  publicationLineageDigest: null-or-sha256-prefixed-digest
  bundleDigest: null-or-sha256-prefixed-digest
  manifestRootDigest: null-or-sha256-prefixed-digest
  coverageDigest: null-or-sha256-prefixed-digest
  riskReadMapDigest: null-or-sha256-prefixed-digest
  mandatoryReadSetDigest: null-or-sha256-prefixed-digest
  profileDigest: null-or-sha256-prefixed-digest
  unavailableSlots: ordered-certifyingSlotUnavailable-records
  slots:
    oneOf:
      - empty
      - exactlyFour:
          - slot: exact-profile-slot
            headGeneration: nonnegative-generation
            attemptGeneration: nonnegative-generation
            actionRef: null-or-ProviderActionRefV1
            authorityCompilationReceiptRef: null-or-providerAuthorityCompilationReceiptRefV1
            evidenceId: null-or-exact-evidence
            terminalKind: null-or-safe-answer-or-unusable-answer-or-provider-terminal-failure-or-terminal-no-effect-or-integrity-terminal-or-retired-unknown
            verdict: null-or-CLEAN-or-FINDINGS-or-UNUSABLE
            resultDigest: null-or-sha256-prefixed-digest
            providerFailureCode: null-or-max-turns-exhausted-or-provider-rejected-or-terminal-no-answer-or-adapter-terminal-failure
            providerFailureDigest: null-or-sha256-prefixed-digest
            routeReceiptDigest: null-or-sha256-prefixed-digest
            adapterId: exact-resolved-adapter
            endpointProvider: exact-required-provider
            providerFamily: exact-resolved-family
            model: exact-resolved-model
            routeObservationDigest: null-or-sha256-prefixed-digest
            actualRouteIdentityDigest: null-or-sha256-prefixed-digest
            readCoverageDigest: null-or-sha256-prefixed-digest
            reviewerFamilyRelation: same-family-exempt-or-distinct-family-proved-or-same-family-forbidden-or-family-unproved
            currentCertificationBasis: null-or-reviewCertificationBasis
            certifying: true-or-false
            openFindingSet: findingSetRef
            blockers: ordered-slotReviewBlockerEnum
  finalReviewComplete: true-or-false
~~~

The operator Evidence row/detail projection is also closed; it does not require
the Console to join private tables:

~~~yaml
operatorReviewEvidenceRowV1:
  schemaVersion: 1
  oneOf:
    - rowKind: evidence
      required: [rowKind, evidence, targetChair, reviewedArtifactRef,
        publicationLineageDigest, headGeneration, p0Count, p1Count, p2Count,
        openFindingCount]
      evidence: reviewEvidenceReadV1
    - rowKind: terminal-action
      required: [rowKind, terminal, targetGeneration, targetChair,
        reviewedArtifactRef, publicationLineageDigest, slot, headGeneration,
        attemptGeneration, taskId, openFindingSet]
      terminal: providerActionTerminalProjectionV1
    - rowKind: recovery-action
      required: [rowKind, recovery, targetChair, reviewedArtifactRef,
        publicationLineageDigest, openFindingSet]
      recovery: providerRouteIntegrityRecoveryProjectionV1
  sharedCounts: p0Count/p1Count/p2Count/openFindingCount-are-nonnegative
~~~

An evidence row nests the exact evidence read and its current annotation. A
terminal-action row exists only for a terminal kind that creates no review
evidence and carries the unchanged head/open set. A recovery-action row nests
the live recovery projection, including current CAS generation/state and
retirement eligibility; it is the only row from which the Console may prepare
retirement. Counts derive from the nested finding sets. Every arm rejects fields
owned by another arm and equality-joins action/result/task/prompt, target,
route, profile and reviewer-family identities. Raw answer, prompt, diagnostics
and usage remain absent.

Top-level and slot blocker domains are disjoint. Top-level precedence is
exactly: `certifying-review-capability-unavailable`,
`finding-capacity-exhausted`, `missing-target`, `stale-target`,
`profile-unavailable`, `integrity-failure`. Slot precedence is exactly:
`missing-evidence`, `nonterminal-action`, `ambiguous-action`,
`provider-terminal-failure`, `terminal-no-effect`, `retired-unknown`,
`route-integrity`, `insufficient-read-coverage`, `noncertifying`,
`authority-compilation-missing`, `authority-compilation-drift`,
`actual-route-mismatch`, `actual-route-unproved`, `unusable`,
`wrong-artifact`, `wrong-bundle`, `wrong-route`, `wrong-provider`,
`wrong-model`, `wrong-chair-generation`, `reviewer-family-distinctness`,
`open-findings`. A code cannot appear in both places. `superseded` is only a
historical `reviewEvidenceCurrencyV1.target` value and is not a completion
blocker.

Capability and finding-capacity checks run first and return their typed branch
even before target creation. Otherwise zero current targets returns exactly
missing-target. Multiple/no trustworthy targets returns the target-null
integrity arm. One trustworthy immutable target with a missing/broken binding,
profile/head cardinality, CAS chain or contradictory immutable join returns the
target-present structural-integrity arm: target immutable fields remain exact,
targetChair/profile are null and slots is empty. A merely unavailable profile
uses its dedicated target-present arm. With a structurally valid target/profile,
slots contains exactly four rows; stale-target is top-level only.

`actual-route-mismatch` takes precedence over `actual-route-unproved` when any
observed route field is unequal; otherwise incomplete required identity proof emits
only `actual-route-unproved`. `open-findings` is emitted iff the slot head's complete paged open set is
nonempty. A provider failure row uses `provider-terminal-failure` and unchanged
head/open/repair sets; it never masquerades as missing evidence. The generated
completion reducer emits `authority-compilation-missing` when the action,
evidence or completion slot lacks its exact admitted ref, and
`authority-compilation-drift` for any crossed receipt, non-read-only profile,
settings/configuration inequality or dispatch/evidence mismatch. Either is
noncertifying and accepts no resolution.
The generated
reducer truth-table fixture enumerates every top arm and every slot cause,
proves domain disjointness/precedence and rejects duplicates or impossible
cross-arm fields. `finalReviewComplete` is true only when top blockers are
empty, the current trustworthy target/profile and four slots exist, every slot
blocker array is empty, every slot carries one equality-matched admitted
`review-readonly` compilation ref, and finding capacity admits a normal action.

The operator Evidence row/detail and fabric-receipt.json expose exact safe
records, slot heads, route, target, chair, bundle/coverage/profile and recovery
digests. Raw answer, provider error, private diagnostics, bundle objects/chunks,
prompt content, secret-set HMAC, adapter result and usage are absent. Current
annotations are available only through live Evidence read/projection and remain
absent from review completion and fabric-receipt.json.

#### 32.19.8 Certifying-action and route-integrity recovery owner

ProviderRouteIntegrityRecoveryService is the only startup and ambiguity owner
of every certifying action, including an otherwise intact dispatched action
whose provider effect is unknown and an action whose route, target, bundle,
prompt, profile or lineage join is missing or contradictory. Every certifying
route/action is excluded from generic provider-action recovery and prepared-
action re-enqueue. Its daemon-internal operation
fabric.internal.provider-route-integrity.reconcile runs under the current
daemon recovery generation; no agent/operator/chair may invoke it or repair a
route.

Its durable state machine is:

~~~text
detected -> inspecting
  -> terminal-proved-no-effect
  -> terminal-proved-usage
  -> awaiting-human-retire -> terminal-retired-unknown
~~~

The live scoped read surface is closed:

~~~yaml
providerRouteIntegrityRecoveryReadRequestV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  actionRef: ProviderActionRefV1

providerRouteIntegrityRecoveryProjectionV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  taskId: exact-task
  actionRef: ProviderActionRefV1
  targetGeneration: positive-generation
  slot: native-or-other-primary-or-cursor-grok-or-agy-gemini
  attemptGeneration: positive-generation
  recoveryGeneration: positive-generation
  state: detected-or-inspecting-or-terminal-proved-no-effect-or-terminal-proved-usage-or-awaiting-human-retire-or-terminal-retired-unknown
  reason: intact-effect-ambiguity-or-route-row-missing-or-route-row-conflict-or-route-receipt-mismatch-or-target-binding-invalid-or-bundle-binding-invalid-or-prompt-binding-invalid-or-profile-binding-invalid-or-lineage-binding-invalid
  reservationDigest: sha256-prefixed-digest
  routeState: present-or-missing-or-integrity-failed
  routeReceiptDigest: null-or-sha256-prefixed-digest
  lookupState: not-attempted-or-in-flight-or-completed
  lookupEvidenceDigest: null-or-sha256-prefixed-digest
  disposition: null-or-proved-no-effect-release-or-exact-usage-settled-or-conservative-full-ceiling-settled-or-full-ceiling-retired
  settlementDigest: null-or-sha256-prefixed-digest
  recoveryEvidenceDigest: sha256-prefixed-digest
  retirementEligible: true-or-false
~~~

`fabric.v1.provider-route-integrity-recovery.read` accepts exactly the request
above and returns exactly the current projection. Errors are
`NOT_FOUND|AUTHORITY_DENIED|SCOPE_MISMATCH|INTEGRITY_FAILURE`; they carry only
`{schemaVersion:1,code,evidenceDigest:null-or-digest}`. Retirement eligibility
is true iff state is `awaiting-human-retire` and the reservation/action joins
are intact. This live projection, not the receipt recovery array, supplies CAS
authority. Receipt recovery rows are immutable audit snapshots and are
explicitly forbidden as Preview/Commit inputs.

The row records a closed reason: intact-effect-ambiguity or one exact broken-
binding reason. Detection fences further provider I/O, marks the action
noncertifying while unresolved and freezes only its reservation dimensions. If
durable preparation and the dispatch journal prove dispatch never began,
recovery terminalises no-effect, returns its full capacity and writes reservation
state `settled`. A dispatched or
accepted action receives at most one bounded pair-keyed lookup when its adapter
contract can identify it. An exact safe/unusable/failure terminal result flows
through the ordinary action-bound terminaliser and its canonical terminal-input
digest; complete authenticated usage settles exactly and absent/partial usage
charges the remaining spendable reservation. An authenticated closed no-effect
lookup also returns full capacity under `settled`. The disposition name
`proved-no-effect-release` describes capacity accounting, not the reservation
row state: `released` is pre-admission-only with null attempt and every attached
terminal has immutable positive attempt plus state `settled`. A terminal effect with an unverifiable
binding becomes integrity-terminal and conservatively settles. Absent, timed-
out, malformed, conflicting or permanently unavailable lookup never proves no
effect and enters awaiting-human-retire with the reservation retained.

The only retirement path is a typed provider-route-integrity-retire intent
through fabric.v1.operator-action.preview/commit. It requires an operator with
external-effect authority, the exact action/recovery generation and reservation
digest, a persisted consequential gate and independently attested direct-human
confirmation. Confirmed Commit performs no provider call. It consumes the full
remaining spendable reservation, releases only terminal concurrency capacity,
records terminal-retired-unknown and terminalises the action noncertifying.
This cannot overbook, fabricate outcome or leave an unresolvable route freeze.

Preview and Commit equality-bind the live
`(actionRef,recoveryGeneration,state=awaiting-human-retire,reservationDigest)`.
Any changed value rejects. The Console may offer retirement only from a live
`recovery-action` row with `retirementEligible:true`.

Every terminal branch commits action, reservation, authority-unknown flags,
recovery evidence digest and run recovery-state exit in one transaction.
Dimensions unfreeze when no other unknown owner remains. Recovery never
reconstructs a route/bundle/prompt, dispatches or redispatches the provider, or
converts a no-effect/integrity/retired action into review evidence. A valid
answer is evidence only through the ordinary automatic terminal transaction.
Store/catalogue corruption that
prevents identifying the reservation follows the existing store-corruption
stop; it is not silently represented as a route freeze.

#### 32.19.9 Requirements and acceptance

- **FR-053:** Certifying review shall bind a daemon-generated complete
  review-bundle, coverage digest, current target/chair/profile snapshot and
  action-pair-only content-addressed portal before provider I/O.
- **FR-054:** New certifying dispatch and optional evidence annotation shall
  require the current target chair, while the action-bound safe/UNUSABLE
  terminal transaction shall always settle, create evidence and advance its
  reserved head despite later currency drift; exact immutable replay precedes
  live fences.
- **FR-055:** Publication lineage shall bind the authenticated publishing
  principal generation to one exact active bridge/provider custody/route at
  publication; unproved or non-seal root artifacts shall remain ineligible.
- **FR-056:** One checked-in four-slot profile and one linear per-target/slot
  head shall own provider requirements, reviewer-family relation, evidence order
  and open findings.
- **FR-057:** Raw review answers and terminal provider diagnostics shall remain
  private; safe results, proved failures and digests alone are public.
- **FR-058:** Route resolution shall remain structural, bounded and
  side-effect-free; durable replay and stable-key single-flight shall precede
  router execution.
- **FR-059:** One recovery service shall own every certifying action before
  generic recovery and close intact ambiguity or route-integrity budget custody
  by proved release, exact-or-conservative proved-effect settlement, or exact
  direct-human full-ceiling retirement without route reconstruction or provider
  replay.
- **FR-060:** Mutation receipts shall remain immutable; live review currency
  shall appear only on read/list/projection results.
- **FR-062:** Review-target preparation shall return one immutable bounded
  accepted receipt, continue through the durable preparation state machine and
  commit or conflict exactly one reserved target generation under crash-safe
  recovery.
- **FR-063:** A proved same-agent lifecycle adoption shall advance one
  append-only target-chair binding without changing the review subject, heads,
  evidence or findings; late old-binding output shall remain adverse but
  noncertifying.
- **FR-064:** Portal-helper transport shall use the pinned Rust supervisor,
  non-secret Unix-socket locators, authenticated peer/process identity and one
  TypeScript semantic/ledger owner; no provider inherited descriptor or bearer
  handoff shall exist.
- **FR-065:** Every provider action reference, pre-router flight, durable
  preflight, adapter/recovery journal, receipt, sort, join and Console row shall
  use the daemon-global `(adapterId, actionId)` pair.
- **FR-066:** Review annotations shall use the exact four-value vocabulary in a
  separate append-only relation and live projection, with zero effect on
  receipts or completion.
- **FR-067:** Completion shall expose unavailable certifying slots and the
  target-wide capability blocker even before a target exists.
- **FR-069:** Receipt v2 shall represent evidence and terminal-failure review
  records separately, keep provider route/substitution history append-only and
  validate every current wire without an external resolver or legacy alias.
- **FR-070:** Review-bundle coverage, requirement/evidence/source/mandatory
  digests and every array order shall have one exact JCS preimage and golden
  permutation fixtures.
- **FR-071:** Finding custody shall be paged/content-addressed without
  truncation; normal actions shall reserve worst-case capacity before router I/O
  and bounded resolution-only recovery shall never certify completion.
- **FR-072:** True-chair lifecycle adoption shall capture one immutable
  terminal-sequence certification cut and perform automatic same-subject
  rebind-or-stale without waiting on review actions; the exact public rebind
  operation shall execute or replay the same deterministic transition and
  immutable receipt without accepting caller-authored subject claims.
- **FR-073:** Completion shall use disjoint target/slot blocker domains and
  expose a target-present structural-integrity arm.
- **FR-074:** Live route-recovery projection alone shall supply retirement CAS
  authority; receipt recovery remains audit-only.

Acceptance additionally requires:

- **AC-043:** bundle fixtures prove complete changed-file and required-evidence
  derivation through the exact review-diff.v1 status/mode/binary/rename/path/
  ordering/digest rules, immutable full-ID conformance manifest, exact base/
  head/clean-state binding, all object/chunk/coverage digests, size/count
  limits, portal isolation and source/delivery/chair/profile supersession. The
  final run-start-to-sealed-HEAD oracle recomputes its own counts/bytes and a
  64-MiB+1 closure fails. Omissions, truncation, mutable Git diff configuration,
  bundle chaining and stale summaries cannot certify. Golden preimage,
  ordering/permutation and copied-digest fixtures cover requirement, evidence,
  source, coverage and mandatory-set domains plus paged finding roots/pages.
- **AC-044:** profile fixtures prove exact Codex/Claude primary mapping,
  cursor-agent/xAI and agy/Google routes, native same-family exemption,
  publisher eligibility, exact reviewer-family relation, tagged applied versus
  inapplicable effort, full availability identity, same-agent binding
  continuity and target reprepare after every unrebindable change.
- **AC-045:** router fixtures prove structural codec purity, post-router
  transactional effort/currency/adapter/model checks, five-second process-tree
  cancellation, global pair-keyed exact single-flight, requested/resolved
  adapter equality, cross-run pair conflict before a second router, legal same
  action ID on different adapters and durable replay without router execution.
- **AC-046:** adapter fixtures bind certifying-review-packet-only.v1 to each
  contract digest and prove no mutable cwd, inherited HOME/environment,
  workspace/source/shell/browser/network tool or cross-bundle portal read for
  Claude, Codex, Cursor and Agy. Direct Claude/Codex routes prove equal schema,
  ledger and denial canaries. Cursor/Agy remain capability=false until their
  pinned supervisor/helper/broker, peer identity, exact two-tool allowlist,
  outer sandbox, exact portal discovery, pre-artifact intent and pre-exec child-
  registration/ACK crash matrix, cross-language three-frame/digest goldens,
  partial/trailing/duplicate/cross-action/cross-contract/cross-intent/replay/old-
  revision and swapped executable/argv/environment/cwd/capsule/stdio/FD no-exec
  negatives, supervisor-FD-3 isolation, stub-FD-4–FD-7 closure, wrong/relayed accepted-FD
  rejection, daemon/supervisor crash recovery, singleton-link canonical-to-
  trusted-claim rename/retry/substitution races and
  TERM/250-ms/KILL/setsid/setpgid-group-split/double-fork/reparent canaries pass on the activated
  build.
- **AC-047:** terminal fixtures distinguish safe CLEAN/FINDINGS, UNUSABLE,
  proved max-turn/provider/no-answer failure and effect ambiguity; settle exact
  authenticated usage or conservatively charge every proved-effect terminal,
  release proved no-effect, retain true ambiguity, expose only closed
  digests/blockers and never redispatch. Insufficient CLEAN becomes UNUSABLE;
  insufficient FINDINGS remains visible/noncertifying with zero accepted
  resolutions. A stale in-flight answer still settles and advances its reserved
  head with zero accepted resolutions and all safe new findings carried. Six
  terminal-result golden vectors bind action pair, stable terminal sequence and
  exact arm fields. Provider failure exports an unchanged-head receipt record
  with no evidence/new-head fields.
- **AC-048:** head-CAS fixtures cover first and second FINDINGS, UNUSABLE,
  concurrent forks, paged carry-forward repair findings, source/evidence/mixed
  repair currency, repaired-target CLEAN and
  exact replay, including identical versus conflicting terminal-input digests.
  Reducer fixtures prove the disjoint blocker truth table, capacity exhaustion,
  zero-I/O admission refusal and noncertifying resolution-only recovery.
- **AC-049:** recovery fixtures cover every unresolved action state, optional
  pair lookup, proved zero-effect release, exact-or-conservative terminal
  settlement and direct-human full-reservation retirement with no permanent
  freeze, route reconstruction or provider dispatch. They prove all certifying
  actions are excluded from generic recovery. Wrong authority/gate/generation
  and unconfirmed retirement change nothing; awaiting-human-retire blocks
  target Phase B and run acceptance until that exact gate closes. Operator
  retirement fixtures obtain pair/generation/state/reservation only from the
  live recovery projection and reject receipt snapshots.
- **AC-050:** agent action/read/evidence/completion and operator Evidence/System
  projections enforce exact scope, immutable-receipt versus live-currency
  separation, exact evidence/list/annotation/completion/profile/portal wires,
  append-only provider events and the standalone receipt-v2 local definitions, sort/equality/
  history/count/JCS-hash invariants. The current baseline contains no
  model_routing_receipts, cross_family_reviews, modelRoutingReceipts,
  crossFamilyReviews, recordModelRoutingEvidence or
  recordCrossFamilyReviewEvidence or fabric.v1.review-evidence.record table,
  field or API.
- **AC-052:** preparation fixtures prove DB-only acceptance within the public
  deadline, exact replay/join versus changed-input conflict, one active row,
  never-reused high-water generations, every state edge, exact conflict/failure
  terminal union, phase-only or monotonic verified-item progress, build/
  fsync/Phase-B crash recovery, same-generation reclaim, CAS-byte retention and
  either one complete target or one terminal conflict with no duplicate.
  Rotation racing build commits only against the adopted current same-agent
  binding or conflicts.
- **AC-053:** binding fixtures preserve already-current evidence across an
  adopted same-agent rotation, assign stable terminal sequences, capture the
  exact predecessor certification cut and terminalise old prepared work no-
  effect without blocking lifecycle. Effectful/ambiguous work recovers normally;
  post-cut output remains adverse/noncertifying and every crossed agent/profile/
  source chain yields stale target rather than failed adoption. Public rebind
  fixtures cover exact execution/already-applied replay, changed replay,
  pointer/head races, non-adopted custody, crossed identity/subject fields,
  multiple contiguous rotations and zero router/provider/portal I/O. Completion
  fixtures expose exact unavailable slots before target creation. Annotation
  fixtures enforce the four values, append-only current projection and absence
  from completion/receipt. Standalone receipt validation uses no resolver and
  rejects every future objective/provider/operation code. Cut/basis fixtures
  equality-bind the exact agent/custody/revision ref and reject crossed custody.
