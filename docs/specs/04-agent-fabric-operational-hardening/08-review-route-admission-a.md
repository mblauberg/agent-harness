
#### 9.21.3 Adapter capability and route admission

adapter-compatibility activation gains one digest-bound closed capability,
certifying-review-packet-only.v1. Its conformance record covers a daemon-built
per-action 0700 synthetic HOME with only exact 0600 auth/config bytes outside
the model tool namespace; exactly three non-secret helper locator environment
values; empty read-only cwd; one action-pair-only portal, direct or through the
pinned `agent-fabric-review-portal-supervisor portal-stdio-v1` Rust binary whose
trusted absolute path/device/inode/digest/code identity and fixed mode are
contract-bound; no inherited provider descriptor, HOME, user/project path,
unrelated plugin/source MCP effect, workspace index, shell/write/browser/
general-network effect; outer OS confinement and live canaries; fixed provider
transport; and crash-owned output/capsule/portal cleanup. Unsupported adapter/platform
combinations advertise false. The exact activated contract digest and source
mode are stored in each resolved profile slot and route.

Claude/Codex may expose the named portal server/tools directly only after
schema/ledger/source-denial/process-cleanup parity canaries pass; Codex has its
own mandatory confinement proof. Otherwise a provider uses the helper when the
same outer isolation can be proved, or advertises false. Cursor/Agy launch only
the pinned helper as adapter-internal bootstrap. Its environment is exactly
`AGENT_FABRIC_REVIEW_SOCKET`, `AGENT_FABRIC_REVIEW_ACTION` and
`AGENT_FABRIC_REVIEW_CONTRACT`; all are non-secret locators. It connects to the
per-action daemon AF_UNIX broker; capability stays broker-side. Their model
allowlist is exactly
mcp(agent-fabric-review-bundle/review_bundle_read) and
mcp(agent-fabric-review-bundle/review_bundle_search). Every other model mcp,
command, filesystem, shell, browser/web/network, resource and prompt effect is
denied. Exact-empty list probes remain permitted as above.

The current baseline separates pre-process filesystem intent from process
custody so no artifact or child exists without a durable locator:

~~~sql
review_portal_provider_launch_policies(
  adapter_id NOT NULL, contract_digest NOT NULL,
  launch_policy_json NOT NULL, launch_policy_digest NOT NULL,
  created_at NOT NULL,
  PRIMARY KEY(adapter_id,contract_digest),
  UNIQUE(adapter_id,contract_digest,launch_policy_digest),
  UNIQUE(launch_policy_digest)
)

review_portal_provider_activation_roots(
  daemon_instance_id NOT NULL,
  role NOT NULL CHECK(role IN ('synthetic-home','synthetic-temp')),
  canonical_path NOT NULL, device NOT NULL, inode NOT NULL,
  root_contract_json NOT NULL, root_contract_digest NOT NULL,
  created_at NOT NULL,
  PRIMARY KEY(daemon_instance_id,role),
  UNIQUE(root_contract_digest),
  UNIQUE(daemon_instance_id,role,root_contract_digest)
)

review_portal_provider_launch_source_contract_sets(
  adapter_id NOT NULL, action_id NOT NULL, daemon_instance_id NOT NULL,
  member_count NOT NULL CHECK(member_count >= 1),
  source_contract_set_digest NOT NULL,
  state NOT NULL CHECK(state IN ('building','sealed')),
  revision NOT NULL CHECK(revision IN (1,2)), created_at NOT NULL,
  sealed_at,
  PRIMARY KEY(adapter_id,action_id),
  UNIQUE(source_contract_set_digest),
  UNIQUE(adapter_id,action_id,daemon_instance_id,source_contract_set_digest),
  UNIQUE(adapter_id,action_id,daemon_instance_id,member_count,
    source_contract_set_digest,state),
  CHECK((state='building' AND revision=1 AND sealed_at IS NULL) OR
        (state='sealed' AND revision=2 AND sealed_at IS NOT NULL))
)

review_portal_provider_launch_source_contracts(
  adapter_id NOT NULL, action_id NOT NULL, daemon_instance_id NOT NULL,
  source_contract_set_digest NOT NULL,
  ordinal NOT NULL CHECK(ordinal >= 1),
  source_selector NOT NULL, source_contract_kind NOT NULL CHECK(
    source_contract_kind IN ('effective-configuration-field',
      'activated-executable','action-identity','review-socket',
      'synthetic-home','synthetic-temp','credential-capsule','empty-cwd',
      'policy-stdin-mode','adapter-secret-version')),
  path_class NOT NULL, source_contract_json NOT NULL,
  source_contract_digest NOT NULL, created_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id,ordinal),
  UNIQUE(adapter_id,action_id,source_selector,source_contract_digest),
  UNIQUE(adapter_id,action_id,source_contract_digest),
  UNIQUE(adapter_id,action_id,daemon_instance_id,
    source_contract_set_digest,source_contract_kind,source_contract_digest),
  FOREIGN KEY(adapter_id,action_id,daemon_instance_id,
      source_contract_set_digest)
    REFERENCES review_portal_provider_launch_source_contract_sets(
      adapter_id,action_id,daemon_instance_id,source_contract_set_digest)
)

