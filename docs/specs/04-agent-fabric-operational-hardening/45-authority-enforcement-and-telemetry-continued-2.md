
```sql
provider_action_routes(
  ...existing columns...,
  authority_compilation_status TEXT NOT NULL
    CHECK(authority_compilation_status = 'admitted'),
  authority_compilation_receipt_digest TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  authority_envelope_digest TEXT NOT NULL,
  approval_evidence_digest TEXT NOT NULL,
  task_ownership_digest TEXT NOT NULL,
  workspace_root_identity_digest TEXT NOT NULL,
  worktree_identity_digest TEXT,
  private_temp_root_identity_digest TEXT,
  risk_policy_digest TEXT NOT NULL,
  authority_provider_capability_snapshot_digest TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  requested_authority_profile_digest TEXT NOT NULL,
  requested_authority_profile TEXT NOT NULL CHECK(
    requested_authority_profile IN
      ('review-readonly','workspace-write-offline')),
  effective_authority_profile TEXT NOT NULL CHECK(
    effective_authority_profile IN
      ('review-readonly','workspace-write-offline')),
  effective_authority_digest TEXT NOT NULL,
  native_settings_digest TEXT NOT NULL,
  provider_control_plane_exception_digest TEXT NOT NULL,
  local_attestation_digest TEXT NOT NULL,
  executable_identity_digest TEXT NOT NULL,
  native_settings_schema_digest TEXT NOT NULL,
  authority_compiler_version TEXT NOT NULL,
  expected_authority_profile_policy_version TEXT NOT NULL,
  authority_profile_policy_version TEXT NOT NULL,
  capability_snapshot_generation, capability_snapshot_digest,
  capability_body_digest,
  effective_configuration_id, effective_configuration_revision,
  effective_configuration_ref_digest,
  requested_configuration_digest, effective_route_configuration_digest,
  discovery_surface_evidence_id, discovery_surface_evidence_revision,
  discovery_surface_digest,
  ...new admission columns...,
  UNIQUE(adapter_id, action_id, deployed_route_admission_digest),
  UNIQUE(adapter_id, action_id, route_receipt_digest,
    deployed_route_admission_digest),
  UNIQUE(adapter_id, action_id, deployed_route_admission_digest,
    capability_body_digest, effective_configuration_id,
    effective_configuration_revision, effective_configuration_ref_digest,
    permission_profile_digest, discovery_surface_evidence_id,
    discovery_surface_evidence_revision, discovery_surface_digest),
  UNIQUE(adapter_id, action_id, authority_compilation_status,
    authority_compilation_receipt_digest,
    requested_authority_profile_digest, requested_authority_profile,
    effective_authority_profile, effective_authority_digest,
    native_settings_digest, provider_control_plane_exception_digest,
    local_attestation_digest, capability_body_digest,
    executable_identity_digest, native_settings_schema_digest,
    authority_compiler_version,
    expected_authority_profile_policy_version,
    authority_profile_policy_version),
  UNIQUE(adapter_id, action_id, authority_compilation_status,
    authority_compilation_receipt_digest,
    coordination_run_id, authority_id, authority_envelope_digest,
    approval_evidence_digest, task_ownership_digest,
    workspace_root_identity_digest, risk_policy_digest,
    authority_provider_capability_snapshot_digest,
    requested_authority_profile_digest, requested_authority_profile,
    effective_authority_profile, effective_authority_digest,
    native_settings_digest, provider_control_plane_exception_digest,
    local_attestation_digest, capability_body_digest,
    adapter_contract_digest, host_identity_digest,
    executable_identity_digest, native_settings_schema_digest,
    authority_compiler_version,
    expected_authority_profile_policy_version,
    authority_profile_policy_version),
  FOREIGN KEY(adapter_id, action_id,
      authority_compilation_receipt_digest)
    REFERENCES provider_actions(
      adapter_id, action_id, authority_compilation_receipt_digest),
  FOREIGN KEY(adapter_id, action_id, authority_compilation_status,
      authority_compilation_receipt_digest,
      coordination_run_id, authority_id, authority_envelope_digest,
      approval_evidence_digest, task_ownership_digest,
      workspace_root_identity_digest, risk_policy_digest,
      authority_provider_capability_snapshot_digest,
      requested_authority_profile_digest, requested_authority_profile,
      effective_authority_profile, effective_authority_digest,
      native_settings_digest, provider_control_plane_exception_digest,
      local_attestation_digest, capability_body_digest,
      adapter_contract_digest, host_identity_digest,
      executable_identity_digest, native_settings_schema_digest,
      authority_compiler_version,
      expected_authority_profile_policy_version,
      authority_profile_policy_version)
    REFERENCES provider_authority_compilation_receipts(
      action_adapter_id, action_id, status, receipt_digest,
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
  FOREIGN KEY(adapter_id, capability_snapshot_generation,
    capability_snapshot_digest, capability_body_digest)
    REFERENCES adapter_capability_snapshots(
      adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest),
  FOREIGN KEY(effective_configuration_id, effective_configuration_revision,
      effective_configuration_ref_digest)
    REFERENCES adapter_effective_configurations(
      configuration_id, configuration_revision, configuration_digest),
  FOREIGN KEY(discovery_surface_evidence_id,
      discovery_surface_evidence_revision, discovery_surface_digest)
    REFERENCES discovery_surface_manifests(
      evidence_id, evidence_revision, manifest_digest),
  CHECK(effective_authority_profile = requested_authority_profile),
  CHECK(authority_provider_capability_snapshot_digest =
    capability_snapshot_digest),
  CHECK(expected_authority_profile_policy_version =
    authority_profile_policy_version),
  CHECK(permission_profile_digest = native_settings_digest)
)

CREATE TRIGGER provider_action_route_receipt_ref_null_safe
BEFORE INSERT ON provider_action_routes
WHEN NOT EXISTS (
  SELECT 1 FROM provider_authority_compilation_receipts r
  WHERE r.action_adapter_id = NEW.adapter_id AND
    r.action_id = NEW.action_id AND r.status = 'admitted' AND
    r.receipt_digest = NEW.authority_compilation_receipt_digest AND
    NEW.worktree_identity_digest IS r.worktree_identity_digest AND
    NEW.private_temp_root_identity_digest IS
      r.private_temp_root_identity_digest)
BEGIN SELECT RAISE(ABORT, 'authority-receipt-ref-mismatch'); END;
```

