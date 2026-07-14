
### 9.21 Complete-review custody, linear heads and route recovery

Spec 01 section 32.19 owns public behaviour. This section owns the current
baseline relations, private content store, transaction boundaries and recovery.
There is no compatibility import.

#### 9.21.1 Publication and eligible delivery source

artifact_publication_lineage is insert-only and one-to-one with an artifact
revision. Its canonical JSON mirrors artifactPublicationLineageV1 and normalised
columns include publisher agent/principal/bridge generations, provider custody
adapter/action, provider-session generation, adapter contract, family, model,
route receipt digest, state/reason and lineage digest.

Both chair launch activation and retained-child activation write the same
immutable provider_session_lineage row. Its owner discriminator joins either
launched_chair_bridge_state plus project-session launch custody, or child
agent_bridge_state plus provider-agent custody. An agent publication joins its
authenticated principal/bridge generation to exactly one such active row.
Composite foreign keys require one run, agent, principal generation, bridge,
provider session and adapter contract. Family/model are mandatory; route digest
is nullable only when that launch/provider custody owns none. Zero, multiple,
absent or crossed joins insert unproved with the exact closed reason. No caller
field can make it proved. Update/delete triggers make all lineage content
immutable.

Only an active project-file or strict-descendant run-file registration of
explicit evidence kind implementation-delivery-manifest.v1, published by an agent with
proved lineage, is target-eligible. spec05-four-slot-v1 additionally requires
an equality join to implementation_delivery_manifests and the one current
delivery_review_bases row produced by fabric-seal, and that publisher family
equal target-chair family. A generic artifact registration carrying the same
kind/content cannot satisfy that join. git-private-diff,
operator-, Fabric- and project-published rows remain valid bundle evidence but
are never silently promoted to eligible root targets.

The current evidence/artifact-kind catalogue explicitly contains
delivery-requirement-map.v1, implementation-delivery-manifest.v1,
coordination-gate-snapshot.v1 and discovery-surface.v1; none is inferred by
parsing generic receipt content. The first three use the persistence owners
below. Discovery-surface.v1 is registered only by the section 9.23 daemon
renderer and is rejected by public/agent evidence publication.

~~~sql
delivery_run_starts(
  project_session_id, run_id, delivery_run_id, repository_object_format,
  approved_base_object_id, authority_digest, created_revision,
  PRIMARY KEY(project_session_id, run_id, delivery_run_id)
)

delivery_requirement_maps(
  run_id, delivery_run_id, map_generation, closure_digest, catalogue_digest,
  accepted_scope_artifact_id, accepted_scope_revision,
  accepted_scope_digest, source_set_digest, requirement_set_digest,
  artifact_id, artifact_revision, content_digest, current, private_cas_path,
  PRIMARY KEY(run_id, delivery_run_id, map_generation),
  UNIQUE(content_digest)
)

coordination_gate_snapshots(
  run_id, delivery_run_id, snapshot_generation, event_watermark,
  chair_snapshot_digest, authority_digest, accepted_scope_digest,
  requirement_map_digest, gate_closure_digest, objective_evidence_digest,
  artifact_id, artifact_revision, content_digest, private_cas_path,
  PRIMARY KEY(run_id, delivery_run_id, snapshot_generation),
  UNIQUE(content_digest)
)

implementation_delivery_manifests(
  run_id, delivery_run_id, seal_generation, command_id,
  snapshot_generation, profile_digest, accepted_scope_digest,
  requirement_map_digest, evidence_closure_digest,
  base_object_id, head_object_id, head_tree_id, index_tree_id,
  repository_source_state_digest, artifact_id, artifact_revision,
  content_digest, publication_lineage_digest, private_cas_path,
  PRIMARY KEY(run_id, delivery_run_id, seal_generation),
  UNIQUE(content_digest)
)

delivery_review_bases(
  run_id, delivery_run_id, review_basis_revision,
  manifest_artifact_id, manifest_artifact_revision, manifest_digest,
  snapshot_digest, profile_digest, repository_source_state_digest,
  requirement_map_digest, evidence_closure_digest, current, basis_digest,
  PRIMARY KEY(run_id, delivery_run_id, review_basis_revision)
)
~~~

Run start is immutable; AFAB-004 stores the full
c2fc623a2529f87feca27982e1a140969ab5a258 base. Snapshot/manifest content has no
self-digest or final-basis reference. `fabric.v1.implementation-delivery.seal`
implements replay and stable run/delivery-run single-flight before work. Phase
A captures the exact chair principal/lease/bridge/session lineage, run-start,
delivery RUN/scope/full requirement-map entries, profile, authority/gate/
evidence/artifact revisions and Git HEAD/index/worktree tokens. The request's
expected HEAD is only an optimistic lock; no caller field selects base or
closure content.

Before manifest seal, `fabric.v1.delivery-requirement-map.seal` derives the one
current closed map from accepted scope and the checked-in
spec05-delivery-requirements.v1 catalogue. Only the authenticated current chair
may call it. Its closed request contains command/project-session/run/delivery-
run IDs, expected current map generation (zero iff none), expected current
accepted-scope revision and expected checked-in catalogue digest. A wrong zero/
positive/current sentinel conflicts before work. It equality-CASes catalogue/
scope/source/evidence revisions, requires every binding ID exactly once and
proved, and registers delivery-requirement-map.v1 bytes. Stable run/delivery-
run single-flight precedes phase A: exact command replay returns its immutable
result, changed replay conflicts and different commands serialize. Before
generation allocation, `closure_digest` hashes RFC 8785 JCS of the complete
prospective map with only map generation and closure digest omitted. Equality
with current returns its existing bytes/registration/generation; otherwise the
daemon allocates current generation plus one and inserts. Only changed
catalogue, accepted-scope/binding-source or selected evidence closure advances
generation; command-ID churn cannot stale a basis. delivery-run v1 remains
unchanged; no mutable RUN.json digest becomes a review-basis dependency.

