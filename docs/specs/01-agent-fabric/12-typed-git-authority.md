
### 32.13 Typed Git action authority and exact semantics

Possession of a session-bound operator capability containing `git` admits only
the typed Git action family. It never authorises a mutation by itself. Every
`OperatorGitIntent` shall additionally carry one closed
`GitActionAuthorisation` whose common binding is:

```yaml
git_action_authorisation:
  project_id: exact-authenticated-project
  project_session_id: exact-session
  expected_session_revision: compare-and-set-integer
  expected_session_generation: fenced-generation
  coordination_run_id: exact-accountable-run
  expected_run_revision: compare-and-set-integer
  expected_dependency_revision: compare-and-set-integer
  authority_ref: exact-active-run-authority-sha256
  expected_authority_revision: compare-and-set-integer
  expected_git_allowlist_epoch: compare-and-set-integer
  git_allowlist_digest: null-or-exact-sha256
  repository_root: exact-canonical-trusted-root
  worktree_path: exact-canonical-admitted-worktree
  repository_state_digest: exact-sha256
  execution_profile_id: exact-trusted-profile
  execution_profile_revision: compare-and-set-integer
  execution_profile_digest: exact-sha256
  operation_variant: exact-closed-variant
  remote_binding: null-or-exact-registered-target
  result_recipe_digest: exact-sha256
  operation_id: daemon-derived-stable-id
  effect_binding_digest: exact-sha256
  decision: preauthorised-or-gate-variant
```

The common binding and each variant reject unknown or missing fields. The
daemon derives project and operator identity from the authenticated connection,
then cross-checks every duplicated session, run, repository, worktree, revision
and digest against the intent, current Fabric records and a fresh typed Git
observation. `effect_binding_digest` is the canonical SHA-256 of the complete
Git effect, repository and remote bindings, execution profile, closed operation
variant, canonical before state and complete expected result recipe, excluding
only the operator credential, command ID, `operation_id` and the `decision`
variant. The preauthorised variant derives `operation_id` from authenticated
operator, project session, stable Preview ID and `effect_binding_digest`. A
gate variant obtains both immutable values from the pre-effect draft below;
it never derives gate identity from the later final Preview. Exact replay is
stable, while a later preauthorised Preview or new gate draft has a distinct
operation ID. A changed action, path, ref, remote, mode, expected object or
authority-bound state therefore requires a new Preview and decision.

`coordination_run.authority_revision` is the canonical revision owner for the
run's current authority tuple. It starts at one. Each historical
`authority_ref` value is immutable. Authority rotation appends a history row
and atomically changes the current `authority_ref`, increments
`authority_revision` and the run revision, and invalidates every grant issued
under the prior tuple. The common `expected_dependency_revision` is the same
run-owned dependency revision used by scoped gates. No implementation may
invent an authority revision from an operator command, grant row or artifact
timestamp.

`git_allowlist_epoch` is the monotonic revision of `git_allowlist_v1` inside
that same run-authority history; `git_allowlist_digest` is null only while the
allow-list is absent. Adding, replacing or removing the allow-list is an
authority rotation that advances the authority tuple and allow-list epoch in
one transaction. It is not an independent mutable policy owner.

The preauthorised variant is:

```yaml
decision:
  kind: preauthorised
  grant_id: stable-id
  expected_grant_revision: compare-and-set-integer
  grant_digest: exact-sha256
```

The coordination-run authority may contain one closed positive
`git_allowlist_v1`. Absence means that no Git grant can be issued. It names the
maximum operation variants, execution profiles, remote registrations, refs,
canonical path prefixes, worktree-creation permission, expiry and deterministic
rewrite bounds. Denies still dominate. Only launch custody materialising an
already human-approved session envelope, or a separately capable
`git-authorise` operator action with independently attested direct human input,
may issue or revoke a grant. The requested grant shall be a positive subset of
every allow-list dimension; a capability, empty parent field or omission can
never be treated as wildcard authority.

`git-authorise` is itself a closed Preview/Commit operator intent. It selects
`issue`, `revise` or `revoke`; binds the exact project/session/generation and
session/run/dependency/authority revisions; names the current allow-list epoch
and digest; and carries either the complete proposed canonical grant or the exact current
grant ID/revision/digest. Revise binds both. The daemon derives the canonical
child constraints and proposed digest, shows the complete old/new authority
diff, and binds the independently attested direct-human decision to that
Preview. The caller cannot submit opaque constraints, self-attest, reuse the
decision for another grant or receive a bearer credential in the result.

The referenced `GitActionGrant` is an immutable revisioned narrowing of that
active allow-list:

