# Third-party notices

This repository contains adapted or redistributed third-party material. The
repository's main licence (`LICENSE`) does not replace the licences below.
Copyright and licence notices remain with their respective components.

Licence consolidation (Epic #124, Workstream E): every third-party licence text
now lives in the top-level `LICENSES/` directory rather than beside each skill,
and the Apache-2.0 §4(d) attribution notices are aggregated in the top-level
`NOTICE` file. This document is the single prose index that maps each
redistributed component to its licence text and records how it was adapted.

## Impeccable

`skills/ui-ux-design/` (formerly `frontend-design`, now merged with
`frontend-review`) is a renamed and modified distribution of
[Impeccable](https://github.com/pbakaus/impeccable), copyright 2025 Paul
Bakaus, under Apache License 2.0. Its licence text is
`LICENSES/impeccable-APACHE-2.0.txt` and its §4(d) attribution notice is in the
top-level `NOTICE`.

The bundled `skills/ui-ux-design/scripts/modern-screenshot.umd.js` is
modern-screenshot 4.7.0 (<https://github.com/qq15725/modern-screenshot>),
copyright 2021-present wxm, under the MIT License. Its terms are in
`LICENSES/modern-screenshot-MIT.txt`.

The files `skills/ui-ux-design/data/ui-styles.csv`,
`font-pairings.csv`, `color-palettes.csv` and `chart-types.csv` contain data
derived from [UI UX Pro Max v2.0.0](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/v2.0.0/.claude/skills/ui-ux-pro-max/data),
copyright 2024 Next Level Builder, under the MIT License. Its terms are in
`LICENSES/ui-ux-pro-max-MIT.txt`.

## Vercel React best practices

`skills/react-performance/rules/` is adapted from
[Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/tree/dc8367e6f91c92676c468b6725c6610418cc5454/skills/react-best-practices),
copyright Vercel, Inc. The upstream skill and repository declare the work
MIT-licensed; the terms are in `LICENSES/vercel-react-best-practices-MIT.txt`.
Upstream provenance is pinned through commit
`dc8367e6f91c92676c468b6725c6610418cc5454` (14 April 2026). This repository has
modified the packaging, naming, routing, prioritisation and selected rules. The
entrypoint, current-platform notes and rules changed in this harness were
checked against official React and Next.js documentation on 10 July 2026; the
remaining upstream rules are reference material, not a representation that every
claim has been independently revalidated. Recheck version-sensitive guidance
when React, Next.js or their compiler/caching defaults change.

## Grill Me

`skills/grill-me/` is adapted from
[Matt Pocock's `grill-me`](https://github.com/mattpocock/skills/blob/62f43a18177be6ec82da242e59ffbc490a4c22ea/skills/productivity/grill-me/SKILL.md), copyright 2026 Matt
Pocock, under the MIT License. The terms are in
`LICENSES/grill-me-pocock-MIT.txt`.

## Skill Optimizer

`skills/skill-craft/references/audit.md` and `references/method.md` (the audit
branch) are adapted from
[Skill Optimizer](https://github.com/hqhq1025/skill-optimizer/tree/f10e5d85371f72841459493ed750f45ed9afa99d/skills/skill-optimizer),
copyright 2026 hqhq1025, under the MIT License, audited at commit
`f10e5d85371f72841459493ed750f45ed9afa99d`, retrieved 2026-07-10. The terms are
in `LICENSES/skill-optimizer-MIT.txt`. Concrete non-coincidental overlap
retained from upstream: the six-category weighting rubric with matching
percentages, the 1024/250/500 character/word thresholds, and four of five
citation sources in `references/method.md`'s research basis. No claim is made
that the root `SKILL.md` branch selector, the shared doctrine section, or
`references/author.md` derive from this source — `references/author.md`
continues the harness-original lineage of the former `skill-authoring` skill,
which carried no third-party attribution.

## Playwright

`skills/playwright/` is redistributed from
[Microsoft Playwright CLI](https://github.com/microsoft/playwright-cli/tree/main/skills/playwright-cli)
under Apache License 2.0, copyright (c) Microsoft Corporation, adapted with an
added wrapper script and local reference guides. Its licence text is
`LICENSES/playwright-cli-APACHE-2.0.txt` and its §4(d) attribution notice is in
the top-level `NOTICE`.

## TypeScript clean code

`skills/typescript-clean-code/` is redistributed from
[BMAD Labs' TypeScript Clean Code](https://github.com/bmad-labs/skills/tree/main/skills/typescript-clean-code)
under the MIT License, copyright 2025 BMAD Labs. Its terms are in
`LICENSES/typescript-clean-code-bmad-MIT.txt`.

## Caveman

`skills/caveman/` is an original harness-specific rewrite informed by the
behavioural idea in
[JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman), copyright
2026 Julius Brussee, under the MIT License, audited at commit
`0d95a81d35a9f2d123a5e9430d1cfc43d55f1bb0` on 11 July 2026. No upstream
expression, token-saving or fidelity claim is redistributed; this is a courtesy
provenance record rather than an obligation, so no separate licence text is
carried for it.