Outside SQLite, fixed no-follow readers validate the complete profile-derived
requirement/evidence closure and clean base-to-HEAD state. They write the
coordination snapshot and manifest to reserved digest-named run-file CAS paths
create-exclusive, fsync, re-read and verify. Phase B reauthenticates, equality-
CASes every captured row/token and atomically inserts both artifact
registrations, authenticated-agent publication lineage, final review-basis row
and immutable command receipt. `producer_kind=fabric-seal` is distinct from the
authenticated agent publisher. Failure leaves no DB row; unreferenced CAS bytes
are run-owned GC. Exact replay returns the stored result; changed replay
conflicts. Any source/scope/map/profile/gate/evidence/lineage revision makes the
basis stale and requires a new seal.

#### 9.21.2 Bundle store and target transaction

The private bundle owner uses these logical current relations:

~~~sql
review_target_preparation_high_water(
  run_id PRIMARY KEY,
  preparation_generation INTEGER NOT NULL CHECK(preparation_generation >= 0),
  target_generation INTEGER NOT NULL CHECK(target_generation >= 0),
  bundle_generation INTEGER NOT NULL CHECK(bundle_generation >= 0),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  CHECK(preparation_generation = target_generation),
  CHECK(target_generation = bundle_generation)
)

review_target_preparations(
  run_id, preparation_id,
  preparation_generation INTEGER NOT NULL CHECK(preparation_generation >= 1),
  owner_command_id, semantic_input_digest, full_input_digest,
  actor_principal_digest, task_id, expected_target_generation,
  delivery_manifest_artifact_id,
  delivery_manifest_artifact_revision INTEGER NOT NULL
    CHECK(delivery_manifest_artifact_revision >= 1),
  reserved_target_generation INTEGER NOT NULL
    CHECK(reserved_target_generation >= 1),
  reserved_bundle_generation INTEGER NOT NULL
    CHECK(reserved_bundle_generation >= 1),
  state, revision INTEGER NOT NULL CHECK(revision >= 1),
  worker_claim_generation INTEGER NOT NULL
    CHECK(worker_claim_generation >= 0), worker_instance_id,
  worker_lease_expires_at, captured_precondition_digest,
  progress_kind, progress_plan_digest, progress_total, progress_completed,
  built_bundle_digest, built_manifest_root_digest,
  terminal_kind, terminal_code, terminal_evidence_digest, target_generation,
  accepted_receipt_digest, created_at, updated_at,
  PRIMARY KEY(run_id, preparation_id),
  UNIQUE(run_id, preparation_generation),
  UNIQUE(run_id, reserved_target_generation),
  UNIQUE(run_id, reserved_bundle_generation),
  UNIQUE(owner_command_id),
  CHECK(preparation_generation = reserved_target_generation),
  CHECK(reserved_target_generation = reserved_bundle_generation)
)
CREATE UNIQUE INDEX one_active_review_target_preparation_per_run
  ON review_target_preparations(run_id)
  WHERE state IN ('prepared','building','built');

review_bundles(
  run_id, bundle_generation, delivery_run_id,
  review_basis_revision, review_basis_digest,
  delivery_artifact_id, delivery_artifact_revision,
  base_object_id, head_object_id, head_tree_id, index_tree_id,
  review_diff_codec_digest, review_diff_rules_digest,
  review_diff_set_digest,
  repository_source_state_digest,
  publication_lineage_digest,
  coverage_digest, manifest_body_digest, manifest_root_digest, bundle_digest,
  bundle_search_index_digest, risk_read_map_digest,
  mandatory_read_set_digest, mandatory_read_count, mandatory_read_bytes,
  changed_path_count, required_evidence_count, carried_finding_count,
  object_count, chunk_count, total_object_bytes,
  manifest_page_bytes, search_index_bytes, risk_map_bytes,
  private_manifest_body_path, private_manifest_root_path,
  private_bundle_ref_path, created_at,
  PRIMARY KEY(run_id, bundle_generation),
  UNIQUE(bundle_digest)
)

review_bundle_objects(
  bundle_digest, object_digest, media_type, byte_length, ordinal,
  PRIMARY KEY(bundle_digest, object_digest),
  UNIQUE(bundle_digest, ordinal)
)

review_bundle_chunks(
  bundle_digest, object_digest, ordinal, chunk_digest, byte_length,
  private_chunk_path,
  PRIMARY KEY(bundle_digest, object_digest, ordinal)
)

review_bundle_manifest_pages(
  bundle_digest, ordinal, page_digest, byte_length, private_page_path,
  PRIMARY KEY(bundle_digest, ordinal)
)

review_finding_sets(
  finding_set_digest PRIMARY KEY, finding_count, page_count,
  canonical_byte_length, created_at
)

review_finding_pages(
  page_digest PRIMARY KEY, member_count, canonical_byte_length,
  private_page_path, created_at
)

