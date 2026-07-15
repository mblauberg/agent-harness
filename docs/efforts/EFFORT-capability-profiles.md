# EFFORT: capability-compiled execution authority

Updated: 15 July 2026

Status: active. The direct `AuthorityEnvelopeV2` cutover and pure
`AuthorityCompiler` extraction are complete in
[issue #21](https://github.com/mblauberg/provenant/issues/21). Provider write
authority remains unavailable; [issue
#22](https://github.com/mblauberg/provenant/issues/22) owns the containment
evidence and first-provider decision.

## Current outcome

[ADR 0002](../adr/0002-capability-compiled-execution-authority.md) remains the
provider-authority decision. The runtime now has one V2 authority contract and
one pure compiler, without a legacy decoder, compatibility bridge or duplicate
runtime schema.

Four standalone semantic specifications own distinct surfaces under [ADR
0009](../adr/0009-standalone-semantic-specifications.md):
[authority](../specs/agent-fabric/authority.md), [workspace
containment](../specs/agent-fabric/workspace-containment.md), [provider
actions](../specs/agent-fabric/provider-actions-and-adapters.md) and
[provider-write containment
evidence](../specs/agent-fabric/provider-write-containment.md). The first three
own the architecture and mechanisms; the fourth owns the fixed 21-case,
42-execution matrix, oracles and evidence gate. Git owns their history and
integrity.

[Issue #22](https://github.com/mblauberg/provenant/issues/22) owns live W010
delivery, evidence and human gates. The historical implementation pack is
non-authoritative provenance pending its retirement decision under [issue
#23/W013](https://github.com/mblauberg/provenant/issues/23), not an active
dependency.

## Remaining route

1. [Issue #22](https://github.com/mblauberg/provenant/issues/22) begins with
   W010-A, a separately human-approved inert prerequisite for the trusted
   write-offline projection and evidence path. It does not begin without the
   explicit scope grant at risk tier `crucial`, and
   `workspace-write-offline` remains unavailable.
2. W010-B requires a separate human grant for the exact live matrix tuple,
   calls, cost, time and host. No live execution is currently authorised.
3. A conclusive matrix makes the tuple eligible only. The human must then
   explicitly accept it and authorise the first provider write grant before
   W011 can begin.
4. W011 admits a second provider through the same compiler and gate, then makes
   the narrow behaviour-preserving provider-action extraction. External
   effects, deployment, publishing, credentials and unrestricted egress remain
   out of scope.

[Issue #27](https://github.com/mblauberg/provenant/issues/27) is a separate
lifecycle-recovery trust boundary under [ADR
0010](../adr/0010-lifecycle-receipt-authority-distinct-trust-boundary.md), not
provider authority compilation. Production recovery requires the human to
choose and provision the external append-only receipt authority boundary and,
separately, authorise destructive abandon with independently attested
confirmation. No test fake or self-issued in-process authority can satisfy
either gate.

## Completion

[Issue #23](https://github.com/mblauberg/provenant/issues/23) reduces the live
issue graph and owns the final W013 programme gates. Human acceptance remains
mandatory for one-way doors and final completion under
[HARNESS.md](../../HARNESS.md); a merged pull request or passing machine gate
does not grant write, release or external-effect authority.
