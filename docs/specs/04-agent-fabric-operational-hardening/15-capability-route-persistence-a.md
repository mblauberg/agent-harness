
### 9.23 Capability, route-lineage and context-pressure persistence

Spec 01 section 32.21 owns the closed public capability/discovery/route,
context-pressure, topology-wave and operational-span semantics; Spec 03 owns
`adapterEffectiveConfigurationV1` activation semantics. The daemon owns their generated codecs,
persistence and compare-and-set enforcement. The TypeScript caller and any
offline Python route resolver validate the same checked-in JSON Schemas; the
resolver receives capability input explicitly and may not read daemon
activation configuration behind the caller.

The current generated-contract inventory adds exactly:

- `authority-envelope.v2.schema.json`;
- `stored-authority-envelope.v2.schema.json`;
- `provider-action-authority-request.v1.schema.json`;
- `authority-task-ownership.v1.schema.json`;
- `authority-risk-policy.v1.schema.json`;
- `authority-workspace-root-identity.v1.schema.json`;
- `owned-worktree-identity.v1.schema.json`;
- `authority-private-temp-root.v1.schema.json`;
- `authority-host-identity.v1.schema.json`;
- `authority-containment-matrix-policy.v1.schema.json`;
- `step3-containment-matrix.v1.schema.json`;
- `step3-containment-matrix-ref.v1.schema.json`;
- `authority-containment-evidence.v1.schema.json`;
- `authority-containment-evidence-ref.v1.schema.json`;
- `authority-containment-decision.v1.schema.json`;
- `authority-containment-decision-ref.v1.schema.json`;
- `authority-local-attestation.v1.schema.json`;
- `provider-control-plane-exception-body.v1.schema.json`;
- `effective-provider-authority.v1.schema.json`;
- `provider-authority-compilation-receipt.v1.schema.json`;
- `provider-authority-compilation-receipt-ref.v1.schema.json`;
- `provider-authority-compilation-projection.v1.schema.json`;
- `provider-authority-compilation-read-request.v1.schema.json`;
- `authority-profile-unavailable.v1.schema.json`;
- `adapter-capability-snapshot.v1.schema.json`;
- `capability-snapshot-ref.v1.schema.json`;
- `capability-snapshot-summary.v1.schema.json`;
- `discovery-surface-manifest.v1.schema.json`;
- `discovery-surface-ref.v1.schema.json`;
- `deployed-route-admission.v1.schema.json`;
- `deployed-route-dispatch.v1.schema.json`;
- `deployed-route-observation.v1.schema.json`;
- `actual-review-route-identity.v1.schema.json`;
- `adapter-effective-configuration.v1.schema.json`;
- `adapter-effective-configuration-ref.v1.schema.json`;
- `provider-context-pressure.v1.schema.json`;
- `provider-context-pressure-read-request.v1.schema.json`;
- `provider-context-pressure-read.v1.schema.json`;
- `topology-wave-plan-ref.v1.schema.json`;
- `topology-wave-plan.v1.schema.json`;
- `topology-wave-plan-current.v1.schema.json`;
- `topology-wave-plan-input.v1.schema.json`;
- `topology-wave-append-request.v1.schema.json`;
- `topology-wave-append-receipt.v1.schema.json`;
- `topology-wave-current-read-request.v1.schema.json`;
- `topology-wave-current-read.v1.schema.json`;
- `topology-wave-list-request.v1.schema.json`;
- `topology-wave-list.v1.schema.json`;
- `fabric-operational-span.v1.schema.json`;
- generated TypeScript validators/types; and
- the same hash-bound schemas as explicit Python validator inputs.

There is no hand-written parallel route codec. Generation checks fail when any
generated surface or schema digest differs. The pre-release database baseline
is updated in place; no predecessor table, decoder, import or compatibility
view is retained.

Generated authority validators use only Spec 01's `AD(domain,value)` with the
literal UTF-8 prefix `agent-fabric.authority.v1\0` and its closed authority
domain registry. They never call the namespace-locked lifecycle `LD` helper;
an unregistered authority domain, crossed helper or alternate prefix fails
generation and insert validation.

The human input is not a free digest. The squashed baseline stores the closed
V2 wrapper and its registered passing approval evidence before any task or
compiler input can refer to it:

