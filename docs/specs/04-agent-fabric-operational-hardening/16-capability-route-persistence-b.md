
The private-temp adapter/contract/host columns equality-copy the selected
custody and the preflight's authenticated route/compiler inputs. The row
byte-validates `authorityTaskOwnershipV1`, recomputes
`AD("authority-task-ownership-v1",...)` and equality-copies its task, root,
human authority ID/run/digest, lease, relative request arrays, sparse recognized
budget and optional custody members. Its digest is deterministic input identity
and may therefore recur on more than one action pair; only the pair-scoped
composite candidates are unique. The nonnullable root FK always authenticates
the selected host/digest/kind; an optional root-worktree FK and insert trigger
equality-copy the nullable child without weakening that parent. Insert triggers
require the exact current V2 authority, root pointer, task revision, active owner
lease and, for the current arm, active writer lease/generation; they join the
same authoritative task/lease rows used by ordinary task admission. Rows are
insert-only. Dispatch/resume re-runs those current joins against this parent;
optional-child FK nullability can no longer erase task ownership.

Read-only characterisation and Step-3 containment are accepted only through
registered immutable evidence and, for write-profile acceptance, its exact
council decision:

```sql
authority_containment_matrix_policies(
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  policy_version TEXT NOT NULL CHECK(policy_version = 'step3-round2-v1'),
  required_phases_json TEXT NOT NULL,
  case_registry_json TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  policy_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(policy_version),
  UNIQUE(policy_version, policy_digest),
  UNIQUE(policy_digest)
)

authority_containment_matrix_policy_current(
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  pointer_generation INTEGER NOT NULL CHECK(pointer_generation >= 1),
  policy_version TEXT NOT NULL,
  policy_digest TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(singleton, pointer_generation),
  FOREIGN KEY(policy_version, policy_digest)
    REFERENCES authority_containment_matrix_policies(
      policy_version, policy_digest)
)

authority_step3_containment_matrices(
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  matrix_id TEXT NOT NULL,
  matrix_revision INTEGER NOT NULL CHECK(matrix_revision >= 1),
  adapter_id TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  executable_identity_digest TEXT NOT NULL,
  capability_body_digest TEXT NOT NULL,
  native_settings_schema_digest TEXT NOT NULL,
  endpoint_provider TEXT NOT NULL,
  family TEXT NOT NULL,
  model TEXT NOT NULL,
  raw_native_mode_jcs TEXT NOT NULL,
  authority_profile TEXT NOT NULL CHECK(
    authority_profile = 'workspace-write-offline'),
  policy_version TEXT NOT NULL CHECK(policy_version = 'step3-round2-v1'),
  policy_digest TEXT NOT NULL,
  fixture_topology_artifact_id TEXT NOT NULL,
  fixture_topology_artifact_revision INTEGER NOT NULL
    CHECK(fixture_topology_artifact_revision >= 1),
  fixture_topology_artifact_path TEXT NOT NULL,
  fixture_topology_artifact_digest TEXT NOT NULL,
  synthetic_secret_artifact_id TEXT NOT NULL,
  synthetic_secret_artifact_revision INTEGER NOT NULL
    CHECK(synthetic_secret_artifact_revision >= 1),
  synthetic_secret_artifact_path TEXT NOT NULL,
  synthetic_secret_artifact_digest TEXT NOT NULL,
  cases_json TEXT NOT NULL,
  overall_result TEXT NOT NULL CHECK(
    overall_result IN ('pass','fail','inconclusive')),
  validated_case_count INTEGER NOT NULL CHECK(validated_case_count >= 1),
  validated_case_set_digest TEXT NOT NULL,
  validation_state TEXT NOT NULL CHECK(validation_state = 'validated'),
  validator_identity_digest TEXT NOT NULL,
  matrix_json TEXT NOT NULL,
  matrix_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(matrix_id, matrix_revision),
  UNIQUE(matrix_id, matrix_revision, matrix_digest),
  UNIQUE(matrix_digest),
  UNIQUE(adapter_id, adapter_contract_digest, host_identity_digest,
    executable_identity_digest, capability_body_digest,
    native_settings_schema_digest, endpoint_provider, family, model,
    raw_native_mode_jcs, authority_profile, policy_version, policy_digest,
    matrix_id, matrix_revision, matrix_digest, overall_result,
    validated_case_count, validated_case_set_digest, validation_state,
    validator_identity_digest),
  FOREIGN KEY(policy_version, policy_digest)
    REFERENCES authority_containment_matrix_policies(
      policy_version, policy_digest),
  FOREIGN KEY(fixture_topology_artifact_id,
      fixture_topology_artifact_revision)
    REFERENCES artifacts(artifact_id, revision),
  FOREIGN KEY(synthetic_secret_artifact_id,
      synthetic_secret_artifact_revision)
    REFERENCES artifacts(artifact_id, revision),
  FOREIGN KEY(host_identity_digest)
    REFERENCES authority_host_identities(host_identity_digest),
  CHECK(json_valid(raw_native_mode_jcs) = 1 AND
    json_type(raw_native_mode_jcs) IN ('null','text'))
)

authority_step3_containment_matrix_cases(
  matrix_id TEXT NOT NULL,
  matrix_revision INTEGER NOT NULL CHECK(matrix_revision >= 1),
  matrix_digest TEXT NOT NULL,
  case_ordinal INTEGER NOT NULL CHECK(case_ordinal >= 0),
  case_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK(phase IN ('fresh','resume')),
  oracle_json TEXT NOT NULL,
  provider_event_artifact_id TEXT NOT NULL,
  provider_event_artifact_revision INTEGER NOT NULL
    CHECK(provider_event_artifact_revision >= 1),
  provider_event_artifact_path TEXT NOT NULL,
  provider_event_artifact_digest TEXT NOT NULL,
  observation_artifact_id TEXT NOT NULL,
  observation_artifact_revision INTEGER NOT NULL
    CHECK(observation_artifact_revision >= 1),
  observation_artifact_path TEXT NOT NULL,
  observation_artifact_digest TEXT NOT NULL,
  applicability TEXT NOT NULL CHECK(
    applicability IN ('required','proved-not-applicable')),
  observed_tool_attempt INTEGER NOT NULL CHECK(observed_tool_attempt IN (0,1)),
  provider_executed INTEGER NOT NULL CHECK(provider_executed IN (0,1)),
  marker_before_digest TEXT NOT NULL,
  marker_after_digest TEXT NOT NULL,
  trap_observation_digest TEXT NOT NULL,
  secret_scan_digest TEXT NOT NULL,
  result TEXT NOT NULL CHECK(
    result IN ('pass','fail','inconclusive','not-applicable')),
  PRIMARY KEY(matrix_id, matrix_revision, case_ordinal),
  UNIQUE(matrix_id, matrix_revision, case_id, phase),
  FOREIGN KEY(matrix_id, matrix_revision, matrix_digest)
    REFERENCES authority_step3_containment_matrices(
      matrix_id, matrix_revision, matrix_digest),
  FOREIGN KEY(provider_event_artifact_id, provider_event_artifact_revision)
    REFERENCES artifacts(artifact_id, revision),
  FOREIGN KEY(observation_artifact_id, observation_artifact_revision)
    REFERENCES artifacts(artifact_id, revision)
)

authority_containment_evidence(
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  evidence_id TEXT NOT NULL,
  evidence_revision INTEGER NOT NULL CHECK(evidence_revision >= 1),
  adapter_id TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  executable_identity_digest TEXT NOT NULL,
  capability_body_digest TEXT NOT NULL,
  native_settings_schema_digest TEXT NOT NULL,
  endpoint_provider TEXT NOT NULL,
  family TEXT NOT NULL,
  model TEXT NOT NULL,
  raw_native_mode_jcs TEXT NOT NULL,
  authority_profile TEXT NOT NULL CHECK(authority_profile IN
    ('review-readonly','workspace-write-offline')),
  evidence_kind TEXT NOT NULL CHECK(evidence_kind IN
    ('readonly-characterisation-v1','step3-containment-matrix-v1')),
  validation_policy_version TEXT NOT NULL CHECK(validation_policy_version IN
    ('provider-permission-goldens-v1','step3-round2-v1')),
  containment_matrix_id TEXT,
  containment_matrix_revision INTEGER CHECK(
    containment_matrix_revision IS NULL OR containment_matrix_revision >= 1),
  containment_matrix_digest TEXT,
  containment_matrix_policy_digest TEXT,
  containment_matrix_overall_result TEXT CHECK(
    containment_matrix_overall_result IS NULL OR
    containment_matrix_overall_result IN ('pass','fail','inconclusive')),
  containment_matrix_validated_case_count INTEGER CHECK(
    containment_matrix_validated_case_count IS NULL OR
    containment_matrix_validated_case_count >= 1),
  containment_matrix_validated_case_set_digest TEXT,
  containment_matrix_validation_state TEXT CHECK(
    containment_matrix_validation_state IS NULL OR
    containment_matrix_validation_state = 'validated'),
  containment_matrix_validator_identity_digest TEXT,
  result TEXT NOT NULL CHECK(result IN ('pass','fail','unavailable')),
  artifact_id TEXT NOT NULL,
  artifact_revision INTEGER NOT NULL CHECK(artifact_revision >= 1),
  artifact_path TEXT NOT NULL,
  artifact_digest TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(evidence_id, evidence_revision),
  UNIQUE(evidence_digest),
  UNIQUE(adapter_id, adapter_contract_digest, host_identity_digest,
    executable_identity_digest, capability_body_digest,
    native_settings_schema_digest, endpoint_provider, family, model,
    raw_native_mode_jcs, authority_profile, evidence_id, evidence_revision,
    evidence_digest),
  UNIQUE(adapter_id, adapter_contract_digest, host_identity_digest,
    executable_identity_digest, capability_body_digest,
    native_settings_schema_digest, endpoint_provider, family, model,
    raw_native_mode_jcs, authority_profile, evidence_id, evidence_revision,
    evidence_digest, evidence_kind, result),
  FOREIGN KEY(adapter_id, adapter_contract_digest, host_identity_digest,
      executable_identity_digest, capability_body_digest,
      native_settings_schema_digest, endpoint_provider, family, model,
      raw_native_mode_jcs, authority_profile, validation_policy_version,
      containment_matrix_policy_digest,
      containment_matrix_id, containment_matrix_revision,
      containment_matrix_digest, containment_matrix_overall_result,
      containment_matrix_validated_case_count,
      containment_matrix_validated_case_set_digest,
      containment_matrix_validation_state,
      containment_matrix_validator_identity_digest)
    REFERENCES authority_step3_containment_matrices(
      adapter_id, adapter_contract_digest, host_identity_digest,
      executable_identity_digest, capability_body_digest,
      native_settings_schema_digest, endpoint_provider, family, model,
      raw_native_mode_jcs, authority_profile, policy_version,
      policy_digest, matrix_id, matrix_revision, matrix_digest, overall_result,
      validated_case_count, validated_case_set_digest, validation_state,
      validator_identity_digest),
  FOREIGN KEY(artifact_id, artifact_revision)
    REFERENCES artifacts(artifact_id, revision),
  FOREIGN KEY(host_identity_digest)
    REFERENCES authority_host_identities(host_identity_digest),
  CHECK(json_valid(raw_native_mode_jcs) = 1 AND
    json_type(raw_native_mode_jcs) IN ('null','text')),
  CHECK(
    (authority_profile = 'review-readonly' AND
      evidence_kind = 'readonly-characterisation-v1' AND
      validation_policy_version = 'provider-permission-goldens-v1' AND
      containment_matrix_id IS NULL AND
      containment_matrix_revision IS NULL AND
      containment_matrix_digest IS NULL AND
      containment_matrix_policy_digest IS NULL AND
      containment_matrix_overall_result IS NULL AND
      containment_matrix_validated_case_count IS NULL AND
      containment_matrix_validated_case_set_digest IS NULL AND
      containment_matrix_validation_state IS NULL AND
      containment_matrix_validator_identity_digest IS NULL) OR
    (authority_profile = 'workspace-write-offline' AND
      evidence_kind = 'step3-containment-matrix-v1' AND
      validation_policy_version = 'step3-round2-v1' AND
      containment_matrix_id IS NOT NULL AND
      containment_matrix_revision IS NOT NULL AND
      containment_matrix_digest IS NOT NULL AND
      containment_matrix_policy_digest IS NOT NULL AND
      containment_matrix_overall_result IS NOT NULL AND
      containment_matrix_validated_case_count IS NOT NULL AND
      containment_matrix_validated_case_set_digest IS NOT NULL AND
      containment_matrix_validation_state = 'validated' AND
      containment_matrix_validator_identity_digest IS NOT NULL AND
      ((containment_matrix_overall_result = 'pass' AND result = 'pass') OR
       (containment_matrix_overall_result = 'fail' AND result = 'fail') OR
       (containment_matrix_overall_result = 'inconclusive' AND
         result = 'unavailable')))
  )
)

authority_containment_decisions(
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  decision_id TEXT NOT NULL,
  decision_revision INTEGER NOT NULL CHECK(decision_revision >= 1),
  adapter_id TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  executable_identity_digest TEXT NOT NULL,
  capability_body_digest TEXT NOT NULL,
  native_settings_schema_digest TEXT NOT NULL,
  endpoint_provider TEXT NOT NULL,
  family TEXT NOT NULL,
  model TEXT NOT NULL,
  raw_native_mode_jcs TEXT NOT NULL,
  authority_profile TEXT NOT NULL,
  containment_evidence_id TEXT NOT NULL,
  containment_evidence_revision INTEGER NOT NULL
    CHECK(containment_evidence_revision >= 1),
  containment_evidence_digest TEXT NOT NULL,
  containment_evidence_kind TEXT NOT NULL CHECK(
    containment_evidence_kind = 'step3-containment-matrix-v1'),
  containment_evidence_result TEXT NOT NULL CHECK(
    containment_evidence_result IN ('pass','fail','unavailable')),
  decision_authority_kind TEXT NOT NULL CHECK(
    decision_authority_kind = 'council'),
  decided_by_json TEXT NOT NULL,
  council_record_artifact_id TEXT NOT NULL,
  council_record_artifact_revision INTEGER NOT NULL
    CHECK(council_record_artifact_revision >= 1),
  council_record_artifact_path TEXT NOT NULL,
  council_record_artifact_digest TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK(disposition IN ('accepted','rejected')),
  decided_at TEXT NOT NULL,
  decision_json TEXT NOT NULL,
  decision_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(decision_id, decision_revision),
  UNIQUE(decision_digest),
  UNIQUE(adapter_id, adapter_contract_digest, host_identity_digest,
    executable_identity_digest, capability_body_digest,
    native_settings_schema_digest, endpoint_provider, family, model,
    raw_native_mode_jcs, authority_profile,
    containment_evidence_digest, decision_id, decision_revision,
    decision_digest, disposition),
  FOREIGN KEY(adapter_id, adapter_contract_digest, host_identity_digest,
      executable_identity_digest, capability_body_digest,
      native_settings_schema_digest, endpoint_provider, family, model,
      raw_native_mode_jcs, authority_profile,
      containment_evidence_id, containment_evidence_revision,
      containment_evidence_digest, containment_evidence_kind,
      containment_evidence_result)
    REFERENCES authority_containment_evidence(
      adapter_id, adapter_contract_digest, host_identity_digest,
      executable_identity_digest, capability_body_digest,
      native_settings_schema_digest, endpoint_provider, family, model,
      raw_native_mode_jcs, authority_profile, evidence_id, evidence_revision,
      evidence_digest, evidence_kind, result),
  FOREIGN KEY(council_record_artifact_id,
      council_record_artifact_revision)
    REFERENCES artifacts(artifact_id, revision),
  CHECK(authority_profile = 'workspace-write-offline'),
  CHECK(disposition = 'rejected' OR containment_evidence_result = 'pass')
)

CREATE TRIGGER authority_step3_matrix_validate_before_insert
BEFORE INSERT ON authority_step3_containment_matrices
WHEN fabric_validate_step3_matrix_v1(
  NEW.matrix_json, NEW.cases_json, NEW.policy_version, NEW.policy_digest,
  NEW.overall_result, NEW.validated_case_count,
  NEW.validated_case_set_digest, NEW.validator_identity_digest) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'step3-matrix-invalid'); END;

CREATE TRIGGER authority_step3_matrix_requires_current_policy
BEFORE INSERT ON authority_step3_containment_matrices
WHEN NOT EXISTS (
  SELECT 1 FROM authority_containment_matrix_policy_current p
  WHERE p.singleton = 1 AND p.policy_version = NEW.policy_version AND
    p.policy_digest = NEW.policy_digest)
BEGIN SELECT RAISE(ABORT, 'step3-matrix-policy-not-current'); END;

CREATE TRIGGER authority_step3_case_must_match_embedded_case
BEFORE INSERT ON authority_step3_containment_matrix_cases
WHEN fabric_step3_case_matches_embedded_v1(
  NEW.matrix_id, NEW.matrix_revision, NEW.matrix_digest,
  NEW.case_ordinal, NEW.case_id, NEW.phase, NEW.oracle_json,
  NEW.provider_event_artifact_id, NEW.provider_event_artifact_revision,
  NEW.provider_event_artifact_path, NEW.provider_event_artifact_digest,
  NEW.observation_artifact_id, NEW.observation_artifact_revision,
  NEW.observation_artifact_path, NEW.observation_artifact_digest,
  NEW.applicability, NEW.observed_tool_attempt, NEW.provider_executed,
  NEW.marker_before_digest, NEW.marker_after_digest,
  NEW.trap_observation_digest, NEW.secret_scan_digest,
  NEW.result) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'step3-case-index-mismatch'); END;

CREATE TRIGGER authority_step3_evidence_requires_complete_case_index
BEFORE INSERT ON authority_containment_evidence
WHEN NEW.evidence_kind = 'step3-containment-matrix-v1' AND (
  (SELECT count(*) FROM authority_step3_containment_matrix_cases c
    WHERE c.matrix_id = NEW.containment_matrix_id AND
      c.matrix_revision = NEW.containment_matrix_revision AND
      c.matrix_digest = NEW.containment_matrix_digest) <>
        NEW.containment_matrix_validated_case_count OR
  fabric_step3_case_index_digest(
    NEW.containment_matrix_id, NEW.containment_matrix_revision) IS NULL OR
  fabric_step3_case_index_digest(
    NEW.containment_matrix_id, NEW.containment_matrix_revision) <>
      NEW.containment_matrix_validated_case_set_digest)
BEGIN SELECT RAISE(ABORT, 'step3-matrix-case-index-incomplete'); END;

CREATE TRIGGER authority_step3_case_no_update
BEFORE UPDATE ON authority_step3_containment_matrix_cases
BEGIN SELECT RAISE(ABORT, 'step3-case-immutable'); END;

CREATE TRIGGER authority_step3_case_no_delete
BEFORE DELETE ON authority_step3_containment_matrix_cases
BEGIN SELECT RAISE(ABORT, 'step3-case-immutable'); END;

CREATE TRIGGER authority_containment_matrix_policy_no_update
BEFORE UPDATE ON authority_containment_matrix_policies
BEGIN SELECT RAISE(ABORT, 'containment-matrix-policy-immutable'); END;

CREATE TRIGGER authority_containment_matrix_policy_no_delete
BEFORE DELETE ON authority_containment_matrix_policies
BEGIN SELECT RAISE(ABORT, 'containment-matrix-policy-immutable'); END;

CREATE TRIGGER authority_step3_matrix_no_update
BEFORE UPDATE ON authority_step3_containment_matrices
BEGIN SELECT RAISE(ABORT, 'step3-matrix-immutable'); END;

CREATE TRIGGER authority_step3_matrix_no_delete
BEFORE DELETE ON authority_step3_containment_matrices
BEGIN SELECT RAISE(ABORT, 'step3-matrix-immutable'); END;
```