review_finding_set_pages(
  finding_set_digest, ordinal, page_digest, member_count,
  first_finding_digest, last_finding_digest,
  PRIMARY KEY(finding_set_digest, ordinal),
  UNIQUE(finding_set_digest, page_digest),
  FOREIGN KEY(finding_set_digest) REFERENCES review_finding_sets(finding_set_digest),
  FOREIGN KEY(page_digest) REFERENCES review_finding_pages(page_digest)
)

review_finding_members(
  page_digest, member_ordinal, finding_digest,
  finding_id, severity, safe_record_json,
  PRIMARY KEY(page_digest, member_ordinal),
  UNIQUE(page_digest, finding_digest, finding_id),
  FOREIGN KEY(page_digest) REFERENCES review_finding_pages(page_digest)
)

provider_action_pair_preflights(
  adapter_id NOT NULL, action_id NOT NULL,
  scope_kind NOT NULL CHECK(scope_kind IN ('provider-smoke','run-action')),
  run_id,
  owner_digest NOT NULL, actor_principal_digest NOT NULL, input_digest NOT NULL,
  state NOT NULL CHECK(state IN ('resolving','admitted','released')),
  created_at NOT NULL, updated_at NOT NULL,
  PRIMARY KEY(adapter_id, action_id),
  UNIQUE(adapter_id, action_id, owner_digest),
  UNIQUE(adapter_id, action_id, owner_digest, input_digest),
  UNIQUE(run_id, adapter_id, action_id),
  UNIQUE(run_id, adapter_id, action_id, owner_digest),
  FOREIGN KEY(run_id) REFERENCES runs(run_id),
  CHECK(
    (scope_kind = 'provider-smoke' AND run_id IS NULL) OR
    (scope_kind = 'run-action' AND run_id IS NOT NULL)
  )
)

review_finding_capacity_reservations(
  adapter_id NOT NULL, action_id NOT NULL, run_id NOT NULL,
  target_generation NOT NULL CHECK(target_generation >= 1),
  slot NOT NULL CHECK(slot IN
    ('native','other-primary','cursor-grok','agy-gemini')),
  attempt_generation CHECK(
    attempt_generation IS NULL OR attempt_generation >= 1),
  owner_digest NOT NULL,
  finding_window_mode NOT NULL, prior_open_finding_set_digest NOT NULL,
  maximum_new_findings NOT NULL, maximum_new_finding_bytes NOT NULL,
  reservation_digest NOT NULL,
  state NOT NULL CHECK(state IN ('preflight','attached','released','settled')),
  created_at NOT NULL, updated_at NOT NULL,
  PRIMARY KEY(adapter_id, action_id),
  UNIQUE(adapter_id, action_id, reservation_digest),
  UNIQUE(run_id, target_generation, slot, attempt_generation),
  UNIQUE(adapter_id, action_id, run_id, target_generation, slot,
    attempt_generation, reservation_digest),
  FOREIGN KEY(run_id, adapter_id, action_id, owner_digest)
    REFERENCES provider_action_pair_preflights(
      run_id, adapter_id, action_id, owner_digest),
  FOREIGN KEY(run_id, target_generation, slot)
    REFERENCES review_slot_heads(run_id, target_generation, slot),
  CHECK(
    (state IN ('preflight','released') AND attempt_generation IS NULL) OR
    (state IN ('attached','settled') AND attempt_generation IS NOT NULL)
  )
)

review_terminal_sequence_high_water(
  run_id PRIMARY KEY, terminal_sequence, revision
)

review_certification_cuts(
  run_id, target_generation, predecessor_binding_generation,
  predecessor_binding_digest, terminal_sequence_high_water,
  lifecycle_custody_agent_id, lifecycle_custody_id,
  lifecycle_custody_revision, lifecycle_adoption_evidence_digest,
  lifecycle_review_decision_digest, lifecycle_review_authority_receipt_digest,
  cut_digest, created_at,
  PRIMARY KEY(run_id, target_generation, lifecycle_custody_agent_id,
    lifecycle_custody_id, lifecycle_custody_revision),
  UNIQUE(cut_digest),
  UNIQUE(run_id, target_generation, lifecycle_custody_agent_id,
    lifecycle_custody_id, lifecycle_custody_revision,
    predecessor_binding_generation,lifecycle_review_decision_digest,
    lifecycle_review_authority_receipt_digest,cut_digest),
  UNIQUE(run_id,target_generation,lifecycle_custody_agent_id,
    lifecycle_custody_id,lifecycle_custody_revision,
    predecessor_binding_generation,cut_digest),
  FOREIGN KEY(run_id, lifecycle_custody_agent_id, lifecycle_custody_id,
      lifecycle_custody_revision)
    REFERENCES lifecycle_rotation_custody_revisions(
      run_id, agent_id, custody_id, revision),
  FOREIGN KEY(lifecycle_review_authority_receipt_digest,run_id,
      lifecycle_custody_agent_id,lifecycle_custody_id,
      lifecycle_custody_revision,lifecycle_review_decision_digest,cut_digest)
    REFERENCES lifecycle_review_authority_bindings(
      receipt_digest,run_id,agent_id,custody_id,custody_revision,
      review_decision_digest,certification_cut_digest)
)

