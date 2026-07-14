
The existing `provider_action_routes` row gains non-null
`capability_snapshot_generation`, `capability_snapshot_digest`,
`capability_body_digest`,
`effective_configuration_id`, `effective_configuration_revision`,
`effective_configuration_ref_digest`,
`requested_configuration_digest`, `effective_route_configuration_digest`,
`authority_compilation_status`, `authority_compilation_receipt_digest`,
`coordination_run_id`, `authority_id`, `authority_envelope_digest`,
`approval_evidence_digest`, `task_ownership_digest`,
`workspace_root_identity_digest`, nullable `worktree_identity_digest`, nullable
`private_temp_root_identity_digest`, `risk_policy_digest`,
`authority_provider_capability_snapshot_digest`, `adapter_contract_digest`,
`host_identity_digest`,
`requested_authority_profile_digest`, `requested_authority_profile`,
`effective_authority_profile`, `effective_authority_digest`,
`native_settings_digest`, `provider_control_plane_exception_digest`,
`local_attestation_digest`, `executable_identity_digest`,
`native_settings_schema_digest`,
`authority_compiler_version`,
`expected_authority_profile_policy_version`,
`authority_profile_policy_version`,
`deployed_route_admission_json`, `deployed_route_admission_digest`,
`route_policy_revision`, `harness_revision`, `harness_digest`,
`context_policy_revision`, `context_policy_digest`,
`permission_profile_digest`,
`discovery_surface_evidence_id`, `discovery_surface_evidence_revision` and
`discovery_surface_digest` for every new
answer-bearing action. Foreign keys bind the exact adapter/generation/digest.