```sql
authority_approval_evidence_registrations(
  evidence_id TEXT NOT NULL,
  evidence_revision INTEGER NOT NULL CHECK(evidence_revision >= 1),
  approved_by TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  artifact_revision INTEGER NOT NULL CHECK(artifact_revision >= 1),
  artifact_path TEXT NOT NULL,
  approval_evidence_digest TEXT NOT NULL,
  result TEXT NOT NULL CHECK(result = 'pass'),
  registered_at TEXT NOT NULL,
  PRIMARY KEY(evidence_id, evidence_revision),
  UNIQUE(evidence_id, approval_evidence_digest, approved_by),
  UNIQUE(evidence_id, evidence_revision, approval_evidence_digest,
    approved_by),
  FOREIGN KEY(artifact_id, artifact_revision)
    REFERENCES artifacts(artifact_id, revision)
)

authority_envelope_v2_objects(
  envelope_schema_version INTEGER NOT NULL CHECK(envelope_schema_version = 2),
  coordination_run_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  parent_authority_id TEXT,
  approval_approved_by TEXT NOT NULL,
  approval_evidence_id TEXT NOT NULL,
  approval_evidence_revision INTEGER NOT NULL
    CHECK(approval_evidence_revision >= 1),
  approval_evidence_digest TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  authority_envelope_digest TEXT NOT NULL,
  stored_envelope_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(coordination_run_id, authority_id),
  UNIQUE(coordination_run_id, authority_id, authority_envelope_digest),
  UNIQUE(coordination_run_id, authority_id, authority_envelope_digest,
    approval_evidence_digest),
  FOREIGN KEY(coordination_run_id)
    REFERENCES runs(run_id),
  FOREIGN KEY(coordination_run_id, parent_authority_id)
    REFERENCES authority_envelope_v2_objects(
      coordination_run_id, authority_id),
  FOREIGN KEY(approval_evidence_id, approval_evidence_revision,
      approval_evidence_digest, approval_approved_by)
    REFERENCES authority_approval_evidence_registrations(
      evidence_id, evidence_revision, approval_evidence_digest,
      approved_by),
  CHECK(parent_authority_id IS NULL OR parent_authority_id <> authority_id)
)

CREATE TRIGGER authority_approval_evidence_no_update
BEFORE UPDATE ON authority_approval_evidence_registrations
BEGIN SELECT RAISE(ABORT, 'authority-approval-evidence-immutable'); END;

CREATE TRIGGER authority_approval_evidence_no_delete
BEFORE DELETE ON authority_approval_evidence_registrations
BEGIN SELECT RAISE(ABORT, 'authority-approval-evidence-immutable'); END;

CREATE TRIGGER authority_envelope_v2_objects_no_update
BEFORE UPDATE ON authority_envelope_v2_objects
BEGIN SELECT RAISE(ABORT, 'authority-envelope-immutable'); END;

CREATE TRIGGER authority_envelope_v2_objects_no_delete
BEFORE DELETE ON authority_envelope_v2_objects
BEGIN SELECT RAISE(ABORT, 'authority-envelope-immutable'); END;

CREATE TRIGGER authority_envelope_v2_parent_must_narrow
BEFORE INSERT ON authority_envelope_v2_objects
WHEN NEW.parent_authority_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM authority_envelope_v2_objects p
  WHERE p.coordination_run_id = NEW.coordination_run_id AND
    p.authority_id = NEW.parent_authority_id AND
    p.approval_approved_by = NEW.approval_approved_by AND
    p.approval_evidence_id = NEW.approval_evidence_id AND
    p.approval_evidence_digest = NEW.approval_evidence_digest AND
    fabric_authority_v2_child_narrows(
      p.envelope_json, NEW.envelope_json) = 1)
BEGIN SELECT RAISE(ABORT, 'authority-envelope-not-narrowing'); END;
```

Envelope insert byte-validates both generated `AuthorityEnvelopeV2` and
`storedAuthorityEnvelopeV2`, requires literal `schemaVersion:2`, equality-
copies run, stable ID, parent ID and approval members, rejects unknown or
unversioned bytes, and recomputes
`AD("authority-envelope-v2",exactEnvelope)`. Approval registration is itself
insert-only: its insert trigger joins the exact artifact revision and requires
type `authority-approval`, passing disposition, path, digest and authenticated
operator identity to equal the normalised columns above. Consequently the
envelope's four-column approval FK cannot authenticate a digest-only or failed
artifact.
The V2 wire approval has no revision member: `(evidenceId,evidenceDigest,
approvedBy)` therefore selects exactly one registration, and the daemon derives
the relational revision rather than accepting it from the request.