```yaml
git_action_grant:
  grant_id: stable-id
  revision: compare-and-set-integer
  project_id: exact-project
  project_session_id: exact-session
  session_generation: fenced-generation
  issuing_session_revision: exact-revision
  coordination_run_id: exact-run
  issuing_run_revision: exact-revision
  issuing_dependency_revision: exact-revision
  authority_ref: exact-active-run-authority-sha256
  authority_revision: exact-revision
  git_allowlist_epoch: exact-issuance-epoch
  git_allowlist_digest: exact-sha256
  repository_root: exact-canonical-root
  worktree_path: exact-canonical-worktree
  execution_profile_id: exact-trusted-profile
  execution_profile_revision: exact-revision
  execution_profile_digest: exact-sha256
  operation_variants: closed-non-empty-concrete-set
  remote_bindings: closed-registered-target-set
  refs: closed-fully-qualified-ref-set
  path_prefixes: closed-canonical-relative-prefix-set
  source_authority:
    kind: launch-envelope-or-operator-command
    digest: exact-sha256
  expires_at: bounded-timestamp
  revoked_at: null-or-timestamp
```

The daemon hashes the immutable identity, issuing session/run/dependency
provenance, authority and allow-list tuple, repository, constraint and expiry
fields of the closed canonical grant to `grant_digest`; `revoked_at` is
excluded because it is a later lifecycle fact. Empty
constraint sets mean that category is unavailable to an action requiring it,
not unconstrained. `operation_variants` uses the exhaustive action-and-mode
vocabulary below; coarse `branch`, `worktree`, `pull`, `merge`, `rebase` or
`push` values are invalid. A concrete action must match one exact variant,
execution profile, registered remote target, every fully qualified ref and
every canonical repository-relative path. The exact worktree shall retain an
active writer admission for the same project session and run when the effect
can write files.

`issuing_session_revision`, `issuing_run_revision` and
`issuing_dependency_revision` are immutable, hash-bound issuance provenance,
not point-of-use equality fences. They prove where the reusable grant came
from. Ordinary later session, run or dependency revision advances, including
revision changes caused by Git custody/audit activity, neither alter nor
invalidate it. Each action still carries current expected revisions and a stale
Preview fails its own compare-and-set; a new Preview may reuse the same grant.
Ordinary HEAD/ref/index/worktree-content changes likewise stale only the action
Preview, not the grant, while canonical repository and admitted-worktree
identity remain unchanged.

Point-of-use grant equality is required for session generation, current
authority revision/ref, current `git_allowlist_epoch`/digest, execution-profile
revision/digest and every remote registration revision/generation/target
digest. Grant expiry, revocation/non-active state, authority or allow-list
rotation, session-generation change, profile/remote-target change,
repository/worktree identity change or constraint mismatch fails before Git
lock acquisition or process I/O. No action Preview may rewrite issuance
provenance or silently refresh any live authority fence.

The daemon owns a secret-free remote registry independently of `.git/config`:

```yaml
git_remote_registration:
  registration_id: stable-id
  revision: compare-and-set-integer
  generation: target-rotation-fence
  project_id: exact-project
  remote_name: bounded-display-name
  transport_kind: allow-listed-kind
  target_identity: normalised-secret-free-host-port-repository
  target_digest: exact-sha256
  adapter_id: trusted-remote-port
  adapter_contract_digest: exact-sha256
  credential_selector_digest: secret-free-sha256
  state: active-or-revoked
```

For a remote action, `remote_binding` and the grant's `remote_bindings` contain
the registration ID, revision, generation, name, target digest, adapter and
contract digest. A name is display metadata, never authority. Retargeting a
name appends a registration revision, advances generation and invalidates all
prior grants, Previews and custody. Project Git configuration cannot select a
target, remote helper, credential helper or transport executable.

The trusted `GitExecutionProfile` is also closed and digest-bound. It records
the exact Git binary path/version/digest and object format; built-in merge and
rebase algorithm IDs; a sanitised configuration/environment policy; sealed
empty hooks; permitted raw attribute behaviour; the trusted remote-port/helper
registry; and hard result bounds. System, global and repository configuration
cannot select an alias, hook, clean/process filter, custom merge/diff driver,
editor, pager, signing programme, credential helper, remote helper, SSH command
or executable. A profile may instead name an explicitly registered absolute
helper binary plus digest, fixed argument template, credential selector and
enforced sandbox. Unknown attributes, includes, helpers or drivers make the
affected operation unavailable before Preview. Stage uses exact raw bytes, and
merge/rebase use only the profile's built-in deterministic backend.

The exhaustive V1 operation variants are:

| Effect family | Exact operation variants | Preauthorised grant permitted |
| --- | --- | --- |
| fetch | `fetch` | yes |
| pull | `pull-fast-forward-only`, `pull-merge-commit-start`, `pull-rebase-start` | fast-forward only |
| index | `stage`, `unstage` | yes |
| commit | `commit` | yes |
| merge | `merge-fast-forward-only-start`, `merge-commit-start`, `merge-continue`, `merge-abort` | no |
| rebase | `rebase-current-branch-no-autostash-start`, `rebase-continue`, `rebase-abort` | no |
| push | `push-fast-forward-only`, `push-force-with-lease` | fast-forward only |
| branch | `branch-create`, `branch-rename`, `branch-delete-merged-only`, `branch-delete-force` | all except force delete |
| worktree | `worktree-create-detached`, `worktree-create-new-branch`, `worktree-create-existing-branch`, `worktree-move`, `worktree-remove-clean`, `worktree-remove-force` | all except force remove |
| upstream | `upstream-set`, `upstream-unset` | yes |