The explicit composite foreign key means a digest cannot cross another
adapter/generation. Historical routes reference immutable snapshots, never the
mutable current pointer.
The route-admission action pair equals the row primary key; its admitted
adapter, contract and snapshot instance/body equal the foreign row. Its
discovery-surface ref foreign-keys `discovery_surface_manifests` and the exact
existing `EvidenceArtifactRegistration` revision/artifact digest. Host/version/
profile/raw-mode, permission and manifest digest must equality-bind route,
snapshot, launch and registration; evidence kind is `discovery-surface.v1`,
`publisherKind=fabric` and `producer=fabric-daemon`.
The effective-configuration foreign row must have `subject_kind='provider-action'`
and its exact subject ref must equal the route action pair; adapter/contract,
snapshot body, permission and surface fields reproduce admission.
The closed `authorityCompilationReceiptRef` normalises into the displayed
columns, byte-equals the receipt row for this action pair and is included in
`deployed_route_admission_digest`. Requested/effective profiles are equal,
native settings equal the effective permission profile, and the route's
provider/family/model/raw-native-mode tuple equals the immutable local-
attestation tuple selected by that receipt. Requested and admitted arms are
immutable. The nonnullable composite FK covers the full safe provenance core:
run, authority/approval, task/root, risk, capability snapshot/body,
adapter/contract/host, attestation, effective/settings/control-plane/compiler
and policy. The separate trigger compares nullable worktree and private-temp
members with SQLite `IS`, so a null arm cannot disable or launder the parent.

Every provider-I/O attempt appends its actual point-of-use snapshot:

```sql
provider_action_route_dispatches(
  adapter_id, action_id, dispatch_ordinal, admission_digest,
  authority_compilation_status TEXT NOT NULL
    CHECK(authority_compilation_status = 'admitted'),
  authority_compilation_receipt_digest TEXT NOT NULL,
  coordination_run_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  authority_envelope_digest TEXT NOT NULL,
  approval_evidence_digest TEXT NOT NULL,
  task_ownership_digest TEXT NOT NULL,
  workspace_root_identity_digest TEXT NOT NULL,
  worktree_identity_digest TEXT,
  private_temp_root_identity_digest TEXT,
  risk_policy_digest TEXT NOT NULL,
  authority_provider_capability_snapshot_digest TEXT NOT NULL,
  adapter_contract_digest TEXT NOT NULL,
  host_identity_digest TEXT NOT NULL,
  requested_authority_profile_digest TEXT NOT NULL,
  requested_authority_profile TEXT NOT NULL,
  effective_authority_profile TEXT NOT NULL,
  effective_authority_digest TEXT NOT NULL,
  native_settings_digest TEXT NOT NULL,
  provider_control_plane_exception_digest TEXT NOT NULL,
  local_attestation_digest TEXT NOT NULL,
  executable_identity_digest TEXT NOT NULL,
  native_settings_schema_digest TEXT NOT NULL,
  authority_compiler_version TEXT NOT NULL,
  expected_authority_profile_policy_version TEXT NOT NULL,
  authority_profile_policy_version TEXT NOT NULL,
  capability_snapshot_generation, capability_snapshot_digest,
  capability_body_digest,
  effective_configuration_id, effective_configuration_revision,
  effective_configuration_ref_digest, permission_profile_digest,
  discovery_surface_evidence_id, discovery_surface_evidence_revision,
  discovery_surface_digest,
  dispatched_at, dispatch_json, dispatch_digest,
  PRIMARY KEY(adapter_id, action_id, dispatch_ordinal),
  UNIQUE(dispatch_digest),
  FOREIGN KEY(adapter_id, action_id, admission_digest,
      capability_body_digest, effective_configuration_id,
      effective_configuration_revision, effective_configuration_ref_digest,
      permission_profile_digest, discovery_surface_evidence_id,
      discovery_surface_evidence_revision, discovery_surface_digest)
    REFERENCES provider_action_routes(
      adapter_id, action_id, deployed_route_admission_digest,
      capability_body_digest, effective_configuration_id,
      effective_configuration_revision, effective_configuration_ref_digest,
      permission_profile_digest, discovery_surface_evidence_id,
      discovery_surface_evidence_revision, discovery_surface_digest),
  FOREIGN KEY(adapter_id, action_id, authority_compilation_status,
      authority_compilation_receipt_digest,
      coordination_run_id, authority_id, authority_envelope_digest,
      approval_evidence_digest, task_ownership_digest,
      workspace_root_identity_digest, risk_policy_digest,
      authority_provider_capability_snapshot_digest,
      requested_authority_profile_digest, requested_authority_profile,
      effective_authority_profile, effective_authority_digest,
      native_settings_digest, provider_control_plane_exception_digest,
      local_attestation_digest, capability_body_digest,
      adapter_contract_digest, host_identity_digest,
      executable_identity_digest, native_settings_schema_digest,
      authority_compiler_version,
      expected_authority_profile_policy_version,
      authority_profile_policy_version)
    REFERENCES provider_action_routes(
      adapter_id, action_id, authority_compilation_status,
      authority_compilation_receipt_digest,
      coordination_run_id, authority_id, authority_envelope_digest,
      approval_evidence_digest, task_ownership_digest,
      workspace_root_identity_digest, risk_policy_digest,
      authority_provider_capability_snapshot_digest,
      requested_authority_profile_digest, requested_authority_profile,
      effective_authority_profile, effective_authority_digest,
      native_settings_digest, provider_control_plane_exception_digest,
      local_attestation_digest, capability_body_digest,
      adapter_contract_digest, host_identity_digest,
      executable_identity_digest, native_settings_schema_digest,
      authority_compiler_version,
      expected_authority_profile_policy_version,
      authority_profile_policy_version),
  FOREIGN KEY(adapter_id, capability_snapshot_generation,
      capability_snapshot_digest, capability_body_digest)
    REFERENCES adapter_capability_snapshots(
      adapter_id, snapshot_generation, snapshot_digest,
      capability_body_digest),
  FOREIGN KEY(effective_configuration_id, effective_configuration_revision,
      effective_configuration_ref_digest)
    REFERENCES adapter_effective_configurations(
      configuration_id, configuration_revision, configuration_digest),
  FOREIGN KEY(discovery_surface_evidence_id,
      discovery_surface_evidence_revision, discovery_surface_digest)
    REFERENCES discovery_surface_manifests(
      evidence_id, evidence_revision, manifest_digest),
  CHECK(effective_authority_profile = requested_authority_profile),
  CHECK(expected_authority_profile_policy_version =
    authority_profile_policy_version),
  CHECK(permission_profile_digest = native_settings_digest)
)

CREATE TRIGGER provider_action_dispatch_receipt_ref_null_safe
BEFORE INSERT ON provider_action_route_dispatches
WHEN NOT EXISTS (
  SELECT 1 FROM provider_action_routes r
  WHERE r.adapter_id = NEW.adapter_id AND r.action_id = NEW.action_id AND
    r.deployed_route_admission_digest = NEW.admission_digest AND
    r.authority_compilation_receipt_digest =
      NEW.authority_compilation_receipt_digest AND
    NEW.worktree_identity_digest IS r.worktree_identity_digest AND
    NEW.private_temp_root_identity_digest IS
      r.private_temp_root_identity_digest)
BEGIN SELECT RAISE(ABORT, 'authority-receipt-ref-mismatch'); END;
```

