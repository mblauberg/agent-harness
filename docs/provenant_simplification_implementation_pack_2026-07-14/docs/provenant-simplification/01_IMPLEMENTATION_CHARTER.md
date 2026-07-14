# Implementation charter

## 1. Objective

Create a maintainable, provider-neutral harness that remains useful as chair models improve.

Provenant should not compete with capable models at:

- understanding requirements;
- choosing exploration paths;
- decomposing work;
- selecting native workers;
- replanning after evidence;
- synthesising findings.

Provenant should remain authoritative at:

- permissions;
- workspace ownership;
- budgets;
- state validity;
- deterministic gates;
- evidence integrity;
- crash recovery;
- external effects.

## 2. Stable architectural principles

### One accountable chair

One primary owns:

- the human relationship;
- the canonical plan;
- decomposition;
- authority interpretation;
- integration;
- synthesis;
- escalation.

The other primary may challenge or review, but does not maintain a competing plan.

### Native orchestration first

Use Codex and Claude native capabilities for:

- subagent lifecycle;
- provider context isolation;
- provider-native worktrees;
- session continuity;
- compaction;
- model-specific permission controls;
- streamed events.

Fabric translates and records; it does not reproduce these mechanisms without a demonstrated gap.

### One writer per source surface

Parallelism is permitted only for:

- read-only exploration;
- independently valuable WorkItems;
- exact non-overlapping write scopes;
- artefact-only workers;
- patch-only workers with one serial applier.

### Deterministic checks before judgement

Compilers, tests, schemas, policy checks and static analysis run before model review. Model review handles residual judgement.

### Typed external effects

Agents propose exact effects. Trusted executors apply them after gates. No arbitrary shell vector, URL or credential-bearing environment is an effect payload.

### Evidence over narrative

Operational facts are recorded by the runtime. Agent explanations are summaries, not the authoritative ledger.

## 3. Complexity budget

A new mechanism may enter the stable kernel only when at least one condition is met:

1. It enforces a non-negotiable authority, security or integrity invariant.
2. It prevents an observed repeated failure.
3. It provides necessary crash recovery or ambiguity resolution.
4. It produces a measurable improvement in accepted outcomes, human attention or operational cost.
5. It is required by a named external consumer.

A proposal based only on hypothetical future flexibility is insufficient.

## 4. Least-powerful-mechanism rule

Use mechanisms in this order:

1. repository instruction or reference;
2. template;
3. deterministic script or validator;
4. provider-native configuration;
5. small kernel guard;
6. runtime module;
7. separate product or service.

Move down the list only when the previous mechanism cannot satisfy the invariant.

## 5. Skill admission rule

Do not add a top-level Skill unless it has:

- a distinct trigger;
- a clear nearest exclusion;
- unique authority or output semantics;
- a recurring use case;
- a verification method;
- evidence that composition with existing Skills is inadequate.

Prefer references, overlays and scripts.

## 6. Runtime abstraction rule

Do not add a new domain abstraction unless:

- at least two concrete use cases require it;
- the existing vertical path demonstrates the duplication or coupling;
- its public contract is smaller than the implementation it replaces;
- its deletion or replacement condition is known;
- architecture tests can enforce the boundary.

## 7. Compatibility rule

The repository is pre-release unless the live repository states otherwise.

Do not retain old and new implementations merely for theoretical compatibility. A compatibility layer requires:

- a named consumer;
- current usage evidence;
- an owner;
- a removal milestone;
- a deletion test;
- a documented operational cost.

## 8. Non-goals

This programme must not introduce:

- a universal workflow language;
- a required DAG for ordinary work;
- a second provider-neutral subagent scheduler;
- peer-to-peer autonomous swarms;
- microservices;
- full event sourcing for all state;
- an autonomous backlog controller before write execution is proven;
- automatic self-modification;
- mandatory Console usage;
- blanket cross-family review for all meaningful changes;
- provider model identities embedded in lifecycle policy;
- broad network access or release credentials in write-capable model sessions.

## 9. Deletion is a feature

Each work package must identify:

- duplicated logic to remove;
- temporary facades and their expiry;
- obsolete Skills or references;
- superseded specification text;
- stale configuration;
- tests that prove old paths are unreachable.

The target is reduced cognitive and operational surface, not only new capability.
