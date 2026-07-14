# Native extraction mine — `agent-harness-comprehensive-review/`

STATUS: complete — 9 extract-worthy items (5 high, 4 selective); 5 live surviving docs reference into the dir (would break on deletion); bulk of the 24 files is safely deletable.

- Analyst: mine-comprehensive (Opus 4.8), Provenant harness
- Base: `main @ 1ddfe24` (SPEC05-APPLICABILITY.md has an uncommitted local mod — see item E)
- Method: read every file in `docs/agent-harness-comprehensive-review/`, diffed SPEC05 vs HEAD, grepped inbound references across the repo, cross-checked each candidate against the pack (`docs/provenant-simplification/00`–`20`), `docs/adr/0001`–`0008`, `docs/specs/`, `docs/efforts/`, `HARNESS.md` and `skills/`.
- Scope note: the sibling `docs/provenant-re-review-2026-07-13/` is also deletion-slated (per `review/pair-codex-assignment.md`), so references from it are not counted as "breaking"; only references from surviving docs are.

---

## 1. Inbound references that break on deletion (relocate content or repoint links first)

No code references the directory (grep of `scripts/ runtime/ config/ skills/` for `*.ts/*.py/*.js/*.mjs` = zero hits). All inbound edges are Markdown links from surviving governance docs:

| From (surviving doc) | Line | → target in the dir | Why it matters |
|---|---|---|---|
| `docs/adr/0002-capability-compiled-execution-authority.md` | 54 | `challenges/codex-pair-round2.md` | ADR-0002 "Work package details" pointer — the ADR summarises the decision; round2.md holds the actual `AuthorityEnvelopeV2` schema, mapping and file plan. Orphaning this leaves the binding authority ADR with no implementation detail. |
| `docs/adr/README.md` | 4 | `SCOPING-SESSION.md` | ADR index cites the scoping session as the ratification origin of ADRs 0001–0008. |
| `docs/efforts/EFFORT-capability-profiles.md` | 17, 19, 175, 178 | `SCOPING-SESSION.md`, `challenges/codex-pair-round2.md`, `CHAIR-CHARTER.md`, `decision-register.md` | The **live, active** effort. It runs "under the autonomous chair charter" and points to the Step-1 package/Step-3 checklist as "both human-approved". Four hard dependencies. |
| `docs/handoffs/HANDOFF-2026-07-13-capability-profiles-v2.md` | 6, 80 | `CHAIR-CHARTER.md`, `challenges/codex-pair-round2.md` | Active handoff; charter is its governing directive. |
| `docs/handoffs/HANDOFF-2026-07-13-project-fabric-console.md` | 290 | `CHAIR-CHARTER.md` | Active handoff. |

Plus (deletion-slated, not counted): `docs/provenant-re-review-2026-07-13/{SOURCE_MAP,updated-findings-register,updated-findings.json}` reference `CHAIR-CHARTER.md`, `README.md`, `decision-register.md`.

**Consequence:** deletion cannot be clean until (a) the four load-bearing files (CHAIR-CHARTER, codex-pair-round2, decision-register, SCOPING-SESSION) have their durable content relocated into the pack/ADRs, and (b) the five surviving inbound links are repointed. The EFFORT and the two handoffs are the sharpest break — they are the current execution route.

---

## 2. EXTRACT — high value, not captured in pack/ADRs/specs

### A. `CHAIR-CHARTER.md` (whole; esp. §6 superseded gates, §7 preserved boundaries)
- **What:** active governing directive (215 lines) under **direct human authority** (mblauberg, 2026-07-13) = decision-register **D-021**. Sets the autonomous-implementation regime: every former human gate becomes LLM-resolved (chair discretion or council vote), **PR review is the only human gate**, single consolidated integration PR.
- **Why it still matters:** §7 "Preserved boundaries (NOT delegated away)" are hard, human-set safety gates that appear **nowhere in the pack**: no external/irreversible effects or network-egress/profile enablement; the write-profile containment spike is executed adversarially (only its verdict is delegated); `workspace-write-offline` stays one owned worktree, no egress; **`.agent-run/AFAB-004` is never accessed** (standing hard prohibition); worktree policy unchanged. §6 records exactly which prior human gates were converted and which review pressure is retained. The pack's `04_PROGRESSIVE_GOVERNANCE.md` describes governance *levels* but carries none of this authority envelope or the retained boundaries.
- **Destination:** new pack appendix (e.g. `docs/provenant-simplification/appendix-autonomous-charter.md`) preserving §6–§7 and the D-021 authority statement verbatim; add a crosswalk row in `15_DECISION_REGISTER.md`. Repoint the EFFORT + both handoffs.
- **FLAG (governance, needs human ruling):** the charter's stated scope is "implementing the entire `docs/agent-harness-comprehensive-review` programme." That programme is being **superseded by the simplification pack**. Does the D-021 human authority envelope (and its §7 boundaries) carry over to the pack's implementation, or does it lapse with the programme? This is a live-binding question — do not silently drop it; surface for the human. The §7 conservative boundaries should be treated as still-in-force until a human says otherwise (they are the safe default).

