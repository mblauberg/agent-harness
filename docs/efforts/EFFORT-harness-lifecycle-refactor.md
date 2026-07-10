# EFFORT: adaptive agent harness lifecycle

Updated: 11 July 2026
Status: awaiting human acceptance

## Destination

Deliver the accepted cross-domain harness refactor defined in
`docs/specs/02-adaptive-agent-harness.md`, grounded in
`docs/research/agentic-sdlc-harness-2026.md`. The result must retain the mature
software loop while adding a domain-neutral delivery kernel, measurable and
privacy-safe improvement, stronger design/security/observation evidence and
safe cross-project upgrade semantics.

## Route

- [x] Leg 1 — industry synthesis and implementation-grade specification — COMPLETE
- [x] Leg 2 — privacy-safe skill telemetry, measurable retrospective receipts and pre-change routing baseline — COMPLETE
- [x] Leg 3 — domain-neutral delivery kernel with canonical software profile — COMPLETE
- [x] Leg 4 — bound design, security and observation evidence — COMPLETE
- [x] Leg 5 — managed installation, precedence contract and expanded lifecycle trigger assurance — COMPLETE
- [x] Leg 6 — entrypoint compaction and held-out cross-domain evaluation — COMPLETE
- [x] Leg 7 — independent review, bounded repair and documentation — MACHINE COMPLETE; final human acceptance pending, handoff: [HANDOFF-2026-07-10-harness-lifecycle-refactor.md](../handoffs/HANDOFF-2026-07-10-harness-lifecycle-refactor.md)

## Blocked / parked

- Shared files owned by the active `agent-fabric` effort remain excluded from
  this effort's source and commit scopes.
- Runtime activation, provider login, deployment and publication require
  separate authority.

## Invariants for every leg

- Follow `HARNESS.md`; Codex is chair and Fable 5 is the paired peer.
- No overlapping concurrent source writers; unique files or one serial applier.
- Project/private transcript content never enters global reports without
  explicit scope and disclosure authority.
- `implement` and `release` use the single canonical delivery receipt; unused
  same-day receipt shapes and compatibility adapters are removed.
- Improvement remains evidence-driven and human-gated, never autonomous
  self-modification.

## Trail

- 10 July 2026 Codex: started paired research/specification and isolated the effort from active agent-fabric writes.
- 10 July 2026 Codex + Fable 5: completed the research/specification challenge;
  moved the routing baseline ahead of any new public kernel entrypoint.
- 10 July 2026 Codex: implemented the Phase 1 privacy-safe telemetry schema
  validator and retrospective receipt validator foundations with focused
  tests; scoped collection and routing baseline followed in later legs.
- 10 July 2026 Codex + Fable 5: implemented legs 2–6; blind routing improved
  from 30/45 to 45/45 in hash-bound routing receipts, native corroboration
  agreed, and all 31 skill entrypoints meet the progressive-disclosure budget.
- 10 July 2026 Codex + fresh reviewers: adversarial native and Fable reviews
  found authority, evidence, recovery, release, installer and privacy defects;
  bounded repairs added exact gate/evidence lineage, additive project profiles,
  full-tree managed-install provenance and rollback, day-rounded telemetry,
  live release hashes and deterministic static-security checks. The machine
  gate now passes 302 scoped tests plus 18/18 independently authored held-out
  attempts across 14 cross-domain delivery cases.
- 11 July 2026 Codex + Fable 5 + fresh native reviewers: closed every P0–P2,
  including custom-profile classification and partial-cleanup receipts. Final
  native and other-primary verdicts are clean; the canonical run is
  `awaiting_acceptance`.
