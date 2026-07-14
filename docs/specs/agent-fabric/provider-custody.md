# Agent Fabric provider route, budget, and lifecycle custody

## Provider-budget custody and Console decision projections

The current baseline gives each task-bound ephemeral provider action an immutable authority, task and canonical JSON reservation/settlement vector. Each vector key is a recognised qualified unit; the settlement value is an exact non-negative amount or the closed `unknown` marker, and action custody is `reserved | settled | usage-unknown`. SQLite triggers validate same-run
authority/task ownership, non-terminal task state, available `granted - reserved - consumed` capacity and complete vector shape, then couple every insert/state transition to `authority_budget`. They reject direct contradictory writes, rebinding, reversal, status mismatch, negative capacity and task terminal transition while a bound action remains open.

Fabric injects default `maxTurns: 1` for ordinary one-shot work before hashing or dispatch. Certifying review is the closed exception owned by the resolved target profile: direct-portal Claude/Codex may reserve up to 128 SDK turns and 112 portal calls/10 MiB, preserving 16 planning/final turns, while portal-helper Cursor/Agy reserve one Fabric turn plus at most 128 instrumented
helper calls/10 MiB. Both reserve the exact at-most-80-read/6-MiB mandatory set plus 32 direct or 48 helper exploration calls/4 MiB. An adapter that cannot enforce or reach them advertises certifying-review-packet-only.v1 false. The custody reserves `turns`, `review_read_ops`, `review_read_bytes`, one `provider_calls` and one `concurrent_turns` when configured, plus each
delegated cost, provider-qualified token and wall-clock dimension. It does not debit unrelated descendant, message or artifact capacity.

Because provider turns may exceed the public protocol's 30-second request maximum, task-bound answer-bearing spawn is a durable asynchronous action. Dispatch commits `prepared` custody and its command receipt atomically, then returns promptly while exactly one tracked daemon completion owns adapter I/O. A bounded FIFO worker claims `prepared -> dispatched` only within the
shared provider-turn ceiling. The chair uses `provider-action.read` to observe the terminal answer digest and safe structured review result; it does not redispatch. Raw certifying-review output remains daemon-private. Ordinary noncertifying local reconciliation cannot look up or quarantine queued or active work. Every certifying action instead enters the sole the provider-custody recovery contract
recovery owner before generic scans. Transport loss leaves the action live, daemon shutdown drains tracked work before adapter/database close, and restart uses the typed owner without blind replay.

Terminal adapter evidence moves exact usage to consumed and releases unused and concurrency reservation. A missing applicable usage value becomes unknown; an ambiguous action retains its reservation. Recovery validates an answer-bearing terminal lookup or replay before settlement. Empty, oversized or invalid non-review answer evidence is quarantined and freezes unproved
dimensions. Unsafe/malformed certifying-review output commits `UNUSABLE`, remains private/non-certifying and may still settle independently exact usage. A later authenticated reconciliation may retry the adapter's stable lookup and move unknown dimensions to exact settlement; clearing the authority-level unknown flag requires no other unknown owner. This specification is the closed
certifying exception: every proved-effect terminal settles exact authenticated usage or charges the remaining reservation, and its single recovery owner performs at most one pair lookup.

Operator projection joins an Attention gate only by exact gate ID, project session and coordination run, and exposes only pending/deferred rows. Intake read reconstructs a successor-request seed from stored message context and the current chair row; changed conversation correlation is recovery-required, and missing provider-session continuity yields no seed. Both paths use
strict current protocol schemas and add no Console-owned state.

The Claude certifying-review adapter receives only the bounded daemon-composed envelope and action-pair-only review-bundle portal. Its model-visible namespace has an empty read-only cwd and no HOME; any trusted per-action auth capsule remains outside that namespace under OS confinement. It has no project/workspace/plugin/source MCP,
Glob/Grep/Bash/edit/write/browser/general-network tool, and no portal other than the exact digest-bound Fabric portal. Cursor and Agy apply the same substrate rule. Unsupported adapters/platforms advertise certifying-review-packet-only.v1 false and fail before provider I/O. Explicit opus effort max does not change those bounds. Non-review provider work retains its separately
admitted source-tool policy.

Deterministic verification additionally covers conditional vector-reserve races, task-completion races, crash/restart settlement, direct-SQL invariant attacks, immutable action/budget binding, replay after task completion, adapter turn-cap enforcement, mixed exact/unknown usage and later reconciliation, recovered-answer validation, gate/intake positive and negative projections,
and Claude traversal/absolute/symlink/tool-denial fixtures.

## Provider launch contract and route admission

After creating a directory no-follow and fsyncing its manifest/root, the daemon captures device, inode, the root's positive observed link count and the actual entry-manifest digest, which includes every entry's actual link count. The captured manifest is exactly:

~~~yaml
reviewPortalActionArtifactCapturedManifestV1:
  schemaVersion: 1
  role: synthetic-home | synthetic-temp
  captureKind: complete | partial-recovery
  expectedEntryCountDec: nonnegative
  capturedEntryCountDec: nonnegative
  entries:
    - ordinalDec: positive-contiguous
      relativePath: exact-source-relative-path
      fileType: directory | regular
      modeOctal: "0700" | "0600"
      actualLinkCountDec: positive
      contentLengthDec: nonnegative | null
      contentDigest: exact-sha256 | null
~~~

Entries preserve source-manifest ordinal order. Directory content fields are null; regular files have actual link count one and equality-copy source length/ digest. Expected count equals the source count. Complete capture has captured count equal expected; partial recovery has a strictly smaller captured count and the exact source prefix. Temp is the complete zero/zero/empty
arm. The `actual_entry_manifest_digest` uses domain `agent-fabric-portal-action-artifact-captured-manifest-v1`, `0x00` and JCS of this complete object. Rust/TypeScript goldens cover empty temp, zero/nonzero HOME, nested-directory link counts and every valid prefix; permutation, nonprefix and guessed-link mutants fail. `actual_identity_digest` uses domain
`agent-fabric-portal-action-artifact-identity-v1`, `0x00` and JCS of exactly `[role,captureKind,deviceDec,inodeDec,linkCountDec, actualEntryManifestDigest,sourceContractDigest]`. `captureKind` is `complete` after normal construction or `partial-recovery` only while recovering a reserved pre-process crash. Captured root identity and manifest never change. Process insert/ACK
requires both roles captured as `complete` and exact intent/ envelope/source-contract equality; process and intent copy both artifact-intent digests.

The exact phase/presence machine is:

- `reserved` with canonical and claim both absent writes no-effect cleanup evidence and CASes directly to `removed`. With canonical present and claim absent, recovery opens it no-follow and accepts only the complete expected pre-exec manifest or an exact no-extra ordinal prefix produced by the deterministic parent-before-child builder; it captures the corresponding kind and
  CASes to `captured`. Any claim presence or unproved canonical object is integrity failure;
- `captured` accepts either the exact canonical inode with claim absent, in which case it renames canonical to claim no-replace and fsyncs the root, or canonical absent with that exact inode already at claim, the crash-after- rename arm. It then CASes to `claimed`. Both present, both absent or another inode is integrity failure;
- `claimed` accepts canonical absent plus the exact claimed root, removes it as below, fsyncs the root and CASes to `removed`; canonical and claim both absent is the crash-after-remove arm and also fsyncs before that CAS. Any canonical reappearance, crossed inode or both present is integrity failure; and
- `removed` requires both names absent. `integrity-failure` never deletes.

