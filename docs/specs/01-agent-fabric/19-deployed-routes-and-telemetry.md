
### 32.21 Capability-backed deployed routes and operational telemetry

This amendment incorporates the mature findings from the
[July 2026 continuity and routing research](../../research/evidence-snapshots/agent-continuity-routing-2026-07.md)
into the existing adapter, route and lifecycle owners. It adds no autonomous
route learner, context-pressure controller, compaction threshold, global model
preference, native deep-mode registry or OpenCode activation.

Every activated adapter publishes one current immutable
`adapterCapabilitySnapshotV1`. Every object below is closed; every array is
ordered as stated and duplicate-free, and a bound exists only where explicitly
stated. Timestamps are RFC 3339 UTC, digests use lowercase
`sha256:<64 hex>`, and IDs are nonempty UTF-8 strings of at most 256 bytes.

~~~yaml
adapterCapabilitySnapshotV1:
  schemaVersion: 1
  snapshotId: stable-id
  snapshotGeneration: positive-integer
  adapterId: exact-adapter-id
  adapterContractDigest: sha256-prefixed-digest
  hostId: exact-host-id
  hostVersion: exact-host-version
  source: runtime-discovery | version-pinned-conformance | unavailable
  observedAt: timestamp
  expiresAt: timestamp
  capabilities:
    oneOf:
      - kind: available
        modelCatalog:
          - family: canonical-family
            model: exact-provider-model
            effort:
              oneOf:
                - kind: applied
                  normalizations:
                    - rawProviderEffort: exact-provider-value
                      normalizedReasoningEffort: none | low | medium | high | xhigh | max
                - kind: inapplicable
            nativeModeNormalizations:
              - rawNativeMode: exact-provider-value | null
                orchestrationMode: single | native-subagents | dynamic-workflow | provider-multi-agent
        context:
          reporting: reported | estimated | unavailable
          compactInPlace: true | false | unknown
          freshSession: true | false | unknown
          boundaryInjection: verified | unverified | unavailable
        orchestration:
          nativeSubagents: none | bounded | recursive | unknown
          maxDepth: nonnegative-integer | null
          maxConcurrency: positive-integer | null
        safety:
          enforcedReadOnly: true | false | unknown
          permissionSource: adapter | host | config-overlay | unknown
        authorityProfileSupport:
          - family: exact-model-catalogue-family
            model: exact-model-catalogue-model
            rawNativeMode: exact-listed-native-mode | null
            authorityProfile: review-readonly | workspace-write-offline
            oneOf:
              - support: unavailable
                reason: exact-safe-unavailable-reason
              - support: enforceable
                filesystemMode: readonly | one-owned-worktree
                privateTempRequirement: none | required
                toolEgress: none
                secretAccess: none
                externalEffects: none
                nativeSettingsSchemaDigest: sha256-prefixed-digest
      - kind: unavailable
        reason: exact-safe-unavailable-reason
  capabilityBodyDigest: sha256-prefixed-digest
  snapshotDigest: sha256-prefixed-digest

capabilitySnapshotRefV1:
  snapshotId: stable-id
  snapshotGeneration: positive-integer
  snapshotDigest: sha256-prefixed-digest
  capabilityBodyDigest: sha256-prefixed-digest

capabilitySnapshotSummaryV1:
  admission:
    snapshotRef: capabilitySnapshotRefV1
    source: runtime-discovery | version-pinned-conformance | unavailable
    observedAt: timestamp
    expiresAt: timestamp
  dispatch:
    oneOf:
      - null
      - snapshotRef: capabilitySnapshotRefV1
        source: runtime-discovery | version-pinned-conformance | unavailable
        observedAt: timestamp
        expiresAt: timestamp
~~~

