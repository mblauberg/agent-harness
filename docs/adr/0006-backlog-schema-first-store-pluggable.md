# ADR 0006 — Backlog: schema-first, store-pluggable; queue controller deferred

**Status:** Accepted 2026-07-13 (human, scoping round 5)

## Context

The pack rated the missing typed backlog queue and intake kernel P0
(F-009/F-010). For a single operator whose lifecycle is interactive, an
autonomous queue controller before managed write execution works would be a
second product on an unproven base.

## Decision

- The harness defines the **backlog-item schema** (id, status, spec/approval
  digest, authority envelope, budget, expiry, dependencies) as the canonical
  contract.
- The **store is per-project convention**: repo markdown with YAML frontmatter
  OR GitHub Issues, with lossless bidirectional migration (`gh`-based).
  Agent-driven Issue mutations route through the staged-effect gate.
- The runtime **queue controller and intake-decision kernel are deferred**
  until the write pilot (ADR 0002) proves out; design them from observed
  unattended-run failures. F-009/F-010 demoted from P0.

## Consequences

- Interactive launches from scope receipts and work-maps remain the backlog
  until then.
- Note the naming collision: the runtime's existing `IntakeStore` is Console
  task-request drafting, not the intake kernel.
