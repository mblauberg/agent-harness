
The subject row fixes one stable `attestationId` for the complete provider /
adapter / contract / host / executable / capability-body / native-settings-
schema / family / model / raw-native-mode / profile tuple.
Insert validation requires byte-exact JCS for the closed object, recomputes
`attestationDigest=AD("authority-local-attestation-v1",
exactBodyWithoutAttestationDigest)`, equality-copies every normalised column,
requires canonical millisecond UTC clocks and the exact evidence foreign key.
An accepted read-only row binds a passing characterisation parent and no
decision; an accepted write-profile row binds the passing Step-3 matrix plus
its accepted same-subject council decision. An unavailable row has one closed
safe reason and no decision. Its `not-run` arm alone has an all-null evidence
tuple; the nullable evidence FK is disabled only in that strictly nonadmitting
arm. Capability refresh publishes this authenticated exact tuple and its
current pointer before the first Step-3 run, so a pre-gate request can persist
its rejected receipt. Missing even that row is preflight integrity failure, not
a compiler result. The `evaluated` unavailable arm requires the complete
fail/unavailable evidence parent or a passing parent without an accepted
decision. All subject and attestation rows are insert-only.

The schema-source trigger resolves the current activated adapter/contract/
host/executable compiler-target registration before publication. An enforceable
current capability pointer/support row for the exact capability-body digest
must name and equal that same schema. A
capability-unavailable `not-run` tuple may have no enforceable support row, so
its nonnull schema digest equality-copies the activated compiler target instead;
an unavailable support arm never fabricates a schema member. If no current
activated compiler target exists, adapter preflight fails before compilation
and no attestation or rejected receipt is manufactured.

Unavailable `safeReason` is likewise derived, not caller-selected. A selected
unavailable capability-support row yields
`provider-capability-unavailable`. With enforceable support, a write tuple
lacking passing Step-3 evidence plus its accepted council decision yields
`profile-disabled`; a read-only tuple lacking passing fixed characterisation
yields `local-attestation-unavailable`. The same derivation applies to
`not-run` and `evaluated`, and the current capability/support/evidence parents
are inputs to the trigger.

For an evaluated or accepted write tuple, publication and current-pointer CAS
join the evidence's exact matrix policy version/digest to the singleton current
policy row. Compilation, dispatch, crash resume and every provider/tool
operation repeat that join before use; pointer drift invalidates the tuple and
cannot be treated as body-equivalent refresh. The `not-run` arm remains
nonadmitting and has no fabricated matrix policy ref.

Attestation publication uses one `BEGIN IMMEDIATE` transaction. The initial
row is revision/pointer generation one. Every successor revision is contiguous;
the pointer update is an expected-generation CAS to the exact successor row and
increments `pointer_generation` by one. Triggers reject a tuple change, stable-
ID change, revision skip, non-increasing `observed_at`, expired successor,
rewind, delete or update outside that CAS. A committed unavailable successor is
therefore current evidence, not absence. No old accepted row can be selected
again after expiry, revocation, pointer advance or tuple drift.

