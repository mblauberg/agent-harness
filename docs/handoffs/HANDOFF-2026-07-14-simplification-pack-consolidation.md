# Provenant simplification pack consolidation and docs pruning handoff

Status: active

Date: 14 July 2026

Chair at handoff: Claude (Fable 5), Herdr pane `w5:p14`, session `8251ab45`

Successor: any capable primary (Opus 4.8 or GPT-5.6 Sol). If Sol chairs, use
gpt-5.6-luna (xhigh; max only for isolated single-shot verification) subagents;
if Claude chairs, use Opus 4.8 / Sonnet 5 subagents per
`skills/orchestrate/references/routing-and-tiers.md`.

Last verified: 14 July 2026 against `main@1ddfe24` (dirty; docs-only)

Consumed-at: pending

## Human decisions already given (do not re-ask)

1. **Specs**: full semantic fold + split now — fold amendment sections into
   current normative text, split into `<1000`-line files, archive history.
2. **Deletion**: delete BOTH `docs/agent-harness-comprehensive-review/` and
   `docs/provenant-re-review-2026-07-13/` this session/programme once
   extraction is verified.
3. **Commits**: commit as you go, on `main`, small logical commits.
4. Work happens on `main`; other agents are active in `.worktrees/*` — never
   touch `.worktrees/`, never run `git checkout/restore/stash` on shared state.

## Objective

Make `docs/provenant_simplification_implementation_pack_2026-07-14/` the single
surviving implementation plan (accurate, self-contained), delete the two
superseded review directories, and rework `docs/specs/` into current normative
files under 1,000 lines each.

## State at handoff

### Completed

- **Chair read-through** of all 20 pack files + kickoff: pack is internally
  coherent; consistent with ADRs 0001–0008.
- **Native adversarial verification** (Opus 4.8, fresh context):
  `review/native-baseline-verification.md` — 0 P0 / 1 P1 / 4 P2; factual
  anchors substantially accurate at `1ddfe24`.
  - P1-1: pack's human-approval gates conflict with the active autonomous
    chair charter (D-021) — see "Open human decision" below.
  - P2-1..4: routing vocabulary is target-not-current; fabric.ts path;
    transition-table attribution; stale "verify" items already resolved by
    the capability-profiles effort.
- **Chair corrections applied** (uncommitted at time of writing) to pack
  `04_PROGRESSIVE_GOVERNANCE.md`, `05_ROUTING_AND_MODEL_POLICY.md` (charter
  note + target-vocabulary mapping), `08_REPOSITORY_CHANGE_MAP.md`
  (fabric.ts path).
- **Extraction mining complete** for both deletion-slated dirs:
  - `review/native-mine-re-review.md` — 9 extract-worthy items, 1 inbound
    reference (self-resolving).
  - `review/native-mine-comprehensive.md` — items A–E high value, F–I
    selective; **5 surviving inbound references** (ADR-0002:54, adr/README:4,
    EFFORT-capability-profiles ×4, two 2026-07-13 handoffs) must be repointed
    before deletion; SPEC05-APPLICABILITY.md carries an **uncommitted local
    modification** that must be captured before deletion.

### Also completed (after initial draft of this handoff)

- **pair-codex review delivered**: `review/pair-codex-findings.md`
  (STATUS: complete) — 0 P0, 8 P1, 2 P2; blocks deletion pending promotion;
  provides the binding spec-split shape (Q4).
- **Chair adjudication written**: `review/ADJUDICATION.md` — every finding
  ruled on, codex anchors spot-verified, disagreements/degradations recorded,
  four open human questions listed. **Read it before doing anything else.**
- **consolidate-re-review** (Opus) finished: pack `21/22/23`, `schemas/`
  (+examples), `templates/` created; `03` gained DecisionDelegation +
  DecisionRequest subcontracts (§10–11, trailing sections renumbered to
  §12–14); `09` gained PR-topology selection + WP6 pointer.

### In flight at handoff (verify before proceeding)

- **consolidate-comprehensive** (Opus subagent): writing pack
  `24_AUTONOMOUS_CHARTER.md`, `25_AUTHORITY_V2_AND_CONTAINMENT.md`,
  `26_IMPLEMENTATION_SEEDS.md`, edits to `10/15/17`, and repointing the 5
  inbound links (ADR-0002, adr/README, EFFORT-capability-profiles, two
  2026-07-13 handoffs). Its instructions are recorded verbatim in
  `review/native-mine-comprehensive.md` — if it did not finish, re-dispatch
  with the same scope. It must capture the uncommitted
  SPEC05-APPLICABILITY.md diff before anything is deleted.
- **pair-codex pane** `w5:p16`: findings consumed; close the pane
  deliberately (created by this session).

`FABRIC-ROUNDTRIP-UNAVAILABLE` recorded for the whole run; collection is by
named artifact files plus bounded `herdr agent get/read` for status only.

## Open human decisions (blocking for governance text, not for mechanics)

