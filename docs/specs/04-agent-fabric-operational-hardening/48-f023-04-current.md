
### 9.13 Typed Git grants, effect custody and recovery

Spec 01 section 32.13 owns `GitActionAuthorisation` and the observable Git
semantics. This section owns their current persistence, the one production Git
effect owner and crash recovery. It does not authorise a Git mutation, push,
pull-request merge, release or deployment.

The current baseline stores immutable revisioned Git grants and a one-to-one
Git binding for the existing `operator_effect_custody` owner. It uses the
existing operator command journal and effect state machine; it creates
neither a second journal nor a parallel state machine.

The current `runs` relation has `authority_revision` and
`git_allowlist_epoch`, each initialised to one, plus nullable
`git_allowlist_digest` and immutable
`run_authority_revisions(project_session_id, coordination_run_id,
authority_revision, authority_ref, git_allowlist_epoch, git_allowlist_digest,
activated_at_run_revision, created_at)`.
