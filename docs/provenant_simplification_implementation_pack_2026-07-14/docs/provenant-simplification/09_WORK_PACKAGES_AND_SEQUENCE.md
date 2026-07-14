# Work packages and sequence

## Sequencing rule

Do not begin broad structural refactoring until the first safe write profile and end-to-end WorkItem path are proven.

Each package must:

- have one owner;
- preserve a coherent repository;
- include deterministic evidence;
- receive independent review where required;
- delete superseded paths;
- update architecture and status.

## WP0 — current truth and baseline

### Objective

Create a reproducible current-head baseline.

### Work

- verify current branch, commit and active efforts;
- run supported root checks from a clean checkout;
- classify failures as current defect, environment, platform or unavailable;
- inventory lifecycle definitions and duplicate state tables;
- inventory current provider permission compilation;
- inventory machine-local tracked configuration;
- establish architecture metrics and public API surface;
- update `17_BASELINE_OBSERVATIONS.md`.

### Lane adoption and supersession

WP0 adopts or explicitly supersedes **every active lane** in
`docs/efforts/EFFORT-capability-profiles.md`. No lane is silently reset,
re-planned or dropped by renumbering it into this pack.

For each of Lane A (spec authority: structural repairs, Specs 01 v0.36 / 04
v1.31 freeze, spec-family split, write-profile amendment), Lane C (Step 1
authority contract: goldens landed at `6748ceb`; the atomic V2 cutover is
BLOCKED), Lane D (runtime reconciliation), Rust CI reconciliation, and Steps 2–4
(compiler extraction, write pilot, second provider), record:

- **status** — one of `complete`, `carried`, `red`, `not-started` or `superseded`;
- **owner** — one named owner, as for any package;
- **gate** — the acceptance or resume gate it must still pass;
- **evidence** — the existing artefact that carries its current state, bound to a
  digest (commit, receipt, handoff or effort-map checkpoint).

Where a lane's status, owner, gate or evidence is genuinely not established, record
`unknown — must be established in WP0`. Blank and `—` are not allowed values.
Supersession must state what replaces the lane's obligation, not merely that it
stopped.

#### Historical completion is not current-head reverification

The two are separate records and neither substitutes for the other:

- **historical completion** — the lane's gate passed at a stated digest, and that
  digest is reachable from the current head. The lane is recorded `complete` and is
  **not** re-adopted into a package.
- **current-head reverification** — the same gate re-run on the current head. It is
  a WP0 baseline obligation, tracked separately. Its absence never downgrades a
  historical completion to unverified, and it is never recorded as a residual of the
  completed lane.

Lane B is already promoted: the merge commit `90a10f7` ("Merge pull request #7") is
an ancestor of the current head `42da7ee`. Record it `complete`, and carry its
current-head reverification as a WP0 baseline item — not as a re-adoption of the
lane and not as an outstanding PR-review merge.

### Open human gate — D-021 charter carry-over

WP0 also raises, and does not answer, the human adoption/supersession decision on
the D-021 autonomous-chair charter (`24_AUTONOMOUS_CHARTER.md §1`): whether the
D-021 authority envelope — and in particular its §7 preserved boundaries —
carries over to this pack, or lapses with the superseded comprehensive-review
programme.

- Record it as an **open human gate**. No chair, council or agent may presume the
  answer.
- Until the human rules, the §7 preserved boundaries remain in force as the
  conservative default, and §6 gate-supersession is **not** assumed to re-apply to
  any package in this pack.
- Record the ruling, when given, as a decision (`15_DECISION_REGISTER.md`, D-021).

### Exit

- current-head status is explicit;
- unrelated red tests are understood;
- no later package relies on stale review assumptions;
- every lane is adopted into a named package, recorded `complete`, or explicitly
  superseded — each carrying a status, one named owner, a gate and digest-bound
  evidence, with no blank and no `—`;
- historical completions and outstanding current-head reverifications are recorded
  separately, and no completed lane is re-adopted;
- the D-021 carry-over question stands recorded as an open human gate.

## WP1 — ratify the thin-kernel design

### Objective

Update normative architecture before broad code changes.

### Work

- record ADRs for chair-native orchestration, thin kernel, optional task graph, progressive governance and risk-adjusted review;
- simplify `AGENTS.md` and `HARNESS.md`;
- update `docs/ARCHITECTURE.md`;
- publish a current specification conformance matrix;
- identify obsolete or superseded design text.

