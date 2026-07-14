
Every nullable admitted member is first proved nonnull before an equality arm,
so SQLite three-valued `CHECK` evaluation cannot admit `UNKNOWN`. The rejected
arm makes every effective-configuration column null and thereby disables that
composite foreign key; the admitted arm makes every member nonnull. Both arms
retain the exact immutable capability and current local-attestation parents.
An admitted row can reference only an accepted attestation for its exact route
tuple and requested profile. A rejected row may bind accepted negative input or
an unavailable attestation, but it cannot synthesize or omit the fifth input.
The first receipt/task FK contains only nonnull mandatory parent members, so a
read-only null worktree/temp arm still authenticates the exact V2 authority,
task/owner/root/host and writer-state input. The insert trigger then equality-
copies the task parent's nullable writer/worktree/temp columns. Its separate
envelope FK also equality-binds the receipt approval digest; neither admitted
nor rejected receipts can carry a free authority or approval digest.

The generated insert validator requires `receipt_json` to byte-equal RFC 8785
JCS of the exact closed Spec 01 body and recomputes this dependency graph:
`requestedAuthorityProfileDigest`, admitted `nativeSettingsDigest`, admitted
`providerControlPlaneExceptionDigest`, admitted complete
`effectiveAuthorityDigest`, then `receiptDigest`. It separately requires
`effective_authority_json` to byte-equal the complete closed
`effectiveProviderAuthorityV1`, including every authority union, denial,
prohibition, disclosure, expiry and budget member. Root arrays are canonical
absolute, sorted and unique; their normalised values and count equality-copy
the effective object. Native settings are one secret-free canonical object and
their digest equals the provider-action effective configuration's
`permission_profile_digest`; its schema digest equality-copies the selected
capability support row, attestation, effective configuration and receipt.
Executable identity and capability body likewise equality-copy all four
parents. Every compiler/input/policy/adapter/host/
attestation/configuration member equality-copies its authenticated parent.
The request digest covers the expected policy version; the receipt separately
stores expected and authenticated current versions. Admitted rows require
equality. A rejected row selects its sole public reason by this exact first-
true order: `certifying-requires-review-readonly`, `profile-disabled`,
`policy-version-mismatch`, `authority-insufficient`, `task-worktree-unbound`,
`risk-policy-forbidden`, `provider-capability-unavailable`, then
`local-attestation-unavailable`. Discovery order cannot change receipt bytes.
The eight stored predicate bits are generated, never caller input. They mean,
respectively: a non-readonly certifying request; disabled risk rule or tuple
attestation; expected/current policy inequality; a human/task/profile-ceiling
candidate lacking approved-provider disclosure, daemon dispatch action,
nonempty source scope, positive `turns`, or the write request's nonempty
artifact scope; absent/stale/crossed task, owner, mandatory workspace root or,
for write, lease/worktree/required-temp and coordinate projection; a current
risk restriction eliminating a dimension that survived that candidate; absent
or unenforceable exact provider support/native settings; and, only if all
earlier bits are false, absent/unaccepted current attestation. The displayed
NULL-safe CHECK maps the first true bit to the reason. Malformed,
unauthenticated, expired-envelope or broken-parent input fails its ordinary
protocol/integrity gate before this classifier and cannot be relabelled.
For a nonnull worktree or private-temp digest, the complete task/owner/lease,
no-follow filesystem and current-custody parents above must equality-bind; no
free digest column is accepted.
`task_ownership_json` byte-equals the complete closed
`authorityTaskOwnershipV1` and recomputes its AD digest. Its task/owner/lease
arm, sorted requested action sets and canonical workspace-relative requested
artifact prefixes, sparse recognized-unit `taskBudget`,
worktree and temp identities equality-copy the normalised columns, preflight
input and authoritative task/lease rows. An unknown budget key, invalid value,
implicit unlimited sentinel or partially null writer-lease arm rejects. An
absent recognized budget key grants nothing; effective output retains only keys
present in every applicable human/risk/task map and stores their numeric minima.
Both profiles require a surviving positive `turns` value; other recognised
qualified units remain sparse and action-dependent.
The task-input
temp identity has its own custody columns; the receipt's effective temp member
is null or equals that input and never substitutes a different root.
Disclosure validation preserves only the closed protocol union
`allowed | scoped | forbidden`; a scoped arm uses nonempty unique scopes in
the current JavaScript lexical order `approved-provider`, `external`, `local`.
No invented component fields or alternate ordering are accepted. Action values
come only from the current generated `OPERATION_REGISTRY` entries satisfying
`isDaemonGrantableOperation`; no hand-maintained profile enum can widen them.
`canonicalReadRoots` exactly projects effective `sourcePaths`.
`canonicalWriteRoots` exactly projects effective `artifactPaths` plus the one
optional current private-temp custody path, sorted and unique. The host scratch
path never enters `artifactPaths`. For write, `canonicalDenyRoots` is exactly
the absolute projection of effective relative `deniedPaths` plus the identity-
derived worktree `.git` link path and `commonGitDirectory`; deny wins. The
owning repository root is only an identity/containment parent and is not a deny
prefix. Primary/sibling checkouts, home and global temp remain outside the
closed write allowlist and are default-denied. Fixtures prove a normal
artifact-`.` worktree write succeeds while `.git`, common-Git administration,
primary, sibling, home and global-temp writes fail.

