
## 19. Observability and operator control

The fabric exports `<run-dir>/fabric-receipt.json` as generated coordination
evidence. It does not own human acceptance, delivery completion or the final
gate. The chair-owned `.agent-run/<run-id>/RUN.json`, using `contract:
delivery-run` and `schema_version: 1`, remains authoritative. It declares the
fabric receipt as an evidence artifact with a workspace-relative path and
SHA-256 digest; no second run-receipt shape is adopted. Fabric receipt schema
version 2 is the only current codec. No v1 decoder/import/projection exists;
non-current files are preserved but rejected as protocol evidence.

`schemas/fabric-receipt.v2.schema.json` is the normative standalone Draft
2020-12 schema. Every object has `additionalProperties: false`; every property
shown below is required unless its value explicitly admits null; every reference
is local `#/$defs/...`. The runtime shall delete the v1 decoder/import/
projection and fixtures rather than accepting either shape.

The root required properties are exactly:

~~~yaml
$schema: https://json-schema.org/draft/2020-12/schema
type: object
additionalProperties: false
required: [schemaVersion, runId, chair, taskOwners, agents, executionProfile,
  directInputProvenance, reviewCompletion, providerRoutes, providerReviews,
  findingPages,
  routeIntegrityRecoveries, taskAndWriteLeases, messageAndDeliveryCounts,
  objectiveChecks, providerFailuresAndSubstitutions, operatorInterventions,
  compactionsAndRotations, eventWatermark, counts, stateHash]
properties:
  schemaVersion: {const: 2}
  runId: {$ref: '#/$defs/id'}
  chair: {$ref: '#/$defs/chair'}
  taskOwners: {$ref: '#/$defs/taskOwners'}
  agents: {$ref: '#/$defs/agents'}
  executionProfile: {$ref: '#/$defs/executionProfile'}
  directInputProvenance: {$ref: '#/$defs/directInput'}
  reviewCompletion: {$ref: '#/$defs/reviewCompletion'}
  providerRoutes: {$ref: '#/$defs/providerRoutes'}
  providerReviews: {$ref: '#/$defs/providerReviews'}
  findingPages: {$ref: '#/$defs/findingPages'}
  routeIntegrityRecoveries: {$ref: '#/$defs/recoveries'}
  taskAndWriteLeases: {$ref: '#/$defs/leases'}
  messageAndDeliveryCounts: {$ref: '#/$defs/messageCounts'}
  objectiveChecks: {$ref: '#/$defs/objectiveChecks'}
  providerFailuresAndSubstitutions: {$ref: '#/$defs/providerFailures'}
  operatorInterventions: {$ref: '#/$defs/interventions'}
  compactionsAndRotations: {$ref: '#/$defs/lifecycleRows'}
  eventWatermark: {$ref: '#/$defs/nonnegative'}
  counts: {$ref: '#/$defs/counts'}
  stateHash: {$ref: '#/$defs/digest'}
~~~

Common local scalars are `id` (`type:string`, `minLength:1`,
`maxLength:256`), `nonnegative` (`type:integer`, minimum 0), `positive`
(`type:integer`, minimum 1), `boolean`, `digest` (`type:string`, lowercase
pattern `^sha256:[0-9a-f]{64}$`), `nullableDigest` (`digest|null`) and
`timestamp` (RFC 3339 `date-time`). JSON Schema length counts Unicode code
points, not UTF-8 bytes. After schema validation and before projection/hash,
the runtime therefore performs a mandatory UTF-8 byte validator: every `id` is
1..256 bytes, finding ID 1..64, safe summary 1..256 and safe evidence 1..768.
No schema-valid value bypasses that validator. Closed object definitions have
these exact property sets, scalar mappings and null rules. The following is
binding schema shorthand, not a claim that keys such as `nullOnly` are JSON
Schema vocabulary; the checked-in schema must expand every line into standard
`properties`, `required`, `enum`, `oneOf` and conditional constraints:

~~~yaml
topReviewBlockerEnum: [certifying-review-capability-unavailable,
  finding-capacity-exhausted, missing-target, stale-target,
  profile-unavailable, integrity-failure]
slotReviewBlockerEnum: [missing-evidence, nonterminal-action,
  ambiguous-action, provider-terminal-failure, terminal-no-effect,
  retired-unknown, route-integrity, insufficient-read-coverage,
  noncertifying, actual-route-mismatch, actual-route-unproved,
  unusable, wrong-artifact, wrong-bundle, wrong-route,
  wrong-provider, wrong-model, wrong-chair-generation,
  reviewer-family-distinctness, open-findings]
reviewCurrencyBlockerEnum: [certifying-review-capability-unavailable,
  finding-capacity-exhausted, missing-target, stale-target,
  profile-unavailable, integrity-failure, missing-evidence,
  nonterminal-action, ambiguous-action, provider-terminal-failure,
  terminal-no-effect, retired-unknown, route-integrity,
  insufficient-read-coverage, noncertifying, actual-route-mismatch,
  actual-route-unproved, unusable, superseded,
  wrong-artifact, wrong-bundle, wrong-route, wrong-provider, wrong-model,
  wrong-chair-generation, reviewer-family-distinctness, open-findings]
providerTerminalFailureEnum: [max-turns-exhausted, provider-rejected,
  terminal-no-answer, adapter-terminal-failure]