### Exit

- one clear target architecture;
- no contradiction between root instructions and approved programme;
- human design direction represented in repository-owned records.

## WP2 — canonical contracts and lifecycle projection

### Objective

Create one executable source for lifecycle guards without changing provider write behaviour.

The delivery kernel (`delivery-run` v1, `config/delivery-profiles.json`,
`skills/deliver/scripts/validate_delivery.py`) is that source and stays canonical
(ADR 0005). This work package extends it and projects it into Fabric; it does not
open a second lifecycle owner. See `03_MINIMAL_CONTRACTS.md` §1.1.

### Work

- define minimal run-envelope substructures inside the existing protocol;
- define optional Initiative, WorkItem and work-graph structures;
- implement pure transition and gate decisions;
- make receipt validators consume or compare against the canonical kernel;
- project documentation from the same source where practical;
- preserve existing accepted receipts or define a direct pre-release cutover.

### Non-goal

No universal workflow DSL.

### Exit

- invalid transitions fail before action;
- post-hoc validation and runtime admission agree;
- duplicate transition tables are removed.

### Persisted-contract minima — refusal and default rules

The field definitions belong to `03_MINIMAL_CONTRACTS.md`. WP2 accepts only when
the kernel enforces them at persistence, with the refusal or default behaviour
stated below made executable and tested.

- **Retention class (ADR-0007).** Every persisted contract carries a
  `retention_class` validated against exactly five machine identifiers:
  `ephemeral`, `operational`, `evidence`, `durable-knowledge`, `sensitive`.
  (ADR-0007 names the fourth class in prose as "durable knowledge"; the
  hyphenated form is its canonical machine identifier — a space is inadmissible
  in a JSON enum or persisted value. The ADR-0007 amendment records the
  mapping.) An absent,
  unrecognised or ambiguous class **refuses the write**. There is no permissive
  default and no inferred class: the class is chosen at authoring time so that
  later governed deletion needs no archaeology. Archive-only behaviour remains;
  class-tagging does not enable deletion.
- **WorkItem provenance (ADR-0006).** Every persisted WorkItem carries the
  approval/spec digest set (governing spec and decision digests, approval digest)
  and the identity of the authority envelope it was admitted under. Absent,
  malformed or unresolvable digests, or an absent envelope identity, **refuse
  persistence** and route the item back to scope as not ready. A missing digest is
  never defaulted to current head, and an envelope identity is never synthesised.
- Refusal is a typed contract error at the persistence boundary, not a warning,
  and is proven by negative tests for each rule above.

## WP3 — authority compiler and one-provider offline write pilot

### Objective

Implement `workspace-write-offline` for one primary provider.

### Prerequisite

The active spec repair and freeze finishes **before any live protocol or runtime
mutation** in this package: Lane A's structural repairs, the Specs 01 v0.36 /
04 v1.31 freeze and the write-profile spec amendment
(`docs/efforts/EFFORT-capability-profiles.md`). `AuthorityEnvelopeV2` must not
land against an unfrozen spec contract.

### Work

- reconcile the human authority envelope and Fabric authority contract;
- extract pure authority compilation;
- preserve `review-readonly` exactly;
- compile the offline write profile for one provider;
- implement adversarial containment tests;
- record effective settings and degradations;
- prove crash and stale-generation behaviour.

### Exit

- one provider can write only in one owned worktree;
- no network or external-effect credentials;
- containment evidence passes;
- independent security review is clean;
- second provider remains read-only until separately proven.

Four further acceptance gates come from ADR-0002 and are detailed in
`25_AUTHORITY_V2_AND_CONTAINMENT.md` (§2, §5 gates 1–4, §6):

- **Mechanical delivery mapping.** The delivery-to-Fabric authority mapping is
  mechanical and golden-bound: the Python mapper maps `delivery-authority.json`
  byte-for-byte in canonical JSON to `fabric-authority.json`, and the TypeScript
  V2 codec accepts the result. Unknown fields and omitted required dimensions fail
  in both lanes.
- **Negative goldens.** Dimension negatives are proven, not asserted: secret access
  without references; deployment without targets; irreversible authority without
  action IDs; an empty or invalid network allowlist; a changed child approval
  binding; each individual child widening; unknown Fabric operations;
  non-canonical or escaping paths; expired approval; invalid evidence digest.
