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

Review policy is enforced far more widely than a config change suggests. The four slots (`native`, `other-primary`, `cursor-grok`, `agy-gemini`) and the blanket substantial+ other-primary rule are live in normative spec text, the accepted architecture, the decision record, root instructions, the lifecycle and orchestration skills, generated autonomous-lab instructions, protocol wire codecs and their generated closed schemas, runtime completion-domain logic, SQLite slot and ordinal constraints, the delivery kernel validator, and the Spec 05 acceptance selector/requirements catalogue.

Two kinds of surface appear below and both are load-bearing. Some *enforce* the gate — the validator, the codecs, the schemas, the database constraints. Others *instruct* it — the specs, the architecture, ADR 0008, the root documents and the skills. Migrating only the enforcing surfaces leaves the instructing ones telling every agent, and every generated lab, to run the policy that no longer exists. Migrating only the instructing ones leaves the machine rejecting the receipts the new policy produces. Both classes are current-policy owners; both move in the same change.

Treat the change as one atomic, effective-dated migration carrying a single amendment identifier across every surface below. No surface is amended, relaxed or deleted alone.

**Root instructions and product prose**

- `HARNESS.md` coverage table (lines 78-90) — the risk-to-review-pressure ladder; and `HARNESS.md` (line 19) — the constitution's own prose rule that substantial work uses native subagents plus the other primary, outside the table;
- `README.md` (line 76) — states that substantial+ cannot reach acceptance with the other-primary leg missing; and `README.md` (lines 163-171) — the second copy of the coverage ladder in the product-facing review section;
- `MAINTAINING.md` (lines 141-143) — a substantial `implement` run gets a fresh native reviewer and the other primary family;
- `docs/ARCHITECTURE.md` — the accepted architecture states the gate five times and asserts the validator enforces it: lines 20-24 (substantial+ owes both legs and `validate_delivery.py` fails any receipt reaching acceptance missing either), 41, 96-99, 235-245 (legs 2 and 3 both load-bear; no degradation note buys past the other primary) and 292-295. The Mermaid lifecycle and topology figures carry the same rule in node labels and `accDescr` text (lines 47, 61, 257, 268, 271-272); diagram prose is normative here, not decoration;
- `skills/implement/SKILL.md` (line 42) — restates native plus other-primary as load-bearing, bonus families as opportunistic.

**Skills and generated lab instructions**

The lifecycle owner and its collaborators restate the gate in their own instruction text. A migration that changed only the validator and the specs would leave these skills instructing agents to run the old gate.

- `skills/deliver/SKILL.md` (lines 40-42) — "Substantial+ requires a fresh native reviewer and the other primary family", stated in the canonical lifecycle owner itself;
- `skills/orchestrate/SKILL.md` (lines 27-28) — the other primary is load-bearing at substantial+, under the HARNESS risk ladder;
- `skills/autonomous-lab/SKILL.md` (lines 58-60) — hard gates require adversarial falsification, objective RED-on-mutation evidence and the other primary;
- `skills/autonomous-lab/scripts/bootstrap-lab.sh` (lines 567, 1165, 1169, 1178) — the generator writes the gate into every bootstrapped lab: `CROSS_FAMILY_VERIFIER` (line 1165), the `MODEL_MATRIX` instruction to apply the HARNESS native-plus-other-primary gate to hard gates and finish verification (line 1169), and `EXTERNAL_FAMILIES` (line 1178). Generated labs already in flight carry the old gate in their own `GOAL.md`; the migration must say whether they are re-bootstrapped or left on the superseded policy;
- `skills/autonomous-lab/templates/GOAL.template.md` (lines 104, 202) and `skills/autonomous-lab/templates/OPERATING_MANUAL.template.md` (line 475) — the templates those labs are generated from;
- `skills/autonomous-lab/references/model-effort-policy.md` (lines 30, 71), `references/operating-loop.md` (line 162), `references/decision-lifecycle.md` (line 355) and `references/workflow-patterns.md` (line 314) — the lab's own binding statements that the other primary covers the irreversible core and defines the cross-family reviewer;
- `docs/evals/skill-portfolio-2026/routing-holdout.yaml` (line 129) — a held-out routing case whose expected answer routes a review packet to the other primary. `scripts/check-harness` runs this holdout and reports a match percentage, so a policy change that does not update the fixture is scored as a routing regression.

**Normative specifications and decision record**

