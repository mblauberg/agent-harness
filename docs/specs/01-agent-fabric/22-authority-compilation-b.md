
Before adapter I/O, Fabric purely compiles the requested authority profile from
exactly five authenticated inputs: the human `AuthorityEnvelopeV2`; current
task plus owned-worktree binding; risk policy; provider capability snapshot;
and local-attestation revision. Sets intersect, denials accumulate, enabling
flags narrow, disclosure narrows, expiry is earliest and budgets are minima.
Provider-native settings are compiler output and are never accepted from a
caller, model, prompt or untrusted provider configuration.

Named profiles are service contracts, not a downgrade lattice. Admission
succeeds only when the compiled dimensions satisfy the complete requested
profile, and then `effectiveAuthorityProfile` equals
`requestedAuthorityProfile`. Otherwise Fabric persists the rejected receipt
and returns `AUTHORITY_PROFILE_UNAVAILABLE` before provider I/O, tool/effect
reservation or action dispatch. The safe reason is exactly one of
`profile-disabled`, `policy-version-mismatch`, `authority-insufficient`,
`task-worktree-unbound`,
`risk-policy-forbidden`, `provider-capability-unavailable`,
`local-attestation-unavailable` or `certifying-requires-review-readonly`. There
is no implicit fallback. When multiple predicates fail, the one public reason
is the first true condition in this total order:
`certifying-requires-review-readonly`, `profile-disabled`,
`policy-version-mismatch`, `authority-insufficient`,
`task-worktree-unbound`, `risk-policy-forbidden`,
`provider-capability-unavailable`, `local-attestation-unavailable`. Every
implementation evaluates that canonical classification over the same
authenticated inputs; order of discovery cannot change receipt bytes.
`profile-disabled` is true when the selected risk rule is disabled or the
current exact tuple attestation has that safe reason; thus an inert Step-3 tuple
uses the required stable reason without a global provider switch.

The eight booleans have these closed boundaries; implementations generate one
truth table from them rather than attributing the first error they happen to
discover:

- `certifying-requires-review-readonly`: the action carries a nonnull
  certifying binding and requests anything except `review-readonly`.
- `profile-disabled`: the selected exact profile rule is disabled, or the
  selected tuple's current attestation explicitly records that safe reason.
- `policy-version-mismatch`: request expected policy version differs from the
  authenticated current risk-policy version.
- `authority-insufficient`: before applying the risk rule or any optional
  worktree/temp identity, the human-envelope/task/profile-ceiling intersection
  lacks a profile-required dimension: approved-provider disclosure, surviving
  `fabric.v1.provider-action.dispatch`, nonempty source scope, positive
  `turns`, or, for write, nonempty requested artifact scope. Human/task denial
  of a required action also satisfies this boolean.
- `task-worktree-unbound`: the authenticated task/owner lease or mandatory
  workspace-root identity input is stale, crossed or mismatched; for write it
  also covers missing/stale writer lease, worktree identity, or provider-required
  private-temp custody, and an empty artifact projection under that exact
  coordinate. It does not classify a policy-caused empty intersection.
- `risk-policy-forbidden`: the selected enabled, current risk restriction
  eliminates or denies a required dimension that survived the preceding
  human/task candidate, including disclosure, dispatch action, source,
  artifact or positive-turn scope, or imposes an unsatisfied required binding.
- `provider-capability-unavailable`: the current exact provider tuple has no
  enforceable support row for the requested profile, its capability/native-
  settings schema identity is stale, or exact native settings cannot compile.
- `local-attestation-unavailable`: every preceding boolean is false but the
  current exact tuple lacks the required unexpired accepted attestation and
  registered evidence/decision chain.

Malformed, missing-five-input, unauthenticated, expired-envelope or broken-parent input is rejected
by its ordinary protocol/authentication/integrity error before this classifier;
it is never relabelled as profile unavailability. For mixed valid-input
failures all booleans are evaluated, then the displayed total order alone
selects the persisted public reason.
A caller wanting read-only work submits a new explicit
read-only request under the ordinary stable-action replay rules.