A nonnull parent resolves the one same-run stable row. The before-insert
trigger calls the generated V2 containment predicate over the two exact JSON
bodies and aborts unless approval binding is identical, positive sets only
narrow, denials/prohibitions only accumulate, disclosure only narrows, expiry
does not increase, every common budget key decreases, a child introduces no
budget key, and restrictive union arms dominate. Update/delete triggers also
protect approval registrations. There is no V1 table, decoder or migration
arm: baseline preflight aborts if any persisted `authority_ref` cannot resolve
to one row above or if its stored object is not version 2.

The squashed `run_authority_revisions` row additionally normalises
`authority_id`, `authority_envelope_digest` and `approval_evidence_digest`.
It preserves the existing four-column candidate used elsewhere, requires
`authority_ref = authority_envelope_digest`, and adds the exact nonnull FK
`(coordination_run_id, authority_id, authority_envelope_digest,
approval_evidence_digest)` to the immutable envelope candidate. Thus the
current `runs.authority_revision/authority_ref` tuple resolves one V2 object;
rotation appends the existing contiguous run-authority revision and never
retargets a stable authority ID.

Host identity is immutable daemon evidence behind one current pointer per
capability host:

```sql
authority_host_identities(
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  host_id TEXT NOT NULL,
  host_identity_revision INTEGER NOT NULL
    CHECK(host_identity_revision >= 1),
  host_version TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('darwin','linux')),
  platform_identity_digest TEXT NOT NULL,
  isolation_substrate_digest TEXT NOT NULL,
  daemon_executable_identity_digest TEXT NOT NULL,
  daemon_principal_uid INTEGER NOT NULL CHECK(daemon_principal_uid >= 0),
  host_identity_json TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(host_id, host_identity_revision),
  UNIQUE(host_identity_digest),
  UNIQUE(host_identity_revision, host_identity_digest),
  UNIQUE(host_id, host_identity_revision, host_version,
    host_identity_digest)
)

authority_host_identity_current(
  host_id TEXT PRIMARY KEY,
  pointer_generation INTEGER NOT NULL CHECK(pointer_generation >= 1),
  host_identity_revision INTEGER NOT NULL
    CHECK(host_identity_revision >= 1),
  host_version TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(host_id, pointer_generation),
  FOREIGN KEY(host_id, host_identity_revision, host_version,
      host_identity_digest)
    REFERENCES authority_host_identities(
      host_id, host_identity_revision, host_version,
      host_identity_digest)
)
```

Insert byte-validates `authorityHostIdentityV1`, recomputes
`AD("authority-host-identity-v1",...)` and authenticates platform, isolation
substrate, daemon executable and principal locally. Rows are insert-only and
their per-host revisions are contiguous. The current pointer uses an internal
expected-generation CAS. It may either retain the exact selected immutable
revision/digest as a no-op or select the exact next revision; rewind, skipped
revision, member drift, delete or caller/adapter publication aborts. The CAS
generation is not receipt identity and a no-op does not invalidate execution.
Capability host ID/version,
effective configuration, temp custody, containment evidence, local attestation
and compilation receipt foreign-key or equality-bind this digest. Compilation,
dispatch and resume additionally require it to remain the current pointer.

The third compiler input is one immutable closed risk policy and one per-run
current pointer. The two enabled flags are normalised from the exact ordered
`profileRules` array only for indexed admission; the full restriction unions
remain in `policy_json` and its digest:

```sql
authority_risk_policies(
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  policy_id TEXT NOT NULL,
  policy_revision INTEGER NOT NULL CHECK(policy_revision >= 1),
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  authority_profile_policy_version TEXT NOT NULL,
  review_readonly_enabled INTEGER NOT NULL
    CHECK(review_readonly_enabled IN (0, 1)),
  workspace_write_offline_enabled INTEGER NOT NULL
    CHECK(workspace_write_offline_enabled IN (0, 1)),
  issued_at TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  risk_policy_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(policy_id, policy_revision),
  UNIQUE(risk_policy_digest),
  UNIQUE(coordination_run_id, policy_id, policy_revision,
    risk_policy_digest, authority_profile_policy_version),
  FOREIGN KEY(project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id)
)

authority_risk_policy_current(
  coordination_run_id TEXT PRIMARY KEY,
  pointer_generation INTEGER NOT NULL CHECK(pointer_generation >= 1),
  policy_id TEXT NOT NULL,
  policy_revision INTEGER NOT NULL CHECK(policy_revision >= 1),
  risk_policy_digest TEXT NOT NULL,
  authority_profile_policy_version TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(coordination_run_id, pointer_generation),
  FOREIGN KEY(coordination_run_id, policy_id, policy_revision,
      risk_policy_digest, authority_profile_policy_version)
    REFERENCES authority_risk_policies(
      coordination_run_id, policy_id, policy_revision,
      risk_policy_digest, authority_profile_policy_version)
)
```