See `review/ADJUDICATION.md` "Open questions for the human":

1. **D-021 charter carry-over** to this programme (native P1-1 / codex #3).
   Until ruled: §7 boundaries in force; stricter (pack) approval reading.
2. `AuthorityEnvelopeV2` name stability vs equivalent replacement.
3. Numbered spec family manifests: permanent or transitional entry points.
4. Accept/reject DecisionRequest + scope-delta semantics as pack policy
   (drafted in pack `21_DECISION_DELEGATION.md`).

## Remaining work packages (execute in order)

### H1 — verify consolidation and close the review round

1. Verify consolidate-comprehensive output (files 24/25/26, edits 10/15/17,
   5 repoints, SPEC05 uncommitted-diff capture) against
   `review/native-mine-comprehensive.md`.
2. Close pane `w5:p16`.

### H2b — apply the adjudicated pack repairs (all accepted; see ADJUDICATION)

Text edits to the pack, one commit:

- codex #1: import `AuthorityEnvelopeV2` dimensions/digests into `03`
  (source: pack `25`); WP0 gains an explicit lane adoption/supersession
  step; WP3 exit gains mapping/goldens/containment-receipt/direct-cutover
  gates.
- codex #2: `02`/`03`/`08` state delivery-run + `deliver` + validator as the
  canonical lifecycle owner (ADR-0005); Fabric protocol owns transport
  projections and explicit mappings only.
- codex #4: label `06` minimum-patterns table future-state; `08` change map
  adds `config/review-profiles/spec05-four-slot-v1.json` and
  `skills/deliver/scripts/validate_delivery.py` to one atomic, effective-dated
  review-policy migration (HARNESS + Spec 05 + configs + validator + fixtures).
- codex #5: WorkItem gains approval/spec digest + authority-envelope identity
  (ADR-0006); every persisted contract in `03` gains five-class
  `retention_class` (ADR-0007); WP2 acceptance adds refusal/default rules.
- codex #6: `08` §6 becomes a residual-responsibility map over the live seams
  `ProviderSessionCoordinator`, `CommandJournal`, `ExternalEffectService`
  (ADR-0003), admission/authority extracted first.
- codex #7: minimum deterministic ReviewPlan derivation moves into WP4.
- codex #10: `18` gains an adoption table mapping live lanes/owners/gates/
  evidence to WPs or explicit supersession; no blank reset.
- codex #9 residual: add PS/ADR accept-reject entries for DecisionRequest,
  conflict keys, PR strategy, store identity in `15` (pending human Q4).

### H2 — finish pack integration

1. Verify the two consolidation agents' outputs (files exist, faithful to the
   mining reports, no scope overruns).
2. Update `00_START_HERE.md` file table with 21–26 + `schemas/` +
   `templates/` + `review/`.