Before provider exec, a partial prefix never becomes process-bound. After the provider root is killed and reaped, provider-created cache/temp descendants and content drift inside the proved root are expected: cleanup first atomically claims the unchanged root inode, then performs a bounded no-follow postorder walk using retained directory FDs. It may unlink arbitrary descendant
names, regular hard links, symlinks, sockets and regular files without following or reading them, but never crosses the root device, a nested mount, descriptor identity or the activated-root boundary. The activated adapter contract pins and enforces lifetime quotas no larger than 65,536 descendants, depth 32 and 1 GiB allocated bytes; exceeding a quota is integrity failure, not
unbounded work. Reserved pre-process recovery remains strict-prefix only because no provider has run. Every removed child/directory and final parent is fsynced; a closed cleanup-evidence manifest binds encountered relative path/type/device/ inode, deletion order and final absence without exposing file content.

Crash/direct-SQL fixtures cover absent `reserved -> removed`, every entry- creation prefix, complete/partial capture, before/after rename/fsync/CAS, before/after every child and root removal, provider-created cache/temp/symlink/ socket entries, quota and nested-mount rejection, both accepted crash-presence arms and every crossed name/inode/root combination.

The activated adapter contract registers exactly one immutable certifying provider launch policy. `launch_policy_json` byte-equals RFC 8785 JCS of this closed object; `launch_policy_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-provider-launch-policy-v1`, one `0x00` byte and those exact JCS bytes:

~~~yaml
reviewPortalProviderLaunchPolicyV1:
  schemaVersion: 1
  adapterId: exact-adapter
  contractDigest: exact-contract
  argv:
    maxCountDec: positive
    maxTotalUtf8BytesDec: positive
    template:
      - ordinalDec: positive-contiguous
        tokenKind: fixed-literal | option-name | sourced-value
        exactValue: exact-nul-free-utf8 | null
        exactValueDigest: exact-sha256 | null
        optionValueSlotOrdinalsDec: [strictly-increasing-positive-decimal]
        ownerOptionOrdinalDec: nonnegative
        ownerOptionValueIndexDec: nonnegative
        sourceKind: none | resolved-model | resolved-effort |
          executable-path | action-locator | stdin-mode | synthetic-path
        sourceSelector: none | effective-config-model |
          effective-config-effort | activated-executable-path |
          review-socket-locator | review-action-id | review-contract-digest |
          provider-stdin-mode | synthetic-home-path | synthetic-temp-path |
          credential-capsule-path | empty-cwd-path
        pathClass: not-path | review-socket | synthetic-home |
          synthetic-temp | credential-capsule | empty-cwd | executable
        sourceContractRule: none | effective-configuration-field |
          effective-configuration-executable | action-identity |
          action-review-socket | action-synthetic-home |
          action-synthetic-temp | action-credential-capsule |
          activation-empty-cwd | launch-policy-stdin-mode
        slotDigest: exact-digest
    forbidUnknownOption: true
    forbidShellOrInterpreterEval: true
    forbidWorkspaceCwdConfigPluginMcpToolOverrides: true
  environment:
    maxCountDec: positive
    maxTotalValueBytesDec: positive
    admitted:
      - name: exact-name
        sourceKind: fixed-literal | synthetic-home | synthetic-temp |
          credential-capsule | action-locator | adapter-secret
        sourceSelector: policy-fixed-literal | daemon-synthetic-home |
          daemon-synthetic-temp | prospective-credential-capsule |
          review-socket-locator | review-action-id | review-contract-digest |
          adapter-secret-version
        pathClass: not-path | review-socket | synthetic-home |
          synthetic-temp | credential-capsule
        allowEmpty: true | false
        fixedValue: exact-nul-free-utf8 | null
        fixedValueDigest: exact-sha256 | null
        sourceContractRule: none | action-synthetic-home |
          action-synthetic-temp | action-credential-capsule |
          action-review-socket | action-identity | adapter-secret-version
        entryDigest: exact-digest
    inheritParent: false
    mandatoryDeniedNames: [BASH_ENV, ENV, GIT_CONFIG, GIT_CONFIG_COUNT,
      GIT_DIR, GIT_WORK_TREE, LD_AUDIT, LD_LIBRARY_PATH, LD_PRELOAD,
      NODE_OPTIONS, PERL5OPT, PYTHONINSPECT, PYTHONPATH, RUBYOPT]
    mandatoryDeniedPrefixes: [DYLD_, GIT_CONFIG_KEY_, GIT_CONFIG_VALUE_]
  pathClasses:
    synthetic-home: action-private-directory-under-activated-home-root
    synthetic-temp: action-private-directory-under-activated-temp-root
    credential-capsule: action-private-regular-file-under-custody-directory
    empty-cwd: activation-owned-empty-read-only-directory
    review-socket: action-private-unix-socket-under-custody-directory
    executable: effective-configuration-opened-executable
    real-home-user-project-workspace-provider-source: denied
~~~

`argv.template` is the complete ordered grammar, including argv[0], every literal, every option and every option/positional value. Its ordinals are positive and contiguous. Each entry has exactly the displayed fields and the following closed truth table:

- `fixed-literal` has non-null `exactValue`/matching digest, an empty option- slot array, zero owner ordinals, and `none`/`none`/`not-path`/null source fields and `sourceContractRule=none`;
- `option-name` has non-null exact option spelling/matching digest, a nonempty strictly increasing unique list of the sourced-value ordinals it owns, zero owner ordinals, and the same null source fields. Its declared arity is exactly that list's length; and
- `sourced-value` has null exact value fields and an empty option-slot array. A positional value uses owner/index zero. An option value names one earlier `option-name` ordinal and its positive one-based index, and the inverse option list must name that ordinal in the same position. Its non-`none` source kind, selector, path class and source-contract rule must match the closed
  selector table below. No other combination exists.

`slotDigest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-provider-launch-policy-argv-slot-v1`, one `0x00` byte and RFC 8785 JCS of the complete slot object with only `slotDigest` omitted. Consequently option name, arity, value ownership, source and path class are one contract-pinned unit, rather than labels supplied by an action. Fixed literal
and option values are pinned both in clear and by digest; they are nonsecret.

`environment.admitted` is strictly increasing by raw UTF-8 `name`, names are unique, and every entry has exactly the displayed fields. `fixed-literal` uses selector `policy-fixed-literal`, `not-path`, non-null fixed value/matching digest and source-contract rule `none`. Every other arm has null fixed fields and a non-`none` exact source-contract rule. Its selector uniquely
selects its source kind; synthetic/capsule/socket selectors use the identically named path class, while action-id, contract-digest and adapter-secret use `not-path`. `entryDigest` uses domain `agent-fabric-portal-provider-launch-policy-environment-entry-v1`, `0x00` and JCS of the complete entry with only `entryDigest` omitted. Mandatory denied-name and denied-prefix arrays are
each strictly increasing by raw UTF-8 bytes and duplicate-free. Every option-value ordinal array is also strictly increasing and duplicate-free. JCS object-key ordering is not used as a substitute for these array invariants.

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

The environment `review-socket-locator`, `review-action-id` and `review-contract-digest` selectors reuse the matching argv tuples. No selector may appear under any other kind/class/rule tuple.

A contract may narrow the displayed selectors or add denied names/prefixes; it may not remove a mandatory denial. The exact template leaves no unknown option, arity or free literal. Shell/interpreter evaluation, arbitrary command strings and any cwd/workspace/config/plugin/MCP/tool or real user/HOME/project/provider- source path override are structurally unrepresentable. The
trusted activation loader, not an action caller, inserts the one policy row and recomputes every entry/slot/policy digest; it is immutable and nondeletable while any configuration/envelope cites it.