For `workspace-write-offline`, the hard predicates are the recorded passing
Step-3 tuple decision, current-generation owned-worktree binding, nonempty
intersected writable scope, a capability snapshot attesting enforced offline
write and compilable exact native settings. Failure of any one produces the
same typed unavailable result and safe reason on replay/resume, with no provider
execution and no external marker change.

All compiler digests have one acyclic RFC 8785 JCS graph. The request digest is
the `providerActionAuthorityRequestV1` digest defined in section 32.19.4.
The compound task/worktree input is constructed in the dependency order below.

The worktree member is the digest of this closed no-follow identity, not of path
strings alone:

~~~yaml
ownedWorktreeIdentityV1:
  schemaVersion: 1
  hostIdentityDigest: sha256-prefixed-digest
  repositoryRoot:
    canonicalPath: canonical-absolute-path
    device: nonnegative-integer
    inode: positive-integer
    fileType: directory
  commonGitDirectory:
    canonicalPath: canonical-absolute-path
    device: nonnegative-integer
    inode: positive-integer
    fileType: directory
  worktreeRoot:
    canonicalPath: canonical-absolute-path
    device: nonnegative-integer
    inode: positive-integer
    fileType: directory
  worktreeGitLink:
    canonicalPath: exact-worktree-dot-git-path
    device: nonnegative-integer
    inode: positive-integer
    fileType: regular-file
    contentDigest: sha256-prefixed-digest
  taskAgentId: exact-owner
  taskId: exact-task
  taskGeneration: positive-integer
  writerLeaseId: exact-lease
  writerLeaseGeneration: positive-integer
  worktreeIdentityDigest: sha256-prefixed-digest
~~~

`worktreeIdentityDigest=AD("owned-worktree-identity-v1",
exactBodyWithoutWorktreeIdentityDigest)`. Capture uses `lstat`/no-follow and
rejects symlinks or a non-directory root. It is mandatory for the write profile
and may be null for read-only work; a nonnull read-only binding grants no write.
Its host digest must equal the current provider/configuration host throughout
capture, compilation and point-of-use validation.

Any separate provider temp root is pre-provisioned by task/worktree custody,
not created by the compiler:

~~~yaml
authorityPrivateTempRootV1:
  schemaVersion: 1
  custodyId: stable-id
  custodyRevision: positive-integer
  coordinationRunId: exact-run
  taskId: exact-task
  taskRevision: exact-task-revision
  adapterId: exact-adapter
  adapterContractDigest: sha256-prefixed-digest
  hostIdentityDigest: sha256-prefixed-digest
  worktreeIdentityDigest: sha256-prefixed-digest
  writerLeaseId: exact-lease
  writerLeaseGeneration: positive-integer
  canonicalPath: canonical-absolute-path
  device: nonnegative-integer
  inode: positive-integer
  fileType: directory
  ownerUid: exact-daemon-user-id
  mode: "0700"
  expiresAt: canonical-millisecond-UTC-timestamp
  privateTempRootIdentityDigest: sha256-prefixed-digest
~~~

`privateTempRootIdentityDigest=AD("authority-private-temp-root-v1",
exactBodyWithoutPrivateTempRootIdentityDigest)`. The custody row is created
only during separately authorised task/worktree setup, before an action/profile
request, and is nested in the authenticated task/worktree compiler input. If a
selected adapter requires it and no current exact custody exists, compilation
rejects; compilation never creates or repairs a directory. When present, its
path is the only additional canonical write root and its digest, lease,
worktree, adapter and host fields equality-bind the receipt and native settings.
It is a separately custodied host scratch exception, not an artifact path and
not project output authority: it never enters `workspaceRoots`, `sourcePaths`
or `artifactPaths`, cannot hold a required deliverable, and is unavailable to
any provider tuple whose capability/attestation/Step-3 matrix does not require
and prove it. Thus `canonicalWriteRoots` is exactly the absolute projection of
effective `artifactPaths`, plus this one custody path when its nonnull identity
is bound.

Selection follows the exact capability row: `privateTempRequirement:required`
requires the current custody and includes it in settings/receipt;
`privateTempRequirement:none` requires the selected temp identity and receipt
member to be null. A caller or ambient provider setting cannot request one.

