
### 32.19 Admission-bound provider routes and certifying review

This amendment closes the current Spec 05 review path. It does not add a
continuity router, automatic context-pressure controller, Pareto selector,
native-routing mode or capability-snapshot policy. The existing trusted model
router remains a structural resolver; Fabric owns review currency, immutable
source custody and certification.

#### 32.19.1 Publication-time publisher custody

Every artifact registration receives one immutable publication-lineage
snapshot in the registration transaction. For an agent publisher, the only
proved provider join is:

~~~text
authenticated publishing agent + principal generation
  -> one current active retained bridge generation
  -> one immutable active provider-session lineage
       -> launched-chair bridge + project-session launch custody
       or retained-child bridge + provider-agent custody
  -> exact provider-session generation
  -> activated adapter ID/contract + admitted family/model + route when owned
~~~

The daemon derives the bridge and action from the authenticated connection.
The publish request carries no custody, family, model, route or independence
claim. The complete closed snapshot is:

~~~yaml
artifactPublicationLineageV1:
  schemaVersion: 1
  artifactId: exact-registration
  artifactRevision: positive-publication-revision
  publisherKind: agent-or-operator-or-fabric-or-project
  publisherRef: exact-registration-publisher
  publisherAgentId: null-or-exact-agent
  publisherPrincipalGeneration: null-or-positive-generation
  publisherBridgeGeneration: null-or-positive-active-generation
  providerCustodyRef:
    oneOf:
      - null
      - ownerKind: launched-chair-or-retained-child
        adapterId: exact-activated-adapter
        actionId: exact-provider-agent-custody-action
        providerSessionGeneration: positive-generation
        adapterContractDigest: sha256-prefixed-digest
        routeReceiptDigest: null-or-sha256-prefixed-owned-route
        modelFamily: canonical-family
        model: exact-admitted-model
  state: proved-or-unproved
  reason: proved-or-non-agent-or-no-active-bridge-or-no-session-lineage-or-ambiguous-session-lineage-or-crossed-generation
  lineageDigest: sha256-prefixed-canonical-snapshot-digest
~~~

A proved row requires one exact same-run, same-agent,
same-principal-generation and same-provider-session join. Chair activation
writes its session-lineage row from launched-chair bridge plus launch custody;
child activation writes the same closed row from retained-child bridge plus
provider-agent custody. Adapter contract, family and model are mandatory. Route
digest is mandatory only when that custody owns a route and is otherwise null;
reviewer-family eligibility requires proved family, not an invented route. Zero, multiple,
stale or crossed joins are unproved. Later bridge rotation, provider action,
route, registry revision or artifact-kind change cannot rewrite the snapshot.

A certifying Spec 05 target is eligible only when its root evidence registration
is an agent-published project-file or run-file of kind
implementation-delivery-manifest.v1, its lineage is proved, and its publisher
family equals the target chair family. Operator-, Fabric- and project-published
artifacts and git-private-diff registrations retain honest unproved lineage.
They may be covered objects in a review bundle but cannot be the root target.

#### 32.19.2 Complete review bundle and current target

Fabric owns a separate accepted requirement projection; delivery-run v1 is not
silently extended. `fabric.v1.delivery-requirement-map.seal` is its sole
producer and only the authenticated current chair may invoke it. The request is
an optimistic lock, not content selection:

~~~yaml
deliveryRequirementMapSealRequestV1:
  schemaVersion: 1
  commandId: stable-command-id
  projectSessionId: exact-project-session
  coordinationRunId: exact-coordination-run
  deliveryRunId: exact-delivery-run
  expectedMapGeneration: zero-or-positive-current-generation
  expectedAcceptedScopeRevision: positive-current-revision
  expectedCatalogueDigest: sha256-prefixed-current-checked-in-digest
~~~

`expectedMapGeneration` is zero iff none exists and otherwise equals the one
current generation; every wrong zero/positive/current combination conflicts
before derivation. From the active accepted scope and checked-in
`spec05-delivery-requirements.v1` catalogue, the daemon produces:

~~~yaml
spec05DeliveryRequirementsV1:
  schemaVersion: 1
  catalogueId: spec05-delivery-requirements-v1
  entries:
    - requirementId: exact-stable-binding-id
      sourceRole: spec-or-adr-or-decision
      sourceRef: exact-registered-source-identity
      evidenceSelectors:
        - role: accepted-scope-or-test-or-evaluation-or-load-or-migration-or-generated-contract-or-gate-decision
          registryKind: exact-closed-evidence-kind
          selectorId: exact-check/evaluation/gate/profile-owned-id
          cardinality: exactly-one-or-complete-nonempty-current-set
          requiredStatus: pass-or-approved

deliveryRequirementMapV1:
  schemaVersion: 1
  artifactKind: delivery-requirement-map.v1
  projectSessionId: exact-project-session
  coordinationRunId: exact-coordination-run
  deliveryRunId: exact-delivery-run
  mapGeneration: positive-generation
  closureDigest: sha256-prefixed-generation-free-map-closure-digest
  catalogueDigest: sha256-prefixed-checked-in-catalogue-digest
  acceptedScope:
    artifactRef: exact-active-scope-registration
    artifactRevision: positive-revision
    contentDigest: sha256-prefixed-digest
  bindingSources:
    - role: spec-or-adr-or-decision
      artifactRef: exact-active-registration
      artifactRevision: positive-revision
      contentDigest: sha256-prefixed-digest
      requirementIds: ordered-unique-binding-ids
  requirements:
    - requirementId: exact-catalogue-id
      sourceRef: exact-binding-source
      disposition: proved
      evidenceRefs: ordered-exact-registration/revision/digest-records
~~~

Every checked-in binding ID appears exactly once, every listed source ID is
catalogued and each entry has at least one selector. Selectors match immutable registry kind plus the exact owning check,
evaluation, gate or profile ID; they never parse prose, path globs or caller
labels. `exactly-one` rejects zero/multiple current rows;
`complete-nonempty-current-set` rejects zero and sorts every current same-source row by registration/
revision/digest. `proved` requires every selector at its required status and
current source-state digest. Final human acceptance/release is not a pre-review
requirement and is excluded, rather than represented as pending technical work.
Phase A captures catalogue/scope/source/evidence revisions; phase B equality-
CASes all of them. The daemon rejects missing/extra/duplicate IDs, stale rows or
unproved evidence and registers immutable content; caller-authored entries are
unavailable. Stable single-flight is keyed by run/delivery run before phase A.
Exact command replay returns its immutable result and changed replay conflicts;
different commands serialize. Before allocating a generation, the daemon
computes `closureDigest` as SHA-256 over RFC 8785 JCS of the complete prospective
deliveryRequirementMapV1 with only `mapGeneration` and `closureDigest` omitted.
An equal current closure digest returns that existing bytes/registration/
generation without inserting or superseding anything. A changed catalogue,
accepted-scope/binding-source or selected evidence closure allocates exactly
current generation plus one and then hashes/registers the complete map. An
arbitrary command ID cannot churn current state or stale a completed review
basis. Manifest seal consumes the one current map and embeds its complete
source/requirement projection.

`fabric.v1.implementation-delivery.seal` is the sole producer of the eligible
root. Its request is exactly command ID, project-session/run/delivery-run IDs,
expected coordination/checkpoint generation and expected current full HEAD as
an optimistic lock. It accepts no path, artifact bytes, Git base, evidence
role/list, summary, bundle/profile/provider field, gate snapshot or publication
lineage. The daemon derives HEAD again and produces/registers these closed bytes
on behalf of the authenticated current chair:

~~~yaml
implementationDeliverySealRequestV1:
  schemaVersion: 1
  commandId: stable-command-id
  projectSessionId: exact-project-session
  coordinationRunId: exact-coordination-run
  deliveryRunId: exact-delivery-run
  expectedCoordinationRevision: positive-revision
  expectedCheckpointGeneration: positive-generation
  expectedHeadObjectId: full-current-object-id-optimistic-lock