review_portal_provider_launch_envelopes(
  adapter_id NOT NULL, action_id NOT NULL, contract_digest NOT NULL,
  daemon_instance_id NOT NULL,
  configuration_subject_kind NOT NULL CHECK(
    configuration_subject_kind='provider-action'),
  configuration_id NOT NULL, configuration_revision NOT NULL,
  configuration_digest NOT NULL, effective_configuration_digest NOT NULL,
  executable_identity_digest NOT NULL,
  launch_policy_digest NOT NULL, launch_envelope_json NOT NULL,
  launch_envelope_digest NOT NULL, source_contract_member_count NOT NULL,
  source_contract_set_digest NOT NULL,
  source_contract_set_state NOT NULL CHECK(source_contract_set_state='sealed'),
  created_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id),
  UNIQUE(launch_envelope_digest),
  UNIQUE(adapter_id,action_id,daemon_instance_id,launch_envelope_digest,
    source_contract_set_digest),
  UNIQUE(adapter_id,action_id,configuration_subject_kind,contract_digest,
    configuration_id,configuration_revision,configuration_digest,
    effective_configuration_digest,executable_identity_digest,
    launch_envelope_digest,daemon_instance_id,source_contract_set_digest),
  FOREIGN KEY(adapter_id,action_id,configuration_subject_kind,contract_digest,
      configuration_id,configuration_revision,configuration_digest,
      effective_configuration_digest,executable_identity_digest)
    REFERENCES adapter_effective_configurations(
      subject_action_adapter_id,subject_action_id,subject_kind,
      adapter_contract_digest,configuration_id,configuration_revision,
      configuration_digest,effective_configuration_digest,
      executable_identity_digest),
  FOREIGN KEY(adapter_id,contract_digest,launch_policy_digest)
    REFERENCES review_portal_provider_launch_policies(
      adapter_id,contract_digest,launch_policy_digest),
  FOREIGN KEY(adapter_id,action_id,daemon_instance_id,
      source_contract_member_count,source_contract_set_digest,
      source_contract_set_state)
    REFERENCES review_portal_provider_launch_source_contract_sets(
      adapter_id,action_id,daemon_instance_id,member_count,
      source_contract_set_digest,state)
)

review_portal_provider_exec_closures(
  adapter_id NOT NULL, action_id NOT NULL, contract_digest NOT NULL,
  daemon_instance_id NOT NULL,
  configuration_subject_kind NOT NULL CHECK(
    configuration_subject_kind='provider-action'),
  configuration_id NOT NULL, configuration_revision NOT NULL,
  configuration_digest NOT NULL, effective_configuration_digest NOT NULL,
  executable_identity_digest NOT NULL,
  launch_envelope_digest NOT NULL, source_contract_set_digest NOT NULL,
  provider_closure_json NOT NULL, provider_closure_digest NOT NULL,
  created_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id),
  UNIQUE(adapter_id,action_id,contract_digest,daemon_instance_id,
    provider_closure_digest),
  UNIQUE(adapter_id,action_id,contract_digest,daemon_instance_id,
    provider_closure_digest,launch_envelope_digest,source_contract_set_digest),
  UNIQUE(provider_closure_digest),
  FOREIGN KEY(adapter_id,action_id,configuration_subject_kind,contract_digest,
      configuration_id,configuration_revision,configuration_digest,
      effective_configuration_digest,executable_identity_digest,
      launch_envelope_digest,daemon_instance_id,source_contract_set_digest)
    REFERENCES review_portal_provider_launch_envelopes(
      adapter_id,action_id,configuration_subject_kind,contract_digest,
      configuration_id,configuration_revision,
      configuration_digest,effective_configuration_digest,
      executable_identity_digest,launch_envelope_digest,daemon_instance_id,
      source_contract_set_digest)
)

review_portal_filesystem_directory_name_claims(
  recovery_root_device NOT NULL, recovery_root_inode NOT NULL,
  directory_basename NOT NULL,
  adapter_id NOT NULL, action_id NOT NULL,
  role NOT NULL CHECK(role IN ('custody','claim')),
  PRIMARY KEY(recovery_root_device,recovery_root_inode,directory_basename),
  UNIQUE(adapter_id,action_id,role),
  UNIQUE(adapter_id,action_id,role,recovery_root_device,
    recovery_root_inode,directory_basename)
)

