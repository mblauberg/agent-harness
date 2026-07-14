# Project Fabric Console intake and continuation

## Adaptive task intake

### Conversational intake

The Console shall provide a task input with an expandable structured plan. The
human may instead open a detailed form or choose `Discuss/scoping first`.

Each intake is a Fabric-owned revisioned entity with a stable `intake_id` and
states `draft`, `awaiting-chair`, `discussing`, `awaiting-human`, `accepted`,
`deferred` or `cancelled`. `Discuss/scoping first` commits a correlated Fabric
request containing that intake revision, gate and artifact references before
Herdr focuses the chair. Chair replies, revised plans and artifact digests
update the same intake. Duplicate submission is idempotent; restart or
compaction resumes the persisted state instead of creating another discussion.

The chair assesses:

- intent, uncertainty and risk;
- task size, expected duration and oracle quality;
- decomposition and useful parallelism;
- specialities, model families and review pressure;
- write scopes, worktrees and repository interactions;
- likely gates, evidence and completion conditions.

The resulting plan is a forecast, not a lock. It exposes current topology,
models, worktrees, authority, outputs and checks. The chair may revise it as new
evidence appears.


## Fresh implementation context

Routine, minor and reversible work may proceed automatically in the current
chair session when it:

- needs no spec or ADR decision;
- remains within one bounded write surface;
- has a strong objective oracle;
- needs no migration, external effect or destructive Git action;
- does not introduce an auth, privacy, legal, financial or release boundary.

Substantial or larger work shall not flow directly from scoping into
implementation. It shall create an accepted scope artifact and launch a fresh
implementation session from a compact, digest-bound handoff. Fresh means a new
provider context/session; it does not mean deleting or mutating the scoping
session. The old session remains resumable or is closed under retention policy.
Within a coordinated run, that fresh context is a lead under the existing chair
or replaces the chair only through checkpoint, handoff and generation-bound
takeover. An independent coordination run may start its own chair. No Fabric
run ever has two concurrent chairs.

A fresh implementation session is also required when any of these apply:

- a spec or ADR controls the work;
- multiple concurrent writers or worktrees are proposed;
- the work crosses major modules or is expected to span sessions;
- migration, weak-oracle or crucial-tier behaviour is present;
- the scoping context is materially polluted or near its safe context limit.

The chair may choose a fresh session earlier. A deterministic policy sets the
minimum; model judgement may escalate but not silently weaken it.
