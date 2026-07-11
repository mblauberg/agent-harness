# Comprehensive review of `mblauberg/agent-harness`

> Historical snapshot: reviewed on 11 July 2026 at commit `2e7770f`.
> Operational claims do not describe the current tree. See the
> [historical `f7a3240` adjudication](gpt-sol-pro-review-adjudication.md) and the
> [implemented operational-hardening specification](../specs/04-agent-fabric-operational-hardening.md)
> for the post-`9f8abce` disposition. The generating model and reasoning mode
> were not recorded, so the filename is not model provenance.

I reviewed the repository on `main` at commit `2e7770fc31fe3d9fa725392fe2b1e87de38d9e38`, covering the fabric runtime, database schema, provider adapters, MCP façade, model routing, skills, installation scripts, security checks, tests, CI, documentation and operational runbooks.

This was a **static source and architecture review through GitHub**. I did not execute the repository, run its tests, authenticate with providers or exercise the live daemon. Accordingly, I distinguish implemented code from behaviour that remains unverified in a live Claude–Codex environment.

## Executive assessment

The repository has an unusually mature conceptual architecture. It treats multi-agent orchestration as a coordination, authority and recovery problem rather than as a collection of prompts. The strongest design elements are:

* durable per-recipient mailboxes;
* explicit task and write authority;
* generation-fenced leases;
* provider-side-effect reconciliation;
* separation of coordination state from project artefacts;
* honest treatment of interactive-session limitations;
* provider-neutral MCP access;
* bounded hierarchy and delegation;
* strong specification and skill-governance discipline.

The principal concern is a significant gap between **architectural completeness**, **test-fixture completeness** and **operational completeness**.

The coordination kernel appears credible. The real provider runtime is not yet operationally proven: every real adapter remains disabled, the compatibility pins remain unresolved, Herdr has no production bridge, and the GitHub workflow does not compile or test the TypeScript fabric at all. The runtime README nevertheless states that Stages 1–5 are implemented and describes an active local daemon and global MCP registrations.

My overall recommendation is:

> **Preserve the core architecture, pause provider and hierarchy expansion, harden and refactor the coordination kernel, and prove one live Claude–Codex paired-primary path end to end before adding further adapters or deeper teams.**

## Maturity assessment

| Area                                | Assessment                                                         |
| ----------------------------------- | ------------------------------------------------------------------ |
| Conceptual architecture             | Strong                                                             |
| Authority, lease and mailbox design | Strong                                                             |
| Coordination kernel                 | Credible beta-quality implementation                               |
| Claude–Codex provider integration   | Pre-operational                                                    |
| Herdr integration                   | Prototype abstraction, not production integration                  |
| Skills architecture                 | Strong governance; limited behavioural evidence                    |
| Model routing                       | Auditable but narrow and duplicated                                |
| Database durability                 | Good initial settings; incomplete integrity and lifecycle controls |
| Transport security                  | Appropriate local-only direction; insufficient resource bounding   |
| CI and release assurance            | Materially inadequate for the runtime’s criticality                |
| Long-term maintainability           | Achievable after modularisation and protocol consolidation         |

---

# 1. Preserve the fundamental architecture

Several architectural decisions are correct and should remain stable.

## 1.1 Keep the fabric independent of Claude Code and Codex

Claude Code or Codex should be able to chair a run, but neither provider should own the fabric’s durable state. Your current architecture correctly places the daemon and SQLite store beneath both primary clients:

```text
Human
  │
  ▼
Claude Code or Codex chair
  │
  ▼
Shared MCP façade
  │
  ▼
Fabric daemon
  ├── tasks and authority
  ├── mailboxes
  ├── leases
  ├── lifecycle
  ├── action reconciliation
  └── receipts
```

That arrangement aligns with MCP’s architecture: the host is responsible for orchestration, lifecycle, security policy and user authorisation, while individual servers expose focused capabilities. MCP also expects explicit capability negotiation and separation between server connections. ([Model Context Protocol][1])

## 1.2 Keep MCP as the client façade, not the internal source of truth

MCP is appropriate for making the fabric accessible to Claude Code, Codex and other hosts. It should not define the full internal coordination model.

Your internal protocol needs concepts MCP does not provide directly:

* durable task ownership;
* write-scope leases;
* provider-action journals;
* budget reservations;
* barrier closure;
* checkpointed session rotation;
* authority containment;
* per-recipient delivery semantics.

Continue treating MCP as an adapter over the fabric’s application services.

A2A may eventually be useful at an external interoperability boundary. Its scope is agent discovery, task-oriented peer communication, messages, artefacts, streaming and task updates, whereas MCP focuses on connecting agents to tools and resources. The A2A specification explicitly describes the two as complementary. ([A2A Protocol][2])

Do not replace your internal fabric protocol with A2A at this stage. An optional A2A gateway could later expose selected fabric-managed agents to remote or independently operated agents.

## 1.3 Keep project artefacts outside SQLite

SQLite should remain the authority for coordination state. Git, project files, reports, checkpoints and verification evidence should remain the authority for work products.

That separation protects against:

* the database becoming a second source-code repository;
* complete model transcripts becoming project truth;
* provider-session deletion destroying project knowledge;
* coordination schema migrations affecting substantive artefacts.

## 1.4 Keep Herdr non-authoritative

The principle that Herdr owns visibility rather than authority is correct.

Herdr should display and facilitate intervention. It should not decide:

* who owns a task;
* whether a message was consumed;
* whether a provider turn completed;
* whether a write lease exists;
* whether a barrier can close.

---

# 2. Correct the operational status model

The current documentation overstates readiness.

The runtime README states that Stages 1–5 are implemented, that a coordination daemon is active and that MCP is registered globally for several clients. In the same paragraph, it acknowledges that real provider adapters are disabled.

The development section further confirms that normal tests rely on temporary databases and fake provider boundaries rather than live providers.

The compatibility registry records disabled or unresolved status for the primary integrations. For example, the Claude adapter is disabled and carries unresolved wrapper and compatibility requirements, while the Codex adapter also remains disabled with unresolved protocol pinning.

## Recommended conformance vocabulary

Replace the binary idea of “implemented” with explicit maturity states:

```yaml
conformance_status:
  specified:
    meaning: normative requirements exist

  core_implemented:
    meaning: domain and persistence code exists

  fake_conformant:
    meaning: deterministic fixtures pass the adapter contract

  live_smoke_validated:
    meaning: an authenticated provider smoke test has passed

  operationally_enabled:
    meaning: compatible version is pinned and explicitly activated

  production_conformant:
    meaning: recovery, security, load and lifecycle gates pass
```