reviewerFamilyRelationEnum: [same-family-exempt, distinct-family-proved,
  same-family-forbidden, family-unproved]

objectiveCheckKindEnum: [test, evaluation, load, migration,
  generated-contract]
providerFailureOrSubstitutionEnum: [adapter-unavailable,
  adapter-contract-mismatch, provider-unavailable, provider-timeout,
  provider-rejected, provider-response-invalid, route-rejected,
  model-unavailable, capability-unavailable, quota-exhausted,
  substitution-applied, optional-leg-degraded]
operatorInterventionOperationEnum: [pause, resume, steer, cancel, drain, stop,
  launch, takeover, git, git-authorise, git-custody-resolve,
  agent-lifecycle-recovery-issue, external-effect]
ProviderActionRefV1:
  required: [adapterId, actionId]
  ids: [adapterId, actionId]

resolvedEffortV1:
  oneOf:
    - kind: applied
      required: [kind, value]
      valueType: id
    - kind: inapplicable
      required: [kind]

chair:
  required: [agentId, principalGeneration, chairLeaseGeneration,
    providerSessionGeneration, bridgeGeneration, adapterId,
    adapterContractDigest, modelFamily, model, routeReceiptDigest]
  nullOnly: [routeReceiptDigest]
  ids: [agentId, adapterId, modelFamily, model]
  positive: [principalGeneration, chairLeaseGeneration,
    providerSessionGeneration, bridgeGeneration]
  digests: [adapterContractDigest]
  nullableDigests: [routeReceiptDigest]

taskOwner:
  required: [taskId, taskRevision, taskState, ownerAgentId, ownerLeaseId,
    ownerLeaseGeneration, ownerLeaseState, membershipRevision]
  taskStateEnum: [blocked, ready, active, complete, cancelled, degraded]
  ownerLeaseStateEnum: [active, frozen, released, revoked, abandoned]
  ids: [taskId, ownerAgentId, ownerLeaseId]
  positive: [taskRevision, ownerLeaseGeneration, membershipRevision]

agent:
  required: [agentId, role, lifecycle, contextState, principalGeneration,
    providerSessionGeneration, bridgeGeneration, currentTaskId,
    checkpointDigest, membershipRevision, membershipState]
  nullOnly: [currentTaskId, checkpointDigest]
  lifecycleEnum: [starting, ready, busy, checkpointing, idle, suspended, archived]
  contextStateEnum: [current, context-unreconciled]
  roleEnum: [chair, leader, worker, reviewer]
  membershipStateEnum: [active, released, abandoned]
  ids: [agentId, currentTaskId]
  positive: [principalGeneration, providerSessionGeneration, bridgeGeneration,
    membershipRevision]
  nullableDigests: [checkpointDigest]

executionProfile:
  required: [profileId, profileSchemaDigest, resolvedProfileDigest,
    authorityDigest, budgetDigest]
  ids: [profileId]
  digests: [profileSchemaDigest, resolvedProfileDigest, authorityDigest,
    budgetDigest]

directInput:
  required: [state, attestations]
  stateEnum: [complete, partial, unavailable]
  attestationRequired: [attestationId, providerMessageId, operatorId,
    provenanceDigest, evidenceDigest]
  attestationIds: [attestationId, providerMessageId, operatorId]
  attestationDigests: [provenanceDigest, evidenceDigest]

targetChair:
  required: [agentId, bindingGeneration, principalGeneration,
    chairLeaseGeneration, providerSessionGeneration, bridgeGeneration,
    adapterId, adapterContractDigest, modelFamily, model, routeReceiptDigest]
  ids: [agentId, adapterId, modelFamily, model]
  positive: [bindingGeneration, principalGeneration, chairLeaseGeneration,
    providerSessionGeneration, bridgeGeneration]
  digests: [adapterContractDigest]
  nullableDigests: [routeReceiptDigest]

localProviderRoute:
  required: [schemaVersion, routeRequestDigest, routeReceiptDigest,
    authorityCompilationReceiptRef, adapterId, adapterContractDigest,
    providerFamily, resolvedModel, requestedEffort,
    resolvedEffort, targetGeneration, slot, reviewedArtifactRef,
    publicationLineageDigest, bundleDigest, manifestRootDigest,
    coverageDigest, bundleSearchIndexDigest, riskReadMapDigest,
    mandatoryReadSetDigest, finalPromptDigest, targetChair,
    profileDigest, slotHeadGeneration, attemptGeneration]
  schemaVersion: {const: 1}
  nullTogetherForNonReview: [targetGeneration, slot, reviewedArtifactRef,
    publicationLineageDigest, bundleDigest, manifestRootDigest,
    coverageDigest, bundleSearchIndexDigest, riskReadMapDigest,
    mandatoryReadSetDigest, finalPromptDigest, targetChair, profileDigest,
    slotHeadGeneration, attemptGeneration]
  authorityCompilationReceiptRef: providerAuthorityCompilationReceiptRefV1
  targetChairType: targetChair-or-null
  requestedEffortType: id-or-null
  resolvedEffort: resolvedEffortV1
  conditional: resolvedEffort.inapplicable requires requestedEffort null;
    resolvedEffort.applied admits requestedEffort null only as configured-default
  ids: [adapterId, providerFamily, resolvedModel]
  nullableIds: [reviewedArtifactRef]
  digests: [routeRequestDigest, routeReceiptDigest, adapterContractDigest]
  nullableDigests: [publicationLineageDigest, bundleDigest,
    manifestRootDigest, coverageDigest, bundleSearchIndexDigest,
    riskReadMapDigest, mandatoryReadSetDigest, finalPromptDigest,
    profileDigest]
  nullablePositive: [targetGeneration, attemptGeneration]
  nullableNonnegative: [slotHeadGeneration]
  slotEnum: [native, other-primary, cursor-grok, agy-gemini, null]

