# Implementation seeds (advisory fragments)

Provenance: selective fragments extracted from
`docs/agent-harness-comprehensive-review/{target-architecture.md,fabric-refactor-plan.md,tooling-installation-security.md,agentic-sdlc-operating-model.md}`
before that directory's deletion. The pack deliberately chooses a **thinner**
path than those documents, so their bulk is intentionally not adopted. These are
the concrete tables/lists the pack states only at principle level.

**Each fragment below is an implementation seed: advisory only, and activated
only when its owning work package begins.** Reconcile against current source
before use; do not treat any file path, line number or module name as
authoritative without re-verification.

## 1. Fabric internal module map (seed — activate when Fabric modularisation is scheduled)

Owner when active: `02_TARGET_ARCHITECTURE.md`, `08_REPOSITORY_CHANGE_MAP.md`.
Concrete internal module tree (from `target-architecture.md` §4):

```text
packages/fabric/src/
  runtime/
    fabric-runtime.ts          # composition root only
    unit-of-work.ts
    command-dispatcher.ts
    event-publisher.ts
  identity/
    commands/
    policies/
    stores/
  authority/
    authority-compiler.ts
    capability-profile.ts
    budget-policy.ts
    stores/
  work/
    task-service.ts
    topology-service.ts
    ownership-policy.ts
    lease-service.ts
    stores/
  providers/
    provider-action-service.ts
    provider-session-service.ts
    reconciliation-service.ts
    ports.ts
    stores/
  coordination/
    mailbox-service.ts
    barrier-service.ts
    stores/
  assurance/
    evidence-service.ts
    gate-service.ts
    review-service.ts
    receipt-service.ts
    stores/
  effects/
    effect-proposal-service.ts
    git-effect-executor.ts
    external-effect-ports.ts
    stores/
  lifecycle/
    lifecycle-engine.ts
    recovery-service.ts
    retention-service.ts
  projections/
    project-view.ts
    run-view.ts
    attention-view.ts
    event-replay.ts
```

Module rules (from `target-architecture.md` §4):

- Domain modules may depend on shared value types and ports, not on the Console,
  CLI or provider SDK packages.
- Provider adapters may depend on the protocol and provider SDK, not on Fabric
  stores.
- Command handlers own transaction boundaries through `UnitOfWork`.
- Stores expose use-case-shaped methods, not a generic CRUD interface.
- Cross-module transitions occur through application commands and events.
- Projection rebuild must be possible from canonical tables/events or a verified
  snapshot.
- External effects are not performed inside arbitrary command handlers.
- The compatibility façade delegates to handlers and is deleted when internal
  callers migrate.

## 2. Architecture-test list (seed — activate with F-033 / boundary enforcement)

From `fabric-refactor-plan.md` §10:

- protocol imports no Fabric/runtime package;
- Fabric domain modules import no adapter SDK;
- adapters import protocol/ports, not Fabric stores;
- Console core imports protocol only;
- CLI composition may import Fabric implementation;
- effect executors cannot be imported by model-facing domain code;
- SQL files/stores live only in persistence/application modules;
- no new import of `core/fabric.ts` from internal modules;
- no cyclic package dependencies.

## 3. Security-evidence status taxonomy (seed — sharpens F-007; activate with security-evidence work)

From `tooling-installation-security.md` §7. The catalogue should record each
declared check with an explicit implementation status:

```yaml
checks:
  secrets-scan:
    status: implemented
    command: ...
    version: ...
  sast-typescript:
    status: implemented
  prompt-injection-tests:
    status: project-provided
  provenance:
    status: release-only
  licence:
    status: implemented
```

Statuses:

- implemented;
- project-provided;
- external-manual;
- unavailable;
- not-applicable.

**A required `unavailable` check blocks or triggers an explicit accepted-risk
gate.** A receipt cannot claim a declared check unless an implementation or
external evidence source, version, scope and result are recorded.

## 4. Portable-vs-local configuration hierarchy (seed — sharpens F-003 / D-015; activate with config split)

From `tooling-installation-security.md` §5. Layer precedence (later layers may
narrow; only explicit human authority may broaden):

```text
portable defaults
  < user policy overlay
  < project policy overlay
  < approved run envelope
  < task delegation
  < provider capability intersection
```

File layout:

```text
config/
  adapters/catalog.yaml        # portable
  models/intents.yaml          # portable intent bands
  policies/*.yaml              # portable
.agent/local/
  adapters/*.attestation.json  # machine-local, gitignored
  activation.yaml              # user/project local
```

Machine facts (local, gitignored): absolute executable; digest; version;
platform/architecture; observed capabilities; smoke result; observed
time/expiry.

Portable facts (tracked): adapter ID/protocol; expected capability schema;
supported/tested version range; policy constraints; support level.

## 5. Backlog stop-states (seed — activate with backlog controller, ADR-0006)

From `agentic-sdlc-operating-model.md` §11. Terminal states for a backlog claim:

- done;
- retired;
- expired;
- blocked-external;
- paused-decision;
- paused-budget;
- failed-invariant;
- quarantined.

The queue never interprets silence as approval.

## 6. Handoff schema (seed — activate for fresh-session/handoff tooling)

From `agentic-sdlc-operating-model.md` §10. A fresh session verifies the digest
and environment before acting:

```yaml
outcome:
non_goals: []
authority:
  approval_digest:
  expires_at:
decisions:
  accepted: []
  rejected: []
state:
  run_id:
  tasks: []
evidence:
  canonical_paths: []
  receipts: []
risks: []
open_decisions: []
next:
  action:
  verification:
provider_continuity:
  references: []
```
