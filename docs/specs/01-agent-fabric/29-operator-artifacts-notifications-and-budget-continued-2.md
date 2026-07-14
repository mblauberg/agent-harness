
### 32.16 Exact scoped-operation targets and optional Herdr composition

The public `fabric.v1.scoped-gate.check` operation form is extended to require
this closed target in addition to its existing exact project session,
coordination run, dependency revision and protocol operation ID:

```yaml
operationTarget:
  kind: run
```

or:

```yaml
operationTarget:
  kind: task
  taskId: exact-task-in-coordination-run
```

No target-less operation check is accepted. This is an enforcement
target, not authority: the daemon still derives identity, reauthorises the
operation and checks the current dependency graph. The stored gate operation
kind and the exact current affected-task bindings form one predicate; neither
may be checked alone.

The optional Herdr boundary is one daemon-owned integration seam, not a direct
Console-to-pane mutation path. It accepts only the closed operations
`console.ensure-pane`, `agent.ensure-pane`, `panes.arrange`,
`agent.project-metadata`, `attention.project`, `target.focus`, `agent.wake`,
`notification.show` and the separately reference-validated
`steer.inject-fire-and-forget`. Every effect has one stable Fabric action ID,
is durably prepared before Herdr I/O, is marked dispatched before the call and
uses evidence-only lookup after ambiguity or restart. Prepared actions are
never dispatched by recovery. A missing, disabled or incompatible Herdr
integration exposes typed unavailability/`visibility-degraded`; all Fabric and
Console coordination remains portable without it. Pane/process presence,
absence, focus or scrollback never proves provider identity, task state,
message/result delivery or effect outcome.

Added requirements are:

- **FR-047:** Operation gate checks shall bind one exact run/task target and
  current dependency revision, and task/subtree gates shall block only matching
  affected tasks while unrelated siblings remain runnable.
- **FR-048:** Optional Herdr effects shall use one stable daemon-owned action
  preparation/dispatch/recovery seam with closed operation variants and honest
  disabled/degraded behaviour; pane state shall confer no Fabric truth.

Acceptance additionally requires:

- **AC-039:** closed-codec fixtures reject a missing, extra, malformed,
  cross-run or stale operation target. Runtime matrices cover task, subtree,
  run and release gates against task and run targets, including two sibling
  tasks invoking the same protocol operation at one dependency revision; only
  the affected target blocks. Dependency rebinding changes the answer
  atomically. Herdr fixtures cover every closed operation, disabled
  portability, stable replay, prepare/dispatch crash points, lookup-only
  ambiguity recovery and absence of every pane-derived authority, delivery or
  completion claim.

### 32.17 Provider-native input attestation principal

The public integration principal is the following closed authenticated shape:

```yaml
integrationPrincipalV1:
  kind: integration
  integrationId: exact-integration
  projectId: exact-project
  projectSessionId: exact-project-session
  runId: exact-coordination-run
  principalGeneration: positive-safe-integer
  providerId: exact-provider
  providerSessionRef: exact-provider-session
```

Its credential is issued only by trusted daemon composition and grants an
explicit subset of exactly `fabric.v1.provider-state.report`,
`fabric.v1.provider-action.reconcile`,
`fabric.v1.operator-intervention.record`,
`fabric.v1.visibility-failure.record`, `fabric.v1.budget.usage.record`,
`fabric.v1.budget.usage.reconcile`, `fabric.v1.integration.input-attest`,
`fabric.v1.resource.reconcile`, `fabric.v1.result-delivery.claim`,
`fabric.v1.result-delivery.provider-accept` and
`fabric.v1.result-delivery.consume`. No other operation may advertise or admit
an integration principal. Every request must carry or resolve to the exact
bound project/session/run and current principal generation; operation-specific
provider action, resource, budget, delivery or native-event ownership is then
rechecked at point of use.