- **Full real-provider containment receipt.** The adversarial matrix runs against
  the real pinned provider (Codex App Server binary/schema, or the pinned Claude
  Agent SDK) on the target host, and every case emits the complete receipt of
  §6: versions, requested/effective profile, authority/approval/worktree/native-settings
  digests, canonical roots and any temp root, effective tool and egress posture,
  observed tool-attempt IDs, before/after marker, Git-state and listener digests,
  and the verdict. A forbidden case passes only with an **observed tool attempt**
  plus independently measured unchanged marker state; model refusal without a tool
  attempt is inconclusive, not pass. An unreceipted writable, network or settings
  surface fails the gate.
- **Direct `AuthorityEnvelopeV2` cutover.** The cutover is atomic and direct:
  all callers, fixtures and stored state move to V2 in one change, the pre-release
  database baseline is squashed, and unversioned authorities fail at every public
  and storage boundary. No V1 decoder, quarantine profile, compatibility bridge or
  dual stored contract remains. A compatibility path or an optional
  reset-if-convenient path is **not** an acceptable substitute; if live state is
  proved to need migration, stop for explicit human authority and amend the plan
  first. The `review-readonly` provider projection stays byte-exact to its
  characterisation goldens throughout.

## WP4 — WorkItem-to-PR vertical trace

### Objective

Prove the product path.

### Work

- add deterministic intake/readiness;
- map Markdown or GitHub Issue to WorkItem;
- create/admit run;
- allocate worktree and lease;
- start provider-native chair/worker;
- implement and verify;
- derive and consume the deterministic ReviewPlan (below);
- produce effect proposal;
- apply human-approved PR creation through typed executor;
- project status through CLI.

### Deterministic ReviewPlan derivation

WP4 owns the ReviewPlan derivation the vertical trace consumes, so the trace does
not depend on WP5. It emits **every** field the ReviewPlan contract requires
(`03_MINIMAL_CONTRACTS.md §9`) — required deterministic checks, fresh-context
review required, other-primary required, specialist required, human acceptance
required, review input boundary, repair ceiling, re-review requirement and
`retention_class`. No required field is deferred to a later package.

It is a pure function of the WorkItem's declared risk tier, its declared
verification strategy and whether the delivery touches a Spec 05 surface. It takes
no calibration input and no measured review yield. Same input, same plan.

It resolves those fields under the **binding present policy**, not the target
table (`06_LOOP_AND_REVIEW_POLICY.md §6`):

- the `HARNESS.md` coverage table (lines 78-90) is the authority for coverage.
  `routine` resolves to chair plus objective/native checks; `substantial`,
  `crucial` and `terminal` resolve to fresh-context native review **plus the other
  primary**. `other-primary required?` is therefore true for substantial and above.
  Bonus families at `crucial` and `terminal` are attempted and recorded, and never
  block on absence, quota or API failure;
- a Spec 05 delivery additionally resolves the mandated four-slot certifying
  profile (`spec05-four-slot-v1`);
- the future-state minimum-pattern table is inert here. It must not be used to
  lower any field of the plan.

The chair may add review. It cannot remove required review.

### Non-goal

Calibration, review-yield measurement, deriving the risk shape from signals rather
than from the declared tier, and the second provider's own write profile are WP5's;
WP4 does not attempt them. WP4 defers no **required** ReviewPlan field: WP5 may
change how a field is computed, but no required field first appears there.

### Exit

One run identifier reconstructs:

- approved intent;
- authority;
- ownership;
- provider lineage;
- artefact and checks;
- review;
- PR effect and result.

## WP5 — second provider and risk-adjusted assurance

### Objective

Complete provider neutrality and remove blanket review cost.

### Work

- independently prove the second provider's offline write profile;
- extend — not re-implement — WP4's deterministic ReviewPlan derivation: keep its
  pure core and its full output shape, and add calibration, review-yield
  measurement, and derivation of the risk shape from signals (blast radius,
  novelty, oracle strength, dependency cone) in place of the declared tier;
- change *when* a required field binds — including the other-primary requirement,
  which WP4 already emits — only through the single atomic review-policy migration
  (`06_LOOP_AND_REVIEW_POLICY.md §6`, `08_REPOSITORY_CHANGE_MAP.md §4`). WP5
  introduces no new required ReviewPlan field and relaxes no coverage outside that
  migration;
