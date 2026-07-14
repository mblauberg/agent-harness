# Pair-Codex H2b bounded verification

Verified at committed `main@42da7ee1892b0757c0851e550cbb9fe8b1235f5d`.
This pass tests only findings 1, 2, 4, 5, 6, 7, 9-residual and 10. It does not
re-open Q1-Q4 or findings 3 and 8.

## Finding 1 — PARTIAL

The prose repair imports the accepted closed `AuthorityEnvelopeV2`, including
the approval/evidence digest, path and operation scopes, secrets, deployment,
irreversible-action, network, expiry and budget dimensions
(`25_AUTHORITY_V2_AND_CONTAINMENT.md:19-78`). WP0 now adopts or supersedes the
active tranche, and WP3 makes the mapping golden, dimension negatives, real-
provider containment receipt and direct V2 cutover explicit gates
(`09_WORK_PACKAGES_AND_SEQUENCE.md:33-53,157-214`).

The executable WorkItem schema is still incomplete. Its
`authority_envelope_v2_delivery_projection` calls itself “Field-for-field” but
does not require or define `budget` inside `authority`
(`schemas/work-item.schema.json:62-86,213-217`). Instead, `budget` is a sibling
WorkItem property (`schemas/work-item.schema.json:456-478`). The accepted V2
shape has `budget` as a required envelope member and maps delivery `budget`
directly to Fabric V2 `budget`
(`25_AUTHORITY_V2_AND_CONTAINMENT.md:53-55,82-93,115-116`). Put the budget map
inside the required authority projection; retain a WorkItem-level budget only
as an explicitly derived or separately scoped field.

## Finding 2 — SATISFIED

All four repaired owners now state the same dependency direction: the
`delivery-run` receipt, delivery profiles and delivery validator are the
canonical cross-domain lifecycle kernel; Fabric protocol/runtime own only
transport projections and explicit mappings
(`02_TARGET_ARCHITECTURE.md:74-79,230-248`;
`03_MINIMAL_CONTRACTS.md:5-13`;
`08_REPOSITORY_CHANGE_MAP.md:118-138,231-239,326-334`;
`09_WORK_PACKAGES_AND_SEQUENCE.md:99-108`). No residual text in those four files
makes Fabric the canonical lifecycle owner.

## Finding 4 — PARTIAL

The target review table is now expressly future-state and inert until one
atomic migration lands (`06_LOOP_AND_REVIEW_POLICY.md:104-150`). Section 08 also
adds the previously omitted four-slot config and `validate_delivery.py`
(`08_REPOSITORY_CHANGE_MAP.md:194-211`).

The claim that the list covers “every surface” is still false. It omits live
four-slot enforcement and ownership in at least:

- Specs 01 and 04 (`docs/specs/01-agent-fabric.md:7057-7138`;
  `docs/specs/04-agent-fabric-operational-hardening.md:3339-3348,5623-5627`);
- protocol completion logic (`runtime/agent-fabric-protocol/src/provider-review.ts:26-27,1188-1210,1232-1242,1266-1279`);
- the generated closed profile schema and its protocol regression test
  (`runtime/agent-fabric-protocol/schemas/spec05-four-slot-v1.schema.json:245-253`;
  `runtime/agent-fabric-protocol/tests/spec05-four-slot-profile.test.ts:5-11`);
- the canonical completion-domain four-slot check
  (`runtime/agent-fabric/src/review/canonical/domains.ts:249-255`);
- SQLite slot and ordinal constraints
  (`runtime/agent-fabric/migrations/0001-current-baseline.sql:5565-5571,5837-5843,5908-5913`); and
- the Spec 05 acceptance selector/catalogue that still requires the current
  four-family clean-review gate
  (`config/spec05-evidence-selector-registry.v1.json:40`;
  `config/spec05-delivery-requirements.v1.json:470-477`).

Unless those normative, wire, completion, persistence and acceptance-catalogue
surfaces are enumerated in the same migration, the pack permits a nominally
atomic policy change to leave incompatible enforcement behind.

## Finding 5 — PARTIAL

WorkItem now requires the ADR-0006 spec, approval and authority-envelope
digests, and all three supplied schemas require a five-value `retention_class`
(`schemas/work-item.schema.json:8-30`;
`schemas/decision-request.schema.json:8-32`;
`schemas/decision-delegation.schema.json:8-32`). Their examples validate.

Two gaps remain:

1. ADR-0007's exact fifth identifier is `durable knowledge`
   (`docs/adr/0007-retention-classes-then-governed-deletion.md:11-18`), and WP2
   repeats that exact spelling (`09_WORK_PACKAGES_AND_SEQUENCE.md:135-140`).
   Contract prose and every schema instead enforce `durable-knowledge`
   (`03_MINIMAL_CONTRACTS.md:21-27`; the three schema enums above); the WorkItem
   example also uses the hyphenated value
   (`schemas/examples/work-item.example.json:125`). AJV draft-2020-12 validation
   confirmed all three schemas reject `durable knowledge` and accept
   `durable-knowledge`.
2. “Every persisted contract” is not true. The persisted run-envelope example
   has no `retention_class` (`03_MINIMAL_CONTRACTS.md:33-88`), and the work-graph
   node contract omits it (`03_MINIMAL_CONTRACTS.md:176-198`) even though work
   graphs become durable for cross-session and recovery use
   (`02_TARGET_ARCHITECTURE.md:177-195`).

Use one exact ADR-ratified identifier set everywhere and add an explicit class
to the persisted run and durable work-graph contracts.

## Finding 6 — PARTIAL

The repair now names `ProviderSessionCoordinator`, `CommandJournal` and
`ExternalEffectService`, rejects greenfield scaffolding and supplies a genuine
residual-responsibility map (`08_REPOSITORY_CHANGE_MAP.md:243-296`).

