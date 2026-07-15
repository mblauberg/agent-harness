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

GitHub issues own current execution and acceptance state. The historical
simplification pack is retained only because #22 still uses its fixed
containment checklist; it is not a current-status or governance owner.

## Remaining route

1. [Issue #22](https://github.com/mblauberg/provenant/issues/22) must first
   produce a source-clean evaluator and conclusive W010 containment evidence
   for one exact provider, version, profile and host tuple. Its current source
   gate is `NO-GO`; no live provider containment run has been authorised and
   `workspace-write-offline` remains unavailable.
2. A successful matrix makes the tuple eligible only. The human must
   explicitly accept it and authorise the first provider write grant before
   W011 can begin.
3. W011 admits a second provider through the same compiler and gate, then makes
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
