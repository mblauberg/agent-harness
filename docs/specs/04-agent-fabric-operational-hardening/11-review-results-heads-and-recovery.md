
#### 9.21.4 Terminal results and linear evidence heads

provider_review_results is insert-only and has one closed discriminator:

- safe-answer: exact provider-answer digest/length, safe canonical
  review-result.v1, result/finding/resolved-finding digests, classifier and
  secret-selector identity;
- unusable-answer: exact provider-answer digest/length, safety identity and no
  public text/result/findings; or
- provider-terminal-failure: exactly one of max-turns-exhausted,
  provider-rejected, terminal-no-answer or adapter-terminal-failure code,
  private normalised diagnostic digest, no answer digest and no public error.

The joined public action terminal discriminator additionally admits
terminal-no-effect, integrity-terminal and retired-unknown from the route-
integrity owner. These never create provider_review_evidence. ambiguous remains
strictly nonterminal; a terminal row cannot also project ambiguous.

A terminal failure is terminal, not ambiguous. Every proved-effect terminal --
safe answer, unusable answer or provider-terminal-failure -- settles complete
authenticated usage exactly. If usage is absent or partial, the same
transaction conservatively consumes the full remaining spendable reservation.
Each releases terminal concurrency capacity. Proved no-effect releases the
reservation; ambiguity retains it. No retry or redispatch occurs. Raw answers,
raw errors, diagnostics and adapter results stay private.
result_digest uses the exact six-arm Spec 01 canonical domain, including the
stable run terminal sequence and coverage-summary digest where applicable, and
excludes usage. Generated golden vectors reject generic terminal-state or
cross-arm fields.

A safe answer becomes certifying only when the trusted journal covers the
mandatory set including every deterministic risk sample and hashes to
read_coverage_digest.
With insufficient reads, syntactic CLEAN is publicly UNUSABLE and resolves
nothing; safely parsed FINDINGS stays visible FINDINGS/noncertifying, accepts no
resolution and retains all safe new findings. Raw unsafe output is UNUSABLE.
Provider text cannot attest consumption. The daemon
derives a manifest-complete-risk-directed gap summary with per-group total/read/
unread counts and unread-set digests; byteComplete is false unless every object
was fully read.

`review_slot_heads` is the sole linear current evidence owner. The generated
schema gives `provider_review_results` the candidate key
`UNIQUE(adapter_id,action_id,terminal_sequence,result_digest)`, routes the key
`UNIQUE(adapter_id,action_id,route_receipt_digest,
deployed_route_admission_digest)`, and observations the key
`UNIQUE(adapter_id,action_id,admission_digest,observation_digest)`. All tables
below are `STRICT`; evidence/identity rows deny UPDATE/DELETE.

~~~sql
provider_action_actual_route_identities(
  adapter_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  admission_digest TEXT NOT NULL,
  observation_digest TEXT NOT NULL,
  actual_route_identity_json TEXT NOT NULL,
  actual_route_identity_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(adapter_id,action_id),
  UNIQUE(adapter_id,action_id,admission_digest,observation_digest,
    actual_route_identity_digest),
  FOREIGN KEY(adapter_id,action_id,admission_digest,observation_digest)
    REFERENCES provider_action_route_observations(
      adapter_id,action_id,admission_digest,observation_digest)
)