Insert byte-validates `authorityRiskPolicyV1`, requires exactly the read-only
then write-profile rule, validates every closed enabled/disabled arm and
recomputes `AD("authority-risk-policy-v1",...)`. Human-envelope, risk-rule and
task-request path arrays remain canonical workspace-relative wire prefixes;
only compiled effective roots and filesystem identity/custody objects are
canonical absolute paths. Project/session/run and current
profile-policy version equality-bind authoritative scope; no caller selects a
policy. Rows are insert-only. The pointer starts at generation one and advances
by one expected-generation CAS to a strictly higher revision of the same
policy stream; rewind, delete, crossed scope and alternate current rows abort.
Compilation, dispatch and resume require the receipt's exact ID/revision/digest
and policy version to remain current. A disabled requested rule classifies
`profile-disabled`; an enabled rule only narrows the other four inputs.

The task/worktree compiler input is backed by an immutable no-follow identity,
not caller path strings or a bare digest. `taskAgentId`, `taskId`,
`taskGeneration`, `writerLeaseId` and `writerLeaseGeneration` are displayed
members of `ownedWorktreeIdentityV1` and the relational columns below must
equality-copy them. Run, task revision and owner-lease generation are the
additional authenticated relational snapshot used by currentness checks:

```sql
authority_owned_worktree_bindings(
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  host_identity_digest TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL CHECK(task_revision >= 1),
  task_generation INTEGER NOT NULL CHECK(task_generation >= 1),
  task_agent_id TEXT NOT NULL,
  owner_lease_generation INTEGER NOT NULL CHECK(owner_lease_generation >= 1),
  writer_lease_id TEXT NOT NULL,
  writer_lease_generation INTEGER NOT NULL
    CHECK(writer_lease_generation >= 1),
  repository_root_path TEXT NOT NULL,
  repository_root_device INTEGER NOT NULL CHECK(repository_root_device >= 0),
  repository_root_inode INTEGER NOT NULL CHECK(repository_root_inode >= 1),
  repository_root_file_type TEXT NOT NULL
    CHECK(repository_root_file_type = 'directory'),
  common_git_directory_path TEXT NOT NULL,
  common_git_directory_device INTEGER NOT NULL
    CHECK(common_git_directory_device >= 0),
  common_git_directory_inode INTEGER NOT NULL
    CHECK(common_git_directory_inode >= 1),
  common_git_directory_file_type TEXT NOT NULL
    CHECK(common_git_directory_file_type = 'directory'),
  worktree_root_path TEXT NOT NULL,
  worktree_root_device INTEGER NOT NULL CHECK(worktree_root_device >= 0),
  worktree_root_inode INTEGER NOT NULL CHECK(worktree_root_inode >= 1),
  worktree_root_file_type TEXT NOT NULL
    CHECK(worktree_root_file_type = 'directory'),
  worktree_git_link_path TEXT NOT NULL,
  worktree_git_link_device INTEGER NOT NULL
    CHECK(worktree_git_link_device >= 0),
  worktree_git_link_inode INTEGER NOT NULL
    CHECK(worktree_git_link_inode >= 1),
  worktree_git_link_file_type TEXT NOT NULL
    CHECK(worktree_git_link_file_type = 'regular-file'),
  worktree_git_link_content_digest TEXT NOT NULL,
  worktree_identity_json TEXT NOT NULL,
  worktree_identity_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(coordination_run_id, task_id, task_generation),
  UNIQUE(worktree_identity_digest),
  UNIQUE(coordination_run_id, task_id, host_identity_digest,
    worktree_identity_digest),
  UNIQUE(coordination_run_id, task_id, task_revision,
    host_identity_digest, worktree_identity_digest),
  UNIQUE(coordination_run_id, task_id, task_revision, task_generation,
    task_agent_id, owner_lease_generation, writer_lease_id,
    writer_lease_generation, host_identity_digest,
    worktree_identity_digest),
  FOREIGN KEY(coordination_run_id, task_id)
    REFERENCES tasks(run_id, task_id),
  FOREIGN KEY(coordination_run_id, task_agent_id)
    REFERENCES agents(run_id, agent_id),
  FOREIGN KEY(host_identity_digest)
    REFERENCES authority_host_identities(host_identity_digest)
)

authority_owned_worktree_current(
  coordination_run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  pointer_generation INTEGER NOT NULL CHECK(pointer_generation >= 1),
  task_revision INTEGER NOT NULL CHECK(task_revision >= 1),
  task_generation INTEGER NOT NULL CHECK(task_generation >= 1),
  task_agent_id TEXT NOT NULL,
  owner_lease_generation INTEGER NOT NULL CHECK(owner_lease_generation >= 1),
  writer_lease_id TEXT NOT NULL,
  writer_lease_generation INTEGER NOT NULL
    CHECK(writer_lease_generation >= 1),
  worktree_identity_digest TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(coordination_run_id, task_id),
  UNIQUE(coordination_run_id, task_id, pointer_generation),
  FOREIGN KEY(coordination_run_id, task_id, task_revision,
      task_generation,
      task_agent_id, owner_lease_generation, writer_lease_id,
      writer_lease_generation, host_identity_digest,
      worktree_identity_digest)
    REFERENCES authority_owned_worktree_bindings(
      coordination_run_id, task_id, task_revision, task_generation,
      task_agent_id, owner_lease_generation, writer_lease_id,
      writer_lease_generation, host_identity_digest,
      worktree_identity_digest)
)
```