Each `OperatorGitIntent` discriminator/action/mode/strategy/policy maps to
exactly one row value and vice versa. A grant containing a gate-only variant is
invalid. Pull merge/rebase, all standalone merge/rebase variants,
force-with-lease push, destructive branch deletion and forced worktree removal
always use the gate variant. A grant for one sibling operation, such as
`branch-create`, can never authorise `branch-rename` or either delete mode.

A gate-only operation first creates one typed pre-effect reservation.
`GitOperationDraftIntent` is a closed `OperatorActionIntent` with `create` and
`cancel` discriminators routed only through the existing
`fabric.v1.operator-action.preview`/`commit` owner. Its Preview is read-only;
confirmed Commit creates or cancels the no-authority draft and prepared
admission. Cancel binds the exact draft ID/revision/digest and accepts only
`open`/`gate-bound`. It is not the final Git action Preview/Commit.

```yaml
git_operation_draft:
  draft_id: daemon-generated-stable-id
  revision: compare-and-set-integer
  kind: mutation-or-custody-resolution
  project_id: exact-authenticated-project
  project_session_id: exact-session
  observed_session_revision: draft-cas-fence
  session_generation: fenced-generation
  coordination_run_id: exact-run
  observed_run_revision: draft-cas-fence
  observed_dependency_revision: draft-cas-fence
  authority_ref: exact-current-sha256
  authority_revision: exact-current-revision
  git_allowlist_epoch: exact-current-epoch
  git_allowlist_digest: null-or-exact-sha256
  operation_id: daemon-derived-immutable-id
  operation_kind: exact-gate-only-variant
  payload_digest: exact-binding-sha256
  binding:
    kind: mutation
    effect_binding_digest: exact-sha256
    repository_state_digest: exact-sha256
    result_recipe_digest: exact-sha256
  state: open-or-gate-bound-or-consumed-or-stale-or-expired-or-cancelled
  expires_at: bounded-timestamp
```

The closed `binding` discriminator is `mutation` with the complete repository,
worktree, execution-profile, target, before-state and result-recipe binding, or
`custody-resolution` with the complete resolution binding defined below.
Draft creation requires the corresponding `git` or
`git-custody-resolve` capability and validates current authority, syntax and
typed state through read-only inspection. The daemon derives `operation_id`
from authenticated operator/project/session identity, the random stable
`draft_id` and `payload_digest`, then atomically persists the immutable draft
and one `prepared` `operation_admissions` row whose kind and payload digest
match. It creates no generic effect custody, Git mutation reservation, grant
consumption or mutation authority; makes no mutating Git/remote call; and does
not block session closure or daemon idle stop.

Gate creation may bind only that exact prepared operation ID and draft payload.
The later final Preview names the draft and approved gate, repeats every current
session/run/dependency revision, session generation, authority and typed
repository/custody observation, and requires the recomputed binding digest to
equal the immutable draft; Preview remains read-only. Only a
separately confirmed Commit may atomically consume the draft once, authorise the
admission and write the action's typed rows. A mutation Commit creates effect
custody/reservation; a custody-resolution Commit writes only the adjudication
and target lifecycle changes below. Preview reports a changed binding without
writing; draft reconciliation or a confirmed Commit terminalises the draft as
`stale`, cancels its admission and supersedes the associated gate without
creating custody. It cannot be rebound or refreshed under an earlier human
decision. Expiry, explicit cancellation or rejection/cancellation/supersession
of its gate is likewise terminal/no-authority, cancels the unconsumed admission
and supersedes any remaining association without Git I/O; gate deferral leaves
the bounded draft `gate-bound`. Exact draft-request
replay returns the same identity and operation ID; a new request receives a new
operation ID even for identical repository state.

The gate variant is:

```yaml
decision:
  kind: gate
  draft_id: exact-pre-effect-draft
  expected_draft_revision: compare-and-set-integer
  draft_digest: exact-sha256
  gate_id: exact-id
  expected_gate_revision: compare-and-set-integer
  expected_gate_status: approved
  blocked_operation_id: exact-operation-id
```

The gate shall belong to the draft's project session and coordination run, have
an `operation` enforcement point, bind `blocked_operation_id` exactly to the
draft's `operation_id`, bind the current dependency revision and have an
authenticated human resolver. The preauthorised confirmed Commit creates one
`authorised` admission. The gate draft already owns one `prepared`
admission; final Commit compare-and-sets it to `authorised`. In both cases
`operation_kind` is the exact operation variant and `payload_digest` is the
immutable binding digest. The gate variant additionally requires the persisted
exact `(gate_id, operation_id)` association. An operation kind is
classification data and can never substitute for the unique operation ID.
Policy approval, a gate for another action/draft, a stale/superseded gate or a
general consequential-action capability is insufficient. Commit rechecks the
draft, gate, association, admission and every current common binding after
Preview and immediately before effect preparation. The gate never supplies
release or deployment authority; those retain the exact release binding in
section 32.3.

`OperatorGitIntent.operation` is extended only as needed to close these
semantics:

- **Fetch:** names one registered remote plus exact source and tracking refs.
  It cannot accept a URL, refspec, executable, transport or arbitrary option.
- **Pull:** names the same exact remote/ref pair and selects
  `fast-forward-only`, `merge-commit` or `rebase`. Merge/rebase pull is
  gate-only. Its exact remote observation, tracking-ref update and integration
  recipe share one custody record; a partial fetch is an observable
  non-terminal outcome, not permission to repeat the pull.
- **Stage and unstage:** contain a non-empty, unique set of canonical
  repository-relative paths. Absolute paths, traversal, NUL, pathspec magic,
  option interpretation and paths outside the bound worktree are rejected.
- **Commit:** binds the exact source index, parent and tree object digests, a
  bounded non-empty message, explicit author/committer identities and timestamp,
  and the deterministically derived resulting commit object. Dispatch cannot
  substitute current time or mutable Git identity configuration. It does not
  invoke an editor, pager, signing programme or repository hook, and it cannot
  include unreviewed worktree content.
- **Merge:** names exact source and destination objects and selects either
  `fast-forward-only` or `merge-commit`. `merge-commit` binds the exact backend,
  ordered parents, output tree, author/committer identities and timestamp,
  message and resulting commit object. It is one non-interactive
  non-fast-forward merge with no implicit strategy, editor, autostash or
  project-configured command execution.
- **Rebase:** always uses the gate variant. The source shall be the exact
  currently checked-out local branch and HEAD object in the bound worktree; the
  destination is one exact object/ref. V1 permits only a non-interactive,
  current-branch, `no-autostash` rebase. It forbids `--onto`, root,
  rebase-merges, interactive/exec and rebasing another branch. Its recipe maps
  every bounded source commit to exact new parent/tree, preserved author
  identity/time, explicit committer identity/time and resulting object. Dirty,
  conflicted or detached state fails before preparation.
