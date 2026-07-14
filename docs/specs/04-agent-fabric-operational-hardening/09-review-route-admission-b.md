
`argv.template` is the complete ordered grammar, including argv[0], every
literal, every option and every option/positional value. Its ordinals are
positive and contiguous. Each entry has exactly the displayed fields and the
following closed truth table:

- `fixed-literal` has non-null `exactValue`/matching digest, an empty option-
  slot array, zero owner ordinals, and `none`/`none`/`not-path`/null source
  fields and `sourceContractRule=none`;
- `option-name` has non-null exact option spelling/matching digest, a nonempty
  strictly increasing unique list of the sourced-value ordinals it owns, zero
  owner ordinals, and the same null source fields. Its declared arity is exactly
  that list's length; and
- `sourced-value` has null exact value fields and an empty option-slot array.
  A positional value uses owner/index zero. An option value names one earlier
  `option-name` ordinal and its positive one-based index, and the inverse option
  list must name that ordinal in the same position. Its non-`none` source kind,
  selector, path class and source-contract rule must match the closed selector
  table below. No other combination exists.

`slotDigest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-provider-launch-policy-argv-slot-v1`, one `0x00` byte and
RFC 8785 JCS of the complete slot object with only `slotDigest` omitted.
Consequently option name, arity, value ownership, source and path class are one
contract-pinned unit, rather than labels supplied by an action. Fixed literal
and option values are pinned both in clear and by digest; they are nonsecret.

`environment.admitted` is strictly increasing by raw UTF-8 `name`, names are
unique, and every entry has exactly the displayed fields. `fixed-literal` uses
selector `policy-fixed-literal`, `not-path`, non-null fixed value/matching digest
and source-contract rule `none`. Every other arm has null fixed fields and a
non-`none` exact source-contract rule. Its selector uniquely selects its source
kind; synthetic/capsule/socket selectors use the identically named path class,
while action-id, contract-digest and adapter-secret use `not-path`.
`entryDigest` uses domain
`agent-fabric-portal-provider-launch-policy-environment-entry-v1`, `0x00` and
JCS of the complete entry with only `entryDigest` omitted. Mandatory denied-name
and denied-prefix arrays are each strictly increasing by raw UTF-8 bytes and
duplicate-free. Every option-value ordinal array is also strictly increasing
and duplicate-free. JCS object-key ordering is not used as a substitute for
these array invariants.

Selectors have exactly this policy mapping:

| selector | source kind | path class | source-contract rule |
|---|---|---|---|
| `none` | `none` | `not-path` | `none` |
| `effective-config-model` | `resolved-model` | `not-path` | `effective-configuration-field` |
| `effective-config-effort` | `resolved-effort` | `not-path` | `effective-configuration-field` |
| `activated-executable-path` | `executable-path` | `executable` | `effective-configuration-executable` |
| `review-socket-locator` | `action-locator` | `review-socket` | `action-review-socket` |
| `review-action-id` / `review-contract-digest` | `action-locator` | `not-path` | `action-identity` |
| `provider-stdin-mode` | `stdin-mode` | `not-path` | `launch-policy-stdin-mode` |
| `synthetic-home-path` | `synthetic-path` | `synthetic-home` | `action-synthetic-home` |
| `synthetic-temp-path` | `synthetic-path` | `synthetic-temp` | `action-synthetic-temp` |
| `credential-capsule-path` | `synthetic-path` | `credential-capsule` | `action-credential-capsule` |
| `empty-cwd-path` | `synthetic-path` | `empty-cwd` | `activation-empty-cwd` |
| `policy-fixed-literal` | `fixed-literal` | `not-path` | `none` |
| `daemon-synthetic-home` | `synthetic-home` | `synthetic-home` | `action-synthetic-home` |
| `daemon-synthetic-temp` | `synthetic-temp` | `synthetic-temp` | `action-synthetic-temp` |
| `prospective-credential-capsule` | `credential-capsule` | `credential-capsule` | `action-credential-capsule` |
| `adapter-secret-version` | `adapter-secret` | `not-path` | `adapter-secret-version` |

