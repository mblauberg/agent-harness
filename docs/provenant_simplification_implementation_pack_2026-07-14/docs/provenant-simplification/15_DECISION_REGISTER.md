# Decision register

Use this file as the programme-level decision record. Promote durable architectural decisions into repository ADRs.

| ID | Decision | Status | Rationale | Consequence |
|---|---|---|---|---|
| PS-001 | The primary chair owns orchestration and synthesis. | Accepted | Capable models and native runtimes are increasingly effective at adaptive planning. | Fabric does not become a second generic scheduler. |
| PS-002 | Provenant owns invariants: authority, ownership, budgets, gates, evidence, recovery and effects. | Accepted | These remain necessary regardless of model capability. | Kernel scope is stable and small. |
| PS-003 | No universal workflow DSL. | Accepted | A general workflow language duplicates model and provider capabilities and increases maintenance. | Use semantic states and optional work graphs. |
| PS-004 | A detailed DAG is optional. | Accepted | Ordinary work should remain serial and lightweight. | Promote to a graph only for multi-owner, long-running or recovery-heavy work. |
| PS-005 | Use progressive governance. | Accepted | Process weight should follow risk and oracle weakness. | Advisory and routine work avoid substantial-run overhead. |
| PS-006 | Review is risk- and oracle-adjusted. | Accepted | Blanket cross-family review is costly and may add little information. | Other-primary remains required for appropriate crucial or weak-oracle work. |
| PS-007 | Provider-native subagents and sessions are the default execution substrate. | Accepted | Avoid duplicating provider scheduling, context and worktree features. | Adapters translate and record rather than orchestrate globally. |
| PS-008 | One writer per source surface. | Accepted | Prevents conflicts and ambiguous ownership. | Parallel writes require disjoint scopes or a serial applier. |
| PS-009 | External mutations use typed effects. | Accepted | Models should not hold broad effect credentials. | PR, issue, merge, release and deployment use trusted executors. |
| PS-010 | Worktrees are collaboration isolation, not security containment. | Accepted | Same-user and path escape risks remain. | Offline write profile requires actual adversarial containment proof. |
| PS-011 | Maintain a strong-model minimal baseline. | Accepted | Added complexity must demonstrate value. | Evaluation includes ablation and deletion. |
| PS-012 | Console and Herdr are projection-only. | Accepted | Correctness cannot depend on presentation. | CLI/machine status is sufficient for operation. |
| PS-013 | Autonomous backlog control is deferred. | Accepted | It is a second product before managed write execution is proven. | Implement minimal WorkItem contracts now; controller later if evidence supports it. |
| PS-014 | Keep one process and one SQLite authority initially. | Accepted | Distributed infrastructure is not justified by current use. | Modular monolith and explicit transaction boundaries. |
| PS-015 | Direct pre-release cutover is preferred. | Accepted | Dual implementations create drift without known consumers. | Compatibility requires evidence and deletion conditions. |
| PS-016 | Skills guide methods; the kernel governs lifecycle. | Accepted | Prevents policy duplication and preserves model adaptability. | Shrink lifecycle Skills and demote non-distinct specialists. |

## New decision template

```text
ID:
Date:
Owner:
Question:
Options:
Evidence:
Decision:
Rationale:
Authority impact:
Compatibility impact:
Operational impact:
Rejected options:
Validation:
Review:
Status:
Supersedes:
```

## Decision discipline

Record a new decision when:

- a stable contract changes;
- authority broadens;
- a new trust claim is made;
- a new runtime subsystem is introduced;
- a compatibility layer is retained;
- a work package sequence changes materially;
- a non-goal becomes active scope.

Do not create decisions for ordinary reversible implementation detail.

## Crosswalk: D-nnn ↔ PS-nnn ↔ ADR

The pre-pack scoping session recorded decisions D-001..D-021 (source:
`docs/agent-harness-comprehensive-review/decision-register.md`, now superseded).
The pack re-derives the *positions* as PS-001..016; the ADRs are the canonical
owners of the headline decisions. This crosswalk preserves traceability.
"— none —" means no direct pack/ADR analogue; the detail is preserved in the
riders below, in the seeds file, or in the named appendix.

| D-nnn | Decision (short) | PS-nnn | ADR | Notes |
|---|---|---|---|---|
| D-001 | Modular monolith, one SQLite authority | PS-014 | 0003 | |
| D-002 | Provider-native APIs own session mechanics | PS-007 | 0001 | |
| D-003 | Fabric owns neutral authority/work/evidence/reconciliation | PS-002 | — | Core differentiator |
| D-004 | Capability/authority profiles | PS-010 | 0002 | Rider below; schema in `25_AUTHORITY_V2_AND_CONTAINMENT.md` |
| D-005 | Separate workspace writes from external effects | PS-009 | 0002 | Rider below |
| D-006 | One generated harness manifest — **rejected as written** | — | 0004 | Per-domain owners instead |
| D-007 | Lifecycle as executable policy | PS-016 | 0005 | Rider below |
| D-008 | Add `architecture-review`; keep `refactor` implementation-focused | PS-016 | — | Skill-authoring path |
| D-009 | Intake/execution-plan/backlog as schemas/runtime | PS-013 | 0006 | Controller deferred |
| D-010 | Default paired Claude/Codex scoping | PS-006 | — | |
| D-011 | Risk/oracle-adjusted certifying review | PS-006 | 0008 | Spec-05 prereq below |
| D-012 | MCP for focused tools, not whole orchestration | PS-003 | — | |
| D-013 | Herdr optional, non-authoritative | PS-012 | — | |
| D-014 | Governed retention deletion | — | 0007 | Rider below |
| D-015 | Split portable config from local attestations | — | — | Layout in `26_IMPLEMENTATION_SEEDS.md` §4 |
| D-016 | One root workspace before advanced build tooling | — | — | Lane B / WP0 |
| D-017 | Console core depends on protocol only | PS-012 | — | |
| D-018 | Direct cutover by default before stable release | PS-015 | — | |
| D-019 | Explicit local threat modes | PS-010 | — | Rider below (hard gate) |
| D-020 | Proposal-first, evaluated self-improvement | PS-011 | — | Runtime enforcement deferred |
| D-021 | Autonomous LLM-resolved implementation; PR review only human gate | — | — | `24_AUTONOMOUS_CHARTER.md`; open carry-over question below |