- **Merge/rebase conflict exit:** a start may produce only the recipe's exact
  success state or exact bounded conflict state. A conflict persists the
  predecessor custody ID, operation variant, conflict generation, index stages,
  affected paths and original before state. `merge-continue` and
  `rebase-continue` are new gate-bound actions over that exact conflict and a
  newly reviewed resolution index/worktree plus complete deterministic result
  recipe. `merge-abort` and `rebase-abort` are also typed gate-bound actions and
  may restore only the predecessor's exact before state. No generic command,
  automatic abort/continue or reuse of the start gate is permitted.
  Startup performs no automatic inspection of a current conflict owner. An
  explicit authenticated reconciliation of the exact custody and conflict
  lineage generation may use only the
  sealed no-process typed local reader. Exact complete conflict proof retains
  the conflict for those typed successors. Complete proof that the persisted
  native operation state, index stages or conflict-path manifest was destroyed
  or altered out of band atomically moves the four custody owners to
  `quarantined`, retains the common-directory reservation, records the new
  lookup evidence and marks only that generation
  `conflict-state-unverifiable`. One transient incomplete, unavailable or
  inconsistent observation retains the conflict without an eligibility marker.
  A closed machine-classified permanent `inspector-unavailable` or
  `evidence-integrity-failure` outcome instead uses the same all-four-owner
  quarantine/eligibility mapping with its exact reason. Reconciliation never
  continues, aborts, restores or otherwise mutates Git.
  The existing observe-only operator-action reconciliation surface adds two
  Git-only `git_conflict` discriminators: `owned-conflict` for a current
  conflict owner and `inherited-successor` for the typed continue/abort custody
  holding a transferred reservation before it has proved itself the new owner.
  Each requires the original target command, exact custody lineage, binding
  state revision, reservation generation, common-directory identity digest,
  lookup generation and nullable prior evidence digest. Both reauthenticate the
  exact project/session and require the distinct `git-custody-resolve`
  capability; the target action's `git` capability alone is insufficient.
  Missing or stale fields change nothing, and no other action family may use
  either discriminator.

  The additive closed request variants are:

  ```yaml
  operator_action_reconcile:
    command: exact-operator-mutation-context
    project_id: exact-authenticated-project
    target_command_id: exact-original-git-command
    expected_status: conflict
    expected_attempt_generation: compare-and-set-integer
    mode: observe-only
    git_conflict:
      kind: owned-conflict
      custody_id: exact-target-custody
      expected_binding_state: conflict
      expected_binding_state_revision: compare-and-set-integer
      expected_owned_conflict_generation: compare-and-set-integer
      expected_predecessor_custody_id: null-or-exact-custody
      expected_predecessor_conflict_generation: null-or-compare-and-set-integer
      expected_reservation_generation: compare-and-set-integer
      expected_common_directory_identity_digest: exact-sha256
      expected_lookup_generation: compare-and-set-non-negative-integer
      expected_lookup_evidence_digest: null-or-exact-sha256
      expected_resolution_eligibility: none
  ```

  ```yaml
  operator_action_reconcile:
    command: exact-operator-mutation-context
    project_id: exact-authenticated-project
    target_command_id: exact-typed-successor-git-command
    expected_status: pending-or-ambiguous-or-quarantined
    expected_attempt_generation: compare-and-set-integer
    mode: observe-only
    git_conflict:
      kind: inherited-successor
      custody_id: exact-target-custody
      expected_binding_state: prepared-or-ambiguous-or-quarantined
      expected_binding_state_revision: compare-and-set-integer
      expected_owned_conflict_generation: null
      expected_predecessor_custody_id: exact-predecessor-custody
      expected_predecessor_conflict_generation: compare-and-set-integer
      expected_reservation_generation: compare-and-set-integer
      expected_common_directory_identity_digest: exact-sha256
      expected_lookup_generation: compare-and-set-non-negative-integer
      expected_lookup_evidence_digest: null-or-exact-sha256
      expected_resolution_eligibility: none
  ```

  The outer status and binding state must map `pending -> prepared`,
  `ambiguous -> ambiguous` or `quarantined -> quarantined`. An
  `owned-conflict` request instead requires `conflict -> conflict`, positive
  owned generation and the exact nullable predecessor generation. The existing
  generic `pending`/`ambiguous` request rejects `git_conflict`; `quarantined` is
  accepted only for the inherited-successor form. Both Git forms reject their
  absence, crossed lineage fields, an existing eligibility marker or any
  unknown field. The nullable expected evidence
  value shall exactly equal the stored value and is null only before the first
  lookup. An accepted inspection increments lookup and binding-state revision,
  advances attempt generation exactly once, persists a bounded
  outcome/evidence/timestamp and returns the exact current target-command status
  below. It does not change reservation generation,
  conflict-lineage generations or common-directory identity. Exact conflict
  retains an owned conflict or atomically promotes an intact inherited
  successor to the next owned conflict generation. Incomplete, unavailable or
  inconsistent observation retains an existing conflict, otherwise leaves or
  moves the inherited successor to `ambiguous`/`quarantined`, and creates no
  resolution eligibility while transient. Complete proof that the persisted
  owned or inherited conflict no longer holds, or one closed permanent
  inspector/integrity outcome, returns `quarantined` with the matching
  eligibility tuple and retained reservation.

  ```yaml
  operator_action_git_custody_status:
    status: pending-or-ambiguous-or-conflict-or-quarantined
    phase: prepared-when-status-pending-otherwise-absent
    command_id: exact-original-git-command
    intent_digest: exact-sha256
    attempt_generation: positive-integer
    git_custody:
      custody_id: exact-target-custody
      binding_state_revision: positive-integer
      reservation_generation: positive-integer
      common_directory_identity_digest: exact-sha256
      predecessor_custody_id: exact-custody-or-null
      predecessor_conflict_generation: positive-integer-or-null
      owned_conflict_generation: positive-integer-or-null
      lookup_generation: non-negative-integer
      lookup_evidence_digest: null-or-exact-sha256
      lookup_outcome: null-or-closed-outcome-code
      lookup_failure_signature_digest: null-or-exact-sha256
      lookup_observed_at: null-or-timestamp
      resolution_eligibility:
        kind: none-or-eligible
        lookup_generation: absent-unless-eligible-current-generation
        evidence_digest: absent-unless-eligible-current-sha256
        reason: absent-unless-eligible-closed-permanent-unprovability-code
  ```

  The `pending` form is allowed only for an inherited typed successor whose
  binding is `prepared`; it requires `phase: prepared`, the complete positive
  predecessor custody/generation pair, null owned generation and
  `resolution_eligibility.kind: none`. No other generic pending action receives
  `git_custody`, and `phase` is absent from the other three forms. A `conflict`
  status requires a positive owned conflict generation and
  `resolution_eligibility.kind: none`. A `quarantined` status may retain the
  positive predecessor conflict generation;
  `conflict-state-unverifiable` requires at least one positive owned or
  predecessor conflict generation. Predecessor custody ID and generation are
  both null or both present. An inherited successor has their exact positive
  pair and null owned generation until exact intact proof assigns the next owned
  generation. Lookup
  evidence, outcome and observed time are all null exactly at generation zero
  and all present thereafter. Eligibility, when present, exactly equals the
  latest lookup generation/evidence and its outcome code. The closed lookup
  outcomes are `exact-conflict`, `exact-applied`, `exact-no-effect`,
  `incomplete`, `unavailable`, `inconsistent`, `inspector-unavailable`,
  `remote-proof-permanently-unavailable`, `mixed-local-remote-evidence`,
  `evidence-integrity-failure` and `conflict-state-unverifiable`.
  `lookup_failure_signature_digest` is present only for `incomplete`,
  `unavailable`, `inconsistent`, `inspector-unavailable`,
  `remote-proof-permanently-unavailable`, `mixed-local-remote-evidence` or
  `evidence-integrity-failure`; it is null at generation zero and for exact
  state outcomes. It hashes only the normalised bounded failure class and
  stable machine facts, excluding time, command/operator identity and text.

  `inspector-unavailable` is permanent only when the digest-pinned reader or its
  trusted execution-profile contract is absent/revoked for the target
  generation, or after three consecutive accepted `unavailable` observations
  for the same custody/lineage and normalised failure-signature digest under
  distinct reconciliation commands spanning at least 60 seconds. An
  `evidence-integrity-failure` is permanent only when the sealed reader can read
  the bounded canonical files but proves their format/hash relationship cannot
  yield any complete observation, or after the equivalent three-observation
  rule for one identical normalised `inconsistent` signature. The daemon
  derives the streak from immutable reconciliation-command results; project
  files, operator text and the caller cannot select a permanent code. Any
  intervening different outcome/signature resets the streak. Attempts one and
  two remain non-eligible and retain the blocker. The third final-CAS
  transaction persists the permanent outcome, moves all four owners to
  `quarantined` and sets only the matching latest-generation eligibility tuple.

  Reconcile response and exact command replay return the same closed status
  snapshot without another inspection. Reuse of the reconciliation command ID
  with any changed field is a dedupe conflict. Status query by the original
  target command returns its current custody status; status query by the
  reconciliation command returns that command's immutable result snapshot,
  not an operator-action receipt. Both queries require `read` and perform no
  inspection or state change. A new reconciliation command must compare-and-set
  the latest returned tuple.

  If any requested authority or custody field becomes stale after the bounded
  read but before final compare-and-set, the final transaction changes no
  custody, admission or reservation row and terminalises the reconciliation
  command as a closed rejection: `state-changed` for a custody tuple mismatch,
  `generation-stale` for a principal/session generation mismatch or
  `authority-insufficient` for expired/revoked/insufficient capability. Its command ID,
  target intent digest and original evidence references are preserved. Exact
  replay and status query return that immutable rejection with no inspection;
  changed replay conflicts, and another inspection requires a new command over
  the latest target tuple.
