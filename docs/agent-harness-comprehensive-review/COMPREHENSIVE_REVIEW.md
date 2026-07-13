# Comprehensive review of `agent-harness`

## 1. Executive assessment

### 1.1 Bottom line

This is an unusually thoughtful pre-release agent harness. Its strongest qualities are architectural rather than cosmetic:

- one accountable chair;
- explicit human authority;
- typed delegation and work ownership;
- durable work state and receipts;
- fail-closed provider effects;
- independent review that does not reduce correctness to model voting;
- provider-native adapters rather than terminal scraping;
- a clear separation between Herdr visibility and Fabric authority;
- disciplined skill routing and trigger evaluation;
- strong concern for reconciliation, idempotency, freshness, evidence lineage and one-way doors.

Those primitives are appropriate for a modern, multi-provider agentic software-development lifecycle. They should be retained.

The repository is not yet a reliable general implementation harness, however. The central technical reason is not a missing model or missing skill. It is a mismatch between the breadth of the operating contract and the current execution architecture:

1. The two primary managed provider adapters are deliberately compiled into read-only execution.
2. The Fabric transaction owner has accumulated orchestration, policy, SQL, provider execution, recovery and projection responsibilities in a single file of roughly 7,400 lines.
3. Lifecycle policy is repeated across specifications, `HARNESS.md`, skills, validators and runbooks instead of being generated from one executable state model.
4. Machine-local compatibility attestations, portable product policy and repository configuration are mixed.
5. The public documentation, skill catalogue, tests and installation surface are not generated from one registry, and drift is already visible.
6. The Console has a good domain model but a renderer/interaction module of roughly 1,800 lines.
7. Security evidence types are comprehensively declared, but the shipped static scanner implements only a narrow subset.
8. Retention is intentionally non-destructive, which protects evidence but prevents the governed pruning and deletion needed for a durable autonomous system.
9. There is no typed backlog controller or intake decision object connecting a human-approved outcome to an executable, resumable agent plan.
10. Current specifications explicitly remain pending final implementation, integrated verification and human acceptance.

The appropriate destination is therefore an **advanced modular monolith**, not microservices and not a rewrite. Keep one process and one transactional SQLite authority initially. Decompose it internally into deep modules with explicit command handlers, a unit of work, capability compilation, an event journal and projections. Provider-native session engines should remain responsible for threads, turns, subagents, compaction and native UI behaviour. Fabric should coordinate them rather than reproduce them.

### 1.2 Maturity view

| Dimension | Assessment | Rationale |
|---|---|---|
| Strategic model | Strong | The chair, authority, receipt, review and lifecycle concepts are well chosen. |
| Protocol design | Strong | Central operations, capability negotiation, principal scoping and typed client surfaces are mature. |
| Provider-session integration | Promising but incomplete | Codex App Server and Claude Agent SDK are the correct seams, but managed execution is read-only. |
| Runtime modularity | Weakest major area | `Fabric` is an aggregate façade, transaction owner, policy engine, executor, recovery coordinator and SQL application layer. |
| Skill portfolio | Strong but repetitive | Trigger discipline and evaluations are good; lifecycle policy is restated too often. |
| Console | Good model, high implementation concentration | Typed views and freshness concepts are useful; renderer and interaction code need further decomposition. |
| Security design | Strong intentions, partial implementation | Fail-closed local controls are good; threat assumptions and declared check coverage need to be made executable and visible. |
| Portability | Limited | Current paths, Unix sockets, file modes, Bash scripts and attestations are principally macOS/POSIX oriented. |
| Distribution and upgrade | Development-grade | Safe ownership tracking exists, but installation is path-bound and not yet a cross-platform product channel. |
| Operational assurance | Incomplete | CI configuration is substantive; current-head status, branch protections and integrated live acceptance were not verifiable in this review. |
| Adaptive routing | Partial | Aliases and compatibility checks exist, but outcome/cost/latency feedback is not yet a closed routing loop. |
| Autonomous backlog operation | Missing as a governed runtime capability | Long-run skills exist, but no approved-item queue with typed authority, readiness and expiry. |

**Overall:** advanced research-grade pre-release architecture with several production-quality controls, but not yet a dependable default implementation substrate for combined Codex and Claude Code development.

## 2. The most important decisions

### Decision 1 — Make execution authority a first-class compiled profile