providerRoute:
  required: [actionRef, taskId, route, admission, capabilitySummary,
    latestDispatch, observation]
  actionRef: ProviderActionRefV1
  route: localProviderRoute
  admission: deployedRouteAdmissionV1
  capabilitySummary: capabilitySnapshotSummaryV1
  latestDispatch: deployedRouteDispatchV1-or-null
  observation: deployedRouteObservationV1-or-null
  ids: [taskId]
  invariant: actionRef equals admission.actionRef;
    actionRef.adapterId equals route.adapterId;
    admission.routeRequestDigest equals route.routeRequestDigest;
    admission.routeReceiptDigest equals route.routeReceiptDigest;
    admission.authorityCompilationReceiptRef deep-equals
      route.authorityCompilationReceiptRef;
    admission.requested.rawProviderEffort equals route.requestedEffort;
    admission.admitted.adapterId equals route.adapterId;
    admission.admitted.adapterContractDigest equals route.adapterContractDigest;
    admission.admitted.family equals route.providerFamily;
    admission.admitted.model equals route.resolvedModel;
    admission.admitted.resolvedEffort deep-equals route.resolvedEffort;
    capabilitySummary.admission snapshot identity/body equal admission;
    capabilitySummary.dispatch and latestDispatch are both null or equality-copy
      the same dispatch snapshot ref/source/clocks/body;
    nonnull latestDispatch actionRef/admissionDigest/effectiveConfigurationRef
      and authorityCompilationReceiptRef equal admission;
    nonnull observation actionRef/admissionDigest equal admission

The receipt's `deployedRouteAdmissionV1`, `capabilitySnapshotSummaryV1`,
`deployedRouteDispatchV1`, `deployedRouteObservationV1`,
`discoverySurfaceRefV1`, `adapterEffectiveConfigurationRefV1`,
`providerAuthorityCompilationReceiptRefV1` and typed
`observedValueV1` names above are local `$defs`. Their byte shapes are generated
once from the same protocol definitions used by public reads and are embedded
inside the standalone receipt schema. They are not external references and
need no runtime resolver or registry.

safeFinding:
  required: [findingDigest, findingId, severity, summary, evidence,
    originTargetGeneration, originActionRef, originResultDigest,
    originDeliveryManifestRef, originDeliveryReviewBasisDigest,
    originBundleDigest, repairCurrency]
  severityEnum: [P0, P1, P2]
  findingDigestType: digest
  findingIdType: byte-validated-finding-id
  summaryType: byte-validated-safe-summary
  evidenceType: byte-validated-safe-evidence
  positive: [originTargetGeneration]
  ids: [originDeliveryManifestRef]
  digests: [originResultDigest, originDeliveryReviewBasisDigest,
    originBundleDigest]
  originActionRef:
    required: [adapterId, actionId]
    ids: [adapterId, actionId]
  repairCurrency:
    required: [kind, originRepositorySourceStateDigest, evidenceRefs]
    kindEnum: [repository-source, registered-evidence, mixed]
    nullableDigests: [originRepositorySourceStateDigest]
    evidenceRefItemsRequired: [evidenceRef, evidenceRevision, contentDigest]
    evidenceRefItemIds: [evidenceRef]
    evidenceRefItemPositive: [evidenceRevision]
    evidenceRefItemDigests: [contentDigest]
    evidenceRefOrdering: evidenceRef-UTF8-then-evidenceRevision
    conditional: repository-source requires nonnull source digest and empty
      evidenceRefs; registered-evidence requires null source digest and nonempty
      evidenceRefs; mixed requires nonnull source digest and nonempty evidenceRefs

coverageSummary:
  required: [mode, mandatoryComplete, groups, byteComplete]
  mode: {const: manifest-complete-risk-directed}
  mandatoryCompleteType: boolean
  byteCompleteType: boolean
  groups:
    itemsRequired: [groupId, totalCount, readCount, unreadCount,
      unreadObjectSetDigest]
    itemIds: [groupId]
    groupIdEnum: [security-auth, protocol-schema, persistence-migration,
      provider-adapter, console-ui, tests-evaluations, documentation,
      generated-other]
    itemNonnegative: [totalCount, readCount, unreadCount]
    itemDigests: [unreadObjectSetDigest]
    itemInvariant: totalCount-equals-readCount-plus-unreadCount
    ordering: strictly-ascending-unique-by-groupId

findingSetRef:
  required: [findingSetDigest, findingCount, pageDigests]
  digests: [findingSetDigest]
  nonnegative: [findingCount]
  digestArrays: [pageDigests]
  invariant: zero count iff pageDigests empty

receiptFindingPage:
  required: [pageDigest, members]
  digests: [pageDigest]
  members: ordered-nonempty-safeFinding-records
  invariant: pageDigest-equals-sha256-of-RFC8785-JCS-reviewFindingPageV1