### B. `challenges/codex-pair-round2.md` (whole) — the concrete authority + containment work package
- **What:** the human-approved Step-1 work package and Step-3 containment checklist. Contains, at a level of detail found nowhere in the pack:
  - the closed `AuthorityEnvelopeV2` TypeScript schema (lines 75–105) with the missing dimensions Fabric's `AuthorityInput` lacks (approval-evidence binding, secrets/deployment/irreversible/network unions) and the child-narrowing algebra (114);
  - the delivery→Fabric field-mapping table (132–153) and delivery-side field additions (118–128);
  - the exact create/modify **file plan** (174–236) and the immutable characterisation goldens already landed in `6748ceb` (176–182);
  - the 8 characterisation/acceptance gates (238–263);
  - the adversarial **containment-spike matrix** (265–337): common fixture topology, mandatory filesystem/worktree cases, network/settings/secret/lifecycle cases, **Codex-specific** (309–315) and **Claude-specific** (316–322, incl. pinned SDK `0.3.207`, `sandbox.enabled/failIfUnavailable/allowUnsandboxedCommands`, `settingSources:[]`) checklists, and the required receipt fields + pass decision (323–337).
- **Why it still matters:** ADR-0002 (binding) points here for its work-package detail; `07_SECURITY_AUTHORITY_AND_EFFECTS.md` states the containment principle ("model refusal without a tool attempt is not containment evidence", "worktrees are not security boundaries") but has **no schema, no mapping, no file plan, no provider-specific spike matrix, no receipt spec**. §9 of pack-07 lists spike *topics* only. This is the single most load-bearing technical artifact in the directory and is actively consumed by the live capability-profiles effort.
- **Destination:** new pack appendix `docs/provenant-simplification/appendix-authority-v2-and-containment-spike.md` (or fold into `07`/`09`), and repoint ADR-0002 line 54 to it. Preserve the schema, mapping table, file plan and both provider checklists verbatim.

### C. `decision-register.md` — D-021 + modification riders + rejected-alternatives rationale
- **What:** 21 decisions with 2026-07-13 outcomes. ADRs 0001–0008 own the headline decisions (D-001/002→0001/0003, D-004→0002, D-006→0004, D-007→0005, D-009→0006, D-011→0008, D-014→0007), but the register carries material **not promoted to any ADR**:
  - **D-021** (autonomous directive) — no ADR; only the charter.
  - The **"Accepted with modifications" riders**: D-004 codex mods (only `review-readonly`+`workspace-write-offline` initially; effective = monotone intersection; receipts bound to authority digest + compiler version; authority-schema reconciliation is a prerequisite); D-005 (extend existing `ExternalEffectService` custody, logical boundary now); D-007 (extend the delivery kernel, no second policy model); D-014 (5-class retention taxonomy, class-tag now, delete after tranche 1); **D-019** (isolation-substrate attestation is a **hard gate** on the write pilot, not documentation).
  - The **rejected-alternatives table** (49–64): 14 explicit rejections with one-line rationale (microservices, provider-native coordination, MCP-as-scheduler, persona skills, all-families-every-change, archive-forever, model-held release creds, hooks-as-security, TS-everywhere, Nx/Turbo-now, implicit Windows, external-orchestration-framework). This is durable design rationale the pack's PS-001..016 does not enumerate.
  - The **spec-amendment prerequisites** note (39–45): D-004 write profiles conflict with Specs 01/05 read-only certifying actions; D-011 conflicts with Spec 05's four certifying slots — the four-slot profile stays binding for Spec 05 until amended.
- **Why it still matters:** referenced by the live EFFORT; the riders are constraints the bare ADR headlines omit; the rejected list is cheap anti-regression memory. `15_DECISION_REGISTER.md` (PS-001..016) re-derives the *positions* but drops the riders, the rejections and the spec-conflict prerequisites.
- **Destination:** merge the riders + rejected-alternatives table + spec-conflict note into pack `15_DECISION_REGISTER.md` (with a D-nnn↔PS-nnn↔ADR crosswalk); D-021 goes with item A.