```sql
adapter_capability_snapshots(
  adapter_id, snapshot_generation, snapshot_id,
  adapter_contract_digest, host_id, host_version, source NOT NULL,
  observed_at, expires_at, capability_body_digest,
  snapshot_json,
  capability_kind GENERATED ALWAYS AS
    (json_extract(snapshot_json, '$.capabilities.kind')) STORED NOT NULL,
  snapshot_digest, created_at,
  PRIMARY KEY(adapter_id, snapshot_generation),
  UNIQUE(snapshot_id), UNIQUE(snapshot_digest),
  UNIQUE(adapter_id, snapshot_generation, snapshot_digest,
    capability_body_digest),
  CHECK(source IN ('runtime-discovery','version-pinned-conformance',
    'unavailable')),
  CHECK(capability_kind IS NOT NULL AND
    capability_kind IN ('available','unavailable')),
  CHECK((source='unavailable' AND capability_kind='unavailable') OR
    (source IN ('runtime-discovery','version-pinned-conformance') AND
      capability_kind='available'))
)

adapter_capability_current(
  adapter_id PRIMARY KEY,
  snapshot_generation, snapshot_digest, capability_body_digest, revision,
  FOREIGN KEY(adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest)
    REFERENCES adapter_capability_snapshots(
      adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest)
)

adapter_capability_authority_profile_support(
  adapter_id TEXT NOT NULL,
  snapshot_generation INTEGER NOT NULL CHECK(snapshot_generation >= 1),
  snapshot_digest TEXT NOT NULL,
  capability_body_digest TEXT NOT NULL,
  family TEXT NOT NULL,
  model TEXT NOT NULL,
  raw_native_mode_jcs TEXT NOT NULL,
  authority_profile TEXT NOT NULL CHECK(authority_profile IN
    ('review-readonly','workspace-write-offline')),
  support_state TEXT NOT NULL CHECK(support_state IN
    ('unavailable','enforceable')),
  unavailable_reason TEXT,
  filesystem_mode TEXT CHECK(filesystem_mode IS NULL OR
    filesystem_mode IN ('readonly','one-owned-worktree')),
  private_temp_requirement TEXT CHECK(private_temp_requirement IS NULL OR
    private_temp_requirement IN ('none','required')),
  tool_egress TEXT CHECK(tool_egress IS NULL OR tool_egress = 'none'),
  secret_access TEXT CHECK(secret_access IS NULL OR secret_access = 'none'),
  external_effects TEXT CHECK(
    external_effects IS NULL OR external_effects = 'none'),
  native_settings_schema_digest TEXT,
  PRIMARY KEY(adapter_id, snapshot_generation, family, model,
    raw_native_mode_jcs, authority_profile),
  UNIQUE(adapter_id, snapshot_generation, snapshot_digest,
    capability_body_digest, family, model, raw_native_mode_jcs,
    authority_profile, support_state, filesystem_mode,
    private_temp_requirement, native_settings_schema_digest),
  UNIQUE(adapter_id, snapshot_generation, snapshot_digest,
    capability_body_digest, family, model, raw_native_mode_jcs,
    authority_profile, support_state),
  FOREIGN KEY(adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest)
    REFERENCES adapter_capability_snapshots(
      adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest),
  CHECK(json_valid(raw_native_mode_jcs) = 1 AND
    json_type(raw_native_mode_jcs) IN ('null','text')),
  CHECK(
    (support_state = 'unavailable' AND unavailable_reason IS NOT NULL AND
      filesystem_mode IS NULL AND private_temp_requirement IS NULL AND
      tool_egress IS NULL AND secret_access IS NULL AND
      external_effects IS NULL AND native_settings_schema_digest IS NULL) OR
    (support_state = 'enforceable' AND unavailable_reason IS NULL AND
      filesystem_mode IS NOT NULL AND
      private_temp_requirement IS NOT NULL AND
      tool_egress IS NOT NULL AND secret_access IS NOT NULL AND
      external_effects IS NOT NULL AND
      tool_egress = 'none' AND secret_access = 'none' AND
      external_effects = 'none' AND
      native_settings_schema_digest IS NOT NULL AND
      ((authority_profile = 'review-readonly' AND
        filesystem_mode = 'readonly' AND
        private_temp_requirement = 'none') OR
       (authority_profile = 'workspace-write-offline' AND
        filesystem_mode = 'one-owned-worktree' AND
        private_temp_requirement IN ('none','required'))))
  )
)

CREATE TRIGGER adapter_capability_authority_support_no_update
BEFORE UPDATE ON adapter_capability_authority_profile_support
BEGIN SELECT RAISE(ABORT, 'capability-authority-support-immutable'); END;

CREATE TRIGGER adapter_capability_authority_support_no_delete
BEFORE DELETE ON adapter_capability_authority_profile_support
BEGIN SELECT RAISE(ABORT, 'capability-authority-support-immutable'); END;

CREATE TRIGGER adapter_capability_current_support_complete_on_insert
BEFORE INSERT ON adapter_capability_current
WHEN fabric_capability_support_index_complete_v1(
  NEW.adapter_id, NEW.snapshot_generation, NEW.snapshot_digest,
  NEW.capability_body_digest) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'capability-authority-support-incomplete'); END;

CREATE TRIGGER adapter_capability_current_support_complete_on_update
BEFORE UPDATE ON adapter_capability_current
WHEN fabric_capability_support_index_complete_v1(
  NEW.adapter_id, NEW.snapshot_generation, NEW.snapshot_digest,
  NEW.capability_body_digest) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'capability-authority-support-incomplete'); END;
```

`snapshot_json` byte-equals JCS of the closed Spec 01 object. Insert validates
the exact stable body preimage/digest, snapshot digest, contiguous positive
generation, `expires_at > observed_at`, sorted
unique catalogues and the activated contract. The normalised support children
equality-copy every JSON row and reject a read-only temp requirement, a write
filesystem mode other than one owned worktree, or any non-`none` egress,
secret-access or external-effect setting. Snapshot and support-child rows are
insert-only. Before initial or successor current-pointer publication, the
generated completeness validator expands `snapshot_json` and requires exact
one-to-one child cardinality and byte equality: no missing, extra, duplicate or
crossed tuple/state/detail/schema row can become current.
The single current-pointer row advances by generation/digest/revision CAS in the
activation transaction and additionally equality-checks the referenced row's
digest. An expired or unavailable snapshot remains immutable audit evidence but
cannot be selected by admission.

Discovery surfaces and effective configurations are immutable daemon evidence:

```sql
discovery_surface_manifests(
  evidence_id, evidence_revision, artifact_path, artifact_digest,
  host_id, host_version, provider_profile, raw_native_mode,
  permission_profile_digest, manifest_json, manifest_digest, created_at,
  PRIMARY KEY(evidence_id, evidence_revision),
  UNIQUE(evidence_id, evidence_revision, manifest_digest),
  FOREIGN KEY(evidence_id, evidence_revision)
    REFERENCES artifacts(artifact_id, revision)
)

adapter_activation_subjects(
  adapter_id, activation_id, activation_revision,
  evidence_id, evidence_revision, created_at,
  PRIMARY KEY(adapter_id, activation_id, activation_revision),
  UNIQUE(evidence_id, evidence_revision),
  FOREIGN KEY(evidence_id, evidence_revision)
    REFERENCES artifacts(artifact_id, revision)
)

adapter_provider_smoke_subjects(
  adapter_id, smoke_id, action_adapter_id, action_id,
  evidence_id, evidence_revision, created_at,
  PRIMARY KEY(adapter_id, smoke_id),
  UNIQUE(action_adapter_id, action_id),
  UNIQUE(evidence_id, evidence_revision),
  CHECK(action_adapter_id = adapter_id),
  FOREIGN KEY(evidence_id, evidence_revision)
    REFERENCES artifacts(artifact_id, revision),
  FOREIGN KEY(action_adapter_id, action_id)
    REFERENCES provider_action_pair_preflights(adapter_id, action_id)
)

adapter_effective_configurations(
  configuration_id, configuration_revision,
  adapter_id TEXT NOT NULL, adapter_contract_digest NOT NULL,
  host_identity_digest TEXT NOT NULL,
  executable_identity_digest NOT NULL,
  capability_snapshot_generation, capability_snapshot_digest,
  capability_body_digest, native_settings_schema_digest TEXT NOT NULL,
  subject_kind TEXT NOT NULL CHECK(subject_kind IN
    ('activation','provider-smoke','provider-action')),
  subject_ref_digest TEXT NOT NULL,
  subject_activation_id, subject_activation_revision, subject_smoke_id,
  subject_action_adapter_id, subject_action_id,
  activation_configuration_id, activation_configuration_revision,
  activation_configuration_digest, activation_configuration_subject_kind,
  requested_configuration_digest,
  effective_configuration_digest, permission_profile_digest,
  discovery_surface_evidence_id, discovery_surface_evidence_revision,
  evidence_id, evidence_revision,
  configuration_json, configuration_digest, created_at,
  PRIMARY KEY(configuration_id, configuration_revision),
  UNIQUE(configuration_id, configuration_revision, configuration_digest),
  UNIQUE(adapter_id, subject_kind, configuration_id,
    configuration_revision, configuration_digest),
  UNIQUE(adapter_id, subject_kind, configuration_id,
    configuration_revision, configuration_digest,
    host_identity_digest, executable_identity_digest,
    capability_body_digest, native_settings_schema_digest),
  UNIQUE(evidence_id, evidence_revision),
  UNIQUE(configuration_digest),
  UNIQUE(subject_action_adapter_id,subject_action_id,subject_kind,
    adapter_contract_digest,configuration_id,configuration_revision,
    configuration_digest,effective_configuration_digest,
    executable_identity_digest),
  UNIQUE(subject_action_adapter_id, subject_action_id, subject_kind,
    adapter_id, adapter_contract_digest, host_identity_digest,
    configuration_id, configuration_revision, configuration_digest,
    capability_snapshot_generation, capability_snapshot_digest,
    capability_body_digest, native_settings_schema_digest,
    effective_configuration_digest,
    permission_profile_digest, executable_identity_digest),
  FOREIGN KEY(evidence_id, evidence_revision)
    REFERENCES artifacts(artifact_id, revision),
  FOREIGN KEY(adapter_id, capability_snapshot_generation,
      capability_snapshot_digest, capability_body_digest)
    REFERENCES adapter_capability_snapshots(
      adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest),
  FOREIGN KEY(host_identity_digest)
    REFERENCES authority_host_identities(host_identity_digest),
  FOREIGN KEY(discovery_surface_evidence_id,
      discovery_surface_evidence_revision)
    REFERENCES discovery_surface_manifests(evidence_id, evidence_revision),
  FOREIGN KEY(adapter_id, subject_activation_id, subject_activation_revision)
    REFERENCES adapter_activation_subjects(
      adapter_id, activation_id, activation_revision),
  FOREIGN KEY(adapter_id, subject_smoke_id)
    REFERENCES adapter_provider_smoke_subjects(adapter_id, smoke_id),
  FOREIGN KEY(subject_action_adapter_id, subject_action_id)
    REFERENCES provider_action_pair_preflights(adapter_id, action_id),
  FOREIGN KEY(adapter_id, activation_configuration_subject_kind,
      activation_configuration_id, activation_configuration_revision,
      activation_configuration_digest, host_identity_digest,
      executable_identity_digest, capability_body_digest,
      native_settings_schema_digest)
    REFERENCES adapter_effective_configurations(
      adapter_id, subject_kind, configuration_id, configuration_revision,
      configuration_digest, host_identity_digest,
      executable_identity_digest, capability_body_digest,
      native_settings_schema_digest),
  CHECK(
    (subject_kind='activation' AND
      activation_configuration_id IS NULL AND
      activation_configuration_revision IS NULL AND
      activation_configuration_digest IS NULL AND
      activation_configuration_subject_kind IS NULL) OR
    (subject_kind IN ('provider-smoke','provider-action') AND
      activation_configuration_id IS NOT NULL AND
      activation_configuration_revision IS NOT NULL AND
      activation_configuration_digest IS NOT NULL AND
      activation_configuration_subject_kind='activation')),
  CHECK(
    (subject_kind='activation' AND subject_activation_id IS NOT NULL AND
      subject_activation_revision IS NOT NULL AND subject_smoke_id IS NULL AND
      subject_action_adapter_id IS NULL AND subject_action_id IS NULL) OR
    (subject_kind='provider-smoke' AND subject_activation_id IS NULL AND
      subject_activation_revision IS NULL AND subject_smoke_id IS NOT NULL AND
      subject_action_adapter_id IS NULL AND subject_action_id IS NULL) OR
    (subject_kind='provider-action' AND subject_activation_id IS NULL AND
      subject_activation_revision IS NULL AND subject_smoke_id IS NULL AND
      subject_action_adapter_id IS NOT NULL AND
      subject_action_adapter_id=adapter_id AND subject_action_id IS NOT NULL))
)

CREATE UNIQUE INDEX one_effective_configuration_per_activation_subject
  ON adapter_effective_configurations(
    adapter_id, subject_activation_id, subject_activation_revision)
  WHERE subject_kind='activation';
CREATE UNIQUE INDEX one_effective_configuration_per_smoke_subject
  ON adapter_effective_configurations(adapter_id, subject_smoke_id)
  WHERE subject_kind='provider-smoke';
CREATE UNIQUE INDEX one_effective_configuration_per_provider_action
  ON adapter_effective_configurations(
    subject_action_adapter_id, subject_action_id)
  WHERE subject_kind='provider-action';
```

