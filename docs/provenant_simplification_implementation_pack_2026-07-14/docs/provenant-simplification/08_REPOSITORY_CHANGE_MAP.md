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
- repeated domain procedures;
- blanket review rules that the review planner now derives.

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

Delegate to kernel:

- transition validity;
- authority admission;
- review requirement;
- repair ceiling;
- final receipt validation;
- effect permission.

### `skills/deliver/`

Retain as the cross-domain lifecycle facade if current callers require it.

Shrink toward:

- create/load canonical run;
- request transitions;
- attach evidence;
- project status;
- close/terminalise.

Do not maintain a parallel lifecycle table.

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

Keep judgement methods and evidence contracts. Let the kernel decide when they are mandatory.

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

### `config/delivery-profiles.json`

Keep domain evidence minima. Do not encode full workflow recipes.

### `config/model-routing.json`

Use capability bands and runtime discovery. Keep dated model catalogues as explicit cache only.

### Adapter compatibility

Split:

- tracked portable compatibility policy;
- ignored local executable and capability attestation;
- project/user activation overlay.

No machine-local absolute paths or hashes in portable policy.

## 5. Protocol

`runtime/agent-fabric-protocol` should own:

- canonical run and WorkItem subcontracts;
- capability decision;
- optional work graph;
- review plan;
- effect proposal;
- event and receipt schemas;
- MCP projections.

Do not expose Fabric implementation internals.

## 6. Fabric

### Current hot path

Extract in this order:

1. authority compiler;
2. provider action admission/execution/reconciliation;
3. workspace ownership and leases;
4. lifecycle transition kernel;
5. verification/review/evidence;
6. effect proposal and execution ports;
7. projections.

Keep one process, one SQLite authority and explicit transactions.

### `runtime/agent-fabric/src/core/fabric.ts`

Reduce by vertical extraction, not mass relocation. Each extraction requires characterisation and fault tests and deletes the old path.

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

### Lifecycle validators

Replace duplicated transition tables with imports or generated artefacts from the canonical lifecycle kernel.

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