Apply this status independently to each subsystem and adapter.

For example:

```yaml
claude_adapter:
  contract: implemented
  fake_conformance: passed
  live_smoke: not_verified
  compatibility_pin: unresolved
  enabled: false

codex_adapter:
  contract: implemented
  fake_conformance: passed
  live_smoke: not_verified
  generated_schema: pending
  enabled: false

herdr_bridge:
  interface: implemented
  acceptance_fixtures: passed
  production_bridge: absent
  enabled: false
```

A more accurate repository status would currently be:

> Stages 1–2 coordination capabilities and Stage 3–5 contract fixtures are implemented. Live Claude–Codex and Herdr operational conformance remains pending.

That wording improves trust without diminishing the substantial work already completed.

---

# 3. Make the fabric part of CI immediately

This is the most important release blocker.

The GitHub workflow currently runs one Python-oriented harness job. It checks out the repository, installs `pytest` and `pyyaml`, and runs `scripts/check-harness`. It does not install Node dependencies or exercise the fabric package.

The fabric package itself defines typechecking, Vitest, evaluation, load and build scripts, but none of them are invoked by GitHub Actions.

This means the largest, most stateful and security-sensitive subsystem can break while the public CI remains green.

## Required CI structure

### Required on every pull request

```text
harness-python
  ├── Python syntax and unit tests
  ├── skill structural checks
  ├── configuration validation
  └── documentation checks

fabric-static
  ├── npm ci
  ├── TypeScript typecheck
  ├── lint
  ├── schema generation drift check
  └── build

fabric-tests
  ├── unit tests
  ├── integration tests
  ├── Stage 1–3 acceptance tests
  ├── migration tests
  └── daemon restart tests

security
  ├── secret scanning
  ├── dependency review
  ├── TypeScript/Python static analysis
  ├── ShellCheck
  └── SBOM generation
```

### Nightly or manually triggered

```text
fabric-load
  ├── concurrent mailbox load
  ├── historical-database load
  ├── WAL checkpoint behaviour
  ├── adapter event flood
  └── long-running soak

provider-smoke
  ├── Claude opt-in authenticated smoke
  ├── Codex opt-in authenticated smoke
  └── Herdr opt-in bridge smoke
```

Live-provider tests should remain opt-in because they require authentication and consume provider quotas. They should still become mandatory evidence before an adapter moves to `operationally_enabled`.

## Additional repository controls

Add:

* branch protection;
* required status checks;
* `CODEOWNERS` for fabric, security, routing and migrations;
* pull-request templates requiring test and migration evidence;
* issue templates for protocol, adapter and security defects;
* dependency automation;
* read-only default workflow token permissions;
* GitHub Action references pinned to immutable commit SHAs.

OpenSSF Scorecard treats branch protection, code review and safe workflows as high- or critical-risk controls, and separately evaluates pinned dependencies and workflow token permissions. ([OpenSSF Scorecard][3])

---

# 4. Refactor the fabric without losing transactionality

The central `Fabric` class currently owns or coordinates:

* database startup;
* authority canonicalisation;
* capability handling;
* run management;
* agents;
* tasks;
* mailboxes;
* leases;
* artefacts;
* barriers;
* budgets;
* teams;
* lifecycle;
* provider actions;
* receipts;
* adapter supervision;
* provider-session coordination.

Its constructor alone composes database access, read policy, command journal, adapter supervision and provider-session control.

The problem is not simply file length. The deeper issue is that unrelated invariants, parsing logic, application orchestration and persistence concerns share one compilation and review surface.

## Recommended module structure

```text
runtime/agent-fabric/
  src/
    protocol/
      commands/
      results/
      events/
      errors/
      schemas/
      generated/

    domain/
      authority/
      tasks/
      messages/
      leases/
      budgets/
      teams/
      lifecycle/
      artifacts/
      barriers/

    application/
      command-handlers/
      query-handlers/
      policies/
      unit-of-work/
      outbox/
      recovery/

    persistence/
      sqlite/
        repositories/
        migrations/
        projections/
        maintenance/

    daemon/
      authentication/
      connection-limits/
      dispatcher/
      server/

    mcp/
      tools/
      resources/
      gateway/

    adapters/
      sdk/
      supervisor/
      claude/
      codex/

    visibility/
      events/
      herdr/

    cli/
```

This can remain one Node package initially. The objective is **logical modularity**, not premature package or service proliferation.

## Recommended domain boundaries

### Run and principal service

Owns:

* run creation;
* chair generation;
* principal capabilities;
* run takeover;
* workspace binding.

### Authority service

Owns:

* authority normalisation;
* containment;
* action vocabulary;
* path policy;
* disclosure policy.

### Task service

Owns:

* proposals;
* claims;
* ownership;
* dependencies;
* completion;
* revision compare-and-set.

### Mailbox service

Owns:

* message persistence;
* audience expansion;
* delivery claims;
* acknowledgement;
* expiry;
* deduplication;
* watermarks.

### Lease service

Owns:

* chair, task, write and turn leases;
* generation fencing;
* expiry;
* revocation proof;
* quarantine.

### Provider-action service

Owns:

* prepare/dispatch/accept/terminal transitions;
* idempotency evidence;
* ambiguity reconciliation.

### Lifecycle service

Owns:

* fresh session;
* resume;
* fork;
* compact;
* checkpoint and rotate;
* suspend;
* release.

### Barrier service

Owns:

* task barriers;
* subtree barriers;
* stage barriers;
* run barriers.

## Preserve cross-domain atomicity

Do not split the daemon into network microservices. Many operations must remain one SQLite transaction:

* task claim plus owner-lease issuance;
* message creation plus immutable audience expansion;
* delegation plus child authority and budget reservation;
* barrier closure plus receipt state;
* provider-lifecycle finalisation plus registry update.

Use command handlers with a unit-of-work boundary:

```text
authenticated command
  ↓
authorisation policy
  ↓
application command handler
  ↓
single database transaction
  ├── domain validation
  ├── state mutation
  ├── outbox event
  └── committed result
```

The public `Fabric` class can remain as a compatibility façade that delegates to these handlers.

---

# 5. Establish one canonical protocol definition

The repository currently maintains related protocol shapes across several places:

* MCP input/output schemas;
* daemon protocol validators;
* daemon client validators;
* core result parsers;
* TypeScript interfaces;
* compatibility fixtures.

This invites protocol drift.

For example, `fabric.ts` contains numerous handwritten result validators and capability checks alongside domain logic.

## Recommended approach

