# Native extraction review: `docs/provenant-re-review-2026-07-13/` vs the simplification pack

- task: provenant-simplification-pack-review-2026-07-14 (native leg)
- reviewer: mine-re-review (Claude, native, read-only except this file)
- base_revision: main @ 1ddfe24 (working tree also has uncommitted change to
  `docs/agent-harness-comprehensive-review/SPEC05-APPLICABILITY.md`, untracked
  `.review-snapshots/`, this pack, and the re-review directory under review)
- companion: `docs/provenant_simplification_implementation_pack_2026-07-14/review/pair-codex-assignment.md`
  runs the same question in parallel via Codex; treat that file's eventual
  `pair-codex-findings.md` as a cross-check, not a duplicate of this file.

## Method

Read all 24 files in `docs/provenant-re-review-2026-07-13/` (~2,600 lines of
prose + 4 JSON schemas + 4 examples + 4 templates) in full. Cross-read the
pack's `docs/provenant-simplification/00`–`20` (all 20 files), `HARNESS.md`,
`AGENTS.md`, `docs/adr/0001`–`0008`, `docs/adr/README.md`, `docs/specs/00-index.md`.
Grepped the live tree for every re-review filename and the directory path
itself to find inbound references.

## Inbound-reference check

**1 inbound reference, and it already documents the planned deletion:**

- `docs/provenant_simplification_implementation_pack_2026-07-14/review/pair-codex-assignment.md:25`
  names `docs/provenant-re-review-2026-07-13/` as slated for deletion.

No skill, script, ADR, spec, or other doc references the directory or any of
its filenames (`documentation-governance-model.md`, `issue-pr-autonomy-model.md`,
`governance-reconciliation.md`, `implementation-priorities.md`,
`prior-review-delta.md`, `updated-findings*`). Deletion breaks nothing once
this extraction list is actioned.

## Extraction list — 9 items materially valuable and not yet in the pack/ADRs/specs/efforts/HARNESS.md

### 1. Decision-delegation charter model (who decides, not how much process)

- **Source:** `issue-pr-autonomy-model.md:23–105` (delegation charter table,
  Class A/B/C scope-delta rules), `governance-reconciliation.md:37–65`
  (`DecisionResolver` typed union, precedence order), `governance-reconciliation.md:122–146`
  (council-as-deliberation record format, rejects "2–1 vote" semantics),
  `proposals/schemas/decision-delegation.schema.json` (full file, 192 lines,
  validated against `proposals/examples/decision-delegation.example.json`).
- **What it is:** an orthogonal axis to the pack's risk-tier governance
  levels — *who* resolves a decision (chair / council / human) and *how*
  (automatic / soft-decision / hard-gate) per decision class, plus a bounded
  `collaboration` block (issue_create, pr_open, merge: human-only|agent-when-green|forbidden,
  allowed_labels, max_open_issues_per_run) and non-delegable `hard_boundaries`.
- **Why it still matters:** `04_PROGRESSIVE_GOVERNANCE.md` and
  `06_LOOP_AND_REVIEW_POLICY.md` answer "how much control does this work
  need" (Advisory→Terminal, review derivation) but never answer "which actor
  is authorised to resolve this specific decision class" or "is a scope
  change in-bounds for the chair to just proceed." `03_MINIMAL_CONTRACTS.md`
  has no `DecisionDelegation`/charter subcontract at all. Without it, the
  pack inherits the exact contradiction the re-review found in the *old*
  chair-charter (HARNESS.md says human approves scope/one-way-doors; nothing
  in the pack says when a chair may resolve a reversible scope delta itself).
  The Class A/B/C split (no-observable-change / reversible-in-envelope /
  hard-boundary) is a clean, already-drafted answer.
- **Destination:** new pack section — either a `04b_DECISION_DELEGATION.md`
  or a new part 5 appended to `04_PROGRESSIVE_GOVERNANCE.md` — plus a
  `DecisionDelegation`/charter subcontract added to `03_MINIMAL_CONTRACTS.md`.
  The JSON Schema can seed the actual protocol type in
  `runtime/agent-fabric-protocol` during WP2.

### 2. Non-blocking `DecisionRequest` (notice / soft / hard)

