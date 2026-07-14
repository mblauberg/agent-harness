# Project Fabric Console scope and projections

## Decision and ownership

Build a project-scoped operator Console as a separate executable package over
the shared agent fabric. The Console is the human's primary local view of
project state, active runs, agents, evidence and decisions. It may initiate
explicitly requested project sessions and typed operator actions, but it is not
another task orchestrator or authority store.

- The [Agent Fabric contracts](../agent-fabric/scope-and-invariants.md) remain the coordination, authority and provider-session owner.
  Their project-session clauses own project-session entities,
  operator principals, scoped gates, result-delivery state and atomic
  request/reply/task completion.
- The [harness lifecycle contract](../harness/lifecycle.md) remains the adaptive harness and delivery-lifecycle owner.
- The [activation contract](../agent-fabric/activation.md) remains the model-adapter activation and Herdr observation owner.
- The [operational-hardening contracts](../agent-fabric/architecture-assurance.md) remain the protocol, persistence, trust and operational-hardening
  contract. Its daemon clauses own lock-safe on-demand bootstrap, global
  daemon liveness/stop predicates, persistence migration and crash recovery.
- This spec owns the project Console, operator projection, adaptive session
  launch, human-attention workflow, Herdr control integration and optional Git
  and GitHub operator adapters.

The linked Agent Fabric and operational-hardening owners shall be current and
accepted before implementation can claim this specification complete. Product
requirements remain here; transaction, schema and daemon invariants remain
with their existing canonical owners.

This is a pre-release implementation. The Console requires its exact current
project/run/session projection and evidence-review features. It presents a
typed protocol/schema cutover-required state for an obsolete daemon or
database; it shall not retry a vintage profile, translate legacy projection
shapes or infer/import a session from an old run. The runtime leaves rejected
state untouched. Fabric receipt schema version 2 is likewise the sole current
receipt; no v1 decoder/import/projection is retained. Current independently
optional integrations remain negotiated and visibly unavailable when absent.

The Console is local and project-scoped. GitHub is an optional project adapter,
not a prerequisite or authority store. No browser application is included in
this scope. A later client may consume the same operator API only if evidence
shows that the TUI cannot provide an acceptable operator experience.

## Outcome

Give one human a concise, continuously current control surface from which they
can understand a project's position, see what requires judgement, start and
observe agent work, review artifacts, respond naturally or through typed
actions, and operate routine Git workflows. Agents retain autonomy over
decomposition, topology, routing and replanning inside a broad approved project
envelope.

The design optimises human attention rather than maximising approval events.
Google's agentic architecture guidance distinguishes dynamic orchestration,
where agents plan and delegate, from human checkpoints for
subjective, high-stakes or final decisions. This Console applies that split:
routine work continues autonomously; only affected dependency subtrees wait at
genuine human gates.

Sources:

- [The New SDLC With Vibe Coding](https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding)
- [Google Cloud: choose a design pattern for an agentic AI system](https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system)

## System boundary

```text
project artifacts + Git/GitHub + Herdr + Fabric
                         |
                 operator projection
                         |
             agent-fabric-console (TUI)
                         |
           typed, revision-bound commands
                         |
                Fabric transaction owner
```

### Canonical owners

| Concern | Canonical owner |
| --- | --- |
| Approved intent and one-way decisions | Project specs and ADRs |
| Delivery lifecycle, evidence and acceptance | `.agent-run/<run>/RUN.json` |
| Project-session lifecycle, live tasks, agents, messages, leases and operational gates | Fabric SQLite through the daemon |
| Coordination evidence | Fabric receipt |
| Repository state | Git |
| Hosted collaboration | Optional GitHub adapter |
| Pane placement, process presence and visibility | Herdr |
| Human projection and commands | Console; never canonical state |

The Console shall never write SQLite directly or infer task completion from a
pane. It shall use a distinct authenticated human-operator principal, never a
chair or agent identity. Its independently revocable capability shall separate
read, decide, steer, pause, cancel, launch, takeover and external-effect
actions, bind the exact project and generation, and expire no later than the
project session. A takeover grant also binds the handoff digest, expected chair
generation and compare-and-set revision. It
shall label every projected fact with source, revision and freshness: `live`,
`snapshot`, `stale`, `unavailable` or `conflict`.

### Package and process boundary

The implementation shall preserve these independently versioned seams:

```text
agent-fabric-protocol   shared schemas and typed clients
agent-fabric-daemon     coordination authority and persistence
agent-fabric-console    standalone operator TUI
agent-fabric-herdr      thin Herdr control and presence adapter
```

They may remain in one repository for atomic compatibility tests. The Console
shall communicate through public protocol clients and shall not import daemon
internals. It shall run in any terminal; Herdr integration is optional.
