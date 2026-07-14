cancelled or failed project close is valid only from `draft`,
`awaiting_launch`, terminal `launch_failed`, or `awaiting_acceptance`; the last
case first supersedes the whole acceptance cycle. Accepted close still requires
`awaiting_acceptance`. Unsafe live, ambiguous, recovery or quarantine states
must use their typed lifecycle owner instead of generic close.

Clean close, stop and recovery-abandon commit an immutable launched-chair
bridge-retirement record only after the exact run/session is terminal, its
current chair lease and bridge capability are revoked and its agents are
archived. Active child bridges atomically become `none` with their provider and
capability binding cleared. Startup and live supervision ignore only a valid
retirement record; a lost/pending bridge remains recovery-owned. Durable
retirement commits before best-effort volatile transport removal, so crash can
leak neither authority nor a fabricated loss. Recovery-abandon additionally
requires every unrelated task, workstream, lease, provider action, result,
message, gate, barrier, resource and external effect settled, abandons the
exact run/current-chair memberships with reason, revokes remaining
capabilities, archives agents and advances membership revision once.

A retained launched-chair handoff is not the generic database-only takeover.
It uses typed live-handoff custody bound to the current bridge generation,
handoff artifact, successor retained child bridge, provider contract and
successor promotion observation. It revokes the predecessor capability/lease,
promotes and rebinds the exact provider bridge, installs one successor chair
lease/membership and advances session/run generations atomically. Missing or
ambiguous promotion remains fenced; loss recovery never fabricates a graceful
handoff.

In coordinated mode `fabric.v1.workstream.create` is a chair-only
`workstreams.v1` operation. One transaction creates or reuses the root Fabric
task/team, narrowed lead authority and budget, hierarchical resource scope,
workstream row and required project-session membership. It creates no run,
chair or cross-session authority. Terminal workstream state derives from its
root task/team sources. Independent concurrency instead creates another
project session.

Exceptional project-session states are `launch_failed`, `launch_ambiguous`,
`reconciling`, `visibility_degraded`, `recovery_required`, `quarantined` and
`cancelled`. `closed` and `cancelled` are terminal. `launch_failed` becomes
terminal only through an explicit cancel/failure transition. Ambiguous,
recovery and quarantine states remain non-terminal. Session generation changes
only on authority rotation or takeover and fences prior operator and
chair-facing grants.

### 32.2 Human operator principal and commands

The Console authenticates as a distinct `operator` principal, never as an
agent or chair. An operator capability is revocable and binds:

- one operator, project, optional project session and principal generation;
- an explicit subset of `read`, `decide`, `steer`, `pause`, `resume`,
  `cancel`, `drain`, `stop`, `launch`, `takeover`, `git`, `git-authorise`,
  `git-custody-resolve`, `agent-lifecycle-recovery-issue` and
  `external-effect` operations;
- issue and expiry times no later than the project session;
- the current project/session generation; and
- for takeover, the handoff digest, old chair generation, expected run and
  session revisions and compare-and-set target revision.

A project-bound `launch` capability may create a reviewed session before a
session ID exists. Every other session mutation requires the exact session ID
and generation. Possession of `decide` does not imply `launch`, `takeover` or
`external-effect`. `git` admits an already-authorised typed mutation;
`git-authorise` may issue or revoke a narrower Git grant but cannot execute one.
`git-custody-resolve` may adjudicate only an eligible unprovable Git custody and
cannot execute Git or issue a grant. `agent-lifecycle-recovery-issue` is a
session-bound local-control action only: it may issue the exact narrow
fresh-rotate capability in section 32.20 after its bound consequential gate,
but cannot rotate, call a provider, take over a chair or abandon an agent.
None implies another.

Every operator mutation carries the capability, stable command ID, expected
revision, actor and provenance. The daemon derives project and actor identity
from the authenticated connection, authorises the exact operation before the
mutation and journals before/after state plus linked evidence. Retrying the
same command and payload returns the committed result. Reusing a command ID
with changed payload, project or expected revision fails as a conflict. Absent,
expired, revoked, wrong-project, wrong-generation and action-insufficient
capabilities fail closed.

Direct conversational input may resolve a gate only through an independently
attested operator-input record containing the provider message ID, exact human
utterance, input-channel provenance, expected gate revision and bound artifact
digests. Echoes, pane or CLI injection, agent-authored text and unavailable
direct-input provenance cannot approve. Consequential decisions also require a
persisted preview and a separate explicit confirmation command.

### 32.3 Revisioned intake and scoped gates