3. Regenerate `20_PACK_MANIFEST.md` hashes:
   `cd docs/provenant_simplification_implementation_pack_2026-07-14 && find . -type f ! -name 20_PACK_MANIFEST.md | sort | xargs shasum -a 256`
   (keep the manifest's own-hash exclusion rule).
4. Commit: `docs(pack): fold review corrections and legacy extractions`.

### H3 — specs fold + split (largest package)

**Binding shape** (adjudicated: codex Q4 in `review/pair-codex-findings.md`
+ the pre-existing human requirement in
`docs/handoffs/HANDOFF-2026-07-13-project-fabric-console.md:149-167`; this
supersedes any earlier provisional layout): each existing root filename
becomes a ≤250-line **family manifest**; topic modules live under a
same-name directory; hard cap **999 lines and 100 KiB** per file, soft
target 850; manifests bind ordered module paths, hashes and family version;
add a tested `scripts/check_spec_families.py` gate (duplicate requirement
IDs, broken links, missing modules, version drift, tampering, over-cap);
retain **no monolith copies or aliases**.

Target file map (from codex Q4 — refine per-module caps, keep names):

```text
docs/specs/
  01-agent-fabric.md + 01-agent-fabric/
    scope-and-invariants · authority · ownership-and-topology ·
    run-lifecycle-and-gates · provider-actions-and-adapters ·
    messaging-and-public-protocol · evidence-and-review · effects ·
    acceptance-map
  04-agent-fabric-operational-hardening.md + …/
    repository-and-architecture-assurance · daemon-and-wire ·
    workspace-trust-and-containment · persistence-and-cutover ·
    recovery-and-reconciliation · provider-route-budget-lifecycle-custody ·
    review-bundle-and-portal-custody · retention-receipts-and-exports ·
    observability-status-and-operations · acceptance-map
  05-project-fabric-console.md + …/
    scope-and-projections · project-sessions-and-chair ·
    intake-scoping-and-continuation · artifact-review-and-attention ·
    operator-views-and-interaction · integrations-git-github-herdr ·
    lifecycle-and-failure-ux · acceptance-and-usability
```

Source inventory (line numbers at `1ddfe24`): spec 01 base §1–31 ≈ 1–3425,
§32 amendment ≈ 3426–9731 (32.19 ≈ 2,560 lines, 32.13 ≈ 800); spec 04 base
§1–8 ≈ 1–342, §9 amendment ≈ 343–8456 (9.13 ≈ 970, 9.21 ≈ 3,230,
9.22 ≈ 1,810); spec 05 base §1–16 + §17 amendment. Specs 02 (726) and 03
(171) are already under cap — leave in place or manifest-ise for
consistency, successor's call.

Migration rules (binding — codex Q4 + Console handoff):

1. **Repair and freeze semantics first**: complete the amendment-audit
   repairs and an independent freeze of current semantics before moving
   text. A purely mechanical split keeps the semantic version; any
   behavioural change bumps it.
2. **Fold, don't append**: every requirement/acceptance ID gets exactly one
   normative module owner; `acceptance-map.md` links rather than restates.
3. **Ownership boundaries**: spec 01 = public/domain contracts + six kernel
   capabilities; spec 04 = enforcement/persistence/recovery/containment/
   custody/observability (never the public lifecycle or Console policy);
   spec 05 = product projections and UX only.
4. **Status honesty**: amendments in 01 v0.36 / 04 v1.31 / 05 v1.13 are
   under review, not accepted — family manifests must carry the acceptance
   state currently in `00-index.md`; frontmatter per pack
   `schemas/document-frontmatter.schema.json`.
5. **Total accounting**: generate an old section/requirement-ID → new module
   map; keep it until all conformance checks pass. A fresh-context verifier
   confirms coverage, caps, unique IDs/canonical keys and link integrity
   before originals are removed.
6. **Reconcile, don't copy, known conflicts**: spec-owns-decisions vs ADR
   practice; Spec 05 four-slot review profile still binding (ADR-0008);
   read-only assumptions vs ADR-0002; Spec 04 archive-only language vs
   ADR-0007.
7. **Inbound references**: repoint every reference to the five current spec
   files repo-wide (ADRs, efforts, handoffs, skills, runtime docs, pack).
   `amendment-audit-2026-07-13.md` stays as evidence with a note that its
   anchors refer to the pre-split files at `1ddfe24`.
8. **Atomic replacement**: each monolith is replaced by its manifest in the
   same commit; note the split in the commit body so the five active
   worktree agents rebase deliberately.

Execution pipeline (one writer per module, non-overlapping): planner
(flagship, high) emits exact span→module map; writers (flagship for the big
semantic folds 32.19/9.13/9.21/9.22, workhorse for mechanical moves) read
only assigned spans; fresh-context verifier (flagship, high) gates deletion
of originals; then `scripts/check_spec_families.py` lands with tests and is
wired into `scripts/check-harness`.

### H4 — deletion of the two review directories

Gates, all required before `rm`:

1. H1, H2 and H2b complete (extractions, codex adjudication and the accepted
   pack repairs landed and committed).
2. The 5 inbound links repointed (verify:
   `grep -rn "agent-harness-comprehensive-review\|provenant-re-review-2026-07-13" --include="*.md" docs/ skills/ | grep -v pack_2026-07-14` → only
   self-references inside the two dirs remain).
3. SPEC05-APPLICABILITY.md uncommitted diff captured into pack `17` (item D).
4. **Recoverability**: `git add docs/provenant-re-review-2026-07-13 && git commit` (it is untracked; one commit makes deletion reversible), then delete
   both dirs in a follow-up commit:
   `docs: remove superseded review programmes (extracted into simplification pack)`.

### H5 — close-out

- Write/refresh the run receipt (see below), update pack
  `18_IMPLEMENTATION_STATUS_TEMPLATE`-derived status if used, mark this
  handoff `Consumed-at`, and report: findings summary, open human decision
  (D-021 carry-over), deletion confirmation, spec-split verification results.

## Run receipt (state at handoff)

- Risk tier: substantial (docs-only, but normative governance surfaces).
- Chair: Claude Fable 5 (this session). Cross-family leg: pair-codex
  gpt-5.6-sol xhigh via direct-cli gate (`scripts/model-route` receipt: ok,
  catalog 2026-07-10). `FABRIC-ROUNDTRIP-UNAVAILABLE` recorded; artifact
  collection path used.
- Native workers: verify-baseline (Opus 4.8), mine-comprehensive (Opus 4.8),
  mine-re-review (Sonnet 5), consolidate-re-review (Opus 4.8),
  consolidate-comprehensive (Opus 4.8) — all read-only except their named
  artifact/write scopes; no overlapping writers.
- Write scopes used so far: pack files 04/05/08 (chair), pack review/ dir,
  pack 03/09/21/22/23/schemas/templates (agent), pack 10/15/17/24/25/26 +
  ADR-0002/adr-README/effort/handoff repoints (agent), this handoff.
- No branches, worktrees, releases, external effects. No source-code changes.