The dispatch insert validator byte-validates the closed
`deployedRouteDispatchV1`, equality-copies its complete authority-compilation
ref from admission and recomputes `dispatch_digest`. The second route foreign
key prevents the dispatch from crossing requested/effective profile,
effective-authority, native-settings, control-plane-exception, run,
authority/approval, task/root/worktree/temp, risk, capability, adapter/host,
attestation, compiler or policy while retaining an admission/action pair. Its
nullable worktree/temp trigger uses null-safe equality. It does not independently
reference the receipt table; the immutable route is the one policy owner.

Ordinals are contiguous and rows insert immediately before their provider I/O.
The snapshot must be current and unexpired at insertion, but may be a newer
instance than admission only when its body digest and adapter/contract/host are
identical. Effective-configuration, permission and surface tuples remain
admission-equal and the effective row must still reproduce all of them. The
same point-of-use transaction joins the route receipt to its immutable local-
attestation row and requires the current pointer for the exact provider tuple
and profile to still name that same ID, revision and digest in accepted,
unexpired state. The host-identity pointer must still select the exact revision
and digest embedded by the receipt's `hostIdentityDigest`; an internal no-op
pointer-generation change is ignored,
and executable/capability-body/native-settings-schema members must still equal
the configuration, capability and attestation. It also revalidates the current
run-selected V2 authority envelope/approval, workspace-root identity, task and
owner/writer-lease generations, owned-worktree identity, risk-policy revision,
authority-profile policy version, accepted write evidence's current matrix-
policy version/digest and complete effective-authority intersection. Any nonnull private-temp identity must still be the exact current
unexpired custody row with unchanged path/device/inode/type/owner/mode. A
semantically equivalent later attestation revision is still
drift and cannot revive the old action pair. The public
capability summary joins admission and latest dispatch snapshots separately,
including each one's source and clocks; no clock is copied between arms.

Terminal observation is append-only and separate:

```sql
provider_action_route_observations(
  adapter_id, action_id, admission_digest,
  observation_json, observation_digest, observed_at,
  PRIMARY KEY(adapter_id, action_id), UNIQUE(observation_digest),
  UNIQUE(adapter_id, action_id, admission_digest, observation_digest),
  FOREIGN KEY(adapter_id, action_id, admission_digest)
    REFERENCES provider_action_routes(
      adapter_id, action_id, deployed_route_admission_digest)
)
```