The two `capabilities` arms are disjoint. `source: unavailable` requires the
`kind: unavailable` arm; the available arm requires runtime discovery or
version-pinned conformance. `modelCatalog` is nonempty, has at most 256 entries
and is sorted by `(family, model)`. Applied effort normalisations and
native-mode rows each have 1..64 entries, are sorted by raw provider value with
null native mode first, and are unique.
`authorityProfileSupport` is nonempty and sorted/unique by
`(family,model,rawNativeMode,authorityProfile)`. Its family/model/native-mode
tuple must exist in the same catalogue. `review-readonly` enforceable rows
require `filesystemMode:readonly`, `privateTempRequirement:none` and
`safety.enforcedReadOnly:true`;
`workspace-write-offline` enforceable rows require
`filesystemMode:one-owned-worktree` and explicitly say whether that exact
provider tuple requires its separately custodied private temp root. Both
enforceable arms
fix tool egress, secret access and external effects to `none` and identify the
exact native-settings schema the compiler targets. The capability row proves
only that the adapter can enforce that shape; the current task/worktree and
Step-3 tuple attestation remain separate admission inputs. An unavailable row
has only its safe reason and cannot admit that tuple/profile.
The inapplicable effort arm has no mappings. Each raw value maps to exactly one
normalised value. Null depth/concurrency and explicit `unknown`
mean unknown, not unlimited or false. Runtime discovery and version-pinned
conformance are distinct sources. Product prose, a model alias or a prior
successful call is not a capability snapshot.

`capabilityBodyDigest` is SHA-256 of RFC 8785 JCS of exactly
`{schemaVersion,adapterId,adapterContractDigest,hostId,hostVersion,source,capabilities}`.
Snapshot ID, generation, observation/expiry clocks and both digest fields are
excluded. `snapshotDigest` is SHA-256 of RFC 8785 JCS of the complete snapshot
with only `snapshotDigest` omitted. Thus a refreshed immutable snapshot may
advance its instance identity and clocks while retaining the same body digest.
Every ref equality-copies all four fields from its snapshot row; no digest-only
or generation-only reference is valid.

Every answer-bearing provider action binds one immutable
`deployedRouteAdmissionV1`; terminal evidence may append one
`deployedRouteObservationV1`. They supplement, and do not replace, the existing
`model-route.v1`, `ProviderActionRefV1`, route-event and certifying-review
contracts in section 32.19.

~~~yaml
discoverySurfaceManifestV1:
  schemaVersion: 1
  hostId: exact-host-id
  hostVersion: exact-host-version
  providerProfile: exact-profile-id
  rawNativeMode: exact-provider-value | null
  principalScopeDigest: sha256-prefixed-digest
  permissionProfileDigest: sha256-prefixed-digest
  negotiatedFeatureSetDigest: sha256-prefixed-digest
  rendererVersion: exact-version
  bootstrapText: exact-rendered-bootstrap-text
  skills:
    - name: exact-visible-skill-name
      description: exact-visible-skill-description
  tools:
    - name: exact-visible-tool-name
      description: exact-visible-tool-description
      inputSchema: exact-canonical-JSON-Schema
  agentCommands:
    - name: exact-visible-agent-or-command-name
      description: exact-visible-description
  nativePreambleText: exact-rendered-native-preamble
  bootstrapDigest: sha256-prefixed-digest
  skillCatalogueDigest: sha256-prefixed-digest
  toolRegistryDigest: sha256-prefixed-digest
  agentCommandRegistryDigest: sha256-prefixed-digest
  nativePreambleDigest: sha256-prefixed-digest

discoverySurfaceRefV1:
  evidenceId: exact-EvidenceArtifactRegistration-id
  evidenceRevision: positive-integer
  artifactRef:
    path: canonical-relative-path
    digest: sha256-prefixed-digest
  hostId: exact-host-id
  hostVersion: exact-host-version
  providerProfile: exact-profile-id
  rawNativeMode: exact-provider-value | null
  evidenceKind: discovery-surface.v1
  producer: fabric-daemon
  manifestDigest: sha256-prefixed-digest

adapterEffectiveConfigurationRefV1:
  configurationId: stable-id
  configurationRevision: positive-integer
  configurationDigest: sha256-prefixed-digest

providerAuthorityCompilationReceiptRefV1:
  coordinationRunId: exact-run
  actionRef: ProviderActionRefV1
  receiptDigest: sha256-prefixed-digest
  authorityId: exact-stored-authority
  authorityEnvelopeDigest: sha256-prefixed-digest
  approvalEvidenceDigest: sha256-prefixed-digest
  taskOwnershipDigest: sha256-prefixed-digest
  workspaceRootIdentityDigest: sha256-prefixed-digest
  worktreeIdentityDigest: sha256-prefixed-digest | null
  privateTempRootIdentityDigest: sha256-prefixed-digest | null
  riskPolicyDigest: sha256-prefixed-digest
  providerCapabilitySnapshotDigest: sha256-prefixed-digest
  requestedAuthorityProfileDigest: sha256-prefixed-digest
  requestedAuthorityProfile: review-readonly | workspace-write-offline
  effectiveAuthorityProfile: exact-requested-profile
  effectiveAuthorityDigest: sha256-prefixed-digest
  nativeSettingsDigest: sha256-prefixed-digest
  providerControlPlaneExceptionDigest: sha256-prefixed-digest
  localAttestationDigest: sha256-prefixed-digest
  capabilityBodyDigest: sha256-prefixed-digest
  adapterContractDigest: sha256-prefixed-digest
  hostIdentityDigest: sha256-prefixed-digest
  executableIdentityDigest: sha256-prefixed-digest
  nativeSettingsSchemaDigest: sha256-prefixed-digest
  authorityCompilerVersion: exact-version
  expectedAuthorityProfilePolicyVersion: exact-request-version
  authorityProfilePolicyVersion: exact-version

