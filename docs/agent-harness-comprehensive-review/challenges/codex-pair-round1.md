# Codex pair round 1

## 2. Central recommendation and six decisions

### Overall verdict: agree with modifications

The capability-compiled modular-monolith destination fits this local, single-operator harness. One process and one SQLite authority preserve the strongest current properties: transactional custody, idempotency, recovery and one operator view. Capability compilation is also the correct way to close the real managed-execution gap.

The pack overstates how much architecture is absent. The live repository already has a neutral delivery kernel, a protocol operation registry, focused stores/services, an event table and projections, provider-session coordination, and a staged external-effect service. The change should complete and simplify these seams, not install a second architecture beside them.

Review basis: the pack used `0ea935f`; current `main` is `babd47a`. `git diff --name-status 0ea935f..babd47a` shows five post-baseline files, confined to the Spec 05 effort and orchestration routing, so the central Fabric/provider evidence remains applicable. The live static check reports `PASS: 33 skills`; the README still claims 34 (`README.md:5`, `scripts/check_harness.py:35-105,157-169`).

### Decision 1 — Make execution authority a first-class compiled profile

**Verdict: agree with modifications.**

This addresses a demonstrated current defect. Fabric rejects provider-supplied trusted controls, canonicalises `cwd`, then hard-codes `allowedTools`, `approvalPolicy` and `sandbox` to read-only (`runtime/agent-fabric/src/core/fabric.ts:6537-6591`). Codex independently fixes `sandbox: "read-only"` and `approvalPolicy: "never"` (`runtime/agent-fabric/src/adapters/providers/codex-app-server.ts:194-200`); Claude fixes read tools and `permissionMode: "plan"` (`runtime/agent-fabric/src/adapters/providers/claude-agent-sdk.ts:219-257`). A neutral compiler is the right owner for this duplicated trusted translation.

Modifications:

- Start with only `review-readonly` and `workspace-write-offline`. The other proposed profiles are premature until these two prove the compiler and containment contract.
- Treat a profile as a requested policy bundle, not authority in its own right. The effective result must be the monotone intersection of the human envelope, task/write ownership, local attestation and provider capability. Unsupported dimensions must reject or narrow explicitly, never silently approximate.
- Bind receipts to the authority digest, compiler version, provider contract digest, local compatibility attestation and exact effective native settings. A profile name alone proves nothing.
- Reconcile the delivery authority and Fabric authority schemas before enabling writes; see section 4.

### Decision 2 — Keep one Fabric authority; split the implementation behind it

**Verdict: agree with modifications.**

The concentration is real: `wc -l runtime/agent-fabric/src/core/fabric.ts` returns 7,401, and the class still owns provider operation queues, reconciliation, budgets, lifecycle, task/team operations, evidence and projections (`runtime/agent-fabric/src/core/fabric.ts:854-903,4833-5397`). Keeping one process and SQLite avoids unjustified distributed failure modes.

However, the repository is already part-way through this refactor. `Fabric` composes focused stores/services and a `ProviderSessionCoordinator` (`runtime/agent-fabric/src/core/fabric.ts:914-956`); the coordinator already owns durable provider-session admission and fencing (`runtime/agent-fabric/src/application/provider-session-coordinator.ts:103-123`); `CommandJournal.execute` already supplies an explicit SQLite transaction and idempotent result (`runtime/agent-fabric/src/application/command-journal.ts:77-106`).

Do not pre-commit to a generic dispatcher, universal `UnitOfWork` and domain-event framework. Extract one coherent vertical slice behind the current façade, preserve direct SQL and existing transactions, then measure whether those abstractions remove duplication. Provider payload admission is the smallest first seam; moving all dispatch/reconciliation at the same time is not.

### Decision 3 — Create one generated harness manifest

**Verdict: disagree.**

The observed drift is genuine but does not justify a god manifest. The skill entrypoints already form a discoverable canonical inventory, and the checker derives the count and rendered catalogue from `skills/*/SKILL.md` (`scripts/check_harness.py:35-105`). Protocol operations already have a typed canonical registry (`runtime/agent-fabric-protocol/src/operations.ts:28-74`). Adapter activation and machine compatibility are separate concerns today (`config/agent-fabric.yaml:3-70`; `config/adapter-compatibility.yaml:1-90`). Installation also has its own ownership manifest because it records target-local state, not product policy (`docs/ARCHITECTURE.md:165-173`).

One file owning skills, adapters, policies, installer targets, CLI help, documentation and contract tests would couple unrelated change cadences and create a new high-blast-radius registry. Use one canonical owner per domain and generate/check only its projections:

- skill frontmatter -> skill count, catalogue and provider discovery metadata;
- protocol registry -> codecs, MCP descriptors, client methods and operation docs;
- portable adapter catalogue -> activation/compatibility fixtures;
- installer source inventory -> installation plan;
- policy files -> their own generated documentation and tests.