The policy is contract-global. It contains only the displayed stable rule enums, never an action path, daemon instance, current inode, secret version or prospective artifact identity. Every `*Dec` in policy, envelope, source-contract and closure JSON is a canonical unsigned decimal string with no leading zero; positive excludes `"0"`. Template/source-contract ordinals are
contiguous and unique. All other digest-bearing arrays are either explicitly ordered above or strictly increasing by their stated raw UTF-8/digest key and duplicate-free; no implementation-defined set iteration may enter a digest preimage.

`launch_envelope_json` byte-equals RFC 8785 JCS of this exact closed action object:

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

Every envelope argv row equality-copies its policy slot digest, token/owner fields, source selector, path class and source-contract rule. Fixed-literal and option-name values must byte-equal their policy value. A sourced value is derived only from its selector and references the one matching source-contract child digest; it cannot relabel itself. Every environment row
equality-copies the matching policy entry's name/source selector/path class and, for fixed literals, must byte-equal the policy value. The envelope has exactly all policy template and environment rows and no other argv token or environment name. Fixed rows use a null source-contract digest; every nonfixed row uses the digest of exactly one `sourceContracts` member whose
selector/kind/path class satisfies its policy rule.

Every `sourceContracts` member has exactly the displayed wrapper and one closed arm object. Effective-configuration field, executable, action-identity, policy- stdin and secret-version arms contain respectively the exact effective- configuration field/value commitment, opened-executable identity/closure commitment, action/contract semantic value, policy slot/value commitment,
or private secret id/revision/version commitment. Filesystem arms contain the prospective canonical path, parent/root identity digest, basename, expected file type, owner/mode/ACL/xattr/mount policy, link count and expected content digest where applicable. `review-socket` requires socket/link-count one; `credential-capsule` requires regular/0600/link-count one and the expected
capsule-content digest; synthetic HOME requires a private 0700 directory with only its exact auth/config manifest, synthetic temp requires a private 0700 empty directory under its activated root, and empty cwd equality-copies the activation-owned 0500/empty/read-only contract. No prospective arm contains a guessed child inode.

`sourceContract` is exactly this common closed object; `bindingKind` byte-equals the enclosing `sourceContractKind`, and `binding` is exactly one object from the exhaustive list below:

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

`fieldName=model` is permitted only for selector `effective-config-model` and `fieldName=effort` only for `effective-config-effort`; the value/length/digest byte-equal the corresponding envelope argv row and effective configuration.

The `activated-executable` object is:

~~~yaml
reviewPortalActivatedExecutableSourceV1:
  effectiveConfigurationDigest: exact-envelope-digest
  executableIdentityDigest: exact-envelope-digest
  canonicalPath: exact-absolute-path
  canonicalPathDigest: exact-sha256
  transitiveExecutableClosureDigest: exact-closure-digest
~~~

It is permitted only for `activated-executable-path`; the path byte-equals argv[0], and identity/closure byte-equal the no-follow opened executable fields in the provider closure; this introduces no second executable-closure digest. `canonicalPathDigest` is `sha256:` plus lowercase SHA-256 of `agent-fabric-portal-canonical-path-v1`, `0x00` and the exact UTF-8 path bytes. This
is also the definition wherever that field appears below.

The `action-identity` object is:

~~~yaml
reviewPortalActionIdentitySourceV1:
  identityKind: action-id | contract-digest
  exactValue: exact-nul-free-utf8
  exactValueLengthDec: nonnegative
  exactValueDigest: exact-sha256
~~~

The kind/selector is respectively `action-id`/`review-action-id` or `contract- digest`/`review-contract-digest`; `exactValue` byte-equals the common outer action ID or contract digest and its envelope value.

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

The path is the byte-exact canonical join of recovery root, custody basename and socket basename; its directory is prospective and no child inode appears.

`recoveryRootIdentityDigest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-recovery-root-identity-v1`, one `0x00` byte and RFC 8785 JCS of exactly this object:

~~~yaml
reviewPortalRecoveryRootIdentityV1:
  canonicalPath: exact-intent-recovery-root-path
  deviceDec: nonnegative
  inodeDec: positive
~~~

All three fields equality-copy the opened recovery-root FD and intent columns. `custodyDirectoryContractDigest` is formed the same way with domain `agent-fabric-portal-prospective-custody-directory-v1` and JCS of exactly:

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

`exactChildRoles` has that literal order. Intent, socket and capsule source arms equality-copy both digests; Rust/TypeScript goldens cross root path/device/inode, action, daemon, directory name, child name, owner and role order.

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

Its `rootContractDigest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-activated-synthetic-root-v1`, one `0x00` byte and JCS of that complete object. Root JSON/digest and path/device/inode byte-equal the immutable activation row. The mount object uses the same unsigned fsid, known-flag ordering and unknown-flag rejection rules as the exact cwd
mount identity below. Role, daemon, path/stat/owner/mode/ACL/mount permutations have cross-language goldens.

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

The home path is one direct action-derived child of its named activated root; root stat/owner/ACL/mount come from activation rather than caller input. Entries are strictly increasing by raw UTF-8 relative path, unique, parent-before-child, contain no empty/`.`/`..` segment and are only daemon-generated auth/config content admitted by the adapter contract. Directories have mode
0700 and null content fields and use `positive-observed-after-create`; regular files have mode 0600, `exactly-one` and exact non-null length/digest. Prospective manifest bytes contain no guessed directory link count. The artifact-custody capture persists each actual positive directory count and revalidates it during cleanup. `entryCountDec` equals array length and may be zero
only for an adapter requiring no auth/config file. `entryManifestDigest` uses domain `agent-fabric-portal-synthetic-home-entry-manifest-v1`, `0x00` and JCS of the complete entries array. Symlinks, regular-file hard links, devices and extra files are forbidden. Directory alias denial uses exclusive no-follow creation beneath the retained activation root plus mount/namespace
custody checks; it never assumes a POSIX directory has link count one. Linux/macOS goldens cover nested directories with their platform-observed positive counts.

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

It is one direct action-derived child of the activated temp root and remains empty through post-ACK validation. Cross-language goldens cover empty and nonempty HOME manifests, nested parent ordering, and the empty temp arm.

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

The path is the byte-exact canonical join of recovery root, custody basename and capsule basename and equality-copies the intent/closure prospective capsule.

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

It byte-equals the later closure `cwd` object and contains actual activation- owned directory identity, not an action-created prospective inode. Its common outer daemon/contract must equal its two identically named fields.

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

It is permitted only for selector `adapter-secret-version`; the commitment is recomputed from the effective configuration's selected secret version and material digest. It contains neither material nor environment value bytes. `secretMaterialDigest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-adapter-secret-material-v1`, one `0x00` byte and the
exact raw secret bytes. `secretVersionCommitmentDigest` uses domain `agent-fabric-portal-adapter-secret-version-v1`, `0x00` and RFC 8785 JCS of exactly `[adapterId,configurationId,configurationRevisionDec, effectiveConfigurationDigest,secretId,secretRevisionDec,secretMaterialDigest]`. Both digests remain private; daemon and stub recompute them from the selected version, and
goldens include leading-zero raw bytes and crossed revisions.

No field is optional and no additional field is admitted in the common object or any arm. The arm's common outer identities are equality-checked before its member digest. Rust and TypeScript share one golden and one crossed-identity/ wrong-field negative for every arm, plus home-versus-temp, action-id-versus- contract, model-versus-effort and prospective-versus-actual-inode
negatives.

