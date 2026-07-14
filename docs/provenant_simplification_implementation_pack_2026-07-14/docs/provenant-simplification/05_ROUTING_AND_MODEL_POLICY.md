# Routing and model policy

## 1. Chair-first routing

The chair is the primary workflow engine.

Routing proceeds:

1. deterministic explicit command or tracker state;
2. deterministic readiness and authority checks;
3. model judgement for ambiguity;
4. kernel validation of the proposed route.

Routes:

- `advise`;
- `scope`;
- `implement`;
- `review`;
- `effect`;
- `stop/escalate`.

Classification never grants authority.

## 2. Readiness

A tracker item routes to implementation only when it has:

- objective;
- non-goals;
- acceptance criteria;
- verification strategy;
- risk and authority request;
- dependency state;
- governing scope or decision digest;
- no unresolved material ambiguity.

Otherwise it routes to scope.

## 3. Model roles

Core policy uses capability roles:

| Role | Purpose |
|---|---|
| `chair` | Decomposition, planning, synthesis, human dialogue |
| `fast-read-worker` | Search, extraction, inventory and bounded repository exploration |
| `deep-reasoning-worker` | Difficult diagnosis, architecture or weak-oracle analysis |
| `implementation-worker` | Bounded source mutation |
| `independent-reviewer` | Fresh-context judgement |
| `security-reviewer` | Authority, injection, containment and effect analysis |
| `mechanical-worker` | Schema, formatting, simple migrations and deterministic tasks |

Runtime discovery resolves roles to current models and effort settings.

This table is **target vocabulary**, not a description of the live mechanism.
The current `config/model-routing.json` and `scripts/model-route` use the
aliases `flagship`/`workhorse`/`scout` plus `lead`/`orchestrator` roles.
Mapping during migration: `chair` ≈ `flagship` at `lead`/`orchestrator`;
`fast-read-worker`/`mechanical-worker` ≈ `scout`; `implementation-worker` ≈
`workhorse`; `deep-reasoning-worker`/`independent-reviewer`/`security-reviewer`
≈ `flagship` or `workhorse` selected by risk and oracle strength.

## 4. No model IDs in lifecycle policy

Model IDs belong in:

- runtime capability discovery;
- local routing data;
- provider compatibility attestations;
- run receipts.

Skills and lifecycle policy should not assume specific current model names.

## 5. Worker-selection principles

Use a worker only when:

- the output is independently useful;
- the task has a bounded return contract;
- the worker has exact authority;
- coordination cost is justified;
- the chair can verify or reduce the output.

Good worker tasks:

- repository inventory;
- dependency-cone exploration;
- test-failure clustering;
- documentation drift comparison;
- independent design alternatives;
- independent review;
- isolated WorkItem implementation.

Poor worker tasks:

- tightly coupled debugging across shared state;
- several agents editing the same files;
- serial decisions with heavy intermediate context;
- work without an oracle;
- speculative fan-out.

## 6. Native agents first

Use provider-native subagents before:

- shelling out to another instance of the same provider;
- maintaining custom transcript polling;
- constructing a generic internal worker runtime.

Cross-primary work should use the approved durable provider bridge or adapter. Direct CLI calls remain preflight or recorded degraded fallback.

## 7. Parallelism gate

Parallel execution requires:

- decomposable work;
- non-overlapping writes or read-only work;
- explicit dependencies;
- independently checkable outputs;
- one chair and integrator;
- bounded fan-out;
- expected information gain greater than coordination cost.

When uncertain, remain serial.

## 8. Dynamic replanning

The chair may revise:

- sequence;
- worker count;
- model role;
- exploration strategy;
- verification detail;
- review lenses.

The chair may not revise without approval:

- objective;
- material acceptance criteria;
- risk floor;
- write or disclosure authority;
- external-effect ceiling;
- one-way-door decisions.

"Approval" here is resolved by the governing authority model. Under the active
autonomous chair charter (D-021; see `24_AUTONOMOUS_CHARTER.md` and
`docs/efforts/EFFORT-capability-profiles.md`), several of these gates are
LLM-resolved with PR review as the single human gate. Whether that charter
carries over to this programme is an open human decision recorded in
`15_DECISION_REGISTER.md`; until ruled, apply the stricter reading.

Material plan changes are recorded; ordinary internal reasoning is not.

## 9. Fallback

Every workflow must degrade to:

```text
one chair
→ one workspace
→ deterministic checks
→ evidence summary
→ optional effect proposal
```

Provider or worker unavailability must not force a different authority model.

## 10. Routing calibration

Record:

- task class;
- selected role/model/effort;
- latency and cost;
- outcome;
- review yield;
- retries;
- human interventions;
- degradation.

Use these data to improve replaceable routing policy. Do not create a self-modifying router in the first programme.