implementationDeliveryManifestV1:
  schemaVersion: 1
  artifactKind: implementation-delivery-manifest.v1
  projectSessionId: exact-project-session
  coordinationRunId: exact-coordination-run
  deliveryRunId: exact-delivery-run
  sealGeneration: positive-generation
  profile:
    profileId: spec05-four-slot-v1
    profileSchemaDigest: sha256-prefixed-digest
    riskTier: exact-current-risk-tier
  acceptedScope:
    artifactRef: exact-active-scope-registration
    artifactRevision: positive-revision
    contentDigest: sha256-prefixed-digest
  bindingSources:
    - role: spec-or-adr-or-decision
      artifactRef: exact-active-registration
      artifactRevision: positive-revision
      contentDigest: sha256-prefixed-digest
  requirementMap:
    - requirementId: exact-binding-id
      sourceRef: exact-binding-source
      disposition: proved
      evidenceRefs: ordered-exact-registration/revision/digest-records
  preReviewEvidence:
    - role: test-or-evaluation-or-load-or-migration-or-generated-contract
      evidenceRef: exact-current-registration
      evidenceRevision: positive-revision
      contentDigest: sha256-prefixed-digest
      status: pass
  repository:
    objectFormat: exact-format
    baseObjectId: full-approved-run-start-object-id
    headObjectId: full-object-id
    headTreeId: full-object-id
    indexTreeId: exact-head-tree-id
    worktreeState: clean
    sourceStateDigest: sha256-prefixed-digest
  coordinationGateSnapshot:
    artifactRef: exact-snapshot-registration
    snapshotGeneration: positive-generation
    contentDigest: sha256-prefixed-digest
  requirementMapDigest: sha256-prefixed-complete-map-digest
  evidenceClosureDigest: sha256-prefixed-complete-closure-digest
~~~

These load-bearing digests have exact RFC 8785 JCS preimages:

~~~yaml
deliveryEvidenceClosureV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  deliveryRunId: exact-delivery-run
  entries:
    - role: accepted-scope-or-binding-source-or-requirement-map-or-test-or-evaluation-or-load-or-migration-or-generated-contract-or-gate-decision-or-coordination-gate-snapshot
      evidenceRef: exact-registration
      evidenceRevision: positive-revision
      contentDigest: sha256-prefixed-digest
      status: pass-or-approved-or-current

repositorySourceStateV1:
  schemaVersion: 1
  objectFormat: exact-format
  baseObjectId: full-approved-run-start-object-id
  headObjectId: full-object-id
  headTreeId: full-object-id
  indexTreeId: exact-head-tree-id
  worktreeState: clean
~~~

`requirementMapDigest` is SHA-256 of the exact stored RFC 8785 JCS bytes of
`deliveryRequirementMapV1`, including its generation and generation-free
`closureDigest`. `evidenceClosureDigest` is SHA-256 of exact
`deliveryEvidenceClosureV1` bytes. `sourceStateDigest` is SHA-256 of exact
`repositorySourceStateV1` bytes. Evidence-closure entries sort uniquely by
role rank, `evidenceRef`, revision and content digest. Requirement-map binding
sources sort uniquely by role rank, artifact ref and revision; requirements
sort by `requirementId`; each requirement's evidence refs sort uniquely by
evidence ref, revision and digest. The manifest equality-copies these three
digests. Its requirement-map object and every evidence-closure entry must
byte-equal the exact registered content they hash; there is no path/name-based
substitution.

The manifest contains neither its own registration/digest nor the review-basis
row/digest that will bind it; those are seal results, avoiding a hash cycle. It
also contains no mutable/final RUN receipt reference. The immutable
`delivery_run_start` row is created from approved launch/run authority before
implementation and owns the Git base. For AFAB-004 it is
`c2fc623a2529f87feca27982e1a140969ab5a258`; neither caller nor seal may replace
it with a merge base, current ancestor or shorter range. A different delivery
run uses its own approved immutable run-start row.

The current Fabric-owned deliveryRequirementMapV1, not mutable RUN.json or
Markdown discovery, is the completeness root. Every binding requirement occurs
exactly once. The resolved
profile adds required scope/spec/ADR/decision sources and security/profile
checks; the closure unions all referenced evidence plus completed test,
evaluation, load, migration, generated-contract and coordination-snapshot
evidence. Each resolves to exactly one active registration/revision/digest.
Missing, duplicate, pending pre-review or failed evidence prevents seal; extra
caller-selected evidence is impossible. Lists sort by their displayed keys and
byte content de-duplicates only by digest.

The coordination snapshot is not a Fabric receipt:

~~~yaml
coordinationGateSnapshotV1:
  schemaVersion: 1
  artifactKind: coordination-gate-snapshot.v1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  deliveryRunId: exact-delivery-run
  snapshotGeneration: positive-generation
  eventWatermark: nonnegative-committed-sequence
  chair:
    agentId: exact-current-chair
    principalGeneration: positive-generation
    chairLeaseGeneration: positive-generation
    bridgeGeneration: positive-generation
  authorityDigest: sha256-prefixed-digest
  sessionRevision: positive-revision
  runRevision: positive-revision
  membershipRevision: positive-revision
  acceptedScopeDigest: sha256-prefixed-digest
  requirementMapDigest: sha256-prefixed-digest
  requiredGateRows:
    - gateId: exact-id
      gateRevision: positive-revision
      state: approved-or-not-applicable
      decisionDigest: sha256-prefixed-digest
      evidenceDigests: ordered-sha256-digests
      dependencyDigest: sha256-prefixed-digest
      blockedOperations: ordered-closed-operation-ids
  objectiveEvidenceRows:
    - role: test-or-evaluation-or-load-or-migration-or-generated-contract
      evidenceRef: exact-registration/revision
      status: pass
      contentDigest: sha256-prefixed-digest
  openPreReviewBlockers: empty
~~~

The daemon-internal `fabric.internal.coordination-gate-snapshot.seal` derives
that artifact at the seal watermark. It excludes every review target/route/
action, slot head, review evidence/completion/recovery, RUN review section,
human final acceptance/release, final Fabric receipt and volatile/in-flight
checkpoint state. Phase A captures chair principal/lease/bridge/session
lineage, run start, delivery RUN/scope/map, authority/gates/evidence/artifact
revisions, profile and Git tokens. Outside SQLite, no-follow readers hash and
validate the exhaustive closure and clean Git state, then create-exclusive,
fsync and re-read the snapshot/manifest bytes. Phase B reauthenticates and
equality-CASes every captured row/token, then atomically inserts snapshot,
manifest registration with agent publication lineage, delivery review basis
and command receipt. Producer kind is `fabric-seal`; publisher remains the
authenticated chair. CAS failure inserts no database row; unreferenced CAS
bytes are run-owned GC candidates.

Replay and stable single-flight key run/delivery-run before phase A. Exact
replay returns immutable manifest/snapshot refs and digests, publication-
lineage digest, review-basis revision/digest and repository source-state digest;
changed input conflicts and different commands serialize. Source/head/index/
worktree, scope/map/profile, required evidence, gate/check, chair lineage or
registration revision change makes the sealed basis logically stale. Only a
new seal supersedes it; history is immutable. The closed artifact-kind catalogue
therefore contains explicit delivery-requirement-map.v1,
implementation-delivery-manifest.v1, coordination-gate-snapshot.v1 and
discovery-surface.v1 entries. The first three are owned by `fabric-seal`;
discovery-surface.v1 is owned only by the section 32.21 daemon renderer.
Eligibility is never inferred by parsing generic receipt JSON.

The current chair requests target preparation with
`fabric.v1.review-target.prepare` under provider-review-evidence.v1. This public
operation is durable asynchronous admission, not bundle construction. It
performs only bounded authentication, current-row/profile-capability checks,
idempotency classification, high-water reservation and SQLite writes, and
returns an immutable accepted receipt before the 30-second protocol deadline.
It performs no Git/evidence/CAS file read and no provider or network I/O.
`expectedTargetGeneration` is `0` only when the run has no target and otherwise
is the exact positive current generation. Zero with an existing target,
positive with none, or a stale positive value conflicts.

~~~yaml
reviewTargetPrepareV1:
  schemaVersion: 1
  commandId: stable-command-id
  taskId: exact-current-review-task
  expectedTargetGeneration: zero-or-positive-current-generation
  deliveryManifestRef: exact-current-implementation-delivery-manifest.v1-revision
~~~

It accepts no
summary, changed-file list, packet bytes, provider identity, route, prompt,
profile override or lineage assertion.

The accepted result is closed:

