# Start here

## Purpose of this pack

This pack converts the agreed simplification direction into an implementation programme for Provenant.

The target is not a smaller system at any cost. It is a system with a smaller **stable core** and a larger area of **replaceable model judgement**:

- models plan and adapt;
- provider runtimes orchestrate native agents;
- Provenant enforces invariants;
- deterministic tools verify;
- typed executors perform external effects;
- humans decide material authority and acceptance questions.

## Central design sentence

> **Code what must always be true. Let the chair decide what should happen next.**

## Files

| File | Purpose |
|---|---|
| `01_IMPLEMENTATION_CHARTER.md` | Design constraints, complexity budget and non-goals |
| `02_TARGET_ARCHITECTURE.md` | Thin-kernel architecture and responsibility boundaries |
| `03_MINIMAL_CONTRACTS.md` | Minimal durable data structures; no universal workflow DSL |
| `04_PROGRESSIVE_GOVERNANCE.md` | Advisory-to-terminal governance levels |
| `05_ROUTING_AND_MODEL_POLICY.md` | Chair, worker, provider and model-routing policy |
| `06_LOOP_AND_REVIEW_POLICY.md` | Bounded adaptive loops and risk-adjusted review |
| `07_SECURITY_AUTHORITY_AND_EFFECTS.md` | Authority compilation, containment and typed effects |
| `08_REPOSITORY_CHANGE_MAP.md` | Concrete changes by current repository area |
| `09_WORK_PACKAGES_AND_SEQUENCE.md` | Sequenced implementation programme |
| `10_ACCEPTANCE_TESTS.md` | System, security, recovery and product acceptance cases |
| `11_MIGRATION_AND_DELETION.md` | Direct cutover, compatibility and deletion rules |
| `12_OBSERVABILITY_AND_EVALUATION.md` | Metrics, baselines and ablation programme |
| `13_OPERATING_PLAYBOOK.md` | Day-to-day use after implementation |
| `14_CHAIR_AND_REVIEW_PROMPTS.md` | Reusable implementation, challenge, review and handoff prompts |
| `15_DECISION_REGISTER.md` | Initial design decisions and ongoing decision log |
| `16_PR_CHECKLIST.md` | Pull-request readiness checklist |
| `17_BASELINE_OBSERVATIONS.md` | Review-baseline observations to verify on current head |
| `18_IMPLEMENTATION_STATUS_TEMPLATE.md` | Work-package status and evidence template |
| `19_GLOSSARY.md` | Canonical terminology |
| `21_DECISION_DELEGATION.md` | Who resolves a decision: chair/council/human; Class A/B/C scope deltas; DecisionRequest |
| `22_DOCUMENT_GOVERNANCE.md` | Canonical owners, frontmatter/`canonical_keys`, spec-family layout, `check-docs` |
| `23_SKILL_DELTAS.md` | Per-skill delta checklist for WP6 |
| `24_AUTONOMOUS_CHARTER.md` | Preserved D-021 authority envelope and safety boundaries — **open human decision** |
| `25_AUTHORITY_V2_AND_CONTAINMENT.md` | `AuthorityEnvelopeV2` schema, delivery mapping, file plan, containment-spike matrix |
| `26_IMPLEMENTATION_SEEDS.md` | Advisory seeds: Fabric module map, security-evidence taxonomy, config split, stop-states |
| `schemas/`, `templates/` | Draft JSON Schemas (work-item, decision-request/delegation, frontmatter) and document templates |

The pack's own review record lives in `../../review/`: cross-family findings
(`pair-codex-findings.md`), native verification and extraction mines, and the
chair's `ADJUDICATION.md`. Read `ADJUDICATION.md` before implementing — it
lists accepted repairs still to apply and the open human decisions.

## How to use the pack

### For a fresh implementation session

1. Start the chosen primary model in the repository.
2. Direct it to `PROVENANT_SIMPLIFICATION_KICKOFF.md`.
3. Make it verify current head and complete Work Package 0 before proposing structural changes.
4. Use the other primary for an independent architecture challenge after the current-state map is complete.
5. Implement one bounded work package at a time.
6. Use smaller models only for clearly bounded exploration, test inventory, documentation comparison and mechanical migrations.
7. Keep one integration owner.

### Progressive disclosure

Do not load every file into every worker. A worker receives:

- its objective;
- exact authority and paths;
- applicable decisions;
- the relevant pack document;
- expected output and verification;
- stop conditions.

The chair retains the global objective and reduces worker outputs into the canonical plan.

## Outcome priorities

1. Establish honest current truth.
2. Prove safe offline write execution.
3. Prove one WorkItem-to-PR path.
4. Consolidate lifecycle enforcement.
5. Introduce risk-adjusted review and bounded-loop policy.
6. Simplify Skills and documentation.
7. Improve portability, effects, observability and evaluation.
8. Defer autonomous backlog and broader platform features until the core path is stable.