Every compilation attempt then has one immutable row even when admission
rejects and no `provider_actions` row exists. Preflight/task/policy/custody/
attestation/configuration IDs, revisions and normalised arm fields below are
relational bindings; they are not extra members of the generated wire receipt:

```sql
provider_authority_compilation_receipts(
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  action_adapter_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  preflight_owner_digest TEXT NOT NULL,
  preflight_input_digest TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL CHECK(task_revision >= 1),
  worktree_task_generation INTEGER CHECK(
    worktree_task_generation IS NULL OR worktree_task_generation >= 1),
  task_agent_id TEXT NOT NULL,
  owner_lease_generation INTEGER NOT NULL CHECK(owner_lease_generation >= 1),
  writer_lease_state TEXT NOT NULL CHECK(
    writer_lease_state IN ('none','current')),
  writer_lease_id TEXT,
  writer_lease_generation INTEGER CHECK(
    writer_lease_generation IS NULL OR writer_lease_generation >= 1),
  authority_id TEXT NOT NULL,
  authority_envelope_digest TEXT NOT NULL,
  approval_evidence_digest TEXT NOT NULL,
  task_ownership_json TEXT NOT NULL,
  task_ownership_digest TEXT NOT NULL,
  workspace_root_identity_digest TEXT NOT NULL,
  workspace_root_binding_kind TEXT NOT NULL CHECK(
    workspace_root_binding_kind IN ('project-root','owned-worktree')),
  workspace_root_worktree_identity_digest TEXT,
  worktree_identity_digest TEXT,
  task_private_temp_root_identity_digest TEXT,
  risk_policy_id TEXT NOT NULL,
  risk_policy_revision INTEGER NOT NULL CHECK(risk_policy_revision >= 1),
  risk_policy_digest TEXT NOT NULL,
  capability_snapshot_generation INTEGER NOT NULL
    CHECK(capability_snapshot_generation >= 1),
  provider_capability_snapshot_digest TEXT NOT NULL,
  capability_body_digest TEXT NOT NULL,
  capability_support_state TEXT NOT NULL CHECK(
    capability_support_state IN ('unavailable','enforceable')),
  capability_filesystem_mode TEXT CHECK(capability_filesystem_mode IS NULL OR
    capability_filesystem_mode IN ('readonly','one-owned-worktree')),
  capability_private_temp_requirement TEXT CHECK(
    capability_private_temp_requirement IS NULL OR
    capability_private_temp_requirement IN ('none','required')),
  local_attestation_digest TEXT NOT NULL,
  authority_compiler_version TEXT NOT NULL,
  expected_authority_profile_policy_version TEXT NOT NULL,
  authority_profile_policy_version TEXT NOT NULL,
  requested_authority_profile TEXT NOT NULL CHECK(
    requested_authority_profile IN
      ('review-readonly','workspace-write-offline')),
  requested_authority_profile_digest TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  executable_identity_digest TEXT NOT NULL,
  native_settings_schema_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('admitted','rejected')),
  effective_authority_profile TEXT CHECK(
    effective_authority_profile IS NULL OR
    effective_authority_profile IN
      ('review-readonly','workspace-write-offline')),
  effective_authority_json TEXT,
  effective_authority_digest TEXT,
  native_settings_json TEXT,
  native_settings_digest TEXT,
  canonical_read_roots_json TEXT,
  canonical_write_roots_json TEXT,
  canonical_write_root_count INTEGER CHECK(
    canonical_write_root_count IS NULL OR canonical_write_root_count >= 0),
  canonical_deny_roots_json TEXT,
  private_temp_root_identity_digest TEXT,
  task_private_temp_custody_id TEXT,
  task_private_temp_custody_revision INTEGER CHECK(
    task_private_temp_custody_revision IS NULL OR
    task_private_temp_custody_revision >= 1),
  tool_egress TEXT CHECK(tool_egress IS NULL OR tool_egress = 'none'),
  provider_control_plane_exception_digest TEXT,
  rejection_reason TEXT CHECK(
    rejection_reason IS NULL OR rejection_reason IN (
      'profile-disabled',
      'policy-version-mismatch',
      'authority-insufficient',
      'task-worktree-unbound',
      'risk-policy-forbidden',
      'provider-capability-unavailable',
      'local-attestation-unavailable',
      'certifying-requires-review-readonly'
    )),
  reject_certifying_requires_review_readonly INTEGER NOT NULL CHECK(
    reject_certifying_requires_review_readonly IN (0,1)),
  reject_profile_disabled INTEGER NOT NULL CHECK(
    reject_profile_disabled IN (0,1)),
  reject_policy_version_mismatch INTEGER NOT NULL CHECK(
    reject_policy_version_mismatch IN (0,1)),
  reject_authority_insufficient INTEGER NOT NULL CHECK(
    reject_authority_insufficient IN (0,1)),
  reject_task_worktree_unbound INTEGER NOT NULL CHECK(
    reject_task_worktree_unbound IN (0,1)),
  reject_risk_policy_forbidden INTEGER NOT NULL CHECK(
    reject_risk_policy_forbidden IN (0,1)),
  reject_provider_capability_unavailable INTEGER NOT NULL CHECK(
    reject_provider_capability_unavailable IN (0,1)),
  reject_local_attestation_unavailable INTEGER NOT NULL CHECK(
    reject_local_attestation_unavailable IN (0,1)),

  attestation_endpoint_provider TEXT NOT NULL,
  attestation_family TEXT NOT NULL,
  attestation_model TEXT NOT NULL,
  attestation_raw_native_mode_jcs TEXT NOT NULL,
  local_attestation_id TEXT NOT NULL,
  local_attestation_revision INTEGER NOT NULL
    CHECK(local_attestation_revision >= 1),
  local_attestation_state TEXT NOT NULL CHECK(
    local_attestation_state IN ('accepted','unavailable')),
  local_attestation_kind TEXT NOT NULL CHECK(
    local_attestation_kind IN
      ('readonly-characterisation','step3-containment')),

  effective_configuration_subject_kind TEXT CHECK(
    effective_configuration_subject_kind IS NULL OR
    effective_configuration_subject_kind = 'provider-action'),
  effective_configuration_id TEXT,
  effective_configuration_revision INTEGER CHECK(
    effective_configuration_revision IS NULL OR
    effective_configuration_revision >= 1),
  effective_configuration_ref_digest TEXT,
  effective_route_configuration_digest TEXT,

  receipt_json TEXT NOT NULL,
  receipt_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,

  PRIMARY KEY(action_adapter_id, action_id),
  UNIQUE(receipt_digest),
  UNIQUE(action_adapter_id, action_id, status, receipt_digest),
  UNIQUE(action_adapter_id, action_id, status, receipt_digest,
    requested_authority_profile_digest, requested_authority_profile,
    effective_authority_profile, effective_authority_digest,
    native_settings_digest, provider_control_plane_exception_digest,
    local_attestation_digest, capability_body_digest,
    executable_identity_digest, native_settings_schema_digest,
    authority_compiler_version,
    expected_authority_profile_policy_version,
    authority_profile_policy_version),
  UNIQUE(action_adapter_id, action_id, status, receipt_digest,
    coordination_run_id, authority_id, authority_envelope_digest,
    approval_evidence_digest, task_ownership_digest,
    workspace_root_identity_digest, risk_policy_digest,
    provider_capability_snapshot_digest,
    requested_authority_profile_digest, requested_authority_profile,
    effective_authority_profile, effective_authority_digest,
    native_settings_digest, provider_control_plane_exception_digest,
    local_attestation_digest, capability_body_digest,
    adapter_contract_digest, host_identity_digest,
    executable_identity_digest, native_settings_schema_digest,
    authority_compiler_version,
    expected_authority_profile_policy_version,
    authority_profile_policy_version),

  FOREIGN KEY(action_adapter_id, action_id,
      preflight_owner_digest, preflight_input_digest)
    REFERENCES provider_action_pair_preflights(
      adapter_id, action_id, owner_digest, input_digest),
  FOREIGN KEY(coordination_run_id, authority_id,
      authority_envelope_digest, approval_evidence_digest)
    REFERENCES authority_envelope_v2_objects(
      coordination_run_id, authority_id, authority_envelope_digest,
      approval_evidence_digest),
  FOREIGN KEY(action_adapter_id, action_id, task_ownership_digest,
      coordination_run_id, authority_id, authority_envelope_digest,
      task_id, task_revision, task_agent_id, owner_lease_generation,
      host_identity_digest, workspace_root_identity_digest,
      workspace_root_binding_kind, writer_lease_state)
    REFERENCES authority_task_ownership_inputs(
      action_adapter_id, action_id, task_ownership_digest,
      coordination_run_id, authority_id, authority_envelope_digest,
      task_id, task_revision, owner_agent_id, owner_lease_generation,
      host_identity_digest, workspace_root_identity_digest,
      workspace_root_binding_kind, writer_lease_state),
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
      worktree_task_generation,
      task_agent_id, owner_lease_generation, writer_lease_id,
      writer_lease_generation, host_identity_digest,
      worktree_identity_digest)
    REFERENCES authority_owned_worktree_bindings(
      coordination_run_id, task_id, task_revision, task_generation,
      task_agent_id, owner_lease_generation, writer_lease_id,
      writer_lease_generation, host_identity_digest,
      worktree_identity_digest),
  FOREIGN KEY(coordination_run_id, risk_policy_id, risk_policy_revision,
      risk_policy_digest, authority_profile_policy_version)
    REFERENCES authority_risk_policies(
      coordination_run_id, policy_id, policy_revision,
      risk_policy_digest, authority_profile_policy_version),
  FOREIGN KEY(coordination_run_id, task_id, task_revision, adapter_id,
      adapter_contract_digest, host_identity_digest,
      worktree_identity_digest, writer_lease_id, writer_lease_generation,
      task_private_temp_custody_id, task_private_temp_custody_revision,
      task_private_temp_root_identity_digest)
    REFERENCES authority_private_temp_root_custody(
      coordination_run_id, task_id, task_revision, adapter_id,
      adapter_contract_digest, host_identity_digest,
      worktree_identity_digest, writer_lease_id, writer_lease_generation,
      custody_id, custody_revision, private_temp_root_identity_digest),
  FOREIGN KEY(adapter_id, capability_snapshot_generation,
      provider_capability_snapshot_digest, capability_body_digest)
    REFERENCES adapter_capability_snapshots(
      adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest),
  FOREIGN KEY(adapter_id, capability_snapshot_generation,
      provider_capability_snapshot_digest, capability_body_digest,
      attestation_family, attestation_model, attestation_raw_native_mode_jcs,
      requested_authority_profile, capability_support_state)
    REFERENCES adapter_capability_authority_profile_support(
      adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest, family, model, raw_native_mode_jcs,
      authority_profile, support_state),
  FOREIGN KEY(host_identity_digest)
    REFERENCES authority_host_identities(host_identity_digest),
  FOREIGN KEY(attestation_endpoint_provider, adapter_id,
      adapter_contract_digest, host_identity_digest,
      executable_identity_digest, capability_body_digest,
      native_settings_schema_digest, attestation_family,
      attestation_model, attestation_raw_native_mode_jcs,
      requested_authority_profile, local_attestation_id,
      local_attestation_revision, local_attestation_digest,
      local_attestation_state, local_attestation_kind)
    REFERENCES authority_local_attestations(
      endpoint_provider, adapter_id, adapter_contract_digest,
      host_identity_digest, executable_identity_digest,
      capability_body_digest, native_settings_schema_digest,
      family, model, raw_native_mode_jcs,
      authority_profile, attestation_id, attestation_revision,
      attestation_digest, state, attestation_kind),
  FOREIGN KEY(action_adapter_id, action_id,
      effective_configuration_subject_kind,
      adapter_id, adapter_contract_digest, host_identity_digest,
      effective_configuration_id, effective_configuration_revision,
      effective_configuration_ref_digest,
      capability_snapshot_generation,
      provider_capability_snapshot_digest, capability_body_digest,
      native_settings_schema_digest,
      effective_route_configuration_digest, native_settings_digest,
      executable_identity_digest)
    REFERENCES adapter_effective_configurations(
      subject_action_adapter_id, subject_action_id, subject_kind,
      adapter_id, adapter_contract_digest, host_identity_digest,
      configuration_id, configuration_revision, configuration_digest,
      capability_snapshot_generation, capability_snapshot_digest,
      capability_body_digest, native_settings_schema_digest,
      effective_configuration_digest,
      permission_profile_digest, executable_identity_digest),

  CHECK(adapter_id = action_adapter_id),
  CHECK(
    (capability_support_state = 'unavailable' AND
      capability_filesystem_mode IS NULL AND
      capability_private_temp_requirement IS NULL) OR
    (capability_support_state = 'enforceable' AND
      capability_filesystem_mode IS NOT NULL AND
      capability_private_temp_requirement IS NOT NULL)
  ),
  CHECK(
    (workspace_root_binding_kind = 'project-root' AND
      workspace_root_worktree_identity_digest IS NULL) OR
    (workspace_root_binding_kind = 'owned-worktree' AND
      workspace_root_worktree_identity_digest IS NOT NULL)
  ),
  CHECK(
    (writer_lease_state = 'none' AND
      writer_lease_id IS NULL AND writer_lease_generation IS NULL AND
      worktree_task_generation IS NULL AND
      worktree_identity_digest IS NULL AND
      task_private_temp_root_identity_digest IS NULL AND
      task_private_temp_custody_id IS NULL AND
      task_private_temp_custody_revision IS NULL) OR
    (writer_lease_state = 'current' AND
      writer_lease_id IS NOT NULL AND
      writer_lease_generation IS NOT NULL)
  ),
  CHECK(
    (worktree_identity_digest IS NULL AND
      worktree_task_generation IS NULL) OR
    (worktree_identity_digest IS NOT NULL AND
      worktree_task_generation IS NOT NULL)
  ),
  CHECK(
    (status = 'admitted' AND
      local_attestation_state IS NOT NULL AND
      local_attestation_state = 'accepted' AND
      capability_support_state IS NOT NULL AND
      capability_support_state = 'enforceable' AND
      capability_filesystem_mode IS NOT NULL AND
      capability_private_temp_requirement IS NOT NULL AND
      expected_authority_profile_policy_version =
        authority_profile_policy_version AND
      effective_authority_profile IS NOT NULL AND
      effective_authority_profile = requested_authority_profile AND
      effective_authority_json IS NOT NULL AND
      effective_authority_digest IS NOT NULL AND
      native_settings_json IS NOT NULL AND
      native_settings_digest IS NOT NULL AND
      canonical_read_roots_json IS NOT NULL AND
      canonical_write_roots_json IS NOT NULL AND
      canonical_write_root_count IS NOT NULL AND
      canonical_deny_roots_json IS NOT NULL AND
      tool_egress IS NOT NULL AND tool_egress = 'none' AND
      provider_control_plane_exception_digest IS NOT NULL AND
      rejection_reason IS NULL AND
      effective_configuration_subject_kind IS NOT NULL AND
      effective_configuration_subject_kind = 'provider-action' AND
      effective_configuration_id IS NOT NULL AND
      effective_configuration_revision IS NOT NULL AND
      effective_configuration_ref_digest IS NOT NULL AND
      effective_route_configuration_digest IS NOT NULL AND
      executable_identity_digest IS NOT NULL) OR
    (status = 'rejected' AND
      effective_authority_profile IS NULL AND
      effective_authority_json IS NULL AND
      effective_authority_digest IS NULL AND
      native_settings_json IS NULL AND
      native_settings_digest IS NULL AND
      canonical_read_roots_json IS NULL AND
      canonical_write_roots_json IS NULL AND
      canonical_write_root_count IS NULL AND
      canonical_deny_roots_json IS NULL AND
      private_temp_root_identity_digest IS NULL AND
      tool_egress IS NULL AND
      provider_control_plane_exception_digest IS NULL AND
      rejection_reason IS NOT NULL AND
      effective_configuration_subject_kind IS NULL AND
      effective_configuration_id IS NULL AND
      effective_configuration_revision IS NULL AND
      effective_configuration_ref_digest IS NULL AND
      effective_route_configuration_digest IS NULL)
  ),
  CHECK(rejection_reason IS NULL OR
    rejection_reason <> 'policy-version-mismatch' OR
    expected_authority_profile_policy_version <>
      authority_profile_policy_version),
  CHECK(
    (status = 'admitted' AND rejection_reason IS NULL AND
      reject_certifying_requires_review_readonly = 0 AND
      reject_profile_disabled = 0 AND
      reject_policy_version_mismatch = 0 AND
      reject_authority_insufficient = 0 AND
      reject_task_worktree_unbound = 0 AND
      reject_risk_policy_forbidden = 0 AND
      reject_provider_capability_unavailable = 0 AND
      reject_local_attestation_unavailable = 0) OR
    (status = 'rejected' AND (
      (reject_certifying_requires_review_readonly = 1 AND
        rejection_reason = 'certifying-requires-review-readonly') OR
      (reject_certifying_requires_review_readonly = 0 AND
        reject_profile_disabled = 1 AND
        rejection_reason = 'profile-disabled') OR
      (reject_certifying_requires_review_readonly = 0 AND
        reject_profile_disabled = 0 AND
        reject_policy_version_mismatch = 1 AND
        rejection_reason = 'policy-version-mismatch') OR
      (reject_certifying_requires_review_readonly = 0 AND
        reject_profile_disabled = 0 AND
        reject_policy_version_mismatch = 0 AND
        reject_authority_insufficient = 1 AND
        rejection_reason = 'authority-insufficient') OR
      (reject_certifying_requires_review_readonly = 0 AND
        reject_profile_disabled = 0 AND
        reject_policy_version_mismatch = 0 AND
        reject_authority_insufficient = 0 AND
        reject_task_worktree_unbound = 1 AND
        rejection_reason = 'task-worktree-unbound') OR
      (reject_certifying_requires_review_readonly = 0 AND
        reject_profile_disabled = 0 AND
        reject_policy_version_mismatch = 0 AND
        reject_authority_insufficient = 0 AND
        reject_task_worktree_unbound = 0 AND
        reject_risk_policy_forbidden = 1 AND
        rejection_reason = 'risk-policy-forbidden') OR
      (reject_certifying_requires_review_readonly = 0 AND
        reject_profile_disabled = 0 AND
        reject_policy_version_mismatch = 0 AND
        reject_authority_insufficient = 0 AND
        reject_task_worktree_unbound = 0 AND
        reject_risk_policy_forbidden = 0 AND
        reject_provider_capability_unavailable = 1 AND
        rejection_reason = 'provider-capability-unavailable') OR
      (reject_certifying_requires_review_readonly = 0 AND
        reject_profile_disabled = 0 AND
        reject_policy_version_mismatch = 0 AND
        reject_authority_insufficient = 0 AND
        reject_task_worktree_unbound = 0 AND
        reject_risk_policy_forbidden = 0 AND
        reject_provider_capability_unavailable = 0 AND
        reject_local_attestation_unavailable = 1 AND
        rejection_reason = 'local-attestation-unavailable')))
  ),
  CHECK(
    (task_private_temp_root_identity_digest IS NULL AND
      task_private_temp_custody_id IS NULL AND
      task_private_temp_custody_revision IS NULL) OR
    (task_private_temp_root_identity_digest IS NOT NULL AND
      task_private_temp_custody_id IS NOT NULL AND
      task_private_temp_custody_revision IS NOT NULL AND
      worktree_identity_digest IS NOT NULL)
  ),
  CHECK(private_temp_root_identity_digest IS NULL OR
    private_temp_root_identity_digest =
      task_private_temp_root_identity_digest),
  CHECK(
    status = 'rejected' OR
    (requested_authority_profile = 'review-readonly' AND
      capability_filesystem_mode = 'readonly' AND
      capability_private_temp_requirement = 'none' AND
      task_private_temp_root_identity_digest IS NULL AND
      private_temp_root_identity_digest IS NULL) OR
    (requested_authority_profile = 'workspace-write-offline' AND
      capability_filesystem_mode = 'one-owned-worktree' AND
      ((capability_private_temp_requirement = 'none' AND
        task_private_temp_root_identity_digest IS NULL AND
        private_temp_root_identity_digest IS NULL) OR
       (capability_private_temp_requirement = 'required' AND
        task_private_temp_root_identity_digest IS NOT NULL AND
        private_temp_root_identity_digest IS NOT NULL AND
        private_temp_root_identity_digest =
          task_private_temp_root_identity_digest)))
  ),
  CHECK(
    status = 'rejected' OR
    (requested_authority_profile = 'review-readonly' AND
      canonical_write_root_count = 0 AND
      private_temp_root_identity_digest IS NULL) OR
    (requested_authority_profile = 'workspace-write-offline' AND
      writer_lease_state = 'current' AND
      worktree_task_generation IS NOT NULL AND
      worktree_identity_digest IS NOT NULL AND
      workspace_root_binding_kind = 'owned-worktree' AND
      workspace_root_worktree_identity_digest IS NOT NULL AND
      workspace_root_worktree_identity_digest = worktree_identity_digest AND
      canonical_write_root_count >= 1)
  )
)

CREATE TRIGGER provider_authority_receipt_support_details
BEFORE INSERT ON provider_authority_compilation_receipts
WHEN NOT EXISTS (
  SELECT 1
  FROM adapter_capability_authority_profile_support s
  WHERE s.adapter_id = NEW.adapter_id AND
    s.snapshot_generation = NEW.capability_snapshot_generation AND
    s.snapshot_digest = NEW.provider_capability_snapshot_digest AND
    s.capability_body_digest = NEW.capability_body_digest AND
    s.family = NEW.attestation_family AND s.model = NEW.attestation_model AND
    s.raw_native_mode_jcs = NEW.attestation_raw_native_mode_jcs AND
    s.authority_profile = NEW.requested_authority_profile AND
    s.support_state = NEW.capability_support_state AND
    NEW.capability_filesystem_mode IS s.filesystem_mode AND
    NEW.capability_private_temp_requirement IS
      s.private_temp_requirement AND
    ((s.support_state = 'enforceable' AND
      NEW.native_settings_schema_digest = s.native_settings_schema_digest) OR
     (s.support_state = 'unavailable' AND
      s.native_settings_schema_digest IS NULL AND
      NEW.native_settings_schema_digest =
        fabric_current_adapter_compiler_target_schema(
          NEW.adapter_id, NEW.adapter_contract_digest,
          NEW.host_identity_digest, NEW.executable_identity_digest))))
BEGIN SELECT RAISE(ABORT, 'authority-support-details-mismatch'); END;

CREATE TRIGGER provider_authority_receipt_task_optional_ref_null_safe
BEFORE INSERT ON provider_authority_compilation_receipts
WHEN NOT EXISTS (
  SELECT 1 FROM authority_task_ownership_inputs t
  WHERE t.action_adapter_id = NEW.action_adapter_id AND
    t.action_id = NEW.action_id AND
    t.task_ownership_digest = NEW.task_ownership_digest AND
    t.task_ownership_json = NEW.task_ownership_json AND
    NEW.writer_lease_id IS t.writer_lease_id AND
    NEW.writer_lease_generation IS t.writer_lease_generation AND
    NEW.worktree_task_generation IS t.worktree_task_generation AND
    NEW.worktree_identity_digest IS t.worktree_identity_digest AND
    NEW.workspace_root_worktree_identity_digest IS
      t.workspace_root_worktree_identity_digest AND
    NEW.task_private_temp_custody_id IS t.private_temp_custody_id AND
    NEW.task_private_temp_custody_revision IS
      t.private_temp_custody_revision AND
    NEW.task_private_temp_root_identity_digest IS
      t.private_temp_root_identity_digest AND
    (t.private_temp_adapter_contract_digest IS NULL OR
      t.private_temp_adapter_contract_digest = NEW.adapter_contract_digest) AND
    (t.private_temp_host_identity_digest IS NULL OR
      t.private_temp_host_identity_digest = NEW.host_identity_digest))
BEGIN SELECT RAISE(ABORT, 'authority-task-ownership-ref-mismatch'); END;

CREATE TRIGGER provider_authority_receipt_requires_current_envelope
BEFORE INSERT ON provider_authority_compilation_receipts
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
    h.authority_envelope_digest = NEW.authority_envelope_digest AND
    h.approval_evidence_digest = NEW.approval_evidence_digest)
BEGIN SELECT RAISE(ABORT, 'authority-envelope-not-current'); END;
```
