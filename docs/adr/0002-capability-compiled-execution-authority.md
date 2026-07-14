# ADR 0002 — Capability-compiled execution authority (write profiles)

**Status:** Accepted 2026-07-13 (human, scoping rounds 2–3; Step-1 package and
containment gate approved)

## Context

Fabric-managed headless provider sessions are compiled read-only, enforced
twice (both provider adapters and `Fabric.#admitProviderPayload`). This is
correct for certifying review but blocks Fabric from serving as the managed
implementation plane. Specs 01/05 currently mandate the read-only posture, so
enabling writes is a spec-level change, not only code.

## Decision

Adopt provider-neutral authority profiles compiled by Fabric into
provider-native settings, in codex-pair's four staged steps:

1. **Authority contract:** protocol-owned, versioned `AuthorityEnvelopeV2`
   carrying the full human-approved envelope (approval binding with evidence
   digest; secrets, deployment, irreversible-action and network dimensions —
   all currently missing from Fabric's `AuthorityInput`), plus exact
   characterisation goldens of today's read-only projection. Includes the
   required Spec 01/05 amendment introducing profile-based execution
   authority. Risk tier: crucial.
2. **Pure admission extraction** into an `AuthorityCompiler`, behaviour
   unchanged.
3. **One-provider write pilot** (`workspace-write-offline`: one owned
   worktree, no network egress, no external effects), gated on the
   pre-approved adversarial containment spike — worktrees are not permission
   boundaries; provider settings are intent, not containment proof; model
   refusal without a tool attempt is inconclusive.
4. **Second provider, then structural extraction** from the merged
   `ProviderActionDispatchInputV1` contract shape.

Only `review-readonly` and `workspace-write-offline` exist initially. Effective
authority is the monotone intersection of the human envelope, task/worktree
ownership, risk policy, provider capability and local attestation; providers
cannot broaden a profile; receipts bind requested/effective profile, compiler
version and exact native settings.

**Direct cutover, no legacy bridge** (human directive, overriding codex-pair's
proposed `LegacyAuthorityInputV1` quarantine): the repo is pre-release with no
external consumers; migrate all callers, tests and stored state to V2 in
Step 1. Pre-existing stored authorities are regenerated or the local
pre-release state is reset — no dual parser is retained.

## Consequences

- Workspace writes and external effects remain strictly separated (staged
  effects via the existing `ExternalEffectService` model).
- The first write pilot provider is chosen by containment evidence, not
  preference; the other stays read-only until it independently passes.
- Work package details (schema, delivery→Fabric mapping, exact file plan,
  the 8 acceptance gates and the adversarial containment-spike matrix):
  `docs/provenant_simplification_implementation_pack_2026-07-14/docs/provenant-simplification/25_AUTHORITY_V2_AND_CONTAINMENT.md`.