review_portal_action_artifact_name_claims(
  daemon_instance_id NOT NULL,
  artifact_role NOT NULL CHECK(
    artifact_role IN ('synthetic-home','synthetic-temp')),
  activated_root_contract_digest NOT NULL, basename NOT NULL,
  adapter_id NOT NULL, action_id NOT NULL,
  name_role NOT NULL CHECK(name_role IN ('canonical','claim')),
  PRIMARY KEY(activated_root_contract_digest,basename),
  UNIQUE(adapter_id,action_id,artifact_role,name_role),
  UNIQUE(adapter_id,action_id,artifact_role,name_role,daemon_instance_id,
    activated_root_contract_digest,basename),
  FOREIGN KEY(daemon_instance_id,artifact_role,
      activated_root_contract_digest)
    REFERENCES review_portal_provider_activation_roots(
      daemon_instance_id,role,root_contract_digest),
  CHECK(basename NOT IN ('','.','..') AND instr(basename,'/')=0)
)

review_portal_action_artifact_intents(
  adapter_id NOT NULL, action_id NOT NULL, daemon_instance_id NOT NULL,
  role NOT NULL CHECK(role IN ('synthetic-home','synthetic-temp')),
  source_contract_set_digest NOT NULL, source_contract_digest NOT NULL,
  activated_root_contract_digest NOT NULL,
  canonical_path NOT NULL, canonical_basename NOT NULL,
  canonical_path_digest NOT NULL,
  entry_manifest_digest NOT NULL,
  canonical_name_role NOT NULL CHECK(canonical_name_role='canonical'),
  claim_basename NOT NULL,
  claim_name_role NOT NULL CHECK(claim_name_role='claim'),
  artifact_intent_digest NOT NULL, created_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id,role),
  UNIQUE(artifact_intent_digest),
  UNIQUE(activated_root_contract_digest,canonical_path),
  UNIQUE(activated_root_contract_digest,canonical_basename),
  UNIQUE(activated_root_contract_digest,claim_basename),
  UNIQUE(adapter_id,action_id,role,daemon_instance_id,
    source_contract_set_digest,source_contract_digest,
    activated_root_contract_digest,canonical_path,canonical_basename,
    canonical_path_digest,
    entry_manifest_digest,canonical_name_role,claim_basename,
    claim_name_role,artifact_intent_digest),
  FOREIGN KEY(adapter_id,action_id,daemon_instance_id,
      source_contract_set_digest,role,source_contract_digest)
    REFERENCES review_portal_provider_launch_source_contracts(
      adapter_id,action_id,daemon_instance_id,source_contract_set_digest,
      source_contract_kind,source_contract_digest),
  FOREIGN KEY(daemon_instance_id,role,activated_root_contract_digest)
    REFERENCES review_portal_provider_activation_roots(
      daemon_instance_id,role,root_contract_digest),
  FOREIGN KEY(adapter_id,action_id,role,canonical_name_role,
      daemon_instance_id,activated_root_contract_digest,canonical_basename)
    REFERENCES review_portal_action_artifact_name_claims(
      adapter_id,action_id,artifact_role,name_role,daemon_instance_id,
      activated_root_contract_digest,basename),
  FOREIGN KEY(adapter_id,action_id,role,claim_name_role,
      daemon_instance_id,activated_root_contract_digest,claim_basename)
    REFERENCES review_portal_action_artifact_name_claims(
      adapter_id,action_id,artifact_role,name_role,daemon_instance_id,
      activated_root_contract_digest,basename),
  CHECK(canonical_basename <> claim_basename),
  CHECK(canonical_basename NOT IN ('','.','..') AND
    claim_basename NOT IN ('','.','..') AND
    instr(canonical_basename,'/')=0 AND instr(claim_basename,'/')=0)
)

review_portal_action_artifact_states(
  adapter_id NOT NULL, action_id NOT NULL,
  role NOT NULL CHECK(role IN ('synthetic-home','synthetic-temp')),
  artifact_intent_digest NOT NULL,
  phase NOT NULL CHECK(phase IN
    ('reserved','captured','claimed','removed','integrity-failure')),
  capture_kind CHECK(capture_kind IS NULL OR capture_kind IN
    ('complete','partial-recovery')),
  actual_device, actual_inode, actual_link_count,
  actual_entry_manifest_digest, actual_identity_digest,
  cleanup_evidence_digest, revision NOT NULL CHECK(revision >= 1),
  updated_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id,role),
  FOREIGN KEY(adapter_id,action_id,role,artifact_intent_digest)
    REFERENCES review_portal_action_artifact_intents(
      adapter_id,action_id,role,artifact_intent_digest),
  CHECK(
    (phase='reserved' AND capture_kind IS NULL AND
      actual_device IS NULL AND actual_inode IS NULL AND
      actual_link_count IS NULL AND actual_entry_manifest_digest IS NULL AND
      actual_identity_digest IS NULL AND cleanup_evidence_digest IS NULL) OR
    (phase IN ('captured','claimed') AND capture_kind IS NOT NULL AND
      actual_device IS NOT NULL AND
      actual_inode IS NOT NULL AND actual_link_count IS NOT NULL AND
      actual_entry_manifest_digest IS NOT NULL AND
      actual_identity_digest IS NOT NULL AND cleanup_evidence_digest IS NULL) OR
    (phase IN ('removed','integrity-failure') AND
      cleanup_evidence_digest IS NOT NULL)
  )
)