### D. `SPEC05-APPLICABILITY.md` (incl. the uncommitted local mod) — findings↔binding-specs reconciliation
- **What:** overlays the static findings on current merged `main`. Resolves **F-005, F-006, F-018 as done** on merged main; F-027 resolved at spec level (threat modes in Specs 01 v0.36/04 v1.31); F-033 partial (Console/Herdr seam tests exist). States the spec-conflict prerequisites (write profiles vs read-only certifying; D-011 vs four-slot review; F-023 restructuring must be an approved spec edit).
- **Uncommitted local mod (git diff HEAD):** adds that Spec 05 v1.13 is a **draft** whose material post-v1.0 additions need an exact authority trace or human acceptance; and that `main` containing the draft amendments through merge `941a72f` "satisfies ordering only… does not freeze or accept them — Lane A's anchored audit and human-approved spec freeze remain prerequisites for the ADR-0002 V2 authority cutover."
- **Why it still matters:** this is the current truth reconciling which findings are already closed vs still open, and the exact spec-freeze precondition gating the V2 authority cutover. Pack `17_BASELINE_OBSERVATIONS.md` lists observations "to verify" but does not carry these resolutions or the freeze precondition.
- **Destination:** fold the resolution table + spec-conflict prerequisites into `17_BASELINE_OBSERVATIONS.md`; the freeze-precondition belongs with the authority appendix (item B) and `docs/specs/amendment-audit-2026-07-13.md`.
- **FLAG:** the local mod is **uncommitted** — it is lost if the dir is deleted before the change is committed or its content relocated. Capture it explicitly.

### E. `findings-register.md` — the verification annex (verified facts) + open-finding acceptance criteria
- **What:** (i) the 2026-07-13 verification annex (lines 1–38) with corrections/sharpenings that are *verified facts*, not claims: F-001 read-only enforced **twice** (both adapters **and** `fabric.ts:6537 #admitProviderPayload`); F-002 `fabric.ts` is exactly **7,401 lines / 154 methods**; F-003 defect is entirely in `config/adapter-compatibility.yaml` (`agent-fabric.yaml` is clean); F-007 **13 of 14** security checks unimplemented, scanner is Python-only; F-023 amendments are ~72% of spec 01 / ~93% of spec 04; F-036 `main` has **no branch protection / no rulesets** (live `gh api`). (ii) Per-finding acceptance criteria for still-open P0/P1 items (F-002/003/004/007/008/013/014/026/028/030–034 etc.).
- **Why it still matters:** pack `17` lists the *concerns* ("declared security controls with uneven implementation status", "machine-local compatibility data in tracked config") but not the verified numbers or the specific defect locations — those are ready-to-use test/verification seeds. The acceptance criteria are directly reusable as `10_ACCEPTANCE_TESTS.md` cases.
- **Destination:** verified facts → `17_BASELINE_OBSERVATIONS.md` (fill the WP-0 update table); open-finding acceptance criteria → `10_ACCEPTANCE_TESTS.md`.

---

## 3. EXTRACT — selective / lower value (advisory design; partly superseded by the simplification choice)

The pack deliberately chooses a **thinner** path than these documents, so much of their content is intentionally not adopted. Extract only the concrete tables/lists that the pack states only at principle level, and only if/when that work package activates.

### F. Fabric decomposition detail — `target-architecture.md` §4–§5, §10 + `fabric-refactor-plan.md` §5–§6, §10
- Concrete internal Fabric module tree (`target-architecture.md` §4, lines 80–132); `CapabilityRequest`/`CapabilityDecision` digest-bearing types (§5, 149–177); security-modes table (§10, 308–315). `fabric-refactor-plan.md` §5 bounded-context command/store decomposition, §6 first-extraction step sequence, §10 architecture-test list (protocol imports no Fabric; adapters import protocol/ports not stores; SQL only in persistence; no new `core/fabric.ts` imports).
- Pack `02_TARGET_ARCHITECTURE.md`/`08_REPOSITORY_CHANGE_MAP.md` cover the thesis but not this file-level module map or the architecture-test list. **Extract as an implementation appendix when Fabric modularisation is scheduled;** otherwise low urgency.

### G. Console/observability detail — `console-and-observability.md`
- Console information architecture (§3 layout, 80×24 compact/inert modes), agent-row field list (§4), typed attention-item taxonomy (§5), renderer decomposition file tree (§7), native status-message format (§9). This is Spec 05 / `EFFORT-project-fabric-console` territory — **check `docs/specs/05` first**; extract only the agent-row fields + attention taxonomy if spec 05 lacks them. Pack `12_OBSERVABILITY_AND_EVALUATION.md` is principle-level.