Policy insert byte-validates the protocol-owned
`authorityContainmentMatrixPolicyV1`, including literal
`step3-round2-v1`, `[fresh,resume]` and the exact ordered Spec 01 case/oracle
registry, then recomputes
`AD("authority-containment-matrix-policy-v1",...)`. Only the daemon release
bundle can install it. The singleton pointer uses expected-generation CAS;
matrix import requires that exact policy version/digest still current.
Policy and matrix bodies are insert-only under the displayed update/delete
guards; only the singleton current pointer may change through its CAS.

The trusted importer byte-validates `step3ContainmentMatrixV1`, recomputes
`AD("authority-step3-containment-matrix-v1",...)`, equality-checks the exact
registered fixture, synthetic-secret, provider-event and independent-
observation path/revision/digest refs, and expands the policy registry for the
subject provider. Normalised case rows must be ordinal-contiguous and contain
exactly one `fresh` and one `resume` row per applicable case ID. Duplicate,
missing, crossed-policy/subject, wrong-oracle or unsupported waiver rows abort.
An interrupted or unexecuted applicable case is retained as its one explicit
registered row and the validator derives `inconclusive`; it is never represented
by omission.
Only private-temp when capability declares `none`, host-proved hard-link
absence and provider-proved Claude multi-edit/notebook absence may use
`proved-not-applicable`; every other waiver is invalid. The importer derives
row results from the closed oracles and derives overall `fail`, then
`inconclusive`, then `pass` in that precedence. A refusal without the required
observed tool attempt is inconclusive, never pass. Matrix/case rows are
insert-only. The trusted deterministic SQL function recomputes overall result,
case count, canonical case-set digest and release-pinned validator identity
from the full embedded matrix plus registered refs before it permits the final
parent insert; it never trusts the displayed values. Each derived case-index
row must equality-copy its embedded ordinal. Evidence insert then requires the
exact child count and recomputed set digest, so a final parent with zero,
missing, duplicate or altered normalised cases cannot be consumed even within
the import transaction. No caller/model/adapter field may set a policy, oracle,
validated marker or result.