For the local TypeScript-first implementation, define one canonical schema source that generates:

* TypeScript types;
* runtime validators;
* JSON Schema;
* MCP tool input schemas;
* MCP tool output schemas;
* daemon client bindings;
* daemon server dispatch bindings;
* test fixtures;
* protocol documentation.

A TypeScript schema system capable of producing JSON Schema would be sufficient initially. If adapters later become independently implemented in several languages, migrating the authoritative model to Protocol Buffers or another language-neutral IDL would become reasonable.

A2A provides a useful precedent: its canonical data model is expressed in Protocol Buffers and all bindings are required to provide functionally equivalent representations. ([A2A Protocol][2])

## Add protocol lifecycle negotiation

Every daemon connection should begin with something equivalent to:

```json
{
  "method": "initialize",
  "params": {
    "client": {
      "name": "agent-fabric-mcp",
      "version": "0.4.0"
    },
    "protocol": {
      "version": 2,
      "minimumCompatibleVersion": 1
    },
    "capabilities": {
      "resources": true,
      "notifications": true,
      "streamingEvents": false
    }
  }
}
```

Return:

* accepted protocol version;
* daemon version;
* enabled operations;
* limits;
* required authentication mode;
* extension capabilities.

MCP, Codex app-server and ACP all use initialisation and capability negotiation rather than assuming that both ends implement identical behaviour. MCP explicitly requires clients and servers to advertise and respect supported features. ([Model Context Protocol][1]) Codex app-server similarly rejects requests before its `initialize`/`initialized` handshake. ([OpenAI Developers][4]) ACP v1 negotiates versions and capabilities before session creation or loading. ([Agent Client Protocol][5])

---

# 6. Strengthen the SQLite model

The persistence configuration starts well. The migration enables:

* WAL;
* `synchronous=FULL`;
* foreign keys;
* a busy timeout;
* `trusted_schema=OFF`.

Those settings demonstrate a genuine durability intent.

The schema itself needs stronger integrity, indexing and lifecycle controls.

## 6.1 Add database-enforced state constraints

Many domain states are unconstrained `TEXT` columns:

* agent lifecycle;
* task state;
* barrier state;
* delivery state;
* lease kind and status;
* provider-action status;
* team state;
* budget state;
* check and human-gate status.

Move critical invariants into `CHECK` constraints.

Example:

```sql
state TEXT NOT NULL
  CHECK (state IN (
    'proposed',
    'ready',
    'active',
    'blocked',
    'complete',
    'cancelled',
    'degraded'
  ))
```

Use `CHECK` constraints for:

* boolean integers;
* non-negative counters;
* `reserved <= granted`;
* `consumed <= granted`;
* valid generations;
* valid time relationships;
* valid terminal-state metadata.

## 6.2 Use `STRICT` tables

SQLite ordinarily permits values that do not match a declared column type. `STRICT` tables enforce lossless type compatibility and cause integrity checks to verify column types. ([SQLite][6])

For this coordination ledger, that trade-off is desirable.

Use `STRICT` for all new tables and migrate existing tables if the installed SQLite version is guaranteed to be recent enough.

## 6.3 Enforce same-run references

Several tables carry both `run_id` and another entity identifier without enforcing that the referenced entity belongs to the same run.

Examples include:

* task owner agent;
* message sender;
* reply-to message;
* delivery recipient;
* lease holder;
* team leader;
* lifecycle agent;
* intervention actor.

The first migration defines several foreign keys but does not systematically enforce these cross-field same-run relationships.

Use composite keys:

```sql
UNIQUE (run_id, agent_id)
```

and references such as:

```sql
FOREIGN KEY (run_id, owner_agent_id)
  REFERENCES agents(run_id, agent_id)
```

This prevents malformed or buggy commands from joining entities across runs.

## 6.4 Add operational indexes

The schema has a useful partial unique index preventing more than one unresolved provider turn per session, but most common mailbox and scheduler queries lack explicit secondary indexes.

Add at least:

```sql
CREATE INDEX deliveries_ready_by_recipient
ON deliveries(run_id, recipient_id, state, mailbox_sequence);

CREATE INDEX tasks_by_state
ON tasks(run_id, state, task_id);

CREATE INDEX tasks_by_owner
ON tasks(run_id, owner_agent_id, state);

CREATE INDEX leases_by_expiry
ON leases(run_id, status, expires_at);

CREATE INDEX messages_by_created
ON messages(run_id, created_at, message_id);

CREATE INDEX events_by_run_cursor
ON events(run_id, created_at, event_id);

CREATE INDEX provider_actions_unresolved
ON provider_actions(run_id, status, updated_at);

CREATE INDEX artifacts_by_task
ON artifacts(run_id, task_id, created_at);
```

Verify every index with `EXPLAIN QUERY PLAN` against realistic historical databases.

## 6.5 Define the writer model

WAL permits concurrent readers and a writer, but only one writer can operate at a time. Long-running read transactions can also impede checkpoint completion. ([SQLite][7])

Specify explicitly:

```yaml
sqlite_execution:
  writers: one_serial_command_executor
  readers: bounded_snapshot_reads
  maximum_read_transaction_ms: 1000
  busy_timeout_ms: 5000
  checkpoint:
    mode: passive_periodic
    restart_during_idle: true
  integrity_check:
    startup_after_unclean_shutdown: quick_check
    scheduled: integrity_check
```

A single mutation queue also makes command ordering, tracing and fault injection easier to reason about.

## 6.6 Add routine maintenance

Run `PRAGMA optimize=0x10002` on opening a long-lived connection and `PRAGMA optimize` periodically and after index changes. SQLite recommends this approach for long-lived connections and evolving schemas. ([SQLite][8])

Also define:

* backup cadence;
* restore test;
* maximum database size;
* WAL size alarms;
* checkpoint starvation alarms;
* corruption recovery procedure;
* migration rollback policy.

## 6.7 Define atomic artefact publication

Publishing an artefact involves both a filesystem object and a database reference. The safe sequence should be explicit:

```text
write temporary file
  ↓
fsync file
  ↓
calculate hash
  ↓
atomic rename into project run directory
  ↓
commit database artefact reference
  ↓
emit outbox event
```

If the database commit fails after the rename, a reconciler may identify an unreferenced artefact. The inverse sequence is worse because the database may claim an artefact exists when it was never durably written.

---

# 7. Introduce explicit retention and pruning

The current design intentionally avoids destructive cleanup, but the runtime does not appear to implement a concrete data-retention lifecycle.

Without one, the following will accumulate indefinitely:

* message bodies;
* delivery records;
* events;
* provider resume references;
* action histories;
* capabilities;
* lifecycle checkpoints;
* receipts;
* completed task state.

## Recommended retention classes

```yaml
retention:
  active_run:
    coordination_state: retain
    message_bodies: retain
    provider_resume_references: retain
    events: retain

  completed_run:
    message_bodies: 7_days
    delivery_metadata: 90_days
    task_and_lease_history: 180_days
    provider_resume_references: 14_days
    security_and_failure_events: 365_days
    final_receipts: project_policy

  failed_or_quarantined_run:
    all_recovery_state: retain_until_resolved

  legal_hold:
    pruning: disabled
```

Provide:

```text
agent-fabric retention status
agent-fabric retention preview
agent-fabric retention apply --run …
agent-fabric archive --run …
```

Pruning should:

* run only against terminal runs;
* support dry-run output;
* emit a durable administrative event;
* retain hashes and disposition metadata where appropriate;
* never delete provider-native session stores without separate authority.

---

# 8. Harden daemon and adapter transports

The daemon currently accepts newline-delimited JSON from local socket connections. Each incoming line is parsed and dispatched asynchronously. There is no visible maximum line length, connection quota, per-connection in-flight limit or backpressure mechanism in the server loop.

The client transport similarly keeps an unbounded map of pending requests and writes arbitrary serialised request bodies.

The provider adapter server also starts one asynchronous operation per line without a concurrency bound.

Local-only transport materially reduces exposure, but it does not remove the need for resource controls. Your own threat model anticipates sandboxed processes running under the same user identity.

## Required controls

### Framing and parsing

* maximum request frame size;
* maximum response frame size;
* maximum JSON nesting depth where practical;
* UTF-8 validation;
* reject multiple envelopes in one frame;
* close connections after repeated protocol violations.

### Connection controls

* maximum simultaneous clients;
* maximum in-flight requests per client;
* maximum total in-flight commands;
* idle timeout;
* command deadline;
* bounded response queue;
* read pause/resume for backpressure.

### Principal controls

* rate limits by principal and operation;
* maximum run creations;
* maximum mailbox sends;
* maximum resource reads;
* revocation and expiry checks before every mutation;
* short-lived or one-use bootstrap capability.

### Error semantics

Use structured error categories:

```yaml
error:
  code: MESSAGE_QUOTA_EXCEEDED
  retryable: false
  category: policy
  details:
    current: 100
    maximum: 100
```

Avoid relying on error-message text for recovery decisions.

## Adapter-process isolation

The adapter process currently inherits `PATH`, `TMPDIR` and optionally `HOME`, supplemented by configured environment values. It does not visibly set a working directory, process-group isolation, OS resource limits or sandbox profile.

The close path gives the child a brief period to exit and then sends `SIGKILL` to the direct child.

Add:

* explicit `cwd`;
* minimal environment allow-list;
* process group or job object;
* child-tree termination;
* CPU, memory and open-file limits;
* maximum stdout/stderr bytes;
* provider-specific sandbox profile;
* adapter restart budget;
* circuit breaker;
* health check;
* graceful drain before termination.

Malformed adapter output currently fails the whole transport and rejects all pending calls.  That fail-closed behaviour is defensible, but the supervisor should clearly distinguish:

* one invalid response;
* an adapter protocol-version mismatch;
* an adapter crash;
* an ambiguous provider side effect;
* a permanent compatibility failure.

---

# 9. Complete the primary provider pair before expanding

The repository presently models Claude, Codex, Pi, Agy, Cursor and Kiro or ACP. That breadth is strategically attractive but operationally premature.

The next release should support only:

```text
Claude Code / Claude Agent SDK
Codex app-server
fake reference adapter
Herdr visibility bridge
```

Defer the remaining providers until the primary pair satisfies:

1. generated protocol compatibility;
2. live session start;
3. resume;
4. fresh rotation;
5. durable request–response;
6. interruption;
7. checkpoint recovery;
8. ambiguous-action recovery;
9. daemon restart;
10. optional Herdr observation.

## 9.1 Generate Codex protocol schemas

Codex app-server can generate version-specific TypeScript and JSON Schema bundles. OpenAI’s documentation states that generated artefacts are specific to the version being run. ([OpenAI Developers][4])

Use that output as the adapter’s source contract:

```text
codex app-server generate-json-schema --out ./schemas
codex app-server generate-ts --out ./schemas
```

Then:

* hash the generated bundle;
* record the Codex version;
* commit or cache approved compatibility fixtures;
* fail activation if the generated hash differs;
* run adapter conformance against the exact bundle.

## 9.2 Model provider lifecycle explicitly

Codex already distinguishes:

* new thread;
* resume;
* fork;
* compact.

It exposes `thread/start`, `thread/resume`, `thread/fork` and `thread/compact/start`. ([OpenAI Developers][4])

Claude Code similarly distinguishes fresh subagents, forks and resumed agents. Fresh subagents receive isolated context; resumed subagents retain their prior history. ([Claude][9])

Your provider-neutral lifecycle should therefore be:

```yaml
session_strategy:
  fresh:
    prior_provider_context: none

  resume:
    continue_existing_context: true

  fork:
    preserve_source_session: true
    create_branch_from_history: true

  compact_in_place:
    adapter_capability_required: true

  checkpoint_rotate:
    create_checkpoint: true
    create_fresh_session: true
    rehydrate_from_checkpoint: true

  suspend:
    accept_new_turns: false
    retain_resume_reference: true

  release:
    detach_from_fabric: true
    provider_session_retention: policy_controlled
```

Treat “clear context” as `checkpoint_rotate` unless the human explicitly authorises destructive provider-session deletion.

## 9.3 Use Claude hooks as evidence, not authority

Claude Code exposes `PreCompact`, `PostCompact` and `SessionEnd` events, including clear and resume reasons. ([Claude][10])

Use these hooks to:

* detect compaction;
* capture a provider compact summary;
* detect `/clear`;
* detect session switching;
* emit lifecycle observations.

Do not treat a hook firing as proof that:

* a fabric message was consumed;
* a task was transferred;
* a checkpoint is complete;
* a lease may be released.

The fabric’s authenticated operations should remain authoritative.

## 9.4 Make capabilities semantic and versioned

Replace boolean capabilities with descriptors:

```yaml
capabilities:
  send_turn:
    version: 1
    action_id_idempotency: reconciled
    streaming_events: true

  resume:
    version: 1
    reference_portability: machine_local

  compact:
    version: 2
    modes:
      - in_place
      - checkpoint_rotate
    reports_context_generation: true

  fork:
    version: 1
    supports_history_cutoff: true

  native_subagents:
    version: 1
    visibility:
      - opaque
      - registered

  usage:
    version: 1
    precision:
      cost: unavailable_or_provider_reported
      tokens: provider_reported
```

This avoids pretending that “compact”, “resume” or “steer” means the same thing across all providers.

## 9.5 Separate portable compatibility from machine resolution

The compatibility manifest currently combines portable version information with machine-specific executable locations and hashes.

Split this into:

```text
config/adapter-compatibility.yaml
  portable approved versions, schemas and source references

state/adapter-resolution.json
  local executable path, platform, binary hash, checked_at
```

The portable manifest belongs in Git. Machine resolution does not.

---

# 10. Repair workspace trust and portability

The shipped fabric configuration permits `${AGENTS_HOME}` as the global workspace root.

The local trusted layer is then prevented from widening that set.

That is secure in one sense, but operationally awkward: ordinary project repositories outside the harness directory cannot be used without editing the global harness configuration or pre-authorising an excessively broad parent directory.

## Recommended trust registry

Introduce a machine-local, human-managed trust store:

```yaml
trusted_workspaces:
  - canonical_path: /workspace/example
    approved_by: human
    approved_at: 2026-07-11T10:00:00+10:00
    expires_at: 2026-10-11T10:00:00+10:00
    permitted_profiles:
      - paired-observed
      - managed-team
    maximum_authority:
      actions:
        - read-source
        - create-patch
        - run-tests
```

Commands:

```text
agent-fabric workspace trust <path>
agent-fabric workspace inspect <path>
agent-fabric workspace revoke <path>
agent-fabric workspace list
```

The security hierarchy should be:

```text
global policy
  defines maximum permissible behaviour

local human trust registry
  authorises exact workspace roots

project configuration
  narrows behaviour within that root

run authority envelope
  narrows behaviour for one run
```

Do not solve the problem by trusting all of `$HOME`.

---

# 11. Convert Herdr from an in-memory abstraction into a durable projection

The current visibility coordinator keeps panes, events, cursors and pending deliveries in in-memory maps.

That is appropriate for tests, but a daemon restart loses observer cursor and transient visibility state. The runbook also acknowledges that automatic Herdr event rendering is not yet implemented.

## Recommended Herdr architecture

```text
committed fabric transaction
  │
  ├── state change
  └── durable outbox event
          │
          ▼
    visibility projector
          │
          ├── current run summary
          ├── agent status view
          ├── alerts
          └── redacted activity stream
                  │
                  ▼
             Herdr bridge
```

### Persist

* event sequence;
* redacted event payload;
* run and agent identity;
* event schema version;
* observer display cursor where continuity matters;
* acknowledgement only for operator alerts, never mailbox delivery.

### Derive rather than persist

* current pane layout;
* transient rendering state;
* colour and formatting;
* window dimensions.

## Operator experience

For small runs:

```text
┌──────────────────────┬──────────────────────┐
│ Chair TUI            │ Paired primary       │
├──────────────────────┼──────────────────────┤
│ Task and lease state │ Alerts and messages  │
└──────────────────────┴──────────────────────┘
```

For larger runs:

```text
┌──────────────────────┬──────────────────────┐
│ Chair                │ Selected agent       │
├──────────────────────┼──────────────────────┤
│ Team topology        │ Event stream         │
├──────────────────────┼──────────────────────┤
│ Risks and blockers   │ Cost/context status  │
└──────────────────────┴──────────────────────┘
```

Do not open a full provider TUI for every worker. Default to:

* chair: interactive;
* paired primary: interactive or observed;
* leaders: observed;
* ordinary workers: headless;
* failing or high-risk worker: promoted to observed.

ACP is worth considering for future editor-facing integrations because it standardises initialisation, new or loaded sessions, prompts, progress updates, permissions and cancellation between an agent and an editor/client. It is better suited to Zed-style client integration than to replacing your authority and coordination kernel. ([Agent Client Protocol][5])

---

# 12. Correct receipt semantics and make exports reproducible

The receipt projector has several semantic weaknesses.

It selects every task with a non-null owner into `stageOwners`, even though task ownership is not equivalent to stage ownership.

It reports:

```text
delivered = total delivery rows
```

rather than counting only a defined delivered or consumed state.

It also injects the export-time `observedAt`, so two projections of identical committed state produce different receipt bytes.

## Recommended receipt model

Separate the canonical snapshot from export metadata:

```yaml
snapshot:
  schema_version: 2
  run_id: …
  event_watermark: 1842
  state_hash: …
  chair: …
  task_owners: …
  stage_owners: …
  deliveries:
    ready: 2
    claimed: 1
    acknowledged: 16
    abandoned: 1
    expired: 0
  …

export:
  generated_at: …
  generator_version: …
```

Hash only the canonical snapshot.

Use RFC 8785 JSON Canonicalization Scheme for hashable JSON rather than maintaining a private sorting convention. RFC 8785 defines deterministic primitive serialisation and property sorting specifically to produce a cryptographically hashable representation. ([RFC Editor][11])

Also tighten the receipt schema:

* use enumerated state values;
* set `additionalProperties: false`;
* version nested structures;
* include snapshot watermark;
* distinguish observation from enforcement;
* distinguish exact, estimated and unavailable usage;
* include enforcement level for authority claims.

---

# 13. Refactor model routing into constraint–score–receipt

The routing manifest is clear and inspectable, but it currently centres on:

* provider family;

* alias tier;

* role-specific alias order;

* effort defaults;

* model-name pattern matching;

* adapter family constraints.

That is a good first deterministic router. It is not yet a comprehensive workload router.

The TypeScript runtime shells out to a separate router process, parses a broad receipt shape and writes the resulting receipt directly. No explicit execution timeout is supplied in this path.

## 13.1 Eliminate routing-policy duplication

There are currently several likely sources of routing truth:

* JSON routing configuration;
* Python routing logic;
* TypeScript adapter compatibility logic;
* provider compatibility registry.

Consolidate them into:

```text
routing-policy.schema.json
routing-policy.json
model-capability-snapshot.json
generated Python and TypeScript bindings
```

Use one pattern semantic. Do not mix regular expressions, globs and ad hoc substring logic.

## 13.2 Use hard constraints before scoring

```yaml
hard_constraints:
  provider_or_adapter_available: true
  required_tools_supported: true
  minimum_context_tokens: 100000
  required_session_operations:
    - resume
    - compact
  data_classification_permitted: true
  maximum_cost: …
  required_sandbox_level: …
  distinct_review_lineage: true
```