findingPages:
  type: array
  items: receiptFindingPage

findingWindow:
  required: [mode, maximumNewFindings, maximumNewFindingBytes,
    capacityReservationDigest]
  modeEnum: [normal, resolution-only]
  nonnegative: [maximumNewFindings, maximumNewFindingBytes]
  digests: [capacityReservationDigest]
  conditional: normal requires maximumNewFindings 32 and positive byte bound;
    resolution-only requires both maxima zero

lifecycleCustodyRefV1:
  required: [schemaVersion, runId, agentId, custodyId, custodyRevision]
  schemaVersion: {const: 1}
  ids: [runId, agentId, custodyId]
  positive: [custodyRevision]

reviewCertificationBasis:
  oneOf:
    - kind: active-binding
      required: [kind, actionBindingGeneration, activeBindingGeneration,
        terminalSequence, bindingChainDigest]
      positive: [actionBindingGeneration, activeBindingGeneration,
        terminalSequence]
      digests: [bindingChainDigest]
      invariant: actionBindingGeneration-equals-activeBindingGeneration
    - kind: predecessor-cut
      required: [kind, actionBindingGeneration, firstSuccessorBindingGeneration,
        activeBindingGeneration, terminalSequence, certificationCutSequence,
        certificationCutCustodyRef, certificationCutDigest, bindingChainDigest]
      positive: [actionBindingGeneration, firstSuccessorBindingGeneration,
        activeBindingGeneration, terminalSequence]
      nonnegative: [certificationCutSequence]
      certificationCutCustodyRef: lifecycleCustodyRefV1
      digests: [certificationCutDigest, bindingChainDigest]
      invariant: terminalSequence-less-than-or-equal-certificationCutSequence;
        certificationCutCustodyRef equals first-successor binding predecessor
        certification-cut custody and the referenced cut custody
    - kind: post-cut
      required: [kind, actionBindingGeneration, firstSuccessorBindingGeneration,
        activeBindingGeneration, terminalSequence, certificationCutSequence,
        certificationCutCustodyRef, certificationCutDigest, bindingChainDigest]
      positive: [actionBindingGeneration, firstSuccessorBindingGeneration,
        activeBindingGeneration, terminalSequence]
      nonnegative: [certificationCutSequence]
      certificationCutCustodyRef: lifecycleCustodyRefV1
      digests: [certificationCutDigest, bindingChainDigest]
      invariant: terminalSequence-greater-than-certificationCutSequence;
        certificationCutCustodyRef equals first-successor binding predecessor
        certification-cut custody and the referenced cut custody

reviewEvidenceRecord:
  required: [evidenceId, targetGeneration, slot, taskId, actionRef,
    authorityCompilationReceiptRef,
    terminalSequence, terminalKind, verdict, answerSafety, providerAnswerDigest,
    terminalResultDigest, reviewResultDigest, providerFailureCode,
    providerFailureDigest, routeReceiptDigest, routeObservationDigest,
    actualRouteIdentityDigest,
    finalPromptDigest, adapterId, endpointProvider, providerFamily, model, bundleDigest,
    coverageDigest, profileDigest, priorHeadGeneration, newHeadGeneration,
    attemptGeneration, priorEvidenceId, priorOpenFindingSet,
    reportedResolvedFindingDigests, acceptedResolvedFindingDigests,
    findingSet, newOpenFindingSet, repairRequiredFindingSet, findingWindow,
    readCoverageDigest, coverageSummary, reviewerFamilyRelation,
    certificationBasisAtTerminal, mutationReceiptDigest]
  nullOnly: [reviewResultDigest, providerFailureCode, providerFailureDigest,
    routeObservationDigest, actualRouteIdentityDigest, priorEvidenceId]
  nullConstants: [providerFailureCode, providerFailureDigest]
  terminalKindEnum: [safe-answer, unusable-answer]
  verdictEnum: [CLEAN, FINDINGS, UNUSABLE]
  answerSafetyEnum: [safe, unusable]
  conditional: safe-answer requires safe and CLEAN-or-FINDINGS with nonnull
    reviewResultDigest; unusable-answer requires unusable and UNUSABLE with null
    reviewResultDigest
  actionRef: ProviderActionRefV1
  authorityCompilationReceiptRef: providerAuthorityCompilationReceiptRefV1
  ids: [evidenceId, taskId, adapterId, endpointProvider, providerFamily, model,
    priorEvidenceId]
  invariant: actionRef.adapterId-equals-adapterId
  positive: [targetGeneration, terminalSequence, newHeadGeneration,
    attemptGeneration]
  nonnegative: [priorHeadGeneration]
  digests: [providerAnswerDigest, terminalResultDigest, routeReceiptDigest,
    finalPromptDigest, bundleDigest, coverageDigest, profileDigest,
    readCoverageDigest, mutationReceiptDigest]
  nullableDigests: [reviewResultDigest, routeObservationDigest,
    actualRouteIdentityDigest]
  invariant: nonnull actualRouteIdentityDigest requires nonnull
    routeObservationDigest and proved endpoint-provider/family/model arms
  digestArrays: [reportedResolvedFindingDigests,
    acceptedResolvedFindingDigests]
  slotEnum: [native, other-primary, cursor-grok, agy-gemini]
  coverageSummary: coverageSummary
  reviewerFamilyRelationEnum: reviewerFamilyRelationEnum
  certificationBasisAtTerminal: reviewCertificationBasis
  priorOpenFindingSet: findingSetRef
  findingSet: findingSetRef
  newOpenFindingSet: findingSetRef
  repairRequiredFindingSet: findingSetRef
  findingWindow: findingWindow

