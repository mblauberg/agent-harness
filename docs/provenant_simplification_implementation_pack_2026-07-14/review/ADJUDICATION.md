# Chair adjudication — pack review round 1 (2026-07-14)

Chair: Claude (Fable 5), session 8251ab45. Inputs: native verification
(`native-baseline-verification.md`, Opus 4.8), two native extraction mines,
cross-family review (`pair-codex-findings.md`, gpt-5.6-sol xhigh). Codex
finding anchors spot-verified against the live tree before acceptance
(`config/review-profiles/spec05-four-slot-v1.json`,
`skills/deliver/scripts/validate_delivery.py`, the three live Fabric seams,
ADR-0005, Console-handoff spec-size requirement — all exist as cited).

## Rulings

| Finding | Ruling | Disposition |
|---|---|---|
| native P1-1 = codex #3 (governance conflict with D-021 charter) | Accepted, converged | Notes added to pack 04/05 (done); **human decision required** on charter carry-over; WP0 must add adoption/supersession decision |
| native P2-1 (routing vocabulary) | Accepted | Fixed in pack 05 (target-vocabulary mapping added) |
| native P2-2 (fabric.ts path) | Accepted | Fixed in pack 08 |
| native P2-3 (transition-table owner) | Accepted | Fixed in pack 17 (consolidation edit) |
| native P2-4 (stale verify items) | Accepted | WP0 table pre-filled in pack 17 (consolidation edit) |
| codex #1 (V2 contract + tranche order not imported) | Accepted | Pack repair: import AuthorityEnvelopeV2 dimensions into 03; WP0 lane adoption; WP3 gates = mapping/goldens/containment receipt/direct cutover. 25_AUTHORITY_V2_AND_CONTAINMENT.md supplies the material |
| codex #2 (lifecycle ownership ambiguity vs ADR-0005) | Accepted | Pack repair: 02/03/08 state delivery-run/deliver/validator as canonical; Fabric protocol owns transport projections + explicit mappings only |
| codex #4 (review policy stated before binding migration) | Accepted | Pack repair: label 06 minimum-patterns table future-state; change map adds `config/review-profiles/spec05-four-slot-v1.json` + `validate_delivery.py` to the atomic review-policy migration; ADR-0008 gates stay binding until it lands |
| codex #5 (ADR-0006/0007 minima missing from contracts) | Accepted | Pack repair: WorkItem gains approval/spec digest + authority-envelope identity; all persisted contracts gain five-class `retention_class`; WP2 acceptance adds refusal/default rules |
| codex #6 (extraction map ignores live seams, ADR-0003) | Accepted | Pack repair: 08 §6 becomes residual-responsibility map naming ProviderSessionCoordinator, CommandJournal, ExternalEffectService as live seams to complete |
| codex #7 P2 (WP4 consumes ReviewPlan before WP5) | Accepted | Pack repair: minimum deterministic ReviewPlan derivation moves into WP4; calibration stays WP5 |
| codex #8 (deletion breaks live authority routes) | Accepted, converged with native mining | Deletion stays gated: promotion (25/24/15/17 edits) + repoints + no-inbound-reference check must pass first |
| codex #9 (governance/WorkItem semantics need disposition) | Accepted, largely satisfied by consolidation (21/22/23/schemas) | Residual: PS/ADR-level accept/reject entries for DecisionRequest, conflict keys, PR strategy, store identity; delegation constrained to reversible in-envelope deltas pending the D-021 ruling |
| codex #10 (status template resets live lanes) | Accepted | Pack repair: 18 gains an adoption table mapping live lanes/owners/gates/evidence to WPs or explicit supersession |
| codex Q4 spec split | **Accepted and binding** — matches the pre-existing human requirement in `HANDOFF-2026-07-13-project-fabric-console.md:149-167` (family manifests, ≤1,000 hard cap, `check_spec_families.py`, freeze-before-split, no monolith aliases). Supersedes the provisional layout in the 2026-07-14 handoff §H3 | Successor follows the codex Q4 file map |
| codex Q3 verdict (block deletion pending promotion) | Accepted | Human's "delete this session" instruction is carried as: delete when the gates pass, whichever session that is |

## Disagreements / degradations recorded

- No inter-family disagreements on substance; codex found real gaps the native
  legs missed (findings 1,2,4,5,6,7,10), native legs found the uncommitted
  SPEC05 mod and the 5-link repoint set independently (convergent with codex #8).
- `FABRIC-ROUNDTRIP-UNAVAILABLE`: pair exchange ran via named artifacts +
  bounded pane reads, not Fabric request/reply.
- Codex subagent model attestation: requested gpt-5.6-luna xhigh; the
  collaboration interface exposed no per-agent model selector/receipt, so the
  effective subagent family is **unknown** (recorded as substitution per
  routing policy; do not claim Luna coverage).
- Herdr pane `w5:p16` (pair-codex) was created by this session and may be
  closed once its findings are consumed.

## Open questions for the human (carried into the handoff)

1. Does the D-021 autonomous chair charter (sole-human-gate = PR review, §7
   preserved boundaries) carry over to the simplification pack programme?
   (native P1-1, codex #3, codex Q1)
2. May `AuthorityEnvelopeV2` be renamed/replaced by a field- and
   semantics-equivalent type, or is the name contract-stable? (codex Q3)
3. Are the numbered spec family manifests (`01-agent-fabric.md` etc.)
   permanent entry points or transitional? The active Console handoff
   currently requires them. (codex Q5)
4. Accept or reject general DecisionRequest/scope-delta semantics as pack
   policy (now drafted in `21_DECISION_DELEGATION.md`)? (codex Q4-question)

Chair-resolvable by the successor with evidence (no human gate): codex Q2
(WP2 delivery-kernel-only vs Fabric admission — resolve per ADR-0005 ruling
above).