~~~yaml
reviewTargetPreparationAcceptedV1:
  schemaVersion: 1
  preparationId: daemon-generated-stable-id
  ownerCommandId: first-admitted-command-id
  inputDigest: sha256-prefixed-digest-of-run/actor/full-request
  projectSessionId: exact-session
  coordinationRunId: exact-run
  taskId: exact-review-task
  expectedTargetGeneration: zero-or-positive-generation
  reservedTargetGeneration: positive-never-reused-high-water-generation
  reservedBundleGeneration: positive-never-reused-high-water-generation
  deliveryManifestRef: exact-artifact-revision
  state: prepared
  acceptedReceiptDigest: sha256-prefixed-canonical-result-digest
~~~

One active preparation may exist per run. The global command replay check runs
first: exact replay returns its committed result and changed replay conflicts.
For another command, the stable run-scoped semantic key is the canonical input
digest with command ID omitted. The same digest joins the active preparation
and records a command result pointing to the same accepted receipt; a different
digest returns `REVIEW_TARGET_PREPARATION_CONFLICT`. No conflicting request
invokes a filesystem reader or allocates a generation. The acceptance
transaction increments `review_target_preparation_high_water`, inserts the
immutable preparation with its complete captured database preconditions and
reserves both target and bundle generations. A failed, conflicted or abandoned
build never returns either generation to the allocator.

`fabric.v1.review-target-preparation.read` remains the per-ID public progress
read. Section 32.22's `fabric.v1.review-target-preparation.current.read` is the
sole high-water locator and reuses this exact nested progress codec. The per-ID
read accepts this closed request; no revision sentinel is needed for the first
or later poll:

~~~yaml
reviewTargetPreparationReadRequestV1:
  schemaVersion: 1
  projectSessionId: exact-session
  coordinationRunId: exact-run
  preparationId: exact-preparation

reviewTargetPreparationReadErrorV1:
  schemaVersion: 1
  code: REVIEW_TARGET_PREPARATION_NOT_FOUND-or-AUTHORITY_DENIED-or-SCOPE_MISMATCH-or-INTEGRITY_FAILURE
~~~

The daemon authenticates the caller's exact session/run scope and returns the
accepted receipt plus exactly one current state:

~~~yaml
reviewTargetPreparationReadV1:
  schemaVersion: 1
  accepted: reviewTargetPreparationAcceptedV1
  revision: positive-CAS-revision
  state: prepared-or-building-or-built-or-succeeded-or-conflicted-or-failed
  phase: Preparing-or-Building-or-Committing-or-Succeeded-or-Conflicted-or-Failed
  progress:
    oneOf:
      - kind: phase-only
      - kind: finite
        unit: verified-build-items
        completed: nonnegative-integer
        total: positive-integer
        planDigest: sha256-prefixed-immutable-build-plan-digest
  terminal:
    oneOf:
      - null
      - kind: succeeded
        targetRef: exact-review-target-generation
      - kind: conflicted
        code: target-generation-changed-or-chair-binding-changed-or-task-or-authority-changed-or-delivery-basis-changed-or-repository-source-changed-or-profile-changed-or-predecessor-head-changed-or-predecessor-action-nonterminal
        evidenceDigest: sha256-prefixed-digest
      - kind: failed
        code: bundle-too-large-or-unsupported-repository-state-or-source-read-failed-or-content-integrity-failed-or-certifying-capability-unavailable
        evidenceDigest: sha256-prefixed-digest
~~~

`prepared`, `building` and `built` map respectively to Preparing, Building and
Committing. The only state edges are `prepared -> building`, `building ->
built|failed` and `built -> succeeded|conflicted|failed`; terminal states are
immutable. `targetRef` is non-null exactly for succeeded. A terminal code and
evidence digest exist only in their closed conflicted/failed arms. Nonterminal
states require terminal null; each terminal state requires its same-kind arm.
`phase-only` is always legal. A worker may select `finite` only after it has
persisted the complete build plan: `total` and `planDigest` then remain
immutable, `completed` is monotonic and advances only after each declared item
is written, fsynced and re-read successfully. It cannot downgrade to phase-
only. Built/succeeded require `completed=total` if finite was selected. The
Console renders only the phase or exact `completed/total verified build items`,
never a percentage or ETA.

A bounded daemon worker claims one preparation by a generation-bearing lease,
then resolves the manifest to one sealed delivery review basis. That basis
binds the delivery run, accepted scope, requirement/acceptance mapping,
required pre-review checks and evidence, and a clean canonical Git state:
repository/object format, base object, head object, head tree, index tree,
worktree-clean marker and their canonical source-state digest. Review evidence
itself does not advance the review-basis revision. Any source, base/head,
index/worktree, accepted-scope, required-check, evaluation, load or pre-review
evidence change does.