- implement LoopPolicy and no-progress detection;
- preserve stronger review for authority, security and weak-oracle work.

### Exit

- both primaries can lead and write under the same neutral contract;
- review is proportional and explainable;
- one ReviewPlan derivation exists, WP5's extending WP4's, not a parallel
  implementation;
- no required ReviewPlan field first appeared in WP5, and no coverage change landed
  outside the atomic policy migration;
- loops stop predictably.

## WP6 — Skill and documentation simplification

### Objective

Reduce policy duplication and permanent context.

### Work

- shrink lifecycle Skills to methods;
- move deterministic obligations into kernel or scripts;
- demote specialist Skills that do not justify top-level ownership;
- make session/work-map optional;
- keep autonomous-lab explicit and bounded;
- rewrite current normative specs and archive amendments;
- ensure catalogue and docs are generated or drift-checked.

### Exit

- fewer workflow owners;
- smaller permanent context;
- Skills remain adaptable;
- deterministic policy is not repeated in prose.

### Appendix — per-skill deltas

The concrete add/remove diff for `engineering-docs`, `scope`, `implement`, `orchestrate`, `session`, `work-map`, `code-review` and `release` is in `23_SKILL_DELTAS.md`. It is a proposal, not yet ratified; adopt it through this package.

## WP7 — effects, portability and projections

### Objective

Complete stable operational boundaries.

### Work

- generalise typed effects beyond PR creation;
- split portable compatibility policy from local attestation;
- implement expiry and regeneration for local attestations;
- keep Console and Herdr projection-only;
- add replay/current-status CLI;
- document supported trust modes and platforms.

### Exit

- external effects use one pattern;
- clean checkout has no machine identity;
- the system works without Console;
- operator state is understandable.

## WP8 — evaluation and deletion

### Objective

Prove that retained complexity earns its cost.

### Work

- build private evaluation set;
- compare minimal baseline, thin kernel, conditional review and parallel variants;
- measure quality, attention, cost and recovery;
- delete mechanisms that do not add value;
- calibrate routing and review policy;
- publish a stable-release readiness matrix.

### Exit

- every major layer has evidence;
- unnecessary scaffolding is removed;
- future model upgrades can trigger simplification rather than architectural replacement.

## PR topology selection

Proposal (not yet ratified). This replaces the "one monolithic PR" convention with an adaptive rule. PR shape is a planning output derived from the dependency/conflict graph, not a universal per-package rule. It is the prose form of the `conflict_keys`/`pr_strategy` fields on the WorkItem schema (`03_MINIMAL_CONTRACTS.md §5`, `schemas/work-item.schema.json`).

### Choosing a shape

- **Independent PR** — issues are independently valuable; write scopes do not overlap; no shared schema/migration/lock/generated owner; each passes its own gates; merge order is irrelevant.
- **Stacked PR** — slice B genuinely depends on A; A is reviewable and stable independently; base relationships are explicit; rebases are automated/owned.
- **Consolidated PR** — changes share a contract or migration; paths conflict materially; a partial merge would leave the project invalid; review is more coherent as one vertical tranche.
- **Direct commit / no PR** — only where project policy permits (non-GitHub repository, new/small personal project, reversible low-risk work, strong objective gates, no protected collaboration branch). Record the same evidence in a local delivery receipt or review bundle; do not invent a fake PR workflow.

### Conflict-graph rule

Before parallel write dispatch, compute conflict keys: exact paths; generated outputs; package lock/workspace graph; database migration/baseline; protocol schemas; central spec/ADR/index files; shared test fixtures; release manifests.

If two slices share a conflict key, do one of: serialise them; designate one integration owner; stack them; or consolidate the PR. Do not rely only on nominal issue boundaries.

The PR remains a review and integration surface, not the source of durable requirements. Its content should link (not restate) issues, current spec/ADR, scope digest, decision deltas, evidence receipts and review findings, and declare its scope/spec deltas, soft decisions raised, conflict/stack strategy and any external effects still excluded.

## Programme stop conditions

Stop and ask the human when:

- a package requires broader network or credential authority;
- an accepted safety boundary must change;
- a new stable public contract is proposed;
- the current baseline invalidates the sequence;
- a one-way-door architecture decision emerges;
- the work cannot remain within the approved repository or effect scope.
