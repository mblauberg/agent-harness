`runs` is the current revision owner. Authority rotation compare-and-sets the
current tuple, appends the next contiguous history row, increments both
authority and run revisions and revokes every active Git grant under the old
tuple in one transaction. `runs.dependency_revision` remains the canonical
dependency owner; no grant-local counter may substitute for either revision.
The history primary key is `(project_session_id, coordination_run_id,
authority_revision)`. The exact four-column tuple `(project_session_id,
coordination_run_id, authority_revision, authority_ref)` is `UNIQUE`, so the
existing `operator_git_effect_bindings` composite foreign key has a valid parent
key; the exact six-column tuple `(project_session_id, coordination_run_id,
authority_revision, authority_ref, git_allowlist_epoch, git_allowlist_digest)`
is likewise declared `UNIQUE`, so the allow-list-bound `operator_git_grants`
composite foreign key also has a valid parent key.
The history has a composite foreign key to `runs`. Insert/update triggers require the current
`runs` authority tuple to have exactly one matching immutable history row.
Adding, replacing or removing `git_allowlist_v1` appends authority history and
advances the run's authority revision/ref and allow-list epoch/digest in the
same transaction. No other run/session/dependency revision change advances the
allow-list epoch.

The daemon also persists two trusted registries before accepting a grant:

- `git_execution_profiles` binds profile ID/revision, Git binary path/version/
  digest, object format, deterministic backend IDs, sanitised config/environment
  digest, helper/sandbox registry digest and hard result bounds. Trusted machine
  configuration alone may add a profile; project configuration may only select
  an allow-listed profile.
- `git_remote_registrations` binds registration ID/revision/generation,
  project, display name, normalised secret-free target identity/digest,
  transport kind, remote-port adapter/contract and credential-selector digest.
  Retargeting appends a revision and advances generation. One display name may
  have only one active target per project, but that name is never a foreign key
  or authority identity.

Registry lifecycle changes increment daemon global state. Profiles and remote
registrations contain no credential value or project-selected executable. A
grant/action/recovery lookup references their exact composite identity and
digest; it never resolves authority from `.git/config`.

The closed logical grant shape is:

```sql
CREATE TABLE operator_git_grants (
  grant_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  session_generation INTEGER NOT NULL CHECK (session_generation >= 1),
  issuing_session_revision INTEGER NOT NULL CHECK (issuing_session_revision >= 1),
  coordination_run_id TEXT NOT NULL,
  issuing_run_revision INTEGER NOT NULL CHECK (issuing_run_revision >= 1),
  issuing_dependency_revision INTEGER NOT NULL CHECK (issuing_dependency_revision >= 1),
  authority_ref TEXT NOT NULL,
  authority_revision INTEGER NOT NULL CHECK (authority_revision >= 1),
  git_allowlist_epoch INTEGER NOT NULL CHECK (git_allowlist_epoch >= 1),
  git_allowlist_digest TEXT NOT NULL,
  repository_root TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  execution_profile_id TEXT NOT NULL,
  execution_profile_revision INTEGER NOT NULL CHECK (execution_profile_revision >= 1),
  execution_profile_digest TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('launch-envelope','operator-command')),
  source_digest TEXT NOT NULL,
  constraints_json TEXT NOT NULL,
  grant_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active','revoked')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (grant_id, revision),
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY (project_session_id, coordination_run_id,
               authority_revision, authority_ref,
               git_allowlist_epoch, git_allowlist_digest)
    REFERENCES run_authority_revisions(
      project_session_id, coordination_run_id, authority_revision,
      authority_ref, git_allowlist_epoch, git_allowlist_digest),
  FOREIGN KEY (execution_profile_id, execution_profile_revision)
    REFERENCES git_execution_profiles(profile_id, revision),
  CHECK (length(authority_ref)=71 AND substr(authority_ref,1,7)='sha256:'),
  CHECK (length(grant_digest)=71 AND substr(grant_digest,1,7)='sha256:'),
  CHECK ((state='active' AND revoked_at IS NULL) OR
         (state<>'active' AND revoked_at IS NOT NULL))
);
```