The current provider layer supports review and research safely, but it does not expose a general managed workspace-write path. Introduce a provider-neutral `AuthorityProfile` or `CapabilityProfile` that is resolved by Fabric and compiled into provider-native permissions.

Recommended initial profiles:

| Profile | Filesystem | Network | Tools | External effects |
|---|---|---|---|---|
| `review-readonly` | admitted roots read-only | off by default | search/read/test metadata | prohibited |
| `workspace-write-offline` | one owned worktree writable | off | shell, edit, tests within policy | prohibited |
| `workspace-write-network-allowlist` | one owned worktree writable | named domains only | package/build/browser tools as declared | prohibited |
| `browser-test` | build/test artefacts and admitted worktree | test endpoints/allowlist | browser automation | prohibited |
| `release-effects` | no general model shell requirement | exact registered endpoints | typed effect requests only | staged executor after gate |

The model never supplies raw sandbox, approval, tool or network settings. It requests a named profile. Fabric intersects that request with:

- human-approved authority;
- task ownership;
- path/worktree ownership;
- risk policy;
- provider capabilities;
- local trust posture;
- resource budget;
- effect policy.

The receipt records requested profile, effective profile, compiler version, degraded capabilities and exact provider-native settings. A provider cannot silently substitute a broader profile.

### Decision 2 — Keep one Fabric authority; split the implementation behind it

Do not split the Fabric into services yet. That would multiply failure modes, distributed transactions, deployment burden and operator cognitive load without evidence that one local process and SQLite are the bottleneck.

Create a small `FabricRuntime` composition root and application command dispatcher. Organise internals into bounded contexts:

1. **Identity and sessions**
2. **Authority and budgets**
3. **Work, teams and leases**
4. **Provider sessions and actions**
5. **Messages and coordination**
6. **Review, evidence and gates**
7. **Effects and Git**
8. **Lifecycle, recovery and retention**
9. **Operator projections**

Each command handler:

- receives a typed command and authenticated principal;
- loads only the stores and policies it needs;
- executes within one explicit `UnitOfWork`;
- emits domain events;
- returns a typed result;
- performs no terminal rendering and no provider-specific argument construction.

Keep SQL explicit in focused stores. Avoid a generic repository abstraction. The objective is locality and a small interface, not layering for its own sake.

### Decision 3 — Create one generated harness manifest

Add a canonical `harness.manifest.yaml`. Generate or validate from it:

- skill inventory and count;
- README catalogue;
- provider sidecars;
- installer targets;
- adapter registry;
- compatibility schema references;
- policy versions;
- CLI help inventory;
- documentation index;
- Console discovery metadata;
- contract tests.

This eliminates the current class of drift where the README reports a different skill count from the static catalogue. It also prevents providers, installer scripts and documentation from becoming separate registries.

### Decision 4 — Turn lifecycle prose into an executable kernel

Retain `HARNESS.md` as a short constitution. Move operational state transitions and minimum evidence into a versioned lifecycle policy and schemas.

The kernel should determine:

- whether scoping is required;
- whether explicit approval is required;
- which execution profile is admissible;
- whether a fresh session is required;
- review independence and evidence requirements;
- repair-loop bounds;
- release/effect gates;
- observation and retrospective requirements;
- retention class.

Skills then supply domain methods. `implement`, `refactor`, `diagnose`, `evaluate` and `release` should not each restate the full lifecycle.

### Decision 5 — Separate provider-native mechanics from cross-provider control

Use:

- **Codex App Server** for Codex thread/turn lifecycle, forks, native subagents, goals, compaction, permissions and streaming events;
- **Claude Agent SDK/Claude Code APIs** for Claude sessions, native subagents, permissions, hooks, worktrees and streaming events;
- **MCP** for focused tools, context/resource access and receipt submission within a provider session;
- **Fabric local RPC** for durable work state, authority, high-frequency control and operator projections;
- **direct CLI** only for explicit interactive launch, preflight or a recorded degraded fallback.

Do not make MCP the general process supervisor or high-rate event bus. Do not scrape terminal output as an authoritative provider-session protocol.

### Decision 6 — Stage external effects

Workspace writes inside an isolated, owned worktree are different from external effects. A model may receive workspace-write authority while still being unable to merge, push, publish, deploy, send, file, mutate tickets or change production.

Represent external changes as typed proposals:

1. model creates an effect proposal;
2. deterministic validation and redaction run;
3. required reviewers/gates resolve;
4. a separate effect executor receives minimum credentials;
5. executor applies the exact effect;
6. Fabric reconciles result and stores evidence.

This is compatible with the repository's existing typed Git and stable-action design and should become the uniform effect pattern.

## 3. What should remain unchanged in principle

### 3.1 One chair

The one-chair rule is a major strength. “Paired” should not mean two co-equal coordinators writing competing plans. A single chair owns:

- the user relationship;
- current authority interpretation;
- decomposition;
- the canonical plan;
- synthesis and escalation;
- final evidence presentation.

The other primary model should commonly act as a challenge partner, alternative designer, reviewer or specialist lead. Chair transfer must remain typed and explicit.

### 3.2 Evidence rather than model votes

Cross-family agreement is useful but not sufficient. A finding becomes blocking because it has evidence, impact and violated criteria. Continue to separate:

- deterministic failures;
- reproducible behaviour;
- high-confidence static findings;
- judgement findings;
- unresolved hypotheses;
- human acceptance.

Reviewer family diversity should reduce correlated blind spots; it should never replace a test oracle.

### 3.3 Fail-closed reconciliation

Stable action IDs, action journals, ambiguity handling, lookup before retry, generation fencing, capability files, bounded outputs and exact identity bindings are high-value mechanisms. Preserve them through refactoring with characterisation tests.

### 3.4 Herdr as presentation and wake-up, not truth

The current Herdr boundary is appropriately narrow. Continue to treat panes as visibility and optional control surfaces. Pane existence must not imply readiness, delivery, task completion or identity.

### 3.5 Pre-release freedom to make direct changes

The project is explicitly pre-release and its specifications already reject unnecessary compatibility. Preserve that stance. Before a stable public contract or external consumers exist, prefer direct replacement and schema cutover over dual paths.

Any compatibility layer should require:

- a named consumer;
- evidence that the consumer exists;
- an owner;
- a removal date/version;
- usage telemetry;
- a removal test;
- a documented cost.

## 4. Key findings by theme

### 4.1 Provider execution

**Critical:** the central admission path and both primary adapters enforce a read-only shape. Codex starts threads with a read-only sandbox and no approvals. Claude runs in plan mode with a narrow read tool set. This is coherent for review, but it contradicts the intended use of Fabric as the general managed implementation substrate.

**Change:** extract admission into an `AuthorityCompiler`. Add provider conformance fixtures proving that each portable profile:

- compiles to expected native settings;
- cannot broaden the approved envelope;
- rejects unsupported/degraded capabilities;
- records exact effective settings;
- supports an isolated write test without external effects.

### 4.2 Fabric architecture

The 7,000-plus-line `Fabric` class has high internal coupling. Its size alone is not the problem; its number of reasons to change is. It owns:

- principal checks;
- lifecycle checks;
- task membership;
- SQL;
- provider action identity;
- budgets;
- adapter calls;
- recovery;
- evidence;
- barriers;
- event projection.

**Change:** extract one vertical command family at a time, beginning with provider action admission/execution/reconciliation because it also closes the authority-profile gap. Retain a single database transaction and an external compatibility façade until all callers move.

### 4.3 Protocol

The protocol package is one of the strongest parts of the repository. Keep it independent of the runtime implementation. Improve it by generating:

- operation names;
- request/result codecs;
- capability tables;
- principal permissions;
- MCP descriptors;
- documentation tables;
- client methods;
- compatibility fixtures.

The protocol should describe business operations, not expose Fabric internals.

### 4.4 Skill portfolio

The portfolio is mature and disciplined, but too much constitutional policy appears in every delivery skill. Recommended portfolio change:

- keep `scope`, `deliver`, `implement`, `refactor`, `diagnose`, `code-review`, `evaluate`, `release`, `retrospect`, `orchestrate`, `session`, `work-map`;
- add `architecture-review` as a read-only/manual technique skill;
- implement request intake as an always-available runtime kernel, not a user-facing skill;
- implement execution plans and backlog items as schemas, not prose skills;
- use recipes/overlays for incidents, migrations, security and performance rather than a new top-level skill for every domain.

Specific rewrites appear in `skill-portfolio-redesign.md`.

### 4.5 Scoping and collaboration

For broad, consequential work, paired Claude/Codex scoping should be the default. The pairing should be structured:

- chair: evidence map, plan and user dialogue;
- challenge primary: alternative decompositions, hidden assumptions and failure modes;
- research workers: independent source collections;
- explore workers: bounded repository slices;
- synthesis: chair reconciles evidence and explicitly records rejected options.

Do not force one question per message. Use a decision packet containing a small set of coupled questions, recommended defaults and consequences. Continue working on non-dependent exploration while awaiting a response.

The preliminary execution plan shown to the user should identify:

| Field | Purpose |
|---|---|
| role | chair, explorer, implementer, test writer, reviewer, adjudicator |
| provider/family/model/effort | visible routing decision |
| task | bounded output and completion criterion |
| write scope | exact paths/worktree or artefact-only |
| dependencies | tasks that must complete first |
| budget | turns, tokens/cost, wall time, retries |
| expected return | patch, finding set, evidence map, decision |
| stop/replan condition | when the structure changes |

### 4.6 Review architecture

Use a risk-adjusted review council:

- trivial/local: deterministic checks plus one fresh native reviewer when useful;
- substantial: fresh native reviewer plus other primary on load-bearing decisions;
- high-risk/novel/weak oracle: add a specialist or bonus family;
- crucial/external effect: independent security/domain review plus human gate.

Avoid calling every available family for every change. Track reviewer yield, false-positive rate, overlap and cost. Diversity matters most where the oracle is weak or failure modes are correlated.

### 4.7 Routing

Current aliases are useful but remain partly dated catalogue selection. Evolve routing to a scored decision:

`candidate capability facts -> policy constraints -> predicted utility -> selection -> actual outcome -> calibration`

Candidate facts should include:

- task class;
- observed benchmark/evaluation performance for that class;
- tool and context capabilities;
- latency;
- cost;
- rate-limit/availability state;
- data locality/privacy;
- provider-session continuity;
- required effort controls;
- reviewer independence;
- recent failure/degradation history.

Aliases such as `flagship`, `workhorse` and `scout` should represent intent bands, not model identities. A route receipt should explain selection and substitution. The provider remains authoritative for current model availability.

### 4.8 Backlog and autonomous operation

Do not use a Markdown backlog as standing authority. Add typed backlog items with:

- outcome and acceptance criteria;
- value/risk;
- dependency graph;
- exact authority template;
- approval identity, time and scope digest;
- required evidence;
- allowed execution profile;
- budget/retry limits;
- freshness/expiry;
- stop conditions;
- release requirements.

Recommended state machine:

```text
proposed -> scoped -> approved -> ready -> claimed -> executing
         -> review -> accepted -> done
                  \-> rework
         \-> blocked | retired | expired
```

A queue controller may claim only `ready` items whose approval digest still matches. Scope changes invalidate readiness. An approved queue is not an unbounded mandate.

### 4.9 Context, sessions and hand-offs

Fresh sessions should be selected by phase and recoverability, not a raw token number alone. Rotate when:

- moving from scope to implementation on a large change;
- the chair has consumed roughly two-thirds of usable context;
- a compaction has already removed decision detail;
- the evidence corpus is too large for safe synthesis;
- a new owner/provider takes the chair;
- the current session contains substantial obsolete exploration.

A hand-off must contain:

- outcome and non-goals;
- approved scope digest and authority;
- decisions and rejected options;
- current DAG/state;
- exact artefact/evidence locations;
- open risks and questions;
- next command/verification step;
- provider resume references where appropriate.

Provider transcripts are supporting evidence, not the canonical project state.

### 4.10 Retention and deletion

The current “archive, never delete” posture is safe during early development but not sustainable for autonomous use. Add retention classes:

| Class | Examples | Default treatment |
|---|---|---|
| Ephemeral | scratch prompts, temporary renders, disposable worktrees | delete after verified close |
| Operational | detailed event logs, intermediate checkpoints | compact and expire by TTL |
| Evidence | receipts, test outputs, approvals, effect records | retain per risk/project policy |
| Durable knowledge | ADRs, current specs, runbooks, promoted research | retain until superseded |
| Sensitive | credentials, raw private inputs | minimise, redact, expire earliest |

Deletion should be a typed, logged operation with preview, protected path rules, legal hold and receipt preservation. Unknown user files remain protected. For known harness-owned ephemeral state, deletion should be normal rather than exceptional.

