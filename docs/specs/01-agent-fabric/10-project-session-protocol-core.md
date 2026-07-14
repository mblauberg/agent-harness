
## 32. Project-session and operator protocol amendment

This amendment is approved by Spec 05 v1.0 and the direct implementation
instruction of 11 July 2026. It extends the shared protocol; Spec 05 continues
to own Console product behaviour and Spec 04 owns persistence, bootstrap and
daemon-liveness mechanics. Existing run, agent, task, lease and mailbox
contracts remain valid.

### 32.1 Project-session ownership and topology

The daemon shall persist a project session before creating its first
coordination run. A project session records:

```yaml
project_session:
  project_session_id: stable-id
  project_id: stable-id-bound-to-one-canonical-root
  mode: coordinated-or-independent
  state: draft-or-awaiting_launch-or-launching-or-active-or-quiescing-or-awaiting_acceptance-or-closed-or-exceptional
  revision: compare-and-set-integer
  generation: authority-and-takeover-fence
  authority_ref: immutable-envelope-hash
  budget_ref: root-project-session-budget
  launch_packet_ref: path-and-sha256
  membership_revision: compare-and-set-integer
  origin:
    operator_id: required-current-operator

coordination_run:
  run_id: stable-id
  project_session_id: owning-session
  chair_agent_id: exactly-one
  chair_generation: fenced-generation
  authority_ref: narrowing-envelope-hash
  authority_revision: compare-and-set-integer
  git_allowlist_epoch: monotonic-authority-fence
  git_allowlist_digest: null-or-exact-sha256
  budget_ref: run-resource-budget
  state: revisioned-run-state
  revision: compare-and-set-integer

workstream:
  workstream_id: stable-id
  project_session_id: owning-session
  coordination_run_id: accountable-run
  fabric_task_id: owning-task
  lead_agent_id: bounded-lead-not-chair
  delivery_run_id: canonical-delivery-run-reference
  revision: compare-and-set-integer
```

Membership rows explicitly bind coordination runs, delivery
runs/workstreams, tasks, leases, provider actions, required messages, artifact
obligations, gates and scoped barriers to the project session. `quiescing`
freezes new membership. A transition to `awaiting_acceptance` rechecks in the
same transaction that every run, workstream and task is terminal or explicitly
abandoned with reason; every required message and artifact obligation is
reconciled; no active lease, provider action or unresolved operator-effect
custody remains; every typed Git
custody/reservation is machine-terminal or has the exact human-resolution
record in section 32.13; and every applicable scoped barrier is closed.
`closed` additionally needs the exact acceptance or cancel/failure terminal
path. An accepted path's `acceptance_ref` is not an arbitrary receipt digest:
it is the canonical digest of the complete sorted set of approved, human-
required final-acceptance gates in the same project session, exactly one for
each run currently in `awaiting_acceptance`. Each binding includes gate ID,
owning run, gate revision, approved status, persisted resolution and evidence
references. Every gate must be run-scoped, enforce the exact
`fabric.v1.project-session.close` operation, name the authenticated human
operator sentinel or the resolving operator, and contain a typed-Console or
provider-native explicit confirmation. The daemon recomputes the digest from
current durable state in the close transaction. Missing, stale, substituted,
duplicate, extra, cross-run, cross-session or non-human acceptance fails
closed. Historical terminal runs require no new acceptance gate and retain
their terminal disposition. Thus one run's authority can never accept another
nonterminal independent run.
Such a final-close gate may be approved only while its session and owning run
are `quiescing`, after every task, non-chair lease, provider action, required
result/message, artifact obligation, non-final gate, barrier and unrelated
operator effect is settled. Active-session approval fails closed. Quiescing
forbids new work and new membership,
so an approved gate cannot outlive a subsequent source mutation; only source-
valid settlement remains permitted.

Every exit from `quiescing` other than the exact receipt-bound transition to
`awaiting_acceptance`, and every exit from `awaiting_acceptance` other than
accepted close, invalidates the current acceptance cycle. Returning
`quiescing -> active`, reopening `awaiting_acceptance -> active`, or entering a
reconciliation/recovery/quarantine detour supersedes every prior gate that names
`fabric.v1.project-session.close`, whether pending, deferred or approved, and
terminalises any active membership for those gates. A later drain/close
requires newly created gates and fresh explicit human resolutions. No prior
acceptance reference or confirmation may authorise work or evidence changed
after that exit.
Pending or deferred gates receive a closed `system-supersession` terminal
disposition containing a typed durable cause (`operator-command`, `chair-
bridge-loss` or `system-recovery`) with its exact reference, reason and
timestamp. It carries
no operator ID, approval or evidence authority and is forbidden for approved
or rejected status. An already human-resolved gate retains its human resolution
as historical audit evidence when its status becomes superseded.
The `system-supersession` result arm is exposed only when the connection
negotiates `gate-system-supersession.v1`. A peer without that additive result-
shape feature receives `FEATURE_UNAVAILABLE` before any read/replay response
would contain the new arm; existing human-resolution v1 shapes remain byte-
compatible.