A derived `harness-index.json` may link these owners and versions for discovery, but it should not become their source of truth.

### Decision 4 — Turn lifecycle prose into an executable kernel

**Verdict: agree with modifications.**

The premise is only partly current. The repository already describes `delivery-run` v1 as the neutral state machine and `config/delivery-profiles.json` as its profile source (`docs/ARCHITECTURE.md:46-65`). The validator derives minimum risk and enforces human evidence for downgrades, authority expiry and authority constraints (`skills/deliver/scripts/validate_delivery.py:250-285`). Fabric also has executable run, agent, gate and lifecycle state; this is not a prose-only system.

The remaining problem is duplication and incomplete projection between layers. Make objectively decidable minima executable: risk floor, authority containment, profile admission, required evidence/gates, review independence, repair ceiling, effect/release gates and retention class. Keep judgement-bearing choices (whether ambiguity warrants scoping, whether context is stale, and whether a human accepts the result) with the chair/skills. A total lifecycle decision engine that attempts to decide those questions would add policy machinery without a reliable oracle.

Extend the existing delivery kernel and project its decisions into Fabric. Do not create a second runtime policy model, and do not reduce domain skills to generated wrappers.

### Decision 5 — Separate provider-native mechanics from cross-provider control

**Verdict: agree.**

This is already the correct live direction. Codex owns thread start/resume and turns through App Server (`runtime/agent-fabric/src/adapters/providers/codex-app-server.ts:418-429,626-649`). Claude owns sessions through the Agent SDK query interface (`runtime/agent-fabric/src/adapters/providers/claude-agent-sdk.ts:621-631`). Fabric owns the neutral operation registry, durable provider action identity and admission (`runtime/agent-fabric-protocol/src/operations.ts:41-74`; `runtime/agent-fabric/src/core/fabric.ts:4833-5013`). MCP is a capability-scoped projection over the local NDJSON protocol rather than the daemon itself (`runtime/agent-fabric/src/mcp/server.ts:89-140`).

Preserve provider differences as declared capability/degradation facts. Do not force fake parity for forks, compaction, permission modes or native subagents. The neutral contract should cover authority, identity, custody, evidence and outcomes; the provider adapter should retain native session semantics.

### Decision 6 — Stage external effects

**Verdict: agree with modifications.**

The rule is sound, but the pack frames it as more novel than it is. `ExternalEffectService` already accepts only registered effects/promotions, binds integration generation, operation/target revisions, artifact evidence and idempotency (`runtime/agent-fabric/src/operator/external-effect-service.ts:24-61,95-133`). It prepares custody transactionally, validates current evidence/gates before dispatch and reconciles ambiguous outcomes through lookup (`runtime/agent-fabric/src/operator/external-effect-service.ts:136-260,263-307`). Focused tests exercise registered-effect and promotion custody (`runtime/agent-fabric/tests/spec05/core/external-effect-service.test.ts:66-114`).

Extend that model to named external mutations that warrant custody. Do not route ordinary owned-worktree edits or every shell side effect through proposal objects. A separate logical executor/credential boundary is required; a separate service/process is not yet justified for this personal harness. Promote it to process or OS isolation only when the threat model or credential surface requires it.

## 3. Three most contestable recommendations

### 1. One manifest as the source for almost everything

This solves a one-line README-count defect by centralising unrelated domains. It would replace several typed or naturally discoverable owners with a broad YAML coordination point and make routine changes touch a global regeneration graph. Keep per-domain owners and add targeted drift tests. Immediate fix: derive the README headline/catalogue from `skills/*/SKILL.md`; the current checker already computes the correct 33 (`README.md:5`; `scripts/check_harness.py:35-105`).

### 2. Treat typed intake/backlog/autonomous control as P0

F-009 and F-010 classify missing future automation as blockers even though the ordinary lifecycle is interactive and `autonomous-lab` is explicitly the exceptional run-until-STOP tier (`HARNESS.md:25-33`). For a single operator, a durable queue controller with approval digests, dependency state, expiry, route scoring and self-improvement adds a second product before managed implementation works.

Use the existing scope receipt, project-owned effort/work-map and explicit human launch as the backlog until repeated unattended runs demonstrate failure modes that a queue would solve. Introduce a small typed intake record first only if it eliminates observed routing/authority ambiguity. Absence of a general queue is not a present P0.

### 3. Prescribe generic application scaffolding before extraction proves it

The target mandates `FabricRuntime`, a command dispatcher, `UnitOfWork`, domain events and bounded contexts together. Current code already has direct SQLite transactions, a command journal, event rows, stores and a provider-session coordinator (`runtime/agent-fabric/src/application/command-journal.ts:41-106`; `runtime/agent-fabric/migrations/0001-current-baseline.sql:568-575`; `runtime/agent-fabric/src/application/provider-session-coordinator.ts:103-123`). Installing all proposed layers before extracting one slice risks moving the same complexity behind more names.