- `docs/specs/01-agent-fabric.md` §32.19.3 (lines 7057-7138) — the owned closed four-slot profile, per-slot adapter class/family/model mapping, enforced read-only requirement per certifying slot, and the reviewer-family relation table. The four-slot enumeration is not confined to §32.19.3: the same closed slot set is restated in the schema fragments and completion reads at lines 2287, 2475, 2496, 2749, 2768, 2841 (slot order), 6032, 6853, 7031, 7462, 7667, 7900, 7919, 8127, 8174, 8255 (FR-056) and 9546, and the other-primary family relation at lines 7136 and 7147. Migrating §32.19.3 alone leaves the rest of Spec 01 normative and contradictory;
- `docs/specs/02-adaptive-agent-harness.md` (lines 271-275) — §9.2 multi-lens review: "Substantial work requires a fresh native reviewer and the other primary family." This is the normative Spec 02 rule and the source the skills restate;
- `docs/specs/04-agent-fabric-operational-hardening.md` (lines 3339-3348, 5623-5627) — the baseline requiring exactly the four slots with the exact Spec 01 mapping, and the completion read that demands one resolved four-slot profile and exactly four slot heads; also line 260 (acceptance criterion: fresh native and other-primary reviews must report no unresolved P0-P2 findings), lines 2626, 2861 (embedded slot `CHECK`), 3149, 5676 (embedded slot `CHECK`) and 5784;
- `docs/specs/05-project-fabric-console.md` (lines 39, 546-547, 669, 1052) — the four-slot mandate, slot names and target snapshot; also lines 312, 706, 1064, 1078, 1192 (the acceptance criterion behind SPEC05-AC-033), 1243 and 1336;
- `docs/adr/0008-review-pressure-risk-and-oracle-adjusted.md` — the accepted decision that authorises this migration is itself a current-policy owner. Its status header (lines 3-5) says the four-slot profile "remains binding for Spec 05 deliveries until amended", and its decision text (lines 16-19) keeps other-primary review mandatory for crucial+ tiers. The migration carries the ADR 0008 amendment, and `docs/adr/README.md` (line 20) carries the matching status row. Until both change, ADR 0008 is the reason the old gate is still binding.

**Protocol and wire (codecs, generated closed schemas, regression tests)**

- `runtime/agent-fabric-protocol/src/provider-review.ts` — `REVIEW_SLOTS` and the slot enumeration (lines 26-27); the closed complete-completion shape pinning `minItems`/`maxItems` 4, per-index slot constants and per-index `reviewerFamilyRelation` (lines 1188-1210); the completion predicate requiring four CLEAN certifying slots in exact order with no blockers and no unavailable slots (lines 1232-1242); the wire-order guard that rejects any slot list that is neither empty nor exactly four in profile order (lines 1266-1279);
- `runtime/agent-fabric-protocol/src/provider-action.ts` (line 31) and `runtime/agent-fabric-protocol/src/route-lineage.ts` (line 464) — the same slot enumeration on the action and route-lineage codecs;
- `runtime/agent-fabric-protocol/src/review-profile.ts` — profile projection;
- `runtime/agent-fabric-protocol/src/schema.ts` — the `spec05-four-slot-v1` schema registration (line 178) and the `x-fourSlotProfileMatrix` correlated-codec keyword (line 597);
- generated closed schemas: `runtime/agent-fabric-protocol/schemas/spec05-four-slot-v1.schema.json` (lines 245-253, the four-slot `minItems`/`maxItems` and resolved profile digest) and `runtime/agent-fabric-protocol/schemas/review-completion.v1.schema.json` (lines 285-287, 385-387, 1150, 1631). The generated tree must be regenerated inside the migration and stay clean;
- protocol regression tests: `runtime/agent-fabric-protocol/tests/spec05-four-slot-profile.test.ts` (lines 5-11, which asserts a three-slot profile throws), `spec05-provider-review.test.ts`, `spec05-review-correlation-repair.test.ts`, `spec05-review-rereview-repair.test.ts`, `spec05-review-wire-repair.test.ts`.

**Runtime completion and persistence**

