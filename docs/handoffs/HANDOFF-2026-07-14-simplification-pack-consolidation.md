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

### In flight at handoff (verify before proceeding)

- **consolidate-re-review** (Opus subagent): writing pack
  `21_DECISION_DELEGATION.md`, `22_DOCUMENT_GOVERNANCE.md`,
  `23_SKILL_DELTAS.md`, `schemas/`, `templates/`, and edits to
  `03_MINIMAL_CONTRACTS.md`, `09_WORK_PACKAGES_AND_SEQUENCE.md`.
- **consolidate-comprehensive** (Opus subagent): writing pack
  `24_AUTONOMOUS_CHARTER.md`, `25_AUTHORITY_V2_AND_CONTAINMENT.md`,
  `26_IMPLEMENTATION_SEEDS.md`, edits to `10/15/17`, and repointing the 5
  inbound links.
- **pair-codex** (gpt-5.6-sol xhigh, Herdr pane `w5:p16`): independent
  cross-family pack review per `review/pair-codex-assignment.md`; writes
  `review/pair-codex-findings.md` ending `STATUS: complete|partial`.

If any of the three did not finish: their instructions are fully recorded in
`review/pair-codex-assignment.md` and the two `native-mine-*.md` reports —
re-dispatch a fresh worker with the same scope. Fabric request/reply was
unavailable (`FABRIC-ROUNDTRIP-UNAVAILABLE`); collection is by reading the
named artifact files, with `herdr agent get pair-codex` / bounded
`herdr agent read pair-codex --source recent-unwrapped --lines 60` for pane
status only.

## Open human decision (blocking for governance text, not for mechanics)

**Does the D-021 autonomous chair charter (and its §7 preserved boundaries)
carry over from the superseded comprehensive-review programme to the
simplification pack programme?** The charter's stated scope was the old
programme; the pack re-introduces per-decision human gates the charter had
converted to LLM resolution (P1-1). Until the human rules: treat the §7
boundaries as in force and apply the stricter (pack) reading of approval
gates. Record the ruling in pack `15_DECISION_REGISTER.md` and reconcile
pack `04`/`05` notes.

## Remaining work packages (execute in order)

### H1 — collect and adjudicate pair-codex findings

1. Wait/check for `review/pair-codex-findings.md`.
2. Adjudicate against the native reports (chair owns the call; objective
   checks outrank votes; do not majority-vote weak claims).
3. Apply agreed pack corrections. Record disagreements in the findings file
   or a short `review/ADJUDICATION.md`.
4. Close the pane deliberately after capturing results (`herdr agent get`,
   read bounded tail; the pane was created by this session and may be closed).

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

Target layout (per pack `22_DOCUMENT_GOVERNANCE.md`, already human-directed):

```text
docs/specs/
  README.md                        regenerated index (replaces 00-index.md)
  agent-fabric/
    index.md                       domain scope, version/acceptance provenance
    <subject>.md                   current normative contract, <=1000 lines
  console/
    index.md
    <subject>.md
  harness/
    index.md
    adaptive-agent-harness.md      from 02 (726 lines, mostly relocation)
    activation.md                  from 03 (171 lines, relocation)
```

Source inventory (line numbers at `1ddfe24`):

- `01-agent-fabric.md` 9,731 lines; base §1–31 ≈ lines 1–3425; §32 amendment
  ≈ 3426–9731 with subsections 32.1–32.22 (32.19 ≈ 2,560 lines,
  32.20 ≈ 340, 32.21 ≈ 660, 32.13 ≈ 800).
- `04-agent-fabric-operational-hardening.md` 8,456 lines; base §1–8 ≈ 1–342;
  §9 amendment ≈ 343–8456, subsections 9.1–9.24 (9.13 ≈ 970, 9.21 ≈ 3,230,
  9.22 ≈ 1,810, 9.23 ≈ 560).
