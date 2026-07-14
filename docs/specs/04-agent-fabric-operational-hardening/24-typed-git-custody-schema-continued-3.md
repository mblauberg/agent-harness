
`grant_digest` hashes the immutable grant identity, captured issuing session/
run/dependency provenance, authority and allow-list tuple, repository/worktree,
execution profile, normalised child constraints, source authority and expiry;
later revocation fields are excluded. Launch custody may insert a grant only
from the exact approved launch-envelope digest. Later creation/revision/revocation uses a
separate previewed `git-authorise` operator command, verifies its capability and
independently attested human provenance, and proves every child row is a
positive subset of the current run `git_allowlist_v1`. `git` cannot call this
path. Missing parent allow-list rows, negative-only authority or any widened
dimension fails before insert.

A revision's binding and constraints are immutable; replacement appends the
next contiguous revision and revokes the prior active revision atomically. Only
one compare-and-set `active -> revoked` lifecycle change is allowed. At most
one revision of a grant is active. Point-of-use indexes cover expiry,
revocation/state, session generation, authority revision/ref, allow-list
epoch/digest, execution profile and remote registration generation. Separate
audit indexes expose issuing session/run/dependency provenance; current-value
queries never compare those issuance fields with the live orchestration
revisions. A grant record never contains a bearer capability, remote
credential, URL with credentials, Git argument vector or executable.

Gate-only identity is owned before gate creation by one bounded table:

```sql
CREATE TABLE git_operation_drafts (
  draft_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  draft_request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  observed_session_revision INTEGER NOT NULL,
  session_generation INTEGER NOT NULL,
  coordination_run_id TEXT NOT NULL,
  observed_run_revision INTEGER NOT NULL,
  observed_dependency_revision INTEGER NOT NULL,
  authority_ref TEXT NOT NULL,
  authority_revision INTEGER NOT NULL,
  git_allowlist_epoch INTEGER NOT NULL,
  git_allowlist_digest TEXT,
  draft_kind TEXT NOT NULL
    CHECK (draft_kind IN ('mutation','custody-resolution')),
  operation_id TEXT NOT NULL UNIQUE,
  operation_kind TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  binding_json TEXT NOT NULL,
  draft_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN
    ('open','gate-bound','consumed','stale','expired','cancelled')),
  expires_at INTEGER NOT NULL,
  consumed_command_id TEXT,
  terminal_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (operator_id, project_id, project_session_id, draft_request_id),
  UNIQUE (draft_id, operation_id),
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY (operation_id) REFERENCES operation_admissions(operation_id),
  CHECK ((state='consumed')=(consumed_command_id IS NOT NULL)),
  CHECK ((state IN ('stale','expired','cancelled'))=
         (terminal_reason IS NOT NULL))
);
```

The canonical closed `binding_json` is decoded by the same mutation or custody-
resolution codec as Spec 01, never as open JSON. Identity/binding/authority/
observation/expiry fields are immutable; only one-step revisioned lifecycle
fields advance. `draft_digest` hashes every immutable field including
`operation_id`; lifecycle/consumption fields are excluded. Draft creation and
its `prepared` operation admission commit together. Exact request replay
returns the same row; changed request content
under the dedupe key conflicts. Drafts have a bounded expiry and no repository
reservation, generic effect custody, grant use or liveness contribution.
The existing operator command journal owns draft `create`/`cancel` Preview/
Commit; the draft table is not another command or effect journal.

One active gate association is permitted per draft operation. Gate binding
compare-and-sets `open -> gate-bound`. Confirmed final Commit alone may consume
`gate-bound -> consumed` and admission `prepared -> authorised` in the same
transaction that creates mutation custody/reservation or records custody
resolution. Final Preview performs no lifecycle write. A binding mismatch
reported by Preview changes nothing; draft reconciliation or a confirmed Commit
compare-and-sets the draft to `stale` without creating effect rows. Expiry or
explicit cancellation uses its matching terminal state. Each terminal path
cancels the prepared admission and supersedes every associated gate
transactionally. No terminal draft can be reopened, rebound or copied into a
new operation ID. Gate rejection/cancellation/supersession cancels its draft;
gate deferral leaves the bounded draft `gate-bound` until another terminal path.

The common-directory reservation is also a persisted logical owner, not an
in-memory mutex:

```sql
CREATE TABLE git_mutation_reservations (
  custody_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  git_common_dir TEXT NOT NULL,
  common_dir_identity_digest TEXT NOT NULL,
  lock_plan_digest TEXT NOT NULL,
  state TEXT NOT NULL
    CHECK (state IN
      ('reserved','dispatching','conflict','ambiguous','quarantined',
       'released','retired')),
  owner_instance_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (custody_id, generation),
  FOREIGN KEY (custody_id) REFERENCES operator_effect_custody(custody_id),
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id)
);
CREATE UNIQUE INDEX one_active_git_mutation_per_common_dir
  ON git_mutation_reservations(git_common_dir)
  WHERE state IN
    ('reserved','dispatching','conflict','ambiguous','quarantined');
```

Canonical/no-follow common-directory identity, digest and lock plan are
immutable. State and owner advance only through custody-coupled compare-and-set
transitions. A terminal machine-proved applied/no-effect/rejected outcome
releases the row in the same transaction; conflict, ambiguity and quarantine
retain it. A separately authorised typed continue or abort atomically
transfers a predecessor conflict
reservation to the successor custody/generation before dispatch. Reclaim
requires proof that the recorded daemon instance is dead and may remove only
that instance's private reservation artifact, never a Git lock or project file.
Only the gate-bound human-resolution transaction below may retire an unprovable
reservation without machine outcome proof.

The one-to-one binding for the existing custody owner is logically:

```sql
CREATE TABLE operator_git_effect_bindings (
  custody_id TEXT PRIMARY KEY
    REFERENCES operator_effect_custody(custody_id),
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  prepared_session_revision INTEGER NOT NULL
    CHECK (prepared_session_revision >= 1),
  session_generation INTEGER NOT NULL CHECK (session_generation >= 1),
  coordination_run_id TEXT NOT NULL,
  prepared_run_revision INTEGER NOT NULL CHECK (prepared_run_revision >= 1),
  prepared_dependency_revision INTEGER NOT NULL
    CHECK (prepared_dependency_revision >= 1),
  authority_ref TEXT NOT NULL,
  authority_revision INTEGER NOT NULL CHECK (authority_revision >= 1),
  git_allowlist_epoch INTEGER NOT NULL CHECK (git_allowlist_epoch >= 1),
  git_allowlist_digest TEXT,
  grant_id TEXT,
  grant_revision INTEGER,
  draft_id TEXT,
  draft_revision INTEGER CHECK (draft_revision IS NULL OR draft_revision >= 1),
  gate_id TEXT,
  gate_revision INTEGER,
  repository_root TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  repository_state_digest TEXT NOT NULL,
  execution_profile_id TEXT NOT NULL,
  execution_profile_revision INTEGER NOT NULL
    CHECK (execution_profile_revision >= 1),
  execution_profile_digest TEXT NOT NULL,
  remote_registration_id TEXT,
  remote_registration_revision INTEGER,
  remote_generation INTEGER,
  remote_target_digest TEXT,
  operation_id TEXT NOT NULL,
  operation_variant TEXT NOT NULL,
  effect_binding_digest TEXT NOT NULL,
  result_recipe_digest TEXT NOT NULL,
  decision_digest TEXT NOT NULL,
  before_git_state_json TEXT NOT NULL,
  expected_terminal_state_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN
    ('prepared','dispatching','conflict','conflict-transferred','ambiguous',
     'quarantined','applied','no-effect','rejected','failed',
     'human-resolved')),
  state_revision INTEGER NOT NULL CHECK (state_revision >= 1),
  terminal_basis TEXT CHECK (terminal_basis IS NULL OR terminal_basis IN
    ('machine-proof','conflict-transfer','human-adjudication')),
  predecessor_custody_id TEXT,
  predecessor_conflict_generation INTEGER CHECK (
    predecessor_conflict_generation IS NULL OR
    predecessor_conflict_generation >= 1),
  owned_conflict_generation INTEGER CHECK (
    owned_conflict_generation IS NULL OR owned_conflict_generation >= 1),
  mutation_reservation_generation INTEGER NOT NULL
    CHECK (mutation_reservation_generation >= 1),
  lock_plan_digest TEXT NOT NULL,
  lookup_generation INTEGER NOT NULL CHECK (lookup_generation >= 0),
  lookup_evidence_digest TEXT,
  lookup_outcome TEXT CHECK (lookup_outcome IS NULL OR lookup_outcome IN
    ('exact-conflict','exact-applied','exact-no-effect','incomplete',
     'unavailable','inconsistent','inspector-unavailable',
     'remote-proof-permanently-unavailable','mixed-local-remote-evidence',
     'evidence-integrity-failure','conflict-state-unverifiable')),
  lookup_failure_signature_digest TEXT,
  lookup_observed_at INTEGER,
  resolution_eligible INTEGER NOT NULL CHECK (resolution_eligible IN (0,1)),
  resolution_eligible_lookup_generation INTEGER,
  resolution_eligible_evidence_digest TEXT,
  resolution_eligibility_reason TEXT CHECK (
    resolution_eligibility_reason IS NULL OR resolution_eligibility_reason IN
      ('inspector-unavailable','remote-proof-permanently-unavailable',
       'mixed-local-remote-evidence','evidence-integrity-failure',
       'conflict-state-unverifiable')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY (project_session_id, coordination_run_id,
               authority_revision, authority_ref)
    REFERENCES run_authority_revisions(
      project_session_id, coordination_run_id, authority_revision,
      authority_ref),
  FOREIGN KEY (grant_id, grant_revision)
    REFERENCES operator_git_grants(grant_id, revision),
  FOREIGN KEY (draft_id, operation_id)
    REFERENCES git_operation_drafts(draft_id, operation_id),
  FOREIGN KEY (gate_id, operation_id)
    REFERENCES scoped_gate_operations(gate_id, operation_id),
  FOREIGN KEY (operation_id) REFERENCES operation_admissions(operation_id),
  FOREIGN KEY (execution_profile_id, execution_profile_revision)
    REFERENCES git_execution_profiles(profile_id, revision),
  FOREIGN KEY (remote_registration_id, remote_registration_revision)
    REFERENCES git_remote_registrations(registration_id, revision),
  FOREIGN KEY (predecessor_custody_id)
    REFERENCES operator_git_effect_bindings(custody_id),
  FOREIGN KEY (custody_id, mutation_reservation_generation)
    REFERENCES git_mutation_reservations(custody_id, generation),
  CHECK ((grant_id IS NULL)=(grant_revision IS NULL)),
  CHECK ((draft_id IS NULL)=(draft_revision IS NULL)),
  CHECK ((gate_id IS NULL)=(gate_revision IS NULL)),
  CHECK ((draft_id IS NULL)=(gate_id IS NULL)),
  CHECK ((grant_id IS NULL)<>(gate_id IS NULL)),
  CHECK ((remote_registration_id IS NULL)=
         (remote_registration_revision IS NULL)),
  CHECK ((remote_registration_id IS NULL)=(remote_generation IS NULL)),
  CHECK ((remote_registration_id IS NULL)=(remote_target_digest IS NULL)),
  CHECK ((predecessor_custody_id IS NULL)=
         (predecessor_conflict_generation IS NULL)),
  CHECK ((lookup_generation=0)=(lookup_evidence_digest IS NULL)),
  CHECK ((lookup_generation=0)=(lookup_outcome IS NULL)),
  CHECK ((lookup_generation=0)=(lookup_observed_at IS NULL)),
  CHECK (lookup_evidence_digest IS NULL OR
         (length(lookup_evidence_digest)=71 AND
          substr(lookup_evidence_digest,1,7)='sha256:')),
  CHECK (lookup_failure_signature_digest IS NULL OR
         (length(lookup_failure_signature_digest)=71 AND
          substr(lookup_failure_signature_digest,1,7)='sha256:')),
  CHECK (
    (lookup_outcome IN
      ('incomplete','unavailable','inconsistent','inspector-unavailable',
       'remote-proof-permanently-unavailable','mixed-local-remote-evidence',
       'evidence-integrity-failure') AND
     lookup_failure_signature_digest IS NOT NULL) OR
    ((lookup_outcome IS NULL OR lookup_outcome NOT IN
      ('incomplete','unavailable','inconsistent','inspector-unavailable',
       'remote-proof-permanently-unavailable','mixed-local-remote-evidence',
       'evidence-integrity-failure')) AND
     lookup_failure_signature_digest IS NULL)),
  CHECK ((resolution_eligible=0)=
         (resolution_eligible_lookup_generation IS NULL)),
  CHECK ((resolution_eligible=0)=
         (resolution_eligible_evidence_digest IS NULL)),
  CHECK ((resolution_eligible=0)=
         (resolution_eligibility_reason IS NULL)),
  CHECK (resolution_eligible=0 OR
         resolution_eligible_lookup_generation=lookup_generation),
  CHECK (resolution_eligible=0 OR
         resolution_eligible_evidence_digest=lookup_evidence_digest),
  CHECK (resolution_eligible=0 OR
         resolution_eligibility_reason=lookup_outcome),
  CHECK (resolution_eligibility_reason<>'conflict-state-unverifiable' OR
         (state='quarantined' AND
          (owned_conflict_generation IS NOT NULL OR
           predecessor_conflict_generation IS NOT NULL)))
);
```
