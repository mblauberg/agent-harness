# ADR 0002 — Capability-compiled execution authority (write profiles)

**Status:** Architecture accepted 2026-07-13 (human). This decision grants no
W010-A implementation or W010-B live-execution authority.

## Context

Fabric-managed headless provider sessions are compiled read-only, enforced
twice (both provider adapters and `Fabric.#admitProviderPayload`). This is
correct for certifying review but blocks Fabric from serving as the managed
implementation plane. The standalone [authority](../specs/agent-fabric/authority.md),
[workspace-containment](../specs/agent-fabric/workspace-containment.md) and
[provider-action](../specs/agent-fabric/provider-actions-and-adapters.md)
specifications preserve the read-only posture, so enabling writes requires a
normative specification change as well as code.

## Decision

Adopt provider-neutral authority profiles compiled by Fabric into
provider-native settings in four stages:

1. **Authority contract:** protocol-owned, versioned `AuthorityEnvelopeV2`
   carrying the full human-approved envelope (approval binding with evidence
   digest; secrets, deployment, irreversible-action and network dimensions —
   all missing from Fabric's former `AuthorityInput`), plus exact
   characterisation goldens of today's read-only projection. Update the
   authority and provider-action specifications with the profile contract in
   the same change. Risk tier: crucial.
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
- The standalone authority, workspace-containment and provider-action
  specifications own the architecture and mechanisms, not the fixed
  containment matrix. [Issue
  #22](https://github.com/mblauberg/provenant/issues/22) owns live W010
  delivery, evidence and human gates. Under [issue
  #85](https://github.com/mblauberg/provenant/issues/85), the matrix awaits
  migration to a trimmed standalone semantic owner and human ratification
  before the historical implementation pack retires.