The environment `review-socket-locator`, `review-action-id` and
`review-contract-digest` selectors reuse the matching argv tuples. No selector
may appear under any other kind/class/rule tuple.

A contract may narrow the displayed selectors or add denied names/prefixes; it
may not remove a mandatory denial. The exact template leaves no unknown option,
arity or free literal. Shell/interpreter evaluation, arbitrary command strings
and any cwd/workspace/config/plugin/MCP/tool or real user/HOME/project/provider-
source path override are structurally unrepresentable. The trusted activation
loader, not an action caller, inserts the one policy row and recomputes every
entry/slot/policy digest; it is immutable and nondeletable while any
configuration/envelope cites it.

The policy is contract-global. It contains only the displayed stable rule
enums, never an action path, daemon instance, current inode, secret version or
prospective artifact identity. Every `*Dec` in policy, envelope, source-contract
and closure JSON is a canonical unsigned decimal string with no leading zero;
positive excludes `"0"`. Template/source-contract ordinals are contiguous and
unique. All other digest-bearing arrays are either explicitly ordered above or
strictly increasing by their stated raw UTF-8/digest key and duplicate-free;
no implementation-defined set iteration may enter a digest preimage.

`launch_envelope_json` byte-equals RFC 8785 JCS of this exact closed action
object:

~~~yaml
reviewPortalProviderLaunchEnvelopeV1:
  schemaVersion: 1
  adapterId: exact-adapter
  actionId: exact-action
  contractDigest: exact-contract
  daemonInstanceId: exact-daemon
  configurationId: exact-id
  configurationRevisionDec: positive
  configurationDigest: exact-digest
  effectiveConfigurationDigest: exact-digest
  executableIdentityDigest: exact-digest
  launchPolicyDigest: exact-policy-digest
  sourceContractMemberCountDec: positive
  sourceContractSetDigest: exact-digest
  sourceContractSetState: sealed
  sourceContracts:
    - ordinalDec: positive-contiguous
      sourceSelector: exact-policy-selector
      sourceContractKind: effective-configuration-field |
        activated-executable | action-identity | review-socket |
        synthetic-home | synthetic-temp | credential-capsule | empty-cwd |
        policy-stdin-mode | adapter-secret-version
      pathClass: exact-policy-path-class
      sourceContract: exact-closed-arm-object
      sourceContractDigest: exact-digest
  argv:
    - ordinalDec: positive-contiguous
      policySlotDigest: exact-digest
      tokenKind: fixed-literal | option-name | sourced-value
      value: exact-nul-free-utf8
      valueLengthDec: nonnegative
      valueDigest: exact-sha256
      ownerOptionOrdinalDec: nonnegative
      ownerOptionValueIndexDec: nonnegative
      sourceKind: none | resolved-model | resolved-effort | executable-path |
        action-locator | stdin-mode | synthetic-path
      sourceSelector: none | effective-config-model |
        effective-config-effort | activated-executable-path |
        review-socket-locator | review-action-id | review-contract-digest |
        provider-stdin-mode | synthetic-home-path | synthetic-temp-path |
        credential-capsule-path | empty-cwd-path
      pathClass: not-path | review-socket | synthetic-home | synthetic-temp |
        credential-capsule | empty-cwd | executable
      sourceContractRule: exact-policy-rule
      sourceContractDigest: exact-digest | null
      sourceIdentityDigest: exact-digest
  environment:
    - name: exact-name
      valueLengthDec: nonnegative
      valueDigest: exact-sha256
      sourceKind: fixed-literal | synthetic-home | synthetic-temp |
        credential-capsule | action-locator | adapter-secret
      sourceSelector: policy-fixed-literal | daemon-synthetic-home |
        daemon-synthetic-temp | prospective-credential-capsule |
        review-socket-locator | review-action-id | review-contract-digest |
        adapter-secret-version
      pathClass: not-path | review-socket | synthetic-home |
        synthetic-temp | credential-capsule
      sourceContractRule: exact-policy-rule
      sourceContractDigest: exact-digest | null
      sourceIdentityDigest: exact-digest
~~~