review_completion_targets(
  run_id, target_generation, preparation_id, review_subject_digest,
  task_id, reviewed_artifact_id, reviewed_artifact_revision,
  publication_lineage_digest, delivery_review_basis_revision,
  delivery_review_basis_digest, repository_source_state_digest,
  bundle_generation, bundle_digest, manifest_body_digest, manifest_root_digest,
  coverage_digest, bundle_search_index_digest, risk_read_map_digest,
  mandatory_read_set_digest, mandatory_read_count, mandatory_read_bytes,
  object_count, chunk_count, total_object_bytes,
  profile_id, profile_schema_digest, resolved_profile_digest,
  initial_chair_binding_digest, state, created_at,
  PRIMARY KEY(run_id, target_generation),
  UNIQUE(run_id, target_generation, review_subject_digest),
  UNIQUE(run_id, review_subject_digest),
  UNIQUE(preparation_id),
  CHECK(state IN ('current', 'superseded'))
)

review_target_chair_bindings(
  run_id, target_generation, binding_generation,
  predecessor_binding_generation, predecessor_binding_digest,
  predecessor_certification_cut_sequence,
  predecessor_certification_cut_digest,
  predecessor_certification_cut_custody_agent_id,
  predecessor_certification_cut_custody_id,
  predecessor_certification_cut_custody_revision,
  agent_id, principal_generation,
  chair_lease_generation, provider_session_generation, bridge_generation,
  adapter_id, adapter_contract_digest, model_family, model,
  review_subject_digest,
  route_receipt_digest, profile_digest, task_id, reviewed_artifact_id,
  delivery_review_basis_digest, repository_source_state_digest, bundle_digest,
  lifecycle_custody_id, lifecycle_custody_revision, checkpoint_digest,
  lifecycle_adoption_evidence_digest,lifecycle_review_decision_digest,
  lifecycle_review_authority_receipt_digest,
  binding_digest, created_at,
  PRIMARY KEY(run_id, target_generation, binding_generation),
  UNIQUE(run_id, target_generation, binding_generation, binding_digest),
  FOREIGN KEY(run_id, target_generation, review_subject_digest)
    REFERENCES review_completion_targets(
      run_id, target_generation, review_subject_digest),
  FOREIGN KEY(run_id, target_generation,
      predecessor_certification_cut_custody_agent_id,
      predecessor_certification_cut_custody_id,
      predecessor_certification_cut_custody_revision,
      predecessor_binding_generation,
      predecessor_certification_cut_digest)
    REFERENCES review_certification_cuts(
      run_id, target_generation, lifecycle_custody_agent_id,
      lifecycle_custody_id, lifecycle_custody_revision,
      predecessor_binding_generation, cut_digest),
  FOREIGN KEY(run_id, agent_id, lifecycle_custody_id,
      lifecycle_custody_revision)
    REFERENCES lifecycle_rotation_custody_revisions(
      run_id, agent_id, custody_id, revision),
  FOREIGN KEY(lifecycle_review_authority_receipt_digest,run_id,agent_id,
      lifecycle_custody_id,lifecycle_custody_revision,
      lifecycle_review_decision_digest,predecessor_certification_cut_digest)
    REFERENCES lifecycle_review_authority_bindings(
      receipt_digest,run_id,agent_id,custody_id,custody_revision,
      review_decision_digest,certification_cut_digest)
)

review_target_chair_binding_heads(
  run_id, target_generation, active_binding_generation, revision,
  PRIMARY KEY(run_id, target_generation),
  FOREIGN KEY(run_id, target_generation, active_binding_generation)
    REFERENCES review_target_chair_bindings(
      run_id, target_generation, binding_generation)
)

review_target_rebind_receipts(
  run_id, target_generation, lifecycle_custody_agent_id,
  lifecycle_custody_id, lifecycle_custody_revision, command_id,
  review_subject_digest, prior_binding_generation, new_binding_generation,
  prior_binding_digest, new_binding_digest, lifecycle_adoption_digest,
  lifecycle_review_decision_digest,lifecycle_certification_cut_digest,
  lifecycle_review_authority_receipt_digest,
  bundle_digest, profile_digest, slot_head_set_digest,
  open_and_repair_finding_set_digest, rebind_receipt_digest, created_at,
  PRIMARY KEY(run_id, target_generation, lifecycle_custody_agent_id,
    lifecycle_custody_id, lifecycle_custody_revision),
  UNIQUE(command_id), UNIQUE(rebind_receipt_digest),
  FOREIGN KEY(run_id, target_generation)
    REFERENCES review_completion_targets(run_id, target_generation),
  FOREIGN KEY(run_id, target_generation, review_subject_digest)
    REFERENCES review_completion_targets(
      run_id, target_generation, review_subject_digest),
  FOREIGN KEY(run_id, target_generation, prior_binding_generation)
    REFERENCES review_target_chair_bindings(
      run_id, target_generation, binding_generation),
  FOREIGN KEY(run_id, target_generation, new_binding_generation)
    REFERENCES review_target_chair_bindings(
      run_id, target_generation, binding_generation),
  FOREIGN KEY(run_id, lifecycle_custody_agent_id, lifecycle_custody_id,
      lifecycle_custody_revision)
    REFERENCES lifecycle_rotation_custody_revisions(
      run_id, agent_id, custody_id, revision),
  FOREIGN KEY(lifecycle_review_authority_receipt_digest,run_id,
      lifecycle_custody_agent_id,lifecycle_custody_id,
      lifecycle_custody_revision,lifecycle_review_decision_digest,
      lifecycle_certification_cut_digest)
    REFERENCES lifecycle_review_authority_bindings(
      receipt_digest,run_id,agent_id,custody_id,custody_revision,
      review_decision_digest,certification_cut_digest),
  CHECK(new_binding_generation = prior_binding_generation + 1)
)