reviewTerminalFailureRecord:
  required: [targetGeneration, slot, taskId, actionRef,
    authorityCompilationReceiptRef,
    terminalSequence, terminalKind, providerFailureCode,
    providerFailureDigest, terminalResultDigest, routeReceiptDigest,
    finalPromptDigest, adapterId, endpointProvider, providerFamily, model, bundleDigest,
    coverageDigest, profileDigest, attemptGeneration, unchangedHeadGeneration,
    unchangedOpenFindingSetDigest, unchangedRepairRequiredFindingSetDigest,
    reviewerFamilyRelation]
  terminalKind: {const: provider-terminal-failure}
  providerFailureCodeEnum: providerTerminalFailureEnum
  actionRef: ProviderActionRefV1
  authorityCompilationReceiptRef: providerAuthorityCompilationReceiptRefV1
  slotEnum: [native, other-primary, cursor-grok, agy-gemini]
  ids: [taskId, adapterId, endpointProvider, providerFamily, model]
  positive: [targetGeneration, terminalSequence, attemptGeneration]
  nonnegative: [unchangedHeadGeneration]
  digests: [providerFailureDigest, terminalResultDigest, routeReceiptDigest,
    finalPromptDigest, bundleDigest, coverageDigest, profileDigest,
    unchangedOpenFindingSetDigest, unchangedRepairRequiredFindingSetDigest]
  reviewerFamilyRelationEnum: reviewerFamilyRelationEnum
  invariant: actionRef.adapterId-equals-adapterId

reviewCurrency:
  required: [target, source, chair, profile, currentCertificationBasis,
    certifying, blockerCodes]
  targetEnum: [current, stale, superseded]
  sourceChairProfileEnum: [current, stale]
  currentCertificationBasis: null-or-reviewCertificationBasis
  certifyingType: boolean
  blockerCodes: ordered-reviewCurrencyBlockerEnum

providerReview:
  required: [recordKind, record, currencyAtWatermark]
  recordKindEnum: [evidence, terminal-failure]
  conditional: evidence requires reviewEvidenceRecord; terminal-failure
    requires reviewTerminalFailureRecord
  currencyAtWatermark: reviewCurrency

recovery:
  required: [actionRef, recoveryGeneration, reason, state, disposition,
    reservationDigest, routeState, routeReceiptDigest, lookupState,
    lookupEvidenceDigest, settlementDigest, recoveryEvidenceDigest]
  routeStateEnum: [present, missing, integrity-failed]
  routeReceiptDigestInvariant: nonnull-iff-routeState-present
  nullOnly: [disposition, routeReceiptDigest, lookupEvidenceDigest,
    settlementDigest]
  stateEnum: [detected, inspecting, terminal-proved-no-effect,
    terminal-proved-usage, awaiting-human-retire, terminal-retired-unknown]
  reasonEnum: [intact-effect-ambiguity, route-row-missing,
    route-row-conflict, route-receipt-mismatch, target-binding-invalid,
    bundle-binding-invalid, prompt-binding-invalid, profile-binding-invalid,
    lineage-binding-invalid]
  dispositionEnum: [proved-no-effect-release, exact-usage-settled,
    conservative-full-ceiling-settled, full-ceiling-retired, null]
  lookupStateEnum: [not-attempted, in-flight, completed]
  actionRef: ProviderActionRefV1
  positive: [recoveryGeneration]
  digests: [reservationDigest, recoveryEvidenceDigest]
  nullableDigests: [routeReceiptDigest, lookupEvidenceDigest, settlementDigest]
  conditional: lookupEvidenceDigest is nonnull iff lookupState completed;
    detected/inspecting/awaiting-human-retire require null disposition and
    settlementDigest; terminal-proved-no-effect requires disposition proved-no-
    effect-release and nonnull settlementDigest; terminal-proved-usage requires
    exact-usage-settled or conservative-full-ceiling-settled and nonnull
    settlementDigest; terminal-retired-unknown requires full-ceiling-retired and
    nonnull settlementDigest

objectiveCheck:
  required: [taskId, checkId, kind, state, evidenceRef, evidenceDigest,
    observedSourceStateDigest]
  stateEnum: [pass, fail, not-run]
  nullOnly: [evidenceRef, evidenceDigest]
  conditional: evidenceRef and evidenceDigest are both nonnull iff state pass-or-fail;
    both null iff not-run
  ids: [taskId, checkId, evidenceRef]
  kindEnum: objectiveCheckKindEnum
  digests: [observedSourceStateDigest]
  nullableDigests: [evidenceDigest]

providerFailureOrSubstitutionEvent:
  required: [actionRef, eventGeneration, requestedFamily, requestedModel,
    resolvedAdapterId, resolvedFamily, resolvedModel, code, evidenceDigest]
  nullOnly: [resolvedAdapterId, resolvedFamily, resolvedModel]
  conditional: resolvedAdapterId/resolvedFamily/resolvedModel are all nonnull or all null
  actionRef: ProviderActionRefV1
  positive: [eventGeneration]
  ids: [requestedFamily, requestedModel,
    resolvedAdapterId, resolvedFamily, resolvedModel]
  codeEnum: providerFailureOrSubstitutionEnum
  invariant: resolvedAdapterId-is-null-or-equals-actionRef.adapterId
  digests: [evidenceDigest]