- **Source:** `issue-pr-autonomy-model.md:123–157` (fields, semantics,
  override/cut-point/default-applied lifecycle), `proposals/schemas/decision-request.schema.json`
  (full file, 159 lines, validated against `proposals/examples/decision-request.example.json`).
- **What it is:** a decision type distinct from a blocking gate — `mode:
  notice|soft|hard`, `default_action`, `override_until`, `cut_point`,
  `status: open|default-applied|human-overrode|chair-resolved|council-resolved|superseded|closed`.
- **Why it still matters:** the pack's `03_MINIMAL_CONTRACTS.md §9 ReviewPlan`
  and `02_TARGET_ARCHITECTURE.md` "Gates" capability are binary (block or
  don't); there is no non-blocking decision surface with an applied default
  and a human override window. This is exactly what a chair-delegated Class B
  delta (item 1) needs to surface itself in the Console/CLI without stopping
  work. Not present anywhere in the pack.
- **Destination:** add a `DecisionRequest` subcontract to `03_MINIMAL_CONTRACTS.md`
  §9 (alongside `ReviewPlan`), referencing the schema above.

### 3. Concrete `WorkItem` JSON Schema (validated, not just prose)

- **Source:** `proposals/schemas/work-item.schema.json` (full file, 279
  lines; enums for `state`, `risk.tier`, `review.class`, `pr_strategy`),
  `proposals/examples/work-item.example.json`.
- **What it is:** a draft-2020-12 JSON Schema for the vertical-slice work
  item, already validated (see `VALIDATION.md`/`VALIDATION.json`).
- **Why it still matters:** `03_MINIMAL_CONTRACTS.md §5 WorkItem` gives the
  same concept only as a prose field list. This schema is a ready-to-use
  seed for WP2 ("canonical contracts and lifecycle kernel") and WP4
  ("WorkItem-to-PR vertical trace") instead of drafting one from scratch. Its
  `risk.tier` enum (`routine|substantial|crucial|terminal`) already matches
  the pack's and `HARNESS.md`'s risk-tier vocabulary, so integration friction
  is low. Its `conflict_keys` and `pr_strategy` fields plug directly into
  item 4 below, which the pack currently lacks.
- **Destination:** reference/seed file for WP2; either check into
  `runtime/agent-fabric-protocol/schemas/` directly or land as an appendix
  under `docs/provenant-simplification/03_MINIMAL_CONTRACTS.md`.

### 4. Adaptive PR topology + conflict-graph model

- **Source:** `issue-pr-autonomy-model.md:205–270` (§8 PR topology:
  independent / stacked / consolidated / direct-commit, with selection
  criteria for each; §9 conflict graph: paths, generated outputs, lockfiles,
  migrations, protocol schemas, central spec/ADR/index files, shared
  fixtures, release manifests).
- **Why it still matters:** `16_PR_CHECKLIST.md` assumes a PR already exists
  and checks its content; `09_WORK_PACKAGES_AND_SEQUENCE.md` assigns each
  work package one PR by convention but never states a *rule* for choosing
  PR shape from the dependency/conflict graph. This was one of the
  re-review's clearest, most concrete findings (UR-010: the old charter's
  "one monolithic PR" vs "PR per leg" contradiction) and the pack has not
  absorbed the fix. The `conflict_keys`/`pr_strategy` fields in item 3 are
  the executable form of this same idea.
- **Destination:** new subsection in `09_WORK_PACKAGES_AND_SEQUENCE.md`
  ("PR topology selection") or a new reference under
  `skills/orchestrate/references/`.

### 5. Documentation governance model — canonical-owner matrix, frontmatter schema, `check-docs`

- **Source:** `documentation-governance-model.md` (full file, 355 lines) —
  specifically: §2 default tree (`docs/specs/<domain>/index.md`, unnumbered
  stable-slug spec filenames), §3 canonical-owner matrix, §4 frontmatter
  fields with `canonical_keys` (stable semantic claims — CI rejects two
  current docs owning the same key), §10 create/update/prune decision
  table, §11 `check-docs` (15 concrete checks), §12 agent reading strategy,
  §13 completion test. Plus `proposals/schemas/document-frontmatter.schema.json`
  (full file, 162 lines) and `proposals/PROJECT-DOCUMENTATION-POLICY.md`
  (63-line short-form restatement) and `proposals/examples/document-frontmatter.example.json`.