- **Push:** names one registered remote, one exact local source ref and one
  exact remote destination ref. `fast-forward-only` relies on the remote's
  atomic non-fast-forward rejection. `force-with-lease` additionally binds the
  exact expected remote object and always uses the gate variant. Neither form
  implies pull-request merge, release or deployment authority.
- **Branch create/rename/delete:** use fully qualified local refs and exact
  objects. Safe deletion is `merged-only` against an exact base and refuses a
  branch checked out in any worktree. Destructive deletion is an explicit
  `force` mode, binds the deleted object and consequence in the gate, and never
  follows from a broad branch grant.
- **Worktree create:** selects `detached`, `new-branch` or `existing-branch`,
  binds the exact source object and any fully qualified branch ref, and places
  the destination at one absent direct child of
  `<repository>/.worktrees/<task-agent>`. It requires the session envelope's
  worktree-creation grant and cannot force an already checked-out branch.
- **Worktree move:** binds the exact current worktree digest and moves only to
  one absent direct child of the same repository-owned `.worktrees` directory.
- **Worktree remove:** selects `clean` or `force`, binds the exact worktree and
  worktree-state digest, and refuses the primary worktree or a locked worktree.
  `clean` rejects modified, untracked, conflicted or unmerged state. `force`
  always uses the gate variant and binds those consequences; no grant can
  silently enable it.
- **Upstream tracking:** `upstream-set` binds one exact local branch and one
  exact registered remote target/ref plus the current local-config digest;
  `upstream-unset` binds the exact existing association and digest. The fixed
  port changes only the branch's remote and merge keys through a locked atomic
  config update. It cannot set an arbitrary Git config key or remote URL.

`git-custody-resolve` is a separate zero-Git-effect `OperatorActionIntent`, not
an `OperatorGitIntent` or mutation variant:

```yaml
git_custody_resolve:
  project_id: exact-authenticated-project
  project_session_id: exact-session
  expected_session_revision: compare-and-set-integer
  expected_session_generation: fenced-generation
  coordination_run_id: exact-run
  expected_run_revision: compare-and-set-integer
  expected_dependency_revision: compare-and-set-integer
  authority_ref: exact-current-sha256
  expected_authority_revision: compare-and-set-integer
  draft_id: exact-custody-resolution-draft
  expected_draft_revision: compare-and-set-integer
  draft_digest: exact-sha256
  operation_id: exact-draft-operation-id
  custody_id: exact-unresolved-git-custody
  expected_custody_state: ambiguous-or-quarantined
  expected_lookup_generation: compare-and-set-integer
  lookup_evidence_digest: exact-sha256
  resolution_eligibility_reason: exact-daemon-reason-code
  adjudication: applied-or-no-effect-or-quarantine-accepted
  reason: bounded-non-empty-human-reason
  gate_id: exact-human-approved-operation-gate
  expected_gate_revision: compare-and-set-integer
  expected_gate_status: approved
```