review_portal_filesystem_custody_intents(
  adapter_id NOT NULL, action_id NOT NULL, contract_digest NOT NULL,
  daemon_instance_id NOT NULL,
  recovery_root_path NOT NULL, recovery_root_device NOT NULL,
  recovery_root_inode NOT NULL, recovery_root_identity_digest NOT NULL,
  custody_directory_role NOT NULL CHECK(custody_directory_role='custody'),
  custody_directory_basename NOT NULL,
  custody_directory_contract_digest NOT NULL,
  claim_directory_role NOT NULL CHECK(claim_directory_role='claim'),
  claim_directory_basename NOT NULL,
  socket_basename NOT NULL, capsule_basename NOT NULL,
  expected_capsule_content_digest NOT NULL,
  provider_closure_digest NOT NULL, launch_envelope_digest NOT NULL,
  source_contract_set_digest NOT NULL, launch_nonce_digest NOT NULL,
  home_artifact_role NOT NULL CHECK(home_artifact_role='synthetic-home'),
  home_artifact_intent_digest NOT NULL,
  temp_artifact_role NOT NULL CHECK(temp_artifact_role='synthetic-temp'),
  temp_artifact_intent_digest NOT NULL,
  claim_name_codec NOT NULL CHECK(
    claim_name_codec='agent-fabric-custody-claim-v1'),
  intent_digest NOT NULL, created_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id),
  UNIQUE(launch_nonce_digest),
  UNIQUE(adapter_id,action_id,intent_digest),
  UNIQUE(adapter_id,action_id,intent_digest,contract_digest,daemon_instance_id,
    provider_closure_digest,launch_envelope_digest,source_contract_set_digest,
    launch_nonce_digest,home_artifact_role,home_artifact_intent_digest,
    temp_artifact_role,temp_artifact_intent_digest,
    recovery_root_path,recovery_root_device,recovery_root_inode,
    recovery_root_identity_digest,custody_directory_basename,
    custody_directory_contract_digest,claim_directory_basename,
    socket_basename,capsule_basename,expected_capsule_content_digest,
    claim_name_codec),
  FOREIGN KEY(adapter_id,action_id,custody_directory_role,
      recovery_root_device,recovery_root_inode,custody_directory_basename)
    REFERENCES review_portal_filesystem_directory_name_claims(
      adapter_id,action_id,role,recovery_root_device,recovery_root_inode,
      directory_basename),
  FOREIGN KEY(adapter_id,action_id,contract_digest,daemon_instance_id,
      provider_closure_digest,launch_envelope_digest,source_contract_set_digest)
    REFERENCES review_portal_provider_exec_closures(
      adapter_id,action_id,contract_digest,daemon_instance_id,
      provider_closure_digest,launch_envelope_digest,
      source_contract_set_digest),
  FOREIGN KEY(adapter_id,action_id,home_artifact_role,
      home_artifact_intent_digest)
    REFERENCES review_portal_action_artifact_intents(
      adapter_id,action_id,role,artifact_intent_digest),
  FOREIGN KEY(adapter_id,action_id,temp_artifact_role,
      temp_artifact_intent_digest)
    REFERENCES review_portal_action_artifact_intents(
      adapter_id,action_id,role,artifact_intent_digest),
  FOREIGN KEY(adapter_id,action_id,claim_directory_role,
      recovery_root_device,recovery_root_inode,claim_directory_basename)
    REFERENCES review_portal_filesystem_directory_name_claims(
      adapter_id,action_id,role,recovery_root_device,recovery_root_inode,
      directory_basename),
  CHECK(substr(recovery_root_path,1,1)='/'),
  CHECK(custody_directory_basename <> claim_directory_basename),
  CHECK(socket_basename <> capsule_basename),
  CHECK(instr(custody_directory_basename,'/')=0 AND
    instr(claim_directory_basename,'/')=0 AND
    instr(socket_basename,'/')=0 AND instr(capsule_basename,'/')=0),
  CHECK(custody_directory_basename NOT IN ('','.','..') AND
    claim_directory_basename NOT IN ('','.','..') AND
    socket_basename NOT IN ('','.','..') AND
    capsule_basename NOT IN ('','.','..'))
)

review_portal_filesystem_custody_state(
  adapter_id NOT NULL, action_id NOT NULL,
  state NOT NULL CHECK(state IN
    ('open','cleaned','integrity-failure')),
  revision NOT NULL CHECK(revision >= 1), cleanup_evidence_digest,
  updated_at NOT NULL,
  PRIMARY KEY(adapter_id,action_id),
  FOREIGN KEY(adapter_id,action_id)
    REFERENCES review_portal_filesystem_custody_intents(adapter_id,action_id),
  CHECK((state IN ('cleaned','integrity-failure')) =
    (cleanup_evidence_digest IS NOT NULL))
)

