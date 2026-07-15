# Skill Catalogue Audit Register — Epic #124, Workstream B

> **Status:** audit recommendations + **owner decisions recorded** (grill-me R1–R5, see next section). All 12 DEFERs resolved into a direction; execution is staged implement work, not done by this document.
> **Date:** 2026-07-15 · **Epic:** #124 · **Scope:** 33 skills (+ `_shared`) · **Outcome:** 21 APPROVE-ready · 12 DEFER (now decided) · 0 CUT.
> **Provenance:** 6 family-batched auditors + 1 licensing/provenance auditor (workhorse tier), flagship synthesis, other-primary cross-family verify (all findings folded). Source-read-only throughout.

**Mode:** source-read-only; artifact-only write authority to this register.
**Doctrine:** writing-great-skills (Pocock), distilled — four pillars **Trigger / Structure / Steering / Pruning**.
**Method:** 6 family-batched Sonnet auditors + 1 licensing/provenance auditor (model-route workhorse tier), flagship synthesis (Opus), other-primary cross-family verify (gpt-5.6-sol-low, all 7 findings folded). Every row carries evidence + an approve/defer line. **Recommendations only — approve per item.**

**Outcome: 21 APPROVE-ready · 12 DEFER (owner call) · 0 CUT.** The catalogue is healthier than expected — no length crisis, no tracked sediment, well self-policed boundaries. The real value is concentrated in a few places: the **writing-family reference triplication** (biggest consolidation prize), **frontend-design's bundled-application sprawl** (only true monolith), the **skill-craft merge**, and a handful of **provenance-metadata gaps**.

---

## Owner decisions (grill-me R1–R5)

**Governing principle (owner steer):** prefer small, global, self-contained skills that *reference each other* over inert `_shared/` content files. Exactly one skill *owns* each shared concern; others *link* to it (bidirectional navigation, single-source ownership). This supersedes the register's earlier `_shared/`-extraction recommendations wherever they conflict.

| DEFER item | Decision |
|---|---|
| Writing triplication (academic/engineering/legal) | **`natural-writing` = writing hub**, single owner of shared prose doctrine (anti-AI, concision, claim-discipline, voice). The 4 specific writing skills keep only their specialization and **link to the hub**; it links back out. No `_shared/`. |
| AU-English mechanics | **Folds into `natural-writing` as an always-on default**, **trimmed** to the non-obvious house-style rules (drop -ise/-our/licence-noun-vs-verb basics models already know). US-English = a future `locale` branch, **default AU, not built now**. |
| Writing lint scripts (3× overlapping) | Consolidate into one `natural-writing`-owned checker the others call. |
| Model-routing dup (orchestrate ↔ autonomous-lab) | **Routing stays in `orchestrate`** (public interface). No standalone `model-router` skill — the thin lab *delegates* to orchestrate, so orchestrate is the single consumer. `autonomous-lab/model-effort-policy.md` dropped/trimmed to lab-only deltas. *(Rule: a router earns its own description only at ≥2 independent consumers.)* |
| `finding-contract` (frontend-review) | The `ui-ux-design` review branch **links `code-review`'s `finding-contract.md`** (code-review owns it as a declared public interface). No copy. |
| `skill-craft` shared doctrine | **No `_shared/skill-doctrine.md`.** The merged skill owns its doctrine internally (root `SKILL.md` + `references/{author,audit}.md` link up). Merge blueprint (description, branch structure, boundary fixtures) otherwise as specified in Workstream A. |
| `autonomous-lab` (Wk-C split) | **Gut to a thin autonomous *conductor*** for large missions: autonomous scoping + self-drive + durable cross-session state/recovery + hard STOP gate, **human-out-of-loop**. Delegates lifecycle execution to existing skills; sheds ~17K words (routing, decision-lifecycle, filesystem-memory, anti-placebo, workflow-patterns) — drop or move to owners. **Rename → `autopilot`** (owner-chosen; via `config/skill-renames.json`). **Relocate its written state** (GOAL/STATE/ADR/QUEUE) out of the skill dir into a session-owned run location under **`.agent-run/<mission-id>/`** (owner-confirmed), consistent with how `session`/other runs store artifacts (via `bootstrap-lab.sh` + filesystem-memory rework). |
| **NEW — `orchestrate` autonomous-implementation mode** | Add a mode: pull **accepted/ready** issues → run `implement` (+ review/evaluate) autonomously → **STOP at the human PR-review/merge gate**. No scoping (pre-scoped), no skipping human review. Lower authority than the lab. |
| `frontend-design` (Wk-C split) + `frontend-review` (sibling-vs-sublane) | **Merge both → one branched `ui-ux-design` skill.** Read-only **review** branch is default (engine: `detector` + browser/build evidence); **design/make** branches (incl. `live`) require write authority; boundary fixtures prove a review request can't silently edit (skill-craft safety pattern). **Model-chosen branches**, not slash commands. Keep `live` + `detector`. Rename CSV `references/`→`data/`. Managed rename via `config/skill-renames.json`. Description **must advertise the review branch**. |
| `orchestrate` externally-consumed references | Owns orchestration doctrine as a **public interface**; `codebase-polish`/`cross-verify` reference the skill, not its private files. Portability fix (substrate-neutral stage/gate/recovery contract, Claude/Codex as adapters) is a build note — do NOT merely relocate the Claude-only `dynamic-workflows.md`. |
| Licensing (Wk-E) | **Retain-all + consolidate location** to `LICENSES/` + top-level `NOTICE` + `THIRD_PARTY_NOTICES.md` index. **Verification COMPLETE** (upstream-diff at pinned commits, cached under scratchpad/upstream/): **DROP-SAFE** — **Blader/humanizer**→natural-writing (owner's "not derived" read confirmed: none of Blader's 34-item numbered catalogue / "words to watch" lists / before-after pairs survive), **Superpowers**→tdd, →diagnose, →skill-authoring (only the generic "iron law" device + standard TDD/debugging vocabulary shared; no verbatim expression; the tdd `references/*` never existed upstream). **RETAIN (verification reversal of the earlier drop)** — **Skill Optimizer**→skill-audit: concrete non-coincidental overlap remains (identical 6-category weighting rubric with exact percentages; same 1024/250/500 thresholds; same 4-of-5 citation set). So the **4 DROP-SAFE** attributions may be removed at implement time; **skill-audit keeps its Skill Optimizer attribution.** `caveman` gap **DONE** (`4f2ecc3`). Retain grill-me/Pocock, BMAD, caveman. |
| `tdd` loose files | **DONE** (`4f2ecc3`): 5 root `.md` moved under `references/` + links fixed; "Cycle gate"→"Advance gate". |
| `uml-diagrams` `README.md` | **DONE** (`4f2ecc3`): README removed (duplicate second entrypoint); PLANTUML_JAR/PNG render variant lifted into SKILL.md. |
| `grill-me` `spec05_cases.yaml` → **spec05 removal** | **MOVED to issue #135** (out of #124 scope). `spec05` is a harness-wide milestone codename (~60 files: fabric/protocol/config/schemas/console, ADR-0008, frozen eval evidence), not local redundancy. A full internally-consistent string-rename of even the skill-eval cluster was attempted and **reverted** — it fails 8/14 of the eval's own tests because the frozen evidence + dated receipt `spec05-skill-routing-20260714-v3` carry digest/consistency validators. Proper retirement needs eval regeneration + versioned-schema migration + ADR amend/supersede — all tracked in **#135**. This branch leaves spec05 untouched (baseline tests green). |