Task intake is a Fabric entity with stable `intake_id`, monotonically
increasing revision and states `draft`, `awaiting-chair`, `discussing`,
`awaiting-human`, `accepted`, `deferred` or `cancelled`. Submission commits the
intake revision, gate references and artifact digests inside its correlated
chair request before any wake-up. A duplicate dedupe key has one effect.
Replies, plan revisions and artifact digests update the same intake after
daemon, Console or provider restart or provider compaction.

A scoped gate records:

```yaml
scoped_gate:
  gate_id: stable-id
  project_session_id: stable-id
  coordination_run_id: stable-id
  scope_kind: task-or-subtree-or-run-or-release
  affected_task_ids: []
  dependency_revision: compare-and-set-integer
  blocked_operation_ids: []
  enforcement_points: [task-readiness, operation, scoped-barrier]
  question: human-readable
  reason: human-readable
  options: []
  recommendation: human-readable-or-empty
  consequences: []
  evidence_refs: []
  revision: compare-and-set-integer
  created_by_ref: authenticated-operator-or-explicit-policy
  expected_approver_ref: authenticated-operator-or-explicit-policy
  resolved_by_operator_id: optional-until-human-resolution
  deadline: optional
  default: optional-non-approving-action
  status: pending-or-approved-or-rejected-or-deferred-or-cancelled-or-superseded
  release_binding: optional-accepted-delivery-receipt-artifact-digest-action-and-target
```

Gate creation, dependency changes and resolution are transactional. The daemon
advances the owning project session's membership revision exactly once whenever
gate creation adds required membership or terminal gate resolution/supersession
settles it. A stale membership client cannot remain current across either
change. The daemon
rechecks applicable unresolved gates before task claim, start and resume;
before each named consequential operation; and before the matching scoped
barrier closes. Dependent descendants block only where the persisted scope and
dependency revision require it. Unrelated siblings remain runnable. A timeout
may alert or defer but never approves.

An operation enforcement check is always target-bound. Its closed target is
either `{kind: run}` for an operation whose effect belongs to the exact
`coordinationRunId`, or `{kind: task, taskId}` for an operation whose effect
belongs to one exact task in that run. The request also carries the current
run-owned `dependencyRevision`. A task/subtree gate matches only the task form
when that task occurs in the gate's affected-task binding at the same dependency
revision; it never blocks a run target or an unrelated sibling. A run/release
gate may match either form inside its exact run. Omission, a task from another
run, a stale dependency revision and substitution of the run form for a
task-owned effect fail closed rather than widening or bypassing the gate.

`dependency_revision` is the owning coordination run's dependency-graph
revision. Every dependency-edge or affected-set mutation increments it and, in
the same transaction, recomputes descendants and rebinds every applicable open
gate. Newly added descendants become blocked immediately; removed descendants
become unblocked only after the rebinding commits. A graph mutation that cannot
produce a complete rebind fails and retains the prior graph and gate revision.

Policy may create, defer, cancel or notify about a gate. Spec, one-way-door,
release, external-effect, irreversible-action and final-acceptance gates require
an authenticated human as both expected approver and resolver; policy can
never approve them. Release-scoped gates additionally bind the exact accepted
delivery receipt, artifact digest, promotion action and target, directly or by
a schema-validated release receipt. Broad session or `external-effect`
authority cannot satisfy that binding.

Final acceptance uses the same gate authority rather than a parallel approval
record. The public `acceptance_ref` is the digest of the complete sorted array:

```text
sha256(canonical-json({
  kind: "project-session-final-acceptance",
  projectSessionId,
  gates: [
    {
      gateId,
      coordinationRunId,
      gateRevision,
      status: "approved",
      resolution,
      evidenceRefs
    }
  ]
}))
```

The `gates` array is non-empty and sorted by `coordinationRunId`, then
`gateId`; it contains exactly one binding for every run currently awaiting
acceptance and no binding for terminal history. Only gates satisfying section
32.1 may produce that reference. Historical
terminal runs do not need to be reopened for session acceptance: `closed` run
memberships are reconciled, `cancelled`/terminal `launch_failed` memberships
are explicitly abandoned, and only current `quiescing` runs transition to
`awaiting_acceptance`. Reopen and accepted close mutate only runs currently in
`awaiting_acceptance`; pre-existing terminal history retains its terminal
state.
Reopen supersession increments each affected gate revision, retains its prior
resolution only as audit evidence, and removes it from the approved candidate
set; it does not fabricate a replacement approval.
An approved/rejected human-resolved gate and its later superseded audit row
remain reconciled history. A cancelled gate, or a pending/deferred gate ended
by `system-supersession`, is abandoned with an explicit durable reason.

Identifier-only task gates do not exist in the current baseline. Only scoped
gates with explicit enforcement bindings are admitted; no run or release scope
is inferred. There is one gate owner. Approver-less gate creation and
resolution fail closed.