`worktree_identity_json` byte-equals the closed Spec 01 object and its digest
recomputes with `AD("owned-worktree-identity-v1",...)`. Capture uses
`lstat`/no-follow for all four filesystem objects, hashes the exact regular
`.git` link bytes and rejects a symlink, hard-link substitution where
applicable, changed device/inode/type, noncanonical path or worktree root other
than the owning repository's `.worktrees/<task-agent>` child. The common Git
directory and repository root are identity/containment parents, never write
roots; the owning repository root is not a deny prefix because the permitted
worktree is its descendant. The insert also joins the exact current host,
task owner plus active write
lease and equality-copies their revision/generations. Rows are insert-only.
Current publication is an expected-generation CAS to the exact contiguous task
generation; stale task/owner/writer-lease state cannot become current.

Every profile also binds its relative wire coordinate to one immutable
no-follow execution root; this parent is mandatory even when no writer lease or
owned worktree exists:

```sql
authority_workspace_root_identities(
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  identity_id TEXT NOT NULL,
  identity_revision INTEGER NOT NULL CHECK(identity_revision >= 1),
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL CHECK(task_revision >= 1),
  host_identity_digest TEXT NOT NULL,
  coordinate_root TEXT NOT NULL,
  binding_kind TEXT NOT NULL CHECK(binding_kind IN
    ('project-root','owned-worktree')),
  canonical_execution_root TEXT NOT NULL,
  device INTEGER NOT NULL CHECK(device >= 0),
  inode INTEGER NOT NULL CHECK(inode >= 1),
  file_type TEXT NOT NULL CHECK(file_type = 'directory'),
  worktree_identity_digest TEXT,
  workspace_root_identity_json TEXT NOT NULL,
  workspace_root_identity_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(identity_id, identity_revision),
  UNIQUE(workspace_root_identity_digest),
  UNIQUE(workspace_root_identity_digest, host_identity_digest),
  UNIQUE(workspace_root_identity_digest, host_identity_digest, binding_kind),
  UNIQUE(workspace_root_identity_digest, host_identity_digest,
    worktree_identity_digest),
  UNIQUE(project_id, project_session_id, coordination_run_id, task_id,
    host_identity_digest, coordinate_root, identity_id, identity_revision,
    workspace_root_identity_digest, binding_kind),
  FOREIGN KEY(project_session_id, coordination_run_id)
    REFERENCES runs(project_session_id, run_id),
  FOREIGN KEY(coordination_run_id, task_id)
    REFERENCES tasks(run_id, task_id),
  FOREIGN KEY(host_identity_digest)
    REFERENCES authority_host_identities(host_identity_digest),
  FOREIGN KEY(coordination_run_id, task_id, task_revision,
      host_identity_digest,
      worktree_identity_digest)
    REFERENCES authority_owned_worktree_bindings(
      coordination_run_id, task_id, task_revision,
      host_identity_digest, worktree_identity_digest),
  CHECK(
    (binding_kind = 'project-root' AND
      worktree_identity_digest IS NULL) OR
    (binding_kind = 'owned-worktree' AND
      worktree_identity_digest IS NOT NULL)
  )
)

authority_workspace_root_current(
  project_id TEXT NOT NULL,
  project_session_id TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  coordinate_root TEXT NOT NULL,
  pointer_generation INTEGER NOT NULL CHECK(pointer_generation >= 1),
  identity_id TEXT NOT NULL,
  identity_revision INTEGER NOT NULL CHECK(identity_revision >= 1),
  workspace_root_identity_digest TEXT NOT NULL,
  binding_kind TEXT NOT NULL,
  worktree_identity_digest TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id, project_session_id, coordination_run_id, task_id,
    host_identity_digest, coordinate_root),
  UNIQUE(project_id, project_session_id, coordination_run_id, task_id,
    host_identity_digest, coordinate_root, pointer_generation),
  FOREIGN KEY(project_id, project_session_id, coordination_run_id, task_id,
      host_identity_digest, coordinate_root, identity_id, identity_revision,
      workspace_root_identity_digest, binding_kind)
    REFERENCES authority_workspace_root_identities(
      project_id, project_session_id, coordination_run_id, task_id,
      host_identity_digest, coordinate_root, identity_id, identity_revision,
      workspace_root_identity_digest, binding_kind),
  FOREIGN KEY(workspace_root_identity_digest, host_identity_digest,
      worktree_identity_digest)
    REFERENCES authority_workspace_root_identities(
      workspace_root_identity_digest, host_identity_digest,
      worktree_identity_digest),
  FOREIGN KEY(coordination_run_id, task_id, host_identity_digest,
      worktree_identity_digest)
    REFERENCES authority_owned_worktree_bindings(
      coordination_run_id, task_id, host_identity_digest,
      worktree_identity_digest),
  CHECK(
    (binding_kind = 'project-root' AND
      worktree_identity_digest IS NULL) OR
    (binding_kind = 'owned-worktree' AND
      worktree_identity_digest IS NOT NULL)
  )
)
```