From the trusted Git and evidence services, that worker constructs the complete
closed review-bundle.v1. The caller cannot omit an entry. The manifest contains:

~~~yaml
reviewBundleBodyV1:
  schemaVersion: 1
  bundleGeneration: positive-run-generation
  delivery:
    deliveryRunId: exact-run
    reviewBasisRevision: positive-revision
    reviewBasisDigest: sha256-prefixed-digest
    deliveryManifestRef: exact-eligible-artifact
    deliveryManifestObjectDigest: sha256-prefixed-bundle-object
    deliveryRequirementMapObjectDigest: sha256-prefixed-bundle-object
  repository:
    objectFormat: exact-registered-format
    baseObjectId: full-object-id
    headObjectId: full-object-id
    headTreeId: full-object-id
    indexTreeId: exact-head-tree-id
    worktreeState: clean
    sourceStateDigest: sha256-prefixed-digest
    reviewDiffCodecDigest: sha256-prefixed-checked-in-codec-digest
    reviewDiffRulesDigest: sha256-prefixed-checked-in-rules-digest
    reviewDiffSetDigest: sha256-prefixed-complete-diff-set-digest
  changedFiles:
    - ordinal: contiguous-zero-based-integer
      path: canonical-relative-path
      status: added-or-modified-or-deleted-or-renamed-or-mode-changed
      oldPath: null-or-canonical-relative-path
      beforeMode: null-or-100644-or-100755-or-120000-or-160000
      afterMode: null-or-100644-or-100755-or-120000-or-160000
      beforeObjectDigest: null-or-sha256-prefixed-bundle-object
      afterObjectDigest: null-or-sha256-prefixed-bundle-object
      diffObjectDigest: sha256-prefixed-bundle-object
  requiredEvidence:
    - ordinal: contiguous-zero-based-integer
      role: delivery-manifest-or-delivery-requirement-map-or-accepted-scope-or-spec-or-adr-or-decision-or-test-or-evaluation-or-load-or-migration-or-generated-contract-or-coordination-gate-snapshot
      evidenceRef: exact-current-registration
      evidenceRevision: positive-revision
      registeredContentDigest: sha256-prefixed-digest
      objectDigest: sha256-prefixed-bundle-object
  carriedFindingSet:
    findingSetDigest: sha256-prefixed-reviewFindingSetV1-digest
    findingCount: nonnegative-integer
    pages:
      - ordinal: contiguous-zero-based-integer
        pageDigest: sha256-prefixed-reviewFindingPageV1-digest
        memberCount: positive-integer
        firstFindingDigest: sha256-prefixed-digest
        lastFindingDigest: sha256-prefixed-digest
  objects:
    - ordinal: contiguous-zero-based-integer
      objectDigest: sha256-prefixed-exact-object-bytes
      mediaType: reviewBundleMediaTypeV1
      byteLength: nonnegative-integer
      chunkDigests: ordered-sha256-digests
  bundleSearchIndexDigest: sha256-prefixed-immutable-index
  riskReadMapDigest: sha256-prefixed-checked-in-rules/output
  coverageDigest: sha256-prefixed-canonical-delivery-repository-coverage-digest

reviewFindingPageV1:
  schemaVersion: 1
  members: ordered-nonempty-safeFinding-records

reviewFindingSetV1:
  schemaVersion: 1
  findingCount: nonnegative-integer
  pages:
    - ordinal: contiguous-zero-based-integer
      pageDigest: sha256-prefixed-exact-reviewFindingPageV1-bytes
      memberCount: positive-integer
      firstFindingDigest: sha256-prefixed-digest
      lastFindingDigest: sha256-prefixed-digest

reviewBundleRootV1:
  schemaVersion: 1
  bodyMediaType: application/vnd.agent-fabric.review-bundle-body.v1+json
  bodyByteLength: positive-bounded-count
  manifestBodyDigest: sha256-prefixed-exact-reviewBundleBodyV1-bytes
  coverageDigest: sha256-prefixed-body-equal-digest
  pages:
    - ordinal: contiguous-zero-based-integer
      pageDigest: sha256-prefixed-exact-page-bytes
      byteLength: positive-count-at-most-65536

