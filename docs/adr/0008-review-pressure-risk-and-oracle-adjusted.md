# ADR 0008 — Risk/oracle-adjusted certifying review

**Status:** Accepted 2026-07-13 (human, scoping round 7); unimplemented
review-policy follow-ups superseded 2026-07-15 (human, [issue
#97](https://github.com/mblauberg/provenant/issues/97)).

## Context

`HARNESS.md` currently requires fresh native and other-primary review for
substantial work, then additional bonus-family attempts for crucial and
terminal work. Stable `spec05-*` protocol and test IDs remain implementation
identifiers, not documentation cross-references.

## Decision

Certifying review pressure follows the current `HARNESS.md` risk table.
Exceptions and degradations are recorded explicitly. Deterministic oracles stay
primary; findings block on evidence, never votes.

Companion round-7 adoptions: decision packets in `/scope` for broad work
(one-question-at-a-time retained for dependent choices);
the unimplemented review amendment and `architecture-review` skill proposal
are superseded. No replacement skill or specification is created.

Style policy: terse output stays default for inter-agent/mechanical/status
traffic; human-facing explanatory output is domain-appropriate. The `caveman`
overlay loads only on explicit request, avoiding a duplicate skill load.

## Consequences

- The current `HARNESS.md` risk-based, cross-family routing remains governing.
  Deterministic oracles remain primary.
- No `architecture-review` skill, compatibility alias or replacement framework
  is created. Stable `spec05-*` identifiers remain unchanged.
- Reviewer yield/cost tracking informs later calibration.