The admitted capability support child must be `enforceable`. Read-only fixes
`filesystemMode:readonly` and `privateTempRequirement:none`. Write fixes
`filesystemMode:one-owned-worktree`; `required` requires exact current custody
in task, settings and receipt, while `none` requires both selected task and
receipt temp identities null. No caller or ambient provider setting chooses
that arm. Every rejected receipt also has a nonnull support-identity FK that
excludes nullable detail columns. Its trigger null-safely equality-copies the
selected support details: enforceable schema comes from that row; unavailable
support has null detail/schema and the receipt's required nonnull schema instead
foreign-sources the current activated adapter compiler target. Thus a nullable
unavailable detail arm cannot disable the support parent.

The generated safe compilation projection equality-copies the receipt's run,
authority ID/envelope/approval, task/root/worktree/private-temp, risk policy,
capability snapshot/body, adapter/contract/host, attestation, compiler and
policy provenance. It exposes the nullable private-temp digest but never native
settings bodies or canonical roots. The rejected projection has only its safe
reason; the admitted projection has effective/settings/control-plane digests.

The squashed migration's generated immutability guard set denies UPDATE and
DELETE on every new authority parent: approval registration, V2 envelope, host
identity, risk policy, owned-worktree/root/temp custody, task ownership,
containment policy/matrix/case/evidence/decision, attestation subject/revision,
capability snapshot/support child, effective configuration and compilation
receipt. Only the named `*_current` pointer tables may update, and only through
their stated expected-generation CAS; route/action/dispatch/evidence owners
remain insert-only under their existing guards.
Receipt, effective configuration, action and route rows are insert-only.

Each discovery row composite-foreign-keys the exact existing
`EvidenceArtifactRegistration` revision. Its `manifest_json` byte-equals RFC
8785 JCS of the digest-free `discoverySurfaceManifestV1`; `manifest_digest`,
`artifact_digest` and the registered artifact digest are equal, and the exact
registered bytes reproduce them. Triggers equality-copy host/version/profile/
raw-mode and permission fields from the manifest. Only the daemon renderer may
insert this evidence kind.

The two subject tables are immutable identity/evidence registries, not new
activation or action state machines; their evidence tuples foreign-key exact
daemon registrations. A provider-smoke/action pair preflight exists before its
subject/config row, so the later route-to-configuration FK creates no cycle.

Effective-configuration insert validates the closed Spec 03 object and its
digest. A closed discriminator CHECK requires exactly the activation columns,
smoke column, or provider-action pair columns for its `subject_kind`; every
other subject column is null. Adapter ID, subject kind and subject-ref digest
are nonnull, and the provider-action arm separately proves its action-adapter
column nonnull before equality, so SQLite's NULL CHECK semantics cannot bypass
an arm or its partial index. The selected columns reproduce `subjectRef` and
`subject_ref_digest` and must satisfy the displayed foreign key. The three
partial unique indexes make the selected ref—not a caller-selected value—the
one-to-one subject identity. A different configuration ID, revision or digest
cannot create a second effective configuration for the same subject. The nullable
activation-configuration triple is all null only for an activation
subject; smoke/action subjects require a same-adapter activation parent and
cannot update it. Subject arm/ref digest, host, executable, snapshot instance/
body, native-settings schema, permission and discovery-surface tuples must
reproduce the JSON and the smoke/action row equality-binds those same members
to its activation parent. Each row is
also registered through the existing daemon-owned evidence registration path;
no public publisher may forge its evidence kind. There is no host-global config
mutation, compatibility decoder or update path.

Certifying-review availability/admission/dispatch additionally require the
referenced capability body to state `safety.enforcedReadOnly=true` and the
effective permission profile to be the exact enforced read-only profile.
Generic routes instead enforce their own matched profile and may be write-
capable inside task authority; no store trigger globally rewrites them to read-
only.

Every provider action that can reach provider I/O equality-binds the admitted
receipt before it can parent a route:

```sql
-- Added to provider_actions in the squashed baseline:
authority_compilation_status TEXT NOT NULL
  CHECK(authority_compilation_status = 'admitted'),
authority_compilation_receipt_digest TEXT NOT NULL,
UNIQUE(adapter_id, action_id, authority_compilation_receipt_digest),
FOREIGN KEY(adapter_id, action_id, authority_compilation_status,
    authority_compilation_receipt_digest)
  REFERENCES provider_authority_compilation_receipts(
    action_adapter_id, action_id, status, receipt_digest)
```

A rejected receipt therefore has no possible action parent. There is no
deferred provider-action insert, null receipt, status rewrite or receipt swap.