- `runtime/agent-fabric/src/review/canonical/domains.ts` (lines 249-255) — the canonical completion-domain check that a completion profile carries exactly four slots;
- `runtime/agent-fabric/schemas/review-profile.v1.schema.json` and `runtime/agent-fabric/src/review/profile/index.ts` — runtime profile enforcement;
- `runtime/agent-fabric/migrations/0001-current-baseline.sql` — SQLite slot and ordinal constraints in `review_finding_capacity_reservations` (lines 5565-5571), `review_certifying_slot_availability_revisions` (lines 5837-5843) and `review_profile_slots` (lines 5908-5913, slot `CHECK` plus `ordinal BETWEEN 0 AND 3`), plus two further closed-slot `CHECK`s that a §4 sweep must not miss: the certifying-review row constraint (line 6086) and `review_slot_heads` (line 6181). Persisted rows outlive the code change: the migration must state what happens to existing four-slot rows, not only to new writes;
- `runtime/agent-fabric/tests/spec05/review-algorithms/` — `profile.test.ts`, `digest-domains.test.ts`, `schemas-config.test.ts` and siblings.

**Delivery kernel (config, validator, fixtures)**

- `config/review-profiles/spec05-four-slot-v1.json` — the checked-in closed profile;
- `config/delivery-profiles.json` evidence minima and gates;
- `config/risk-policy.json` risk floors;
- `skills/deliver/scripts/validate_delivery.py` — the `_validate_reviews` gate (native plus distinct other-primary, distinct evidence ids, minimum lens count, non-primary bonus family) and the acceptance-transition evidence check. The two executable assertions are lines 620-622: substantial+ requires a native review, requires an other-primary review, and requires the two to be on distinct primary families. This is the enforcement that `docs/ARCHITECTURE.md` and `README.md` promise;
- `skills/deliver/scripts/reference_runs.py` (line 195) and `scripts/validate_delivery_scenarios.py` (line 202) — reference and scenario runs that bake the `other-primary` role into the golden shapes;
- regression fixtures: `tests/test_delivery_contract.py`, `tests/test_delivery_profile_scenarios.py`, `tests/test_model_route.py` (line 46), `skills/orchestrate/evals/test_cf_dispatch.py` (lines 105, 137).

**Spec 05 acceptance catalogue**

- `config/spec05-evidence-selector-registry.v1.json` (line 40) — the `spec05-post-review-council-four-family-adjudication-v1` selector, proof domain `current-four-family-clean-review`, owner `llm-council`, state `post-review-gate`;
- `config/spec05-delivery-requirements.v1.json` (lines 468-479) — SPEC05-AC-033, which binds that selector as a `complete-nonempty-current-set` post-review-acceptance requirement with `requiredStatus: approved`;
- `config/spec05-evidence-selector-registry.v1.json` (line 49) — the second four-family selector, `spec05-test-four-family-portal-confinement-v1`, proof domain `four-family-portal-confinement-helper-custody`, bound by SPEC05-AC-042 in `config/spec05-delivery-requirements.v1.json` (lines 594-605). It proves portal confinement across the same four families, so it depends on the four-slot set even though it is a test rather than a review requirement.

Acceptance is catalogued, not only enforced: changing the gate without changing SPEC05-AC-033, SPEC05-AC-042 and their selectors leaves the acceptance requirements demanding a four-family clean review and a four-family confinement proof that the new policy no longer produces.

The migration passes as a unit — spec, constitution, protocol codecs and regenerated schemas, completion logic, database constraints, validator logic, fixtures and the acceptance catalogue all green in one change — or it does not pass. A partial landing is not a partial improvement: it leaves incompatible enforcement behind, in which the wire, the database and the acceptance catalogue still require what the policy has abandoned.

The list above is complete to the best of current knowledge: every live enforcement and normative owner of the substantial+/other-primary gate and the Spec 05 four-slot profile found by sweeping `docs/`, `skills/`, `scripts/`, `config/`, `runtime/`, `tests/`, `README.md`, `HARNESS.md`, `AGENTS.md` and `MAINTAINING.md`. Deliberately excluded, and not migration surfaces: historical review artifacts and handoffs; `docs/research/` advisory analysis; `skills/orchestrate/references/paired-primary.md` and `herdr-panes.md`, which describe the peer and its pane rather than restating the gate; `skills/code-review/SKILL.md` (line 27), which scales blind-agent count at substantial+ without binding a family; and `config/adapter-compatibility.yaml` (line 241), which allowlists model patterns, not review slots.

Still, sweep the tree again before the migration is authored. The list is the surfaces known at pack time, not a guarantee of completeness, and any newly found surface joins the same single amendment.

Until the migration lands, the present gate remains binding: blanket other-primary review for substantial+, and the four-slot profile for Spec 05 deliveries (ADR 0008). The risk/oracle-adjusted planner described in `06_LOOP_AND_REVIEW_POLICY.md` is a proposal, not an entitlement, until this migration lands.

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