Evidence insert byte-validates `authorityContainmentEvidenceV1`, recomputes
`AD("authority-containment-evidence-v1",...)` and equality-checks the exact
registered artifact path/revision/digest and complete subject. A Step-3 row
must foreign-key the validated matrix and mechanically maps matrix
`pass|fail|inconclusive` to evidence `pass|fail|unavailable`; the read-only arm
instead derives its result from the fixed provider-permission goldens and has
no matrix ref. Decision insert byte-validates `authorityContainmentDecisionV1`, recomputes
`AD("authority-containment-decision-v1",...)`, equality-copies that same
subject/evidence and accepts only daemon/council import. `decided_by_json` is a
nonnull sorted unique authenticated voter-identity array; the exact registered
council-record path/revision/digest foreign row must prove those voters, current
charter, quorum and disposition. An accepted decision requires passing evidence;
fail/unavailable evidence can parent only rejection. Rows are insert-only;
neither a passing artifact nor an accepted decision is inferred from a digest.

The fifth compiler input is an immutable local-attestation row selected through
one exact tuple current pointer. `raw_native_mode_jcs` is the RFC 8785 JCS scalar
`null` or one JSON string; it is nonnull relational identity and therefore does
not collapse a null native mode into a sentinel. The daemon validates and
persists the closed Spec 01 object as follows:

```sql
authority_local_attestation_subjects(
  endpoint_provider TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  executable_identity_digest TEXT NOT NULL,
  capability_body_digest TEXT NOT NULL,
  native_settings_schema_digest TEXT NOT NULL,
  family TEXT NOT NULL,
  model TEXT NOT NULL,
  raw_native_mode_jcs TEXT NOT NULL,
  authority_profile TEXT NOT NULL CHECK(authority_profile IN
    ('review-readonly','workspace-write-offline')),
  attestation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(endpoint_provider, adapter_id, adapter_contract_digest,
    host_identity_digest, executable_identity_digest,
    capability_body_digest, native_settings_schema_digest,
    family, model, raw_native_mode_jcs,
    authority_profile),
  UNIQUE(attestation_id),
  UNIQUE(endpoint_provider, adapter_id, adapter_contract_digest,
    host_identity_digest, executable_identity_digest,
    capability_body_digest, native_settings_schema_digest,
    family, model, raw_native_mode_jcs,
    authority_profile, attestation_id),
  FOREIGN KEY(host_identity_digest)
    REFERENCES authority_host_identities(host_identity_digest),
  CHECK(json_valid(raw_native_mode_jcs) = 1 AND
    json_type(raw_native_mode_jcs) IN ('null','text'))
)

authority_local_attestations(
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  attestation_id TEXT NOT NULL,
  attestation_revision INTEGER NOT NULL CHECK(attestation_revision >= 1),
  endpoint_provider TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  executable_identity_digest TEXT NOT NULL,
  capability_body_digest TEXT NOT NULL,
  native_settings_schema_digest TEXT NOT NULL,
  family TEXT NOT NULL,
  model TEXT NOT NULL,
  raw_native_mode_jcs TEXT NOT NULL,
  authority_profile TEXT NOT NULL CHECK(authority_profile IN
    ('review-readonly','workspace-write-offline')),
  attestation_kind TEXT NOT NULL CHECK(attestation_kind IN
    ('readonly-characterisation','step3-containment')),
  state TEXT NOT NULL CHECK(state IN ('accepted','unavailable')),
  unavailable_kind TEXT CHECK(unavailable_kind IS NULL OR
    unavailable_kind IN ('not-run','evaluated')),
  evidence_id TEXT,
  evidence_revision INTEGER CHECK(
    evidence_revision IS NULL OR evidence_revision >= 1),
  evidence_digest TEXT,
  evidence_kind TEXT CHECK(evidence_kind IS NULL OR evidence_kind IN
    ('readonly-characterisation-v1','step3-containment-matrix-v1')),
  evidence_result TEXT CHECK(evidence_result IS NULL OR
    evidence_result IN ('pass','fail','unavailable')),
  council_decision_id TEXT,
  council_decision_revision INTEGER CHECK(
    council_decision_revision IS NULL OR council_decision_revision >= 1),
  council_decision_digest TEXT,
  council_decision_disposition TEXT CHECK(
    council_decision_disposition IS NULL OR
    council_decision_disposition IN ('accepted','rejected')),
  safe_reason TEXT CHECK(safe_reason IS NULL OR safe_reason IN
    ('profile-disabled','provider-capability-unavailable',
      'local-attestation-unavailable')),
  observed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attestation_json TEXT NOT NULL,
  attestation_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(attestation_id, attestation_revision),
  UNIQUE(attestation_digest),
  UNIQUE(endpoint_provider, adapter_id, adapter_contract_digest,
    host_identity_digest, executable_identity_digest,
    capability_body_digest, native_settings_schema_digest,
    family, model, raw_native_mode_jcs,
    authority_profile, attestation_id, attestation_revision,
    attestation_digest),
  UNIQUE(endpoint_provider, adapter_id, adapter_contract_digest,
    host_identity_digest, executable_identity_digest,
    capability_body_digest, native_settings_schema_digest,
    family, model, raw_native_mode_jcs,
    authority_profile, attestation_id, attestation_revision,
    attestation_digest, state, attestation_kind),
  FOREIGN KEY(endpoint_provider, adapter_id, adapter_contract_digest,
      host_identity_digest, executable_identity_digest,
      capability_body_digest, native_settings_schema_digest,
      family, model, raw_native_mode_jcs,
      authority_profile, attestation_id)
    REFERENCES authority_local_attestation_subjects(
      endpoint_provider, adapter_id, adapter_contract_digest,
      host_identity_digest, executable_identity_digest,
      capability_body_digest, native_settings_schema_digest,
      family, model, raw_native_mode_jcs,
      authority_profile, attestation_id),
  FOREIGN KEY(adapter_id, adapter_contract_digest, host_identity_digest,
      executable_identity_digest, capability_body_digest,
      native_settings_schema_digest, endpoint_provider, family, model,
      raw_native_mode_jcs, authority_profile,
      evidence_id, evidence_revision, evidence_digest,
      evidence_kind, evidence_result)
    REFERENCES authority_containment_evidence(
      adapter_id, adapter_contract_digest, host_identity_digest,
      executable_identity_digest, capability_body_digest,
      native_settings_schema_digest, endpoint_provider, family, model,
      raw_native_mode_jcs, authority_profile,
      evidence_id, evidence_revision, evidence_digest,
      evidence_kind, result),
  FOREIGN KEY(adapter_id, adapter_contract_digest, host_identity_digest,
      executable_identity_digest, capability_body_digest,
      native_settings_schema_digest, endpoint_provider, family, model,
      raw_native_mode_jcs, authority_profile, evidence_digest,
      council_decision_id, council_decision_revision,
      council_decision_digest, council_decision_disposition)
    REFERENCES authority_containment_decisions(
      adapter_id, adapter_contract_digest, host_identity_digest,
      executable_identity_digest, capability_body_digest,
      native_settings_schema_digest, endpoint_provider, family, model,
      raw_native_mode_jcs, authority_profile, containment_evidence_digest,
      decision_id, decision_revision, decision_digest, disposition),
  CHECK(json_valid(raw_native_mode_jcs) = 1 AND
    json_type(raw_native_mode_jcs) IN ('null','text')),
  CHECK(expires_at > observed_at),
  CHECK(
    (authority_profile = 'review-readonly' AND
      attestation_kind = 'readonly-characterisation') OR
    (authority_profile = 'workspace-write-offline' AND
      attestation_kind = 'step3-containment')
  ),
  CHECK(
    (state = 'accepted' AND unavailable_kind IS NULL AND
      safe_reason IS NULL AND evidence_id IS NOT NULL AND
      evidence_revision IS NOT NULL AND evidence_digest IS NOT NULL AND
      evidence_kind IS NOT NULL AND evidence_result IS NOT NULL AND
      ((authority_profile = 'review-readonly' AND
          evidence_kind = 'readonly-characterisation-v1' AND
          evidence_result = 'pass' AND
          council_decision_id IS NULL AND
          council_decision_revision IS NULL AND
          council_decision_digest IS NULL AND
          council_decision_disposition IS NULL) OR
       (authority_profile = 'workspace-write-offline' AND
          evidence_kind = 'step3-containment-matrix-v1' AND
          evidence_result = 'pass' AND
          council_decision_id IS NOT NULL AND
          council_decision_revision IS NOT NULL AND
          council_decision_digest IS NOT NULL AND
          council_decision_disposition IS NOT NULL AND
          council_decision_disposition = 'accepted'))) OR
    (state = 'unavailable' AND unavailable_kind = 'not-run' AND
      safe_reason IS NOT NULL AND evidence_id IS NULL AND
      evidence_revision IS NULL AND evidence_digest IS NULL AND
      evidence_kind IS NULL AND evidence_result IS NULL AND
      council_decision_id IS NULL AND
      council_decision_revision IS NULL AND
      council_decision_digest IS NULL AND
      council_decision_disposition IS NULL) OR
    (state = 'unavailable' AND unavailable_kind = 'evaluated' AND
      safe_reason IS NOT NULL AND evidence_id IS NOT NULL AND
      evidence_revision IS NOT NULL AND evidence_digest IS NOT NULL AND
      evidence_kind IS NOT NULL AND evidence_result IS NOT NULL AND
      council_decision_id IS NULL AND
      council_decision_revision IS NULL AND
      council_decision_digest IS NULL AND
      council_decision_disposition IS NULL AND
      evidence_result IN ('pass','fail','unavailable'))
  )
)

authority_local_attestation_current(
  endpoint_provider TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  executable_identity_digest TEXT NOT NULL,
  capability_body_digest TEXT NOT NULL,
  native_settings_schema_digest TEXT NOT NULL,
  family TEXT NOT NULL,
  model TEXT NOT NULL,
  raw_native_mode_jcs TEXT NOT NULL,
  authority_profile TEXT NOT NULL,
  pointer_generation INTEGER NOT NULL CHECK(pointer_generation >= 1),
  attestation_id TEXT NOT NULL,
  attestation_revision INTEGER NOT NULL CHECK(attestation_revision >= 1),
  attestation_digest TEXT NOT NULL,
  attestation_state TEXT NOT NULL,
  attestation_kind TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(endpoint_provider, adapter_id, adapter_contract_digest,
    host_identity_digest, executable_identity_digest,
    capability_body_digest, native_settings_schema_digest,
    family, model, raw_native_mode_jcs,
    authority_profile),
  UNIQUE(endpoint_provider, adapter_id, adapter_contract_digest,
    host_identity_digest, executable_identity_digest,
    capability_body_digest, native_settings_schema_digest,
    family, model, raw_native_mode_jcs,
    authority_profile, pointer_generation),
  FOREIGN KEY(endpoint_provider, adapter_id, adapter_contract_digest,
      host_identity_digest, executable_identity_digest,
      capability_body_digest, native_settings_schema_digest,
      family, model, raw_native_mode_jcs,
      authority_profile, attestation_id, attestation_revision,
      attestation_digest, attestation_state, attestation_kind)
    REFERENCES authority_local_attestations(
      endpoint_provider, adapter_id, adapter_contract_digest,
      host_identity_digest, executable_identity_digest,
      capability_body_digest, native_settings_schema_digest,
      family, model, raw_native_mode_jcs,
      authority_profile, attestation_id, attestation_revision,
      attestation_digest, state, attestation_kind)
)

CREATE TRIGGER authority_write_attestation_requires_current_matrix_policy
BEFORE INSERT ON authority_local_attestations
WHEN NEW.authority_profile = 'workspace-write-offline' AND
  NEW.unavailable_kind IS NOT 'not-run' AND NOT EXISTS (
    SELECT 1
    FROM authority_containment_evidence e
    JOIN authority_containment_matrix_policy_current p
      ON p.singleton = 1 AND
        p.policy_version = e.validation_policy_version AND
        p.policy_digest = e.containment_matrix_policy_digest
    WHERE e.evidence_id = NEW.evidence_id AND
      e.evidence_revision = NEW.evidence_revision AND
      e.evidence_digest = NEW.evidence_digest)
BEGIN SELECT RAISE(ABORT, 'containment-matrix-policy-not-current'); END;

CREATE TRIGGER authority_attestation_requires_authenticated_schema_source
BEFORE INSERT ON authority_local_attestations
WHEN fabric_attestation_schema_source_valid_v1(
  NEW.adapter_id, NEW.adapter_contract_digest, NEW.host_identity_digest,
  NEW.executable_identity_digest, NEW.capability_body_digest,
  NEW.family, NEW.model,
  NEW.raw_native_mode_jcs, NEW.authority_profile, NEW.state,
  NEW.unavailable_kind, NEW.native_settings_schema_digest) IS NOT 1
BEGIN SELECT RAISE(ABORT, 'native-settings-schema-source-invalid'); END;

CREATE TRIGGER authority_unavailable_attestation_safe_reason_derived
BEFORE INSERT ON authority_local_attestations
WHEN NEW.state = 'unavailable' AND NEW.safe_reason IS NOT
  fabric_expected_unavailable_attestation_safe_reason_v1(
    NEW.adapter_id, NEW.adapter_contract_digest, NEW.host_identity_digest,
    NEW.executable_identity_digest, NEW.capability_body_digest,
    NEW.native_settings_schema_digest, NEW.family, NEW.model,
    NEW.raw_native_mode_jcs, NEW.authority_profile, NEW.unavailable_kind,
    NEW.evidence_id, NEW.evidence_revision, NEW.evidence_digest)
BEGIN SELECT RAISE(ABORT, 'attestation-safe-reason-mismatch'); END;
```
