# EFFORT: Skill portfolio 2026

Updated: 2026-07-11
Status: awaiting human acceptance

## Destination

Audit all canonical global skills against the live harness, the 2026 agentic
SDLC research baseline, current primary guidance and well-regarded public
skill/plugin patterns. Audit the installed Caveman plugin and selectively turn
useful behaviours into portable skills or subagents, keeping only the core
capability named `caveman`. Improve the portfolio as one coherent system: preserve
stable capability boundaries, fix trigger and contract defects, add missing
deterministic and behavioural gates, and introduce a new capability only when
its trigger, authority, artifacts and completion gate are genuinely distinct.
The approved intent and acceptance contract are in
`.agent-run/SKILLS-20260711/intent.md`.

## Route

- [x] Leg 1 — portfolio inventory, baseline gates and parallel evidence wave
- [x] Leg 1b — installed Caveman capability inventory and token-economy baseline
- [x] Leg 2 — reduced refactor design and prioritised portfolio change set
- [x] Leg 3 — serial skill, reference, fixture and harness implementation
- [x] Leg 4 — deterministic and behavioural verification
- [x] Leg 5 — independent native and other-primary review, bounded repair and
  human-acceptance handoff

## Blocked / parked

- Agent fabric activation and operational hardening are the committed `9f8abce`
  baseline. Cross-lane compatibility defects exposed by this effort are in
  scope under the human's transfer of the full uncommitted worktree.
- Local skill linking and removal of the exact legacy Caveman package were
  expressly authorised and are complete. External publication, deployment,
  branches and worktrees remain outside authority.

## Invariants for every leg

- Follow `HARNESS.md`, `MAINTAINING.md` and the canonical `delivery-run` receipt.
- No overlapping source writers; audit workers are read-only and return
  namespaced artifacts.
- Live files and current primary sources outrank old run summaries or memory.
- Preserve public-safety and third-party licence boundaries.

## Trail

- 2026-07-11 Codex: audited all 31 baseline skills and the installed Caveman
  plugin; researched current skill, evaluation, orchestration, review, security
  and frontend practice; selected mechanisms rather than importing packs.
- 2026-07-11 Codex: implemented a 34-skill portfolio with new `caveman`,
  `refactor` and `frontend-review`; hardened catalogue, fixtures, lifecycle,
  review, release, evaluation, frontend, browser and specialist contracts.
- 2026-07-11 Codex: retained two incomplete and two failed schema-v2 routing
  receipts, then passed fresh v6 at 72/72 primary and 72/72 companion rows over
  three trials on each primary family. Final `scripts/check-harness` passed with
  418 tests; portable Agent Fabric typecheck/build and all 363 tests also passed.
- 2026-07-11 Codex: linked the four missing Codex skills, verified Claude's
  shared local skill root, and removed the disabled legacy Caveman plugin and
  marketplace. Native full-source review is clean after bounded repairs; the
  other-primary and bonus review records are retained. Human acceptance remains
  pending.
