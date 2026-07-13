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
| 5 | Priority of typed backlog/intake (F-009/F-010): pack says P0, codex says demote for a single operator | — | OPEN |

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

## Parked owner calls

(none yet)

## Next unresolved branch

Round 2 — Fabric as managed implementation plane vs review-first (gates F-001,
D-004, D-005, F-009/D-009 backlog autonomy, tranche 1 of the roadmap).