- `05-project-fabric-console.md` 1,465 lines; base §1–16 + §17 amendment.
- `amendment-audit-2026-07-13.md` (246): retain as evidence; add a note that
  its line anchors refer to the pre-split files at `1ddfe24`.

Provisional subject allocation for `agent-fabric/` (planner refines to exact
spans; expect ~14–18 files):

- `authority.md` — 01 §6, §10; `git-actions.md` — 01 §32.13 + 04 §9.13
- `records-and-leases.md` — 01 §11–12; `protocol-surface.md` — 01 §14, §32.7
- `execution-control.md` + `inbox-and-callbacks.md` — 01 §9 (must split), §32.5
- `provider-adapters.md` — 01 §13, §32.11; `provider-routes.md` — 01 §32.19
- `sessions-and-recovery.md` — 01 §15, §32.6, §32.12; `rotation-custody.md` —
  01 §32.20 + 04 §9.22
- `project-sessions-and-operator.md` — 01 §32.1–32.4, 32.8–32.10, 32.14–32.18,
  32.22
- `persistence-and-daemon.md` — 04 §1–8, §9.1–9.6;
  `launch-custody.md` — 04 §9.7–9.12; `operator-reads-and-notifications.md` —
  04 §9.14–9.20; `capability-routes-persistence.md` — 04 §9.21, 9.23–9.24
- `observability.md` — 01 §19–20; `security.md` — 01 §18;
  `acceptance.md` — 01 §22–25 + 04 §8/9.6/9.10 verification additions
- decision/history sections (01 §26–31, review history, approval gates) →
  ADR promotions + domain `index.md` provenance, per pack `11 §6`

Fold rules (binding):

1. **Fold, don't append**: each amendment subsection merges into the topical
   file owning its subject; the folded text reads as one current contract.
2. **Status honesty**: every new file carries frontmatter
   (`schemas/document-frontmatter.schema.json` in the pack) recording source
   spec + version + acceptance status. Spec 01 v0.36 / 04 v1.31 / 05 v1.13
   amendments are **under review, not finally accepted** — the domain
   `index.md` must preserve exactly the acceptance state currently in
   `00-index.md`. Do not present under-review text as accepted.
3. **Total accounting**: maintain a machine-checkable map: every source line
   span → (target file | archived | dropped-with-reason). A verifier agent
   must confirm coverage before deleting the original files.
4. `<=1000` lines per output file, checked mechanically (`wc -l`).
5. **Inbound references**: grep repo-wide for `01-agent-fabric`,
   `02-adaptive-agent-harness`, `03-agent-fabric-activation`,
   `04-agent-fabric-operational-hardening`, `05-project-fabric-console`,
   `docs/specs/0` and repoint (ADRs, efforts, handoffs, skills, runtime docs,
   pack files).
6. Originals are tracked — git history is the archive; delete them only after
   the verifier passes and the index is regenerated.
7. **Coordination**: active worktrees (`lane-d-preflight-fixtures`,
   `net-current-consolidation`, `receipt-portability-repair`,
   `rust-ci-repair`, `comprehensive-review`) may reference current spec paths.
   Land the split as one commit; note it in the commit body so worktree agents
   rebase deliberately.

Execution pipeline (chair stays integrator; one writer per target file —
non-overlapping):

1. **Planner** (flagship, high effort): read headings + skim spans; emit the
   exact span→file map and per-file frontmatter/canonical_keys.
2. **Writers** (flagship for the big semantic folds: 32.19, 9.13, 9.21, 9.22;
   workhorse for mechanical relocations): each reads only its assigned spans
   (`sed -n 'A,Bp'`), writes one target file.
3. **Verifier** (flagship, high, fresh context): coverage map complete, line
   limits, no duplicated normative claims across files (canonical_keys
   unique), acceptance-status fidelity, links resolve.
4. Regenerate index, delete originals, commit:
   `docs(specs): fold amendments and split into <1000-line domain files`.

### H4 — deletion of the two review directories

Gates, all required before `rm`:

1. H1–H2 complete (extractions + codex adjudication landed and committed).
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
