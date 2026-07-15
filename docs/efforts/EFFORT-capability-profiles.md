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

Normative requirements live in the standalone semantic
[specifications](../specs/README.md) under [ADR
0009](../adr/0009-standalone-semantic-specifications.md). Git owns their
history and integrity; there are no ordered manifests, per-file hashes or
numbered aliases.

GitHub issues own current execution and acceptance state. The simplification
pack remains retained provenance for its decision register and links from live
ADRs, including ADR 0002, and supplies #22's fixed containment cases. It is not
a current-status or governance owner. Issue #23/W013 owns any later retention
or retirement decision; completing #22 alone does not retire the pack.

## Remaining route

1. [Issue #22](https://github.com/mblauberg/provenant/issues/22) now begins with
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