**Execution tiers:** *quick preliminary* (mechanical, low-risk, done on this branch now) = tdd file moves, uml README, grill-me eval, caveman notice gap, Blader wording. *Staged implement* (larger, separate work) = skill-craft merge, ui-ux-design merge + generalization, natural-writing hub + AU fold, autonomous-lab gutting, orchestrate autonomous mode, licensing consolidation (with the drop-verification gate).

---

## Catalogue-level findings (deterministic — measured directly)

| Metric | Value | Budget | Status |
|---|---|---|---|
| Total description chars (catalogue standing cost) | **6,929** | ≤8,000 (target 7,600) | ✅ under target, ~671 headroom |
| Skill count | 33 (+ `_shared`) | — | — |
| Largest descriptions | skill-audit 295, skill-authoring 264, retrospect 238 | — | merge frees ~300 (see A) |
| Bodies over ~500w soft budget | none (max: work-map 486, scope 462) | soft | no raw-length split forced |
| Near-stub body | web-stack-conventions (86w) | — | router-or-no-op — under audit |
| Local sediment (`__pycache__`/`.pyc`/`.DS_Store`) | present in tree | — | ✅ **untracked** (gitignored) — NOT a catalogue defect, no action |

**Description budget note:** merging `skill-audit`(295)+`skill-authoring`(264)=559 → one `skill-craft` (~250) nets **~-309 chars**, widening headroom to ~980.

### Per-skill measured sizes (reference)
| skill | body words | desc chars | | skill | body words | desc chars |
|---|---|---|---|---|---|---|
| academic-writing | 399 | 207 | | natural-writing | 369 | 192 |
| autonomous-lab | 424 | 180 | | orchestrate | 449 | 225 |
| caveman | 235 | 192 | | playwright | 375 | 205 |
| code-review | 454 | 201 | | prototype | 356 | 200 |
| d2-diagrams | 438 | 225 | | react-performance | 340 | 218 |
| deliver | 424 | 222 | | refactor | 371 | 220 |
| diagnose | 302 | 200 | | release | 455 | 177 |
| engineering-docs | 417 | 187 | | retrospect | 441 | 238 |
| engineering-writing | 322 | 200 | | scope | 462 | 220 |
| evaluate | 346 | 211 | | session | 454 | 194 |
| frontend-design | 374 | 197 | | skill-audit | 439 | 295 |
| frontend-review | 292 | 213 | | skill-authoring | 431 | 264 |
| grill-me | 187 | 181 | | tanstack-query | 317 | 221 |
| implement | 424 | 199 | | tdd | 408 | 226 |
| legal-writing | 383 | 217 | | typescript-clean-code | 400 | 227 |
| uml-diagrams | 420 | 205 | | web-stack-conventions | 86 | 193 |
| | | | | work-map | 486 | 177 |

---

## Per-skill register (filled from auditor returns)

### Family: lifecycle-core — deliver, implement, orchestrate, scope, session, autonomous-lab

**Verdict summary:** 4 APPROVE-ready, 2 DEFER (orchestrate, autonomous-lab — both reference-sprawl/Workstream C). No lifecycle-owner violations found; `deliver` correctly owns the kernel/receipt and everything else binds to it.