Every envelope argv row equality-copies its policy slot digest, token/owner
fields, source selector, path class and source-contract rule. Fixed-literal and option-name values
must byte-equal their policy value. A sourced value is derived only from its
selector and references the one matching source-contract child digest; it
cannot relabel itself. Every environment row equality-copies the
matching policy entry's name/source selector/path class and, for fixed literals,
must byte-equal the policy value. The envelope has exactly all policy template
and environment rows and no other argv token or environment name. Fixed rows
use a null source-contract digest; every nonfixed row uses the digest of exactly
one `sourceContracts` member whose selector/kind/path class satisfies its policy
rule.

Every `sourceContracts` member has exactly the displayed wrapper and one closed
arm object. Effective-configuration field, executable, action-identity, policy-
stdin and secret-version arms contain respectively the exact effective-
configuration field/value commitment, opened-executable identity/closure
commitment, action/contract semantic value, policy slot/value commitment, or
private secret id/revision/version commitment. Filesystem arms contain the
prospective canonical path, parent/root identity digest, basename, expected
file type, owner/mode/ACL/xattr/mount policy, link count and expected content
digest where applicable. `review-socket` requires socket/link-count one;
`credential-capsule` requires regular/0600/link-count one and the expected
capsule-content digest; synthetic HOME requires a private 0700 directory with
only its exact auth/config manifest, synthetic temp requires a private 0700
empty directory under its activated root, and empty cwd equality-copies
the activation-owned 0500/empty/read-only contract. No prospective arm contains
a guessed child inode.

`sourceContract` is exactly this common closed object; `bindingKind` byte-equals
the enclosing `sourceContractKind`, and `binding` is exactly one object from the
exhaustive list below:

~~~yaml
reviewPortalLaunchSourceContractV1:
  schemaVersion: 1
  adapterId: exact-outer-adapter
  actionId: exact-outer-action
  contractDigest: exact-outer-contract
  daemonInstanceId: exact-outer-daemon
  sourceSelector: exact-outer-selector
  sourceContractKind: exact-outer-kind
  pathClass: exact-outer-path-class
  bindingKind: exact-outer-kind
  binding: exact-kind-object-below
~~~

The `effective-configuration-field` object is:

~~~yaml
reviewPortalEffectiveConfigurationFieldSourceV1:
  fieldName: model | effort
  effectiveConfigurationDigest: exact-envelope-digest
  fieldValue: exact-nul-free-utf8
  fieldValueLengthDec: nonnegative
  fieldValueDigest: exact-sha256
~~~

`fieldName=model` is permitted only for selector `effective-config-model` and
`fieldName=effort` only for `effective-config-effort`; the value/length/digest
byte-equal the corresponding envelope argv row and effective configuration.

The `activated-executable` object is:

~~~yaml
reviewPortalActivatedExecutableSourceV1:
  effectiveConfigurationDigest: exact-envelope-digest
  executableIdentityDigest: exact-envelope-digest
  canonicalPath: exact-absolute-path
  canonicalPathDigest: exact-sha256
  transitiveExecutableClosureDigest: exact-closure-digest
~~~

It is permitted only for `activated-executable-path`; the path byte-equals
argv[0], and identity/closure byte-equal the no-follow opened executable fields
in the provider closure; this introduces no second executable-closure digest.
`canonicalPathDigest` is `sha256:` plus lowercase
SHA-256 of `agent-fabric-portal-canonical-path-v1`, `0x00` and the exact UTF-8
path bytes. This is also the definition wherever that field appears below.

The `action-identity` object is:

~~~yaml
reviewPortalActionIdentitySourceV1:
  identityKind: action-id | contract-digest
  exactValue: exact-nul-free-utf8
  exactValueLengthDec: nonnegative
  exactValueDigest: exact-sha256
~~~

The kind/selector is respectively `action-id`/`review-action-id` or `contract-
digest`/`review-contract-digest`; `exactValue` byte-equals the common outer
action ID or contract digest and its envelope value.

The `review-socket` object is:

~~~yaml
reviewPortalProspectiveSocketSourceV1:
  recoveryRootPath: exact-intent-root-path
  recoveryRootIdentityDigest: exact-intent-root-identity
  custodyDirectoryBasename: exact-intent-basename
  custodyDirectoryContractDigest: exact-digest
  canonicalPath: exact-prospective-path
  canonicalPathDigest: exact-sha256
  basename: exact-intent-socket-basename
  fileType: unix-socket
  socketType: stream
  modeOctal: "0600"
  linkCountDec: "1"
  listenerOwner: typescript-daemon
  providerRole: connecting-client
~~~

The path is the byte-exact canonical join of recovery root, custody basename and
socket basename; its directory is prospective and no child inode appears.

`recoveryRootIdentityDigest` is `sha256:` plus lowercase SHA-256 of the ASCII
bytes `agent-fabric-portal-recovery-root-identity-v1`, one `0x00` byte and RFC
8785 JCS of exactly this object:

~~~yaml
reviewPortalRecoveryRootIdentityV1:
  canonicalPath: exact-intent-recovery-root-path
  deviceDec: nonnegative
  inodeDec: positive
~~~

All three fields equality-copy the opened recovery-root FD and intent columns.
`custodyDirectoryContractDigest` is formed the same way with domain
`agent-fabric-portal-prospective-custody-directory-v1` and JCS of exactly:

~~~yaml
reviewPortalProspectiveCustodyDirectoryContractV1:
  adapterId: exact-outer-adapter
  actionId: exact-outer-action
  daemonInstanceId: exact-outer-daemon
  recoveryRootIdentityDigest: exact-digest-above
  basename: exact-intent-custody-basename
  fileType: directory
  ownerUidDec: nonnegative
  ownerGidDec: nonnegative
  modeOctal: "0700"
  socketBasename: exact-intent-socket-basename
  capsuleBasename: exact-intent-capsule-basename
  exactChildRoles: [socket, credential-capsule]
  exclusiveCreateNoFollow: true
~~~

`exactChildRoles` has that literal order. Intent, socket and capsule source arms
equality-copy both digests; Rust/TypeScript goldens cross root path/device/inode,
action, daemon, directory name, child name, owner and role order.

The daemon first registers each synthetic root as this exact immutable object:

~~~yaml
reviewPortalActivatedSyntheticRootV1:
  schemaVersion: 1
  daemonInstanceId: exact-outer-daemon
  role: synthetic-home | synthetic-temp
  canonicalPath: exact-absolute-path
  deviceDec: nonnegative
  inodeDec: positive
  ownerUidDec: nonnegative
  ownerGidDec: nonnegative
  modeOctal: "0700"
  acl: []
  mountIdentity:
    platform: darwin | linux
    mountPointPath: exact-canonical-path
    deviceDec: nonnegative
    fsidWordsDec: [exactly-two-u32-bit-pattern-decimal-values]
    filesystemType: exact-lowercase-ascii-kernel-type
    mountFlags:
      - strictly-ordered-subset-of: [read-only, no-suid, no-device, no-exec,
          synchronous, no-atime, journaled, local]
~~~

Its `rootContractDigest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-activated-synthetic-root-v1`, one `0x00` byte and JCS of
that complete object. Root JSON/digest and path/device/inode byte-equal the
immutable activation row. The mount object uses the same unsigned fsid,
known-flag ordering and unknown-flag rejection rules as the exact cwd mount
identity below. Role, daemon, path/stat/owner/mode/ACL/mount permutations have
cross-language goldens.

`synthetic-home` uses this exact object:

~~~yaml
reviewPortalProspectiveSyntheticHomeSourceV1:
  role: synthetic-home
  activatedRoot: exact-reviewPortalActivatedSyntheticRootV1-object
  activatedRootContractDigest: exact-defined-root-digest
  canonicalPath: exact-action-private-path
  canonicalPathDigest: exact-sha256
  basename: exact-action-derived-basename
  fileType: directory
  ownerUidDec: nonnegative
  ownerGidDec: nonnegative
  modeOctal: "0700"
  aclDigest: exact-empty-acl-digest
  entryCountDec: nonnegative
  entries:
    - ordinalDec: positive-contiguous
      relativePath: exact-normalised-relative-path
      fileType: directory | regular
      modeOctal: "0700" | "0600"
      linkCountPolicy: positive-observed-after-create | exactly-one
      contentLengthDec: nonnegative | null
      contentDigest: exact-sha256 | null
  entryManifestDigest: exact-digest
  xattrCountDec: "0"
  xattrSetDigest: exact-empty-xattr-set-digest
  mountIdentityDigest: exact-digest
  exclusiveCreateNoFollow: true
