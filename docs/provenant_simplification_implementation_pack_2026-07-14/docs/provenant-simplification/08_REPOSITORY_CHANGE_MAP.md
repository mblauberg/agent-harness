# Repository change map

This map is based on the reviewed repository shape. Verify every path and current behaviour before editing.

## 1. Root instructions

### `AGENTS.md`

Target:

- very small bootstrap;
- objective, authority precedence, memory and Git/write boundaries;
- point to `HARNESS.md` only for invariant decisions;
- do not require every ordinary task to load the entire operational corpus;
- no model identities;
- no broad orchestration recipe.

### `HARNESS.md`

Target:

- constitution of stable invariants;
- one chair;
- progressive governance;
- authority, ownership, evidence and effect boundaries;
- deterministic checks before judgement;
- provider-native orchestration;
- concise enough for permanent context.

Remove or demote:

- detailed worker topology recipes;
- dated model routing;
- repeated domain procedures.

The coverage table (`HARNESS.md` lines 78-90) is not demoted here. It is an enforcement surface of review policy and moves only inside the atomic review-policy migration (§4). Until that migration lands as a unit, the current blanket rule — the other primary load-bearing for substantial+ — remains binding (ADR 0008).

### `README.md`

Show the product flow:

```text
advise
scope → WorkItems
implement WorkItem → verified change → PR proposal
effect → human-authorised external action
```

State current implementation status honestly.

## 2. Architecture and specifications

### `docs/ARCHITECTURE.md`

Rewrite around:

- chair and native workers;
- six kernel capabilities;
- provider adapters;
- progressive execution shapes;
- optional work graph;
- typed effect plane;
- presentation-only Console/Herdr.

### `docs/specs/`

Create current normative versions. Move amendment history to:

- ADRs;
- changelog or revision ledger;
- archived previous versions;
- effort/handoff documents.

Add a conformance matrix linking requirements to code, tests, live smoke, review and acceptance.

### `docs/adr/`

Record the decisions in `15_DECISION_REGISTER.md` as repository ADRs where they change accepted architecture.

## 3. Skills

### `skills/scope/`

Keep:

- elicitation;
- repository and evidence exploration;
- alternatives;
- decision packets;
- ScopePacket, Initiative and WorkItem production.

Remove duplication of:

- lifecycle transitions;
- authority compiler behaviour;
- review policy;
- retention policy.

### `skills/implement/`

Keep:

- implementation method;
- TDD, diagnosis and refactor composition;
- source-grounding and migration practices;
- adaptive working plan;
- concise handoff.

Delegate to the delivery kernel (§3, `skills/deliver/`):

- transition validity;
- authority admission;
- review requirement;
- repair ceiling;
- final receipt validation;
- effect permission.

### `skills/deliver/`

Canonical lifecycle owner. Not a conditional facade. Per ADR 0005 the executable lifecycle kernel already exists and is retained:

- the `delivery-run` contract (`schema_version` 1);
- `skills/deliver/scripts/validate_delivery.py`, holding the state set, transition table, evidence and gate checks;
- `config/delivery-profiles.json` (profile admission, required evidence, gates);
- `config/risk-policy.json` (risk floor).

Extend this kernel. Do not build a second policy model beside it.

Keep:

- create/load the canonical run;
- request transitions;
- attach evidence;
- project status;
- close/terminalise;
- authority containment, review independence, repair ceiling, effect/release gates, retention class.

Every other skill, validator and runtime references this kernel. No component maintains a parallel lifecycle table, and nothing else defines the canonical run, review, effect, event or receipt schemas — the Fabric protocol projects them (§5), it does not own them.

### `skills/orchestrate/`

Keep:

- one chair;
- value and decomposability gate;
- native subagents first;
- non-overlapping writers;
- bounded worker contracts;
- central reduction.

Remove:

- any assumption that bounded work automatically warrants fan-out;
- custom same-family scheduling that duplicates native providers;
- provider model identities;
- repeated lifecycle and review rules.

### `skills/code-review/` and `skills/evaluate/`

Keep judgement methods and evidence contracts. Let the delivery kernel decide when they are mandatory. The kernel's present answer is the binding one until the review-policy migration (§4) lands; risk/oracle-adjusted pressure does not take effect ahead of it.

### `skills/session/` and `skills/work-map/`

Make continuity tools optional and triggered by:

- long duration;
- context turnover;
- multi-owner graph;
- recovery need;
- substantial retained evidence.

### `skills/autonomous-lab/`

Keep experimental and explicitly activated. It must use LoopPolicy, budgets, no-progress detection and STOP states. It is not the default implementation path.

### Specialist Skills