1. **First: the pure authority compiler.** This is exactly ADR 0002 step 2 — a pure admission extraction, behaviour unchanged. Its subject is `Fabric.#admitProviderPayload` (`runtime/agent-fabric/src/core/fabric.ts`, defined at line 6537) together with its enumerated callers and the pure helpers it sits between. It compiles a caller-supplied provider payload against the stored authority: load the authority row, reject an expired authority, require provider disclosure, reject any payload that overrides a trusted control (`allowedTools`, `permissions`, `sandbox`, `readOnlyRoot` and the rest of the forbidden-control set), resolve and containment-check `cwd` against `sourcePaths`/`deniedPaths`, and return the compiled read-only capability projection (`readOnlyRoot`, `allowedTools: ["Read", "Glob", "Grep"]`, `approvalPolicy: "never"`, `sandbox: "read-only"`). That is the whole slice. It moves to `authority/authority-compiler` (`02_TARGET_ARCHITECTURE.md`), which the target architecture keeps separate from `providers/provider-action-service`.

   The callers, and the call order to preserve exactly:

   - `spawnAgent` (line 3124): `#admitProviderPayload` (line 3144), then `#assertAdapterModel` (line 3145);
   - `attachAgent` (line 3163): `#admitProviderPayload` with an empty payload (line 3184);
   - `#dispatchProviderAction` (line 4843), three sites: the target-agent branch admits against the target's authority (line 4962); the actor branch runs `#assertEphemeralProviderAuthority` (line 4986) before admitting against the actor or ephemeral authority (line 4990); the ephemeral re-admission path re-asserts then re-admits (lines 5114-5115). `#assertAdapterModel` (line 4993) runs after admission, on the admitted payload — not before it.

   Supporting pure code moves with it: `parseAuthority` (line 490), `#assertAdapterModel` (line 6482), `#assertEphemeralProviderAuthority` (line 6610). Behaviour is unchanged and pinned by characterisation goldens of today's read-only projection (ADR 0002 step 1). Admission ordering is load-bearing: admit before model assertion, ephemeral authority assertion before admission.

2. Then only those residual responsibilities whose characterisation tests and callers are known. Nothing moves until its current callers in `fabric.ts` are enumerated and characterisation and recovery tests pin its behaviour. Import-boundary tests (F-033) precede extraction. Each move deletes the old path; no parallel second implementation.

   The **provider-action tranche** is the next structural one, not the first. It completes `provider-session-coordinator` into `providers/provider-action-service` and carries the coordinator's structural residuals below — concurrency queues, in-flight action ownership, reconciliation and the merged dispatch shape. These are provider-session and action-lifecycle responsibilities; folding them into the authority slice would merge two target modules the architecture deliberately keeps apart. Per ADR 0002 the merged `ProviderActionDispatchInputV1` contract shape lands only after the write pilot and the second provider (step 4).

3. Responsibilities with no live seam and no known caller set — workspace ownership and leases, lifecycle transition projection, verification and evidence, projections — stay behind the facade in `fabric.ts` until change pressure produces a seam. Opening an empty module for them is the scaffolding-first move ADR 0003 rejects.

The sections below are a residual-responsibility map, not a module inventory: what each live seam owns today, and what must still move to it.

### `runtime/agent-fabric/src/application/provider-session-coordinator.ts`

Owns today: registration preflight; provider action identity and dedupe; session target resolution; turn admission against the concurrency ceiling; steer binding; turn settlement; lifecycle-intent preparation, terminalisation, finalisation and recovery enumeration; model-routing and cross-family review evidence recording.

Residual still in `fabric.ts`, to move here in the **provider-action tranche** (extraction step 2, not the first slice — these are provider-session and action-lifecycle responsibilities, not the pure authority compiler):

- in-flight provider action ownership (`#ownedProviderActions`, `#lifecycleProviderActions`, `#activeProviderOperations`);
- the deferred-action queue, pump and backpressure timer (`#deferredProviderActions`, `#pumpDeferredProviderActions`), which today enforce the concurrency ceiling in a second place;
- provider action reconciliation with its replay and ownership branches (`reconcileProviderAction`, `#reconcileProviderAction`);
- the merged `ProviderActionDispatchInputV1` contract shape once the write-pilot steps land (ADR 0002 step 4; ADR 0003).

`#dispatchProviderAction` is a caller of both slices. The authority compiler leaves it as a call into `authority/authority-compiler`; the coordinator residuals above move out of it later. Do not conflate the two moves.

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