Each child `source_contract_json` byte-equals JCS of the complete common `reviewPortalLaunchSourceContractV1` object, including its exact arm object. `source_contract_digest` uses domain `agent-fabric-portal-launch-source-contract-v1`, `0x00` and JCS of the complete envelope member wrapper -- exactly `ordinalDec`, `sourceSelector`, `sourceContractKind`, `pathClass` and that
parsed common `sourceContract` -- with only `sourceContractDigest` omitted. The child row's integer ordinal is rendered to its canonical `ordinalDec`; its selector/kind/path-class columns must byte-equal the wrapper/common-object values. `sourceContractSetDigest` uses domain `agent-fabric-portal-launch-source-contract-set-v1`, `0x00` and JCS of the ordinal-ordered array of
canonical persisted `sha256:` plus 64 lowercase- hexadecimal member-digest strings. Rust/TypeScript golden vectors include an empty-leading-byte digest and reject raw-byte, base64, uppercase and bare-hex encodings. The relational child rows are exactly the envelope array: contiguous, no missing/extra/duplicate selector or digest. They first reference one `building` header. A
generated sealing trigger recomputes every child JCS/digest and the ordered set root, requires exactly `member_count` rows with ordinals `1..member_count`, then performs the only header transition `building/revision 1 -> sealed/revision 2`. A sealed header and all its rows are immutable and nondeletable. An envelope can reference only the exact sealed header/member-count/root
through its composite FK, so a zero, partial or reordered set cannot admit an envelope. The daemon commits set rows, seal, envelope, closure and custody intent in one transaction; every failure rolls the whole transaction back.

Each `sourceIdentityDigest` is `sha256:` plus lowercase SHA-256 of its arm's ASCII domain label, one `0x00` byte and RFC 8785 JCS of the exact array shown:

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

The full domain is the prefix plus the displayed suffix. The prospective- capsule contract is the pre-intent path/name/mode/type/link-count/content contract below, never a guessed inode. Synthetic-root contracts bind the activation-owned root path/stat/owner/mode/ACL/mount/empty-state/read-only commitment. The action-locator contract binds its semantic role and prospective
object contract. The adapter-secret commitment is the effective configuration's private secret-id/revision/material-digest commitment; raw secret bytes never enter policy, envelope, closure or logs. Fixed option-name rows use the fixed-value arm. These are the only source identity preimages. Rust/TypeScript golden and negative vectors cover the activated-executable arm,
including crossed effective configuration, executable identity, canonical path, source contract and argv[0] bytes.

Envelope admission recomputes every source contract and identity from the outer adapter/action/contract/daemon, the effective configuration, activated root contracts, policy, daemon-owned locators and private secret version. It rejects an inner outer-identity mismatch. The exec closure equality-copies the complete source-contract array/set digest. The custody intent
equality-copies the envelope/set digests and recomputes prospective home/temp/socket/capsule paths, names, types, modes, link counts and content digests from those children; the process-custody row equality-copies the same digests. Generated immutable triggers plus the daemon's pre-commit closed-object validator reject any crossed action/daemon/configuration, substituted arm,
missing child, or envelope- closure-intent field mismatch. Actual post-create identities may refine only the matching prospective arm and must preserve its contract; they never replace or self-certify it.

`launch_envelope_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-provider-launch-envelope-v1`, one `0x00` byte and those JCS bytes. The trusted renderer derives the envelope only from the exact provider- action effective configuration, activated contract/policy and daemon-owned action locators/secrets; caller argv/environment is never an
input. It validates every argv value/slot/owner/source identity, path class, limit, environment name/source/value identity and mandatory denial, then stores the envelope through the displayed composite FKs. The exec closure equality-copies `launchEnvelopeDigest`; its raw ordered argv rows and environment name/length/value-digest/source-selector/path-class/ source-identity
sequence must byte-equal the envelope. Daemon and stub hash their actual argv/environment bytes and require that equality before registration and after ACK. Configuration A with self-consistent argv/environment B, inherited parent environment, loader variables, real HOME/XDG/config paths or unsafe flags is terminal no-exec.

The provider exec closure is also closed and independently reproducible. `provider_closure_json` byte-equals RFC 8785 JCS of exactly this private object; every `*Dec` value is a canonical unsigned decimal string, all paths are absolute canonical UTF-8 with no NUL, `argv` order is executable order, and the environment/FD arrays use the stated order with no duplicate:

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

For certifying portal actions, the effective configuration's formerly opaque `executableIdentityDigest` is specialised to `agent-fabric-portal-executable-identity-v1`. It is `sha256:` plus lowercase SHA-256 of the ASCII bytes of that label, one `0x00` byte and RFC 8785 JCS of the exact `executable` object above with only `identityDigest` omitted. The closure's
`executable.identityDigest`, the effective-configuration value and the value recomputed by both daemon and stub from the opened executable must be byte-equal. The stub obtains path/parent/basename, stat fields and content from the actual FD/path; it independently invokes the activated platform code- identity verifier and transitive executable-closure verifier for their two
digests. Copying those two digests from configuration without verifying the actual executable is forbidden. Thus a self-consistent closure built from configuration A and executable B cannot be inserted or registered.

The cwd is one daemon-activation-owned empty directory created before any provider action, then opened no-follow as FD 6 and made mode 0500. It is not a workspace, HOME, auth, project or provider directory. `aclDigest`, `entrySetDigest` and `xattrSetDigest` hash, under respectively `agent-fabric-portal-empty-acl-v1`, `agent-fabric-portal-empty-directory-entry-set-v1` and
`agent-fabric-portal-empty-xattr-set-v1` plus one `0x00`, RFC 8785 JCS of the exact empty array. `mountIdentityDigest` uses the activated platform's closed mount identity. It is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-cwd-mount-identity-v1`, one `0x00` byte and RFC 8785 JCS of exactly this object:

~~~yaml
reviewPortalCwdMountIdentityV1:
  platform: darwin | linux
  mountPointPath: exact-canonical-path
  deviceDec: nonnegative
  fsidWordsDec: [exactly-two-u32-bit-pattern-decimal-values]
  filesystemType: exact-lowercase-ascii-kernel-type
  mountFlags:
    - strictly-ordered-subset-of: [read-only, no-suid, no-device, no-exec,
        synchronous, no-atime, journaled, local]
~~~

The two fsid words are decoded to their unsigned 32-bit bit patterns before decimal encoding; native signedness, padding and endian never enter the preimage. Unknown persistent mount flags fail activation rather than disappear. Rust/TypeScript golden vectors cover both platform arms, high-bit fsid words, flag permutations and different native padding/endian layouts.
`readOnlyEnforcementDigest` hashes the ASCII bytes `agent-fabric-portal-cwd-read-only-v1`, one `0x00` byte and JCS of this exact object:

~~~yaml
reviewPortalCwdReadOnlyEnforcementV1:
  platformIdentityDigest: exact-digest
  mountIdentityDigest: exact-digest
  canonicalPath: exact-path
  deviceDec: nonnegative
  inodeDec: positive
  ownerUidDec: nonnegative
  ownerGidDec: nonnegative
  modeOctal: "0500"
  aclDigest: exact-empty-acl-digest
  filesystemFlags: []
  outerSandboxContractDigest: exact-contract-digest
  enumerateEmptyCanaryDigest: exact-current-build-digest
  createWriteRenameDeleteMetadataDenyCanaryDigest: exact-current-build-digest
~~~

The daemon insert and stub independently enumerate FD 6 and require exactly no entry other than kernel `.`/`..`, no xattr, exact directory/stat/owner/mode/ACL/ mount identity and the activated read/write/metadata-denial evidence. The stub does so immediately before registration, again after ACK and once more after `fchdir(FD 6)` adjacent to exec; it also proves the canonical
path still names that FD. Replacement, population, symlink, mount, mode, owner, ACL, xattr, sandbox or denial-canary drift is terminal no-exec. The provider receives no directory FD, and capability is false unless current-build confinement canaries prove it cannot populate or mutate the cwd after exec.

Each `stdio[].identityDigest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-stdio-fd-identity-v1`, one `0x00` byte and RFC 8785 JCS of this exact kind-tagged object derived from the actual descriptor:

~~~yaml
reviewPortalStdioFdIdentityV1:
  fdDec: "0" | "1" | "2"
  purpose: stdin | stdout | stderr
  fileType: fifo | unix-stream | unix-seqpacket | character
  deviceDec: nonnegative
  inodeDec: positive
  rdevDec: nonnegative
  modeDec: positive
  accessMode: read-only | write-only | read-write
  statusFlags: [append | nonblocking | synchronous | data-synchronous]
  descriptorFlags: []
  canonicalDevicePath: exact-path | null
  localEndpointDigest: exact-sha256 | null
  peerEndpointDigest: exact-sha256 | null
  peerCredentialDigest: exact-sha256 | null
~~~

Each adjacent `topologyAttestation` is this exact object. Its `digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-stdio-topology-attestation-v1`, one `0x00` byte and RFC 8785 JCS of the object with only `digest` omitted:

~~~yaml
reviewPortalStdioTopologyAttestationV1:
  digest: exact-sha256
  daemonInstanceId: exact-daemon
  adapterId: exact-adapter
  actionId: exact-action
  contractDigest: exact-contract
  purpose: stdin | stdout | stderr
  topology: daemon-pipe | daemon-socketpair | daemon-pty | dev-null
  localIdentityDigest: exact-stdio-fd-identity-digest
  retention: daemon-until-provider-terminal
  peerDescriptor:
    oneOf:
      - null
      - owner: daemon
        ownerPidDec: positive
        ownerStartTimeDec: positive
        fdDec: nonnegative
        fileType: fifo | unix-stream | unix-seqpacket | character
        deviceDec: nonnegative
        inodeDec: positive
        rdevDec: nonnegative
        modeDec: positive
        accessMode: read-only | write-only | read-write
        statusFlags: [append | nonblocking | synchronous | data-synchronous]
        descriptorFlags: [cloexec]
        canonicalDevicePath: exact-path | null
        localEndpointDigest: exact-sha256 | null
        peerEndpointDigest: exact-sha256 | null
        peerCredentialDigest: exact-sha256 | null
~~~

The root daemon/action/contract and purpose equal the enclosing closure/stdio entry, and `localIdentityDigest` equals that entry's `identityDigest`. Dev-null alone has null peer; every daemon-created topology has the exact nonnull daemon peer descriptor above. Peer `descriptorFlags` is exactly `[cloexec]`, so it cannot leak if the daemon later launches another process.

The three endpoint fields are null for FIFO/character and nonnull for a socket. A local or peer endpoint digest hashes, under respectively `agent-fabric-portal-fd-local-endpoint-v1` or `agent-fabric-portal-fd-peer-endpoint-v1` plus one `0x00`, RFC 8785 JCS of this closed object:

~~~yaml
reviewPortalFdEndpointV1:
  platform: darwin | linux
  family: AF_UNIX
  socketType: stream | seqpacket
  addressKind: unnamed | pathname | abstract
  addressLengthDec: nonnegative
  addressBase64url: unpadded-base64url-of-exact-logical-address-bytes
~~~

The effective `sun_path` span comes from the returned socket-address length, not `sizeof(sockaddr_un)`. Unnamed has zero length/empty bytes. Pathname removes exactly one terminal NUL when present and rejects any embedded NUL. Linux abstract retains its leading NUL and every later byte. No native padding, uninitialised byte or host-endian integer enters the preimage.

`peerCredentialDigest` hashes the ASCII domain `agent-fabric-portal-fd-peer-credential-v1`, one `0x00` byte and RFC 8785 JCS of exactly one closed arm:

~~~yaml
reviewPortalFdPeerCredentialV1:
  oneOf:
    - platform: darwin
      pidDec: positive
      effectiveUidDec: nonnegative
      groupIdsDec: [strictly-increasing-nonnegative]
      auditTokenWordsDec: [exactly-eight-u32-decimal-values]
    - platform: linux
      pidDec: positive
      uidDec: nonnegative
      gidDec: nonnegative
~~~

Fields are decoded from kernel APIs before hashing; native credential-struct padding/endian is forbidden. `statusFlags` is the strictly ordered observed subset of the four displayed semantic flags; any other persistent status flag fails activation. The exact empty `descriptorFlags` proves stdio survives exec without `FD_CLOEXEC`. Creation-only flags are not part of `F_GETFL`
and have no field. Daemon and stub derive this local object independently; fd number/purpose/type/ stat/access/flags/local-endpoint/observable-peer mismatch fails before registration and again after ACK. The stub does not derive or claim visibility of the daemon-private `topologyAttestation.peerDescriptor`. Rust/TypeScript vectors cover unnamed, terminal-NUL pathname,
embedded-NUL rejection, Linux abstract addresses, returned-length truncation and deliberately different native padding/endian layouts that must canonicalise identically.

Stdio is an admitted daemon-created topology, never an arbitrary inherited vnode or connection. The daemon alone derives each exact topology attestation from both descriptors while it owns them, embeds it beside the local identity in the closure, and revalidates its retained peer immediately before the process-row commit/ACK. The challenge's `providerClosureDigest` therefore
binds the attestation, its local-identity digest and the action/contract/daemon tuple seen by the stub. The stub independently derives and rechecks only its local identity; copying either local digest without that check is forbidden. Pipe endpoints must share exact device/inode and opposite access. Socketpairs must be the two exact endpoints and prove the declared daemon peer
credentials. A PTY must bind its daemon-created master/slave pair and contract-pinned device identity. Dev-null requires the attestation's null peer and local canonical path exactly `/dev/null`, revalidated as the platform's null character device.

Purpose/access admission is closed: stdin is daemon-pipe read-only, daemon-socketpair/daemon-pty read-write or `/dev/null` read-only; stdout/stderr are daemon-pipe write-only, daemon-socketpair/daemon-pty read-write or `/dev/null` write-only. Regular files, unrelated character devices, FIFOs not created for this action, arbitrary sockets/TTYs, wrong-direction endpoints and any
descriptor whose vnode/endpoint is derived from a project, user, HOME, auth or provider path are no-exec. The daemon retains every peer; it never hands one to the supervisor. Closure insertion cannot accept caller-supplied provenance.

`argv` contains at least one element, `argv[0]` is the configured executable argument, and every element is NUL-free UTF-8. The environment array is strictly increasing by raw UTF-8 name bytes; each name is nonempty and contains neither NUL nor `=`, and each exact value is NUL-free. No duplicate is allowed. `valueDigest` is `sha256:` plus lowercase SHA-256 of the exact value
bytes and the private closure row is never public, logged or model-visible. `stdio` and `preExecFds` have exactly the displayed order and membership. The closure has no unknown key. `provider_closure_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-provider-closure-v1`, one `0x00` byte and those exact JCS bytes. Its row composite-foreign-keys
the one provider- action effective configuration, action pair and activated contract; the intent and process row equality-copy that same digest. Intent triggers additionally require the capsule directory path to be the recovery-root/custody-basename join and equality-copy its basename and expected content digest; the fixed 0700/0600/regular/single-link policy admits no
alternative. Insert triggers recompute the JCS/digest and every displayed configuration/action/contract/ daemon field. Triggers recompute every `topologyAttestation.digest`, equality- copy its daemon/adapter/action/contract/purpose/local-identity values to the enclosing closure and stdio entry, enforce the exact topology/peer-null arm and reject caller-supplied attestation
evidence.

