# Scoping session register — review-pack validation

**Started:** 2026-07-13
**Chair:** Claude Code (Fable 5) session in herdr pane w5:pY
**Challenge partner:** codex-pair (gpt-5.6-sol xhigh) in herdr pane w5:pF — degraded path (`FABRIC-ROUNDTRIP-UNAVAILABLE`: fabric CLI fails to load, see F-011 live evidence below); artifact contract: `challenges/codex-pair-round1.md`
**Verification legs:** 3 sonnet subagents verifying F-001..F-046 against the live repo; 1 sonnet subagent writing `CODEBASE_PRIMER.md`
**Mode:** /scope + /grill-me, one decision question per round; docs in this directory updated as branches are decided.

## Intake

Validate the externally-produced review pack (baseline commit `0ea935f`) against
the actual codebase, then decide with the human which of D-001..D-020 and the
tranche plan to adopt, modify, or reject. User needs contextualisation; not
deeply familiar with the codebase.

## Live evidence gathered this session

- `scripts/agent-fabric status` fails: `ERR_MODULE_NOT_FOUND: @local/agent-fabric-protocol` — confirms the thrust of **F-011** (no root workspace; fragile cross-package links) on the current head.

## Decision register (session)

| Round | Question | Decision | Status |
|---|---|---|---|
| 1 | Product intent: personal harness vs distributable product | **Personal-first, product-compatible.** Optimise for single-operator macOS use; keep portable seams (config split D-015, root workspace D-016); defer installer/cross-platform/SBOM/contribution product work. | DECIDED 2026-07-13 |
| 2 | Should headless Fabric-managed provider sessions be allowed to WRITE (authority profiles, D-004)? | **Yes.** User confirmed write capability is wanted. Clarification recorded: pane/terminal agents coordinating via fabric MCP can already write; the decision covers daemon-launched headless sessions, write limited to owned worktrees via profiles. | DECIDED 2026-07-13 |
| 3 | Sequencing and shape of the first implementation tranche | **Codex 4-step now, foundations in parallel.** Staged capability path starts immediately (authority-contract reconciliation → compiler extraction → one-provider write pilot behind containment proof → second provider, then extraction). Foundations (build/workspace, truth drift) run alongside, seeded by the merge handoff from the agent currently merging the 9 pending worktree branches (w5:p6, their author). Accepted risk: rework if spec05-integration shifts the compiler seam. Supersedes the pack's single-tranche section 9. | DECIDED 2026-07-13 |
| 4 | D-003/D-006 generated manifest: pack's single harness.manifest.yaml vs codex's per-domain owners + drift checks | **Per-domain owners.** No new master file; each domain's real source (skills/ folders, protocol registry, config) generates/validates its projections with CI drift checks; optional derived read-only index. Pack D-003 REJECTED as written; `proposals/harness.manifest.yaml` marked rejected. Pending readme-overhaul branch already implements this for skills. | DECIDED 2026-07-13 |
| 5 | Priority + shape of typed backlog/intake (F-009/F-010) | **Schema-first, store-pluggable; controller deferred.** F-009/F-010 demoted from P0. Harness defines the backlog-item schema (id, status, spec/approval digest, authority, expiry, dependencies); each project chooses its store by convention — repo markdown frontmatter OR GitHub Issues — with lossless bidirectional migration (`gh`-based). Runtime queue controller waits until the write pilot proves out; Issue mutations by agents route through the staged-effect gate. | DECIDED 2026-07-13 |
| 6 | Governed retention deletion (D-014/F-008) | **Design now, delete later.** Adopt 5-class retention taxonomy + typed-delete design; class-tag new state from now on; delete machinery ships after tranche 1; archive-only meanwhile. F-008 demoted from P0. | DECIDED 2026-07-13 |
| 7 | Skill/policy UX batch | **Adopted:** decision packets in /scope (F-017); architecture-review skill via skill-authoring path (D-008); risk/oracle-adjusted certifying review (F-016/D-011, other-primary stays mandatory crucial+). **Refined (chair call, user may veto):** $caveman remains default for inter-agent/mechanical/status traffic where token volume lives; human-facing explanatory output is domain-appropriate with caveman as explicit opt-in (F-025 partially adopted — user values token savings; chair notes style cannot compress thinking tokens and this session's elaboration requests as evidence). | DECIDED 2026-07-13 |

### Codex-pair round 1 (challenges/codex-pair-round1.md)

- Overall: agree-with-modifications on central recommendation; pack overstates missing architecture — `CommandJournal`, `ProviderSessionCoordinator`, focused stores, `ExternalEffectService` custody already exist. Complete existing seams; do not pre-install UnitOfWork/dispatcher/domain-event scaffolding (D-002 modified).
- D-003 generated god-manifest: DISAGREE — one canonical owner per domain + drift tests; derived `harness-index.json` at most.
- Pack P0s F-009/F-010 (backlog/intake): demote — target-state gaps, not present blockers for a single operator.
- New P1 omissions found: (a) delivery-authority vs Fabric `AuthorityInput` schema mismatch (must reconcile before write enablement); (b) `workspace-write-offline` lacks proven isolation substrate — worktrees are not permission boundaries per docs/ARCHITECTURE.md; require adversarial containment fixtures + effective-isolation receipt; (c) spec index vs effort maps contradict on implementation status (F-006 conflates missing vs unaccepted).
- Section 9 first scope: right objective, too much in one tranche — proposes 4 bounded steps (contract/characterisation → pure admission extraction → one-provider write pilot gated on containment spike → second provider, then extraction).

### Round 1 consequences

- Deferred to "when productising": F-024 (installer CLI), F-035 (OS matrix), F-038 (CONTRIBUTING), F-040 (SBOM/signing), F-043 (transport abstraction), F-045 (unified product CLI).
- Retained as product-compatible seams: F-003/D-015 (portable vs local config split), F-011/D-016 (root workspace).
- F-036 upgraded from "unverifiable" to confirmed-worse: `main` has no branch protection at all (live `gh api` check, this session). Personal-first still wants required CI checks on main — cheap and protects a solo operator from their own agents.

## Verification progress (this session)

| Batch | Verdict summary |
|---|---|
| F-001..F-010 | pending (P0 verifier running) |
| F-011..F-028 | All CONFIRMED except F-026 PARTIALLY CONFIRMED (claim plausible; cited evidence files contain no hook references — citations mismatched). F-023 severity UNDERSTATED: amendments are ~72% of spec 01 (8,223 lines) and ~93% of spec 04 (4,779 lines). |
| F-029..F-046 | 18/18 CONFIRMED. F-036 strengthened (no branch protection, affirmatively verified). F-046 nuance: manual proposal-first flywheel exists in `skills/retrospect`; missing piece is runtime enforcement only. F-033 nuance: `*-boundary*` tests exist but test provider trust boundaries, not import boundaries. |
| Live session evidence | `scripts/agent-fabric status` fails with `ERR_MODULE_NOT_FOUND: @local/agent-fabric-protocol` — F-011 bites in practice on current HEAD. |

### Codex-pair round 2 (challenges/codex-pair-round2.md)

- **Merge landed mid-session:** `main` moved `babd47a` → `54ca037` (integration
  merge `941a72f`); spec05 branch refs deleted; all worktrees removed. Seam
  check: `fabric.ts`, both provider adapters and `domain/types.ts` are
  byte-identical across the merge; only protocol contracts moved. **Step 1
  proceeds from merged main** — no rework needed. Caution for Step 2: extraction
  must start from the new `ProviderActionDispatchInputV1` contract shape.
- Concrete Step-1 work package delivered: `AuthorityEnvelopeV2` (closed shape,
  no permissive defaults; approval binding with evidence digest; secrets/
  deployment/irreversible/network unions), delivery→Fabric mechanical mapping,
  exact file plan and characterisation goldens. The reviewer's proposed
  `LegacyAuthorityInputV1` bridge is rejected by the human's direct pre-release
  no-legacy instruction. Step 1 must instead make one atomic V2 caller/fixture/
  database cutover; proved live V1 state would require a specific human gate.
  Risk tier: **crucial**.
- Pre-approvable Step-3 containment-spike checklist delivered (adversarial
  filesystem/symlink/git/network/settings/secret/lifecycle matrix; "model
  refusal without tool attempt is inconclusive"; provider passes only with
  positive owned-write control + all negatives + receipts; first write pilot
  chosen by evidence, not preference).

### Post-merge reconciliation (SPEC05-APPLICABILITY.md, by the merge agent)

The merge agent's applicability overlay reclassifies findings against binding
specs. Consequences adopted by this session:

- **Now resolved on merged main:** F-005 (README=33 + equality test), F-006
  (traceability runbook names current spec versions truthfully), F-018
  (orchestrate value gate, commit `97d74d9`). F-027 resolved at spec level
  (threat modes now stated in Specs 01 v0.36/04 v1.31). F-033 partially
  (Console/Herdr seam boundary tests exist; intra-Fabric still missing).
  Verification annex in `findings-register.md` is pinned to `babd47a` and is
  superseded for these findings.
- **Spec conflicts with session decisions (amendments now prerequisites):**
  - Round 2 (write profiles / D-004) conflicts with Specs 01+05 mandatory
    read-only certifying actions → **Step 1 must include an approved spec
    amendment** introducing profile-based execution authority.
  - Round 7 risk/oracle-adjusted review (D-011) conflicts with Spec 05's
    mandated four certifying slots (F-015/F-016) → policy change requires a
    Spec 05 amendment; until then the four-slot profile stands for Spec 05
    work.
  - F-023 spec-restructuring (amendment-history cleanup) must go through an
    approved spec edit, not a delivery-local rewrite.

## Parked owner calls

(none yet)

## Final gate (2026-07-13) — SESSION COMPLETE

**Ratified.** All decision-register outcomes ratified by the human; canonical
owners are now the ADRs in `docs/adr/` (0001–0008). This directory remains the
evidence/history record.

**Step 1 + Step 3 gate approved**, with human riders:

1. **No backwards compatibility** — overrides codex-pair's proposed
   `LegacyAuthorityInputV1` quarantine bridge. Step 1 does a direct V2 cutover:
   migrate all callers/tests/stored state; regenerate or reset pre-release
   local state; no dual parser. (Consistent with the handoff's own binding
   decision: "remove obsolete compatibility paths".) Recorded in ADR 0002.
2. **Merge-agent handoff integrated**
   (`docs/handoffs/HANDOFF-2026-07-13-project-fabric-console.md`): the Spec 05
   effort is NOT complete — 30 files/162 fabric tests failing, remote CI red on
   `54ca037`, protocol schema over the 5 MiB release gate, nine unrepaired P1
   spec-semantics leads, human-mandated 1,000-line spec-family split, repo
   renaming to Provenant. Its "ordered continuation" is the real foundations
   leg and is larger than this session's earlier sketch.

### Parallelisation plan (one chair; disjoint write scopes)

| Lane | Scope (disjoint writes) | Blocked by |
|---|---|---|
| A — Spec authority | Re-run amendment audit with anchored receipt; repair the nine P1 leads; freeze Specs 01 v0.36/04 v1.31; spec-family split (≤1,000 lines); draft the ADR-0002 write-profile spec amendment | nothing — start first; handoff items 2–3 |
| B — Foundations/build | Root workspace + lockfile unification (F-011, fixes `@local/agent-fabric-protocol` CI failures); compact protocol schema generation (5 MiB gate); CI repair | nothing — disjoint from A |
| C — Step 1 authority contract | Characterisation goldens of the current read-only projection (no behaviour change) may start now; `AuthorityEnvelopeV2` + delivery mapper land only after Lane A freezes the spec amendment ("do not implement against an unfrozen contract"); re-run the seam diff after Lane B lands | goldens: none; V2: Lane A |
| D — Runtime reconciliation | The failing fabric test families (database baseline drift, lifecycle custody, Herdr FKs, MCP vocabulary, wrapper manifest) via TDD in disjoint lanes per the handoff | Lanes A + B |

Execution handoff: each lane runs as its own `/implement` (or spec-edit) leg in
a fresh session, digest-bound to this register, the ADRs
(`docs/adr/0001`–`0008`) and the handoff. Risk tier: crucial (authority
surface). Lane ordering within these constraints is the executing chair's call.