Review each specialist Skill. Demote to a reference or overlay where it does not own a distinct authority, output and verification contract.

## 4. Configuration

### `config/risk-policy.json`

Retain as minimum risk floor. Ensure review planner consumes:

- risk;
- oracle quality;
- critical surface;
- reversibility;
- blast radius.

Avoid adding speculative dimensions unless they change an enforced decision.

### `config/review-profiles/spec05-four-slot-v1.json`

Binding today. It pins the four certifying slots (native, other-primary, cursor-grok, agy-gemini) for Spec 05 delivery, with adapter class, provider family, effort and read budgets per slot. Retain unchanged outside the migration below.

### Review-policy migration

Review policy is enforced on more surfaces than this map previously listed. Treat the change as one atomic, effective-dated migration carrying a single amendment identifier across every surface. No surface is amended, relaxed or deleted alone:

- `HARNESS.md` coverage table (lines 78-90);
- `docs/specs/05-project-fabric-console.md` four-slot mandate;
- `config/review-profiles/spec05-four-slot-v1.json`;
- `config/delivery-profiles.json` evidence minima and gates;
- `config/risk-policy.json` risk floors;
- `skills/deliver/scripts/validate_delivery.py` — the `_validate_reviews` gate (native plus distinct other-primary, distinct evidence ids, minimum lens count, non-primary bonus family) and the acceptance-transition evidence check;
- runtime profile enforcement: `runtime/agent-fabric/schemas/review-profile.v1.schema.json`, `runtime/agent-fabric/src/review/profile/index.ts`, `runtime/agent-fabric-protocol/src/review-profile.ts`;
- regression fixtures: `tests/test_delivery_contract.py`, `tests/test_delivery_profile_scenarios.py`, `runtime/agent-fabric/tests/spec05/review-algorithms/`.

The migration passes as a unit — spec, constitution, config, validator logic and fixtures green in one change — or it does not pass. Until it does, the present gate remains binding: blanket other-primary review for substantial+, and the four-slot profile for Spec 05 deliveries (ADR 0008). The risk/oracle-adjusted planner described in `06_LOOP_AND_REVIEW_POLICY.md` is a proposal, not an entitlement, until this migration lands.

### `config/delivery-profiles.json`

Keep domain evidence minima. Do not encode full workflow recipes. It is part of the delivery kernel (§3, `skills/deliver/`) and an enforcement surface of the review-policy migration above.

### `config/model-routing.json`

Use capability bands and runtime discovery. Keep dated model catalogues as explicit cache only.

### Adapter compatibility

Split:

- tracked portable compatibility policy;
- ignored local executable and capability attestation;
- project/user activation overlay.

No machine-local absolute paths or hashes in portable policy.

## 5. Protocol

`runtime/agent-fabric-protocol` is transport, not lifecycle authority. The canonical run, review, effect, event and receipt schemas belong to the delivery kernel (§3, `skills/deliver/`). The protocol owns only:

- Fabric-specific transport projections of those canonical contracts — wire encoding, RPC/NDJSON framing, MCP projections;
- an explicit, tested mapping from each canonical delivery-kernel contract to its Fabric projection, so drift fails a check instead of accumulating;
- Fabric-internal transport types with no delivery-kernel counterpart (session, adapter, operator-action).

The dependency runs one way: the protocol depends on the canonical contracts; the canonical contracts never depend on the protocol. Where the protocol currently restates a lifecycle schema, it becomes a projection of the canonical one.

Do not expose Fabric implementation internals.

## 6. Fabric

Not a greenfield extraction. Per ADR 0003 the decomposition is already part-done and proceeds by completing existing seams. Three seams are live today and are composed in the `Fabric` constructor (`runtime/agent-fabric/src/core/fabric.ts`, lines 916, 921 and 933-940):

- `runtime/agent-fabric/src/application/command-journal.ts`;
- `runtime/agent-fabric/src/application/provider-session-coordinator.ts`;
- `runtime/agent-fabric/src/operator/external-effect-service.ts`.

Do not pre-install a composition root, generic dispatcher, universal UnitOfWork or domain-event framework. Add an abstraction only when two extracted slices need it or a testable invariant requires it. Keep one process, one transactional SQLite authority, explicit transactions and direct SQL in focused stores.

### Extraction order

1. Admission and authority first: provider payload admission, action identity and capability/authority compilation. This is the slice under change pressure and the one later slices depend on.
2. Then only those residual responsibilities whose characterisation tests and callers are known. Nothing moves until its current callers in `fabric.ts` are enumerated and characterisation and recovery tests pin its behaviour. Import-boundary tests (F-033) precede extraction. Each move deletes the old path; no parallel second implementation.
3. Responsibilities with no live seam and no known caller set — workspace ownership and leases, lifecycle transition projection, verification and evidence, projections — stay behind the facade in `fabric.ts` until change pressure produces a seam. Opening an empty module for them is the scaffolding-first move ADR 0003 rejects.