Insert equality-checks the parent action/admission digest and every closed
field-evidence union. A missing provider field persists its explicit
unavailable arm rather than admission data. No update, replacement or
recomputed admission digest is legal. Public reads left-join zero or one
observation and expose both immutable digests.

Certifying review evidence additionally stores nullable
`route_observation_digest` and `actual_route_identity_digest`. The latter can be
nonnull only when observation endpoint provider/family/model are proved by
provider result or contract-defined adapter attestation; equality is evaluated
separately against admission and resolved profile requirements. Every other
observed route arm is also equality-checked against admission; unavailable is
honest but proved inequality is mismatch. Missing proof and mismatch retain
safe adverse findings but accept no resolution and persist the respective
closed blocker. Generic provider actions bypass this certification-only test.

Admission and dispatch use this order:

1. classify exact command/action-pair replay and create/attach the canonical pair
   preflight before any route/config subject; for a certifying action, insert
   the preflight finding-capacity reservation before router I/O;
2. run the bounded pure resolver against explicit pinned inputs;
3. enter one `BEGIN IMMEDIATE` admission transaction, reattach the exact
   preflight owner/input, read the current unexpired capability pointer and
   exact host-identity, workspace-root and local-attestation tuple pointers,
   require the current run-authority revision/ref to resolve the receipt's
   immutable V2 authority ID/envelope/approval, authenticate task/owned-worktree
   on that same host plus any pre-provisioned private-temp
   current custody, exact current risk-policy row and expected/current authority-profile policy
   inputs, join any evaluated write attestation to the current containment-
   matrix policy pointer, and run the pure authority compiler;
4. for an admitted compilation, validate every derived digest and the resolver's
   adapter/contract/host/provider/family/model/raw-native-mode equality; insert
   the one provider-action effective configuration; insert the admitted
   compilation receipt; insert or attach every authority/budget reservation
   parent; insert the canonical provider action with its receipt foreign key;
   insert its route last with the same receipt/configuration/snapshot tuple;
   advance the preflight to `admitted`; and commit;
5. for a rejected compilation, instead insert only the rejected receipt against
   the same current immutable inputs, advance the preflight to `released` and
   commit; insert no effective configuration, finding/budget/effect reservation,
   provider action, route, dispatch or external marker;
6. immediately before initial provider I/O or a permitted no-effect retry, read
   the current unexpired snapshot, require admitted body/contract/host/model/
   effort/mode plus fixed effective-configuration/permission/harness/context/
   surface/route/authority-receipt equality, revalidate every current authority
   root/worktree/host/matrix-policy and local-attestation predicate described
   above, and
   append the exact dispatch snapshot row; an instance-only refresh with equal
   body proceeds;
7. on body/permission/surface/authority/local-attestation or other pre-effect
   drift, terminalise/supersede
   the zero-effect action and resolve
   afresh under a new action pair. After ambiguous effect, retain the original
   route and invoke only its existing pair-keyed recovery owner.

Compilation-receipt replay never reruns the compiler. An exact admitted retry
returns the persisted action/route/receipt result; an exact rejected retry
returns the byte-shape-identical persisted `AUTHORITY_PROFILE_UNAVAILABLE`
projection and safe reason. A changed preflight input, including authority
request bytes, expected policy version, envelope, task/lease/worktree binding,
risk policy, workspace-root/host identity, provider tuple, containment-matrix
policy or local-attestation selection, conflicts before
recompilation. A current policy mismatch on a new pair persists exact
`policy-version-mismatch`; it does not downgrade to read-only. A crash before
either receipt commit may rerun only the pure resolver/compiler after proving
the same preflight input and current parents. A crash after commit attaches the
immutable receipt and never creates a second row.

