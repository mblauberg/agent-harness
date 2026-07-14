# Agent Harness comprehensive review pack

## Live implementation

The autonomous implementation now runs under the [chair charter](CHAIR-CHARTER.md)
and [kickoff](KICKOFF.md). Its crash-safe current state, work queue and curated
diagnostic evidence are indexed from the [implementation lab](lab/README.md).
The historical review-pack baseline below remains provenance, not current
execution status.

**Repository:** `mblauberg/agent-harness`
**Baseline:** `main` at `0ea935f8ccaad550d8db0f9ea40324f58bdda569`
**Review date:** 13 July 2026
**Review mode:** static repository inspection through the connected GitHub interface, supplemented by current primary-source research.

## Session status (2026-07-13)

This pack has been **validated and dispositioned** in a live scoping session:

- `SCOPING-SESSION.md` — decision rounds, verification progress, live evidence.
- `CODEBASE_PRIMER.md` — plain-language orientation to the codebase.
- `findings-register.md` — now carries a verification annex: 45/46 findings
  CONFIRMED on HEAD `babd47a`, 1 partially confirmed, 0 refuted.
- `decision-register.md` — now carries outcomes: D-006 rejected (per-domain
  owners instead), D-004/D-005/D-007 accepted with codex-pair modifications,
  F-008/F-009/F-010 demoted from P0, rest accepted.
- `implementation-roadmap.md` — re-sequenced to the adopted 4-step first
  tranche with parallel foundations.
- `challenges/` — independent codex-pair (gpt-5.6-sol xhigh) assessments.

### Current execution route

1. [`EFFORT-capability-profiles.md`](../efforts/EFFORT-capability-profiles.md)
   — current legs, blockers and pickup handoff.
2. [ADR 0002](../adr/0002-capability-compiled-execution-authority.md) — binding
   four-step authority decision and direct-cutover rule.
3. [`codex-pair-round2.md`](challenges/codex-pair-round2.md) §2 — accepted
   Step-1 V2 package and immutable characterisation gates.

## Original review limitation

I could not obtain a local checkout in the execution environment, so I did **not** run the repository's tests, build, daemon, provider smokes, Console, installer, or security scripts. Findings about behaviour are based on source, configuration, tests, specifications, runbooks and repository metadata. Proposed files are design artefacts: they have been syntax-checked where practical, but have not been integrated or executed against the repository.

## Recommended reading order

1. [`COMPREHENSIVE_REVIEW.md`](COMPREHENSIVE_REVIEW.md) — integrated assessment and central recommendation.
2. [`findings-register.md`](findings-register.md) — prioritised, file-level findings with acceptance tests.
3. [`target-architecture.md`](target-architecture.md) — control, execution, effect, evidence and presentation planes.
4. [`agentic-sdlc-operating-model.md`](agentic-sdlc-operating-model.md) — intake, scoping, execution, review, backlog and fresh-session policy.
5. [`skill-portfolio-redesign.md`](skill-portfolio-redesign.md) — skill changes, additions, removals and executable-kernel separation.
6. [`fabric-refactor-plan.md`](fabric-refactor-plan.md) — bounded-context decomposition of the Fabric without losing one transactional authority.
7. [`console-and-observability.md`](console-and-observability.md) — TUI information architecture, projections, replay and provider-native visibility.
8. [`tooling-installation-security.md`](tooling-installation-security.md) — workspace, installer, hooks, local trust, CI, release and supply-chain changes.
9. [`implementation-roadmap.md`](implementation-roadmap.md) — dependency-ordered implementation tranches and completion criteria.
10. [`decision-register.md`](decision-register.md) — recommended decisions and explicitly rejected alternatives.
11. [`SOURCE_MAP.md`](SOURCE_MAP.md) — reviewed sources and evidence map.
12. [`proposals/`](proposals/) — illustrative manifests, policies, JSON Schemas and rewritten instruction/skill files.

## Central recommendation

Evolve the project into a **capability-compiled modular monolith**:

- provider-native APIs own model session mechanics;
- Agent Fabric owns cross-provider authority, work state, evidence, reconciliation and durable control;
- effect executors own external writes;
- an append-only event stream and projections feed the Console, native provider UIs and desktop clients;
- each domain's natural source generates and drift-checks its projections;
  there is no cross-domain god manifest.

Do not adopt a distributed workflow engine, make MCP the process-supervision bus, or add a large set of persona skills. The repository already has the right constitutional primitives. Its next gains come from consolidating duplicated policy, closing the read-only implementation gap, decomposing the large runtime modules and making operational truth generated and observable.