The target must already carry a daemon-persisted `resolution_eligible` marker
for that lookup generation and evidence digest after the bounded inspector has
declared machine proof permanently unavailable. Ordinary pending lookup and
an intact, still-observable typed conflict are ineligible. A prior conflict is
eligible only after the exact observe path atomically transitions every custody
owner to `quarantined` and records either complete destroyed/altered proof with
`conflict-state-unverifiable`, or one of the closed machine-derived permanent
`inspector-unavailable`/`evidence-integrity-failure` outcomes above. Transient
incomplete/unavailable/inconsistent evidence never suffices. Draft creation
uses the
`custody-resolution` binding. Its payload digest covers the exact current
project/session/run authority, target custody/state, lookup generation/evidence,
eligibility reason, adjudication and human reason, but excludes the later
daemon-assigned draft/operation identity, gate identity and credential. It
follows the exact operation-draft/
gate flow. Final Preview is read-only. Confirmed Commit requires the distinct
`git-custody-resolve` capability and an independently attested direct-human
approval of the exact adjudication/reason; `git`, `git-authorise`, `decide`,
policy or a gate for another operation is insufficient.

Commit performs no Git process, filesystem, ref, index, worktree, configuration
or remote mutation. In one transaction it preserves the machine evidence,
appends one immutable human-adjudication record, terminalises the target custody
and admission, releases its reservation for `applied`/`no-effect` or retires it
for `quarantine-accepted`, and terminalises the resolution command/admission.
The receipt says `human-adjudicated-applied`,
`human-adjudicated-no-effect` or `human-adjudicated-quarantine-accepted`; it
never rewrites or presents the machine outcome as proved. Exact replay returns
that record. A changed custody state, lookup generation, evidence digest,
reason, adjudication, gate or operation ID conflicts with zero state change.

A human-adjudicated result removes only that custody's liveness/reservation
blocker. It does not restore repository state, authorise another Git action,
advance a project session automatically or imply acceptance. For project-
session closure, `quarantine-accepted` is the explicit abandonment with reason
record; other closure predicates and an explicit lifecycle transition still
apply.

Every mutation variant owns one closed `git_result_recipe_v1`. It includes the
execution profile and algorithm IDs; canonical before state; exact expected success and,
where admitted, conflict states; no-effect proof fields; at most 64 atomic ref/
config updates; at most 128 input/output commit mappings; at most 4,096 conflict
paths/index stages; and bounded index/worktree/config digests. Every produced
commit mapping contains ordered parents, tree, author and committer identities
and timestamps, message and derived object digest. The recipe and its digest
are part of `effect_binding_digest` and expected terminal custody state. A
backend, Git binary, configuration, selected identity/timestamp or result-bound
change therefore requires a new Preview and gate/grant decision. An effect
whose exact result or conflict state cannot be computed within these limits is
unavailable in V1; it does not dispatch with an open-ended post-state.

All ref names are fully qualified, validated data. The fixed Git port resolves
them to current native objects and verifies the protocol object digests under
the bound execution profile; no abbreviated revision, caller argument vector,
shell, alias, hook, editor, pager, unregistered helper, environment override or
arbitrary Git subcommand is accepted. Immediately before the durable
`prepared -> dispatching` transition it shall hold the operation-specific
repository/index/ref/config/worktree fence, re-observe every bound filesystem
and Git state, and retain that fence or a native compare-and-set through the
first mutation. A platform that cannot supply the required fence exposes the
variant as unavailable. Quarantining an already unauthorised stale-state
mutation is not a substitute.

The Preview shows repository, worktree, execution profile, current branch,
exact affected paths, source/destination refs and objects, registered remote
target, operation variant, deterministic result recipe and bounds, expected
session/run/dependency/authority revisions, and the grant or gate evidence
before confirmation.

Added requirements are:

- **FR-038:** Every Git mutation shall carry one closed, current
  `GitActionAuthorisation` whose preauthorised or gate variant binds the exact
  project session, run, dependency and authority revisions, repository,
  worktree, execution profile, concrete operation variant, registered remote
  target, refs, paths and result recipe; a broad `git` capability alone shall
  have zero effect.
- **FR-039:** Merge and rebase shall implement only the closed start,
  continue and abort variants above. Branch deletion and worktree create/remove
  shall implement only their named safe/force variants. Pull merge/rebase,
  history rewriting or destructive force shall require the exact human-approved
  gate variant.
- **FR-040:** A Git grant shall be issued or revoked only through launch custody
  materialising an approved positive run allow-list or a distinct
  `git-authorise` capability. It shall hash the exact issuing session/run/
  dependency revisions as provenance and fence use by the current session
  generation, run-authority tuple and allow-list epoch/digest; unrelated later
  orchestration revisions shall not invalidate it.
- **FR-041:** Remote Git and upstream-tracking actions shall bind a daemon-owned
  secret-free remote registration identity, target digest and generation; a
  reused display name or project Git configuration shall confer no authority.
- **FR-042:** Every gate-only Git mutation or custody resolution shall allocate
  one immutable operation ID and binding digest in a typed no-authority draft
  before gate creation; only confirmed final Commit may consume that draft and
  create or resolve effect custody.
- **FR-043:** Permanently unprovable ambiguous/quarantined Git custody,
  including a persisted conflict whose exact bounded state is proved destroyed
  or altered out of band, shall
  remain blocking until machine proof or one exact, independently attested,
  gate-bound `git-custody-resolve` adjudication; human adjudication shall remain
  distinguishable from machine proof in every receipt and projection. Only the
  exact `git-custody-resolve`-capable Git-only observe reconciliation may
  classify a persisted conflict as `conflict-state-unverifiable`.