reviewBundleRefV1:
  schemaVersion: 1
  bundleGeneration: positive-run-generation
  manifestBodyDigest: sha256-prefixed-digest
  manifestRootDigest: sha256-prefixed-exact-reviewBundleRootV1-bytes
  coverageDigest: sha256-prefixed-body/root-equal-digest
  bundleSearchIndexDigest: sha256-prefixed-body-equal-digest
  riskReadMapDigest: sha256-prefixed-body-equal-digest
  mandatoryReadSetDigest: sha256-prefixed-root/pages/specs/gates/findings/risk-sample-set
  mandatoryReadCount: positive-bounded-count
  mandatoryReadBytes: positive-bounded-canonical-wire-bytes
~~~

`coverageDigest` is SHA-256 of RFC 8785 JCS of
`reviewBundleCoverageV1 {schemaVersion:1, repository:{objectFormat,
baseObjectId,headObjectId,reviewDiffCodecDigest,reviewDiffRulesDigest,
reviewDiffSetDigest}, changedFiles:[the complete body changed-file records],
requiredEvidence:[the complete body evidence records], carriedFindingSet:the
complete body finding-set ref, objects:[the complete body object records],
bundleSearchIndexDigest,riskReadMapDigest}`. It contains no coverage, body,
page, root, mandatory-set or bundle digest. `mandatoryReadSetDigest` is SHA-256
of RFC 8785 JCS of
`mandatoryReadSetV1 {schemaVersion:1,entries:[{kind,ordinal,parentDigest,
payloadDigest}]}`. Kinds are exactly `manifest-root`, `manifest-body-page`,
`delivery-manifest`, `delivery-requirement-map`, `required-evidence`,
`finding-set`, `finding-page` and `risk-sample-chunk`; nullable parent digest is
null only for the root. Entries sort uniquely by that rank, parent digest,
ordinal and payload digest.

Every body array uses contiguous zero-based ordinals. Changed files additionally
obey the review-diff order; required evidence sorts by role rank, evidence ref,
revision and object digest; finding pages sort by ordinal with strictly
increasing, nonoverlapping first/last finding-digest ranges; objects sort by
object digest and their ordinal must equal that position. A required evidence
`registeredContentDigest` equals its `objectDigest`. The delivery-manifest and
delivery-requirement-map object digests equal the exact manifest/map registered
content digests, including `requirementMapDigest`; repository source state
equals the manifest's exact `sourceStateDigest`. Coverage/root/ref equality
copies are byte-for-byte, not semantically re-derived variants.

Checked-in golden fixtures freeze each JCS preimage and SHA-256 result plus
body-array permutation negatives. Reordering, duplicated ordinals, duplicate
keys, equal members in different pages, changed media type or any copied-digest
mismatch fails before target commit.

The coordination-gate-snapshot role is the exact immutable artifact defined
above. `fabric-receipt.json` is never an input to a review bundle; its later
export cannot advance or stale the delivery basis or target.

Changed-file coverage is the complete sorted base-to-head Git change set.
Added, deleted, renamed and modified paths include the exact applicable before,
after and deterministic diff objects. Required-evidence coverage is the
complete sorted set derived from the sealed delivery review basis. The daemon
rejects a duplicate, omission, unexpected entry, dirty index/worktree,
unsupported Git state, unavailable object or evidence revision, or any
coverage-digest mismatch. It never substitutes a prose summary or truncated
diff.

`review-diff.v1` is the sole changed-file codec. Its checked-in schema,
canonical rules document and conformance fixture are digest-bound by the
activated review-bundle contract. It reads the two exact committed trees by
full object ID with system/global/repository diff configuration disabled; it
does not consume porcelain text, mutable rename settings or working-tree
bytes. A path is its exact valid UTF-8 Git-tree byte spelling with `/`
separators, no leading/trailing slash, empty/`.`/`..` component, NUL, C0/C1
control, Unicode normalisation or case folding. An unrepresentable path makes
the delivery `unsupported-repository-state` before target commit.