There is no authority-compilation receipt current-head table: the stable
`(adapter_id,action_id)` pair owns at most one receipt. Any changed envelope,
task/workspace-root/worktree/host generation, risk/policy revision, capability
body, attestation, matrix policy, private-temp custody, compiler or requested
profile requires a new action pair.
The existing partial
unique effective-configuration index remains the admitted per-action head;
rejected pairs have no configuration. Capability currentness remains the
existing per-adapter pointer with its body-equal refresh exception. Local-
attestation currentness is the exact tuple pointer above and has no equal-body
exception. A later Step-3 acceptance or council decision never upgrades an old
rejected pair, and no provider-global profile switch is introduced.

Before first provider acceptance, any failed currency predicate commits the
existing exact `terminal-no-effect` outcome and forbids provider I/O. After
acceptance or ambiguous effect, drift revokes the tool bridge and enters the
existing pair-keyed integrity/quarantine owner; it is never relabelled
zero-effect or rerouted. Crash resume may continue the same pair only when the
original receipt, configuration, policy, task/worktree/lease, capability-body
attestation-pointer, authority-envelope/run-current, workspace-root/host,
matrix-policy and selected private-temp-custody bindings all remain current and
no terminal row exists.
For `workspace-write-offline`, each filesystem/tool operation additionally
rechecks the same writer lease, task/worktree generation, canonical root and
filesystem identity immediately before opening its target; a symlink/root/
lease escape denies the operation and revokes further writes.

The pure resolver never persists, performs provider/network I/O or becomes the
route owner. Its existing five-second process-group TERM/KILL boundary remains
binding. The daemon persistence wrapper is not callable as a resolver.

Topology waves use one append-only store and one current pointer:

The authority foreign key below depends on the exact four-column parent
`UNIQUE(project_session_id, coordination_run_id, authority_revision,
authority_ref)` already declared by section 9.13 for the squashed baseline.

```sql
topology_wave_plans(
  project_session_id, coordination_run_id, task_id,
  wave_id, wave_revision,
  predecessor_wave_id, predecessor_wave_revision, predecessor_plan_digest,
  chair_agent_id, principal_generation, chair_lease_generation,
  authority_revision, authority_ref, authority_digest,
  policy_revision, policy_ref, policy_digest,
  rationale_evidence_id, rationale_evidence_revision,
  state, plan_json, plan_digest, created_at,
  PRIMARY KEY(project_session_id, coordination_run_id, task_id,
    wave_id, wave_revision),
  UNIQUE(project_session_id, coordination_run_id, task_id,
    wave_id, wave_revision, plan_digest),
  UNIQUE(plan_digest),
  FOREIGN KEY(rationale_evidence_id, rationale_evidence_revision)
    REFERENCES artifacts(artifact_id, revision),
  FOREIGN KEY(coordination_run_id, task_id)
    REFERENCES tasks(run_id, task_id),
  FOREIGN KEY(coordination_run_id, chair_agent_id)
    REFERENCES agents(run_id, agent_id),
  FOREIGN KEY(project_session_id, coordination_run_id,
      authority_revision, authority_ref)
    REFERENCES run_authority_revisions(
      project_session_id, coordination_run_id,
      authority_revision, authority_ref),
  FOREIGN KEY(project_session_id, coordination_run_id, task_id,
      predecessor_wave_id, predecessor_wave_revision,
      predecessor_plan_digest)
    REFERENCES topology_wave_plans(
      project_session_id, coordination_run_id, task_id,
      wave_id, wave_revision, plan_digest)
)

topology_wave_current(
  project_session_id, coordination_run_id, task_id,
  wave_id, wave_revision, plan_digest, revision,
  PRIMARY KEY(project_session_id, coordination_run_id, task_id),
  FOREIGN KEY(project_session_id, coordination_run_id, task_id,
      wave_id, wave_revision, plan_digest)
    REFERENCES topology_wave_plans(
      project_session_id, coordination_run_id, task_id,
      wave_id, wave_revision, plan_digest)
)

topology_wave_append_receipts(
  command_id PRIMARY KEY, request_digest, actor_principal_digest,
  project_session_id, coordination_run_id, task_id,
  prior_wave_id, prior_wave_revision, prior_plan_digest,
  wave_id, wave_revision, plan_digest, pointer_revision,
  receipt_json, receipt_digest, created_at,
  UNIQUE(receipt_digest),
  FOREIGN KEY(project_session_id, coordination_run_id, task_id,
      wave_id, wave_revision, plan_digest)
    REFERENCES topology_wave_plans(
      project_session_id, coordination_run_id, task_id,
      wave_id, wave_revision, plan_digest)
)
```