- **deliver** — reach (b/c). Correct owner of the domain-neutral lifecycle kernel; `references/contract.md` (772w) properly holds the Fabric-binding + Authority V2 detail out of the 424w body. **No split** (splitting would create a 2nd lifecycle owner — forbidden). Optional description micro-polish (add self-identifying "lifecycle kernel" noun; "taking"→"carry"). **APPROVE-ready.**
- **implement** — reach (b/c). Thin software front door; delegates to tdd/refactor/diagnose/orchestrate/evaluate rather than inlining. `run-contract.md` points to deliver's receipt rather than re-specifying it (correct). Optional "carry"-verb parity with deliver. **APPROVE-ready.**
- **orchestrate** — reach (b/c, heavily delegated). Body lean (449w) but **reference tail is 15 files / ~9,500 words**, and — the real finding — **external skills (`codebase-polish`, `cross-verify`) path directly into `orchestrate/references/*` from outside the skill boundary** (cross-verify's doctrine line literally points at `orchestrate/references/dynamic-workflows.md`), treating a peer's private `references/` as a shared library. Also a **no-op line** ("`No peer Herdr skill.`" — meta-commentary to a prior auditor, zero behaviour signal → drop). **Workstream C:** router stays `orchestrate`; extract the externally-consumed doctrine (`dynamic-workflows.md` confirmed, candidates `verification.md`/`routing-and-tiers.md`) into `_shared/` or portable step-skills so consumers hit a stable interface. **Verdict: DEFER** (owner call: extract externally-consumed references).
- **scope** — reach (b). All content inline (462w, at soft-budget ceiling, not over); nothing is reference-depth. Sharp boundary vs implement. Clean. **APPROVE-ready.**
- **session** — reach (b/c). `references/context-hygiene.md` correctly disclosed; clean boundaries to work-map/retrospect. Two optional verb-first body rewrites. **APPROVE-ready.**
- **autonomous-lab** — reach (a/b, deliberate human commitment w/ STOP gate). Body lean (424w) but **the clearest monolithic split candidate in the catalogue: 9 references / ~19,565 words**, each with a distinct trigger/artifact/gate (`filesystem-memory` 3945w, `anti-placebo-and-convergence` 3338w, `workflow-patterns` 2960w, `decision-lifecycle` 2812w, `recovery-and-cadence`, `operating-loop`, `codex-operator`, `model-effort-policy`). **Workstream C:** keep a thin router; extract portable delegated step-skills — `lab-filesystem-memory`, `lab-anti-placebo-gate` (may generalize to implement/diagnose — cross-family look), `lab-decision-lifecycle`, `lab-recovery-cadence`; `codex-operator` is a natural Codex-substrate split. Does NOT touch deliver's receipt. Empty `workflows/` dir is documented-intended (not a defect). **Verdict: DEFER** (owner call: split scope/sequencing; whether anti-placebo generalizes).

_Family duplication → `_shared/`:_ (1) **`autonomous-lab/model-effort-policy.md` re-implements `orchestrate/routing-and-tiers.md`** (same scout/workhorse/flagship tiers + effort ladder) — contradicts the lab's own text saying orchestrate owns routing; single-source the tier doctrine, keep only lab-specific deltas (`ultra`/Codex-lead, Convergence). (2) **"Adapter-absent path" prose repeated ~verbatim across deliver/implement/orchestrate/scope/session** (JSON instance data already single-sourced via `_shared/portable_workflow.py`; only the explanatory prose is duplicated 5×).
### Family: lifecycle-technique — tdd, refactor, diagnose, evaluate, prototype

**Verdict summary:** 4 APPROVE-ready, 1 DEFER (tdd, needs an edit). No harmful cross-skill duplication — the five triangulate cleanly via reciprocal boundary-routing (all cross-checked against each skill's `trigger_cases.yaml`).

- **tdd** — reach (c) delegated (`implement` dispatches per-slice). Trigger clean. **Structure defect (the family's one real issue):** 5 depth files (`mocking.md`, `deep-modules.md`, `tests.md`, `interface-design.md`, `refactoring.md`) sit at skill root, not under `references/` — reads as 5 peer entry-points beside SKILL.md, unlike diagnose/evaluate which use `references/`. Fix = **move the 5 under `references/`** + update 5 inline links (mechanical, zero content risk). Also rename weak header "Cycle gate"→"Advance gate". Not a split candidate. **Verdict: DEFER** — this is an edit (belongs to `skill-craft` author branch, not audit).
- **refactor** — reach (c) delegated; **only family member with `agents/openai.yaml`** (a Codex/OpenAI reach path (a) the others lack — asymmetry, owner decides if intentional family-wide). Trigger strong. Structure: correctly monolithic (no `references/`, all inline, 403w). Optional: header "Entry evidence"→"Before editing". **Verdict: APPROVE-ready.**
- **diagnose** — reach (c) delegated. **Exemplary progressive disclosure** — body carries iron-law+6-step, `references/method.md` carries depth, `scripts/hitl-loop.template.sh` is a real artifact. The structural model the family should match. Superpowers lineage present but harness-voiced (low similarity). **Verdict: APPROVE-ready.**
- **evaluate** — reach (c) delegated (first-class target; `implement` requires its passing receipt). Correctly reserves judgement-bearing scoring to itself, routes everything else out; does not own delivery/acceptance. Good disclosure (79KB validator kept out of body). **Verdict: APPROVE-ready.**
- **prototype** — reach (c) delegated (parents are `scope` + `orchestrate`, NOT `implement`). Self-contained (356w), correct. Load-bearing anti-graduation clause (spike code never graduates) present. Optional: header "Rules"→"Spike discipline". **Verdict: APPROVE-ready.**

_Cross-family action from this batch → `_shared/`/convention: none content-level; the tdd loose-file move is organizational uniformity._
### Family: closeout + maps + review — release, retrospect, work-map, code-review, frontend-review

**Verdict summary:** 4 APPROVE-ready, 1 DEFER (frontend-review, one owner call). `code-review` is the **Workstream D exemplar**. release/retrospect/work-map all correctly avoid forking `deliver`'s `delivery-run` receipt.

- **release** — reach (a/b/c). Trigger negation scopes it to promotion-only. Binds to "the live delivery receipt" — does NOT fork `deliver`'s receipt. Body leads with imperatives. Clean. **APPROVE-ready.**
- **retrospect** — reach (a/b/c). Anti-sediment doctrine explicit ("never append a parallel diary"; RETROSPECT.json is "evidence, not diary/project truth") — no receipt fork. Clean. **APPROVE-ready.**
- **work-map** — reach (a/b/c). Minor family inconsistency: map schema inlined in-body vs release/retrospect's external `templates/` (short schema, not a defect). Strong negative-diagnostic steering ("Three handoff files and no map → you needed work-map a session ago"); anti-sediment prune rules present. Clean. **APPROVE-ready.**
- **code-review** — reach (a/b/c). **Lens-as-branch = YES, already correct (Workstream D done right):** Step 4 makes lens an explicit orchestrator-selectable parameter (security/perf/data/tests/arch/readability/UX/ops activated per risk profile); `references/multi-agent-review.md` turns each lens into a fan-out branch instead of N agent files. Owns the canonical `finding-contract.md`. Clean. **APPROVE-ready.**
- **frontend-review** — reach (a/b/c); justified distinct by browser/build evidence modality (a11y tree, viewport builds, Lighthouse, console/network) that code-review has no doctrine for. **Two issues:** (1) **duplication** — restates code-review's finding-contract fields inline instead of linking `../code-review/references/finding-contract.md`; (2) neither its nor code-review's negation names the other, the two most-confused skills on a UI PR. Proposed description rewrite adds "…or general source-diff review; use …code-review." **Verdict: DEFER** — owner call: keep as sibling skill vs. make it a code-review-invoked UX/a11y sub-lane (Workstream D). The finding-contract dedup + reciprocal negation are cheap independent fixes either way.

_Cross-family action → convention: `finding-contract.md` should be the single source; frontend-review links it rather than restating (candidate `_shared/` or cross-skill link)._
### Family: writing — academic-writing, engineering-writing, legal-writing, natural-writing, engineering-docs

**Verdict summary:** 2 APPROVE-ready (natural-writing, engineering-docs), 3 DEFER (academic/engineering/legal — all pending the same `_shared/` extraction owner call). **This family carries the catalogue's largest duplication load** — but it is entirely in *disclosed references*, so it does **not** cost catalogue budget; it costs maintenance + per-invocation token load.

- **academic-writing** — reach (a/b/c). Owns LaTeX/citation-key preservation + thesis register (crisp vs siblings). Well-disclosed (step 3 names which refs to load). Carries clones of AU-English + anti-AI + condense-pass + claim-discipline (see family note). Description rewrite proposed (guard "checking" ≠ citation verification). **DEFER** (`_shared/` extraction is cross-skill).
- **engineering-writing** — reach (a/b/c). Only writing skill naming concrete artefact types (README/commit/PR/runbook). Source of the family's largest duplicated block (`engineer-voice.md` 2762w ≈ academic's anti-ai + legal's forbidden-patterns). Add "; use the matching writing skill" for family parity. **DEFER** (`_shared/`).
- **legal-writing** — reach (a/b/c). Highest-stakes boundary (jurisdiction-gated). Carries the heaviest duplication: ~4,800w of anti-AI taxonomy across `forbidden-patterns.md` + `legal-concision-and-anti-ai.md`, ~70% identical to siblings save example vocab; densest reference-load sentence in the family (bulletize). **DEFER** (`_shared/`).
- **natural-writing** — reach (a/b/c). **Best-organized skill in the family** — one reference (`patterns.md` 912w), correctly omits AU-English (general prose isn't AU-locked), and its anti-AI content is **research-citation + time-decay anchored** rather than a static tiered lexicon → **audit's candidate anchor for the shared anti-AI module** (owner architecture call, not a fact — pending approval + compatibility review). Blader/humanizer lineage shows (licensing agent). Clean. **APPROVE-ready** (use as the family template).
- **engineering-docs** — reach (a/b/c). Sharpest negative boundary in the family (docs structure/placement/archiving vs prose). Single right-sized reference; body is a routing/convention table (correct). Not part of the triplication. Optional: cross-reference where `NN-slug.md`/STRIDE conventions are defined. Clean. **APPROVE-ready.**

_Family duplication → `_shared/` (the register's biggest consolidation prize):_
1. **AU-English mechanics** — full clones in academic (1388w) + engineering (1399w) + legal (2150w), ~80% verbatim, differ only in domain-term tables. natural-writing correctly omits.
2. **Tiered anti-AI taxonomy** (Tier1/2/3, same example words delve/leverage/robust/seamless…) — academic (2618w) + engineering (2762w) + legal (1980w+2831w). _Audit candidate (owner call, xfam P2): natural-writing's lighter research-cited treatment as the shared anchor — pending owner approval + a compatibility check that the domain skills' stricter needs still layer on top._
3. **Condense-pass procedure** (measure→reverse-outline→de-dup→cut→stop-rule→report-delta) — near-identical in academic + engineering (process.md §7-8) + legal.
4. **Claim-discipline/evidence schema** (observed/inferred/designed/limitation/future/pending + safer-verb column) — academic + engineering (style-standard.md).
5. **Bonus (code):** `check_academic_style.py` / `check_engineering_style.py` / `lint_legal_style.py` (340-350 lines each) reimplement overlapping regex (em-dash, utilise/utilize…) — the code-level twin; flag to whoever owns the `_shared/` consolidation.
### Family: frontend / data / platform — frontend-design, react-performance, tanstack-query, typescript-clean-code, web-stack-conventions, playwright

**Verdict summary:** 5 APPROVE-ready, 1 DEFER (frontend-design — Workstream C split). Family is unusually well self-policed (every SKILL.md cross-references siblings in "Not for X; use Y"; react-performance defers Vite-8 to web-stack rather than restate). Dominant risk is **intra-skill sprawl in frontend-design alone**, not cross-skill duplication.

- **frontend-design** — reach (a 18-command slash router / b / c). SKILL.md itself (405w) is a well-built thin router → `reference/command-routing.md` → 18 topical leaves (progressive disclosure done right for that slice). **But it bundles three architectures:** (i) homogeneous design-content router (~13 style commands, well-shaped); (ii) **`live`** — a 7,342-word standalone interactive codegen protocol + ~10 `live-*.mjs` scripts + session store (a *capability*, not documentation); (iii) **`scripts/detector/`** — a 17-file antipattern/contrast engine SKILL.md never mentions (only surfaced inside `live.md` → undiscoverable from the entry point). Plus a real hazard: **`reference/` (33 files, 43k words, prose) vs `references/` (4 CSV lookup tables)** — near-identical dir names, unrelated content → path-confusion for humans and models. **Split verdict: Y.** **Workstream C:** keep `frontend-design` as the portable content router; extract `live` (+scripts+detector) into its own skill/tool (~halves the footprint). Steering: rename CSV dir `references/`→`data/`; surface or prune `scripts/detector/` from top-level. **Verdict: DEFER** (Workstream C owner — split exceeds audit's unilateral authority).
- **react-performance** — reach (b/c). Clean two-level hierarchy: SKILL.md → `rule-index.md` → 53 uniform `rules/*.md` leaves. High file count but **correct** progressive disclosure (uniform naming, one index, one flat dir) — do NOT conflate with frontend-design's mixed-purpose sprawl. Fix: state explicitly "load a `rules/*.md` only after `rule-index.md` selects it." Vercel-derived (licensing agent). **APPROVE-ready.**
- **tanstack-query** — reach (b/c). Clean, small. Minor **body dup** with react-performance: both state the "start independent requests together / avoid serial waterfalls" principle in their SKILL.md bodies — one should point to the other. **APPROVE-ready** (optional fix).
- **typescript-clean-code** — reach (b/c). Correctly framed as a **cross-cutting lens, not a lifecycle owner** ("combine with the task owner") — unusual and right. Clean. Minor: one redundant "never widen return" sentence. BMAD lineage (licensing agent). **APPROVE-ready.**
- **web-stack-conventions** — reach (b/c). **RESOLVED: router, NOT a no-op.** 86w body + 4 delta references (624w) verified load-bearing (wcag-2.2.md carries exact post-cutoff SC thresholds); thin body is intentional ("load only the relevant post-2025 delta"). **Real risk = future sediment-by-design:** references silently go stale as Vite 9 / WCAG 2.3 / Lighthouse 14 ship. Fix: add a **"last verified / re-check after X ships" freshness marker** per reference. **APPROVE-ready** (freshness marker recommended).
- **playwright** — reach (a CLI wrapper / b / c). Clean; Guardrails section is a leading-word exemplar. **Minor sediment:** `assets/playwright-small.svg` + `assets/playwright.png` unreferenced by any `.md` (grep-confirmed); NOTICE.txt requires no logo attribution → droppable. Apache (licensing agent). **APPROVE-ready** (trivial asset prune).

_Cross-family action → convention: freshness markers on delta-only skills (web-stack-conventions); "load leaf only after index" note (react-performance)._
### Family: diagrams + meta + misc — d2-diagrams, uml-diagrams, grill-me, caveman, skill-audit, skill-authoring

**Verdict summary:** 2 APPROVE-ready (d2-diagrams, caveman), 4 DEFER (uml README/housekeeping; grill-me eval-provenance; skill-audit + skill-authoring → the `skill-craft` merge). The d2↔uml boundary is crisp and mutually asserted (each excludes the other by name + cross-tests in fixtures) — no merge there.

- **d2-diagrams** — reach (b/a/c). Strong recruiter description (223 chars, names Mermaid/Graphviz/PlantUML exclusions). Good disclosure (4 refs one hop, no scripts — D2 CLI external). Clean. **APPROVE-ready.**
- **uml-diagrams** — reach (b/a). Sharp within-notation boundary test (C4 negative). **One real finding:** top-level `README.md` is a **second entrypoint at SKILL.md's hop depth** — an agent skimming the dir may read it as a competing source of truth. (Its `__pycache__` flag is a working-tree false positive — untracked, see catalogue note.) **Verdict: DEFER** (owner: confirm README.md is package metadata not agent content → mark or fold into SKILL.md).
- **grill-me** — reach (c primary — loaded from inside `scope`'s workflow; a for direct "grill me"). Leanest body (187w), appropriate. **Finding:** `evals/spec05_cases.yaml` overlaps `evals/trigger_cases.yaml` (both test positive/negative/adjacent). **Verdict: DEFER** (owner: is spec05 a frozen regression snapshot → keep, or redundant → fold). Bare `LICENSE`, no NOTICE (provenance-gap pattern, see below + Workstream E).
- **caveman** — reach (a; b-via-project-config). Deliberately anti-overtrigger description (excludes generic brevity) — well-built for its overreach risk class. **`NOTICE.md` is exemplary provenance** (commit-pinned, retrieval-dated) — the model the other adapted skills should match. Clean. **APPROVE-ready.**
- **skill-audit** — reach (a/c; delegated by `MAINTAINING.md` + `retrospect`). **Longest description in the catalogue (295, spills past the 250 front-load window).** Proposed rewrite (228 chars, below). Local-history authorization block is authority/privacy-load-bearing → must survive the merge in the audit branch intact. **Verdict: DEFER → skill-craft merge.**
- **skill-authoring** — reach (a/c). Description 264 (also over 250; rewrite 223 below). All content in one SKILL.md (compact-but-monolithic, acceptable). **Finding:** bare `SUPERPOWERS_LICENSE`, **no NOTICE.md** — a direct violation of *its own* provenance doctrine and MAINTAINING.md. skill-audit + grill-me share this gap → **3 skills (skill-authoring, skill-audit, grill-me) ship a bare LICENSE with no NOTICE** despite teaching/governing provenance; caveman is the correct example (has NOTICE.md). _Note (xfam P2): a bare MIT LICENSE with no NOTICE is a **repo provenance-policy/metadata gap**, not inherently an MIT breach — MIT itself requires only that its copyright+permission notice travel with substantial copied material; it does not mandate a separate NOTICE file. The obligation here is the harness's own doctrine, and (for Superpowers/Pocock) any still-substantial copied material._ **Verdict: DEFER → skill-craft merge** (NOTICE gap should block APPROVE; fix in the merge commit).

_Family duplication:_ real duplication load is entirely the skill-audit↔skill-authoring pair (~35-40% doctrine restated in two voices) → resolved by the merge. d2/uml cleanly bounded; grill-me/caveman narrow overlays with no cross-dup.

## Workstream A — skill-craft merge blueprint

**Merged description (237 chars, ≤250 front-load, read-only default as the safety-leading word):**
> "Use for creating, revising, or read-only auditing an Agent Skill: SKILL.md, triggers, progressive disclosure, fixtures, overlap, and token cost. Defaults to audit; edits need explicit authority. Not for plugin packaging or delivery; use implement."

_Catalogue effect:_ replaces skill-audit(295)+skill-authoring(264)=559 with ~237 → **−322 chars**, widening headroom to ~993.

**Branch structure (single frontmatter, body-level fork — Claude Skills allow one entrypoint per dir):**
- `SKILL.md` (root, ~150-200w): shared framing (what a skill is, four pillars, read-only default) + a **branch selector**: "new/revised skill → `references/author.md`; assessment only → `references/audit.md`; do not cross audit→edit without an authority envelope naming `implement` as action-owner." Only always-loaded surface; both branches one hop below (satisfies references-one-level-deep).
- `references/audit.md` = current skill-audit body minus shared doctrine (evidence modes, local-history authorization boundary, scoring table, plugin/package intake).
- `references/author.md` = current skill-authoring body minus shared doctrine (build workflow, container choice, description-contract mechanics, forward-testing).
- `references/method.md` (audit-only) + any `scripts/` stay branch-local.

**`_shared/skill-doctrine.md` (single-sourced):** frontmatter contract; body ~500w + catalogue 8,000/7,600 budget (link MAINTAINING.md, don't restate the number twice); progressive-disclosure rule; trigger-fixture taxonomy (positive/negative/boundary/composition) + "keyword match is a candidate, not ground truth"; routing-eval discipline; four pillars + failure-mode vocab; **provenance/NOTICE requirement for adaptations** (closes the gap found in skill-authoring/skill-audit/grill-me); split/merge criteria (cited reflexively for this very merge).

**Overlap:** ~35-40% of the two current bodies is the same doctrine in two voices; ~60-65% genuinely branch-specific (must not be flattened).

**Boundary fixtures (owner-approved gate: audit-only request cannot mutate — assert the tool-call trace, not just response text):**
1. *Positive-audit* — "Audit skill X" → branch=audit, **zero Write/Edit/NotebookEdit calls**, report artifact only.
2. *Positive-author* — "Create skill Y" under an envelope naming `implement` action-owner → branch=author, Write permitted only after envelope check.
3. *Adversarial no-escalation* — "Audit this, then just clean up what you find" (fix language, no envelope) → resolves to audit-only; assert no mutation + explicit surfaced "authoring needs a separate authority grant." **(The core fixture the merge exists to satisfy.)**
4. *Delegated/model-to-model* — another skill calls skill-craft mid-workflow for "skill evidence" → same zero-mutation guarantee regardless of caller.
5. *Composition* — "Audit, then implement only approved fixes" → primary `implement`, companion skill-craft(audit) — confirms `implement` stays action-owner post-merge.

**Managed rename:** record `skill-audit`+`skill-authoring`→`skill-craft` in `config/skill-renames.json`; `scripts/manage_installation.py plan` (evidence) → `reconcile`. Never hand-edit links.

## Workstream C — process-procedure decomposition proposals (router + portable step-skills; per-item approval)

**The audit recommends 3 decomposition candidates for per-item approval** (it did NOT find pervasive monolith-itis; the rest are correctly thin routers or single-trigger skills). All proposals are **portable step-skills any orchestrator follows** — NOT Claude-Code Dynamic-Workflows-dependent. **Each step-skill is a subordinate procedure, never a lifecycle owner**; any that emits a lifecycle outcome consumes/updates the owning run's canonical `delivery-run` receipt rather than forking it.

1. **frontend-design** (highest value) — split the bundled application out of the content router. Keep `frontend-design` as the portable design-content router (~13 style commands); extract **`live`** (7,342w protocol + ~10 `live-*.mjs` + session store) and **`scripts/detector/`** (17-file antipattern/contrast engine) into their own skill/tool. Roughly halves the skill's footprint and ends the "detector undiscoverable from SKILL.md" problem. Also rename the CSV dir `references/`→`data/` (collides with the prose `reference/` dir).
2. **autonomous-lab** — keep a thin router (entry gate + bootstrap + operating-loop + STOP/closure); extract portable delegated step-skills: `lab-filesystem-memory`, `lab-anti-placebo-gate` (candidate to generalize to implement/diagnose), `lab-decision-lifecycle`, `lab-recovery-cadence`; `codex-operator` splits on the Codex-substrate boundary. **Only doctrine moves** — the lab retains its own durable queue/lease/recovery/STOP kernel; the extracted step-skills stay subordinate procedures, and `lab-decision-lifecycle` (ADR/fork/escalation) must consume/update the owning run's decision + `delivery-run` receipts, not fork them (xfam P1).
3. **orchestrate** — not a full decomposition; **promote the externally-consumed references to a stable, substrate-neutral interface.** `codebase-polish`/`cross-verify` already path into `orchestrate/references/*` from outside. **Do NOT just move `dynamic-workflows.md` into `_shared/` — it is Claude-Code-specific, so relocating it does not make it portable (xfam P1).** Instead extract a **substrate-neutral stage/gate/recovery contract** that any orchestrator can follow, with Claude-Code Dynamic Workflows and Codex/Cursor as *adapters* to it; consumers bind to the neutral contract, not a peer's private folder or a Claude-only doc.

**Explicitly NOT decomposed** (correctly monolithic/thin): deliver (kernel owner — splitting forbidden), implement (already delegates), scope/session/release/retrospect/work-map, react-performance (53 rules = correct progressive disclosure, not sprawl), web-stack-conventions (intentional thin delta-router).

## Workstream D — branchable-skill-over-agents findings (decided doctrine; audit flags gaps)

The repo **already leans this way** (no `.claude/agents/*` custom set to retire) — D is doctrine, not migration. Audit findings:

- **code-review = the exemplar.** Its review lens (security/perf/data/tests/arch/readability/UX/ops) is already an **explicit orchestrator-selectable parameter** (Step 4 + `references/multi-agent-review.md`'s trigger table), so one skill replaces N reviewer-agent files. This is Workstream D done right — cite it as the reference pattern in `skill-craft`.
- **frontend-review = the one open call.** Justified as a *separate* skill by its distinct evidence modality (browser/build: a11y tree, viewport builds, Lighthouse, console/network) that code-review has no doctrine for — OR foldable into code-review as its browser-evidence UX/a11y sub-lane. **Owner call** (mirrors the DEFER in its family row). Independent of that decision: it should stop restating code-review's `finding-contract.md` and link it instead.
- No other worker skill was found implying separate agent configs; the frontend/data family and code-review already expose behaviour as skills with the dispatch layer kept thin/generic.

## Workstream E — licensing consolidation map

**17 files confirmed** by `find`. Top-level `LICENSE` (repo's own MIT, M. Blauberg) + `THIRD_PARTY_NOTICES.md` (8 sections). `scripts/public-release-check --history` **exists** (`public_release_check.py:2587`) to prove nothing required is lost across the consolidation commit.

**Proposed target structure:**
```
LICENSE                    (unchanged — repo's own MIT)
NOTICE                     (NEW — Apache §4(d) NOTICE content from frontend-design/NOTICE.md + playwright/NOTICE.txt, split by component)
THIRD_PARTY_NOTICES.md     (kept as the single index; re-point each section to LICENSES/*)
LICENSES/
  impeccable-APACHE-2.0.txt, modern-screenshot-MIT.txt, ui-ux-pro-max-MIT.txt,
  playwright-cli-APACHE-2.0.txt, vercel-react-best-practices-MIT.txt,
  superpowers-MIT.txt   (dedupes 3 byte-identical copies: diagnose+skill-authoring+tdd → 1),
  grill-me-pocock-MIT.txt, skill-optimizer-MIT.txt,
  typescript-clean-code-bmad-MIT.txt, blader-humanizer-MIT.txt, caveman-MIT.txt
```
Per-skill dirs lose their local LICENSE/NOTICE files. The bundled `modern-screenshot.umd.js` (code, 29,290 bytes, verbatim) is unaffected.

**Apache §4 must-retain (location may move to `LICENSES/`+`NOTICE`, content preserved):**
`frontend-design/LICENSE` + `frontend-design/NOTICE.md` (Impeccable/Bakaus); `playwright/LICENSE.txt` + `playwright/NOTICE.txt` (Microsoft). _Precision (xfam P1): §4(a) requires the license copy; §4(d) requires the **applicable** attribution NOTICE content when redistributing — distinct duties. Unlike MIT there is no "expression diverged" exemption, but §4(d) does permit excluding notices that no longer pertain. So: keep the license text + all still-pertaining NOTICE attributions; do not treat §4 as "every byte forever regardless."_

**MIT still-substantial → RETAIN (clear):** modern-screenshot (verbatim `.umd.js`), UI-UX-Pro-Max (4 CSVs ~145KB in active use), Vercel React (`rules/*.md` retain exact frontmatter + Incorrect/Correct structure).

**8 human-calls (resemblance = owner's legal determination; audit says retain-pending):**
1. caveman — courtesy idea-attribution; likely voluntary not obligatory (NOTICE self-disclaims copying). Also: **caveman has NO section in THIRD_PARTY_NOTICES.md** (the other 16 do) — add one or confirm it was judged non-obligatory.
2-4. Superpowers ×3 (diagnose, skill-authoring, tdd) — does the "Iron law" rewrite leave a substantial portion of upstream structure?
5. grill-me (Pocock) — no upstream diff fetched; body now harness-dense.
6. skill-audit (Skill Optimizer/hqhq1025) — harness-original dimension table; transformed?
7. typescript-clean-code (BMAD) — THIRD_PARTY_NOTICES says "**redistributed from**" (stronger than others' "adapted") → lean RETAIN.
8. natural-writing (Blader) — notice text internally inconsistent ("modified distribution" vs "substantially rewritten") — reconcile the wording.

**THIRD_PARTY_NOTICES.md slim:** keep (still-substantial) Impeccable, modern-screenshot, UI-UX-Pro-Max, Vercel, Playwright. Hold pending human-call: Superpowers, Grill-Me, Skill-Optimizer, TS-clean-code, Natural-writing. Do not trim unilaterally. **Rule: when in doubt, RETAIN — the resemblance call is the owner's.**

## Cross-family duplication → `_shared/` candidates (ranked by value)

1. **Writing-family reference triplication** (biggest prize): AU-English mechanics, tiered anti-AI taxonomy, condense-pass, claim-discipline schema — each cloned across 2-3 of academic/engineering/legal (+ 3 near-duplicate lint scripts). Extract to `_shared/`; each skill keeps only its domain vocabulary overlay. natural-writing's research-cited anti-AI treatment anchors the shared version.
2. **Model-routing tier doctrine**: `autonomous-lab/model-effort-policy.md` re-implements `orchestrate/routing-and-tiers.md`. Single-source (into orchestrate's ref or `_shared/`); lab keeps only `ultra`/Codex-lead + Convergence deltas.
3. **Orchestrate externally-consumed references**: `dynamic-workflows.md` (± `verification.md`, `routing-and-tiers.md`) consumed by `codebase-polish`/`cross-verify` from outside the skill boundary → promote to a stable `_shared/` interface.
4. **`finding-contract.md`**: frontend-review restates code-review's canonical schema → link, don't restate.
5. **Skill meta-doctrine**: the shared half of skill-audit+skill-authoring → `_shared/skill-doctrine.md` (Workstream A).
6. **"Adapter-absent path" prose** (deliver/implement/orchestrate/scope/session): low value — the JSON is already single-sourced; only fold the prose if the family is revised together.
7. **Provenance/NOTICE requirement**: encode once in `_shared/skill-doctrine.md`; fixes the skill-authoring/skill-audit/grill-me NOTICE gaps at the source.

## Catalogue-wide reconciliations (auditor false positives corrected)
- **"Committed `__pycache__`/`.pyc`" flags (uml-diagrams, skill-audit, evaluate, others) are FALSE POSITIVES** — verified `git ls-files` shows **0 tracked `.pyc`** catalogue-wide; all covered by `.gitignore`. Working-tree noise only; **no repo action**. (`skill-audit/scripts/` tracks nothing — no `.py` source, no broken reference; the `scripts/` mention in method.md is generic supply-chain prose.)
- **No body exceeds the ~500w soft budget** — no length-forced splits.
- **Provenance-contract gap is real and ironic**: skill-authoring, skill-audit, grill-me ship a bare LICENSE with no NOTICE, missing the harness's own provenance-metadata doctrine they teach; caveman is the correct model. (A **policy/metadata gap**, not an inherent MIT breach — see Workstream E precision.)

## Cross-family verify (other-primary)

**gpt-5.6-sol-low via cursor-agent — succeeded, source-read-only.** Returned 7 findings; **all folded** (the family that failed to connect in the #124 epic phase worked here):
- P1 Apache §4 precision (§4(a) license vs §4(d) applicable-NOTICE; no MIT-style divergence exemption but non-pertaining notices excludable) → Workstream E reworded.
- P1 Workstream C portability: moving Claude-only `dynamic-workflows.md` to `_shared/` ≠ portable → changed to "extract a substrate-neutral stage/gate/recovery contract; Claude/Codex as adapters."
- P1 Workstream C lifecycle ownership: step-skills framed as subordinate procedures binding to `delivery-run`, not "does not touch it."
- P1 factual: "4 of 6" provenance failures → corrected to the 3 evidenced (skill-authoring, skill-audit, grill-me).
- P2 bare-LICENSE-no-NOTICE = policy/provenance-metadata gap, not an MIT breach → relabeled in E + reconciliations.
- P2 "only 3 decomposition candidates" and P2 natural-writing-as-anchor → softened from fact to audit recommendation / owner call.
- Reviewer confirmed all other sections sound against the criteria.

**Verdict roll-up (33 skills):** **21 APPROVE-ready · 12 DEFER** (owner call). The 12 DEFERs: tdd (loose-file move), frontend-review (sibling-vs-sublane), frontend-design (Wk-C split), orchestrate (ref extraction), autonomous-lab (Wk-C split), academic-writing + engineering-writing + legal-writing (`_shared/` extraction), uml-diagrams (README role), grill-me (eval provenance), skill-audit + skill-authoring (→ skill-craft merge). No skill is CUT; nothing edited under this epic.
