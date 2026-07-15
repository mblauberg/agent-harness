# EFFORT: capability-compiled execution authority

Updated: 16 July 2026

Status: closeout in progress under [issue
#23](https://github.com/mblauberg/provenant/issues/23).

## Current state

[ADR 0002](../adr/0002-capability-compiled-execution-authority.md) remains the
provider-authority decision. The runtime uses one `AuthorityEnvelopeV2`
contract and one narrow, stateless compiler. Repository history and integrity
come from Git; the current semantic owners are the standalone [authority](../specs/agent-fabric/authority.md),
[workspace containment](../specs/agent-fabric/workspace-containment.md),
[provider actions](../specs/agent-fabric/provider-actions-and-adapters.md) and
[provider-write containment](../specs/agent-fabric/provider-write-containment.md)
specifications.

The inert write-offline projection and authenticated local lifecycle receipt
authority are complete in [issues
#118](https://github.com/mblauberg/provenant/issues/118) and
[#123](https://github.com/mblauberg/provenant/issues/123).

[Issue #129](https://github.com/mblauberg/provenant/issues/129) and [PR
#133](https://github.com/mblauberg/provenant/pull/133) completed the verified
task-scoped delegated-write path and minimum live Claude proof. [Issue
#134](https://github.com/mblauberg/provenant/issues/134) and [PR
#137](https://github.com/mblauberg/provenant/pull/137) completed the explicit
Codex and Claude model, effort and context controls. Both are integrated.

The [#136 startup fix](https://github.com/mblauberg/provenant/issues/136) in
[PR #138](https://github.com/mblauberg/provenant/pull/138) completed current
Codex startup compatibility and the truthful unprovisioned handshake. It is
integrated.

## Deferred residue

These Backlog items do not block the minimum functional closeout:

- [#125](https://github.com/mblauberg/provenant/issues/125): direct-open
  abandon custody and recovery;
- [#128](https://github.com/mblauberg/provenant/issues/128): retained receipt
  history and subject hardening;
- [#131](https://github.com/mblauberg/provenant/issues/131): a reusable
  generation-loss terminal-owner seam;
- [#132](https://github.com/mblauberg/provenant/issues/132): replace
  repository-local wrapper hash manifests with Git provenance; and
- [#139](https://github.com/mblauberg/provenant/issues/139): add a supported
  fresh Agent Fabric launch/bootstrap path.

## Completion

All minimum functional lanes are integrated. #23 now owns one current-head
programme verification pass and explicit human acceptance. Passing checks or a
merged pull request does not itself grant provider calls, destructive actions,
release, deployment or other external effects.
