# ADR 0004 — Per-domain truth owners, no god manifest

**Status:** Accepted 2026-07-13 (human, scoping round 4)

## Context

Documentation drift was real (README claimed 34 skills; the catalogue held 33;
nothing checked). The review pack proposed one generated
`harness.manifest.yaml` owning skills, adapters, policies, installer targets,
docs and contract tests.

## Decision

Reject the single manifest. Each domain keeps its natural source of truth and
generates/validates its own projections, with CI drift checks per domain:

- `skills/*/SKILL.md` → README catalogue/count, provider discovery metadata;
- protocol operation registry → codecs, MCP descriptors, operation docs;
- portable adapter catalogue → activation/compatibility fixtures;
- policy files → their generated documentation and tests.

At most, a derived read-only `harness-index.json` may link owners for
discovery; it is never a source of truth.

## Consequences

- The skill-count case is already fixed this way on merged `main`
  (README reports 33 with an equality test in `tests/test_harness_contract.py`).
- `proposals/harness.manifest.yaml` in the review pack is retained as a
  rejected illustration only.