review_portal_process_custody(
  adapter_id NOT NULL, action_id NOT NULL, contract_digest NOT NULL,
  daemon_instance_id NOT NULL, filesystem_intent_digest NOT NULL,
  launch_nonce_digest NOT NULL, launch_action_binding_digest NOT NULL,
  launch_registration_digest NOT NULL,
  process_custody_launch_digest NOT NULL, launch_ack_digest NOT NULL,
  launch_row_revision NOT NULL CHECK(launch_row_revision=1),
  supervisor_pid NOT NULL CHECK(supervisor_pid > 0),
  supervisor_start_time NOT NULL CHECK(supervisor_start_time > 0),
  provider_root_pid NOT NULL CHECK(provider_root_pid > 0),
  provider_root_start_time NOT NULL CHECK(provider_root_start_time > 0),
  process_group_id NOT NULL CHECK(process_group_id > 0),
  session_id NOT NULL CHECK(session_id > 0),
  supervisor_executable_identity_digest NOT NULL,
  launch_stub_identity_digest NOT NULL, provider_closure_digest NOT NULL,
  launch_envelope_digest NOT NULL, source_contract_set_digest NOT NULL,
  home_artifact_role NOT NULL CHECK(home_artifact_role='synthetic-home'),
  home_artifact_intent_digest NOT NULL,
  temp_artifact_role NOT NULL CHECK(temp_artifact_role='synthetic-temp'),
  temp_artifact_intent_digest NOT NULL,
  ancestry_manifest_digest NOT NULL,
  recovery_root_path NOT NULL, recovery_root_device NOT NULL,
  recovery_root_inode NOT NULL, recovery_root_identity_digest NOT NULL,
  custody_directory_basename NOT NULL,
  custody_directory_contract_digest NOT NULL,
  claim_directory_basename NOT NULL,
  custody_directory_device NOT NULL, custody_directory_inode NOT NULL,
  claim_directory_device NOT NULL,
  claim_directory_inode NOT NULL,
  claim_name_codec NOT NULL CHECK(
    claim_name_codec='agent-fabric-custody-claim-v1'),
  socket_basename NOT NULL, socket_claim_basename NOT NULL,
  socket_file_device NOT NULL, socket_file_inode NOT NULL,
  socket_link_count NOT NULL CHECK(socket_link_count=1),
  socket_identity_digest NOT NULL,
  socket_cleanup_state NOT NULL,
  capsule_basename NOT NULL, capsule_claim_basename NOT NULL,
  capsule_file_device NOT NULL, capsule_file_inode NOT NULL,
  capsule_link_count NOT NULL CHECK(capsule_link_count=1),
  capsule_content_digest NOT NULL, capsule_cleanup_state NOT NULL,
  control_fd_number NOT NULL CHECK(control_fd_number=3),
  registration_fd_number NOT NULL CHECK(registration_fd_number=4),
  provider_exec_fd_number NOT NULL CHECK(provider_exec_fd_number=5),
  provider_cwd_fd_number NOT NULL CHECK(provider_cwd_fd_number=6),
  executable_parent_fd_number NOT NULL CHECK(executable_parent_fd_number=7),
  connection_state NOT NULL CHECK(
    connection_state IN ('waiting','consumed','closed')),
  process_state NOT NULL CHECK(process_state IN
    ('preparing','running','terminating','cleaned','integrity-failure')),
  directory_cleanup_state NOT NULL,
  directory_cleanup_evidence_digest,
  cleanup_generation NOT NULL CHECK(cleanup_generation >= 0),
  cleanup_evidence_digest, revision NOT NULL CHECK(revision >= 1),
  created_at NOT NULL, updated_at NOT NULL,
  PRIMARY KEY(adapter_id, action_id),
  UNIQUE(launch_nonce_digest),
  FOREIGN KEY(adapter_id,action_id,filesystem_intent_digest,
      contract_digest,daemon_instance_id,provider_closure_digest,
      launch_envelope_digest,source_contract_set_digest,launch_nonce_digest,
      home_artifact_role,home_artifact_intent_digest,
      temp_artifact_role,temp_artifact_intent_digest,
      recovery_root_path,recovery_root_device,recovery_root_inode,
      recovery_root_identity_digest,custody_directory_basename,
      custody_directory_contract_digest,claim_directory_basename,
      socket_basename,capsule_basename,capsule_content_digest,
      claim_name_codec)
    REFERENCES review_portal_filesystem_custody_intents(
      adapter_id,action_id,intent_digest,
      contract_digest,daemon_instance_id,provider_closure_digest,
      launch_envelope_digest,source_contract_set_digest,launch_nonce_digest,
      home_artifact_role,home_artifact_intent_digest,
      temp_artifact_role,temp_artifact_intent_digest,
      recovery_root_path,recovery_root_device,recovery_root_inode,
      recovery_root_identity_digest,custody_directory_basename,
      custody_directory_contract_digest,claim_directory_basename,
      socket_basename,capsule_basename,expected_capsule_content_digest,
      claim_name_codec),
  CHECK(claim_directory_basename <> custody_directory_basename),
  CHECK(claim_directory_device = custody_directory_device),
  CHECK(claim_directory_inode <> custody_directory_inode),
  CHECK(socket_basename <> capsule_basename),
  CHECK(socket_claim_basename <> capsule_claim_basename),
  CHECK(socket_claim_basename NOT IN (socket_basename,capsule_basename)),
  CHECK(capsule_claim_basename NOT IN (socket_basename,capsule_basename)),
  CHECK(instr(socket_basename,'/')=0 AND
    instr(socket_claim_basename,'/')=0 AND
    instr(capsule_basename,'/')=0 AND
    instr(capsule_claim_basename,'/')=0),
  CHECK(socket_basename NOT IN ('','.','..') AND
    socket_claim_basename NOT IN ('','.','..') AND
    capsule_basename NOT IN ('','.','..') AND
    capsule_claim_basename NOT IN ('','.','..')),
  CHECK(socket_cleanup_state IN
    ('canonical','claimed','removed','integrity-failure')),
  CHECK(capsule_cleanup_state IN
    ('canonical','claimed','removed','integrity-failure')),
  CHECK(directory_cleanup_state IN
    ('active','children-removed','canonical-removed','removed',
     'integrity-failure')),
  CHECK((directory_cleanup_state='active') =
    (directory_cleanup_evidence_digest IS NULL)),
  CHECK(directory_cleanup_state NOT IN
    ('children-removed','canonical-removed','removed') OR
    (socket_cleanup_state='removed' AND capsule_cleanup_state='removed')),
  CHECK(process_state <> 'cleaned' OR directory_cleanup_state='removed'),
  CHECK(directory_cleanup_state <> 'removed' OR
    process_state IN ('cleaned','integrity-failure')),
  CHECK((process_state IN ('cleaned','integrity-failure')) =
    (cleanup_evidence_digest IS NOT NULL))
)
~~~