`plan_json` validates the closed Spec 01 object; scalar columns equality-copy it
and the plan digest is exact JCS. Nested triggers validate canonical order,
dependency/decomposability, topology, chair, stage owners, write partitions,
contention, budgets and stop conditions. The rationale tuple foreign-keys the
exact existing evidence registration. A revision is immutable; any rationale or
state change appends the next contiguous revision. The current pointer advances
by exact CAS. Predecessor refs foreign-key the exact earlier plan tuple, and
authority/policy/chair/dependency currency is checked at append and derived
again at read. Read currency treats a missing/noncontiguous/digest-invalid
predecessor chain as stale; it never requires the historical predecessor itself
to remain the current pointer. `fabric.v1.topology-wave.append` authenticates the current chair,
derives predecessor as null only for the zero-pointer arm or as the exact
expected/current plan ref, plus all plan-owned identity/authority/policy/time/
digest fields, and commits
plan, pointer and immutable receipt together. Exact command replay by request
digest returns the receipt before live checks; changed replay conflicts.
Current/list operations map only the discriminated Spec 01 projection and
ordinary scoped page envelope; missing pointer is unavailable/null and an
existing pointed plan is always the nonnull current or stale arm. No row grants authority, automatically chooses a
topology or creates a second chair/policy state machine.

Context pressure is operational state, not spend or authority budget. Existing
provider generation/context-revision telemetry remains append-only and
lifecycle-owned as specified in sections 9.22 and Spec 01 section 32.20. The
baseline `agent_adapter_bindings` relation adds exact
`UNIQUE(run_id, agent_id, adapter_id)` beside its existing `(run_id,agent_id)`
primary key. The separate truthful projection foreign-keys that exact active
agent/adapter identity:

```sql
provider_context_pressure_current(
  run_id, agent_id, adapter_id, provider_generation,
  context_revision, observation_source_event_id,
  pressure, source, confidence,
  window_tokens, used_tokens, remaining_tokens,
  observed_at, expires_at, evidence_digest, revision,
  PRIMARY KEY(run_id, agent_id),
  FOREIGN KEY(run_id, agent_id, adapter_id)
    REFERENCES agent_adapter_bindings(run_id, agent_id, adapter_id),
  FOREIGN KEY(run_id, agent_id, observation_source_event_id,
      provider_generation, context_revision, evidence_digest)
    REFERENCES provider_context_observation_audit(
      run_id, agent_id, source_event_id, provider_generation,
      context_revision, evidence_digest),
  CHECK(pressure IN ('low','medium','high','unknown')),
  CHECK(source IN ('native-exact','native-estimated','hook-boundary','unavailable')),
  CHECK(confidence IN ('exact','estimated','unknown')),
  CHECK(expires_at > observed_at),
  CHECK(source != 'unavailable' OR
    (pressure='unknown' AND confidence='unknown' AND window_tokens IS NULL AND
     used_tokens IS NULL AND remaining_tokens IS NULL)),
  CHECK(source != 'native-exact' OR
    (confidence='exact' AND window_tokens IS NOT NULL AND
     used_tokens IS NOT NULL AND remaining_tokens IS NOT NULL AND
     used_tokens + remaining_tokens = window_tokens)),
  CHECK(source != 'native-estimated' OR
    (confidence='estimated' AND window_tokens IS NOT NULL AND
     used_tokens IS NOT NULL AND remaining_tokens IS NOT NULL AND
     used_tokens + remaining_tokens = window_tokens)),
  CHECK(source != 'hook-boundary' OR
    (confidence IN ('exact','estimated') AND
     ((window_tokens IS NULL AND used_tokens IS NULL AND remaining_tokens IS NULL) OR
      (window_tokens IS NOT NULL AND used_tokens IS NOT NULL AND
       remaining_tokens IS NOT NULL AND
       used_tokens + remaining_tokens = window_tokens)))),
  CHECK(confidence != 'unknown' OR pressure='unknown')
)
```