~~~

The home path is one direct action-derived child of its named activated root;
root stat/owner/ACL/mount come from activation rather than caller input. Entries
are strictly increasing by raw UTF-8 relative path, unique, parent-before-child,
contain no empty/`.`/`..` segment and are only daemon-generated auth/config
content admitted by the adapter contract. Directories have mode 0700 and null
content fields and use `positive-observed-after-create`; regular files have mode
0600, `exactly-one` and exact non-null length/digest. Prospective manifest bytes
contain no guessed directory link count. The artifact-custody capture persists
each actual positive directory count and revalidates it during cleanup.
`entryCountDec` equals array length and may be zero only for an adapter requiring
no auth/config file. `entryManifestDigest` uses domain
`agent-fabric-portal-synthetic-home-entry-manifest-v1`, `0x00` and JCS of the
complete entries array. Symlinks, regular-file hard links, devices and extra
files are forbidden. Directory alias denial uses exclusive no-follow creation
beneath the retained activation root plus mount/namespace custody checks; it
never assumes a POSIX directory has link count one. Linux/macOS goldens cover
nested directories with their platform-observed positive counts.

`synthetic-temp` is separate and exactly empty:

~~~yaml
reviewPortalProspectiveSyntheticTempSourceV1:
  role: synthetic-temp
  activatedRoot: exact-reviewPortalActivatedSyntheticRootV1-object
  activatedRootContractDigest: exact-defined-root-digest
  canonicalPath: exact-action-private-path
  canonicalPathDigest: exact-sha256
  basename: exact-action-derived-basename
  fileType: directory
  ownerUidDec: nonnegative
  ownerGidDec: nonnegative
  modeOctal: "0700"
  aclDigest: exact-empty-acl-digest
  entryCountDec: "0"
  entrySetDigest: exact-empty-entry-set-digest
  xattrCountDec: "0"
  xattrSetDigest: exact-empty-xattr-set-digest
  mountIdentityDigest: exact-digest
  exclusiveCreateNoFollow: true
~~~

It is one direct action-derived child of the activated temp root and remains
empty through post-ACK validation. Cross-language goldens cover empty and
nonempty HOME manifests, nested parent ordering, and the empty temp arm.

The `credential-capsule` object is:

~~~yaml
reviewPortalProspectiveCredentialCapsuleSourceV1:
  recoveryRootPath: exact-intent-root-path
  recoveryRootIdentityDigest: exact-intent-root-identity
  custodyDirectoryBasename: exact-intent-basename
  custodyDirectoryContractDigest: exact-digest
  canonicalPath: exact-prospective-path
  canonicalPathDigest: exact-sha256
  basename: exact-intent-capsule-basename
  directoryModeOctal: "0700"
  fileType: regular
  fileModeOctal: "0600"
  linkCountDec: "1"
  expectedContentDigest: exact-intent-capsule-content-digest
  exclusiveCreateNoFollow: true
~~~

The path is the byte-exact canonical join of recovery root, custody basename and
capsule basename and equality-copies the intent/closure prospective capsule.

The `empty-cwd` object is:

~~~yaml
reviewPortalActivationEmptyCwdSourceV1:
  canonicalPath: exact-closure-cwd-path
  fileType: directory
  deviceDec: nonnegative
  inodeDec: positive
  ownerUidDec: nonnegative
  ownerGidDec: nonnegative
  modeOctal: "0500"
  aclDigest: exact-empty-acl-digest
  filesystemFlags: []
  entryCountDec: "0"
  entrySetDigest: exact-empty-entry-set-digest
  xattrCountDec: "0"
  xattrSetDigest: exact-empty-xattr-set-digest
  mountIdentityDigest: exact-digest
  readOnlyEnforcementDigest: exact-digest
  provenance: daemon-activation-empty-cwd
  daemonInstanceId: exact-outer-daemon
  contractDigest: exact-outer-contract