deployedRouteAdmissionV1:
  schemaVersion: 1
  actionRef: ProviderActionRefV1
  routeRequestDigest: sha256-prefixed-digest
  routeReceiptDigest: sha256-prefixed-digest
  authorityCompilationReceiptRef: providerAuthorityCompilationReceiptRefV1
  requested:
    adapterAlias: exact-configured-alias
    modelAlias: exact-configured-alias
    explicitModel: exact-provider-model | null
    rawProviderEffort: exact-provider-value | null
    rawNativeMode: exact-provider-value | null
  admitted:
    hostId: exact-host-id
    adapterId: exact-adapter-id
    adapterContractDigest: sha256-prefixed-digest
    endpointProvider: exact-provider-id
    family: canonical-family
    model: exact-provider-model
    resolvedEffort: resolvedEffortV1
    normalizedReasoningEffort: none | low | medium | high | xhigh | max | null
    rawNativeMode: exact-provider-value | null
    orchestrationMode: single | native-subagents | dynamic-workflow | provider-multi-agent
    capabilitySnapshotRef: capabilitySnapshotRefV1
    effectiveConfigurationRef: adapterEffectiveConfigurationRefV1
    requestedConfigurationDigest: sha256-prefixed-digest
    effectiveConfigurationDigest: sha256-prefixed-digest
    permissionProfileDigest: sha256-prefixed-digest
    discoverySurfaceRef: discoverySurfaceRefV1
  routePolicyRevision: exact-revision
  harnessRevision: exact-revision
  harnessDigest: sha256-prefixed-digest
  contextPolicyRevision: exact-revision
  contextPolicyDigest: sha256-prefixed-digest
  admissionDigest: sha256-prefixed-digest

deployedRouteDispatchV1:
  schemaVersion: 1
  actionRef: ProviderActionRefV1
  admissionDigest: sha256-prefixed-digest
  dispatchOrdinal: positive-contiguous-integer
  authorityCompilationReceiptRef: providerAuthorityCompilationReceiptRefV1
  capabilitySnapshotRef: capabilitySnapshotRefV1
  effectiveConfigurationRef: adapterEffectiveConfigurationRefV1
  permissionProfileDigest: sha256-prefixed-digest
  discoverySurfaceRef: discoverySurfaceRefV1
  dispatchedAt: timestamp
  dispatchDigest: sha256-prefixed-digest

observedValueV1:
  oneOf:
    - state: observed
      value: exact-type-specific-value
      source: provider-result | adapter-attestation
      confidence: exact | attested
    - state: unavailable
      value: null
      source: unavailable
      confidence: unknown

deployedRouteObservationV1:
  schemaVersion: 1
  actionRef: ProviderActionRefV1
  admissionDigest: sha256-prefixed-digest
  hostId: observedValueV1<nonempty-id>
  adapterId: observedValueV1<nonempty-id>
  endpointProvider: observedValueV1<nonempty-id>
  family: observedValueV1<canonical-family>
  model: observedValueV1<exact-provider-model>
  resolvedEffort: observedValueV1<resolvedEffortV1>
  normalizedReasoningEffort: observedValueV1<none-or-low-or-medium-or-high-or-xhigh-or-max-or-null>
  rawNativeMode: observedValueV1<exact-provider-value-or-null>
  orchestrationMode: observedValueV1<single-or-native-subagents-or-dynamic-workflow-or-provider-multi-agent>
  observedAt: timestamp
  observationDigest: sha256-prefixed-digest