### 4.11 Documentation

Replace growing amendment histories inside normative specifications with:

- a current normative specification;
- ADRs for important choices;
- a changelog/revision ledger;
- effort/handoff state for current work;
- archived prior versions where materially useful.

Do not add an unmanaged `docs/notes` dumping ground. Use an inbox with owner, creation date, expiry and promotion target. Notes must be promoted into an ADR, spec, research record or backlog item—or deleted.

### 4.12 Instructions and hooks

Use a small root `AGENTS.md` as the shared project contract. Add a root `CLAUDE.md` that imports it and contains only Claude-specific mechanics. Use path-scoped Claude rules and nested `AGENTS.md` files for specialised areas.

The global bootstrap should be short and relocatable. Avoid absolute paths and avoid making a pseudo-skill such as `$caveman` the default style for every domain.

Compile a canonical hook policy into provider-specific hooks. Hooks are useful for:

- session registration and hand-off;
- authority-profile attestation;
- command/effect logging;
- secret/path checks;
- final receipt validation;
- status updates to Fabric.

Hooks are not the sole security boundary. Provider hooks, Fabric policy, provider sandboxing and operating-system isolation must reinforce one another.

### 4.13 Local threat model

Document at least three trust modes:

1. **Trusted local development:** agents are cooperative; provider sandboxes reduce accidents.
2. **Untrusted prompt/tool content:** model may be influenced; external effects are staged and network/tool access constrained.
3. **Mutually distrustful local processes:** an agent with arbitrary code under the same OS user may be able to inspect same-user files/processes despite `0600` modes.

For the third mode, file permissions and a private Unix socket are insufficient by themselves. Use provider sandboxes, containers/VMs, per-run credentials with least scope, network egress controls and—where the threat warrants it—separate OS/container identities. State explicitly which guarantees are and are not provided in each mode.

## 5. Target repository shape

A staged destination:

```text
/
├── AGENTS.md
├── CLAUDE.md
├── HARNESS.md
├── harness.manifest.yaml
├── package.json
├── policies/
│   ├── lifecycle.yaml
│   ├── authority-profiles.yaml
│   ├── routing.yaml
│   ├── retention.yaml
│   └── effects.yaml
├── schemas/
├── packages/
│   ├── protocol/
│   ├── fabric/
│   ├── adapter-codex/
│   ├── adapter-claude/
│   ├── adapter-herdr/
│   ├── console-core/
│   ├── console-cli/
│   └── installer/
├── skills/
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── specs/
│   ├── runbooks/
│   ├── research/
│   ├── backlog/
│   └── archive/
└── .agent/                 # project-local, gitignored runtime state
    ├── runs/
    ├── evidence/
    ├── handoffs/
    ├── notes/
    └── local/
```

Do not begin by renaming every directory. First add the root workspace and module boundaries while preserving paths. Move packages only after imports and tests are stable.

## 6. Options considered

### Option A — Minimal patching

Fix the README count, add write permissions and continue extending current files.

**Benefit:** low disruption.  
**Failure mode:** compounds the Fabric and Console concentration, and makes every new feature harder to reason about.  
**Use:** only for immediate truth/defect fixes before the structural tranche.

### Option B — Modular monolith (**recommended**)

One process, one SQLite authority, explicit bounded modules, one event journal, provider adapters and separate effect executors.

**Benefit:** retains transactional simplicity and existing fail-closed semantics while improving locality, testing and replaceability.  
**Cost:** requires careful characterisation and staged extraction.  
**Fit:** best match for a local, single-operator, multi-agent harness.

### Option C — Distributed services/event-sourced platform

Split scheduler, authority, provider workers, evidence and UI into network services.

**Benefit:** theoretical independent scaling.  
**Failure mode:** operational and security complexity dominates current needs; distributed transactions and schema evolution become the product.  
**Decision:** reject until measured concurrency, multi-host or multi-tenant requirements justify it.

### Option D — Provider-native only, remove Fabric

Let Codex and Claude manage their own sessions and coordinate through files.

**Benefit:** small custom runtime.  
**Failure mode:** loses neutral authority, durable cross-provider work state, evidence, budget reconciliation and one operator projection.  
**Decision:** reject.

### Option E — Make MCP the whole control plane

Expose scheduler, supervision, events and effects through MCP.