review_certifying_slot_availability_revisions(
  project_session_id, profile_id, profile_schema_digest,
  target_chair_family, slot, adapter_id, adapter_contract_digest,
  provider_family, model, source_mode, runtime_identity_digest,
  platform_identity_digest, availability_revision, state, reason,
  created_at,
  PRIMARY KEY(project_session_id, profile_id, profile_schema_digest,
    target_chair_family, slot, adapter_id, adapter_contract_digest,
    provider_family, model, source_mode, runtime_identity_digest,
    platform_identity_digest, availability_revision)
)

review_certifying_slot_availability_heads(
  project_session_id, profile_id, profile_schema_digest,
  target_chair_family, slot, adapter_id, adapter_contract_digest,
  provider_family, model, source_mode, runtime_identity_digest,
  platform_identity_digest, current_availability_revision, revision,
  PRIMARY KEY(project_session_id, profile_id, profile_schema_digest,
    target_chair_family, slot, adapter_id, adapter_contract_digest,
    provider_family, model, source_mode, runtime_identity_digest,
    platform_identity_digest),
  FOREIGN KEY(project_session_id, profile_id, profile_schema_digest,
    target_chair_family, slot, adapter_id, adapter_contract_digest,
    provider_family, model, source_mode, runtime_identity_digest,
    platform_identity_digest, current_availability_revision)
    REFERENCES review_certifying_slot_availability_revisions(
      project_session_id, profile_id, profile_schema_digest,
      target_chair_family, slot, adapter_id, adapter_contract_digest,
      provider_family, model, source_mode, runtime_identity_digest,
      platform_identity_digest, availability_revision)
)

~~~

Normalised changed-file and required-evidence rows plus finding-set/page/member
relations own the complete sorted coverage manifest and foreign-key every
object they name. Finding members include the immutable safe record, exact
origin action/result/manifest/basis/bundle and source/evidence/mixed repair
currency. Successor checks require later manifest/basis/bundle for every
finding, source advance only for source/mixed and each named evidence revision
plus changed content for evidence/mixed. Identical-byte or Git-only evidence
repair fails. Checks enforce the
Spec 01 counts and byte limits, exact before/after/diff shapes per Git status,
contiguous object/chunk/manifest-page ordinals and one computed coverage,
manifest-body, bounded-root and bundle digest. Identical chunk bytes may recur
at multiple ordinals; the ordinal key preserves the object sequence while the
private CAS deduplicates physical storage by chunk digest. Each page is at most 65,536
bytes, there are at most 16 pages/1 MiB, and the root is at most 49,152 bytes
and lists every ordered page digest. Empty
objects have no chunk; every nonempty object has complete contiguous chunk
coverage. Insert/update triggers reject partial manifests and make every
committed row immutable.

Finding pages are exact RFC 8785 JCS, contain whole strictly ordered unique
members and are at most 65,536 bytes. Set-page ranges are contiguous,
nonoverlapping and equality-copy page count/member/range data; the root count is
the exact sum. No fixed finding-count cap exists. Each bundle foreign-keys one
complete set root and all its pages as mandatory objects. A normal action
capacity reservation proves room for 32 maximum-size new records and resulting
set roots before router I/O. `resolution-only` stores zero maxima and can only
remove up to 32 prior digests; it is noncertifying. Triggers reject result
insertion beyond reservation. Physical minimum-root/page exhaustion creates the
typed operator gate; no referenced finding row is deleted or overwritten.

Changed-file rows additionally store exact status, old/new UTF-8 paths,
before/after mode, object and byte-length arms plus `diff_object_digest` under
the review-diff.v1 codec in Spec 01. Startup verifies the checked-in codec and
rules digests and the immutable conformance fixture manifest, which binds full
base/head object IDs, object format, source-object-set digest, exact expected
counts/bytes and diff-set digest. The fixed Git reader disables mutable config
and implements exact-content rename pairing plus the closed Myers/binary arms;
it never parses porcelain output. Triggers enforce arm nullability, path/status
ordering and equality between the bundle's stored codec/rules/set digests and
the complete child set. A codec/rules/fixture mismatch disables target
preparation before a worker claim.

Generated canonicalisers own the exact Spec 01 preimages for requirement-map,
evidence-closure, repository-source-state, coverage and mandatory-read-set
digests. Stored map/evidence/source/object digests equality-copy their registered
bytes. Child tables enforce every body ordinal plus changed-file, evidence,
object, finding-page and mandatory-entry order/uniqueness. Startup golden vectors
and permutation negatives cover every domain; a generated-code/schema/vector
digest mismatch disables seal/prepare before filesystem work.