actualReviewRouteIdentityV1:
  schemaVersion: 1
  admissionDigest: sha256-prefixed-digest
  observationDigest: sha256-prefixed-digest
  hostId: observedValueV1<nonempty-id>
  adapterId: observedValueV1<nonempty-id>
  endpointProvider: observedValueV1<nonempty-id-required-observed>
  family: observedValueV1<canonical-family-required-observed>
  model: observedValueV1<exact-provider-model-required-observed>
  resolvedEffort: observedValueV1<resolvedEffortV1>
  normalizedReasoningEffort: observedValueV1<none-or-low-or-medium-or-high-or-xhigh-or-max-or-null>
  rawNativeMode: observedValueV1<exact-provider-value-or-null>
  orchestrationMode: observedValueV1<single-or-native-subagents-or-dynamic-workflow-or-provider-multi-agent>
  actualRouteIdentityDigest: sha256-prefixed-digest
~~~

`admissionDigest`, `dispatchDigest` and `observationDigest` are separate SHA-256
digests over RFC 8785 JCS of their complete closed objects with only their own
digest field omitted. Admission never changes after action commit. Each actual
admission receipt ref equality-copies the admitted compilation row for the same
action pair. Its requested/effective profiles are equal, and its effective,
native-settings and control-plane-exception digests are nonnull. Each dispatch
ref byte-equals admission and the route projection; a missing, rejected or
crossed compilation receipt prevents action admission or dispatch.
`admitted.permissionProfileDigest` and every dispatch
`permissionProfileDigest` equal the ref's `nativeSettingsDigest` and the
per-action effective configuration's exact permission digest; no independent
permission/settings hash exists.
Each actual
dispatch appends one immutable contiguous-ordinal dispatch row immediately
before provider I/O; it parent-binds the admission and exact snapshot,
effective-configuration, permission and discovery-surface identities used for
that attempt. Every dispatch row also enters the existing ordered route-event
journal and receipt history; the joined public route uses `latestDispatch` only
as its labelled current detail, not as a replacement for history. Observation
is absent before terminal evidence and is inserted at most once; it parent-
binds the immutable admission digest.
`observedValueV1` expands in the checked-in schema to a closed type-specific
union. Required identity values cannot be null in the observed arm. Exactly two
typed cases admit an observed null: raw native mode, meaning the provider proved
no raw native mode, and normalised reasoning when resolved effort is observed
`inapplicable`. `state: unavailable` remains distinguishable. Every field has its
own evidence source/confidence, so a provider may prove model while effort
remains honestly unavailable. `provider-result` and `exact` require a field
directly present in the authenticated provider result. `adapter-attestation`
and `attested` require a contract-defined adapter observation. Crossed source,
confidence, state or null combinations reject.
`actualRouteIdentityDigest` is SHA-256 of RFC 8785 JCS of the complete closed
`actualReviewRouteIdentityV1` with only that digest omitted. Every route field
equality-copies the corresponding observation arm, and its admission/observation
digests equality-bind the exact route pair. Endpoint provider, family and model
must be proved observed arms; the remaining arms may be honestly unavailable.
Any observed host/adapter/provider/family/model/effort/native-mode/orchestration
value unequal to admission is `actual-route-mismatch`, even when all three
profile-required identity values match. An unavailable required provider/
family/model arm cannot form this object and is `actual-route-unproved`.
An observed null raw native mode requires observed `single` orchestration;
non-single orchestration requires an observed non-null raw native mode. An
unavailable native-mode field cannot be used to infer orchestration.
When both effort fields are observed, applied resolved effort requires the
snapshot-mapped nonnull normalised value, while inapplicable requires an
observed null normalised value. An unavailable effort arm cannot be filled from
admission.

An applied admitted `resolvedEffortV1.value` is the raw provider effort, must
equal one applied capability normalisation and requires its corresponding
non-null normalised reasoning value. `inapplicable` requires the snapshot's
inapplicable arm, null requested effort and null normalised reasoning, as
section 32.19 already specifies. Raw native mode
and orchestration mode must equal one mapping row in the same model snapshot.
The raw effort/native-mode values pass unchanged to the adapter; policy fields
cannot reconstruct or overwrite them. Requested, admitted and observed values
remain separate even when equal; substitutions stay in the existing ordered
event journal.

