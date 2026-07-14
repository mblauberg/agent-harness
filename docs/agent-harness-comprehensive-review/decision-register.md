# Decision register

Statuses below reflect the 2026-07-13 scoping session (`SCOPING-SESSION.md`):
findings verified against HEAD `babd47a`, codex-pair challenge
(`challenges/codex-pair-round1.md`), and human decisions via /scope + /grill-me.
Framing decisions for the session: **personal-first, product-compatible**
(round 1); **headless managed sessions may write via authority profiles**
(round 2); **codex 4-step staged path now, foundations in parallel** (round 3).

| ID | Recommended decision | Outcome (2026-07-13) | Notes |
|---|---|---|---|
| D-001 | Use a modular monolith with one SQLite authority | **Accepted** | Uncontested by both reviewers. |
| D-002 | Provider-native APIs own session mechanics | **Accepted** | Already the live direction. |
| D-003 | Fabric owns neutral authority, work, evidence and reconciliation | **Accepted** | Core differentiator confirmed. |
| D-004 | Add capability/authority profiles | **Accepted with modifications** (round 2) | Codex mods: only `review-readonly` + `workspace-write-offline` initially; profile = requested bundle, effective = monotone intersection with human envelope; receipts bound to authority digest + compiler version; authority-schema reconciliation is a prerequisite. |
| D-005 | Separate workspace writes from external effects | **Accepted with modifications** | Extend existing `ExternalEffectService` custody model; logical credential boundary now, separate process only if threat model demands. |
| D-006 | Add one generated harness manifest | **Rejected as written** (round 4) | Replaced by per-domain owners: each domain's real source generates/validates its projections, CI drift checks per domain; at most a derived read-only index. |
| D-007 | Make lifecycle an executable policy | **Accepted with modifications** | Extend the existing delivery kernel (`delivery-run` v1, `validate_delivery.py`) and project into Fabric; executable minima only (risk floor, gates, repair bounds, retention class); judgement calls stay with chair/skills; no second policy model. |
| D-008 | Add `architecture-review`; keep `refactor` implementation-focused | **Accepted** (round 7) | Promotion approved via the normal skill-authoring path; implementation pending. |
| D-009 | Implement intake, execution plans and backlog as schemas/runtime | **Partially accepted** (round 5) | Backlog: schema-first, store-pluggable (repo markdown frontmatter OR GitHub Issues per project convention, lossless migration). Runtime queue controller and intake kernel deferred until the write pilot proves out; F-009/F-010 demoted from P0. |
| D-010 | Default paired Claude/Codex scoping for broad consequential work | **Accepted** | This session is the operating pattern. |
| D-011 | Use risk/oracle-adjusted certifying review | **Accepted; amendments pending** (round 7) | Other-primary review stays mandatory for crucial+ and load-bearing decisions; below that, derive pressure from risk + oracle strength. Requires HARNESS.md and Spec 05 amendments before activation. |
| D-012 | Use MCP for focused tools/context, not whole orchestration | **Accepted** | Uncontested. |
| D-013 | Keep Herdr optional and non-authoritative | **Accepted** | Current boundary correct. |
| D-014 | Add governed retention deletion | **Accepted, resequenced** (round 6) | Design + 5-class taxonomy now; class-tag new state immediately; delete machinery after tranche 1; archive-only meanwhile. F-008 demoted from P0. |
| D-015 | Split portable configuration from local attestations | **Accepted, scope corrected** | Verification: defect is entirely in `config/adapter-compatibility.yaml`; `config/agent-fabric.yaml` is already clean. |
| D-016 | Use one root workspace before advanced build tooling | **Accepted — foundations leg** | At the scoping baseline, Fabric CLI failed with `ERR_MODULE_NOT_FOUND`; Lane B owns the active root-workspace repair. |
| D-017 | Console core depends on protocol only | **Accepted** | Engineering call, uncontested. |
| D-018 | Direct cutover by default before stable release | **Accepted** | Both reviewers agree; pairs with F-020 compat-waiver policy. |
| D-019 | Add explicit local threat modes | **Accepted, strengthened** | Codex round 1: isolation-substrate attestation (worktrees are NOT permission boundaries) becomes a hard gate on the write pilot, not just documentation. |
| D-020 | Proposal-first, evaluated self-improvement | **Accepted, narrowed** | Manual flywheel already exists in `skills/retrospect`; runtime enforcement deferred (not P0). |
| D-021 | Autonomous LLM-resolved implementation; PR review the only human gate | **Accepted — human directive** (2026-07-13) | codex `gpt-5.6-sol` chair (xhigh/max/ultra) + Opus pair implement every lane; each decision is LLM-resolved (chair discretion or council vote) and recorded here. Former human gates (spec-amendment acceptance, containment-spike verdict, 80×24 usability, final acceptance) become council decisions, landing via PR. Preserved boundaries (not delegated): no push-to-`main`/release/deploy/credential mutation, no network egress or external-effect enablement; the write-profile containment spike is still executed adversarially (only its verdict is adjudicated); `.agent-run/AFAB-004` never accessed. Charter: [`CHAIR-CHARTER.md`](CHAIR-CHARTER.md). |

Style policy (F-025, round 7; clarified by the human 2026-07-14): terse output
remains default for inter-agent, mechanical and status traffic; human-facing
explanatory output is domain-appropriate. The `$caveman` skill itself loads only
on explicit request.

**Spec-amendment prerequisites** (post-merge reconciliation with
`SPEC05-APPLICABILITY.md`): D-004 write profiles conflict with the mandatory
read-only certifying actions in Specs 01/05 — Step 1 of the adopted tranche
must include an approved spec amendment introducing profile-based execution
authority. D-011 risk/oracle-adjusted review conflicts with Spec 05's mandated
four certifying review slots — requires a Spec 05 amendment; the four-slot
profile remains binding for Spec 05 deliveries until amended.

## Rejected or deferred

| Alternative | Decision | Reason |
|---|---|---|
| Single `harness.manifest.yaml` as source of truth (was D-006) | Reject (2026-07-13, round 4) | Couples unrelated change cadences into one high-blast-radius registry; per-domain owners + drift checks achieve the same guarantee. `proposals/harness.manifest.yaml` retained as a rejected illustration only. |
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