Insert byte-validates `authorityWorkspaceRootIdentityV1`, recomputes
`AD("authority-workspace-root-identity-v1",...)` and preserves
`coordinateRoot` as a canonical workspace-relative prefix. It captures the
absolute execution root with `lstat`/no-follow. A project-root row
equality-binds daemon-authenticated project/workspace configuration; an owned-
worktree row equality-copies its worktree parent's canonical root, device,
inode, type, task, host and digest. The nonnullable current-pointer FK remains
enforced for a project-root arm; the nullable worktree FK is only an additional
owned-worktree equality check and cannot erase the immutable root parent.
Rows are insert-only. The exact host/project/session/run/task/coordinate tuple current
pointer advances by expected-generation CAS without rewind or tuple crossing.
Compilation, dispatch, resume and each filesystem open require the selected
identity/revision/digest, host and observed filesystem identity to remain current.

Any provider-private temp root is separately pre-provisioned and receipted by
task/worktree custody before an action request. The compiler has no create,
repair or fallback arm:

```sql
authority_private_temp_root_custody(
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  custody_id TEXT NOT NULL,
  custody_revision INTEGER NOT NULL CHECK(custody_revision >= 1),
  coordination_run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL CHECK(task_revision >= 1),
  adapter_id TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  worktree_identity_digest TEXT NOT NULL,
  writer_lease_id TEXT NOT NULL,
  writer_lease_generation INTEGER NOT NULL
    CHECK(writer_lease_generation >= 1),
  canonical_path TEXT NOT NULL,
  device INTEGER NOT NULL CHECK(device >= 0),
  inode INTEGER NOT NULL CHECK(inode >= 1),
  file_type TEXT NOT NULL CHECK(file_type = 'directory'),
  owner_uid INTEGER NOT NULL CHECK(owner_uid >= 0),
  mode TEXT NOT NULL CHECK(mode = '0700'),
  expires_at TEXT NOT NULL,
  custody_json TEXT NOT NULL,
  private_temp_root_identity_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(custody_id, custody_revision),
  UNIQUE(private_temp_root_identity_digest),
  UNIQUE(coordination_run_id, task_id, task_revision, adapter_id,
    adapter_contract_digest, host_identity_digest,
    worktree_identity_digest, writer_lease_id, writer_lease_generation,
    custody_id, custody_revision, private_temp_root_identity_digest),
  FOREIGN KEY(coordination_run_id, task_id, task_revision,
      host_identity_digest, worktree_identity_digest)
    REFERENCES authority_owned_worktree_bindings(
      coordination_run_id, task_id, task_revision,
      host_identity_digest, worktree_identity_digest),
  FOREIGN KEY(host_identity_digest)
    REFERENCES authority_host_identities(host_identity_digest)
)

authority_private_temp_root_current(
  coordination_run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL CHECK(task_revision >= 1),
  adapter_id TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  worktree_identity_digest TEXT NOT NULL,
  writer_lease_id TEXT NOT NULL,
  writer_lease_generation INTEGER NOT NULL
    CHECK(writer_lease_generation >= 1),
  pointer_generation INTEGER NOT NULL CHECK(pointer_generation >= 1),
  custody_id TEXT NOT NULL,
  custody_revision INTEGER NOT NULL CHECK(custody_revision >= 1),
  private_temp_root_identity_digest TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(coordination_run_id, task_id, task_revision, adapter_id,
    adapter_contract_digest, host_identity_digest,
    worktree_identity_digest, writer_lease_id, writer_lease_generation),
  UNIQUE(coordination_run_id, task_id, task_revision, adapter_id,
    adapter_contract_digest, host_identity_digest,
    worktree_identity_digest, writer_lease_id, writer_lease_generation,
    pointer_generation),
  FOREIGN KEY(coordination_run_id, task_id, task_revision, adapter_id,
      adapter_contract_digest, host_identity_digest,
      worktree_identity_digest, writer_lease_id, writer_lease_generation,
      custody_id, custody_revision, private_temp_root_identity_digest)
    REFERENCES authority_private_temp_root_custody(
      coordination_run_id, task_id, task_revision, adapter_id,
      adapter_contract_digest, host_identity_digest,
      worktree_identity_digest, writer_lease_id, writer_lease_generation,
      custody_id, custody_revision, private_temp_root_identity_digest)
)
```

