# Agent fabric activation and operations

Status: Base activation implemented; v1.3 authority-profile alignment freeze
candidate, implementation verification pending
Version: 1.3
Date: 14 July 2026
Decision owner: Human maintainer
Approval: Direct instruction to implement, activate and provider-smoke all listed capabilities, with quota use authorised

Version 1.3 subordinates activation to the closed Spec 01 authority-profile
contract. Activation recognises only `review-readonly` and the currently inert
`workspace-write-offline`; it cannot create a third profile, silently downgrade
one or make writes available without the exact containment receipt.

Version 1.2 closes effective-configuration identity, subject lineage and
permission semantics across activation, smoke and provider actions. It permits
authorised write-capable generic work while retaining enforced read-only as a
hard certifying-review requirement. Version 1.1 requires every active adapter to publish the shared versioned
capability snapshot and effective launch configuration, and makes requested,
actual or honestly unknown route identity part of activation evidence.

## Outcome

Promote the coordination-only agent fabric into a safely activated local model-execution fabric for Claude, Codex, Agy, Cursor and Kiro, with Pi ready but unavailable until an open-weight provider/model is installed. Add operator-started human-readable Herdr observation and coordinated seat rotation without weakening authority, disclosure, certifying-review/Kiro read-only boundaries or fail-closed compatibility gates.

## Required behaviour

1. Every activated adapter is bound to verified wrapper closure, upstream executable or package, protocol/schema and model-family constraints.
2. Provider work uses the admitted absolute working directory and the exact
   admitted Spec 01 `authorityProfile`. Generic work may use write tools/edit
   modes only under a satisfied `workspace-write-offline` compilation receipt
   after its per-provider containment gate; approval bypasses, extra roots and
   uncontrolled provider/model substitutions remain forbidden. Certifying
   review always requires `review-readonly` plus enforced read-only capability.
3. Malformed, drifted or ambiguous provider responses fail closed before state is accepted.
4. Kiro uses a real, version-pinned ACP client with bounded framing, capability negotiation, session lifecycle and read-only tool policy.
5. Activation is staged and reversible. One adapter failure cannot disable coordination or corrupt another adapter's journal.
6. Provider-backed smoke tests use bounded read-only prompts, record the pinned adapter/executable and explicitly requested model route, reject wrapper-visible substitutions, and may consume quota under this approval. Upstreams that do not report an effective model must not be described as independently proving it.
7. Herdr observation reads a durable monotonic event cursor and renders one-line summaries in a separate local observer pane. Message events include a terminal-safe 160-character body preview. It never types into an agent composer, receives mail or acknowledges delivery.
8. Seat expiry warnings are automatic. Authority extension remains an explicit operator action: close the old run only after daemon-produced barrier evidence, provision a fresh immutable generation, atomically cut over the roster, reconnect every seat, and run health plus round-trip smokes. The global 31-day maximum remains non-configurable by projects.

## Activation order

1. Claude Agent SDK.
2. Codex app server.
3. Cursor and Agy headless boundaries.
4. Pi RPC isolation and compatibility pinning; runtime activation waits for an available trusted open-weight route.
5. Kiro ACP.
6. Herdr observer.
7. Coordinated seat renewal.

Each step must pass compatibility, boundary, conformance and negative tests before joining `activeAdapters`. Provider-backed smoke follows activation and stops on any write attempt, schema drift, unexpected permission request, missing session reference or unbounded output.

## Non-goals

- No provider credential export or login changes.
- No automatic public deployment or Git push.
- No unbounded fabric message bodies in Herdr; local previews are capped and terminal-neutralised.
- No authority extension by capability rotation or blind timer.
- No fallback that bypasses a disabled, unresolved or mismatched adapter.

## Rollback

Restore `activeAdapters: []`, restart the visible daemon, retain journals and seat generations for audit, and rerun coordination-only health plus Codex↔Claude mailbox smokes. Adapter activation is configuration-reversible. The current squashed database baseline includes the observer event-sequence table; rollback retains its monotonic audit rows because removing them would destroy cursor history. No numbered predecessor migration or compatibility path is retained.

## Acceptance

- Full runtime and harness gates pass.
- Every adapter has positive conformance and negative boundary coverage.
- Provider-backed read-only smoke passes for each available logged-in provider/model family; unavailable account models are recorded, not substituted silently.
- Herdr observer resumes without loss after an orderly restart, provides at-least-once rendering across a crash window, shows bounded local message previews and exposes no capability data.
- Expiry warning and explicit coordinated rotation tests pass.
- Fresh native and Fable reviews report no unresolved P0–P2 findings.

## Capability and effective-route evidence amendment

Activation now requires the exact shared `adapterCapabilitySnapshotV1`,
`deployedRouteAdmissionV1` and `deployedRouteObservationV1` codecs owned by
Spec 01 section 32.21. This section
adds no competing schema.

An adapter may enter `activeAdapters` only when its current `kind: available`
capability snapshot
binds the activated executable/package, wrapper closure, adapter contract,
host/version, model catalogue, raw effort values, raw native-mode values,
context boundary claims, orchestration bounds and enforceable permission
source. Its closed `authorityProfileSupport` rows also classify every advertised
model/native-mode/profile tuple as `enforceable` or `unavailable`, bind the
native-settings schema and fix filesystem/tool-egress/secret/external-effect
shape. Capability support is necessary but never substitutes for task authority
or the current Spec 01 local-attestation/containment row. The
snapshot source is exactly `runtime-discovery` or
`version-pinned-conformance`. A conformance fixture cannot be reported as
runtime discovery. A `source/kind: unavailable` snapshot is persisted negative
evidence but cannot activate the adapter or admit answer-bearing work. Expiry
or contract drift removes the adapter from new automatic admission without
rewriting prior receipts.