All displayed locator/identity path, device, inode, basename and kind-specific
digest fields are nonnull and immutable. Phase evidence digests are null only in
their declared pre-evidence state and become immutable nonnull values in the
owning state CAS. Before any per-action HOME/temp directory, custody/claim
directory, filesystem portal socket, capsule or process exists, one transaction
reserves their four role/name claims, inserts the exact HOME/temp artifact
intents and their `reserved` states,
reserves both globally unique recovery-root child names and inserts the
immutable filesystem intent plus `open` state. `open` with no
process row is the reserved arm; `open` with its exact process row is the
process-bound arm. Process-row existence, not a separately mutable flag, is the
atomic ownership transition.
Daemon-created anonymous stdio pipes/socketpairs or an OS-owned PTY may be
captured for the closure before that transaction only while every endpoint
remains in the daemon, no child exists and no project/provider namespace entry
is created. Transaction failure closes them; daemon death lets the kernel close
them, leaving no recoverable path or external effect. The HOME/temp, listener
path, capsule and custody directories remain strictly post-intent.
Exactly two role-distinct name claims must join each intent; orphan, missing,
crossed or post-insert-mutated claims are rejected, and neither claim is reused
while its immutable intent remains registered.
It binds an already-opened 0700 daemon recovery root by path/device/inode plus
all create-exclusive relative basenames and expected capsule digest. The daemon
then creates the canonical and distinct 0700 claim directories only beneath
that no-follow root, writes/binds each artifact and fsyncs every file/directory/
parent before launch. A crash while reserved can see absent or partially created
objects but no provider has executed; recovery uses the exact root/intent and
the same trusted-claim revalidation, removes only a proved daemon-created object,
fsyncs the root after each removal and CASes the open/no-process state to cleaned.
It permits only the two reserved recovery-root directory basenames/their two
declared children plus the exact HOME/temp paths/manifests named by the two
artifact intents; any extra, crossed or substituted object records integrity
failure without deletion. Fully captured
identities, contract and daemon instance are equality-copied through the
displayed composite FK when the process row is inserted in the pre-ACK
transaction. That row is nondeletable and its identity fields are immutable.
Only it then owns live cleanup; state becomes cleaned or integrity-failed only
after the matching process/directory and both action-artifact terminals, and is
never a second owner.
Direct-SQL fixtures reject process insertion against non-open state, crossed
intent/contract/daemon/root/name/content, a process-less process-bound claim and
delete/reversion. It provisions both
directories on the same filesystem while sharing neither inode nor basename,
and current-build activation probes same-mount
atomic no-replace rename plus provider denial of read/list/write access to the
claim namespace. The row also persists both claim basenames and
`claim_name_codec=agent-fabric-custody-claim-v1`. For each entry the claim name
is `.agent-fabric-claim-` plus lowercase hex SHA-256 of the ASCII bytes
`agent-fabric-custody-claim-v1` followed by one `0x00` byte, then the canonical-
basename UTF-8 bytes,
u64be(device), u64be(inode), one kind byte (`0x00` socket, `0x01` regular file)
and the raw 32 digest bytes, concatenated in that order. The Rust boundary
recomputes and equality-checks the persisted name. Admission rejects either
claim name matching any canonical name or the other claim name. Thus executable
upgrade cannot silently change a live record's locator.
`socket_identity_digest` is `sha256:` plus lowercase SHA-256 of the ASCII bytes
`agent-fabric-custody-socket-v1` followed by one `0x00` byte, then
`u64be(device) || u64be(inode)`. The entry must be `S_IFSOCK`;
`capsule_content_digest` is `sha256:` plus lowercase
SHA-256 of the exact bounded regular-file bytes and the persisted device/inode
must also match. Both persisted link counts are exactly one. Golden vectors pin both exact domain preimages, the socket
digest and both claim names across Rust and TypeScript. No socket-content digest
exists. Failure refuses launch and
leaves capability false. These
private crash-locating fields never cross internal boundaries; only their
nonsecret correlation digests may do so, and none is public/model-visible.

