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

## Rejected

- Personal-only (rejecting portability outright): forecloses cheap seams.
- Distributable-product-now: inflates the roadmap with no current consumer.