`safety.enforcedReadOnly` is a capability fact, not a global permission mode.
`true` is mandatory before the adapter/profile pair can advertise certifying
review, together with an enforceable `review-readonly` support row. `false` may activate generic answer-bearing work, but cannot admit a
write unless the exact Spec 01 `workspace-write-offline` contract, task
authority, owned-worktree binding, local attestation and per-provider
containment gate all succeed. `unknown` cannot certify review and cannot satisfy
any task that depends on enforced read-only. No route gains write authority
from activation alone, and activation defines no authority-profile fallback.

Every activation, provider-backed smoke and answer-bearing provider action
stores one closed
`adapterEffectiveConfigurationV1` beside the shared snapshot and route lineage:

```yaml
adapterEffectiveConfigurationV1:
  schemaVersion: 1
  configurationId: stable-id
  configurationRevision: positive-contiguous-integer
  adapterId: exact-adapter-id
  adapterContractDigest: sha256-prefixed-digest
  hostIdentityDigest: sha256-prefixed-digest
  executableIdentityDigest: sha256-prefixed-digest
  nativeSettingsSchemaDigest: sha256-prefixed-digest
  capabilitySnapshotRef: capabilitySnapshotRefV1
  subjectKind: activation | provider-smoke | provider-action
  subjectRef:
    oneOf:
      - activationId: exact-activation-id
        activationRevision: positive-integer
      - smokeId: exact-smoke-id
        actionRef: ProviderActionRefV1
      - actionRef: ProviderActionRefV1
  subjectRefDigest: sha256-prefixed-digest
  activationConfigurationRef:
    oneOf:
      - null
      - configurationId: exact-activation-configuration-id
        configurationRevision: exact-activation-configuration-revision
        configurationDigest: sha256-prefixed-digest
  requestedConfigurationDigest: sha256-prefixed-digest
  effectiveConfigurationDigest: sha256-prefixed-digest
  permissionProfileDigest: sha256-prefixed-digest
  discoverySurfaceRef: discoverySurfaceRefV1
  ignoredOrUnsupportedFields: [exact-field-paths]
  permissionSource: adapter | host | config-overlay | unknown
  observedAt: timestamp
  configurationDigest: sha256-prefixed-digest
```

The object and each subject arm are closed; field paths are sorted and unique.
Subject kind selects exactly one matching ref arm. Activation requires null
`activationConfigurationRef`; smoke/action require the exact current activation
configuration for the same adapter/contract/host/executable/native-settings
schema and cannot cite another
subject. `subjectRefDigest` is SHA-256 of RFC 8785 JCS of the selected closed
subject-ref arm. `subjectKind` plus that exact selected ref is the sole subject
identity; there is no caller-authored parallel ID. Per adapter, one activation
ID/revision or smoke ID owns one effective configuration, and one canonical
provider action pair owns one effective configuration. The database enforces
those discriminator-specific identities independently of the digest.
`(configurationId,configurationRevision)` is immutable and unique.
`configurationDigest` is SHA-256 of RFC 8785 JCS over the complete object with
only that field omitted. Capability instance/body, requested/effective,
permission and discovery-surface identities equality-bind the shared route and
launch evidence.
`permissionProfileDigest` remains the digest of the compiled provider-native
permission/settings projection. It is not an authority-profile ID and cannot
select or widen the closed Spec 01 profile. The correlated
`providerAuthorityCompilationReceiptV1` owns requested/effective
`authorityProfile`, compiler policy and native-settings identity. For a
provider-action subject, `permissionProfileDigest` exactly equals that admitted
receipt's `nativeSettingsDigest`; the effective configuration, action, route
and every dispatch equality-bind the same pair/digest. There is no wrapper,
second hash algorithm or independently caller-selected permission digest. The
same join also binds host identity, executable identity, capability body and
native-settings schema; drift in any one requires a new action/attestation and
cannot reuse a Step-3 acceptance.
Host-global settings remain user-owned. Fabric generates only a minimal
per-run overlay inside existing authority, records every unsupported field and
does not silently persist global defaults or hooks. Smoke/action rows record
their effective view and never update either the activation row or global host
configuration. Spec 04 owns the generated schema, immutable persistence,
registered evidence and cross-row constraints; this specification owns the
activation/evidence semantics.

Smoke evidence round-trips the exact requested identity and the shared admitted
identity. Where the provider reports actual host/adapter/provider/family/model/
effort/native-mode values, they populate the observed route arm with its exact
source and confidence. Where it does not, those observed fields remain null
with `source: unavailable` and `confidence: unknown`; the admitted value is not
copied into actual. An adapter whose required actual field is unknown is
ineligible for a gate requiring that attestation.

Conformance adds positive and negative fixtures for snapshot expiry, binary or
contract drift, raw-effort/native-mode round-trip, ignored configuration,
provider substitution, subject-arm/activation-lineage crossing, permission-
profile mismatch, duplicate activation/smoke/action subject refs under different
configuration IDs/digests, honest unknown actual identity and point-of-use body-stable
capability revalidation. Subscription/login changes, OpenCode activation,
paid-region selection and global model/effort preference changes remain
separate human gates.
