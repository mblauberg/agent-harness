# Agent Fabric refactor plan

## 1. Objective

Reduce change amplification and defect risk while preserving:

- one authoritative process;
- one SQLite/WAL store;
- current protocol operations;
- transaction and idempotency semantics;
- action reconciliation;
- capability and generation fencing;
- receipt compatibility during migration;
- existing tests and public behaviour.

This is a structural refactor plus the minimum new capability needed for write-enabled managed execution. It is not a distributed rewrite.

## 2. Current concentration

`src/core/fabric.ts` acts as:

- public façade;
- command dispatcher;
- transaction owner;
- principal/authority policy;
- task and team service;
- mailbox and lease service;
- provider action scheduler;
- provider adapter invoker;
- budget ledger;
- lifecycle/recovery coordinator;
- gate/barrier/evidence service;
- SQL store;
- event publisher;
- read projection builder.

The resulting risks are:

- every feature can touch the same file;
- policy and persistence are hard to test independently;
- merge conflicts and context load increase;
- provider changes can affect unrelated lifecycle paths;
- reviewers cannot establish local invariants quickly;
- extraction becomes harder with every additional operation.

## 3. Refactor principles

1. **One transaction, explicit owner.** Splitting files must not create hidden cross-transaction workflows.
2. **Deep modules.** Fewer strong interfaces are preferable to many anaemic services.
3. **Use-case-shaped stores.** Avoid generic repositories and generic “manager” classes.
4. **Commands and events.** Commands request state changes; events describe committed facts.
5. **No provider SDK types in domain/application modules.**
6. **No SQL in Console, adapters or protocol.**
7. **No external effect in an ordinary domain handler.**
8. **Characterise before moving.**
9. **Direct cutover inside the pre-release codebase.**
10. **Delete the compatibility façade at the end.**

## 4. Target command architecture

```ts
type CommandContext = {
  principal: AuthenticatedPrincipal;
  now: Instant;
  correlationId: string;
};

interface CommandHandler<C, R> {
  execute(command: C, context: CommandContext, uow: UnitOfWork): Promise<R>;
}
```

`UnitOfWork` owns:

- one `better-sqlite3` transaction;
- command idempotency journal;
- stores;
- event buffer;
- commit/rollback;
- post-commit dispatch of non-authoritative notifications.

Provider calls require a deliberate pattern because they cross the transaction boundary:

```text
transaction 1: validate + reserve + persist prepared action
external call: provider adapter
transaction 2: reconcile terminal/ambiguous result + settle budget
```

This pattern already exists conceptually. Extraction should make it explicit and reusable.

## 5. Proposed modules and commands

### Identity/session

Commands:

- create project session;
- create/rotate/handoff chair;
- register/suspend/retire agent;
- provision/revoke seat generation.

Stores:

- project sessions;
- runs;
- principals/agents;
- credentials/seats.

### Authority/budget

Commands:

- create/delegate/revoke authority;
- reserve/settle budget;
- compile capability profile;
- validate operation scope.

Stores:

- authority;
- budget reservations/settlements;
- policy decisions.

### Work/topology

Commands:

- create/claim/split/complete/cancel task;
- add/remove participant;
- create/modify team;
- acquire/release write lease;
- bind worktree.

Stores:

- tasks;
- participants;
- teams;
- leases;
- workspaces.

### Providers

Commands:

- start/attach/resume session;
- dispatch/steer/interrupt action;
- lookup/reconcile/quarantine/release;
- recover session;
- attest continuity.

Stores:

- provider sessions;
- provider actions;
- adapter capability attestations.

### Coordination

Commands:

- send/claim/acknowledge message;
- open/close stage;
- create/close barrier;
- create/acknowledge hand-off.

Stores:

- mailboxes/deliveries;
- stages/barriers;
- hand-offs/checkpoints.

### Assurance

Commands:

- register artefact;
- record objective check;
- open/resolve/defer gate;
- record review/finding/adjudication;
- export/verify receipt.

Stores:

- artefacts;
- checks;
- gates;
- reviews/findings;
- receipts.

### Effects

Commands:

- propose effect;
- validate effect;
- approve effect;
- execute/reconcile effect.

Stores:

- effect proposals/actions;
- registered targets;
- executor receipts.

### Lifecycle/maintenance

Commands:

- compact/rotate session;
- recover run;
- preview/apply retention;
- archive;
- close run.

Stores:

- lifecycle checkpoints;
- retention/hold records;
- archives.

## 6. First extraction: provider actions and authority profiles

This should be first because it has high leverage and a clean external seam.

### Step 1 — Characterisation

Freeze tests for:

- action identity and replay;
- task binding;
- agent/task membership;
- run accepting work;
- delegated ephemeral authority;
- model/family validation;
- budget reservation/settlement;
- adapter capability checks;
- terminal/ambiguous/quarantined states;
- recovery and lookup;
- receipt/event fields;
- current read-only settings.

Add negative fixtures for:

- workspace escape;
- profile escalation;
- unsupported provider capability;
- sibling task/worktree access;
- network use under offline profile;
- direct external effect.

### Step 2 — Introduce policy types

- `CapabilityProfile`
- `CapabilityRequest`
- `CapabilityDecision`
- `AuthorityCompiler`
- `ProviderPermissionCompiler`
- `WorkspaceBinding`

Current behaviour becomes `review-readonly`.

### Step 3 — Extract stores

- `ProviderActionStore`
- `ProviderSessionStore`
- `AuthorityStore`
- `BudgetStore`
- `TaskMembershipReader`

Do not expose raw database handles.

### Step 4 — Extract handler

`DispatchProviderActionHandler` coordinates:

1. principal/task checks;
2. capability compilation;
3. identity digest;
4. action preparation;
5. provider call;
6. reconciliation;
7. budget settlement;
8. events/receipt.

### Step 5 — Add write profile

`workspace-write-offline`:

- exact canonical worktree;
- one owner generation;
- no network;
- provider-native shell/edit tools;
- test command allow policy if required;
- external-effect tools absent;
- no arbitrary additional directory.

### Step 6 — Migrate façade

`Fabric.dispatchProviderAction` delegates to the handler without behaviour branching. Delete old private helpers once all tests pass.

## 7. Subsequent extraction order

1. authority/budget;
2. tasks/teams/leases;
3. assurance/gates/barriers;
4. messages/handoffs;
5. identity/session;
6. lifecycle/recovery/retention;
7. projections;
8. effects/Git unification.

Choose the next slice by:

- rate of change;
- defect history;
- interface clarity;
- test oracle;
- reduction in Fabric dependencies.

## 8. Database strategy

Keep the current baseline/cutover discipline.

Improvements:

- migration metadata should identify policy/protocol compatibility;
- focused stores own prepared statements;
- schema tests map tables/triggers/indexes to module ownership;
- destructive schema changes use direct pre-release cutover unless a real consumer requires migration;
- provider/session/effect state transitions remain database-constrained where practical;
- projection tables can be rebuilt or verified.

Avoid:

- ORM migration solely for aesthetics;
- generic unit-of-work repositories;
- dual schemas;
- event-sourcing every table;
- network database before multi-host need exists.

## 9. Public API strategy

Current root exports should be classified:

| Class | Treatment |
|---|---|
| supported runtime/client | keep at root |
| protocol types | re-export from protocol or explicit subpath |
| adapter implementation | adapter package/subpath |
| operator Git/effect internals | explicit supported port or internal |
| Herdr integration | Herdr package |
| test/conformance helpers | testing subpath |
| domain internals | internal |

Add an API snapshot. Breaking changes are acceptable pre-release, but they should be intentional.

## 10. Architecture tests

Examples:

- protocol imports no Fabric/runtime package;
- Fabric domain modules import no adapter SDK;
- adapters import protocol/ports, not Fabric stores;
- Console core imports protocol only;
- CLI composition may import Fabric implementation;
- effect executors cannot be imported by model-facing domain code;
- SQL files/stores live only in persistence/application modules;
- no new import of `core/fabric.ts` from internal modules;
- no cyclic package dependencies.

## 11. Test strategy

### Contract

- protocol codecs and operations;
- provider adapter conformance;
- authority profile compilation;
- effect proposal/executor;
- projection freshness.

### Property/model

- lease/task ownership invariants;
- authority subset relationships;
- action state machine;
- budget conservation;
- retry/reconciliation;
- retention protection.

### Fault injection

- process loss before/after provider dispatch;
- malformed provider response;
- database busy/unclean;
- socket loss;
- stale generation;
- duplicate command;
- event publication failure after commit;
- effect timeout/ambiguous result.

### Performance

- command latency under realistic run/task/event counts;
- Console projection time;
- event replay;
- provider-action recovery;
- database file growth and retention.

## 12. Completion criteria

- `Fabric` is a small façade/composition root or removed.
- No core file combines unrelated SQL, provider SDK and rendering.
- Write profiles are safe and tested.
- One transactional authority remains.
- Public protocol and receipts are coherent.
- Recovery and ambiguity tests pass.
- Architecture boundaries are enforced.
- The compatibility façade and obsolete helpers are deleted.