~~~

It byte-equals the later closure `cwd` object and contains actual activation-
owned directory identity, not an action-created prospective inode. Its common
outer daemon/contract must equal its two identically named fields.

The `policy-stdin-mode` object is:

~~~yaml
reviewPortalPolicyStdinModeSourceV1:
  launchPolicyDigest: exact-policy-digest
  policySlotDigest: exact-slot-digest
  exactValue: exact-nul-free-utf8
  exactValueLengthDec: nonnegative
  exactValueDigest: exact-sha256
~~~

Its value byte-equals the selected contract-pinned stdin mode and envelope row.

The `adapter-secret-version` object is:

~~~yaml
reviewPortalAdapterSecretVersionSourceV1:
  configurationId: exact-configuration-id
  configurationRevisionDec: positive
  effectiveConfigurationDigest: exact-envelope-digest
  secretId: exact-private-secret-id
  secretRevisionDec: positive
  secretMaterialDigest: exact-private-digest
  secretVersionCommitmentDigest: exact-private-digest
~~~

It is permitted only for selector `adapter-secret-version`; the commitment is
recomputed from the effective configuration's selected secret version and
material digest. It contains neither material nor environment value bytes.
`secretMaterialDigest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-adapter-secret-material-v1`, one `0x00` byte and the exact
raw secret bytes. `secretVersionCommitmentDigest` uses domain
`agent-fabric-portal-adapter-secret-version-v1`, `0x00` and RFC 8785 JCS of
exactly `[adapterId,configurationId,configurationRevisionDec,
effectiveConfigurationDigest,secretId,secretRevisionDec,secretMaterialDigest]`.
Both digests remain private; daemon and stub recompute them from the selected
version, and goldens include leading-zero raw bytes and crossed revisions.

No field is optional and no additional field is admitted in the common object
or any arm. The arm's common outer identities are equality-checked before its
member digest. Rust and TypeScript share one golden and one crossed-identity/
wrong-field negative for every arm, plus home-versus-temp, action-id-versus-
contract, model-versus-effort and prospective-versus-actual-inode negatives.

Each child `source_contract_json` byte-equals JCS of the complete common
`reviewPortalLaunchSourceContractV1` object, including its exact arm object.
`source_contract_digest` uses domain
`agent-fabric-portal-launch-source-contract-v1`, `0x00` and JCS of the complete
envelope member wrapper -- exactly `ordinalDec`, `sourceSelector`,
`sourceContractKind`, `pathClass` and that parsed common `sourceContract` --
with only `sourceContractDigest` omitted. The child row's integer ordinal is
rendered to its canonical `ordinalDec`; its selector/kind/path-class columns
must byte-equal the wrapper/common-object values. `sourceContractSetDigest` uses domain
`agent-fabric-portal-launch-source-contract-set-v1`, `0x00` and JCS of the
ordinal-ordered array of canonical persisted `sha256:` plus 64 lowercase-
hexadecimal member-digest strings. Rust/TypeScript golden vectors include an
empty-leading-byte digest and reject raw-byte, base64, uppercase and bare-hex
encodings. The relational child rows
are exactly the envelope array: contiguous, no missing/extra/duplicate selector
or digest. They first reference one `building` header. A generated sealing
trigger recomputes every child JCS/digest and the ordered set root, requires
exactly `member_count` rows with ordinals `1..member_count`, then performs the
only header transition `building/revision 1 -> sealed/revision 2`. A sealed
header and all its rows are immutable and nondeletable. An envelope can reference
only the exact sealed header/member-count/root through its composite FK, so a
zero, partial or reordered set cannot admit an envelope. The daemon commits
set rows, seal, envelope, closure and custody intent in one transaction; every
failure rolls the whole transaction back.

Each `sourceIdentityDigest` is `sha256:` plus lowercase SHA-256 of its arm's
ASCII domain label, one `0x00` byte and RFC 8785 JCS of the exact array shown:

| source arm | domain suffix after `agent-fabric-portal-launch-source-` | exact JCS array |
|---|---|---|
| fixed argv/environment value | `fixed-literal-v1` | `[launchPolicyDigest,policySlotOrEnvironmentEntryDigest,valueDigest]` |
| resolved model | `resolved-model-v1` | `[effectiveConfigurationDigest,"model",sourceContractDigest,valueDigest]` |
| resolved effort | `resolved-effort-v1` | `[effectiveConfigurationDigest,"effort",sourceContractDigest,valueDigest]` |
| activated executable path | `activated-executable-v1` | `[effectiveConfigurationDigest,executableIdentityDigest,sourceContractDigest,canonicalPathDigest,valueDigest]` |
| stdin mode | `stdin-mode-v1` | `[launchPolicyDigest,policySlotDigest,sourceContractDigest,valueDigest]` |
| synthetic home/temp/empty cwd | `synthetic-root-v1` | `[daemonInstanceId,pathClass,sourceContractDigest,canonicalPathDigest,valueDigest]` |
| prospective credential capsule | `prospective-capsule-v1` | `[adapterId,actionId,sourceContractDigest,expectedCapsuleContentDigest,valueDigest]` |
| action locator | `action-locator-v1` | `[adapterId,actionId,contractDigest,sourceSelector,sourceContractDigest,valueDigest]` |
| adapter secret version | `adapter-secret-version-v1` | `[adapterId,secretId,secretRevisionDec,secretVersionCommitmentDigest,sourceContractDigest,valueDigest]` |

The full domain is the prefix plus the displayed suffix. The prospective-
capsule contract is the pre-intent path/name/mode/type/link-count/content
contract below, never a guessed inode. Synthetic-root contracts bind the
activation-owned root path/stat/owner/mode/ACL/mount/empty-state/read-only
commitment. The action-locator contract binds its semantic role and prospective
object contract. The adapter-secret commitment is the effective
configuration's private secret-id/revision/material-digest commitment; raw
secret bytes never enter policy, envelope, closure or logs. Fixed option-name
rows use the fixed-value arm. These are the only source identity preimages.
Rust/TypeScript golden and negative vectors cover the activated-executable arm,
including crossed effective configuration, executable identity, canonical path,
source contract and argv[0] bytes.

Envelope admission recomputes every source contract and identity from the
outer adapter/action/contract/daemon, the effective configuration, activated
root contracts, policy, daemon-owned locators and private secret version. It
rejects an inner outer-identity mismatch. The exec closure equality-copies the
complete source-contract array/set digest. The custody intent equality-copies
the envelope/set digests and recomputes prospective home/temp/socket/capsule
paths, names, types, modes, link counts and content digests from those children;
the process-custody row equality-copies the same digests. Generated immutable
triggers plus the daemon's pre-commit closed-object validator reject any crossed
action/daemon/configuration, substituted arm, missing child, or envelope-
closure-intent field mismatch. Actual post-create identities may refine only
the matching prospective arm and must preserve its contract; they never replace
or self-certify it.

`launch_envelope_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-provider-launch-envelope-v1`, one `0x00` byte and those JCS
bytes. The trusted renderer derives the envelope only from the exact provider-
action effective configuration, activated contract/policy and daemon-owned
action locators/secrets; caller argv/environment is never an input. It validates
every argv value/slot/owner/source identity, path class, limit, environment
name/source/value identity
and mandatory denial, then stores the envelope through the displayed composite
FKs. The exec closure equality-copies `launchEnvelopeDigest`; its raw ordered
argv rows and environment name/length/value-digest/source-selector/path-class/
source-identity sequence must byte-equal the envelope. Daemon and stub hash
their actual argv/environment bytes and
require that equality before registration and after ACK. Configuration A with
self-consistent argv/environment B, inherited parent environment, loader
variables, real HOME/XDG/config paths or unsafe flags is terminal no-exec.

The provider exec closure is also closed and independently reproducible.
`provider_closure_json` byte-equals RFC 8785 JCS of exactly this private object;
every `*Dec` value is a canonical unsigned decimal string, all paths are
absolute canonical UTF-8 with no NUL, `argv` order is executable order, and the
environment/FD arrays use the stated order with no duplicate:

~~~yaml
reviewPortalProviderExecClosureV1:
  adapterId: exact-adapter
  actionId: exact-action
  contractDigest: exact-activated-contract
  daemonInstanceId: exact-daemon
  launchEnvelopeDigest: exact-digest
  sourceContractMemberCountDec: positive
  sourceContractSetDigest: exact-digest
  sourceContractSetState: sealed
  sourceContracts: exact-byte-for-byte-envelope-source-contract-array
  configuration:
    configurationId: exact-id
    configurationRevisionDec: positive
    configurationDigest: exact-digest
    effectiveConfigurationDigest: exact-digest
    executableIdentityDigest: exact-digest
  executable:
    identityDigest: exact-digest
    canonicalPath: exact-path
    parentPath: exact-path
    basename: one-name
    parentDeviceDec: nonnegative
    parentInodeDec: positive
    deviceDec: nonnegative
    inodeDec: positive
    modeDec: positive
    sizeDec: nonnegative
    contentDigest: exact-sha256
    codeIdentityDigest: exact-digest
    transitiveExecutableClosureDigest: exact-digest
  argv:
    - ordinalDec: positive-contiguous
      policySlotDigest: exact-digest
      tokenKind: fixed-literal | option-name | sourced-value
      value: exact-nul-free-utf8
      valueLengthDec: nonnegative
      valueDigest: exact-sha256
      ownerOptionOrdinalDec: nonnegative
      ownerOptionValueIndexDec: nonnegative
      sourceKind: none | resolved-model | resolved-effort | executable-path |
        action-locator | stdin-mode | synthetic-path
      sourceSelector: exact-policy-selector
      pathClass: exact-policy-path-class
      sourceContractRule: exact-policy-rule
      sourceContractDigest: exact-digest | null
      sourceIdentityDigest: exact-digest
  cwd:
    canonicalPath: exact-path
    fileType: directory
    deviceDec: nonnegative
    inodeDec: positive
    ownerUidDec: nonnegative
    ownerGidDec: nonnegative
    modeOctal: "0500"
    aclDigest: exact-empty-acl-digest
    filesystemFlags: []
    entryCountDec: "0"
    entrySetDigest: exact-empty-entry-set-digest
    xattrCountDec: "0"
    xattrSetDigest: exact-empty-xattr-set-digest
    mountIdentityDigest: exact-digest
    readOnlyEnforcementDigest: exact-digest
    provenance: daemon-activation-empty-cwd
    daemonInstanceId: exact-daemon
    contractDigest: exact-contract
  environment:
    - name: exact-utf8-name
      valueLengthDec: nonnegative
      valueDigest: exact-sha256
      sourceKind: fixed-literal | synthetic-home | synthetic-temp |
        credential-capsule | action-locator | adapter-secret
      sourceSelector: exact-policy-selector
      pathClass: exact-policy-path-class
      sourceContractRule: exact-policy-rule
      sourceContractDigest: exact-digest | null
      sourceIdentityDigest: exact-digest
  capsule:
    directoryPath: exact-path
    directoryModeOctal: "0700"
    basename: exact-basename
    fileType: regular
    fileModeOctal: "0600"
    linkCountDec: "1"
    contentDigest: exact-sha256
  stdio:
    - fdDec: "0"
      purpose: stdin
      identityDigest: exact-digest
      topologyAttestation: reviewPortalStdioTopologyAttestationV1
    - fdDec: "1"
      purpose: stdout
      identityDigest: exact-digest
      topologyAttestation: reviewPortalStdioTopologyAttestationV1
    - fdDec: "2"
      purpose: stderr
      identityDigest: exact-digest
      topologyAttestation: reviewPortalStdioTopologyAttestationV1
  providerInheritedFdNumbersDec: ["0", "1", "2"]
  preExecFds:
    - {fdDec: "4", purpose: launch-handshake, disposition: close-before-exec}
    - {fdDec: "5", purpose: provider-executable, disposition: cloexec}
    - {fdDec: "6", purpose: provider-cwd, disposition: cloexec}
    - {fdDec: "7", purpose: executable-parent, disposition: cloexec}
~~~
