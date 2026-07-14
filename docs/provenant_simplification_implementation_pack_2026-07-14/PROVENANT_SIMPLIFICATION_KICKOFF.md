# Provenant simplification implementation directive

This document is the top-level implementation instruction for Codex and Claude Code.

## Objective

Evolve Provenant from an agent-first workflow system with distributed coded guardrails into:

> **Provider-native chair orchestration operating inside a thin, deterministic Provenant invariant kernel.**

The chair should own request understanding, decomposition, sequencing, native subagent use, model allocation, replanning and synthesis. Provenant should own authority, write ownership, budgets, mandatory gates, evidence, recovery and external effects.

The redesign must make Provenant simpler as models become more capable. It must not create a universal workflow engine, require a detailed task graph for ordinary work, or duplicate provider-native orchestration.

## Human design direction

Treat the documents in `docs/provenant-simplification/` as the current human design direction. Reconcile them with the live repository before editing. Where an existing accepted ADR or active human-approved effort conflicts materially, record the conflict and resolve it explicitly rather than silently overriding either source.

## Required reading order

1. Read the repository's current `AGENTS.md`, `HARNESS.md`, active effort documents and applicable ADRs.
2. Read [`docs/provenant-simplification/00_START_HERE.md`](docs/provenant-simplification/00_START_HERE.md).
3. Read the implementation charter, target architecture, repository change map and work-package sequence.
4. Load the remaining documents only when their subject becomes active.

## Operating topology

- The client the human starts is the **chair**.
- There is one chair, one canonical plan and one integration owner.
- The other primary model is a challenge partner or independent reviewer, not a concurrent co-chair.
- Smaller or cheaper models may perform bounded read-heavy, mechanical or independently verifiable work.
- No overlapping concurrent source writers.
- Use provider-native subagents and worktrees where they satisfy the approved authority and ownership model.
- Do not construct a second generic scheduler merely to reproduce native provider capabilities.

## Implementation rules

1. Verify the current repository state before relying on the baseline observations in this pack.
2. Begin with a reproducible current-head baseline.
3. Preserve current safety boundaries while simplifying their implementation.
4. Implement the smallest mechanism that enforces each invariant.
5. Keep ordinary work serial and lightweight by default.
6. Make task graphs and durable run plans optional escalation mechanisms.
7. Do not begin broad Fabric modularisation before the first managed offline write path and issue-to-PR vertical trace are proven.
8. Keep external effects separately authorised and exactly typed.
9. Delete superseded paths rather than maintaining indefinite dual implementations.
10. Maintain `15_DECISION_REGISTER.md` and `18_IMPLEMENTATION_STATUS_TEMPLATE.md` as the work progresses.
11. Do not merge, release, deploy, mutate credentials or expand network authority without the human authority required by the repository.
12. Stop and raise a decision when the work requires a new one-way door, broader authority or a material change to the approved target.

## Definition of success

The redesign is successful when Provenant can demonstrate this path with one run identifier:

`ready WorkItem → effective authority → owned offline worktree → provider-native implementation → deterministic verification → risk-adjusted independent review → exact PR effect proposal → human approval → PR creation`

The same system must also support a low-overhead routine path:

`human request → one capable chair → one workspace → checks → concise result`

Do not optimise for architectural completeness. Optimise for reliable accepted outcomes per human attention-hour, with a permanently maintained minimal baseline.