The closure's capsule arm is prospective: it binds the canonical intended path, basename, exact modes/type/link policy and expected content, never a device or inode that cannot exist before intent. Its directory path is the byte-exact join of the already canonical recovery-root path and reserved custody basename; it does not claim `realpath` of a not-yet-created directory.
Before intent commit, the daemon opens the executable and its parent no-follow, opens the cwd, captures stdio, closes all unlisted descriptors and builds the closure from the actual argv/environment bytes it will give the stub. Only after the intent/open transaction commits may it create/fsync the capsule and directories and capture their actual device/ inode/link/content
identities into process custody. The pinned stub inherits the closure values in private memory plus executable FD 5, cwd FD 6 and executable-parent FD 7. Immediately before registration it independently rehashes the executable through FD 5, revalidates its parent/basename with FD 7, enumerates the complete FD table, revalidates cwd/stdio and opens the actual capsule no-follow
to prove it meets every prospective capsule field, reconstructs the exact argv/environment and closure JCS and equality-checks both expected closure bytes and digest. After a valid ACK it repeats that derivation, capsule proof and equality check, uses FD 6 for `fchdir`, performs one final no-follow executable path-to-FD identity check and invokes the executable with those same
argv/environment bytes with no intervening callback or provider code. Platforms with an identity-stable exec-from-FD primitive must use it; otherwise the activated contract must prove the final daemon-private executable path cannot be mutated by the provider and run the last check immediately adjacent to `execve`. Failure keeps capability false. FDs 5, 6 and 7 are close-on-exec
and FD 4 is already closed, so provider entry has exactly 0, 1 and 2. The stub never owns supervisor control FD 3. Swapped executable/path/inode/content/code identity, argv, environment value/order, cwd, capsule, stdio, extra/missing FD or post-ACK substitution is terminal no-exec.

`control_fd_number` is always 3 and identifies the supervisor-only daemon channel; the stub never inherits it. Its pre-exec-only `registration_fd_number` is always 4; provider-executable, cwd and executable- parent FDs are always 5, 6 and 7. The daemon obtains exactly 32 raw bytes from the OS CSPRNG before the intent transaction. `launch_nonce_digest` is `sha256:` plus
lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-launch-nonce-v1`, one `0x00` byte and those raw nonce bytes. `intent_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-filesystem-intent-v1`, one `0x00` byte and RFC 8785 JCS of the closed row object containing that nonce digest and every other immutable intent field except
`intent_digest` itself. The digest is globally unique; a collision or attempted reuse aborts setup. Raw nonce bytes exist only in daemon memory and the private FD-4 exchange, are never logged or persisted, and are destroyed when that exchange closes. Reserved-arm recovery never reconstructs or reuses them.

`launch_action_binding_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-action-binding-v1`, one `0x00` byte and RFC 8785 JCS of this exact array, in order:

~~~json
["reviewPortalLaunchActionBindingV1", "adapterId", "actionId",
 "contractDigest", "daemonInstanceId", "filesystemIntentDigest",
 "launchNonceDigest", "providerClosureDigest", "launchEnvelopeDigest",
 "sourceContractSetDigest", "homeArtifactIntentDigest",
 "tempArtifactIntentDigest"]
~~~

The quoted field labels above denote their exact row values, not literal placeholder strings. All persisted SHA-256 values use `sha256:` plus 64 lowercase hexadecimal characters. A wire field named `*Digest` is the raw 32 bytes decoded from that representation.

FD 4 is one private `AF_UNIX/SOCK_STREAM` socketpair created with close-on-exec. The daemon endpoint is never inherited. The supervisor closes its duplicate of the child endpoint immediately after fork; only the pinned launch stub retains it. Before fork, the supervisor receives and pins the expected action-binding, intent, stub-identity and provider-closure digests in private
launch memory. The handshake uses exactly these three binary frames; integers are unsigned 64-bit big-endian and every magic includes its displayed terminal NUL:

~~~text
launchChallengeV1 — exactly 136 bytes
  0..7     ASCII "AFCHAL1\0"
  8..39    raw launch nonce
  40..71   launchActionBindingDigest
  72..103  filesystemIntentDigest
  104..135 providerClosureDigest

launchRegistrationV1 — exactly 216 bytes
  0..7     ASCII "AFREGV1\0"
  8..39    raw launch nonce
  40..71   launchActionBindingDigest
  72..103  filesystemIntentDigest
  104..111 supervisorPid
  112..119 supervisorStartTime
  120..127 providerRootPid
  128..135 providerRootStartTime
  136..143 processGroupId
  144..151 sessionId
  152..183 launchStubIdentityDigest
  184..215 providerClosureDigest

launchAckV1 — exactly 208 bytes
  0..7     ASCII "AFACKV1\0"
  8..39    raw launch nonce
  40..71   launchActionBindingDigest
  72..103  filesystemIntentDigest
  104..135 launchRegistrationDigest
  136..167 processCustodyLaunchDigest
  168..175 launchRowRevision
  176..207 providerClosureDigest
~~~

The daemon writes exactly one challenge. The stub validates its magic, nonce length and all three expected digests before changing process topology, then establishes the group/session, captures the six positive process integers, writes exactly one registration and calls `shutdown(SHUT_WR)`. The daemon reads that direction to EOF and accepts only exactly 216 bytes; EOF/timeout
before 216, any byte after 216, a second frame, a nonpositive or out-of-signed-64-bit integer, crossed digest, wrong nonce, wrong directly observed PID/start/PGID/ session/parentage or wrong independently measured stub/provider identity fails without a custody insert or ACK. `launch_registration_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-portal-launch-registration-v1`, one `0x00` byte and the exact 216 registration bytes.

`process_custody_launch_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-process-custody-launch-v1`, one `0x00` byte and RFC 8785 JCS of this exact array in order. Every SQL integer is represented in the array as its canonical unsigned base-10 string with no sign or leading zero; the displayed nulls are JSON nulls:

~~~json
["reviewPortalProcessCustodyLaunchV1",
 "adapterId", "actionId", "contractDigest", "daemonInstanceId",
 "filesystemIntentDigest", "launchNonceDigest",
 "launchActionBindingDigest", "launchRegistrationDigest", "1",
 "supervisorPid", "supervisorStartTime", "providerRootPid",
 "providerRootStartTime", "processGroupId", "sessionId",
 "supervisorExecutableIdentityDigest", "launchStubIdentityDigest",
 "providerClosureDigest", "launchEnvelopeDigest", "sourceContractSetDigest",
 "synthetic-home", "homeArtifactIntentDigest", "synthetic-temp",
 "tempArtifactIntentDigest",
 "ancestryManifestDigest", "recoveryRootPath",
 "recoveryRootDevice", "recoveryRootInode", "recoveryRootIdentityDigest",
 "custodyDirectoryBasename", "custodyDirectoryContractDigest",
 "claimDirectoryBasename", "custodyDirectoryDevice",
 "custodyDirectoryInode", "claimDirectoryDevice", "claimDirectoryInode",
 "agent-fabric-custody-claim-v1", "socketBasename",
 "socketClaimBasename", "socketFileDevice", "socketFileInode", "1",
 "socketIdentityDigest", "canonical", "capsuleBasename",
 "capsuleClaimBasename", "capsuleFileDevice", "capsuleFileInode", "1",
 "capsuleContentDigest", "canonical", "3", "4", "5", "6", "7", "waiting",
 "preparing", "active", null, "0", null, "1", "createdAt", "updatedAt"]
~~~

Again, camel-case labels denote exact corresponding row values; quoted enum and fixed-number values are literal. The first `"1"` is `launch_row_revision`; the final `"1"` is the initial mutable row `revision`. The launch digest deliberately excludes itself and `launch_ack_digest`, making the construction acyclic. `createdAt` and `updatedAt` are the exact canonical stored
timestamps and are equal at insertion.

Golden vectors cover every binding/registration/launch/ACK digest with distinct envelope-daemon and source-set values. Negative fixtures cross an otherwise self-consistent envelope, closure, intent or process row from another daemon, action or set, omit/duplicate/reorder a source-contract child, and mutate one prospective path/type/mode/link/content field; every arm is terminal
no-exec before ACK.

The daemon constructs the ACK from that committed launch object. `launch_ack_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes `agent-fabric-portal-launch-ack-v1`, one `0x00` byte and the exact 208 ACK bytes. One transaction inserts the row with both computed digests, `launch_row_revision=revision=1` and the displayed initial states. Only after that transaction
commits may the daemon write the one ACK and call `shutdown(SHUT_WR)`. The stub reads the daemon direction to EOF after the challenge already consumed and accepts only exactly 208 remaining bytes with all nonce/action/intent/registration/revision/provider-closure fields equal. Partial, trailing, duplicate, replayed or crossed ACK input closes FD 4 and exits without provider
exec. A valid ACK also closes FD 4 completely before the final parent-liveness check and in-place exec. The entire exchange has the contract-pinned 5,000-ms monotonic deadline; EOF/HUP or expiry at any stage is terminal no-exec.