Every profile binds the relative coordinate to one immutable no-follow root;
the absolute projection is never derived from ambient process state:

~~~yaml
authorityWorkspaceRootIdentityV1:
  schemaVersion: 1
  identityId: stable-id
  identityRevision: positive-integer
  projectId: exact-project
  projectSessionId: exact-session
  coordinationRunId: exact-run
  taskId: exact-task
  taskRevision: positive-integer
  hostIdentityDigest: sha256-prefixed-digest
  coordinateRoot: canonical-workspace-relative-prefix
  bindingKind: project-root | owned-worktree
  canonicalExecutionRoot: canonical-absolute-path
  device: nonnegative-integer
  inode: positive-integer
  fileType: directory
  worktreeIdentityDigest: sha256-prefixed-digest | null
  workspaceRootIdentityDigest: sha256-prefixed-digest
~~~

`workspaceRootIdentityDigest=AD("authority-workspace-root-identity-v1",
exactBodyWithoutWorkspaceRootIdentityDigest)`. A `project-root` row requires a
null worktree digest and equality-binds the current daemon-authenticated
project/workspace configuration identity. An `owned-worktree` row requires a
nonnull registered worktree digest and equality-copies that parent's root
path/device/inode/type/task revision. Capture and every currentness check use
`lstat`/no-follow; the immutable row is selected through a generation-CAS
current pointer for its complete host/project/session/run/task/coordinate
tuple. Its host digest, any nonnull worktree parent's host digest and the
provider capability/effective-configuration/receipt host digest must all be
equal at compilation and every point-of-use check.

The second compiler input then closes over those identities:

~~~yaml
authorityTaskOwnershipV1:
  schemaVersion: 1
  coordinationRunId: exact-run
  authorityId: exact-stored-authority
  authorityEnvelopeDigest: sha256-prefixed-digest
  taskId: exact-task
  taskRevision: positive-integer
  ownerAgentId: exact-owner
  ownerLeaseGeneration: positive-integer
  workspaceRootIdentityDigest: sha256-prefixed-digest
  writerLease:
    oneOf:
      - state: none
        writerLeaseId: null
        writerLeaseGeneration: null
      - state: current
        writerLeaseId: exact-lease
        writerLeaseGeneration: positive-integer
  requestedActions: sorted-unique-FabricOperation-values
  requestedArtifactPaths: sorted-unique-canonical-workspace-relative-prefixes
  taskBudget: authorityBudgetMap
  worktreeIdentityDigest: sha256-prefixed-digest | null
  privateTempRootIdentityDigest: sha256-prefixed-digest | null
  taskOwnershipDigest: sha256-prefixed-digest
~~~

`taskOwnershipDigest=AD("authority-task-ownership-v1",
exactBodyWithoutTaskOwnershipDigest)`. Its authority ID/run/digest foreign-key
the exact immutable V2 parent used as compiler input one; a task cannot pair
with an unrelated envelope body. A write-profile request requires the
current writer-lease arm, a worktree identity matching that exact lease/task
generation, a workspace-root identity whose `bindingKind=owned-worktree` and whose
absolute identity equality-copies that worktree root, and, when nonnull, temp
custody matching both. A read-only binding may select the daemon-authenticated
current project root or an owned worktree, but compiles empty write roots and
cannot inherit write authority from it. The selected `coordinateRoot` must be
one exact surviving effective `workspaceRoots` member and every effective
source, artifact and denied prefix used by the action must be equal to or below
it.

Absolute execution roots are a deterministic projection. For each surviving
relative prefix, remove the selected `coordinateRoot` by path components and
join the suffix beneath the selected root identity's `canonicalExecutionRoot`; then resolve through the
existing nearest-existing-ancestor/no-follow algorithm and re-check the bound
device/inode/type. Escapes or identity changes reject. The results, minimised
and sorted in canonical absolute form, are `canonicalReadRoots` from effective
`sourcePaths`, `canonicalWriteRoots` from effective `artifactPaths` only for
the write profile, and `canonicalDenyRoots` from effective `deniedPaths`.