`discoverySurfaceRefV1` points to the existing immutable
`EvidenceArtifactRegistration` from section 32.14, but only the daemon-internal
discovery renderer may create evidence kind `discovery-surface.v1` with
existing `publisherKind: fabric` and `producer: fabric-daemon`. Public/agent
evidence publication rejects that kind.
After resolving exact host/version/profile/native mode and the active generated
skill/tool/agent-command registries, the daemon renders the session-start
manifest. The exact artifact bytes are RFC 8785 JCS of the closed
`discoverySurfaceManifestV1`, which deliberately contains no digest of itself.
`manifestDigest` is SHA-256 of those exact bytes and must byte-equal
`artifactRef.digest`; the registered artifact bytes must reproduce it. The ref's
host/version/profile/raw-mode tuple equality-copies the manifest and is also
bound to route resolution, capability host/body and the adapter launch
envelope. The manifest binds principal scope, permission profile, negotiated
features, renderer version, the exact rendered bootstrap/preamble and exact
ordered skill/tool/command catalogues. Each of the five component digests is
SHA-256 of the corresponding exact canonical text/array value and rejects a
content/digest mismatch. No artificial item or byte ceiling is added here;
existing run-artifact/storage authority remains the resource boundary. Admission
requires its permission digest and admitted native mode to match the manifest/
ref; requested native mode is either the same raw value or null under the
recorded configured-default policy. The launch envelope equality-binds the same ref and effective
configuration; an adapter that cannot prove application leaves the route
unavailable. This records the actual rendered surface and creates no target,
catalogue-count limit or other hard ceiling.

At new-action admission, snapshot expiry or adapter-contract/model/effort/mode
incompatibility rejects before provider I/O. Admission immutably binds both the
snapshot instance ref and its body digest. Immediately before every initial
dispatch or permitted retry, the daemon reads the current snapshot and requires
it to be unexpired, adapter/contract/host compatible and body-equal to the
admitted body. A newer instance with identical body is permitted and is written
to that attempt's dispatch row, so harmless refresh cannot starve an action.
Body, permission-profile or discovery-surface drift terminalises the zero-effect
action and resolves afresh under a new pair. The per-action effective-
configuration ref must still identify the same adapter/contract/executable,
snapshot body, requested/effective configuration, permission and surface at
every dispatch; any mismatch is likewise no-effect. Admission is never
rewritten.
Ambiguous effect stays with the original action/recovery owner and cannot reroute
or replay.

The existing `fabric.v1.provider-action.read`, generated agent/MCP read and
scoped operator Evidence projection expose one closed route variant containing
`admission: deployedRouteAdmissionV1`, `capabilitySummary:
capabilitySnapshotSummaryV1`, `latestDispatch: null |
deployedRouteDispatchV1` and `observation: null |
deployedRouteObservationV1`. The summary's separately labelled admission and
dispatch arms each equality-copy their own snapshot ref, source, observed/expiry
clocks and body digest; when present the dispatch arm also equals
`latestDispatch.capabilitySnapshotRef`. A refreshed dispatch instance can never
inherit the admission snapshot's clocks. Snapshot/route/action joins are exact, not a
latest-timestamp choice. Receipt-v2 `providerRoutes` uses the same closed shape.
No separate Console codec or action-ID-only lookup exists.

Context pressure has one public, non-authoritative wire:

~~~yaml
providerContextPressureV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  agentId: exact-agent
  adapterId: exact-adapter
  providerGeneration: positive-integer
  contextRevision: nonnegative-integer
  observationAuditRef:
    sourceEventId: exact-lifecycle-observation-event
    providerGeneration: exact-parent-generation
    contextRevision: exact-parent-revision
    evidenceDigest: sha256-prefixed-digest
  pressure: low | medium | high | unknown
  source: native-exact | native-estimated | hook-boundary | unavailable
  confidence: exact | estimated | unknown
  windowTokens: nonnegative-integer | null
  usedTokens: nonnegative-integer | null
  remainingTokens: nonnegative-integer | null
  observedAt: timestamp
  expiresAt: timestamp
  evidenceDigest: sha256-prefixed-digest
  revision: positive-integer

providerContextPressureReadV1:
  oneOf:
    - schemaVersion: 1
      currency: current
      pressure: providerContextPressureV1
      readAt: timestamp-at-or-after-observedAt-and-before-expiresAt
      ageSeconds: nonnegative-integer
    - schemaVersion: 1
      currency: stale
      pressure: providerContextPressureV1
      readAt: timestamp-at-or-after-pressure-expiresAt
      ageSeconds: nonnegative-integer
    - schemaVersion: 1
      currency: unavailable
      pressure: null
      readAt: timestamp
      ageSeconds: null

providerContextPressureReadRequestV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  agentId: exact-agent
~~~