### 32.4 Hierarchical resource admission

Budgets extend from project to project session, coordination run, team and
agent. Every dimension uses the existing unit-key rules and reports `used`,
`reserved`, `remaining` and `unknown`. Admission reserves every affected
ancestor atomically before dispatch, so concurrent runs cannot overbook a
project or session. Terminal completion releases unused reservation; ambiguous
effects retain their stable reservation until reconciliation. Unknown hard
usage freezes new reservations when remaining capacity cannot be proven, while
already-authorised bounded work may reach a terminal state. Child limits only
narrow their parent.

Active writer admission additionally records canonical source prefixes,
repository root, repository-owned worktree path and writer generation. The
daemon rejects intersecting active prefixes before launch. A worktree does not
replace authority, sandbox or predecessor-revocation evidence.

### 32.5 Atomic request, result and callback delivery

Answer-bearing paired work shall create a task and correlated request message
before Herdr wake-up. The request binds task and request revisions,
conversation and message IDs, target agent/provider session, expected
artifacts, acknowledgement requirement, dedupe key, response deadline and a
stable callback ID.

The peer's correlated reply, terminal task result and pending result-delivery
obligation commit in one SQLite transaction or one transactionally equivalent
outbox transition. None may be externally visible without the others. Result
delivery is distinct from mailbox acknowledgement and has states `pending`,
`claimed`, `provider-accepted`, `consumed`, `overdue` and `abandoned`. Its
claim generation, callback ID, request/reply/task revisions and payload digest
make claim, injection and consumption idempotent across daemon, Console,
requester restart and compaction.

A deadline moves a still-required result to `overdue`, alerts the requester and
keeps its dependent barrier open. Same-action retry, reassignment or
abandonment is an explicit revisioned transition; the fabric never blindly
redispatches. A late reply remains evidence and cannot complete reassigned or
abandoned work. Pane state and scrollback never satisfy result delivery.

`fabric_task_request` commits the task, request, recipient deliveries, response
deadline, callback and dependent-barrier link before wake-up.
`fabric_task_complete_with_reply` verifies the task owner, lease generation,
task/request revisions and callback generation, then atomically commits the
reply, terminal result, artifact references and pending callback. Typed claim,
provider-accept, consume, same-action retry, reassign and abandon operations
complete the result-delivery state machine.

### 32.6 Chair takeover

Chair loss freezes the old chair generation, delivery and new authority grants.
Takeover succeeds only when the old generation is revoked or otherwise fenced,
a persisted handoff digest exists, and a takeover-capable operator command
matches the project session, run, expected chair generation and revisions.
The reassignment and new chair lease commit atomically. Peer presence, pane
presence or lease expiry alone cannot promote a chair.

### 32.7 Public protocol surface

The shared typed client shall expose project-session, membership, intake,
operator-command, scoped-gate, resource-reservation, request-result and
takeover operations. Agent MCP operations remain principal-scoped; the Console
uses a separate operator client and shall not import daemon internals. New
operations are absent from a client whose negotiated protocol capability does
not include them.

### 32.8 Added requirements and acceptance scenarios

- **FR-020:** Project-session creation, membership and lifecycle transitions
  shall be revisioned and atomic with their closure predicates.
- **FR-021:** Operator principals and commands shall enforce exact project,
  action, generation, expiry and revision boundaries with idempotent audit.
- **FR-022:** Scoped gates shall block only their persisted task/subtree/run or
  release scope at every declared enforcement point.
- **FR-023:** Intake discussion shall bind the intake revision, gates and
  artifact digests into its correlated request and survive duplicate
  submission, restart and compaction with one stable intake identity.
- **FR-024:** Project/session/run/team/agent budgets shall reserve and reconcile
  every configured dimension without overbooking.
- **FR-025:** Correlated reply, terminal task result and result-delivery outbox
  shall be atomic and replay-safe.
- **FR-026:** Chair takeover shall require generation fencing, a bound handoff
  and an exact takeover capability.
- **FR-027:** Result-delivery claim, deadline, retry, reassignment,
  abandonment and consumption shall persist independently of mailbox delivery.
- **NFR-011:** Console and other operator clients shall use only the negotiated
  public protocol and shall never mutate SQLite directly.
- **NFR-012:** Duplicate and crash-replayed session, intake, gate, request,
  completion and delivery commands shall have one durable effect.
- **NFR-013:** Operator audit shall record authenticated actor, provenance,
  command ID, revisions, before/after state and evidence without capability
  values.
- **NFR-014:** Project-session protocol shall remain usable without Console,
  Herdr or GitHub.
