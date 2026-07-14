
### 9.13 Typed Git grants, effect custody and recovery

Spec 01 section 32.13 owns `GitActionAuthorisation` and the observable Git
semantics. This section owns their additive persistence, the one production Git
effect owner and crash recovery. It does not authorise a Git mutation, push,
pull-request merge, release or deployment.

The next unused additive migration after the operator-lifecycle schema shall
add immutable revisioned Git grants and a one-to-one Git binding for the
existing `operator_effect_custody` owner. Its ordinal is assigned at serial
integration so it cannot collide with another already approved additive
migration. The migration shall not create a second operator command journal or
a parallel effect state machine.

The migration adds `runs.authority_revision` and `runs.git_allowlist_epoch`,
each initialised to one, plus nullable `runs.git_allowlist_digest` and immutable
`run_authority_revisions(project_session_id, coordination_run_id,
authority_revision, authority_ref, git_allowlist_epoch, git_allowlist_digest,
activated_at_run_revision, created_at)`.