connection_state is `waiting|consumed|closed`; process_state is `preparing|running|terminating|cleaned|integrity-failure`. Only the owning supervisor/recovery CAS may advance them. The daemon starts the provider child by first creating/retaining the per-action listener, a one-use registration socketpair and the pinned supervisor with control FD 3. The supervisor forks a pinned
Rust launch stub, not provider code, and passes only the other registration endpoint as FD 4. The stub establishes its dedicated group/session, reports its exact registration directly to the daemon, then remains blocked pre-exec while watching both daemon and parent liveness. The daemon validates that report, commits the complete custody row with the exact
nonce/action/registration/row/ ACK digests above, and sends the one matching ACK. Only then may the stub close FD 4, recheck parent liveness and exec the pinned provider closure in place. EOF, mismatch or parent death before ACK exits without exec. Thus no provider code exists before durable custody. Rust supervisor FD 3 is its exclusive private daemon control channel; it never
passes to the stub. Stub FD 4 is closed and its fixed executable/cwd/parent FDs 5–7 are close-on-exec; provider configuration or children inherit none of FDs 3–7. Every phase, identity, generation and revision column displayed as nonnull is validated by direct-SQL NULL negatives; wrong type/socket substitution, claim- name version/collision, hard-link aliasing, crossed
evidence/state and partial terminal rows also fail before recovery logic. Checked-in Rust and TypeScript golden vectors freeze all three frame byte sequences and the nonce, action-binding, registration, process-custody-launch and ACK digest preimages/results. Cross-language tests cover every byte offset and half-close. Wrong magic/length/order, partial EOF at every boundary,
trailing byte, duplicate frame, zero/overflow integer, stale or repeated nonce, cross-action/contract/intent/daemon/provider-closure/stub/PID/start/PGID/session, old row revision, ACK-before-commit and ACK replay on a fresh FD are mandatory no-exec negatives. Closure fixtures independently derive the digest in Rust and TypeScript and then swap the effective configuration,
executable path/device/inode/content/ code identity, argv element/order, environment name/value/order, cwd, capsule, stdio and each inherited/pre-exec FD both before registration and after ACK; configuration-A with an initially self-consistent envelope-B, inherited parent environment, every mandatory denied name/prefix, unsafe option and wrong name/source/path class are
separate pre-closure no-exec negatives; source/project/auth-file stdin, project-file stdout/stderr, arbitrary socket/TTY, forged topology/peer attestation and every wrong purpose/access-mode pairing are also covered. Every variant is no-exec.

For each entry the daemon alone owns an independent persisted `canonical -> claimed -> removed` cleanup phase; `integrity-failure` is terminal. It constructs every native call only from the persisted row, never caller paths. The Rust boundary verifies the persisted v1 claim basename, opens both directories no-follow and equality-checks both identities. Capture, the final
canonical check, post-rename claim revalidation and the pre-unlink check all require the persisted `st_nlink=1` for both socket and capsule. Under persisted canonical phase, exact canonical plus absent claim is atomically renamed with no-replace and revalidated inside the trusted namespace; absent canonical plus exact claim is the crash-after-rename recovery arm. Both return
claimed evidence, after which the owner fsyncs both canonical and claim directories and only then CASes claimed durably; unlink is not admitted before that CAS. Canonical with both absent is integrity failure, not success. Under persisted claimed phase, canonical must be absent; an exact claim is unlinked and both absent is the crash-after-unlink recovery arm. The owner fsyncs
the claim directory before CASing removed. Persisted removed requires both absent. Both present, any wrong claim, source substitution, changed directory identity, illegal phase/presence, cross-device layout or unavailable atomic no-replace support records integrity failure and keeps certifying capability false. Canonical and claim directory removal occurs only after both entry
phases are durably removed and both opened directories have been fsynced. The owner then CASes `active -> children-removed` with nonnull phase evidence before any `rmdir`. In that phase it removes only the canonical directory, fsyncs its parent and CASes `canonical-removed`; an absent canonical directory is accepted as crash-after-rmdir only while the exact claim directory
still exists. Only from canonical-removed may it remove the claim directory, fsync its parent and CAS `removed`; claim absence is then the crash-after-rmdir arm. Removed requires both absent. Any other phase/presence is integrity failure. `process_state=cleaned` is committed only with directory removed. A prior PID/start or other process-integrity failure remains
`process_state=integrity-failure` even when identity-safe path cleanup later reaches directory removed; cleanup never erases terminal evidence or re-enables capability. Exact replay after that final CAS is inert. PID-reuse plus successful path-removal is a direct database/recovery fixture.

On Darwin the TypeScript broker obtains `LOCAL_PEERTOKEN` and `LOCAL_PEERPID` and equality-checks UID, PID/start time, PGID/session, ancestry beneath the persisted provider root and exact helper path/device/inode/digest/code identity. The first valid connection atomically changes waiting to consumed; reconnect or a second peer fails. A platform without equivalent peer/process
proof keeps the capability false. Rust relays bounded opaque bytes only; TypeScript alone parses JSON-RPC/MCP, rejects duplicate keys, applies policy, debits ledgers and journals canonical bytes.

Control EOF/HUP, deadline, cancellation or provider exit makes the supervisor TERM the complete process group, wait 250 ms, KILL and reap, then close its descriptors. As the provider-root parent it retains the group leader unreaped through TERM, the bounded wait, KILL and descendant-absence proof, so the PID/ PGID cannot be reused between proof and signal; only then may it
reap. It never removes persisted socket/capsule paths because it cannot advance daemon-owned cleanup phases. The daemon watches supervisor death and is the sole phase-aware path-cleanup owner; after daemon death, restart resumes from the unchanged custody row. PID/start inspection is observation, never signal authority. Any daemon signal to a process it does not directly parent
requires an OS identity-stable handle, acquired before provider continue and retained for the action, that cannot retarget after exit. If the supervisor dies or the daemon restarts without such a valid handle, the daemon never signals orphaned persisted PIDs/PGIDs; on Darwin this is the required no-signal path unless an activated build proves an equivalent primitive. A live or
ambiguous record is quarantined with capability false until the surviving direct-parent supervisor finishes or exact absence is proved. Mismatch records integrity failure without signalling. Path cleanup uses the canonical-to-trusted-claim transition above; direct unlink from the canonical namespace and digest-only location are invalid. A surviving supervisor observes FD-3
closure after daemon death without removing custody paths. Canaries cover daemon-only, supervisor-only and combined crash, crash after Phase-A intent/name commit and after each directory create, listener bind, capsule write/fsync and parent fsync; before/after process-row promotion; at fork, before/after stub report, custody commit and ACK; and prove no provider exec or
untracked child on every pre-ACK failure; they also cover crash before/after each entry fsync, hard-link alias before canonical claim and after claim attempt, claim-phase and removed-phase CAS, after each directory `rmdir` and after final cleaned CAS, exact claimed retry, source/claim substitution, canonical-both-absent and duplicate-presence refusal, cross-device provisioning
denial, PID reuse and exit/reuse exactly between observation and attempted restart or supervisor-death signal (zero signal), retained-unreaped-leader supervisor TERM/KILL/reap plus daemon-owned remove, and failed `setsid`, `setpgid`/job-control group split, double-fork, daemonisation and reparent escape. Any surviving descendant/listener/capsule or unprovable startup cleanup
advertises false.