Token fields are nullable nonnegative integers and satisfy the displayed closed
source/confidence/nullability/arithmetic checks. `pressure='unknown'` whenever
the current-window basis cannot be proved. Cumulative provider usage cannot populate current-window
pressure unless the adapter contract defines it as such. No row reserves,
consumes or releases provider budget. Observation update CASes the same
provider-generation/context-revision ordering already owned by lifecycle;
lower/reordered input is audit-only and cannot regress the projection or infer
principal/bridge generations.

Every fresh-context replacement uses one `BEGIN IMMEDIATE` adoption transaction.
After all adoption preconditions pass, it point-reads the optional
`provider_context_pressure_current` row for the exact run/agent binding. A
present row is captured by adapter, observation source event, provider
generation, context revision, evidence digest and projection revision; a truly
absent row is valid under the same write lock. Before changing
`agent_adapter_bindings`, the daemon rechecks absence or byte-equality and
compare-and-deletes that exact row. A mismatch or zero-row compare-delete after
a captured row aborts the adoption CAS. A binding UPDATE or DELETE aborts while
any current pressure row remains, so every lifecycle writer must follow this
order rather than relying only on the adapter foreign key. The binding changes
only after the delete. Rollback therefore exposes the complete old binding and
old pressure; commit exposes the replacement binding with pressure unavailable.
The immutable observation-audit row remains, pressure is never copied across
adapters or generations, and only a later authenticated observation for the
new current generation/context may insert a successor projection. An old or
reordered callback remains audit-only.

`fabric.v1.provider-context-pressure.read` and the negotiated scoped operator
System projection map this row exactly to Spec 01
`providerContextPressureV1`. The row's adapter and composite observation-audit
foreign key populate the corresponding wire fields. Read snapshot time derives
the discriminated Spec 01 current/stale nonnull or unavailable-null arm and
`ageSeconds` from `observed_at/expires_at` without a write; no stored or
projected percentage exists. Missing row projects unavailable, not zero
pressure.

Automatic pressure thresholds, hysteresis, maximum compaction counts and
successor selection are absent. Existing explicit lifecycle custody remains
the only rotation/compaction mutator, preserves fresh-rotation versus
same-history recovery, and keeps parent/child custody independent.

Operational spans are append-only, bounded and content-free. Export validates
the Spec 01 codec and rejects prompts, answers, tool arguments/results,
artifact bytes, private messages, capabilities and absolute paths rather than
redacting after persistence. Generic span export never satisfies receipt,
authority, review, disclosure or gate evidence.

Verification adds schema-generation parity; discovery manifest/artifact digest
equality and exact registration-revision foreign keys; capability current-
pointer, expiry and same-body refresh races;
effective-configuration subject/activation lineage; raw/normalised effort and
duplicate-subject rejection by all three partial unique indexes;
native-mode round-trip; actual review-route proof and every observed route-
field mismatch; exact cut-custody ref joins; point-of-use body/
permission/surface drift before effect; ambiguous-effect non-rerouting; honest
observed unknown; topology append/CAS/stale/authority joins; context-pressure/
budget separation, composite observation join, discriminated stale read,
crossed-arm rejection and no percentage;
lower/reordered observation; and telemetry content-denial fixtures. Full crash
matrices prove there is one route owner and that lifecycle recovery remains
ahead of generic provider recovery.

The generated baseline schema audit prepares every relation under
`PRAGMA foreign_keys=ON`, runs `PRAGMA foreign_key_check`, and inserts negative
fixtures for crossed artifact revision, agent adapter, topology task/chair,
rationale registration and route discovery-surface identities. No child relies
on trigger prose where the displayed composite foreign key can enforce the
relationship.