provider_review_evidence(
  run_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  target_generation INTEGER NOT NULL CHECK(target_generation >= 1),
  slot TEXT NOT NULL CHECK(slot IN
    ('native','other-primary','cursor-grok','agy-gemini')),
  task_id TEXT NOT NULL,
  action_adapter_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  terminal_sequence INTEGER NOT NULL CHECK(terminal_sequence >= 1),
  terminal_kind TEXT NOT NULL CHECK(terminal_kind IN
    ('safe-answer','unusable-answer')),
  verdict TEXT NOT NULL CHECK(verdict IN ('CLEAN','FINDINGS','UNUSABLE')),
  answer_safety TEXT NOT NULL CHECK(answer_safety IN ('safe','unusable')),
  provider_answer_digest TEXT NOT NULL,
  terminal_result_digest TEXT NOT NULL,
  review_result_digest TEXT,
  terminal_input_digest TEXT NOT NULL,
  route_receipt_digest TEXT NOT NULL,
  route_admission_digest TEXT NOT NULL,
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
  capability_body_digest TEXT NOT NULL,
  executable_identity_digest TEXT NOT NULL,
  native_settings_schema_digest TEXT NOT NULL,
  authority_compiler_version TEXT NOT NULL,
  expected_authority_profile_policy_version TEXT NOT NULL,
  authority_profile_policy_version TEXT NOT NULL,
  route_observation_digest TEXT,
  actual_route_identity_digest TEXT,
  final_prompt_digest TEXT NOT NULL,
  endpoint_provider TEXT NOT NULL,
  provider_family TEXT NOT NULL,
  model TEXT NOT NULL,
  bundle_digest TEXT NOT NULL,
  coverage_digest TEXT NOT NULL,
  profile_digest TEXT NOT NULL,
  attempt_generation INTEGER NOT NULL CHECK(attempt_generation >= 1),
  prior_head_generation INTEGER NOT NULL CHECK(prior_head_generation >= 0),
  new_head_generation INTEGER NOT NULL CHECK(new_head_generation >= 1),
  prior_evidence_id TEXT,
  prior_open_finding_set_digest TEXT NOT NULL,
  reported_resolved_set_digest TEXT NOT NULL,
  accepted_resolved_set_digest TEXT NOT NULL,
  finding_set_digest TEXT NOT NULL,
  new_open_finding_set_digest TEXT NOT NULL,
  repair_required_finding_set_digest TEXT NOT NULL,
  finding_window_mode TEXT NOT NULL CHECK(finding_window_mode IN
    ('normal','resolution-only')),
  finding_capacity_reservation_digest TEXT NOT NULL,
  finding_window_digest TEXT NOT NULL,
  read_coverage_digest TEXT NOT NULL,
  coverage_summary_digest TEXT NOT NULL,
  reviewer_family_relation TEXT NOT NULL CHECK(reviewer_family_relation IN
    ('same-family-exempt','distinct-family-proved','same-family-forbidden',
      'family-unproved')),
  certification_basis_at_terminal_digest TEXT NOT NULL,
  mutation_receipt_json TEXT NOT NULL,
  mutation_receipt_digest TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(run_id,evidence_id),
  UNIQUE(action_adapter_id,action_id),
  UNIQUE(evidence_digest),
  UNIQUE(mutation_receipt_digest),
  UNIQUE(run_id,target_generation,slot,new_head_generation),
  UNIQUE(run_id,target_generation,slot,new_head_generation,evidence_id),
  CHECK(new_head_generation=prior_head_generation+1),
  CHECK((prior_head_generation=0)=(prior_evidence_id IS NULL)),
  CHECK((terminal_kind='safe-answer' AND answer_safety='safe' AND
      verdict IN ('CLEAN','FINDINGS') AND review_result_digest IS NOT NULL) OR
    (terminal_kind='unusable-answer' AND answer_safety='unusable' AND
      verdict='UNUSABLE' AND review_result_digest IS NULL)),
  CHECK(actual_route_identity_digest IS NULL OR
    route_observation_digest IS NOT NULL),
  CHECK(requested_authority_profile = 'review-readonly' AND
    effective_authority_profile = 'review-readonly'),
  CHECK(coordination_run_id = run_id),
  CHECK(expected_authority_profile_policy_version =
    authority_profile_policy_version),
  FOREIGN KEY(action_adapter_id,action_id,terminal_sequence,
      terminal_result_digest)
    REFERENCES provider_review_results(
      adapter_id,action_id,terminal_sequence,result_digest),
  FOREIGN KEY(action_adapter_id,action_id,route_receipt_digest,
      route_admission_digest)
    REFERENCES provider_action_routes(
      adapter_id,action_id,route_receipt_digest,
      deployed_route_admission_digest),
  FOREIGN KEY(action_adapter_id, action_id,
      authority_compilation_status,
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
  FOREIGN KEY(action_adapter_id,action_id,route_admission_digest,
      route_observation_digest)
    REFERENCES provider_action_route_observations(
      adapter_id,action_id,admission_digest,observation_digest),
  FOREIGN KEY(action_adapter_id,action_id,route_admission_digest,
      route_observation_digest,actual_route_identity_digest)
    REFERENCES provider_action_actual_route_identities(
      adapter_id,action_id,admission_digest,observation_digest,
      actual_route_identity_digest),
  FOREIGN KEY(action_adapter_id,action_id,run_id,target_generation,slot,
      attempt_generation,finding_capacity_reservation_digest)
    REFERENCES review_finding_capacity_reservations(
      adapter_id,action_id,run_id,target_generation,slot,
      attempt_generation,reservation_digest),
  FOREIGN KEY(run_id,target_generation,slot,prior_head_generation,
      prior_evidence_id)
    REFERENCES provider_review_evidence(
      run_id,target_generation,slot,new_head_generation,evidence_id),
  FOREIGN KEY(prior_open_finding_set_digest)
    REFERENCES review_finding_sets(finding_set_digest),
  FOREIGN KEY(reported_resolved_set_digest)
    REFERENCES review_finding_sets(finding_set_digest),
  FOREIGN KEY(accepted_resolved_set_digest)
    REFERENCES review_finding_sets(finding_set_digest),
  FOREIGN KEY(finding_set_digest)
    REFERENCES review_finding_sets(finding_set_digest),
  FOREIGN KEY(new_open_finding_set_digest)
    REFERENCES review_finding_sets(finding_set_digest),
  FOREIGN KEY(repair_required_finding_set_digest)
    REFERENCES review_finding_sets(finding_set_digest)
)

CREATE TRIGGER provider_review_evidence_receipt_ref_null_safe
BEFORE INSERT ON provider_review_evidence
WHEN NOT EXISTS (
  SELECT 1 FROM provider_action_routes r
  WHERE r.adapter_id = NEW.action_adapter_id AND
    r.action_id = NEW.action_id AND
    r.deployed_route_admission_digest = NEW.route_admission_digest AND
    r.authority_compilation_receipt_digest =
      NEW.authority_compilation_receipt_digest AND
    NEW.worktree_identity_digest IS r.worktree_identity_digest AND
    NEW.private_temp_root_identity_digest IS
      r.private_temp_root_identity_digest)
BEGIN SELECT RAISE(ABORT, 'authority-receipt-ref-mismatch'); END;

review_slot_heads(
  run_id TEXT NOT NULL,
  target_generation INTEGER NOT NULL CHECK(target_generation >= 1),
  slot TEXT NOT NULL CHECK(slot IN
    ('native','other-primary','cursor-grok','agy-gemini')),
  head_generation INTEGER NOT NULL CHECK(head_generation >= 0),
  head_evidence_id TEXT,
  latest_attempt_generation INTEGER NOT NULL
    CHECK(latest_attempt_generation >= 0),
  latest_action_adapter_id TEXT,
  latest_action_id TEXT,
  latest_action_state TEXT,
  open_finding_set_digest TEXT NOT NULL,
  repair_required_finding_set_digest TEXT NOT NULL,
  prior_target_generation INTEGER,
  prior_target_head_evidence_id TEXT,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(run_id,target_generation,slot),
  CHECK((head_generation=0 AND head_evidence_id IS NULL) OR
    (head_generation>=1 AND head_evidence_id IS NOT NULL)),
  CHECK((latest_attempt_generation=0 AND
      latest_action_adapter_id IS NULL AND latest_action_id IS NULL AND
      latest_action_state IS NULL) OR
    (latest_attempt_generation>=1 AND
      latest_action_adapter_id IS NOT NULL AND latest_action_id IS NOT NULL AND
      latest_action_state IS NOT NULL)),
  FOREIGN KEY(run_id,target_generation,slot,head_generation,
      head_evidence_id)
    REFERENCES provider_review_evidence(
      run_id,target_generation,slot,new_head_generation,evidence_id),
  FOREIGN KEY(latest_action_adapter_id,latest_action_id)
    REFERENCES provider_actions(adapter_id,action_id),
  FOREIGN KEY(open_finding_set_digest)
    REFERENCES review_finding_sets(finding_set_digest),
  FOREIGN KEY(repair_required_finding_set_digest)
    REFERENCES review_finding_sets(finding_set_digest)
)
~~~

Target creation inserts exactly four rows. It carries forward each predecessor
slot's complete safe open records and repair-required sets, but no predecessor
evidence becomes current for the new target. Head and attempt generations are
contiguous. Canonical paged set roots are complete/sorted/unique/digest-valid. A head evidence
foreign key matches the same run/target/slot/generation.

`provider_review_evidence` includes target/slot, prior and new head generations,
prior evidence, complete prior open set, separately stored
provider-reported-resolved and daemon-accepted-resolved prior sets, current
finding set, complete new open set,
repair-required set, finding-window reservation, terminal sequence,
certification-basis-at-terminal digest, canonical action pair/result/route/bundle/coverage/profile/
chair-binding, the exact admitted read-only authority-compilation ref,
`route_observation_digest`, nullable
`actual_route_identity_digest` and safe reviewer-family-relation/read-coverage
fields. The actual digest is nonnull only for a closed proved endpoint-provider/
family/model object bound to admission and observation. Profile/admission or
other observed-field inequality retains that digest as mismatch evidence; its
absence/mismatch blocker and resolution-denial outcome are immutable. It also stores the exact
task, answer/result safety digests and final-prompt route join required by
reviewEvidenceReadV1. `evidence_json` and the byte-validated closed
`mutation_receipt_json` equality-copy that complete route ref; the latter
recomputes `mutation_receipt_digest`. Evidence terminal/completion projections
derive the same ref from this immutable route/evidence join; a provider-failure
projection derives it from the immutable route when one exists. Neither can
synthesize or cross it. It contains no currency column. The separate actual-route
identity row exists only after the closed observation proves endpoint provider,
family and model; presence proves observation, not equality with admission or
profile. Generated code byte/JCS/digest-validates the identity before insert.

`fabric.v1.review-finding-page.read` joins an authenticated session/run to an
authorised evidence/completion/receipt finding-set root, then equality-checks
the requested page membership and digest before returning its complete safe
members plus the next ordered page digest. It never accepts a bare globally
guessable page digest. Cross-set/orphan/missing/digest-mismatch rows fail with no
partial content. Receipt v2 materialises exactly every reachable finding page,
deduplicated and sorted by page digest, so all set refs are standalone-resolvable
and no unreferenced page is exported.

Dispatch CAS-increments attempt generation and reserves one exact
target/slot/head. The safe/UNUSABLE provider terminal transaction automatically
inserts evidence plus reviewEvidenceMutationReceiptV1 and CAS-advances that
head before exposing terminal result. There is no terminal-unrecorded state.
UNUSABLE resolves none. The daemon accepts reported resolutions only for a
safe, sufficient-read answer whose target/source/delivery/chair/profile remains
current and whose carried finding is eligible on this successor target. A
stale, insufficient-read or same-target repair-required result accepts none.
Every safe P0-P2 finding becomes repair-required automatically. The action-
bound terminal transaction is exempt from live dispatch/annotation currency
fences: it always settles and advances its reserved head before visibility,
even after currency drift. Such stale evidence is noncertifying and keeps all
safe new findings open for successor preparation. Provider failure,
no-effect/integrity/retired terminal states close only the attempt and create no
review evidence. A later attempt may then reserve the unchanged evidence head.
The receipt projector emits provider terminal failure from the terminal/result/
route joins with unchanged head/open/repair set digests and no evidence/new-head
fields.

Annotation is owned by separate append-only relations:

~~~sql
review_evidence_annotations(
  run_id, evidence_id, annotation_revision, prior_annotation_revision,
  command_id, chair_binding_generation, disposition, note,
  note_digest, annotation_digest, created_at,
  PRIMARY KEY(run_id, evidence_id, annotation_revision),
  UNIQUE(command_id)
)
review_evidence_annotation_heads(
  run_id, evidence_id, current_annotation_revision, revision,
  PRIMARY KEY(run_id, evidence_id),
  FOREIGN KEY(run_id, evidence_id, current_annotation_revision)
    REFERENCES review_evidence_annotations(
      run_id, evidence_id, annotation_revision)
)
~~~

Disposition CHECK is exactly `substantiated|unsubstantiated|duplicate|needs-
more-evidence`; note is inert UTF-8 at most 512 bytes. Rows are immutable,
revisions are contiguous and the head CAS gives one current projection.
`fabric.v1.review-evidence.annotate` writes only this relation against exact
evidence/result/head and active chair binding. It cannot create evidence or
change head/verdict/findings/repair/reviewer-family relation/currency/completion.
Exact replay returns its immutable receipt before live-chair check. Receipt v2
and completion queries never join either annotation table.
The dispatch command's original prepared/dispatched receipt is immutable and
never gains terminal fields on replay. Terminalisation has a separate internal
action-pair/target/slot/attempt idempotency journal and stores the canonical terminal-
input digest over terminal kind, private answer/adapter-result digests,
authenticated usage and read-coverage journal. Exact duplicate returns the
stored terminal projection. Changed live-callback/lookup input appends an
integrity quarantine, never overwrites result/evidence/head/settlement and makes
completion emit integrity-failure. provider-action.read exposes the terminal
result and automatic mutation receipt. Neither receipt contains currency.

A first or second FINDINGS action therefore always progresses linearly. A
repaired target carries each prior finding's full safe content and origin
action/result as mandatory bundle evidence, then permits CLEAN to close it.
Target preparation Phase B rejects any predecessor nonterminal action and cannot commit
until every safe/UNUSABLE terminal has atomically reached its head. No source
change can launder a late finding.

An ambiguous/awaiting-human-retire attempt remains nonterminal and owns its
target/slot/head/reservation. It blocks sibling dispatch, target reprepare/
supersession and review/run acceptance or close until proved terminal recovery
or confirmed retirement. This freezes budget and gates review/liveness.

Read/list responses join immutable evidence to a freshly derived
review_evidence_currency value. Exact command replay never performs that join.
Operator Evidence row/detail uses the exact operatorReviewEvidenceRowV1 union
under operator project/session/run scope. Its view joins task/action pair, terminal
kind/safety/failure code, answer/result, route/final-prompt, adapter/family/
model, bundle/coverage, severity/open counts, reviewer-family relation, active
chair binding and the one current annotation disposition/revision/digest plus
safe detail fields without raw content.

#### 9.21.5 Completion and deterministic projection

ReviewCompletionReducer first reads the persisted required-slot availability.
Any false slot returns `certifying-review-capability-unavailable` plus exact
profile-ordered `unavailableSlots[]`, even when no target exists. Finding-
capacity exhaustion has the next target-wide branch and empty slots. Otherwise it
runs target currency and contiguous active-chair-binding checks, then reads one
current target, one resolved four-slot profile and exactly four slot heads.
It never scans for an unsuperseded latest row. For each head it validates the
latest action-pair/evidence chain, target/bundle/route/active-chair-binding/profile joins,
reviewer-family relation and complete open-finding set.
Its query columns map one-for-one to reviewCompletionV1: target chair/artifact/
lineage/bundle/root/coverage/risk/mandatory/profile digests and, per slot, head/
attempt/action-pair/evidence/verdict/result/route, resolved adapter/family/model,
read coverage, reviewer-family relation, certifying state, complete open
records and ordered blockers.

It emits only the ordered closed blockers in Spec 01. open-findings is the sole
finding blocker. A proved no-answer/max-turn terminal result emits
provider-terminal-failure; terminal no-effect and human-retired unknown emit
their exact blockers; route-integrity covers a terminal but unverifiable route
chain. ambiguous-action is reserved for unproved provider effect/outcome.
Missing head evidence emits the slot code only for a structurally valid head
whose current action should own evidence. Zero/multiple/no trustworthy targets
use target-null integrity. A trustworthy target with broken chair binding,
profile/head cardinality, CAS chain or immutable join uses target-present
integrity: immutable target fields remain exact, chair/profile are null and
slots empty. Missing profile uses its own arm. With a valid structure exactly
four rows exist; stale-target is top-level only. Top and slot blocker enums are
disjoint, `superseded` exists only in historical currency, and a terminal
failure row projects unchanged head/open/repair sets with evidence null.
Generated truth-table tests enumerate every arm/cause and reject duplication.

The operator System/Evidence projection and agent completion read call this
same reducer. Mutation receipts do not. fabric-receipt.json exports only closed
safe route, target, bundle/coverage/profile, slot-head, evidence and recovery
digests through exact `reviewCompletion`, `providerRoutes`, `providerReviews`
and `routeIntegrityRecoveries` codecs in Spec 01 section 19. It contains no raw
answer/error, private diagnostics, bundle bytes, portal transcript, prompt,
secret HMAC, adapter result, usage or annotation. The generated standalone
Draft 2020-12 schema embeds literal local enums for objective-check kind,
provider failure/substitution code and every registry-closed operator value it
uses. It has no external resolver/dynamic catalogue;
an unknown future value rejects and raw provider-specific detail remains
private behind evidence digest.

#### 9.21.6 ProviderRouteIntegrityRecoveryService

route_integrity_recoveries is one-to-one with an affected certifying provider
action and is the only startup/ambiguity recovery owner for every certifying
action, whether its joins are intact or contradictory:

~~~sql
route_integrity_recoveries(
  run_id NOT NULL, adapter_id NOT NULL, action_id NOT NULL, task_id NOT NULL,
  route_ordinal NOT NULL CHECK(route_ordinal >= 1),
  target_generation NOT NULL CHECK(target_generation >= 1),
  slot NOT NULL CHECK(slot IN
    ('native','other-primary','cursor-grok','agy-gemini')),
  attempt_generation NOT NULL CHECK(attempt_generation >= 1),
  recovery_generation, owner_daemon_generation,
  state, reason, terminal_disposition,
  reservation_digest NOT NULL,
  route_state, route_receipt_digest, recovery_evidence_digest,
  lookup_state, lookup_evidence_digest, settlement_digest,
  created_at, updated_at,
  PRIMARY KEY(adapter_id, action_id),
  FOREIGN KEY(adapter_id, action_id, run_id, task_id, route_ordinal)
    REFERENCES provider_actions(
      adapter_id, action_id, run_id, task_id, route_ordinal),
  FOREIGN KEY(adapter_id, action_id, run_id, target_generation, slot,
      attempt_generation, reservation_digest)
    REFERENCES review_finding_capacity_reservations(
      adapter_id, action_id, run_id, target_generation, slot,
      attempt_generation, reservation_digest)
)
~~~

State is detected, inspecting, terminal-proved-no-effect,
terminal-proved-usage, awaiting-human-retire or terminal-retired-unknown. The
row joins the exact daemon-global action pair, run and reservation digest; no
second free-form reservation identifier exists.
Its task/ordinal/target/slot/attempt tuple is daemon-derived at insert from the
affected certifying action's immutable action/reservation/head custody and never
changes; baseline triggers reject any tuple, pair, run or digest mutation. The
displayed composite foreign keys, not mapper prose, bind both custody owners; this
tuple remains trustworthy when the route row itself is missing or integrity-
failed. It supplies the existing public recovery read and scoped route-list
filters without reconstructing route bytes.
reason and terminal
disposition use the exact closed receipt-v2 enums. lookup_state is not-
attempted, in-flight or completed, with evidence digest non-null exactly for
completed. Nonterminal states have null disposition/settlement; proved-no-
effect, proved-usage and retired-unknown use their exact receipt-v2 disposition
arm and a non-null settlement digest. Insert fences further provider I/O,
marks the action noncertifying while unresolved and freezes only that
reservation's dimensions. All certifying route/action rows are excluded from
generic startup recovery and prepared-action re-enqueue.

The indexed public read by scoped canonical pair returns the exact Spec 01
providerRouteIntegrityRecoveryProjectionV1, including target/slot/attempt,
recovery generation/state/reason, reservation digest, route/lookup/settlement/
evidence fields and derived retirement eligibility. Operator Evidence emits its
closed recovery-action arm. Receipt recovery rows are watermark audit only and
are never accepted as mutation authority.

`route_state` is exactly present, missing or integrity-failed. Present requires
the immutable route-receipt digest and an exact join to provider_action_routes;
missing/integrity-failed require that digest null and a non-null safe recovery-
evidence digest. The service owns that discriminator and evidence atomically;
no reader, receipt exporter or Console projection may infer or reconstruct a
route from provider, action, bundle or prompt remnants.

The service runs before generic provider recovery. Prepared with durable
zero-dispatch proof returns the full reservation, writes `settled`, and
terminalises no-effect.
Every dispatched/accepted/ambiguous state permits at most one bounded pair-keyed
lookup when supported. Exact safe/unusable/failure terminal input enters the
ordinary action-bound terminaliser; complete authenticated usage settles
exactly and absent/partial usage charges the remaining spendable reservation.
Authenticated closed no-effect returns full capacity under `settled`. A proved effect with an unverifiable
binding conservatively settles as integrity-terminal. Absent, timeout,
malformed, conflict or unavailable lookup enters awaiting-human-retire and
retains the reservation. No branch reconstructs route/bundle/prompt,
dispatches, retries or creates evidence outside the ordinary valid-answer
terminaliser.

provider-route-integrity-retire is a closed typed operator-action intent. It
binds the exact adapter/action pair, recovery generation, current state and reservation
digest; requires external-effect capability, one matching consequential gate
and independently attested direct-human confirmation; and has no provider port.
Confirmed Commit consumes the full remaining spendable reservation, releases
only terminal concurrency capacity, records terminal-retired-unknown and
terminalises the action. Wrong/stale authority, gate, generation, digest or
confirmation changes nothing. The human result is labelled retired-unknown,
never no-effect or provider-failed.

Preview/Commit load the live row and require exactly
`state=awaiting-human-retire` plus the same pair, recovery generation and
reservation digest. The Console cannot construct this action from completion or
receipt data and shows it only when the live projection says eligible.

Each terminal branch atomically settles the reservation, clears its
dimension-freeze contribution, terminalises the action as noncertifying,
persists recovery evidence and exits run recovery state when no other blocker
exists. After its bounded inspection deadline, a nonterminal row must be
awaiting-human-retire; every other nonterminal state is an invariant failure.
If store corruption prevents identifying the
reservation, startup stops mutations under the existing store-corruption
contract rather than leaving a normal route freeze.

`GenericProviderRouteRecoveryService` is the sole owner for each remaining
task-bound answer-bearing action after `LifecycleRotationRecoveryService`,
launch-custody recovery and `ProviderRouteIntegrityRecoveryService` have
positively excluded their rows. The owner selector is total and disjoint over
the immutable action-pair custody; failure to prove an exclusion is integrity
failure, never generic fall-through. The generic service keys the existing
provider-action recovery journal and evidence by exact adapter/action pair, run
and task. It never writes `route_integrity_recoveries`, invents target, slot,
attempt or reservation identity, reconstructs route bytes, reroutes or
redispatches an ambiguous action. Missing and integrity-failed generic route
reads accept only that exact live pair-keyed evidence; certifying filters accept
only the certifying owner. No action matches two owner queries.

#### 9.21.7 Verification

Deterministic verification covers:

- exact publication-time principal/bridge/custody/session/adapter/model/route
  joins and target eligibility for each source/publisher kind;
- complete base/head changed-file and required-evidence coverage, all bundle
  limits/digests/chunk chains, create-exclusive collision handling and every
  before/during/phase-B source or delivery mutation; review-diff.v1 exact
  status/mode/binary/rename/path/order/digest fixtures bind one immutable full-
  ID range, the dynamic final target computes its own values and 64 MiB+1 fails;
- preparation acceptance/read, semantic join/conflict, high-water nonreuse,
  every durable state edge, worker-lease restart and CAS/Phase-B crash point,
  proving one accepted job becomes at most one complete target; the first poll
  uses only the accepted preparation ID and exact session/run scope;
- target/profile creation, exact four-slot reviewer-family mapping,
  same-agent binding continuity and target supersession after source or every
  unrebindable chair/family/adapter/contract/model/profile advance; public
  rebind execution/replay, non-adopted/crossed/pointer-head negatives and
  sequential no-ABA binding chains preserve target/evidence/finding identity;
  review-subject JCS golden/permutation/extra/omission/equality-copy fixtures
  fail every crossed nested bundle/profile field;
- contract-bound Claude/Codex/Cursor/Agy exact server/tool/helper/broker sandbox
  canaries, peer credentials, stopped-child persistence, exact provider-closure
  derivation/substitution negatives, supervisor-FD-3 isolation and stub-FD-4–
  FD-7 closure,
  daemon/supervisor/startup/PID-reuse cleanup, empty list probes, denied extra
  methods/effects and no cross-bundle portal read;
- structural Python/TypeScript route-schema parity, post-router admission
  checks, process-tree kill, daemon-global pair single-flight, requested/
  resolved adapter equality, cross-run conflict, different-adapter same-ID
  allowance, changed concurrent input and replay without router;
- current-chair certifying dispatch and ordinary non-review authority parity;
- safe CLEAN/FINDINGS, UNUSABLE, proved max-turn/no-answer/provider failure and
  true ambiguity, including exact or conservative settlement for every proved-
  effect terminal, no-effect release, ambiguity retention, stale in-flight
  evidence, insufficient CLEAN/FINDINGS classification and private error scans;
- first/second FINDINGS, UNUSABLE, concurrent head forks, full open-set
  carry-forward, repaired-target CLEAN, immutable mutation replay and live read
  currency;
- every reducer top-level/slot blocker union, operator/agent projection and
  standalone resolver-free receipt-v2 literal catalogues/sort/equality/history/
  count/JCS hash, including capability-unavailable-before-target; append-only
  annotation vocabulary/current projection and annotation-free completion/
  receipt; and
- every certifying-action recovery branch, bounded lookup, conservative
  consumption, direct-human retirement, liveness exit, generic-recovery
  exclusion and absence of redispatch/reconstruction. Direct-SQL shape tests
  prove digest-only reservation custody and reject any free-form
  `reservation_id` column or mapper input.

The current catalogue explicitly rejects provider_review_packets,
model_routing_receipts, cross_family_reviews, modelRoutingReceipts,
crossFamilyReviews, recordModelRoutingEvidence and
recordCrossFamilyReviewEvidence and fabric.v1.review-evidence.record.