Digest construction follows Spec 01's acyclic order: JCS manifest body with no
self/later digest -> raw body pages -> JCS root -> JCS final bundle ref; each
digest is stored outside its own bytes. The mandatory set is root + every
manifest-body page + finding-set root/page, and the delivery manifest/map plus required accepted-scope/spec/ADR/decision/gate-
decision/coordination-snapshot objects.
Target commit rejects more than 80 unique root/page/chunk responses or 6 MiB
mandatory bytes. Limits are 4,096 changed paths, 1,024 evidence rows, 16,384
objects, 32,768 deterministic 64-KiB chunks, 16 MiB per
object, 64 MiB unique object bytes, 4 MiB search index and 256 KiB risk-map
output. All changed-file diffs and other evidence remain completely available.
The final target recomputes exact review-diff.v1/body/object/wire bytes from its
immutable approved run-start to actual sealed HEAD; with the full 2 MiB risk-
sample ceiling it must materialise under 6 MiB mandatory/10 MiB combined wire
bytes. No earlier delivery-HEAD count is a gate. The immutable pre-codec sizing
observation for
`c2fc623a2529f87feca27982e1a140969ab5a258..0a04d161c5d4fa027c96410b3cc0cf887e1c6e42`
is 601 changes, 1,434 objects, 27,766,213 bytes and largest object 4,097,314
bytes; it is deliberately not stored as final target expected output.
The daemon also writes an immutable bundle-search.v1 index and applies the
checked-in review-risk-map.v1 to every manifest entry. The rules score and sort
changed objects deterministically, then select exact highest-risk diff chunks
from every nonempty group, at most 32 chunks/2 MiB total. Those caller/provider-
independent sample digests join the mandatory set; target prepare fails if the
whole mandatory set cannot remain within 80 reads/6 MiB. Literal search is
available for deeper exploration but never substitutes for the sample; it is
limited to 16 calls/1 MiB aggregate response per action. Target state binds
search/risk/sample/mandatory digests and budgets. Each target owns one logical
bundle/root; pages/chunks are internal and CAS reuse never creates a bundle
chain. Bundle digest covers manifest/object/search/risk/mandatory components.
This coverage is transitive through body -> root -> final ref; no digest domain
contains itself.

The required coordination-gate-snapshot.v1 object is produced by the seal owner
above. It excludes review/final-acceptance/release/final-receipt state.
fabric-receipt.json is never a bundle input and cannot advance/stale the basis.

Target preparation is a durable daemon job. The public acceptance transaction
authenticates the current chair; checks the exact zero/current target sentinel,
task, eligible manifest row and persisted four-slot capability availability;
runs command replay and active semantic-digest join/conflict; increments the
run's preparation/target/bundle high-water row; inserts one immutable
`prepared` row with every database precondition and accepted-receipt digest;
and returns. It performs no Git, evidence, CAS-store, provider or network I/O.
The operation therefore cannot spend the public 30-second deadline building a
64-MiB closure. A missing slot capability fails
`CERTIFYING_REVIEW_CAPABILITY_UNAVAILABLE` before preparation insert and remains
visible in completion availability rows.

`semantic_input_digest` covers run, authenticated actor/principal and the full
closed request with command ID omitted only for active-job joining;
`full_input_digest` includes the complete request and owns command replay. One
partial unique index admits one active `prepared|building|built` row per run.
The same semantic digest under another command joins the existing accepted
receipt; a different digest conflicts before high-water update. Reserved target
and bundle generations are never reused after any terminal outcome.

A bounded FIFO worker claims `prepared` by incrementing
`worker_claim_generation` and assigning a leased daemon instance, then moves it
to `building`. It captures the eligible delivery artifact/lineage, sealed
review basis, adopted current chair/provider binding, activated adapter
contracts/profile schema, exact trusted Git base/head/index/worktree state and
all four predecessor head/attempt/open/repair tuples. Outside SQLite it uses the
fixed Git/evidence readers to enumerate every review-diff.v1 change, required
evidence and complete carried finding; reads exact bytes no-follow; builds all
objects/index/pages/root; writes create-exclusive CAS content; fsyncs and re-
reads. A verified complete build moves `building -> built` with immutable
digests. Build failure moves to failed. No filesystem work occurs while a write
transaction is open.

Phase B for `built` reauthenticates and equality-CASes every captured tuple and
all four heads. Preparation and lifecycle rotation serialize here. If same-
agent lifecycle adoption occurred during build, Phase B may create generation-
one against that adopted current binding only when adapter/contract/family/
model/profile/task/artifact/basis/source/bundle are unchanged; otherwise it
commits `chair-binding-changed`. Existing effect ambiguity keeps the row built
and fenced at Committing while route recovery proceeds; lifecycle adoption is
never blocked. A changed/new nonterminal predecessor tuple conflicts as
`predecessor-action-nonterminal`. Success
atomically inserts the reserved bundle metadata/coverage, supersedes the old
target, inserts one current immutable `review_completion_target`, generation-
one chair binding/head, resolved profile/slots and four generation-zero review
slot heads, then transitions `built -> succeeded` and stores the target ref.
The only other Phase-B outcomes are conflicted or failed; no partial target is
visible.

The only preparation edges are `prepared -> building`, `building -> built|
failed` and `built -> succeeded|conflicted|failed`. State, terminal code/evidence
and target-ref triggers enforce the exact Spec 01 union. Conflicts are only
target-generation, chair-binding, task-or-authority, delivery-basis, repository-
source, profile, predecessor-head or predecessor-action change. Failures are
only bundle-too-large, unsupported-repository-state, source-read-failed,
content-integrity-failed or certifying-capability-unavailable. Succeeded carries
only target ref; nonterminal carries null.
Public
`review-target-preparation.read` is an indexed read of this row and accepted
receipt. It maps the three nonterminal states to Preparing, Building and
Committing and exposes no invented percentage. Progress is required as either
phase-only or finite verified-build-items. A finite plan writes immutable
plan-digest/total once; completed may only increase after the corresponding
item fsync and re-read and must equal total before built. Triggers reject
downgrade, total/plan change, regression or completed above total.