- **NFR-022:** Typed Git execution shall use one fixed bounded port with no
  arbitrary shell, command, option, hook, editor, pager, executable or
  environment injection surface.
- **NFR-023:** Each Git effect shall be prepared durably before process I/O and
  shall use evidence-only lookup after ambiguity; restart shall never blindly
  repeat a Git mutation.
- **NFR-024:** Every Git mutation shall acquire its declared native lock/CAS
  plan, recheck bound Git and filesystem state immediately before dispatch and
  preserve that fence through the first mutation; an unfenceable variant shall
  fail unavailable before mutation.
- **NFR-025:** Commit-producing actions shall bind one pinned deterministic
  backend and complete bounded output recipe into the authority digest; hostile
  Git configuration, attributes and helpers shall be disabled or rejected
  before Preview.
- **NFR-026:** Typed Git binding, generic custody, operation admission and
  common-directory reservation states shall transition through one enforced
  atomic mapping; restart shall fail closed on an impossible combination.

Acceptance additionally requires:

- **AC-031:** a matrix over missing, expired, revoked, wrong-project,
  wrong-session/generation, tampered or nonexistent issuing provenance, stale
  run-authority/allow-list or grant revision, wrong repository/worktree/
  execution profile, sibling operation variant, remote target/generation, ref
  and path proves zero Git process I/O. A valid grant remains usable through
  unrelated session/run/dependency revision advances after a fresh action
  Preview; pull merge/rebase, push and every gate-only mode reject broad
  authority and a gate for another operation ID.
- **AC-032:** real temporary-repository tests cover every closed Git effect and
  mode, including current-branch/no-autostash rebase, merged-only versus force
  deletion, the three worktree-create modes, clean versus force removal,
  merge/rebase continue/abort and upstream set/unset. Exact command replay has
  one effect; stale repository/filesystem state at every lock/recheck/CAS point
  fails before mutation; crash at each custody boundary performs no blind retry
  and exposes any partial merge, rebase, pull or remote effect as ambiguous or
  quarantined evidence.
- **AC-033:** grant issuance rejects absence of `git-authorise`, an absent or
  negative parent allow-list, every widened operation/profile/remote/ref/path/
  bound and a concurrent session/run/dependency/authority rotation. Direct SQL
  and public protocol tests prove preauthorised final Commit creates one exact
  authorised admission, while gate-draft creation makes one no-authority
  prepared admission and only final Commit may consume it under the same-
  session/run `(gate_id, operation_id)` association and human-approved current
  dependency revision.
- **AC-034:** hostile hook, filter, process, merge/diff driver, include, alias,
  editor, pager, signer, credential/remote helper and SSH command canaries never
  execute. Preview is byte-identical across wall time and mutable Git config for
  one pinned profile; merge, pull and rebase recover only the exact bounded
  commit mapping or conflict state. Retargeting `origin` under the same name
  invalidates the old grant, and upstream tracking can change only through the
  target-bound typed variants.
- **AC-035:** exact gate-draft replay returns one operation ID; changed payload,
  operation-kind substitution, early custody/reservation creation, gate binding
  by kind, final Preview writes and expired/cancelled/stale draft reuse all fail.
  Confirmed Commit atomically consumes one exact approved draft or changes
  nothing, and crash at every draft/gate/Commit boundary grants no mutation.
- **AC-036:** every conflict, ambiguity, quarantine, typed successor and
  terminal outcome matches the four-owner persistence table across restart.
  `git-custody-resolve` rejects stale generation/evidence, ineligible custody,
  every custody still in `conflict`, wrong gate/capability/provenance and
  replay with changed reason or adjudication. An explicit reconcile of an
  intact owned or inherited conflict retains/promotes exactly one owner with
  zero Git mutation; complete proof that its
  persisted conflict state was destroyed or altered out of band, including
  after successor Commit but before dispatch, atomically
  quarantines all four owners, retains the reservation and records
  `conflict-state-unverifiable`; incomplete observation advances only the
  bounded lookup evidence/audit revision and retains every owner without
  eligibility while transient. Immediate machine proof of pinned-inspector
  absence/revocation or canonical-evidence integrity failure, and exactly the
  third identical unavailable/inconsistent failure signature under the bounded
  rule, instead quarantines every owner with the matching permanent eligibility
  reason; a different signature resets the streak.
  The subsequent exact adjudication Commit makes zero Git call, atomically
  releases/retires the reservation, preserves machine evidence, records the
  human-labelled result and removes only the exact closure blocker. Closed
  request/status codecs reject missing, extra, crossed-lineage and cross-
  variant fields; target and reconciliation command queries expose exact
  target `pending/prepared`, `ambiguous`, `conflict`, `quarantined` or
  reconciliation-command `pending/observing` state. Exact
  reconcile replay is read-only and stable, changed replay conflicts, and
  incomplete evidence cannot set eligibility. A transfer or competing lookup
  between inspection and final CAS terminalises only the reconciliation command
  with that exact closed rejection; exact replay makes no inspection, no
  custody row changes and a new command must bind the current tuple.