Extract by change pressure: provider admission first, then dispatch/reconciliation if the first seam exposes a stable interface. Add an abstraction only when two extracted slices need it or a testable invariant requires it. Preserve the façade until callers move, but avoid a second parallel implementation.

## 4. P0/P1 omissions

### No additional P0 found

The read-only managed execution gap is the only present issue in this review surface that plausibly blocks the stated “general managed implementation harness” outcome. Several other pack P0s (no backlog controller, no destructive retention and no typed intake runtime) are target-state gaps, not immediate catastrophic/correctness defects.

### P1: Delivery authority and Fabric authority are not one end-to-end contract

The constitution says authority includes source/artifact paths, prohibited actions, disclosure, secrets, deployment, irreversible actions, expiry and approver (`HARNESS.md:57-62`). The delivery validator enforces approver/evidence, secrets access, deployment and irreversible-action flags (`skills/deliver/scripts/validate_delivery.py:259-285`). Fabric's `AuthorityInput` carries only paths, actions, disclosure, expiry and budget (`runtime/agent-fabric/src/domain/types.ts:8-18`; the protocol repeats that shape at `runtime/agent-fabric-protocol/src/baseline-contracts.ts:9-17`). Network authority is absent too.

Impact: a capability compiler cannot prove that its runtime input is a lossless projection of the human-approved envelope. Fix before write enablement: define a versioned authority mapping/schema, bind the delivery authority digest to the Fabric authority/effect policy, and reject any lossy or unknown dimension.

### P1: `workspace-write-offline` has no proven isolation substrate

The repository explicitly says worktrees are not permission boundaries (`docs/ARCHITECTURE.md:141-150`). Current safety is read-only: Codex uses a provider sandbox and Claude uses plan mode plus a tool permission callback (`runtime/agent-fabric/src/adapters/providers/codex-app-server.ts:194-200`; `runtime/agent-fabric/src/adapters/providers/claude-agent-sdk.ts:219-257`). Merely compiling “workspace write” into native flags does not prove sibling-path denial, symlink containment, subprocess confinement or network-off behaviour, especially where provider substrates differ.

The pack discusses threat modes but does not make substrate attestation a prerequisite of section 9. Require provider-specific adversarial fixtures and an effective-isolation receipt before exposing the write profile. If one provider cannot prove the profile, mark it unsupported rather than emulate it with prompt/tool policy.

### P1: Live specification and effort status sources contradict each other

The specification index says Specs 01-04 still have implementation pending (`docs/specs/00-index.md:5-8`). Their effort maps say the implementation/review legs are complete and only final human acceptance remains (`docs/efforts/EFFORT-agent-fabric.md:4,16-23`; `docs/efforts/EFFORT-agent-fabric-operational-hardening.md:4,14-19`; `docs/efforts/EFFORT-harness-lifecycle-refactor.md:4,17-23`). F-006 notices pending spec text but does not identify the cross-source contradiction.

This must be reconciled before the human approves a refactor, otherwise “missing implementation” and “unaccepted implementation” will be scoped as the same problem. Designate one live status owner and make the other documents link to it.

## 5. First implementation scope

### Verdict: right objective, too much in one tranche

Capability compilation is the right first functional change because the hard-coded admission path is the direct blocker (`runtime/agent-fabric/src/core/fabric.ts:6537-6591`). Provider-action admission is also the right first architectural seam. Section 9 nevertheless combines two-provider permission semantics, a new write capability, schema/receipt/projection changes, end-to-end containment tests, structural extraction of large dispatch/reconciliation flows and direct cutover. That is too many independent failure dimensions for one tranche.

Use four bounded steps:

1. **Contract and characterisation.** Reconcile delivery/Fabric authority, define only `review-readonly` and `workspace-write-offline`, and characterise both adapters' current read-only output. Specify unsupported/degraded semantics and isolation evidence.
2. **Pure admission extraction.** Move `#admitProviderPayload` into an `AuthorityCompiler` while preserving current read-only behaviour and the existing `Fabric` dispatch/reconciliation façade. Direct cutover is reasonable here because behaviour is unchanged and the project is pre-release.
3. **One-provider write pilot.** Select the first provider only after a containment spike proves owned-path write, sibling/denied/symlink rejection, network denial, trusted-control non-overridability, revocation/expiry recheck and external-effect unavailability. Bind requested/effective profile facts to the receipt.
4. **Second provider, then structural extraction.** Add the second provider only if it can meet the same semantic contract without pretending parity. Extract the remaining provider-action command/reconciliation family after the compiler seam and tests are stable.

Do not include network enablement, release effects, a general lifecycle engine, backlog runtime or global manifest in this tranche. The acceptance gate should prove effective containment and authority lineage independently of provider acceptance of the intended native settings.

STATUS: round1-complete