Its first extraction is still internally mis-mapped. The declared first slice
is provider-payload admission plus capability/authority compilation
(`08_REPOSITORY_CHANGE_MAP.md:253-256`), matching ADR-0002's pure
`AuthorityCompiler` extraction (`docs/adr/0002-capability-compiled-execution-authority.md:26-34`).
But the next section labels coordinator concurrency queues, action ownership,
reconciliation and the later merged dispatch shape as the work “to move here
first as the admission and authority slice”
(`08_REPOSITORY_CHANGE_MAP.md:261-270`). Those are provider-session/action
responsibilities, not the pure authority compiler; the target architecture
itself keeps `authority/authority-compiler` separate from
`providers/provider-action-service` (`02_TARGET_ARCHITECTURE.md:217-228`). Map
the current `Fabric.#admitProviderPayload` callers and the pure compiler as the
first extraction, preserving their call order; leave the coordinator's
structural residuals for the later provider-action tranche.

## Finding 7 — REGRESSED

The repair moves a derivation into WP4, but makes it an intentionally incomplete
`ReviewPlan`. WP4 emits only checks, fresh-context review, input boundary and
repair ceiling, while explicitly deferring risk-shape classification and the
other-primary requirement to WP5
(`09_WORK_PACKAGES_AND_SEQUENCE.md:235-248`). The declared ReviewPlan contract
also requires `other-primary required?`, `specialist required?`, human
acceptance and re-review fields (`03_MINIMAL_CONTRACTS.md:263-279`), and the
current substantial+ other-primary gate remains binding until the Finding 4
migration lands (`HARNESS.md:78-90`; `06_LOOP_AND_REVIEW_POLICY.md:104-139`).

The old future dependency has therefore been replaced by a new contract/policy
contradiction: WP4 cannot derive and consume a valid current-policy ReviewPlan.
WP4 must emit every required ReviewPlan field under the binding present policy;
WP5 may later extend the inputs/calibration only through the atomic policy
migration.

## Finding 9-residual — SATISFIED

PS-017 through PS-020 now explicitly record the four residual decisions:
DecisionRequest/scope-delta semantics, conflict keys, adaptive PR topology and
canonical store identity (`15_DECISION_REGISTER.md:23-31,33-92`). Their
pending/proposed status is explicit rather than silently treated as ratified,
each has a named decision point, and the interim delegation rule is exactly
reversible, non-material change inside the approved outcome, risk and authority
envelope with material acceptance still human-gated
(`15_DECISION_REGISTER.md:41-49`). The WorkItem seed preserves conflict keys and
PR strategy for that decision (`schemas/work-item.schema.json:405-410,546-553`).

## Finding 10 — REGRESSED

The new adoption table is materially better than a zero-state template, but it
introduces contradictory programme state. WP0 says Lane B was already promoted
through PR #7 and must be recorded complete rather than re-adopted
(`09_WORK_PACKAGES_AND_SEQUENCE.md:51-53`). The new table instead maps Lane B to
WP0, carries it as unverified, and lists human PR-review merge as residual
(`18_IMPLEMENTATION_STATUS_TEMPLATE.md:38,57`). Commit `90a10f7` (“Merge pull
request #7”) is already an ancestor of `42da7ee`, so the residual is not current.

The table also does not fulfil WP0's own gate: WP0 requires a status, one named
owner, gate and evidence for every lane
(`09_WORK_PACKAGES_AND_SEQUENCE.md:35-49,70-77`), while the table has no status
column, substitutes an “Owner effort” for a named owner, and several evidence
cells contain no digest or `—` despite its rule that evidence must be digest-
bound (`18_IMPLEMENTATION_STATUS_TEMPLATE.md:24-48`). Finally, Lane A is labelled
“council-resolved” (`18_IMPLEMENTATION_STATUS_TEMPLATE.md:37`) even though WP0
says the D-021 gate-supersession must not be assumed while charter carry-over is
open (`09_WORK_PACKAGES_AND_SEQUENCE.md:55-68`). Reconcile Lane B to the actual
merged history, distinguish historical completion from current-head
reverification, and make every owner/evidence/gate cell satisfy the WP0 schema.

## New contradictions introduced by the repair

1. `03_MINIMAL_CONTRACTS.md:174` says the WorkItem schema “predates this
   section” and WP2 “must add” the digest and retention fields that are already
   present and required in `schemas/work-item.schema.json:21-29,440-478,555-558`.
2. The WorkItem authority projection claims to be field-for-field V2 while
   excluding V2's required budget member (Finding 1).
3. ADR/WP2 `durable knowledge` conflicts with `durable-knowledge` in contract
   prose, all three schemas and the WorkItem example (Finding 5).
4. The promise that every persisted contract is class-tagged conflicts with the
   run and durable work-graph shapes (Finding 5).
5. WP4's “minimum ReviewPlan” conflicts with the full ReviewPlan contract and
   the still-binding current review gate (Finding 7).
6. WP0's Lane B and D-021 instructions conflict with the new adoption table
   (Finding 10).

## Verification receipt

- Route requested and resolved: `gpt-5.6-sol`, `low`, `status=ok`, no
  substitution. Native collaboration exposes no independent per-agent
  effective-model receipt, so no stronger attestation is claimed.
- Three bounded read-only subagent slices ran; the chair rechecked every retained
  claim against the committed tree.
- All three JSON schemas compiled under AJV draft 2020-12 and their supplied
  examples passed; the retention spelling probe produced
  `durable knowledge=false`, `durable-knowledge=true` for each schema.
- No pack source, Git state or `.worktrees/` path was modified.

STATUS: complete