Agy hooks allow only the two MCP tuples and adapter-owned bootstrap, then deny read_url(*), execute_url(*), read_file(*), write_file(*), every other mcp(*) and command(*). An auth file in synthetic HOME requires a passing absolute auth-read denial canary. Cursor receives only per-action synthetic HOME/workspace/data directories, no global CLI config, and exposes those two MCP
tools while denying Read/Write/Shell/WebSearch/WebFetch and all unrelated MCP/resources. Current- build canaries prove both positive tool calls, exact discovery/empty list probes, every negative, broker identity/one-use binding and crash cleanup. Direct Claude and Codex run the same source/auth/shell/write/web/MCP/bundle-crossing negatives and identical ledger/result-shape
checks; success by one never certifies the other. Every pinned provider/helper/trampoline descendant must fail `setsid`, `setpgid`/job-control group split, double-fork, reparent and equivalent daemonisation escape; group cleanup alone is not proof. Hardened wrappers mediate native effects; stock/tool-policy-only CLI advertises false. Provider auth/config never appears in
model-visible env/files/tools.

Executable policy separates trusted adapter bootstrap from model-triggerable effects. The outer adapter supervisor may execute only the exact activated provider-runtime closure; its provider MCP manager may internally launch only the exact helper/broker closure. Neither launch is model-command authority; the model exposes no executable and only the two portal tools. Cursor
activation resolves/bypasses its shell launcher to a pinned real target where possible; otherwise launcher, shell, Node, index and private cache/data closure plus fixed argv are all pinned/confined. Agy pins its signed native executable by path/code identity/digest and proves direct execution; a hook that transits `/bin/sh` instead requires one exact path/inode/digest-pinned
fixed-argv trampoline and a proved complete child closure. Seatbelt/`sandbox-exec` is an exact-OS-version canary capability: unavailable/deprecated behaviour, semantic drift or any failed positive/negative canary advertises false. Any unresolved closure advertises false.

When provider API transport and model web tools share a process, activation requires provider-native proof of policy separation or a contract-pinned, destination-constrained provider proxy; otherwise capability is false. The threat model covers accidental or model-induced misuse of an authentic pinned runtime, not a deliberately compromised provider binary, which fails the
separate binary provenance/code-identity gate. The hardened containment shim is a `std`-only Rust opaque byte relay for bounded fixed binary transport framing, file descriptors, process/peer identity, supervisor custody and AF_UNIX bytes. TypeScript retains JSON semantic framing, MCP schema, hook parsing/policy and canonical journalling, so there is one protocol implementation
and no native JSON parser. If any adapter cannot enforce the capability, target-preparation acceptance returns capability unavailable before creating a preparation, and dispatch fails before router/provider I/O and budget/action insert. The completion reducer projects the exact unavailable slot/reason even when no target exists.

provider_action_routes remains one insert-only row for every task-bound answer-bearing canonical `(adapter_id, action_id)` pair. For certifying review it additionally stores exact target, slot, slot-head generation at dispatch, delivery artifact/lineage, bundle/manifest/coverage, profile/schema, final-prompt and active target-chair binding generation/snapshot fields. Non-review
actions store those as null. Canonical route request/receipt JSON follows the one checked-in structural model-route.v1 schema; no database or artifact predicate exists in that codec.

Route columns store nullable `requested_effort`, closed `resolved_effort_kind=applied|inapplicable` and nullable `resolved_effort_value`; CHECK requires value nonnull only for applied and requested effort null for inapplicable. `reviewed_artifact_id` is nullable for the non-review arm. No sentinel or model-label-derived effort is stored.

~~~sql
provider_failure_substitution_events(
  adapter_id, action_id, event_generation, run_id,
  requested_family, requested_model, resolved_adapter_id,
  resolved_family, resolved_model, code, evidence_digest, created_at,
  PRIMARY KEY(adapter_id, action_id, event_generation),
  FOREIGN KEY(adapter_id, action_id)
    REFERENCES provider_action_pair_preflights(adapter_id, action_id)
)
~~~

Event generations are contiguous per pair and rows are immutable, so substitution followed by provider/routing failure is representable and ordered even when resolver failure correctly creates no provider action. The pair preflight is the parent of routes/actions, finding-capacity reservations and failure/substitution history. Its closed state is `resolving|admitted|released`;
owner/input identity is immutable, and only the one admission/release CAS may advance state. `admitted` requires the same-transaction provider action and route; `released` forbids them and consumes no finding/budget capacity. Exact replay returns the persisted ordered event/failure without rerunning the router; changed pair input conflicts. A pre-event crash may rerun only the
pure resolver under the same owner digest.

Its normalised certifying columns map one-for-one to providerRouteProjectionV1: route request/receipt digests, adapter/contract, family/model, requested effort/tagged resolved effort, target/slot, reviewed artifact, publication lineage, bundle/root/coverage/search/risk/mandatory-set/prompt digests, target chair agent/principal/lease/adapter/family/model/route,
provider-session/bridge/binding generations, adapter contract, profile digest and slot-head/attempt generations. Public action read never reconstructs a route. With `route_state=present` it joins that immutable row; with `missing` or `integrity-failed` it instead projects a null route plus the safe route-recovery evidence digest owned below. It then joins
provider_review_terminal_journal, whose unique key is adapter/action/target/slot/attempt and whose immutable columns are terminal kind, run-global terminal sequence, terminal-input digest, private answer/result/adapter-result digests, authenticated-usage digest, read-journal digest, public terminal projection digest and optional evidence-mutation-receipt digest. An append-only
terminal integrity-conflict row records a changed input digest without updating either owner.

Replay/input digest classification occurs before router work. Durable preflight and the in-process mutex key are exactly `(adapter_id, action_id)`. Its owner digest hashes run, authenticated actor/principal and the full canonical input. An exact retry joins; a different digest waits and conflicts before a router call. Cross-run same-pair use therefore runs the router at most
once and conflicts pre-router, while the same action ID under another adapter is legal. Every provider action, route, terminal, recovery, budget and adapter journal foreign key uses the pair; no action-ID-only index/lookup/sort remains. A five- second process-group-bounded resolver produces only a candidate receipt. After pair replay classification but before that resolver,
certifying dispatch CASes the exact open finding-set root and inserts either a normal worst-case 32-finding capacity reservation or a zero-new-finding resolution-only row. Capacity failure inserts no action/budget/route row and invokes no router or provider. The admission transaction then rechecks effort applicability, target/artifact/source currency, slot-head generation,
active chair binding/adapter contract and resolved adapter/family/model/effort against the profile and provider payload. Resolved adapter must equal requested action adapter and slot adapter. It attaches the existing reservation, inserts the action and command parents, and inserts the route last, atomically.

For certifying dispatch, the authenticated principal must be the current target chair at the active binding's principal/lease/provider-session/bridge generations. Exact durable replay is classified first and remains readable after rotation. A partial unique index permits only one nonterminal certifying action per target/slot/head generation. The slot head records its latest
attempt/action atomically at dispatch; a concurrent sibling action loses the CAS.
