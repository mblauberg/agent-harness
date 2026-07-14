# ADR 0009 — Specification families are unnumbered durable topic modules

**Status:** Accepted 2026-07-15 (human, spec-family direction)

## Context

Spec 01 (9,731 lines) and Spec 04 (8,456) are past any workable size, and the
mandated remedy is a family manifest plus bounded modules (ADR 0005; F-023:
amendments are ~72% of Spec 01 and ~93% of Spec 04). A split was attempted on the
`comprehensive-review` branch (`d773cf0`, worktree `.worktrees/comprehensive-review`),
together with a 2,523-line `scripts/check_spec_families.py`. It is not adoptable.
It produced **numbered** modules whose names encode position
(`docs/specs/01-agent-fabric/10-project-session-protocol-core.md`), sixteen
mechanical line-chops (`…-continued-2.md`, `…-continued-4.md` and one more under
Spec 01; twelve under Spec 04; one under Spec 05), and
`f023-NN-archive.md` / `f023-NN-current.md` pairs that preserve
the amendment diary as structure rather than folding it. Specs 01+04 **grew**
from 18,187 lines to 23,827. It also ran while Specs 01/04 were still unfrozen:
`docs/specs/amendment-audit-2026-07-13.md:238` still reads "Specs 01 v0.36 /
04 v1.31 are NOT frozen", with its structural-repair list open — yet the split's
manifests already declare family versions `0.37` and `1.32`.

## Decision

Each spec family is one **family manifest** (≤250 lines) plus a same-named
directory of modules. Hard gates: 999 lines and 100 KiB per module; soft target
850.

- Modules are **distinct topic modules — unnumbered and durable**, named for
  what they own (`authority.md`, `run-lifecycle-and-gates.md`,
  `ownership-and-topology.md`, `effects.md`, `acceptance-map.md`, …). They may
  be modified, added and renamed as topics evolve. The concrete target map is
  `docs/provenant_simplification_implementation_pack_2026-07-14/review/pair-codex-findings.md:299-344`.
- **Positional numbering is rejected**: it encodes order, not ownership, and
  rots the moment a topic moves.
- **`…-continued-N` is rejected outright**: a mechanical line-chop is not a
  semantic fold.
- **Fold, don't append.** Every requirement and acceptance ID has exactly one
  normative module owner; `acceptance-map.md` links to clauses and tests, it
  does not restate them.
- **Repair and freeze before moving text.** A purely mechanical split keeps the
  semantic version; only a behavioural change bumps it.
- Manifests bind ordered module paths, content hashes and the family version,
  and carry the acceptance state — amendments under review are not accepted.
- `scripts/check_spec_families.py` gates duplicate requirement IDs, broken
  links, missing modules, version drift, tampering and over-cap files.
- No monolith copies and no aliases survive the split.

## Consequences

- The existing split is **not adoptable** and must be redone against this shape.
  Lane A's structural repairs and the 01/04 freeze remain its precondition.
- A 2,523-line `scripts/check_spec_families.py` already exists alongside that
  split; it is **reviewed against this ADR, not rebuilt**. Its manifest, hash
  and cap machinery is largely reusable — the module naming and folding is what
  is rejected.
- Spec 05 (1,465 lines) splits to the same shape when it next moves.

## Rejected

- Numbered/positional modules (the attempted split): names encode order, not
  ownership; every insertion renumbers unrelated files.
- Line-chopped continuations: preserve the monolith's shape at module cost.
- `f023-NN-archive` / `f023-NN-current` pairs: structuralise the amendment
  diary that F-023 exists to retire.
- Splitting before repair/freeze: moves unrepaired text and bumps versions that
  no audit has cleared.
