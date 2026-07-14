# ADR 0008 — Risk/oracle-adjusted certifying review

**Status:** Accepted 2026-07-13 (human, scoping round 7) — **Spec 05 amendment
pending**; the mandated four-slot review profile remains binding for Spec 05
deliveries until amended.

## Context

Other-primary review is blanket-mandatory for all substantial work
(`HARNESS.md` coverage table). Simple, but costly and insensitive to oracle
strength (F-016). Spec 05 separately mandates four certifying review slots
(native, Claude, Cursor/Grok, Agy/Gemini) for its own delivery (F-015).

## Decision

Derive certifying review pressure from risk tier, novelty, reviewer
independence and oracle strength: strong deterministic oracles reduce required
model review; other-primary review remains mandatory for crucial+ tiers and
load-bearing decisions. Exceptions and degradations are recorded explicitly.
Deterministic oracles stay primary; findings block on evidence, never votes.

Companion round-7 adoptions: decision packets in `/scope` for broad work
(one-question-at-a-time retained for dependent choices, F-017);
`architecture-review` skill promotion approved via the skill-authoring path,
with implementation pending (D-008).
Style policy: terse output stays default for inter-agent/mechanical/status
traffic; human-facing explanatory output is domain-appropriate. The `caveman`
overlay loads only on explicit request, avoiding a duplicate skill load (F-025).

## Consequences

- `HARNESS.md` coverage table amendment plus a Spec 05 amendment are required
  before this changes any Spec 05 delivery gate.
- Reviewer yield/cost tracking (F-030) informs later calibration.