`fabric.v1.provider-context-pressure.read` and the scoped operator System
projection accept exact project-session/run/agent scope and return only
`providerContextPressureReadV1`. The record equality-binds the exact lifecycle
observation audit tuple; no orphan or best-effort join is valid. Token values
are all null for unavailable source, which also requires `pressure: unknown`
and `confidence: unknown`. `native-exact` requires exact confidence and three
nonnull token fields satisfying `usedTokens + remainingTokens = windowTokens`;
`native-estimated` requires estimated confidence and the same nonnull arithmetic.
`hook-boundary` requires exact or estimated confidence; its token triple is all
null or all nonnull with the same arithmetic. Unknown confidence requires
unknown pressure. `expiresAt` is later than `observedAt`.
`ageSeconds` and stale currency derive at the read snapshot from
`readAt`, `observedAt` and `expiresAt`; age is the nonnegative whole-second
difference between read and observation time. Reads never mutate a row and never expose
a percentage. This record reserves no spend, grants no authority and triggers
no lifecycle action.

Section 32.20 remains the only lifecycle authority. A policy-required rotation
starts a genuinely fresh provider context and injects only the bounded,
daemon-validated checkpoint/handoff. Same-history attach/resume is crash
recovery only. Checkpoint identity binds canonical task, authority, lease,
mailbox, child, open-work, evidence, artifact and repository revisions already
owned by lifecycle custody; model narrative may describe but cannot author
those values. Parent rotation never implies child rotation, completion or
identity. A native child is independent only when the adapter provides the
stable identity mapping required by the existing child-custody contracts;
otherwise its native graph remains one opaque bounded task. Automatic pressure
thresholds, hysteresis, maximum compaction counts and successor selection are
explicitly outside this amendment.

Coordination topology planning has one closed, revisioned advisory record:

~~~yaml
topologyWavePlanRefV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  taskId: exact-coordination-root-task
  waveId: stable-wave-id
  waveRevision: positive-integer
  planDigest: sha256-prefixed-digest

topologyWavePlanV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  taskId: exact-coordination-root-task
  waveId: stable-wave-id
  waveRevision: positive-contiguous-integer
  predecessor: topologyWavePlanRefV1 | null
  dependencies:
    - dependencyTaskId: exact-task
      requiredState: ready | completed
      evidenceRef: exact-existing-task-or-evidence-ref
  decomposability:
    kind: atomic | decomposable | conditionally-decomposable
    evidenceRef: exact-existing-evidence-ref
  topology:
    executionShape: single-owner | fabric-explicit | host-native
    mode: serial | parallel | fan-out-fan-in | dynamic
    maximumConcurrentAgents: positive-integer
  chair:
    agentId: exact-current-chair
    principalGeneration: positive-integer
    chairLeaseGeneration: positive-integer
  stageOwners:
    - stageId: stable-stage-id
      taskId: exact-task
      ownerAgentId: exact-agent
      writePartitionId: stable-partition-id | null
  writePartitions:
    - partitionId: stable-partition-id
      ownerAgentId: exact-stage-owner-agent
      mode: exclusive-write | shared-read
      pathSetDigest: sha256-prefixed-digest
      authorityRef: exact-existing-authority-ref
  contention:
    mode: none | serialized | disjoint-partitions
    serializationOwnerAgentId: exact-agent | null
    evidenceRef: exact-existing-evidence-ref
  budget:
    providerTurns: nonnegative-integer
    toolCalls: nonnegative-integer
    wallClockSeconds: nonnegative-integer
    maximumParallelAgents: positive-integer
  stopConditions:
    - conditionId: stable-id
      kind: objective-complete | gate-failed | budget-exhausted | human-gate
      predicateRef: exact-existing-policy-or-gate-ref
  authority:
    authorityRevision: positive-integer
    authorityRef: exact-existing-run-authority-ref
    authorityDigest: sha256-prefixed-digest
  policy:
    policyRevision: positive-integer
    policyRef: exact-existing-coordination-policy-ref
    policyDigest: sha256-prefixed-digest
  state: proposed | approved | started | completed | superseded | cancelled
  rationaleRef: exact-registered-evidence-artifact-ref
  createdAt: timestamp
  planDigest: sha256-prefixed-digest

topologyWavePlanCurrentV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  taskId: exact-coordination-root-task
  waveId: stable-wave-id
  waveRevision: positive-integer
  planDigest: sha256-prefixed-digest
  revision: positive-CAS-revision