### H. Tooling/installation/security detail — `tooling-installation-security.md`
- Security-evidence **status taxonomy** (§7: implemented / project-provided / external-manual / unavailable / not-applicable — a required unavailable check blocks or triggers an accepted-risk gate); hook-compiler policy concept (§4); portable/local **config file hierarchy** (§5, `config/` portable vs `.agent/local/` gitignored); CI additions list (§8). Pack `07`/`08` are thinner. Extract the security-evidence status taxonomy (it directly sharpens finding F-007) and the config-split file layout (sharpens F-003/D-015).

### I. SDLC operating-model fragments — `agentic-sdlc-operating-model.md`
- Team patterns A–E (§8), decision-packet format (§4), handoff schema (§10), backlog claim algorithm + stop-states (§11). Mostly re-expressed by pack `05`/`06`/`13`/`14`. Extract only the **backlog stop-states** (done/retired/expired/blocked-external/paused-decision/paused-budget/failed-invariant/quarantined) and the **handoff schema** if the pack's WorkItem/handoff sections lack them.

---

## 4. SAFELY DELETABLE (superseded, duplicated, or process/receipt artifacts — high deletion confidence)

- `COMPREHENSIVE_REVIEW.md` — integrated narrative; superseded by the pack's thin-kernel synthesis.
- `CODEBASE_PRIMER.md` — orientation; superseded by pack `17` + live repo.
- `implementation-roadmap.md` — tranche map; superseded by pack `09_WORK_PACKAGES_AND_SEQUENCE.md` (its §17 go/no-go gates are covered by pack `10`).
- `README.md`, `KICKOFF.md` — process/index; content lives in ADRs + pack. (README is referenced only by the deletion-slated re-review dir.)
- `SCOPING-SESSION.md` — round-by-round decision history; **all outcomes are in `decision-register.md`/ADRs.** Still referenced by `adr/README.md` and the live EFFORT → repoint those two links to the ADR index / pack decision register, then delete.
- `challenges/codex-pair-round1.md` — round-1 challenge; conclusions folded into decision-register + SCOPING-SESSION.
- `findings.json` — machine mirror of `findings-register.md`.
- `SOURCE_MAP.md`, `VALIDATION.md`, `VALIDATION.json`, `ARTIFACT_MANIFEST.json` — evidence/receipt artifacts for the static review; no forward value.
- `proposals/` (**entire subtree**) — explicitly "illustrative… advisory only" (proposals/README + CHAIR-CHARTER §3). `harness.manifest.yaml` is **REJECTED** (D-006). The example schemas (`authority-profile`, `backlog-item`, `execution-plan`, `intake-decision`) and policy YAMLs (`lifecycle`, `authority-profiles`, `retention`, `effects`, `routing`) are superseded by the actual contracts (ADR-0002 + round2 for authority; ADR-0006 for backlog) and by the re-review dir's own schemas. **No live code or surviving doc references any proposals file** (grep confirmed). The proposed skills (`architecture-review`, `refactor`, `orchestrate` SKILL.md drafts + trigger fixtures) are illustrative; `architecture-review` promotion is tracked via D-008/`EFFORT-skill-portfolio-2026`, not these drafts. Safe to delete.
- `target-architecture.md`, `fabric-refactor-plan.md`, `console-and-observability.md`, `tooling-installation-security.md`, `agentic-sdlc-operating-model.md`, `skill-portfolio-redesign.md` — **bulk deletable** after extracting the specific fragments named in items F–I above. Their conceptual content is re-expressed (thinner, by design) across pack `02`–`14`. `skill-portfolio-redesign.md` in particular is superseded by `EFFORT-skill-portfolio-2026.md` + the recent skill-audit commit `1ddfe24`.
- `SPEC05-APPLICABILITY.md` — deletable **after** item D's content is relocated **and the uncommitted mod is captured**.

---

## 5. Recommended deletion sequence (for high-confidence, non-breaking removal)

1. Relocate items A–E into the pack (charter appendix, authority/containment appendix, decision-register merge, `17` baseline update, `10` acceptance cases). Capture the uncommitted SPEC05 mod (item D) before anything.
2. Extract the fragments in F–I you want to keep (default: security-evidence status taxonomy, config-split layout, architecture-test list, backlog stop-states, handoff schema; the rest can go).
3. Repoint the 5 surviving inbound links: ADR-0002 (→ new authority appendix), `adr/README.md` (→ ADR index), and the live EFFORT + 2 handoffs (→ pack charter appendix + authority appendix + pack decision register).
4. Delete the directory. (The re-review dir's inbound links resolve themselves — it is deleted in the same operation.)

Net: nothing in `agent-harness-comprehensive-review/` is *uniquely* durable except items A–E (governance authority, the concrete V2/containment package, the decision riders/rejections, the findings↔spec reconciliation, and the verified baseline facts). Everything else is superseded narrative, illustrative proposals, or receipts.
