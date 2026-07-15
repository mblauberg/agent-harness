# ADR 0008 — Risk/oracle-adjusted certifying review

**Status:** Accepted 2026-07-13 (human, scoping round 7); the unimplemented
review-policy follow-up is pending a human decision in [issue
#97](https://github.com/mblauberg/provenant/issues/97).

## Context

`HARNESS.md` currently requires fresh native and other-primary review for
substantial work, then additional bonus-family attempts for crucial and
terminal work. The earlier numbered Spec 05 design separately proposed four
certifying slots for its own delivery. Stable `spec05-*` protocol and test IDs
remain implementation identifiers, not documentation cross-references.

## Decision

Certifying review pressure follows the current `HARNESS.md` risk table.
Exceptions and degradations are recorded explicitly. Deterministic oracles stay
primary; findings block on evidence, never votes.

Companion round-7 adoptions: decision packets in `/scope` for broad work
(one-question-at-a-time retained for dependent choices);
`architecture-review` skill promotion was proposed but not implemented. Issue
#97 owns the human choice to supersede that proposal or scope a separate skill
and specification change; this ADR does not decide it.
Style policy: terse output stays default for inter-agent/mechanical/status
traffic; human-facing explanatory output is domain-appropriate. The `caveman`
overlay loads only on explicit request, avoiding a duplicate skill load.

## Consequences

- No numbered Spec 05 amendment or `architecture-review` skill exists. Until
  issue #97 is decided, the current `HARNESS.md` risk and cross-family routing
  remains governing; no stable `spec05-*` identifier is renamed by this ADR.
- Reviewer yield/cost tracking informs later calibration.