**Benefit:** one protocol surface.  
**Failure mode:** MCP is well suited to focused tools/resources, not necessarily daemon ownership, process supervision, high-frequency event streaming or transactional cross-tool authority.  
**Decision:** use MCP selectively.

### Option F — Adopt an external agent framework wholesale

Replace the current harness with a generic orchestration framework.

**Benefit:** faster access to some features.  
**Failure mode:** the repository's key value is its authority/evidence model; wholesale adoption would import different assumptions and duplicate abstractions.  
**Decision:** borrow mechanisms and adapters, not lifecycle ownership.

## 7. Recommended implementation order

### Tranche 0 — Make current truth honest

1. Generate the skill count/catalogue and fail CI on README drift.
2. Separate portable adapter policy from machine-local attestations.
3. Publish a current implementation-status matrix for each specification.
4. Verify/protect `main` with required checks; expose current-head status in the Console.
5. Mark each declared security evidence check as implemented, external, unavailable or planned.
6. Add a root contribution/release policy if public collaboration is intended.

### Tranche 1 — Close the execution gap

1. Define portable authority profiles and JSON Schema.
2. Extract provider admission into an `AuthorityCompiler`.
3. Compile profiles for Codex and Claude.
4. Add an isolated, workspace-write acceptance fixture for each primary.
5. Keep network off and external effects unavailable in the first write profile.
6. Record requested/effective/degraded profile data in receipts and projections.

### Tranche 2 — Build the modular spine

1. Add a root workspace and single lock/build graph.
2. Introduce `FabricRuntime`, `UnitOfWork`, command dispatcher and event publisher.
3. Extract provider actions/reconciliation as the first bounded vertical slice.
4. Add architecture dependency tests.
5. Reduce the public Fabric export surface.
6. Split Console core from local Fabric bootstrap.

### Tranche 3 — Make the operating model executable

1. Add intake decision, execution plan and backlog schemas.
2. Add lifecycle state policy and decision engine.
3. Replace repeated skill policy with references to the kernel.
4. Add phase-aware session rotation and canonical hand-offs.
5. Add governed retention apply/delete.
6. Add runtime route scoring and calibration receipts.

### Tranche 4 — Improve operator experience and autonomous operation

1. Add event replay and immutable projection snapshots.
2. Implement topology/task/evidence/attention TUI views.
3. Add native provider-session labels and concise status hand-offs.
4. Add backlog queue controller with approval digests and limits.
5. Add staged effect executors.
6. Add proposal-first harness self-improvement with held-out evaluations.

## 8. Definition of a successful redesign

The redesign should be considered complete only when all of the following are true:

- A user can approve an outcome and authority envelope once, then see the proposed agent topology before execution.
- Codex and Claude can each lead, implement in isolated owned worktrees, spawn native workers and cross-review.
- The chair can change team topology within the approved envelope and every change is visible.
- No two agents can acquire overlapping write ownership.
- Every provider call is tied to task, authority, model/effort, budget and provider-session lineage.
- Workspace writes are possible without granting external-effect credentials.
- External effects execute only through typed, gated executors.
- The Fabric can recover after process loss without replaying ambiguous effects.
- The Console and provider-native UIs show the same canonical run/task/agent identifiers.
- A backlog controller cannot claim stale or unapproved work.
- The lifecycle, skill catalogue, installer and documentation are generated or checked from one manifest.
- Retention can safely delete owned ephemeral state while preserving evidence and legal holds.
- Core modules have enforceable dependency boundaries and no single application module owns unrelated policy, SQL, provider and rendering concerns.
- Current-head CI, provider conformance, database migration, security evidence and human acceptance are visible as separate facts.
- Self-improvement can propose changes and demonstrate held-out benefit, but cannot silently modify the harness.

## 9. Immediate approval package

The highest-value first implementation scope is:

> **Capability profiles and provider-action extraction**

It should include:

1. `authority-profiles` policy and schema;
2. neutral compiler interface;
3. Codex and Claude compilation;
4. `review-readonly` preserving current behaviour;
5. `workspace-write-offline` for one isolated worktree;
6. provider conformance and end-to-end fixture tests;
7. receipt/projection fields;
8. extraction of provider action command handlers from `Fabric`;
9. no network enablement and no external-effect support;
10. direct cutover with no legacy compatibility path.

This scope simultaneously resolves the most consequential functional gap and establishes the seam required for the broader Fabric refactor.