Any failed hard constraint removes the candidate.

## 13.3 Score viable candidates

```yaml
utility_weights:
  expected_quality: 0.40
  reliability: 0.20
  cost_efficiency: 0.15
  latency: 0.10
  context_fit: 0.10
  cache_affinity: 0.05
```

Keep the scoring simple and deterministic initially.

## 13.4 Produce a decision receipt

```yaml
routing_receipt:
  request:
    role: security-reviewer
    task_class: read-heavy-review

  candidates:
    - model: …
      status: rejected
      reasons:
        - distinct_lineage_required

    - model: …
      status: viable
      score: 0.82
      factors:
        quality: 0.90
        cost_efficiency: 0.75

  selected:
    model: …
    adapter: …
    effort: high

  fallbacks:
    - …
```

## 13.5 Separate model facts from policy

Model availability, context size, supported effort, tools and pricing change over time.

Maintain a verified capability snapshot:

```yaml
model:
  id: …
  provider_family: …
  capabilities:
    tools: true
    mcp: true
    context_tokens: …
    reasoning_efforts: […]
  provenance:
    source: official-provider-doc
    verified_at: …
    expires_at: …
```

Routing policy should refer to these facts; it should not duplicate them.

## 13.6 Measure review independence properly

“Different model family” is useful but incomplete.

Record whether the reviewer differs by:

* provider family;
* model lineage;
* system instructions;
* context history;
* artefact authorship exposure;
* tool environment;
* session lineage.

Hypothesis requiring evaluation: a new thread in the same provider with no prior authoring context may be more independent than a nominally different model that received the full lead transcript.

## 13.7 Do not permit automatic production self-modification

The harness may collect routing outcomes and propose policy changes. It should not directly promote them.

Use:

```text
observed routing outcomes
  ↓
candidate policy change
  ↓
offline evaluation
  ↓
human approval
  ↓
versioned routing update
```

## 13.8 Default to the smallest useful topology

Parallel agents consume more tokens because each performs its own model and tool work. OpenAI recommends starting parallel subagents with bounded, read-heavy work and exercising greater caution for simultaneous write-heavy work because of conflict and coordination overhead. ([OpenAI Developers][12])

The router should decide topology as well as model:

```text
single agent
pair
lead plus workers
multi-team hierarchy
```

It should choose the smallest topology likely to satisfy the risk and quality requirements.

---

# 14. Turn skills into a governed capability system

The repository’s skill discipline is one of its strengths. The skills are generally bounded, contain clear operating doctrine and are supported by references and evaluation fixtures.

The main gap is that structural conformance is stronger than behavioural evidence.

The orchestrate trigger checker explicitly states that it is not a live behaviour evaluation.  Its trigger checks rely primarily on token overlap between prompts and skill descriptions.

That detects accidental description drift but cannot establish that:

* Claude selects the skill correctly;
* Codex selects an equivalent instruction set;
* one skill is preferred over a similar skill;
* broad descriptions do not over-trigger;
* provider updates do not change routing behaviour.

## 14.1 Adopt a clear taxonomy

### Skill

A reusable method or body of instructions.

Examples:

* code review;
* evidence synthesis;
* role design;
* threat modelling.

### Agent profile

A role configuration:

* model constraints;
* tools;
* skill preload;
* permissions;
* maximum turns;
* context strategy;
* reporting format.

### Plugin or capability pack

A distributable package containing:

* skills;
* tools;
* hooks;
* MCP servers;
* templates;
* optional agent profiles.

### Fabric policy

Authority and governance:

* allowed actions;
* budgets;
* gates;
* workspace scope;
* retention;
* review requirements.

A skill should never grant fabric authority.

## 14.2 Add a canonical skill registry

```yaml
skills:
  code-review:
    version: 2
    domain: software-engineering
    capabilities:
      - review-code
      - identify-test-gaps
    trigger:
      positive_examples: …
      negative_examples: …
    conflicts:
      - lightweight-review
    dependencies:
      - evidence-reporting
    required_tools:
      - repository-read
    authority_needs:
      write: false
    supported_hosts:
      - claude-code
      - codex
    preload_cost:
      estimated_tokens: 850
```

Generate provider-specific artefacts from this registry.

## 14.3 Package coherent skills, not every skill

Suggested packs:

```text
core-governance
  scope
  deliver
  session
  release
  retrospect

orchestration
  orchestrate
  work-map
  autonomous-lab
  evaluation

software-engineering
  implement
  code-review
  engineering-writing
  engineering-docs

research-and-writing
  evidence synthesis
  natural writing
  source review

design
  frontend design
  visual evaluation

provider-specific
  agy-headless
  codex-specific guidance
  claude-specific guidance
```

Keep the canonical source of individual skills intact. Plugins should package and distribute skills rather than become the only location where they exist.

Claude Code plugins can bundle skills, MCP servers and related setup, which makes them suitable as distribution units. ([Claude][13])

## 14.4 Load skills selectively

Do not preload all skills into every agent.

Claude Code normally keeps skill descriptions in context and loads the full skill only when invoked. For subagents with preloaded skills, the entire skill content is injected at startup. Invoked skills also remain in the session and interact with compaction budgets. ([Claude][13])

Therefore:

* chair: orchestration and governance skills;
* implementation agent: implementation and test skills;
* reviewer: review and evidence skills;
* research worker: retrieval and synthesis skills;
* provider adapters: provider-specific operating guidance only.

## 14.5 Add behavioural skill evaluations

Build a held-out evaluation set with:

* explicit trigger prompts;
* implicit trigger prompts;
* near-neighbour confusion prompts;
* negative prompts;
* multi-intent prompts;
* provider-specific phrasing;
* adversarial over-trigger prompts.

Measure:

```text
precision
recall
false-trigger rate
missed-trigger rate
correct-skill rank
token overhead
task success
```

Run deterministic structural tests on every pull request and live behavioural samples periodically or when skill descriptions change.

## 14.6 Make procedural requirements risk-sensitive

Several skills appear to encode fixed procedural rules such as:

* mandatory cross-family review;
* a fixed number of repair cycles;
* mandatory multi-agent review;
* one-question-at-a-time scoping;
* perpetual archival or re-enumeration behaviour.

Convert these into policy resolved from:

* risk tier;
* complexity;
* budget;
* reversibility;
* evidence quality;
* human attention requirement.

Example:

```yaml
review_policy:
  routine:
    independent_reviewers: 0
    required_checks: deterministic

  significant:
    independent_reviewers: 1
    repair_cycles_max: 1

  crucial:
    independent_reviewers: 2
    cross_family_required: true
    repair_cycles_max: 2
    human_gate: true
```

## 14.7 Add hard limits to autonomous operation

Any autonomous-lab mode should require:

* wall-clock limit;
* token or provider-call limit;
* maximum descendants;
* maximum idle cycles;
* maximum failed retries;
* maximum unreviewed changes;
* mandatory suspend behaviour if the human is unavailable.

“Continue unless the human says stop” is not an adequate safety boundary for an unattended stateful agent system.

## 14.8 Remove undefined global shorthand

`AGENTS.md` instructs all harnesses to use `$caveman` style, but no corresponding definition is visible in the global file.

Replace opaque shorthand with explicit stable language, or define a properly versioned skill. Global bootstrap instructions should be understandable by every provider without relying on local folklore.

---

# 15. Expand security assurance to match the new attack surface

The current static security checker describes itself as a small deterministic checker for high-risk Python call patterns. It scans only `.py` files.

The dominant new attack surface is now:

* TypeScript;
* Unix-socket JSON protocols;
* shell scripts;
* provider subprocesses;
* MCP tools;
* project configuration;
* generated schemas;
* adapter compatibility;
* SQLite migrations.

## Add automated checks

### Source analysis

* TypeScript/JavaScript SAST;
* Python SAST;
* ShellCheck;
* unsafe subprocess usage;
* path traversal;
* symlink escape;
* unsafe temporary files;
* incomplete redaction.

### Dependency and supply chain

* npm and Python vulnerability audit;
* OSV scanning;
* dependency review;
* licence policy;
* SBOM;
* lockfile integrity;
* pinned GitHub Actions;
* signed release or provenance evidence.

SLSA provides incremental levels for improving supply-chain security and recommends provenance and verification artefacts for builds. ([SLSA][14]) CycloneDX can represent first- and third-party components, services, dependencies, configurations, provenance and vulnerabilities, making it suitable for the harness SBOM. ([cyclonedx.org][15])

### Protocol testing

* oversized frame;
* malformed JSON;
* duplicate request ID;
* unknown response ID;
* replay;
* stale capability;
* revoked principal;
* cross-run identifier substitution;
* audience expansion race;
* mailbox storm;
* event flood;
* adapter output injection.

### Agentic threat model

Map threat scenarios to the OWASP Top 10 for Agentic Applications, which provides a peer-reviewed framework for risks in autonomous agents that plan, act and make decisions across workflows. ([OWASP Gen AI Security Project][16])

Include at least:

* prompt or instruction injection;
* poisoned durable memory;
* tool misuse;
* confused deputy;
* privilege escalation through delegation;
* untrusted artefact references;
* inter-agent impersonation;
* cascading agent failure;
* excessive autonomy;
* unsafe recovery.

---

# 16. Improve testing from examples to invariants

The repository already has a substantial test taxonomy. That is valuable. The next step is to make the system’s invariants explicit and test them generatively.

## Normative invariant catalogue

Add a short, central document containing at least:

1. A run has at most one valid chair generation.
2. An active task has at most one valid owner lease.
3. Overlapping canonical write scopes cannot have concurrent valid writers.
4. Child authority never exceeds parent authority.
5. Child budget reservations cannot exceed available parent balance.
6. A message acknowledgement belongs to one authenticated recipient and message ID.
7. Audience expansion is immutable after commit.
8. An ambiguous external side effect is never automatically repeated without proven idempotency.
9. A barrier cannot close with unresolved required work.
10. An agent cannot rotate or release while owning unreconciled work.
11. Observer activity cannot acknowledge mailbox delivery.
12. Project artefacts and coordination state retain separate authority.

## Add property-based tests

Generate random sequences of:

* run creation;
* task claims;
* delegation;
* lease expiry;
* reassignment;
* message send/claim/ack;
* lifecycle rotation;
* daemon restart;
* provider ambiguity;
* barrier closure.

After every operation, check all invariants.

## Strengthen performance tests

The current p95 test should expand beyond sequential message sends.

Test:

* 32–100 registered agents;
* eight concurrent provider turns;
* multiple simultaneous MCP clients;
* message claim and acknowledgement contention;
* out-of-order acknowledgements;
* expired claims;
* historical database with millions of events;
* long-lived read projections;
* WAL checkpoint under load;
* daemon restart during active delivery;
* adapter event flood;
* receipt projection on large runs.

Report:

```yaml
performance_evidence:
  host:
  operating_system:
  Node_version:
  SQLite_version:
  database_mode:
  database_size:
  agent_count:
  concurrent_clients:
  operation_mix:
  warmup_operations:
  measured_operations:
  p50:
  p95:
  p99:
  maximum:
```

## Add deterministic fault injection

Inject failure at:

* before transaction;
* after write but before commit;
* after commit before response;
* before provider dispatch;
* after provider acceptance;
* before action terminal record;
* after artefact rename;
* before artefact database reference;
* during checkpoint;
* during migration;
* during capability rotation.

---

# 17. Improve repository and release governance

The latest fabric implementation is extremely broad for one review unit. Future changes should be smaller and independently reviewable.

## Recommended change sequence

A fabric feature should usually arrive as:

1. specification or ADR amendment;
2. canonical schema change;
3. migration;
4. domain logic;
5. unit tests;
6. integration tests;
7. acceptance scenario;
8. operational documentation;
9. compatibility evidence;
10. activation gate.

## Required decision records

Create concise ADRs for:

* canonical protocol schema strategy;
* SQLite writer and checkpoint model;
* workspace trust registry;
* retention policy;
* adapter-process isolation;
* session lifecycle mapping;
* Herdr event outbox;
* model-routing utility function;
* skill registry and packaging;
* receipt canonicalisation.

The main specification can remain the source of the overall architectural decision. ADRs should record focused implementation decisions that may evolve independently.

## Remove machine-local operational state from public docs

The runtime README and runbook contain statements about the currently active local daemon and global client registrations.

Machine state should be generated by:

```text
agent-fabric status --json
agent-fabric doctor
```

and stored outside version control.

Repository documentation should describe expected behaviour and setup, rather than the state of one workstation.

---

# 18. Recommended target architecture