intervention:
  required: [commandId, operation, operatorId, targetRef, targetRevision,
    directInputAttestationId, resultDigest]
  nullOnly: [directInputAttestationId]
  ids: [commandId, operatorId, targetRef,
    directInputAttestationId]
  operationEnum: operatorInterventionOperationEnum
  positive: [targetRevision]
  digests: [resultDigest]
~~~

`providerFailuresAndSubstitutions` is an append-only event stream. Generation
starts at one and is contiguous per canonical action pair; one event never
overwrites another. A substitution event may therefore precede a later route,
provider or quota failure for the same pair. Event order, not a single current
code, is the receipt truth.

`lease` and `lifecycleRow` are tagged unions, never nullable bags:

~~~yaml
lease:
  oneOf:
    - leaseKind: task
      required: [leaseKind, leaseId, ownerAgentId, generation, state,
        taskId, taskRevision, expiry, revision]
      stateEnum: [active, frozen, released, revoked, abandoned]
      expiryType: RFC3339-date-time-or-null
      ids: [leaseId, ownerAgentId, taskId]
      positive: [generation, taskRevision, revision]
    - leaseKind: write
      required: [leaseKind, leaseId, ownerAgentId, generation, state,
        pathScopeDigest, expiry, revision]
      stateEnum: [active, quarantined, lifecycle-quarantined, released,
        revoked-abandoned, expired]
      expiryType: RFC3339-date-time-or-null
      ids: [leaseId, ownerAgentId]
      positive: [generation, revision]
      digests: [pathScopeDigest]

lifecycleRow:
  oneOf:
    - sourceKind: custody
      required: [sourceKind, agentId, custodyId, actionRef, state,
        disposition, sourceProviderGeneration, sourcePrincipalGeneration,
        sourceBridgeGeneration, targetProviderGeneration,
        targetPrincipalGeneration, targetBridgeGeneration, checkpointDigest,
        terminalEvidenceDigest]
      nullOnly: [terminalEvidenceDigest]
      stateEnum: [awaiting-boundary, prepared, dispatched, accepted, ambiguous,
        provider-terminal, committing, finalized]
      dispositionEnum: [adopted, no-effect, quarantined, superseded, abandoned, null]
      conditional: disposition is null before finalized and is nonnull exactly
        at finalized; terminalEvidenceDigest is null in awaiting-boundary,
        prepared, dispatched, accepted and ambiguous and is nonnull in provider-
        terminal, committing and finalized
      actionRef: ProviderActionRefV1
      ids: [agentId, custodyId]
      positive: [sourceProviderGeneration, sourcePrincipalGeneration,
        sourceBridgeGeneration, targetProviderGeneration,
        targetPrincipalGeneration, targetBridgeGeneration]
      digests: [checkpointDigest]
      nullableDigests: [terminalEvidenceDigest]
    - sourceKind: generation-loss
      required: [sourceKind, agentId, generationLossId, lossKind,
        recoveryActionRef, abandonKind, state, disposition,
        oldProviderGeneration, newProviderGeneration,
        oldContextRevision, newContextRevision, checkpointState,
        checkpointDigest, lossEvidenceDigest, terminalEvidenceDigest]
      nullOnly: [recoveryActionRef, oldContextRevision, checkpointDigest,
        terminalEvidenceDigest]
      lossKindEnum: [generation-advance, context-advance]
      stateEnum: [open, recovery-in-progress, recovered-adopted, abandoned]
      dispositionEnum: [recovered-adopted, abandoned, null]
      abandonKindEnum: [none, direct-open, recovery-attempt]
      checkpointStateEnum: [absent, invalid, last-validated]
      conditional: checkpointDigest nonnull iff last-validated; generation-
        advance requires newProviderGeneration greater than old; context-advance
        requires newProviderGeneration equal oldProviderGeneration, nonnull
        oldContextRevision and newContextRevision greater than oldContextRevision;
        disposition is null for open/recovery-
        in-progress, exactly recovered-adopted for recovered-adopted and exactly
        abandoned for abandoned; terminalEvidenceDigest is nonnull exactly in
        the two terminal states; recoveryActionRef is null and abandonKind none
        in open, nonnull and abandonKind none in recovery-in-progress and
        recovered-adopted, null with direct-open or nonnull with recovery-attempt
        in abandoned
      recoveryActionRef: ProviderActionRefV1-or-null
      ids: [agentId, generationLossId]
      positive: [oldProviderGeneration, newProviderGeneration]
      nonnegative: [newContextRevision]
      nullableNonnegative: [oldContextRevision]
      digests: [lossEvidenceDigest]
      nullableDigests: [checkpointDigest, terminalEvidenceDigest]
~~~

`reviewCompletion` is a local blocker-dependent union, not an external `$ref`:

~~~yaml
reviewCompletion:
  required: [schemaVersion, blockers, targetGeneration, targetChair, reviewedArtifactRef,
    publicationLineageDigest, bundleDigest, manifestRootDigest, coverageDigest,
    riskReadMapDigest, mandatoryReadSetDigest, profileDigest, unavailableSlots, slots,
    finalReviewComplete]
  schemaVersion: {const: 1}
  blockerItems: topReviewBlockerEnum
  nullablePositive: [targetGeneration]
  nullableIds: [reviewedArtifactRef]
  targetChairType: targetChair-or-null
  nullableDigests: [publicationLineageDigest, bundleDigest,
    manifestRootDigest, coverageDigest, riskReadMapDigest,
    mandatoryReadSetDigest, profileDigest]
  finalReviewCompleteType: boolean
  oneOf:
    - when: required-certifying-capability-unavailable
      blockersFirstAndContains: certifying-review-capability-unavailable
      unavailableSlots: nonempty-ordered-certifyingSlotUnavailable-items
      targetProjection: exact-trustworthy-target-immutable-fields-or-all-null
      slots: []
      finalReviewComplete: false
    - when: finding-capacity-unavailable
      blockersFirstAndContains: finding-capacity-exhausted
      unavailableSlots: []
      targetProjection: exact-trustworthy-target-immutable-fields-or-all-null
      slots: []
      finalReviewComplete: false
    - when: targetGeneration-null-and-blockers-exactly-missing-target
      blockers: [missing-target]
      unavailableSlots: []
      targetFields: all-null
      profileDigest: null
      slots: []
      finalReviewComplete: false
    - when: targetGeneration-null-and-blockers-exactly-integrity-failure
      blockers: [integrity-failure]
      unavailableSlots: []
      targetFields: all-null
      profileDigest: null
      slots: []
      finalReviewComplete: false
    - when: trustworthy-target-present-but-structural-integrity-failed
      blockers: [integrity-failure]
      requiredTargetFields: [targetGeneration, reviewedArtifactRef,
        publicationLineageDigest, bundleDigest, manifestRootDigest,
        coverageDigest, riskReadMapDigest, mandatoryReadSetDigest]
      targetChair: null
      profileDigest: null
      unavailableSlots: []
      slots: []
      finalReviewComplete: false
    - when: targetGeneration-nonnull-and-profileDigest-null
      requiredTargetFields: [targetGeneration, targetChair,
        reviewedArtifactRef, publicationLineageDigest, bundleDigest,
        manifestRootDigest, coverageDigest, riskReadMapDigest,
        mandatoryReadSetDigest]
      blockersContains: profile-unavailable
      unavailableSlots: []
      profileDigest: null
      slots: []
      finalReviewComplete: false
    - when: targetGeneration-and-profileDigest-nonnull
      requiredTargetFields: [targetGeneration, targetChair,
        reviewedArtifactRef, publicationLineageDigest, bundleDigest,
        manifestRootDigest, coverageDigest, riskReadMapDigest,
        mandatoryReadSetDigest, profileDigest]
      slots: exactly-four-reviewSlot-objects
      unavailableSlots: []
      finalReviewCompleteIff: top-blockers-empty-and-every-slot-blockers-empty

certifyingSlotUnavailable:
  required: [projectSessionId, profileId, profileSchemaDigest,
    targetChairFamily, slot, adapterId, adapterContractDigest, providerFamily,
    model, sourceMode, runtimeIdentityDigest, platformIdentityDigest,
    availabilityRevision, reason]
  slotEnum: [native, other-primary, cursor-grok, agy-gemini]
  reasonEnum: [adapter-inactive, contract-mismatch, confinement-unproved,
    portal-unavailable, provider-runtime-unavailable]
  ids: [projectSessionId, profileId, targetChairFamily, adapterId,
    providerFamily, model, sourceMode]
  positive: [availabilityRevision]
  digests: [profileSchemaDigest, adapterContractDigest,
    runtimeIdentityDigest, platformIdentityDigest]
  ordering: profile-slot-order

reviewSlot:
  required: [slot, headGeneration, attemptGeneration, actionRef, evidenceId,
    terminalKind, verdict, resultDigest, providerFailureCode,
    providerFailureDigest, routeReceiptDigest, adapterId, providerFamily,
    model, readCoverageDigest, reviewerFamilyRelation, currentCertificationBasis,
    certifying, openFindingSet, blockers]
  nullOnly: [actionRef, evidenceId, terminalKind, verdict, resultDigest,
    providerFailureCode, providerFailureDigest, routeReceiptDigest,
    readCoverageDigest, currentCertificationBasis]
  slotEnum: [native, other-primary, cursor-grok, agy-gemini]
  terminalKindEnum: [safe-answer, unusable-answer,
    provider-terminal-failure, terminal-no-effect, integrity-terminal,
    retired-unknown, null]
  verdictEnum: [CLEAN, FINDINGS, UNUSABLE, null]
  providerFailureCodeEnum: [max-turns-exhausted, provider-rejected,
    terminal-no-answer, adapter-terminal-failure, null]
  reviewerFamilyRelationEnum: reviewerFamilyRelationEnum
  ids: [adapterId, providerFamily, model]
  actionRef: ProviderActionRefV1-or-null
  nullableIds: [evidenceId]
  nonnegative: [headGeneration, attemptGeneration]
  nullableDigests: [resultDigest, routeReceiptDigest, readCoverageDigest]
  certifyingType: boolean
  openFindingSet: findingSetRef
  blockerItems: slotReviewBlockerEnum
  conditional: provider-terminal-failure requires evidenceId/verdict/
    readCoverageDigest/currentCertificationBasis null, nonnull result/failure fields
    and headGeneration unchanged from its action snapshot; every other terminal
    requires provider failure fields null