The durable credential binds the full principal, granted subset and bounded
issue/expiry/revocation state, but contains only the credential hash. A raw
`afi_` bearer exists only in the trusted adapter's volatile custody and is
forbidden from SQLite, discovery, events, logs, projections, errors, receipts
and rendered content. Console, agent and ordinary operator principals cannot
issue or use this credential. An integration principal cannot acquire agent,
chair, operator, lease, gate-resolution, dispatch or topology authority;
`operator-intervention.record` records only its closed provider-originated
intervention fact and never authenticates a human/operator decision.

The public protocol authenticator resolves a current integration credential to
the closed shape above. The daemon dispatcher has an exhaustive integration
arm for only the granted operations and never falls through an agent or
operator dispatcher. It reloads expiry, revocation, full binding and grant at
point of use. The input-attest arm routes to the operator attestation store.
The authenticated provider ID and provider-session
reference must equal the attested native event; the request cannot select or
substitute them. Project, project session, run, integration and principal
generation are likewise derived and rechecked at point of use. Revocation,
expiry, wrong project/session/run, wrong provider/session, stale generation,
operation omission and token reuse across bindings fail before any mutation.

The trusted provider bridge may classify an event `direct-human` only from an
authenticated provider-native callback that carries the immutable provider
message/event identifiers, exact human utterance and role. Pane/scrollback
observation, Herdr state, terminal input, CLI or MCP injection, echoed text,
assistant/tool output, wrapper-created assertions and ambiguous or unavailable
role provenance are ineligible. The adapter remains a trusted translation
boundary, so conformance runs its production classification code against a fake
native transport: there is no wrapper-only success path.

Before insert, the daemon derives one canonical ordered digest vector from the
gate's persisted evidence references, preserving first occurrence, then the
release receipt and accepted artifact digest when present. The attestation must
match that vector exactly; missing, extra, wrong, duplicate or reordered values
fail. The public gate sentinel `authenticated-human-operator` matches any active
operator in the exact project, while an explicit operator ID matches only that
principal. Gate resolution rechecks the attestation's exact operator,
integration, generation, gate revision, command provenance and canonical
digest vector against current durable state. A gate with no bound artifact
digest cannot use conversational resolution.

Added requirements are:

- **FR-049:** A provider-native integration principal shall authenticate and
  dispatch only its explicit closed-operation subset under hash-only, exact
  project/session/run/provider-session/generation authority without widening
  agent or operator authority.
- **FR-050:** Conversational attestation and later gate resolution shall both
  match the gate's canonical ordered artifact-digest vector and exact attested
  provenance.

Acceptance additionally requires:

- **AC-040:** A real public-protocol create/read context followed by a fake-
  native-provider direct-human callback, integration attestation and operator
  gate resolution succeeds once. Missing/extra/wrong/duplicate/reordered
  digests; echo, assistant/tool, injected, ambiguous and unavailable roles;
  wrong provider/session/project/project-session/run/operator/generation;
  expired/revoked/insufficient credentials; every ungranted or non-integration
  operation; agent/operator-dispatch fallthrough; message replay; changed gate revision; changed
  command provenance and restart all fail closed. Durable and rendered output
  contains no `afi_` fragment, and disabled provider integration leaves typed
  Console resolution available.

### 32.18 Budgeted ephemeral review and revision-bound Console decisions

A task-bound ephemeral `provider-action.dispatch` spawn requires a delegated
authority with a hard `turns` dimension. The admitted turn reservation is the
positive safe-integer `maxTurns`, defaulting to one and injected into the
provider payload before identity/persistence. Every shipped adapter must prove
that ceiling at point of use: Claude receives the SDK cap; a one-shot adapter
accepts exactly one and rejects a larger value. Provider calls and concurrent
turns reserve one when configured. Each configured cost, provider-qualified
token or wall-clock dimension is also reserved under its exact unit. Dimensions
that the operation cannot consume, such as descendants, message bytes or
artifact bytes, are neither debited nor fabricated as provider usage.

