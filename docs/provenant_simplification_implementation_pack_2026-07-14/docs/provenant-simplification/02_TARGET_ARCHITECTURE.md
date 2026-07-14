# Target architecture

## 1. Architectural thesis

Provenant becomes a **local-first invariant kernel** around provider-native chairs and workers.

```text
Human request / tracker WorkItem
                │
                ▼
        Capable primary chair
  understand · plan · delegate · replan
                │
     provider-native agents and tools
                │
                ▼
        Provenant invariant kernel
 authority · ownership · budgets · gates
 evidence · recovery · typed effects
                │
                ▼
 verified artefact / decision / effect proposal
                │
                ▼
       human acceptance or authorisation
```

## 2. Responsibility split

### Chair

The chair owns:

- interpreting the request;
- deciding `advise`, `scope`, `implement`, `review` or `effect`;
- repository exploration strategy;
- task decomposition;
- choosing serial versus parallel execution;
- selecting provider-native workers;
- selecting model capability bands;
- replanning within authority;
- synthesis and human communication.

### Invariant kernel

The kernel owns six capabilities:

1. **Authority**
   - human-approved envelope;
   - capability compilation;
   - expiry and revocation;
   - disclosure and network policy;
   - provider-native effective settings.

2. **Ownership**
   - exact repository and workspace identity;
   - source-surface write leases;
   - non-overlap checks;
   - integration ownership.

3. **Run ledger**
   - objective and acceptance criteria;
   - status and checkpoint;
   - participants and provider lineage;
   - budgets and material decisions.

4. **Gates**
   - readiness;
   - lifecycle transition guards;
   - deterministic verification;
   - loop ceilings;
   - required review and human gates.

5. **Evidence**
   - action and artefact digests;
   - checks and results;
   - review identity and independence;
   - cost, time and failures;
   - retained receipts.

6. **Effects**
   - exact effect proposals;
   - approval;
   - minimum-credential execution;
   - idempotency and reconciliation;
   - observation and rollback evidence.

### Provider adapters

Adapters own:

- provider capability discovery;
- conversion of neutral capability decisions into native settings;
- native session start, resume and stop;
- event normalisation;
- native agent lineage;
- conformance tests;
- provider-specific error mapping.

Adapters do not own:

- lifecycle policy;
- task decomposition;
- review policy;
- project state;
- external-effect authority.

### Presentation

CLI, Console, Herdr and native provider UIs are projections. None is authoritative for run state or completion.

## 3. Progressive execution shapes

### Shape A — advisory

```text
request → chair response
```

No delivery run unless an external action, durable artefact or substantial evidence obligation emerges.

### Shape B — routine serial

```text
request → minimal run envelope → one chair/workspace → checks → result
```

No task graph. Review is optional and policy-derived.

### Shape C — substantial serial

```text
approved WorkItem → persisted run → one writer → verify → review → PR proposal
```

### Shape D — parallel initiative

```text
approved Initiative
  ├─ WorkItem A → worktree A → PR A
  ├─ WorkItem B → worktree B → PR B
  └─ integration barrier / owner
```

Only independent WorkItems run concurrently.

### Shape E — crucial or external effect

Adds:

- stronger containment;
- specialist or other-primary review;
- explicit human gates;
- typed effect executor;
- observation and recovery.

## 4. No universal workflow engine

The kernel does not need to know every exploration or coding step.

It needs to know:

- the current lifecycle state;
- the current owner;
- effective authority;
- what evidence is required before the next state;
- whether the budget and loop policy permit continuation;
- whether an external effect may occur.

Detailed working plans may remain in the provider session for simple work. They become durable only where needed for:

- multi-agent coordination;
- cross-session recovery;
- parallel WorkItems;
- long-running work;
- human decision boundaries.

## 5. Optional work graph

A work graph is an escalation mechanism, not the default.

Use it when:

- more than one source owner is required;
- independent WorkItems exist;
- dependencies or barriers matter;
- the run spans sessions or providers;
- recovery requires explicit task state.

The graph contains semantic tasks, not every tool call.

## 6. Recommended runtime modules

Retain one process and one database. Extract only the proven hot path:

```text
runtime/
  authority/
    authority-compiler
    capability-policy
  work/
    workspace-ownership
    leases
    optional-work-graph
  providers/
    provider-action-service
    provider-session-ports
  assurance/
    lifecycle-kernel
    verification-service
    review-planner
    evidence-service
  effects/
    effect-proposal
    effect-executor-ports
    reconciliation
  projections/
    status
    attention
    evidence
```

A small composition root wires modules and database transactions.

## 7. Stable provider-neutral concepts

Core policy uses capability labels such as:

- `chair`;
- `fast-read-worker`;
- `deep-reasoning-worker`;
- `independent-reviewer`;
- `security-reviewer`;
- `long-context`;
- `vision-capable`;
- `workspace-write-offline`.

Model IDs remain in runtime discovery or replaceable routing data.

## 8. Architectural invariant

Increasing model capability should allow deletion or demotion of:

- planning scaffolds;
- routing heuristics;
- orchestration scripts;
- worker role templates;
- review prompts.

It must not require replacement of:

- authority;
- ownership;
- deterministic gates;
- evidence;
- recovery;
- effects.