The admitted tree modes are regular `100644`, executable `100755`, symlink
`120000` and gitlink `160000`. Blob and symlink source bytes come from the Git
object database without following a link; a gitlink source is the exact full
object ID encoded as lowercase ASCII. Exact rename detection is codec-owned:
after same-path comparison, deleted and added entries with equal source-object
bytes are grouped by object digest, sorted by old then new UTF-8 path bytes and
paired by ordinal. It performs no similarity heuristic. Remaining entries are
added or deleted. A same-path byte change is `modified`; a same-path mode-only
change is `mode-changed`; a paired path change is `renamed`, including any mode
change. Each arm requires exact before/after object and mode nullability. This
precedence gives every tree delta exactly one arm.

The exact diff object bytes are RFC 8785 JCS of this closed union:

~~~yaml
reviewDiffObjectV1:
  schemaVersion: 1
  status: added-or-modified-or-deleted-or-renamed-or-mode-changed
  path: exact-new-or-deleted-path
  oldPath: nonnull-only-for-renamed
  before:
    oneOf: [null, {mode: exact-git-mode, objectDigest: sha256-prefixed-digest,
      byteLength: nonnegative-integer}]
  after:
    oneOf: [null, {mode: exact-git-mode, objectDigest: sha256-prefixed-digest,
      byteLength: nonnegative-integer}]
  payload:
    oneOf:
      - kind: text-edits
        operations:
          - kind: equal-or-delete-or-insert
            oldStart: nonnegative-line-index
            oldCount: nonnegative-line-count
            newStart: nonnegative-line-index
            newCount: nonnegative-line-count
            segmentDigest: sha256-prefixed-exact-segment-bytes
      - kind: binary-summary
        beforeDigest: null-or-sha256-prefixed-digest
        afterDigest: null-or-sha256-prefixed-digest
        beforeBytes: null-or-nonnegative-integer
        afterBytes: null-or-nonnegative-integer
~~~

Text means a regular blob that is valid strict UTF-8, contains no NUL and is
within the existing per-object bound. Lines retain their LF byte; a final
unterminated line remains one line. The checked-in algorithm is Myers
shortest-edit over exact line bytes with delete-before-insert, then lowest old
index, then lowest new index as tie-breaks. Maximal adjacent operations of one
kind are coalesced; zero-length operations are forbidden. `segmentDigest`
hashes the exact concatenated old bytes for equal/delete and new bytes for
insert. Added/deleted/mode-only text uses the same normal form. Every other
mode/content uses `binary-summary`. `diffObjectDigest` is SHA-256 of the exact
JCS bytes above.

The changed-file array sorts by new/deleted `path` UTF-8 bytes, then status rank
`added, modified, deleted, renamed, mode-changed`, then nullable `oldPath`; it
is unique by that tuple. `reviewDiffSetDigest` hashes RFC 8785 JCS of
`{schemaVersion:1,objectFormat,baseObjectId,headObjectId,codecDigest,rulesDigest,
entries:[the complete ordered changed-file records]}`. No timestamp, Git
version, command output or host path enters a digest domain.

The immutable `review-diff-fixture.v1` manifest binds full base/head object
IDs, object format, codec/rules/source-object-set digests and exact expected
change count, unique object count, total unique object bytes, largest object
bytes and diff-set digest. A fixture is regenerated only by intentionally
selecting a new immutable base/head pair and reviewing the changed manifest;
the final delivery gate never reuses its counts. For sizing only, the pre-codec
enumeration of
`c2fc623a2529f87feca27982e1a140969ab5a258..0a04d161c5d4fa027c96410b3cc0cf887e1c6e42`
observed 601 changes, 1,434 unique objects, 27,766,213 total bytes and a
4,097,314-byte largest object. Those numbers are not a codec oracle or final-
HEAD acceptance threshold. Each target recomputes the dynamic approved
run-start-to-current-head set and applies only the stated count/byte ceilings.

`carriedFindingSet` preserves every complete immutable safe record from the
predecessor slot heads. The set root and all pages are content-addressed bundle
objects and mandatory reads; an opaque digest, count-only summary or truncated
prefix is insufficient. A page contains as many whole ordered records as fit
the 65,536-byte object bound, never splits a record, and is immutable. Set/page
digests use exact RFC 8785 JCS bytes with the digest stored only by the parent.
Every provider P0-P2 finding is repair-required automatically. Chair annotation
cannot remove, downgrade or make one same-target-resolvable.
