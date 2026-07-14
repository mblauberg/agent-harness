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

### Exit

- current-head status is explicit;
- unrelated red tests are understood;
- no later package relies on stale review assumptions.

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

## WP2 — canonical contracts and lifecycle kernel

### Objective

Create one executable source for lifecycle guards without changing provider write behaviour.

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

## WP3 — authority compiler and one-provider offline write pilot

### Objective

Implement `workspace-write-offline` for one primary provider.

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
- derive review plan;
- produce effect proposal;
- apply human-approved PR creation through typed executor;
- project status through CLI.

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
- implement ReviewPlan derivation;
- implement LoopPolicy and no-progress detection;
- distinguish routine, substantial, crucial and terminal shapes;
- measure review yield;
- preserve stronger review for authority, security and weak-oracle work.

### Exit

- both primaries can lead and write under the same neutral contract;
- review is proportional and explainable;
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