The daemon rechecks the task's non-terminal state, atomically reserves the
complete applicable vector and inserts an immutable provider action bound to
the exact authority and task. Failure of any predicate or ledger change rolls
back all of them before provider work. While that action is open, the task
cannot commit a terminal transition. Existing-action identity/replay is checked
first, so an exact replay still returns its committed result after the task has
later become terminal; a new action does not.

Task-bound answer-bearing dispatch does not hold a public protocol request open
for the provider turn. After the immutable action and full budget reservation
and command receipt commit together, Fabric queues exactly one daemon-owned
completion and may return the `prepared` or `dispatched` action receipt. A
bounded FIFO worker atomically claims `prepared -> dispatched` only when shared
provider-turn capacity is available. `provider-action.read` observes that same action
until terminal evidence supplies the bounded non-review answer or, for a
certifying review, the answer digest and safe parsed result plus result digest.
Connection closure, protocol timeout and exact command/action replay do not
cancel or duplicate the effect. For ordinary noncertifying actions, live
reconciliation observes locally owned prepared/dispatched work without lookup
or quarantine. Every certifying action instead uses the sole recovery owner in
section 32.19.8. Daemon shutdown drains tracked work before closing its adapter
and closes SQLite; restart uses its typed recovery rather than blind replay.

Terminal evidence settles every dimension exactly once: proven usage is
consumed, unused reservation is released, concurrency is released, and an
unreported applicable dimension becomes usage-unknown. Ambiguity retains the
reservation while lookup may still prove the result. Quarantine freezes only
unproved dimensions. An authenticated action reconciliation may later replace
unknown values with exact adapter evidence and unfreeze a dimension when no
other unknown owner remains. Restart applies the same transitions from the
persisted action binding and cannot release or spend twice. Delegation computes
available capacity as granted minus reserved minus consumed.
Section 32.19 is the closed certifying-review exception: every proved-effect
terminal settles exact authenticated usage or conservatively charges the
remaining reservation, so it never enters generic usage-unknown recovery.

The closed Attention summary may include `gateBinding` only as this shape:

```yaml
gateBinding:
  gateId: exact-scoped-gate
  gateRevision: positive-current-revision
  coordinationRunId: exact-row-run
```

The daemon derives it from an existing pending/deferred scoped gate whose
project session and coordination run equal the Attention row. Missing, closed,
cross-session or cross-run candidates omit the binding; the Console cannot
parse an item title or accept operator text as a substitute.

A bound intake read may include `chairRequestSeed` containing only the durable
prior request's conversation ID/base revision and the exact current run chair's
agent/provider-session target. It is omitted when that correlation or current
target cannot be proved. A successor `Discuss` or `Request changes` operation
uses the normal revision-CAS intake-revise request with a new task request
bound to the successor intake revision, existing gates and artifact digests.
No projection itself mutates state or transfers authority.

Added requirements are:

- **FR-051:** Ephemeral provider review shall atomically reserve, durably bind,
  settle, release or freeze every applicable delegated provider-budget
  dimension across concurrency and restart.
- **FR-052:** Attention gate and intake chair-request projections shall be
  strict, daemon-derived, revision-bound and incapable of conferring authority.

Acceptance additionally requires:

- **AC-041:** Concurrent bounded spawns cannot overbook any applicable unit;
  every adapter enforces the admitted turn ceiling; terminal lookup settles
  once after restart; ambiguity retains; invalid/unprovable lookup freezes only
  affected units; later exact reconciliation unfreezes them; exact replay adds
  no reservation and survives later task completion; exhausted/unknown budgets,
  task-completion races and all terminal task states reject new provider work.
- **AC-042:** Projection fixtures prove a live same-session/run gate and a
  durably correlated current-chair intake seed, while closed, missing, stale,
  malformed and cross-boundary candidates fail closed or omit the optional
  field. Console review/confirm tests then resolve/revise only those exact
  bindings.