topologyWavePlanInputV1:
  schemaVersion: 1
  taskId: exact-coordination-root-task
  waveId: stable-wave-id
  dependencies: exact-topologyWavePlanV1-dependencies
  decomposability: exact-topologyWavePlanV1-decomposability
  topology: exact-topologyWavePlanV1-topology
  stageOwners: exact-topologyWavePlanV1-stageOwners
  writePartitions: exact-topologyWavePlanV1-writePartitions
  contention: exact-topologyWavePlanV1-contention
  budget: exact-topologyWavePlanV1-budget
  stopConditions: exact-topologyWavePlanV1-stopConditions
  state: proposed | approved | started | completed | superseded | cancelled
  rationaleRef: exact-registered-evidence-artifact-ref

topologyWaveAppendRequestV1:
  schemaVersion: 1
  commandId: stable-command-id
  projectSessionId: exact-session
  coordinationRunId: exact-run
  expectedCurrent:
    oneOf:
      - kind: none
        expectedPointerRevision: 0
      - kind: current
        planRef: topologyWavePlanRefV1
        expectedPointerRevision: positive-CAS-revision
  plan: topologyWavePlanInputV1

topologyWaveAppendReceiptV1:
  schemaVersion: 1
  commandId: exact-command-id
  status: appended
  priorPlanRef: topologyWavePlanRefV1 | null
  planRef: topologyWavePlanRefV1
  pointer: topologyWavePlanCurrentV1
  receiptDigest: sha256-prefixed-digest

topologyWaveCurrentReadRequestV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  taskId: exact-coordination-root-task

topologyWaveCurrentReadV1:
  oneOf:
    - schemaVersion: 1
      currency: current
      plan: topologyWavePlanV1
      pointer: topologyWavePlanCurrentV1
    - schemaVersion: 1
      currency: stale
      plan: topologyWavePlanV1
      pointer: topologyWavePlanCurrentV1
    - schemaVersion: 1
      currency: unavailable
      plan: null
      pointer: null

topologyWaveListRequestV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  taskId: exact-coordination-root-task
  pageSize: positive-integer-at-most-200
  cursor: opaque-scope-and-watermark-bound-cursor | null

topologyWaveListV1:
  schemaVersion: 1
  plans: ordered-topologyWavePlanV1-array
  nextCursor: opaque-scope-and-watermark-bound-cursor | null
  watermarkRevision: nonnegative-integer
~~~

All arrays are canonically sorted and duplicate-free; dependencies,
stageOwners, writePartitions and stopConditions are nonempty where their mode
requires them. `planDigest` is SHA-256 of RFC 8785 JCS of the complete plan with
only `planDigest` omitted. Every change, state advance or rationale change
appends the next wave revision and advances the sole current pointer by CAS;
plans and rationale artifacts are immutable. A successor equality-binds its
predecessor, run/task, existing authority/policy refs and their current revisions
at append. It cannot mint authority, expand a write partition, change the one
coordination chair or choose agents automatically.

`fabric.v1.topology-wave.append` is the sole public mutation. It requires the
current chair capability for the exact session/run and accepts only the closed
request above. The daemon derives project/run, contiguous wave revision,
current chair binding, current authority/policy tuples, `createdAt` and
`planDigest`; none is caller-authored.
The `none` arm is legal only when no pointer exists and revision is zero. The
`current` arm must equality-match the pointed ref and revision. One transaction
derives plan predecessor as null for `none` or exactly the current arm's
`planRef`; the caller cannot author or fork it. It validates task/dependency/
owner/write authority, inserts the next immutable plan,
CAS-advances the pointer and records the receipt. Exact command replay returns
that receipt before current-state checks; changed replay or pointer conflict
mutates nothing. `receiptDigest` is SHA-256 of exact receipt JCS with only that
field omitted. This operation is for the chair/harness, not the Console.

`fabric.v1.topology-wave.current.read` accepts exact project-session/run/task
scope in `topologyWaveCurrentReadRequestV1` and returns only
`topologyWaveCurrentReadV1`; `fabric.v1.topology-wave.list` accepts/returns the
closed list pair above in stable plan-digest order. A plan is read-derived stale
when its authority, policy, chair binding or dependency is no longer current,
or when its immutable predecessor chain is missing, noncontiguous or digest-
invalid. A predecessor is historical by definition and need not be the current
pointer; an exact intact immediately preceding revision/wave link does not make
its successor stale. The current/stale arms require plan and pointer to equality-
bind the same exact row; absent pointer requires the unavailable/null arm. Reads
never rewrite plan state. Console uses this same current
projection before a wave starts and keeps stale plans visible; no Console-only
planner, second authority ledger or automatic topology policy exists.