- **Why it still matters:** ADR 0004 already decided "per-domain truth
  owners, no god manifest" — this is the *mechanism* that operationalises
  that decision (a `canonical_keys` field + drift check), which ADR 0004
  does not specify. `08_REPOSITORY_CHANGE_MAP.md §"docs/specs/"` says only
  "create current normative versions... move amendment history to ADRs" —
  it does not give a directory layout, naming convention, or frontmatter
  schema. This is also the most direct answer to the assignment's item 4
  ("spec split advice"): the concrete target layout
  (`docs/specs/agent-fabric/authority.md`, `.../provider-actions.md`,
  `.../lifecycle.md`, `.../persistence.md`, `docs/specs/console/operator-workflows.md`)
  is already drafted here.
- **Destination:** fold into `08_REPOSITORY_CHANGE_MAP.md`'s `docs/specs/`
  and `docs/adr/` sections, and/or add as a new
  `docs/provenant-simplification/21_DOCUMENT_GOVERNANCE.md`. The frontmatter
  schema is a direct seed for `scripts/check-harness` additions named in
  `08_REPOSITORY_CHANGE_MAP.md §9`.

### 6. Per-skill delta checklist for the documentation/governance rollout

- **Source:** `proposals/skill-deltas.md` (full file, 101 lines) — concrete
  add/remove instructions for `engineering-docs`, `scope`, `implement`,
  `orchestrate`, `session`, `work-map`, `code-review`, `release`.
