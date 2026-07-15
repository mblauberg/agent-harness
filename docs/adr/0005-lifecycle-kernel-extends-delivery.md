# ADR 0005 — Lifecycle kernel extends the delivery kernel

**Status:** Accepted 2026-07-13 (human ratification of chair + codex-pair calls)

## Context

Lifecycle, review and authority rules are repeated across `HARNESS.md`,
skills, specs, validators and runbooks (F-004). The pack proposed a new
executable lifecycle policy engine. The repo already has an executable neutral
kernel: `delivery-run` schema v1, `config/delivery-profiles.json` and
`skills/deliver/scripts/validate_delivery.py` (risk floors, human-evidence
gates, authority containment).

## Decision

Extend the existing delivery kernel rather than build a second policy model.
Make only objectively decidable minima executable: risk floor, authority
containment, profile admission, required evidence/gates, review independence,
repair ceiling, effect/release gates, retention class. Project kernel
decisions into Fabric. Judgement-bearing choices (whether ambiguity warrants
scoping, context staleness, human acceptance) stay with the chair and skills.
Skills reference the kernel instead of restating gates.

## Consequences

- `HARNESS.md` stays a short constitution.
- Amendment-history cleanup follows the [standalone semantic specification
  decision](0009-standalone-semantic-specifications.md); current contracts are
  discovered through the [specification index](../specs/README.md).
