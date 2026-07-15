# ADR 0002 — Capability-compiled execution authority (write profiles)

**Status:** Architecture decision accepted 2026-07-13. This ADR does not
authorise W010 implementation or live provider execution.

## Context

Fabric-managed headless provider sessions are compiled read-only, enforced
twice (both provider adapters and `Fabric.#admitProviderPayload`). This is
correct for certifying review but blocks Fabric from serving as the managed
implementation plane. The standalone [authority](../specs/agent-fabric/authority.md)
and [provider-action](../specs/agent-fabric/provider-actions-and-adapters.md)
specifications own that contract, so enabling writes is a specification change,
not only code.

## Decision

Adopt provider-neutral authority profiles compiled by Fabric into
provider-native settings in four staged steps:

1. **Authority contract:** protocol-owned, versioned `AuthorityEnvelopeV2`
   carrying the full human-approved envelope (approval binding with evidence
   digest; secrets, deployment, irreversible-action and network dimensions —
   all missing from Fabric's former `AuthorityInput`), plus exact
   characterisation goldens of today's read-only projection. Includes the
   required updates to the standalone authority and provider-action
   specifications introducing profile-based execution authority. Risk tier:
   crucial.
2. **Pure admission extraction** into an `AuthorityCompiler`, behaviour
   unchanged.
3. **One-provider write pilot** (`workspace-write-offline`: one owned
   worktree, no network egress, no external effects), gated by the standalone
   [provider-write containment
   specification](../specs/agent-fabric/provider-write-containment.md) —
   worktrees are not permission boundaries; provider settings are intent, not
   containment proof; model refusal without a tool attempt is inconclusive.
4. **Second provider, then structural extraction** from the merged
   `ProviderActionDispatchInputV1` contract shape.

The architecture initially defines only `review-readonly` and
`workspace-write-offline`. Effective authority is the monotone intersection of
the human envelope, task/worktree ownership, risk policy, provider capability
and local attestation; providers cannot broaden a profile; receipts bind
requested/effective profile, compiler version and exact native settings.

The architecture decision does not authorise either execution slice. W010-A
requires separate human approval of the crucial-scope profile/compiler change
and thin recorder. W010-B requires a separate human grant naming the exact live
tuple, calls, cost, time and host. Until those gates are granted,
`workspace-write-offline` remains unavailable.

**Direct cutover, no legacy bridge** (human directive, overriding codex-pair's
proposed `LegacyAuthorityInputV1` quarantine): the repo is pre-release with no
external consumers; migrate all callers, tests and stored state to V2 in the
authority-contract cutover. Pre-existing stored authorities are regenerated or
the local pre-release state is reset — no dual parser is retained.

## Consequences

- Workspace writes and external effects remain strictly separated (staged
  effects via the existing `ExternalEffectService` model).
- The first write pilot provider is chosen by containment evidence, not
  preference; the other stays read-only until it independently passes.
- [Issue #22](https://github.com/mblauberg/provenant/issues/22) owns the current
  containment evidence, approval sequence and provider rollout. The standalone
  [authority](../specs/agent-fabric/authority.md),
  [provider-action](../specs/agent-fabric/provider-actions-and-adapters.md) and
  [provider-write containment
  evidence](../specs/agent-fabric/provider-write-containment.md)
  specifications own the current contract; earlier work-package detail remains
  provenance in Git history.