ReviewTargetPreparationRecoveryService runs before private-CAS garbage
collection and generic jobs. It reclaims an expired worker lease by advancing
the same claim generation. Prepared restarts at build; building validates and
reuses only exact digest-verified CAS bytes; built reruns only Phase B. It never
allocates another generation or creates a second target. CAS GC excludes every
digest reachable from an active preparation, target or bundle; unreferenced
bytes become eligible only after the owning preparation is terminal. PID/daemon
restart and fault injection at every write/fsync/state/Phase-B statement prove
one resumable row or one complete target.

`review_completion_targets` stores exact preparation/target generation,
review-subject digest, task,
delivery artifact/lineage, review basis/source state, bundle/coverage/manifest,
resolved profile/schema, bundle-search/risk-map and mandatory-read-set/count/
byte digests plus initial chair-binding digest. It does not duplicate mutable
chair generations. A partial unique index permits one current row per run.
Drift never updates it; reads derive stale. The only current-to-superseded
update occurs in successful successor preparation Phase B. Every operation invokes the same pure
currency predicate and active binding join. Reads derive stale-target without a
write/global-revision advance. A new dispatch or optional annotation rejects
stale currency. The action-bound terminal transaction still settles and
advances its reserved head. Only a newly succeeded preparation supersedes the
old target.

`review_target_chair_bindings` is insert-only. Generation one is created with
the target; later generations require the exact prior binding foreign key and
one finalized adopted `lifecycle_rotation_custody_revisions` row for the same
agent whose head points to that exact journal revision.
Triggers require contiguous generation and equality of adapter, contract,
family, model, profile, task, artifact, review basis, repository source and
bundle. They require the exact predecessor binding digest and certification-cut
custody/row/digest/sequence; the cut custody must equal the binding's adopting
`(run_id,agent_id,lifecycle_custody_id,lifecycle_custody_revision)` ref.
Generation one has all predecessor/cut/custody fields
null; every successor has all of them nonnull. They permit only principal, chair-lease, provider-session, bridge and
route-receipt generations to advance. `review_target_chair_binding_heads` is
the sole active pointer and advances by one CAS. A different agent or any
non-generation binding change cannot insert and leaves the target stale.

`review_target_rebind_receipts` is insert-only and unique by run/target/exact
agent/custody/revision ref plus command replay. It stores the exact Spec 01 receipt and
digest, prior/new binding generations/digests, immutable subject/bundle/profile
digests and before/after head/open/repair set digests. Both tables equality-copy
the exact target `review_subject_digest`; triggers reject any receipt or binding
whose immutable target fields do not reproduce that digest. The public
`review-target.rebind` transaction authenticates the current chair, derives the
target/custody/current-binding tuples, rechecks every immutable subject field
and four head/open/repair tuples, then inserts the successor binding, advances
the pointer and records the receipt atomically. It performs no router/provider/
portal/lookup I/O. The true-chair adoption transaction invokes this same store
mutation directly; an exact later command joins the existing custody-keyed
receipt. Wrong or non-adopted custody, crossed agent/generation/subject, stale
pointer/head, duplicate generation or changed replay changes nothing.

Every successor binding, certification cut and rebind receipt equality-copies
the Spec 01 lifecycle review-decision digest and externally authenticated
receipt digest. They are inserted only inside the post-authority lifecycle apply
and composite-reference `lifecycle_review_authority_bindings`, which in turn
binds the exact immutable reservation, ordinal-two intent/authority receipt,
finalized custody revision and apply. Subject custody, adoption evidence,
decision, cut/null and linked recovery-loss decision byte-equal the reserved
rows. The separately verified scope/namespace checkpoint proves external
membership; a point read alone cannot. Missing authority/row, stale chain,
crossed receipt or verification failure is lifecycle integrity failure and
inserts no review row. The mutable lifecycle decision audit is corroboration
only.

Every certifying first terminal transaction increments
`review_terminal_sequence_high_water` and stores that stable sequence in the
terminal journal/result digest. True-chair lifecycle adoption reads that high-
water in its own serialization transaction, inserts the exact custody-keyed certification cut
and either appends/activates a same-subject successor binding or leaves the
target read-derived stale. Review state never rejects or rolls back adoption.
A later stale adoption may append another cut for the same target/predecessor
because the exact agent/custody/revision ref, not predecessor generation, is the primary identity; the
unique cut digest and exact successor foreign key prevent reuse across custody.
Old-binding prepared/zero-dispatch attempts fail their worker currency check and
the route-recovery owner terminalises them no-effect once; dispatched/accepted/
ambiguous attempts recover normally. Evidence certifies through a successor
only when its terminal sequence is at or before the first successor cut and the
complete binding chain/digests are contiguous. Later terminals remain adverse
and permanently noncertifying. No target/head/evidence/finding row is cloned or
rewritten. Broken chains/cuts or multiple active pointers are integrity-failure.

Evidence stores only `certificationBasisAtTerminal` and its immutable receipt
digest. Read/list, operator projection and completion derive a separate
`currentCertificationBasis` from the active binding chain. Rotation may change
that live arm from active-binding to predecessor-cut without rewriting evidence;
a terminal after the first successor cut uses the exact post-cut arm and is
permanently noncertifying. A broken/missing chain yields null live basis plus the
existing integrity/stale blocker, never a fabricated predecessor-cut.