The HOME/temp artifact intent is independently reproducible.
`artifact_intent_digest` uses domain
`agent-fabric-portal-action-artifact-intent-v1`, `0x00` and JCS of every
immutable intent-row field except that digest and `created_at`. Its claim name
is `.agent-fabric-action-claim-` plus lowercase SHA-256 hex of the ASCII bytes
`agent-fabric-portal-action-artifact-claim-v1`, `0x00`, role UTF-8, one `0x00`,
canonical-path-digest raw bytes, activated-root-contract-digest raw bytes and
source-contract-digest raw bytes. Home and temp claim names are distinct direct
siblings of their canonical action directory beneath the exact same cited
activated root. The root is never exposed; outer confinement grants the
provider only its canonical child and current-build canaries deny parent/claim
lookup, open and mutation. Same-root sibling rename supplies the proved atomic
same-filesystem boundary without an unstored claim-root locator.

After creating a directory no-follow and fsyncing its manifest/root, the daemon
captures device, inode, the root's positive observed link count and the actual
entry-manifest digest, which includes every entry's actual link count.
The captured manifest is exactly:

~~~yaml
reviewPortalActionArtifactCapturedManifestV1:
  schemaVersion: 1
  role: synthetic-home | synthetic-temp
  captureKind: complete | partial-recovery
  expectedEntryCountDec: nonnegative
  capturedEntryCountDec: nonnegative
  entries:
    - ordinalDec: positive-contiguous
      relativePath: exact-source-relative-path
      fileType: directory | regular
      modeOctal: "0700" | "0600"
      actualLinkCountDec: positive
      contentLengthDec: nonnegative | null
      contentDigest: exact-sha256 | null
~~~

Entries preserve source-manifest ordinal order. Directory content fields are
null; regular files have actual link count one and equality-copy source length/
digest. Expected count equals the source count. Complete capture has captured
count equal expected; partial recovery has a strictly smaller captured count and
the exact source prefix. Temp is the complete zero/zero/empty arm. The
`actual_entry_manifest_digest` uses domain
`agent-fabric-portal-action-artifact-captured-manifest-v1`, `0x00` and JCS of
this complete object. Rust/TypeScript goldens cover empty temp, zero/nonzero
HOME, nested-directory link counts and every valid prefix; permutation,
nonprefix and guessed-link mutants fail.
`actual_identity_digest` uses domain
`agent-fabric-portal-action-artifact-identity-v1`, `0x00` and JCS of exactly
`[role,captureKind,deviceDec,inodeDec,linkCountDec,
actualEntryManifestDigest,sourceContractDigest]`. `captureKind` is `complete`
after normal construction or `partial-recovery` only while recovering a
reserved pre-process crash. Captured root identity and manifest never change.
Process insert/ACK requires both roles captured as `complete` and exact intent/
envelope/source-contract equality; process and intent copy both artifact-intent
digests.

The exact phase/presence machine is:

- `reserved` with canonical and claim both absent writes no-effect cleanup
  evidence and CASes directly to `removed`. With canonical present and claim
  absent, recovery opens it no-follow and accepts only the complete expected
  pre-exec manifest or an exact no-extra ordinal prefix produced by the
  deterministic parent-before-child builder; it captures the corresponding
  kind and CASes to `captured`. Any claim presence or unproved canonical object
  is integrity failure;
- `captured` accepts either the exact canonical inode with claim absent, in
  which case it renames canonical to claim no-replace and fsyncs the root, or
  canonical absent with that exact inode already at claim, the crash-after-
  rename arm. It then CASes to `claimed`. Both present, both absent or another
  inode is integrity failure;
- `claimed` accepts canonical absent plus the exact claimed root, removes it as
  below, fsyncs the root and CASes to `removed`; canonical and claim both absent
  is the crash-after-remove arm and also fsyncs before that CAS. Any canonical
  reappearance, crossed inode or both present is integrity failure; and
- `removed` requires both names absent. `integrity-failure` never deletes.