The fabric may export privacy-minimised `fabricOperationalSpanV1` rows:

~~~yaml
fabricOperationalSpanV1:
  schemaVersion: 1
  spanId: stable-id
  parentSpanId: stable-id | null
  runId: exact-run-id
  taskId: exact-task-id | null
  agentId: exact-agent-id | null
  actionRef: ProviderActionRefV1 | null
  routeAdmissionDigest: sha256-prefixed-digest | null
  operation: exact-registered-operation
  status: ok | error | cancelled | unknown
  durationMs: nonnegative-integer
  inputTokens: nonnegative-integer | null
  outputTokens: nonnegative-integer | null
  retryCount: nonnegative-integer
  errorCode: exact-safe-code | null
  observedAt: timestamp
~~~

Spans contain no prompt, answer, tool argument/result, artifact bytes, private
message, capability or absolute path. Generic telemetry is operational evidence
only; the richer receipt remains authoritative for authority, disclosure,
reviewer relation, gates and artifact evidence. Conformance tests cover closed
codec and unknown-enum rejection; exact non-self-referential discovery-manifest
bytes/digest/registration equality; snapshot expiry and identical-body refresh;
body/permission/surface drift before effect; raw/normalised round-trip and honest
unknown versus observed-null native mode; actual review-route proof/mismatch and
observed effort/native mismatch with adverse-finding retention; ambiguous-action
non-rerouting; context-pressure audit joins/discriminated stale read/cross-arm
rejection/no-percentage; topology append/CAS/discriminated currency/predecessor-
chain/authority fencing; fresh rotation versus same-history recovery;
independent child custody;
and content-free telemetry.

Requirements:

- **FR-077:** Fabric shall persist every activated adapter capability snapshot
  with one closed source/capability-kind discriminator and shall reject an
  expired, unavailable or incompatible snapshot before provider I/O.
- **FR-078:** Every task-bound answer-bearing provider action shall bind one
  immutable deployed-route admission; every dispatch, observation and review-
  evidence child shall equality-bind the same canonical action pair and
  admission digest.
- **FR-079:** Answer-bearing admission shall create its pair preflight,
  applicable finding reservation, provider action and route in immediate-parent
  order in one transaction; no route child shall precede its action or
  reservation parent.
- **FR-080:** Effective configurations for smoke and provider-action subjects
  shall bind a same-adapter activation-subject parent; an activation subject
  shall have no activation parent.
- **FR-081:** Fresh provider-context adoption shall atomically remove the prior
  current pressure projection before changing the active adapter binding; only
  a successor observation may repopulate it.
- **FR-082:** `GenericProviderRouteRecoveryService` shall exclusively own every
  otherwise-generic answer-bearing action with unresolved effect or missing/
  integrity-failed route, after lifecycle, launch and certifying exclusions,
  without reroute, redispatch or certifying-identity borrowing.
- **NFR-034:** Generated TypeScript, Python and SQLite contracts shall reject
  unknown capability sources, source/kind mismatch, null-skipped activation
  parents and crossed route admission/configuration identities.
- **NFR-035:** Context pressure and operational spans shall remain
  non-authoritative, content-free operational evidence and shall grant or
  consume no provider, lifecycle or coordination authority.

Acceptance additionally requires:

- **AC-056:** capability/configuration fixtures accept each legal source/kind
  and subject arm, and reject an unknown source, source/kind crossing, null or
  half-null required activation parent, cross-adapter parent and non-activation
  parent.
- **AC-057:** immediate-FK fixtures prove preflight/reservation/action/route/
  dispatch/observation/evidence parent order and reject route-before-action,
  route-before-reservation, pair-A/admission-B and pair-A/configuration-B rows.
- **AC-058:** pressure/adoption crash fixtures expose only complete old-binding+
  old-pressure or new-binding+unavailable-pressure states, retain immutable
  audit history and reject an old-generation callback after adoption.
- **AC-059:** generic-route recovery fixtures prove exclusive owner selection,
  pair-keyed lookup only, no reroute/redispatch and truthful missing/integrity-
  failed list/read arms; certifying, lifecycle and launch actions never enter
  that owner.