```text
┌────────────────────────────────────────────────────────────┐
│             Claude Code or Codex chair session             │
│ Human-facing reasoning, planning and direct interaction    │
└──────────────────────────┬─────────────────────────────────┘
                           │ MCP
                           ▼
┌────────────────────────────────────────────────────────────┐
│                     MCP gateway                            │
│ Generated schemas, authentication, tool/resource façade    │
└──────────────────────────┬─────────────────────────────────┘
                           │ internal versioned protocol
                           ▼
┌────────────────────────────────────────────────────────────┐
│                Application command layer                   │
│ Authorisation → command handler → unit of work             │
└─────────┬─────────────┬─────────────┬───────────────┬──────┘
          │             │             │               │
          ▼             ▼             ▼               ▼
   Authority/tasks   Mailboxes     Lifecycle      Provider actions
          │             │             │               │
          └─────────────┴──────┬──────┴───────────────┘
                               ▼
┌────────────────────────────────────────────────────────────┐
│                      SQLite/WAL                            │
│ State, leases, commands, outbox, cursors and receipts      │
└───────────────┬──────────────────────────┬─────────────────┘
                │                          │
                ▼                          ▼
       Provider supervisor           Event projector
         ┌──────┴──────┐                  │
         ▼             ▼                  ▼
   Claude adapter  Codex adapter      Herdr bridge
         │             │                  │
         ▼             ▼                  ▼
   Provider session Provider thread  Human visibility
```

Suggested source layout:

```text
runtime/agent-fabric/
  src/
    protocol/
    domain/
    application/
    persistence/
    daemon/
    mcp/
    adapters/
      sdk/
      claude/
      codex/
    visibility/
      herdr/
    cli/
```

---

# 19. Prioritised implementation roadmap

## Priority 0 — release blockers

1. Add full TypeScript fabric CI.
2. Correct status documentation and conformance terminology.
3. Pin GitHub Actions and restrict token permissions.
4. Add daemon and adapter frame, queue and concurrency limits.
5. Implement the machine-local workspace trust registry.
6. Add database constraints, composite foreign keys and operational indexes.
7. Define retention and pruning.
8. Add autonomous-lab hard budgets and fail-safe suspension.
9. Remove undefined global instruction shorthand.
10. Establish a formal issue backlog and code ownership.

## Priority 1 — prove the primary pair

11. Complete the Codex adapter using generated app-server schemas.
12. Complete the Claude adapter with explicit lifecycle mapping.
13. Implement `fresh`, `resume`, `fork`, `compact` and `checkpoint_rotate`.
14. Run live opt-in smoke tests in both chair directions.
15. Implement the durable Herdr outbox and bridge.
16. Exercise daemon restart, provider restart and context rotation in a live paired run.
17. Record operational evidence before calling Stage 3 conformant.

## Priority 2 — maintainability

18. Split the central `Fabric` implementation into bounded domain and application services.
19. Establish one canonical protocol schema and generated bindings.
20. Introduce version and capability negotiation.
21. Make receipts deterministic and correct their delivery semantics.
22. Add property-based invariant tests.
23. Add migration, backup and restore assurance.
24. Separate portable compatibility data from machine-local resolution.

## Priority 3 — skills and routing

25. Add the canonical skill registry.
26. Package coherent capability packs.
27. Add behavioural skill-routing evaluations.
28. Convert fixed procedural rules to risk-sensitive policies.
29. Implement model-routing hard constraints and utility scoring.
30. Introduce verified, expiring model-capability snapshots.
31. Measure routing outcomes without permitting automatic production self-promotion.

## Priority 4 — expansion

32. Enable leaders and teams only after the paired-primary path is stable.
33. Add Pi as the first generic worker runtime.
34. Add optional Agy, Cursor and Kiro/ACP integrations one at a time.
35. Consider ACP for editor/client interoperability.
36. Consider an A2A gateway only when remote or independently operated agent interoperability becomes a real requirement.
37. Keep remote listeners and external dashboards outside the initial local-security boundary.

---

# Final judgement

The repository has the foundations of a **durable, flexible and cross-context agent harness**. The architecture can support:

* one agent working alone;
* a Claude–Codex pair;
* a lead with bounded workers;
* a chair with multiple leaders and teams;
* mixtures of headless, observed and interactive agents;
* fresh, resumed, forked and rotated provider sessions;
* coding and, with suitably domain-neutral artefact abstractions, other knowledge-work contexts.

The system is not yet operationally mature enough to justify broad provider expansion or unrestricted team hierarchies. The primary technical risks are concentrated in:

* absent fabric CI;
* overstatement of implementation status;
* disabled real adapters;
* centralised core logic;
* duplicated protocol definitions;
* weak transport resource limits;
* incomplete database constraints and retention;
* prototype-only Herdr integration;
* structural rather than behavioural skill evaluation;
* simplistic and duplicated model routing.

The strongest strategy is to turn the current breadth into a narrower, demonstrably reliable vertical slice:

```text
Claude chair ↔ durable fabric ↔ Codex peer
                    │
                    ├── checkpointed lifecycle
                    ├── exact authority and leases
                    ├── live recovery evidence
                    └── optional Herdr observation
```

Once that path passes live, repeatable recovery and security tests, the remaining hierarchy, providers and capability packs can be added without destabilising the foundation.

[1]: https://modelcontextprotocol.io/specification/2025-11-25/architecture "Architecture - Model Context Protocol"
[2]: https://a2a-protocol.org/latest/specification/ "Overview - A2A Protocol"
[3]: https://scorecard.dev/ "OpenSSF Scorecard"
[4]: https://developers.openai.com/codex/app-server/ "
  Codex App Server | ChatGPT Learn
"
[5]: https://agentclientprotocol.com/protocol/overview "Overview - Agent Client Protocol"
[6]: https://www.sqlite.org/stricttables.html "STRICT Tables"
[7]: https://www.sqlite.org/wal.html "Write-Ahead Logging"
[8]: https://www.sqlite.org/lang_analyze.html "ANALYZE"
[9]: https://code.claude.com/docs/en/sub-agents "Create custom subagents - Claude Code Docs"
[10]: https://code.claude.com/docs/en/hooks "Hooks reference - Claude Code Docs"
[11]: https://www.rfc-editor.org/rfc/rfc8785.html "RFC 8785: JSON Canonicalization Scheme (JCS)"
[12]: https://developers.openai.com/codex/subagents/ "
  Subagents | ChatGPT Learn
"
[13]: https://code.claude.com/docs/en/skills "Extend Claude with skills - Claude Code Docs"
[14]: https://slsa.dev/spec/v1.2/ "SLSA • SLSA specification"
[15]: https://cyclonedx.org/specification/overview/ "Specification Overview | CycloneDX"
[16]: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/ "OWASP Top 10 for Agentic Applications for 2026 - OWASP Gen AI Security Project"