Before provider exec, a partial prefix never becomes process-bound. After the
provider root is killed and reaped, provider-created cache/temp descendants and
content drift inside the proved root are expected: cleanup first atomically
claims the unchanged root inode, then performs a bounded no-follow postorder
walk using retained directory FDs. It may unlink arbitrary descendant names,
regular hard links, symlinks, sockets and regular files without following or
reading them, but never crosses the root device, a nested mount, descriptor
identity or the activated-root boundary. The activated adapter contract pins
and enforces lifetime quotas no larger than 65,536 descendants, depth 32 and
1 GiB allocated bytes; exceeding a quota is integrity failure, not unbounded
work. Reserved pre-process recovery remains strict-prefix only because no
provider has run. Every removed child/directory and final parent is fsynced; a
closed cleanup-evidence manifest binds encountered relative path/type/device/
inode, deletion order and final absence without exposing file content.

Crash/direct-SQL fixtures cover absent `reserved -> removed`, every entry-
creation prefix, complete/partial capture, before/after rename/fsync/CAS,
before/after every child and root removal, provider-created cache/temp/symlink/
socket entries, quota and nested-mount rejection, both accepted crash-presence
arms and every crossed name/inode/root combination.

The activated adapter contract registers exactly one immutable certifying
provider launch policy. `launch_policy_json` byte-equals RFC 8785 JCS of this
closed object; `launch_policy_digest` is `sha256:` plus lowercase SHA-256 of the
ASCII bytes `agent-fabric-portal-provider-launch-policy-v1`, one `0x00` byte and
those exact JCS bytes:

~~~yaml
reviewPortalProviderLaunchPolicyV1:
  schemaVersion: 1
  adapterId: exact-adapter
  contractDigest: exact-contract
  argv:
    maxCountDec: positive
    maxTotalUtf8BytesDec: positive
    template:
      - ordinalDec: positive-contiguous
        tokenKind: fixed-literal | option-name | sourced-value
        exactValue: exact-nul-free-utf8 | null
        exactValueDigest: exact-sha256 | null
        optionValueSlotOrdinalsDec: [strictly-increasing-positive-decimal]
        ownerOptionOrdinalDec: nonnegative
        ownerOptionValueIndexDec: nonnegative
        sourceKind: none | resolved-model | resolved-effort |
          executable-path | action-locator | stdin-mode | synthetic-path
        sourceSelector: none | effective-config-model |
          effective-config-effort | activated-executable-path |
          review-socket-locator | review-action-id | review-contract-digest |
          provider-stdin-mode | synthetic-home-path | synthetic-temp-path |
          credential-capsule-path | empty-cwd-path
        pathClass: not-path | review-socket | synthetic-home |
          synthetic-temp | credential-capsule | empty-cwd | executable
        sourceContractRule: none | effective-configuration-field |
          effective-configuration-executable | action-identity |
          action-review-socket | action-synthetic-home |
          action-synthetic-temp | action-credential-capsule |
          activation-empty-cwd | launch-policy-stdin-mode
        slotDigest: exact-digest
    forbidUnknownOption: true
    forbidShellOrInterpreterEval: true
    forbidWorkspaceCwdConfigPluginMcpToolOverrides: true
  environment:
    maxCountDec: positive
    maxTotalValueBytesDec: positive
    admitted:
      - name: exact-name
        sourceKind: fixed-literal | synthetic-home | synthetic-temp |
          credential-capsule | action-locator | adapter-secret
        sourceSelector: policy-fixed-literal | daemon-synthetic-home |
          daemon-synthetic-temp | prospective-credential-capsule |
          review-socket-locator | review-action-id | review-contract-digest |
          adapter-secret-version
        pathClass: not-path | review-socket | synthetic-home |
          synthetic-temp | credential-capsule
        allowEmpty: true | false
        fixedValue: exact-nul-free-utf8 | null
        fixedValueDigest: exact-sha256 | null
        sourceContractRule: none | action-synthetic-home |
          action-synthetic-temp | action-credential-capsule |
          action-review-socket | action-identity | adapter-secret-version
        entryDigest: exact-digest
    inheritParent: false
    mandatoryDeniedNames: [BASH_ENV, ENV, GIT_CONFIG, GIT_CONFIG_COUNT,
      GIT_DIR, GIT_WORK_TREE, LD_AUDIT, LD_LIBRARY_PATH, LD_PRELOAD,
      NODE_OPTIONS, PERL5OPT, PYTHONINSPECT, PYTHONPATH, RUBYOPT]
    mandatoryDeniedPrefixes: [DYLD_, GIT_CONFIG_KEY_, GIT_CONFIG_VALUE_]
  pathClasses:
    synthetic-home: action-private-directory-under-activated-home-root
    synthetic-temp: action-private-directory-under-activated-temp-root
    credential-capsule: action-private-regular-file-under-custody-directory
    empty-cwd: activation-owned-empty-read-only-directory
    review-socket: action-private-unix-socket-under-custody-directory
    executable: effective-configuration-opened-executable
    real-home-user-project-workspace-provider-source: denied
~~~
