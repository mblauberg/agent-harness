# Run plan declaration

Fabric owns only the run-to-plan binding. Plan content remains a project
delivery artifact identified by an `ArtifactRef` path and SHA-256 digest.
Feature `run-plan-declaration.v1` exposes one chair-only operation:

~~~yaml
fabric.v1.run.plan.declare:
  request:
    runId: exact-authenticated-coordination-run
    planArtifactRef: {path: project-relative-path, digest: sha256-prefixed-digest}
    expectedAcceptedScopeRevision: positive-current-revision
    declaredTaskDenominator: optional-positive-integer
  result:
    runId: exact-coordination-run
    planArtifactRef: exact-request-ref
    acceptedScopeRef: exact-active-scope-ref
    acceptedScopeRevision: exact-locked-revision
    planRevision: positive-per-run-revision
    declaredTaskDenominator: positive-integer-or-null
    declaredByAgentId: authenticated-current-chair
    declaredAt: Fabric-timestamp
~~~

The authenticated principal must be the exact current chair and active chair
lease holder for `runId`; another agent receives `TASK_NOT_OWNER`. The request
run must equal the authenticated coordination run. Fabric resolves the one
active accepted scope and compares its revision with
`expectedAcceptedScopeRevision`; mismatch returns `STALE_REVISION` before any
write. A declaration appends one immutable `run_plan_declarations` row.
`planRevision` starts at one and increments contiguously per run. Replanning
always appends and advances the run projection revision; no declaration is
updated or deleted.

A declaration with a denominator enables the `finite` progress arm bound to
that exact `planRevision`. A declaration without one yields the existing
`open` arm. The denominator is never inferred from task rows: cancelled tasks
remain in the declared total and do not increment the completed numerator. If
classified task counts exceed the declared total, projection fails closed to
`unknown`. Result-shape features `declared-run-progress.v2` and
`run-identity-projection.v2` replace their v1 predecessors as current-only
cutovers; an unknown or missing v2 field is rejected, never translated.
