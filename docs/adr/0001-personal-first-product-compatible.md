# ADR 0001 — Personal-first, product-compatible posture

**Status:** Accepted 2026-07-13 (human, scoping round 1)

## Context

The 2026-07-13 comprehensive review carried ~10 findings whose priority depends
on whether this harness is a distributable product (installer CLI, OS matrix,
CONTRIBUTING, SBOM/signing, transport abstraction, unified product CLI).

## Decision

Optimise for single-operator macOS use. Keep product-compatible seams —
portable/local configuration split (F-003) and a root workspace (F-011) — but
defer installer, cross-platform, supply-chain and contribution-surface work
until productisation is actually pursued.

## Consequences

- F-024, F-035, F-038, F-040, F-043, F-045 deferred to a productisation cycle.
- F-003 and F-011 remain in scope as seams (see review-pack roadmap).
- Branch protection with required checks on `main` is still wanted (F-036:
  affirmatively verified absent) — it protects a solo operator from their own
  agents.

## Clarification — 14 July 2026

Personal-first also governs skill evidence. A direct request for read-only local
history analysis is sufficient authority to inspect the named histories in
place; it does not need a research-grade receipt, redaction pass, retention date
or small-cell suppression. Raw history is not committed or externally shared.
A compact aggregate or paraphrased response to that human in the same session
is local delivery and needs no second disclosure confirmation. The
product-compatible seam is separate authority for a persistent shared artifact,
raw cross-provider handoff, new audience or external destination, not an unused
generic provider collector.

## Rejected

- Personal-only (rejecting portability outright): forecloses cheap seams.
- Distributable-product-now: inflates the roadmap with no current consumer.