The sections below are a residual-responsibility map, not a module inventory: what each live seam owns today, and what must still move to it.

### `runtime/agent-fabric/src/application/provider-session-coordinator.ts`

Owns today: registration preflight; provider action identity and dedupe; session target resolution; turn admission against the concurrency ceiling; steer binding; turn settlement; lifecycle-intent preparation, terminalisation, finalisation and recovery enumeration; model-routing and cross-family review evidence recording.

Residual still in `fabric.ts`, to move here first as the admission and authority slice:

- in-flight provider action ownership (`#ownedProviderActions`, `#lifecycleProviderActions`, `#activeProviderOperations`);
- the deferred-action queue, pump and backpressure timer (`#deferredProviderActions`, `#pumpDeferredProviderActions`), which today enforce the concurrency ceiling in a second place;
- provider action reconciliation with its replay and ownership branches (`reconcileProviderAction`, `#reconcileProviderAction`);
- the merged `ProviderActionDispatchInputV1` contract shape once the write-pilot steps land (ADR 0003).

### `runtime/agent-fabric/src/application/command-journal.ts`

Owns today: idempotent command execution keyed by run, actor and command id; canonical payload hashing; `DEDUPE_CONFLICT` on a reused command id with a changed payload; the explicit SQLite transaction around the action; result persistence and typed replay.

Residual still in `fabric.ts`, to move here once callers are known:

- the hand-rolled `read`/`write` dedupe sequences that reimplement `execute()` around asynchronous provider work, so async commands take one journalled idempotency path instead of a bespoke one per call site;
- the direct `this.#database.transaction(...)` sites that mutate journalled state outside the journal and can therefore commit without a command record.

No new UnitOfWork. The journal is the transaction seam.

### `runtime/agent-fabric/src/operator/external-effect-service.ts`

Owns today: effect port registry and binding; current-state read before an intent; in-transaction preparation; dispatch of a prepared effect; observation and lookup; recovery of prepared-but-unconfirmed effects; gate consultation through `ScopedGateStore`; inspection of the accepted delivery receipt as effect evidence. It is already wired through `runtime/agent-fabric/src/operator/production-action-ports.ts`.

Residual still in `fabric.ts`, to move here once callers are known:

- startup effect-recovery sequencing, which `fabric.ts` drives directly (`this.#externalEffects?.recover()`, line 1831) and which belongs to the seam's own recovery contract;
- the operator-action admission wiring that decides whether an intent reaches the effect service at all.

The effect proposal contract stays canonical in the delivery kernel (§3). This seam owns custody and execution, not the schema.

### `runtime/agent-fabric/src/core/fabric.ts`

7,401 lines today; the composition point for the seams above. Reduce by vertical extraction, not mass relocation. Keep the facade until callers move. Each extraction requires characterisation and fault tests and deletes the old path.

## 7. Provider adapters

`runtime/agent-fabric/src/adapters/providers/`

Target:

- capability compilation target;
- native session lifecycle;
- native worker lineage;
- event normalisation;
- conformance;
- error mapping.

Current read-only behaviour becomes the named `review-readonly` profile. Add `workspace-write-offline` only after containment approval.

## 8. Console and Herdr

Console:

- protocol/projection client;
- topology, attention, evidence and effect views;
- not required for correctness.

Herdr:

- observation and wake/steer only;
- no authority, completion or task truth.

## 9. Scripts and validators

### `skills/deliver/scripts/validate_delivery.py`

The canonical lifecycle validator, not a peripheral script. It holds the executable state set, transition table, evidence and gate checks, and the review gate. Keep it and extend it in place. Its review logic is an enforcement surface of the review-policy migration (§4) and does not change ahead of it.

### Other lifecycle validators

Replace duplicated transition tables with imports or generated artefacts from the canonical lifecycle kernel above. Downstream validators derive from it; none restates it.

### `scripts/check-harness`

Add or retain checks for:

- skill catalogue drift;
- current documentation projections;
- no tracked machine-local attestations;
- protocol generation;
- architecture dependency rules;
- specification conformance links;
- no obsolete lifecycle tables.

## 10. CI

Add distinct facts:

- build/typecheck/test;
- generated tree clean;
- architecture boundaries;
- provider profile conformance;
- offline write containment;
- database migration/recovery;
- live provider smoke where separately authorised;
- human acceptance status.

CI success must not be presented as live-provider or human acceptance evidence when those were not run.