- **Why it still matters:** `09_WORK_PACKAGES_AND_SEQUENCE.md` WP6 ("Skill
  and documentation simplification") states the goal ("shrink lifecycle
  Skills to methods... make session/work-map optional") but not the
  per-skill diff. This file is already at that level of concreteness (e.g.
  "remove move-never-delete default," "`docs/STATE.md` no longer normal when
  Fabric is available," "`implement`: replace 'scope/design drift returns to
  human' with Class A/B/C"). Directly actionable for WP6; nothing
  overlapping exists in the pack.
- **Destination:** attach as an appendix to `09_WORK_PACKAGES_AND_SEQUENCE.md`
  WP6 or a new `docs/provenant-simplification/22_SKILL_DELTAS.md`.

### 7. Ready-to-use document templates (ADR, governance charter, local issue, spec)

- **Source:** `proposals/templates/adr.md`, `proposals/templates/governance.md`,
  `proposals/templates/local-issue.md`, `proposals/templates/spec.md` (full
  files, 46–61 lines each) — all frontmatter-compliant with schema 5/1 above.
- **Why it still matters:** the pack has `18_IMPLEMENTATION_STATUS_TEMPLATE.md`
  (a programme-status template) but no ADR/spec/governance/issue authoring
  templates. These are copy-paste-ready and already wired to the
  `canonical_keys`/frontmatter model in item 5.
- **Destination:** `skills/engineering-docs/` reference templates, or a
  `docs/templates/` directory, referenced from the new document-governance
  section (item 5) and from WP1/WP6.

### 8. Precedence rule: ADR owns decision, spec owns behaviour, Git owns history

- **Source:** `documentation-governance-model.md:172–190` (§6 ADRs), echoing
  `updated-findings-register.md` UR-016 (`docs/specs/01-agent-fabric.md:3–15`
  claims the spec owns its own decisions with no separate ADR, contradicting
  the ADR practice already in use).
- **Why it still matters:** small but concrete — the pack's
  `08_REPOSITORY_CHANGE_MAP.md §"docs/adr/"` only says to promote decision-register
  entries into ADRs; it never states the ownership boundary between an ADR
  and the spec it informs, so a future spec rewrite (WP1/WP6) could
  re-introduce the same "spec re-litigates its own decision" problem this
  finding flagged.
- **Destination:** one paragraph added to `08_REPOSITORY_CHANGE_MAP.md`'s
  `docs/adr/` section, or folded into item 5's document-governance section.

### 9. Council-as-deliberation semantics

- **Source:** `governance-reconciliation.md:122–146` (required deliberation
  record: question, decision class, criteria, per-family recommendation +
  evidence, agreements/disagreements, objective checks, chair adjudication,
  residual uncertainty — explicitly "a 2–1 split is not proof"),
  `issue-pr-autonomy-model.md:106–121` (§4 LLM council protocol).
- **Why it still matters:** the pack's glossary (`19_GLOSSARY.md`) defines
  "other primary" only as a challenge/review role; it has no "council"
  concept or deliberation-record shape at all. If the decision-delegation
  charter (item 1) is adopted with a `council` resolver, this is the record
  format it needs — and it pre-empts the exact anti-pattern
  (`updated-findings-register.md` UR-009) the re-review found in the old
  chair charter's "council vote" language.
- **Destination:** fold into item 1's new decision-delegation section
  (same landing spot; these two are one coherent addition).

## Findings from the register that are already resolved or superseded — no extraction needed

- **UR-001** (red integration baseline) — superseded by the pack's WP0
  requirement to re-verify current-head state from scratch; the exact
  historical failure counts are stale by construction.
- **UR-004, UR-012–015, UR-019–021** — architecture/modularity/retention/review
  findings the pack's `02_TARGET_ARCHITECTURE.md`, `08_REPOSITORY_CHANGE_MAP.md`,
  and existing ADRs 0002/0003/0007/0008 already cover at equal or greater
  specificity.
- **UR-023** (AGENTS.md style/HARNESS-loading) — already fixed; current
  `AGENTS.md:19` reads "Load `$caveman` only on explicit request" and points
  to `HARNESS.md` only for orchestration/model/delegation/memory decisions,
  not a full-corpus load.
- **UR-026** (review pack itself is a live execution route) — resolved by
  the deletion this review supports.

## Findings still open, but not document-extraction items (no artifact to migrate — just follow-up work)

- **UR-011** — branch protection ruleset still only a proposal on the live
  `mblauberg/provenant` repo; this is a repository-settings action, not a
  doc.
- **UR-017** — stale lane-status snapshot lives in
  `docs/agent-harness-comprehensive-review/CHAIR-CHARTER.md`, a different
  directory not in scope for this deletion.
- **UR-024** — `architecture-review` skill still not in the catalogue
  (confirmed: `skills/` has no matching directory). P2, no design artifact
  exists beyond "implement through the normal skill-authoring path" —
  recommend a follow-up issue, not a doc extraction.
- **UR-025** — `.github/pull_request_template.md` still assumes
  human-gate/format conventions that may conflict with adaptive PR topology
  (item 4). Worth a follow-up edit once item 4 lands, not a separate
  extraction.

## Not extraction-worthy (process/meta artifacts of the review itself)

`README.md`, `SOURCE_MAP.md`, `UPDATED_ASSESSMENT.md`, `updated-findings-register.md`,
`updated-findings.json`, `VALIDATION.md`, `VALIDATION.json`,
`ARTIFACT_MANIFEST.json`, `prior-review-delta.md`, `implementation-priorities.md`
are the re-review's own audit trail, narrative judgement, and self-validation
records (baseline commit, file hashes, PROV-* issue proposals restating work
already sequenced in `09_WORK_PACKAGES_AND_SEQUENCE.md`). Their durable content
is either already reflected in the pack's WP0–WP8 sequence or is the
prose-narrative context for the 9 items above, not separately actionable.
`implementation-priorities.md`'s PROV-DOC-1/GOV-1/WORK-1/SPEC-1..3 issue
proposals are redundant with WP0/WP1/WP2/WP6 — no new information beyond items
1–9 above.

## Summary

- **9 extract-worthy items** (numbered above), all with concrete file:line
  sources and named pack destinations.
- **1 inbound reference** to the directory repo-wide (the assignment file
  that already plans the deletion) — no breakage risk.
- Net judgement: the pack correctly supersedes almost all of the re-review's
  narrative assessment and architecture findings. What it has not absorbed
  is the **concrete machinery layer** the re-review drafted on top of its
  own narrative: JSON Schemas, a decision-delegation/soft-decision contract
  pair, a PR-topology rule, a document-frontmatter/canonical-key mechanism,
  and ready-to-use templates. These are implementation-ready artifacts, not
  competing designs — recommend merging items 1–9 into the pack (mostly into
  `03_MINIMAL_CONTRACTS.md`, `04_PROGRESSIVE_GOVERNANCE.md`,
  `08_REPOSITORY_CHANGE_MAP.md`, and `09_WORK_PACKAGES_AND_SEQUENCE.md`) before
  deleting `docs/provenant-re-review-2026-07-13/`.

STATUS: complete