For an admitted arm, the compiler next computes:

~~~text
nativeSettingsDigest = AD("provider-authority-native-settings-v1", {
  schemaVersion: 1, adapterId, adapterContractDigest, hostIdentityDigest,
  executableIdentityDigest, capabilityBodyDigest, nativeSettingsSchemaDigest,
  effectiveAuthorityProfile, authorityProfilePolicyVersion,
  nativeSettings: nativeSettingsJcs
})

providerControlPlaneExceptionDigest =
  AD("provider-control-plane-exception-v1", {
    schemaVersion: 1, adapterId, adapterContractDigest, hostIdentityDigest,
    executableIdentityDigest, providerCapabilitySnapshotDigest,
    capabilityBodyDigest, nativeSettingsSchemaDigest, localAttestationDigest,
    authorityProfilePolicyVersion,
    exceptionKind: "provider-api-control-plane-only",
    toolEgress: "none", modelToolReachability: "none",
    credentialMaterialInReceipt: false
  })

effectiveProviderAuthorityV1 = {
  schemaVersion: 1,
  provenance: {
    authorityId, authorityEnvelopeDigest, approvalEvidenceDigest, taskOwnershipDigest,
    workspaceRootIdentityDigest, worktreeIdentityDigest, riskPolicyDigest,
    providerCapabilitySnapshotDigest, localAttestationDigest,
    authorityCompilerVersion, expectedAuthorityProfilePolicyVersion,
    authorityProfilePolicyVersion,
    requestedAuthorityProfileDigest, adapterId, adapterContractDigest,
    hostIdentityDigest, executableIdentityDigest, capabilityBodyDigest,
    nativeSettingsSchemaDigest, nativeSettingsDigest,
    providerControlPlaneExceptionDigest
  },
  authorityProfile: effectiveAuthorityProfile,
  workspaceRoots, sourcePaths, artifactPaths, actions,
  deniedPaths, deniedActions, prohibitedActions, disclosure,
  secrets, deployment, irreversibleActions, network,
  expiresAt, budget,
  canonicalReadRoots, canonicalWriteRoots, canonicalDenyRoots,
  privateTempRootIdentityDigest
}

effectiveAuthorityDigest =
  AD("effective-provider-authority-v1", effectiveProviderAuthorityV1)
~~~

Object member names and explicit nulls shown above are part of each preimage;
every set/root/action array is sorted and unique. `secrets`, `deployment`,
`irreversibleActions` and `network` retain their complete closed V2 union arms;
the profile-forced `none`/`false` arms cannot be omitted. The effective object
contains every `AuthorityEnvelopeV2` dimension that compilation intersects, including
denials/prohibitions, disclosure, expiry and budget. Its canonical root
projections must be derivable from and equality-consistent with its path arms;
the sole additional write-root derivation is the separately displayed nonnull
private-temp custody identity. The only deny-root supplements are the exact
worktree Git-link and common-Git identities required above.
The control-plane exception
is only the fixed host responsibility described in section 33.2. Its preimage
contains no endpoint credential, bearer capability, secret value, model/tool
network grant or caller-controlled field. A rejected arm computes none of these
three digests; they remain null.

Every attempt produces one exact closed
`providerAuthorityCompilationReceiptV1`. On admission its exact native settings
are consumed by, and equality-bound to, the separate per-action
`adapterEffectiveConfigurationV1`; neither object substitutes for the other:

~~~yaml
providerAuthorityCompilationReceiptV1:
  schemaVersion: 1
  coordinationRunId: exact-run
  actionRef: ProviderActionRefV1
  authorityId: exact-stored-authority
  authorityEnvelopeDigest: sha256-prefixed-digest
  approvalEvidenceDigest: sha256-prefixed-digest
  taskOwnershipDigest: sha256-prefixed-digest
  workspaceRootIdentityDigest: sha256-prefixed-digest
  worktreeIdentityDigest: sha256-prefixed-digest | null
  riskPolicyDigest: sha256-prefixed-digest
  providerCapabilitySnapshotDigest: sha256-prefixed-digest
  capabilityBodyDigest: sha256-prefixed-digest
  localAttestationDigest: sha256-prefixed-digest
  authorityCompilerVersion: exact-version
  expectedAuthorityProfilePolicyVersion: exact-request-version
  authorityProfilePolicyVersion: exact-version
  requestedAuthorityProfile: review-readonly | workspace-write-offline
  requestedAuthorityProfileDigest: sha256-prefixed-digest
  adapterId: exact-adapter
  adapterContractDigest: sha256-prefixed-digest
  hostIdentityDigest: sha256-prefixed-digest
  executableIdentityDigest: sha256-prefixed-digest
  nativeSettingsSchemaDigest: sha256-prefixed-digest
  status: admitted | rejected
  effectiveAuthorityProfile: requested-profile | null
  effectiveAuthority: effectiveProviderAuthorityV1 | null
  effectiveAuthorityDigest: sha256-prefixed-digest | null
  nativeSettingsJcs: exact-secret-free-canonical-object | null
  nativeSettingsDigest: sha256-prefixed-digest | null
  canonicalReadRoots: sorted-unique-canonical-absolute-paths | null
  canonicalWriteRoots: sorted-unique-canonical-absolute-paths | null
  canonicalDenyRoots: sorted-unique-canonical-absolute-paths | null
  privateTempRootIdentityDigest: sha256-prefixed-digest | null
  toolEgress: none | null
  providerControlPlaneExceptionDigest: sha256-prefixed-digest | null
  rejectionReason: exact-safe-reason-above | null
  receiptDigest: sha256-prefixed-digest
~~~

The admitted arm requires nonnull effective profile/object/digest, settings,
read/write/deny roots, `toolEgress` and control-plane exception identity; its
private temp-root identity alone may be null. It requires null rejection reason.
`approvalEvidenceDigest` equality-copies
`AuthorityEnvelopeV2.approval.evidenceDigest`; the requested-profile digest
recomputes from the action request and policy version. The receipt's
run/authority ID/digest foreign-key that same immutable stored envelope and its
run equals the authenticated action/task run. Adapter/contract/host,
capability and local-attestation identities equality-copy their authenticated
parents. `workspaceRootIdentityDigest` equality-copies the registered current
root selected by `authorityTaskOwnershipV1`; it is mandatory even when
`worktreeIdentityDigest` is null. The admitted effective object equality-copies every normalised summary
field and its digest.
The rejected arm keeps the authenticated common input identities above, but
requires the effective object/digest, native settings, effective canonical-root
arrays, selected temp output, egress and control-plane members null plus one
rejection reason. The exact arm constraints are
generated into every language and SQLite.
`receiptDigest=AD("provider-authority-compilation-receipt-v1",
exactBodyWithoutReceiptDigest)`, retaining every explicit null.
Equal canonical inputs produce byte-identical compiled output. Secret values,
control-plane credentials and bearer capabilities never enter settings,
digests, receipts, logs or public projections.

An admitted receipt is immutable permission evidence, not a perpetual grant.
Immediately before every initial dispatch or crash-resume, Fabric revalidates
the exact approval/envelope, task revision, owner and writer-lease generations,
workspace-root and owned-worktree identities, risk-policy revision, capability
body, local
attestation and effective-configuration/settings tuple against the receipt.
Any drift before first provider I/O terminalises the action as exact
`terminal-no-effect`; the caller must use a new action pair and explicit profile
request. Fabric never mutates or recompiles the old pair and never substitutes
read-only. After provider acceptance, drift revokes the tool bridge and enters
the existing integrity/quarantine recovery path; it is never reported as
zero-effect. Resume may continue the same pair only after every original
binding is proved current again and no terminal row exists.

For `workspace-write-offline`, every filesystem/tool operation also rechecks
the writer lease, task/worktree generation, canonical root and filesystem
identity immediately before opening the target. A swapped symlink, changed
lease/generation, escaped path or root-identity mismatch denies that operation,
revokes further writes and records the same custody outcome above. Receipt
currency never relies on a once-per-process realpath check.

Full receipt bytes are private because an admitted receipt contains native
settings. Operator and Console reads use only this closed safe projection:

~~~yaml
providerAuthorityCompilationProjectionV1:
  commonRequired:
    - schemaVersion
    - coordinationRunId
    - actionRef
    - authorityId
    - authorityEnvelopeDigest
    - approvalEvidenceDigest
    - authorityCompilerVersion
    - expectedAuthorityProfilePolicyVersion
    - authorityProfilePolicyVersion
    - requestedAuthorityProfile
    - requestedAuthorityProfileDigest
    - taskOwnershipDigest
    - workspaceRootIdentityDigest
    - worktreeIdentityDigest
    - privateTempRootIdentityDigest
    - riskPolicyDigest
    - providerCapabilitySnapshotDigest
    - capabilityBodyDigest
    - localAttestationDigest
    - adapterId
    - adapterContractDigest
    - hostIdentityDigest
    - executableIdentityDigest
    - nativeSettingsSchemaDigest
    - endpointProvider
    - family
    - model
    - rawNativeMode
    - receiptDigest
    - status
  schemaVersion: 1
  coordinationRunId: exact-run
  actionRef: ProviderActionRefV1
  authorityId: exact-stored-authority
  authorityEnvelopeDigest: sha256-prefixed-digest
  approvalEvidenceDigest: sha256-prefixed-digest
  authorityCompilerVersion: exact-version
  expectedAuthorityProfilePolicyVersion: exact-request-version
  authorityProfilePolicyVersion: exact-version
  requestedAuthorityProfile: review-readonly | workspace-write-offline
  requestedAuthorityProfileDigest: sha256-prefixed-digest
  taskOwnershipDigest: sha256-prefixed-digest
  workspaceRootIdentityDigest: sha256-prefixed-digest
  worktreeIdentityDigest: sha256-prefixed-digest | null
  privateTempRootIdentityDigest: sha256-prefixed-digest | null
  riskPolicyDigest: sha256-prefixed-digest
  providerCapabilitySnapshotDigest: sha256-prefixed-digest
  capabilityBodyDigest: sha256-prefixed-digest
  localAttestationDigest: sha256-prefixed-digest
  adapterId: exact-adapter
  adapterContractDigest: sha256-prefixed-digest
  hostIdentityDigest: sha256-prefixed-digest
  executableIdentityDigest: sha256-prefixed-digest
  nativeSettingsSchemaDigest: sha256-prefixed-digest
  endpointProvider: exact-provider
  family: canonical-family
  model: exact-model
  rawNativeMode: exact-provider-value | null
  receiptDigest: sha256-prefixed-digest
  oneOf:
    - status: admitted
      effectiveAuthorityProfile: exact-requested-profile
      effectiveAuthorityDigest: sha256-prefixed-digest
      nativeSettingsDigest: sha256-prefixed-digest
      providerControlPlaneExceptionDigest: sha256-prefixed-digest
    - status: rejected
      rejectionReason: exact-safe-reason-above

providerAuthorityCompilationReadRequestV1:
  schemaVersion: 1
  credential: exact-operator-read-capability
  projectId: exact-project
  projectSessionId: exact-session
  coordinationRunId: exact-run
  actionRef: ProviderActionRefV1

authorityProfileUnavailableV1:
  schemaVersion: 1
  code: AUTHORITY_PROFILE_UNAVAILABLE
  compilation: exact-rejected-providerAuthorityCompilationProjectionV1
~~~

`fabric.v1.provider-authority-compilation.read` returns the exact projection or
the existing scoped `NOT_FOUND | AUTHORITY_DENIED | SCOPE_MISMATCH |
INTEGRITY_FAILURE` read error. The stable action pair resolves through its exact
pair preflight, so a rejected compilation is readable even though no provider
action/route exists. The dispatch operation's typed unavailable result is
byte-shape-identical to `authorityProfileUnavailableV1`. Projection fields
owned by the receipt equality-copy it, while provider tuple fields equality-copy
its exact local-attestation parent. The rejected arm cannot invent an
effective profile/settings digest, and the admitted arm never exposes native
settings bodies, roots, secrets, credentials or bearer capabilities.