`review_finding_capacity_reservations` is a pre-router child of the pair
preflight, not of `provider_actions`. Its closed state is
`preflight|attached|released|settled`. The pre-router row binds the global pair,
run, target, closed slot and owner/reservation digests with null attempt
generation. After a successful resolver result, the one binding admission/
dispatch transaction from Spec 01 CAS-increments the slot head, assigns that
positive attempt to the reservation exactly once, inserts action and route, and
moves the reservation from `preflight` to `attached`; none can commit alone.
That null-to-positive attach is the only tuple finalisation. Thereafter run,
target, slot, attempt and digest are immutable. Resolver/admission failure moves
the reservation to `released` with attempt still null, returns its
physical capacity exactly once and creates no provider action, route or budget
row. Exact retry observes the released route failure; a new action pair may
reserve normally. Startup releases only expired preflight rows after proving no
matching action/route, while attached rows remain owned by terminal/recovery
settlement. Released/settled rows are immutable audit/replay history and consume
zero live capacity. Thus only successful dispatch consumes a contiguous attempt
generation, exactly as Spec 01 sections 32.19.4 and 32.19.6 require.
After attach, every terminal branch writes only `settled`, including the
`proved-no-effect-release` disposition: that disposition returns the complete
physical capacity but does not use the pre-admission `released` state. `released`
is reachable only from `preflight` with null attempt generation; no attached
path nulls or changes its attempt custody.

The append-only availability revision/head tables are the safe current
activation projection keyed by the complete project-session/profile/schema/
target-family/slot/adapter/contract/family/model/source/runtime/platform tuple.
Each revision is available with null reason or unavailable with
exactly one of `adapter-inactive`, `contract-mismatch`, `confinement-unproved`,
`portal-unavailable` or `provider-runtime-unavailable`. Adapter activation,
canary or contract change appends a revision, CAS-advances its head and global revision in one
transaction. Target-preparation admission and completion use this same table;
neither infers capability from a missing target or raw adapter error.

review_profile_snapshots and review_profile_slots normalise the exact four-slot
target snapshot. The checked-in schema/profile catalogue digest is verified at
startup. Slot rows byte-match resolvedReviewProfileSlotV1: adapter class/ID/
contract, family/model, requested/tagged resolved effort, aliases,
source/runtime/platform identity, provider/internal-step/read ceilings and explicit
reviewer-family relation. Publisher eligibility remains the separate
proved lineage/family-equals-target predicate. The baseline
requires exactly native, other-primary, cursor-grok and agy-gemini and enforces
the exact Spec 01 mapping. Native is exempt; all three external slots require
reviewer family distinct from target-chair family. No publisher-independence
column/blocker exists. Missing or extra slots prevent target commit.

The action-pair-only portal authenticates an ephemeral capability hash bound to
adapter/action pair, target, bundle, coverage digest and expiry. Its MCP server name is
agent-fabric-review-bundle and its only tools are review_bundle_read and
review_bundle_search. initialize/initialized, ping and tools/list/call are
allowed. resources/list, resources/templates/list and prompts/list return exact
empty arrays; resource read/subscription, prompts/get and sampling/roots/
completion/elicitation/logging are denied. It reads only committed root/page/
object/chunk joins and verifies their complete digest chain.

Read payloads use RFC 4648 padded base64. Raw root/page/chunk bytes are at most
65,536 and encoded payload is at most 87,384 bytes. There is no independent
metadata allowance: generated closed response templates bind every field,
maximum value, escaping rule, JSON-RPC envelope and final LF and prove the
complete read response is at most 98,304 bytes. Requests are exactly one UTF-8
JSON object plus LF, with no BOM, CRLF, batch, duplicate key or trailing bytes.
ID is integer `0..2147483647` or an ASCII string matching
`^[A-Za-z0-9._:-]{1,64}$`; response is exact RFC 8785 JCS plus LF.

Preparation reserves every mandatory response using the maximum 64-byte string
ID sentinel, then materialises it after bundle digest construction. Runtime
journal/ledgers debit the exact complete response for the admitted actual ID.
Direct dynamic-tool transports use the identical equivalent JSON-RPC charge and
Fabric-assigned action-local integer ID when no provider ID is exposed. Search
retains its separate 65,536-byte response limit. Generated exact-bound fixtures
cover both ID arms, binary/page/root/empty/error/search responses and reject any
runtime byte count above reservation before activation.

The read journal owns separate nonfungible mandatory and exploration counters.
The first response for each mandatory digest debits mandatory; duplicate/
optional reads, search and authenticated malformed/out-of-bundle calls debit
exploration. Direct mode reserves mandatory <=80 calls/6 MiB plus 32 calls/4
MiB exploration; helper mode reserves mandatory plus 48 calls/4 MiB. Both have
a 10 MiB combined wire-byte ceiling. Search is
inside exploration and is bounded to 16 calls/1 MiB aggregate plus 256 query
bytes, 100 results, 65,536 result bytes and 250 ms CPU per call. Each row stores
subledger/ordinal/tool/request/result/status/exact canonical response bytes.
Unique root/page/chunk responses alone satisfy mandatory; call order is free.
Portal-helper stream/hook events join the same journal. The portal resolves no
caller path or filesystem locator. Response/prompt bounds apply before adapter
I/O.