## Accepted-with-modifications riders

These constraints qualify the bare ADR/PS headlines and remain binding.

- **D-004 (capability/authority profiles).** Only `review-readonly` and
  `workspace-write-offline` exist initially; profile = requested bundle,
  effective = **monotone intersection** with the human envelope; receipts bound
  to the authority digest + compiler version; authority-schema reconciliation is
  a prerequisite. Concrete schema/mapping/file plan: `25_AUTHORITY_V2_AND_CONTAINMENT.md`.
- **D-005 (separate writes from external effects).** Extend the existing
  `ExternalEffectService` custody model; a logical credential boundary now,
  separate process only if the threat model demands it.
- **D-007 (lifecycle as executable policy).** Extend the existing delivery
  kernel (`delivery-run` v1, `validate_delivery.py`) and project into Fabric;
  executable minima only (risk floor, gates, repair bounds, retention class);
  judgement calls stay with chair/skills; **no second policy model.**
- **D-014 (governed retention deletion).** Design plus the 5-class taxonomy now;
  class-tag new state immediately; delete machinery only after tranche 1;
  archive-only meanwhile.
- **D-019 (explicit local threat modes).** Isolation-substrate attestation
  (worktrees are NOT permission boundaries) is a **hard gate on the write
  pilot**, not merely documentation.

## Rejected / deferred alternatives (anti-regression memory)

| Alternative | Decision | Reason |
|---|---|---|
| Single `harness.manifest.yaml` as source of truth (was D-006) | Reject | Couples unrelated change cadences into one high-blast-radius registry; per-domain owners + drift checks achieve the same guarantee |
| Rewrite Fabric as microservices | Reject now | Distributed transactions and operations exceed demonstrated need |
| Replace Fabric with provider-native coordination | Reject | Loses neutral authority/evidence/reconciliation |
| Make MCP the scheduler/event bus/process supervisor | Reject | Wrong centre of gravity for local durable control |
| Add many persona/team skills | Reject | Increases routing/context competition; team composition should be data |
| Require GPT, Claude, Gemini and Grok on every change | Reject | High cost and correlated noise; use marginal expected value |
| Archive all state forever | Reject | Unsustainable; use retention classes and legal holds |
| Never delete compatibility code | Reject | Contradicts pre-release status and maintainability |
| Let model sessions hold release credentials | Reject | External effects require separate executor |
| Rely on hooks as security enforcement | Reject | Hooks are useful telemetry/policy assists, not sole hard boundary |
| Move all Python to TypeScript | Reject | No outcome benefit demonstrated |
| Introduce Nx/Turbo immediately | Defer | Root workspace likely sufficient initially |
| Support Windows implicitly | Reject | Declare unsupported/experimental until IPC/install/permissions are tested |
| Adopt an external orchestration framework wholesale | Reject | Importing a second lifecycle would undermine the repository's strengths |

## Spec-amendment prerequisites

Post-merge reconciliation (from the superseded `SPEC05-APPLICABILITY.md`):

- **D-004 write profiles vs Specs 01/05.** Write profiles conflict with the
  mandatory read-only certifying actions in Specs 01/05. The first tranche step
  must include an **approved spec amendment introducing profile-based execution
  authority** before a write profile ships.
- **D-011 vs Spec 05 four-slot review.** Risk/oracle-adjusted review conflicts
  with Spec 05's mandated **four certifying review slots**. It requires a Spec 05
  amendment; the four-slot profile **remains binding for Spec 05 deliveries until
  amended.**

## D-021 — Autonomous LLM-resolved implementation (with open carry-over question)

- **Decision (2026-07-13, human directive):** codex `gpt-5.6-sol` chair +
  Opus pair implement every lane; each decision is LLM-resolved (chair
  discretion or council vote) and recorded. Former human gates (spec-amendment
  acceptance, containment-spike verdict, 80×24 usability, final acceptance)
  become council decisions, landing via PR. **PR review is the only human gate.**
- **Preserved boundaries (not delegated):** no push-to-`main`/release/deploy/
  credential mutation; no network egress or external-effect enablement; the
  write-profile containment spike is still executed adversarially (only its
  verdict is adjudicated); `.agent-run/AFAB-004` is never accessed.
- **Authority envelope + verbatim §6/§7:** `24_AUTONOMOUS_CHARTER.md`.
- **OPEN HUMAN DECISION:** the charter's stated scope was the
  comprehensive-review programme, which this pack **supersedes**. Whether the
  D-021 envelope and its §7 preserved boundaries **carry over** to pack
  implementation or lapse with the superseded programme is unresolved and is a
  human-only call. Until the human rules, treat the §7 boundaries as **still in
  force** (safe default). See `24_AUTONOMOUS_CHARTER.md` §1.