Custody insert byte-validates `authorityPrivateTempRootV1`, recomputes
`AD("authority-private-temp-root-v1",...)`, performs no-follow identity and
owner/mode checks, and equality-binds current task revision, worktree identity,
writer lease, adapter/contract and host. Rows are insert-only and expire
without grace. The current pointer starts at generation one and advances by
one expected-generation CAS to a strictly newer custody revision. Pointer
rewind, delete and reuse after worktree/lease/adapter/host drift abort. The
daemon re-observes path/device/inode/type/owner/mode at publication, compilation,
dispatch/resume and immediately before every provider filesystem operation.

The complete second compiler input is itself an immutable parent. This closes
task/owner/lease authority for read-only and rejected receipts independently of
the optional worktree foreign key:

```sql
authority_task_ownership_inputs(
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  action_adapter_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  preflight_owner_digest TEXT NOT NULL,
  preflight_input_digest TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  authority_envelope_digest TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL CHECK(task_revision >= 1),
  owner_agent_id TEXT NOT NULL,
  owner_lease_generation INTEGER NOT NULL CHECK(owner_lease_generation >= 1),
  host_identity_digest TEXT NOT NULL,
  workspace_root_identity_digest TEXT NOT NULL,
  workspace_root_binding_kind TEXT NOT NULL CHECK(
    workspace_root_binding_kind IN ('project-root','owned-worktree')),
  workspace_root_worktree_identity_digest TEXT,
  writer_lease_state TEXT NOT NULL CHECK(
    writer_lease_state IN ('none','current')),
  writer_lease_id TEXT,
  writer_lease_generation INTEGER CHECK(
    writer_lease_generation IS NULL OR writer_lease_generation >= 1),
  requested_actions_json TEXT NOT NULL,
  requested_artifact_paths_json TEXT NOT NULL,
  task_budget_json TEXT NOT NULL,
  worktree_task_generation INTEGER CHECK(
    worktree_task_generation IS NULL OR worktree_task_generation >= 1),
  worktree_identity_digest TEXT,
  private_temp_adapter_contract_digest TEXT,
  private_temp_host_identity_digest TEXT,
  private_temp_custody_id TEXT,
  private_temp_custody_revision INTEGER CHECK(
    private_temp_custody_revision IS NULL OR
    private_temp_custody_revision >= 1),
  private_temp_root_identity_digest TEXT,
  task_ownership_json TEXT NOT NULL,
  task_ownership_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(action_adapter_id, action_id),
  UNIQUE(action_adapter_id, action_id, task_ownership_digest,
    coordination_run_id, authority_id, authority_envelope_digest,
    task_id, task_revision, owner_agent_id, owner_lease_generation,
    host_identity_digest, workspace_root_identity_digest,
    workspace_root_binding_kind, writer_lease_state),
  FOREIGN KEY(action_adapter_id, action_id,
      preflight_owner_digest, preflight_input_digest)
    REFERENCES provider_action_pair_preflights(
      adapter_id, action_id, owner_digest, input_digest),
  FOREIGN KEY(coordination_run_id, task_id)
    REFERENCES tasks(run_id, task_id),
  FOREIGN KEY(coordination_run_id, owner_agent_id)
    REFERENCES agents(run_id, agent_id),
  FOREIGN KEY(coordination_run_id, authority_id,
      authority_envelope_digest)
    REFERENCES authority_envelope_v2_objects(
      coordination_run_id, authority_id, authority_envelope_digest),
  FOREIGN KEY(workspace_root_identity_digest, host_identity_digest,
      workspace_root_binding_kind)
    REFERENCES authority_workspace_root_identities(
      workspace_root_identity_digest, host_identity_digest, binding_kind),
  FOREIGN KEY(workspace_root_identity_digest, host_identity_digest,
      workspace_root_worktree_identity_digest)
    REFERENCES authority_workspace_root_identities(
      workspace_root_identity_digest, host_identity_digest,
      worktree_identity_digest),
  FOREIGN KEY(coordination_run_id, task_id, task_revision,
      worktree_task_generation, owner_agent_id, owner_lease_generation,
      writer_lease_id, writer_lease_generation, host_identity_digest,
      worktree_identity_digest)
    REFERENCES authority_owned_worktree_bindings(
      coordination_run_id, task_id, task_revision, task_generation,
      task_agent_id, owner_lease_generation, writer_lease_id,
      writer_lease_generation, host_identity_digest,
      worktree_identity_digest),
  FOREIGN KEY(coordination_run_id, task_id, task_revision,
      action_adapter_id, private_temp_adapter_contract_digest,
      private_temp_host_identity_digest,
      worktree_identity_digest, writer_lease_id, writer_lease_generation,
      private_temp_custody_id, private_temp_custody_revision,
      private_temp_root_identity_digest)
    REFERENCES authority_private_temp_root_custody(
      coordination_run_id, task_id, task_revision,
      adapter_id, adapter_contract_digest, host_identity_digest,
      worktree_identity_digest, writer_lease_id, writer_lease_generation,
      custody_id, custody_revision, private_temp_root_identity_digest),
  CHECK(
    (workspace_root_binding_kind = 'project-root' AND
      workspace_root_worktree_identity_digest IS NULL) OR
    (workspace_root_binding_kind = 'owned-worktree' AND
      workspace_root_worktree_identity_digest IS NOT NULL)
  ),
  CHECK(
    (writer_lease_state = 'none' AND writer_lease_id IS NULL AND
      writer_lease_generation IS NULL AND
      worktree_task_generation IS NULL AND
      worktree_identity_digest IS NULL AND
      private_temp_custody_id IS NULL AND
      private_temp_custody_revision IS NULL AND
      private_temp_root_identity_digest IS NULL) OR
    (writer_lease_state = 'current' AND
      writer_lease_id IS NOT NULL AND
      writer_lease_generation IS NOT NULL)
  ),
  CHECK(
    (worktree_task_generation IS NULL AND
      worktree_identity_digest IS NULL) OR
    (worktree_task_generation IS NOT NULL AND
      worktree_identity_digest IS NOT NULL)
  ),
  CHECK(
    (private_temp_custody_id IS NULL AND
      private_temp_adapter_contract_digest IS NULL AND
      private_temp_host_identity_digest IS NULL AND
      private_temp_custody_revision IS NULL AND
      private_temp_root_identity_digest IS NULL) OR
    (private_temp_custody_id IS NOT NULL AND
      private_temp_adapter_contract_digest IS NOT NULL AND
      private_temp_host_identity_digest IS NOT NULL AND
      private_temp_host_identity_digest = host_identity_digest AND
      private_temp_custody_revision IS NOT NULL AND
      private_temp_root_identity_digest IS NOT NULL AND
      worktree_identity_digest IS NOT NULL)
  )
)

CREATE TRIGGER authority_task_ownership_requires_current_envelope
BEFORE INSERT ON authority_task_ownership_inputs
WHEN NOT EXISTS (
  SELECT 1
  FROM runs r
  JOIN run_authority_revisions h
    ON h.project_session_id = r.project_session_id AND
      h.coordination_run_id = r.run_id AND
      h.authority_revision = r.authority_revision AND
      h.authority_ref = r.authority_ref
  WHERE r.run_id = NEW.coordination_run_id AND
    h.authority_id = NEW.authority_id AND
    h.authority_envelope_digest = NEW.authority_envelope_digest)
BEGIN SELECT RAISE(ABORT, 'authority-envelope-not-current'); END;
```