~~~

Count objects are fully named:

~~~yaml
messageCounts:
  required: [mailbox, resultDelivery, deliveryWatermark]
  mailboxRequired: [ready, claimed, acknowledged, abandoned, expired]
  resultDeliveryRequired: [pending, claimed, providerAccepted, consumed,
    overdue, abandoned]
  counterType: every displayed leaf is nonnegative

counts:
  required: [taskOwners, agents, providerRoutes, providerReviews,
    findingPages,
    routeIntegrityRecoveries, taskLeases, writeLeases, objectiveChecks,
    providerFailuresAndSubstitutions, operatorInterventions,
    compactionsAndRotations, mailboxTotal, resultDeliveryTotal]
  counterType: every displayed property is nonnegative
~~~

All displayed enum strings are literal local `$defs` enums. This includes
objective-check kind, provider failure/substitution event code, review terminal-
failure code and every registry-
closed operator value used by the receipt. The
schema has no resolver, catalogue URI, dynamic reference or runtime registry
dependency. A catalogue change regenerates and versions this standalone schema;
an unknown future code fails validation. Provider-specific raw codes and detail
remain private behind the corresponding evidence digest. Every array item uses
its local object definition. Arrays are strictly ascending and unique by these tuples:
`taskOwners(taskId)`, `agents(agentId)`,
`directInput.attestations(attestationId)`,
`providerRoutes(actionRef.adapterId,actionRef.actionId)`,
`providerReviews(record.targetGeneration,record.slot,record.attemptGeneration,
  recordKind,record.actionRef.adapterId,record.actionRef.actionId)`,
`findingPages(pageDigest)`,
`routeIntegrityRecoveries(actionRef.adapterId,actionRef.actionId,recoveryGeneration)`,
`taskAndWriteLeases(leaseKind,leaseId)`,
`objectiveChecks(taskId,checkId)`,
`providerFailuresAndSubstitutions(actionRef.adapterId,actionRef.actionId,
eventGeneration)`,
`operatorInterventions(commandId)` and, by lifecycle union arm,
`compactionsAndRotations(agentId,custody,custodyId,targetProviderGeneration)`
or `(agentId,generation-loss,generationLossId,newProviderGeneration,
newContextRevision)`.
`findingPages` contains exactly one full page for every page digest reachable
from any receipt evidence/completion finding-set reference, with no orphan or
missing page. Every finding page is strictly ascending and unique by
`(findingDigest,findingId)` using lowercase UTF-8 byte order, and page ranges
are nonoverlapping and strictly ascending. Every digest-only array is strictly
ascending and unique by its lowercase digest bytes. Each
`findingDigest` is SHA-256 over RFC 8785 JCS of that complete safeFinding object
with `findingDigest` omitted, so it is neither caller-selected nor self-
referential. Slot order is native, other-primary, cursor-grok, agy-gemini.

`fabric.v1.receipt.export` is bounded two-phase publication. Phase A opens one
read snapshot, fixes `eventWatermark`, captures every projection-owner revision
and captures the exact external currency tokens used by review completion:
Git object format/base/full HEAD/head tree/index tree/worktree-clean state,
repository source-state digest and every registered external source/evidence
revision/digest. It runs each producer at that watermark and writes only a
private temporary candidate. Phase B opens a new read transaction, equality-
rechecks all captured database revisions, and reruns the fixed no-follow Git/
external-source token reads before atomic publication. Any drift discards the
candidate and boundedly retries or fails; it can never publish
`finalReviewComplete:true` for bytes that became stale between projection and
write. Only the current slot evidence arm in providerReviews must equal the
corresponding resolved reviewCompletion evidence slot. A current terminal-
failure arm instead equals the slot action/attempt/failure/result and proves its
head/open/repair set digests did not advance. Historical evidence rows form
contiguous prior/new-head and prior-evidence chains; historical failure rows
leave those chains unchanged. A recovery with `routeState=present` equals one
providerRoutes row. `missing` and `integrity-failed` instead require a null
route-receipt digest and non-null safe recovery-evidence digest and cannot
reconstruct a route. Chair/agent/
task/lease/run identities and every route/result/bundle/head digest otherwise
equality-join, and counts equal array lengths and the sums of the explicitly
named state counters. Missing, duplicate, extra or crossed rows fail export.

Canonical bytes are RFC 8785 JCS, UTF-8, with no BOM or trailing newline.
`stateHash` is omitted during canonicalisation, then set to lowercase
`sha256:<64hex>` over those exact bytes; export canonicalises again with the
field present. No caller supplies a row. The receipt contains no private answer,
diagnostic, usage, bundle byte, prompt or capability. `delivery-run` v1 remains
separate and is never a receipt-v2 nested codec.

Herdr panes show provider, model family, role, task, lifecycle, context pressure,
unread message count and current lease generation where integrations permit.
The operator may pause, steer, cancel or focus an agent through the fabric or
Herdr. Every fabric-mediated intervention and every intervention reported by a
provider or Herdr integration is journalled. Unattributable direct terminal
input is not fabricated as a receipt event.
