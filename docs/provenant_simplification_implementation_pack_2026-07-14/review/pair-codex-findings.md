# Pair-Codex independent cross-family review

Reviewed against `main@1ddfe24` and the dirty live tree. This was a source-read-only
review. No P0 blocker was found, but the pack is not implementation-ready without
the P1 repairs below.

The assignment requested native subagents routed to `gpt-5.6-luna` at `xhigh`.
`scripts/model-route` resolved that requested route successfully, but the native
collaboration API exposed no per-agent model selector or effective-model receipt.
The fan-out was therefore native and independent, but its effective model family
is recorded as unknown rather than claimed as Luna.

## Verdicts

### Q1 — Accuracy: P1 corrections required

The snapshot-level baseline is substantially accurate. I independently confirmed
the pinned revision, 33 real skill directories, root workspace layout, Rust CI
matrix, read-only Codex/Claude/Fabric posture, lack of implemented active write
authority, the 7,401-line Fabric core, the three quoted spec sizes, machine-local
adapter compatibility data, and every pack-manifest SHA-256 digest.

The repository change map is nevertheless materially incomplete. It treats the
Fabric extraction as more greenfield than the accepted ADR and live seams permit;
it omits required migrations for surviving links into the directories scheduled
for deletion; and it does not map all current review-policy enforcement surfaces.
Findings 1, 4, 6, 7, and 8 are the required corrections.

### Q2 — Coherence: P1 repairs required

The thin-kernel direction is coherent, and the pack correctly rejects a universal
queue controller, a god manifest, premature cross-platform packaging, and Console
ownership of orchestration. Its execution contracts, sequencing, governance, and
policy activation do not yet reconcile accepted ADRs 0002, 0005, 0006, 0007, and
0008 or the active capability-profile programme. Findings 1–7 and 10 apply.

### Q3 — Supersession: fail as written; block deletion pending promotion

The old directories contain material that is still normatively referenced or is
more implementation-ready than the replacement pack. Promote the selected material,
record explicit accept/reject dispositions, repoint every live backlink, and only
then delete the remainder. Findings 8 and 9 identify the minimum preservation set.

### Q4 — Spec split: pass only as semantic re-authoring

Do not mechanically slice the monoliths. Repair and freeze the current semantics,
give every requirement and acceptance ID exactly one module owner, generate a
section/ID migration map, and replace each monolith atomically with a small family
manifest plus bounded modules. The concrete structure and migration boundaries
appear after the numbered findings.

## Numbered findings

### 1. P1 — The pack does not import the accepted authority contract or active tranche order

**Claim.** The proposed minimal request is not a sufficient replacement for the
accepted `AuthorityEnvelopeV2`, and the proposed work-package order bypasses the
active repair/freeze and capability-compiler sequence. This permits a parallel or
narrower authority contract and broad mutation before its containment proof.

**Evidence.** ADR 0002 requires a closed V2 envelope with approval/evidence binding,
secrets, deployment, irreversible-action and network dimensions, followed by an
atomic direct cutover
(`docs/adr/0002-capability-compiled-execution-authority.md:19-25,36-46`). The active
effort records the repair/freeze/spec-family prerequisite and the V2 → compiler →
pilot sequence (`docs/efforts/EFFORT-capability-profiles.md:22-42,53-96`). The pack
instead defines a thinner request and compiler result without importing V2
(`docs/provenant-simplification/03_MINIMAL_CONTRACTS.md:23-47,152-174`), starts
contract/write work in WP2–WP3, and defers the normative spec rewrite to WP6
(`docs/provenant-simplification/09_WORK_PACKAGES_AND_SEQUENCE.md:59-106,160-181`).
Its migration choices also make compatibility/reset optional where ADR 0002
requires direct cutover
(`docs/provenant-simplification/11_MIGRATION_AND_DELETION.md:34-49`).

**Suggested fix.** Make WP0 adopt or supersede every active lane explicitly. Import
the exact accepted V2 input/digest and dimensions into the minimal contracts; make
the mechanical delivery mapping, negative goldens, full containment receipt, and
direct V2 cutover WP3 acceptance gates. Finish the active repair/freeze prerequisite
before live protocol/runtime mutation.

### 2. P1 — Canonical lifecycle ownership remains ambiguous

**Claim.** The pack says it will preserve existing delivery-run ownership but also
places a lifecycle kernel and canonical run/review/effect/event/receipt schemas in
Fabric protocol/runtime. This risks two canonical lifecycle owners.

**Evidence.** The pack prohibits a second lifecycle/receipt and preserves delivery
ownership (`docs/provenant-simplification/03_MINIMAL_CONTRACTS.md:5-7`), but places
`lifecycle-kernel` in the runtime target
(`docs/provenant-simplification/02_TARGET_ARCHITECTURE.md:192-223`), makes `deliver`
a conditional facade
(`docs/provenant-simplification/08_REPOSITORY_CHANGE_MAP.md:117-129`), and assigns
canonical lifecycle-related schemas to `agent-fabric-protocol`
(`docs/provenant-simplification/08_REPOSITORY_CHANGE_MAP.md:203-213`). The live
constitution and ADR 0005 instead make `delivery-run`/`deliver` the neutral kernel
and require Fabric projection (`HARNESS.md:48-49`;
`docs/adr/0005-lifecycle-kernel-extends-delivery.md:9-22`).

**Suggested fix.** State one direction of dependency: delivery-run, delivery
profiles, and the delivery validator remain canonical; Fabric protocol owns only
Fabric-specific transport projections and explicit mappings. Remove any wording
that makes Fabric the canonical owner of cross-domain delivery lifecycle data.

### 3. P1 — The pack has not reconciled its human gates with the active human directive

**Claim.** The pack and active capability programme contain incompatible authority
models. Silently choosing either would either broaden LLM authority or add human
gates contrary to the current directive.

**Evidence.** The pack requires human decisions for one-way doors, risk downgrades,
unresolved acceptance, final acceptance, and stop conditions
(`docs/provenant-simplification/04_PROGRESSIVE_GOVERNANCE.md:57-65,79-87,140-153`;
`docs/provenant-simplification/09_WORK_PACKAGES_AND_SEQUENCE.md:226-235`). The active
directive makes PR review the sole human gate and delegates upstream adjudication
to its chair/council
(`docs/agent-harness-comprehensive-review/CHAIR-CHARTER.md:14-26,109-134`;
`docs/efforts/EFFORT-capability-profiles.md:172-192`). The Console effort still
requires human usability and final acceptance
(`docs/efforts/EFFORT-project-fabric-console.md:35-41`).

**Suggested fix.** Add a WP0 human adoption/supersession decision. Preserve the
charter's technical and safety boundaries, record which delegation rules survive,
and list the human gates for each active effort before any lane continues.

### 4. P1 — The target review policy is stated before its binding migration exists

**Claim.** Readers could apply the proposed lower review pressure before the current
HARNESS/Spec 05 profile, profile configuration, and validator enforcement have all
been amended and verified.

**Evidence.** ADR 0008 says current HARNESS and Spec 05 gates remain binding until
the coordinated amendments land
(`docs/adr/0008-review-pressure-risk-and-oracle-adjusted.md:3-5,30-33`). Current
HARNESS requires the other primary for substantial work (`HARNESS.md:78-90`), and
Spec 05 still requires its four slots
(`docs/specs/05-project-fabric-console.md:1042-1079`). The pack already presents the
weaker target as policy
(`docs/provenant-simplification/06_LOOP_AND_REVIEW_POLICY.md:102-127`) and proposes
removing blanket HARNESS rules
(`docs/provenant-simplification/08_REPOSITORY_CHANGE_MAP.md:30-35`), but its change
map omits `config/review-profiles/spec05-four-slot-v1.json` and the existing review
enforcement in `skills/deliver/scripts/validate_delivery.py`
(`docs/provenant-simplification/08_REPOSITORY_CHANGE_MAP.md:185-188,265-281`).

**Suggested fix.** Label all reduced review tables as future-state. Add one atomic,
effective-dated migration covering HARNESS, Spec 05, the review-profile config,
delivery profiles, validator logic, and regression fixtures. Keep the present gate
binding until that migration passes.

### 5. P1 — Persistent contracts violate accepted ADR 0006 and ADR 0007 minima

**Claim.** The proposed persistent objects lack mandatory provenance/authority
bindings and retention classification. Implementing them as written would create
durable state that immediately needs archaeological repair.

**Evidence.** ADR 0006 requires a backlog item to carry the spec/approval digest and
authority envelope (`docs/adr/0006-backlog-schema-first-store-pluggable.md:12-22`).
The proposed WorkItem lacks both explicit fields
(`docs/provenant-simplification/03_MINIMAL_CONTRACTS.md:90-115`). ADR 0007 requires
every new state object to be tagged immediately with one of five retention classes
(`docs/adr/0007-retention-classes-then-governed-deletion.md:11-18`), but Initiative,
WorkItem, CapabilityDecision, ReviewPlan, and receipt omit that classification
(`docs/provenant-simplification/03_MINIMAL_CONTRACTS.md:73-115,152-174,196-209,231-247`).

**Suggested fix.** Add canonical approval/spec digest and authority-envelope
identity to WorkItem. Add validated five-class `retention_class` semantics to every
persisted contract and refusal/default rules to WP2 acceptance. Preserve ADR 0007's
sequence: class-tag now; governed deletion machinery later.

### 6. P1 — The Fabric extraction map ignores the live accepted seams

**Claim.** The change map reads as a generic new-module extraction rather than
completion of existing seams, contrary to ADR 0003. That invites duplicate
scaffolding and an incorrect extraction order.

**Evidence.** ADR 0003 requires completing existing seams and rejects a
scaffolding-first decomposition
(`docs/adr/0003-modular-monolith-complete-existing-seams.md:7-25,34-40`). The pack's
generic target modules and extraction order omit live `ProviderSessionCoordinator`,
`CommandJournal`, and `ExternalEffectService`
(`docs/provenant-simplification/02_TARGET_ARCHITECTURE.md:192-223`;
`docs/provenant-simplification/08_REPOSITORY_CHANGE_MAP.md:217-235`). Those seams
exist at `runtime/agent-fabric/src/application/provider-session-coordinator.ts:103-108`,
`runtime/agent-fabric/src/application/command-journal.ts:41-48`, and
`runtime/agent-fabric/src/operator/external-effect-service.ts:75-93`, and are already
composed by `runtime/agent-fabric/src/core/fabric.ts:863-935`.

**Suggested fix.** Replace the greenfield-looking map with a residual-responsibility
map for each existing seam. Extract admission/authority first, then move only the
remaining responsibilities whose characterisation tests and callers are known.

### 7. P2 — WP4 consumes ReviewPlan derivation before WP5 implements it

**Claim.** The first vertical trace is not reproducible in the stated order.

**Evidence.** WP4 requires deriving and consuming a ReviewPlan
(`docs/provenant-simplification/09_WORK_PACKAGES_AND_SEQUENCE.md:108-137`), while
WP5 owns ReviewPlan derivation implementation
(`docs/provenant-simplification/09_WORK_PACKAGES_AND_SEQUENCE.md:139-158`).

**Suggested fix.** Move the minimum deterministic derivation needed for the trace
into WP4 (or earlier) and leave calibration/second-provider policy to WP5; otherwise
move the vertical trace after WP5.

### 8. P1 — Deleting the old directories now would break live authority routes and lose accepted detail

**Claim.** The proposed deletion is not yet a valid supersession. Surviving current
documents link into the comprehensive-review directory, and the replacement pack
does not contain the accepted V2 mapping, goldens, and containment matrix at the
same executable precision.

**Evidence.** Live links remain in `docs/adr/README.md:3-6`,
`docs/adr/0002-capability-compiled-execution-authority.md:48-54`,
`docs/efforts/EFFORT-capability-profiles.md:17-25,172-178`,
`docs/handoffs/HANDOFF-2026-07-13-capability-profiles-v2.md:5-14,73-82`, and
`docs/handoffs/HANDOFF-2026-07-13-project-fabric-console.md:290`. The old challenge
contains the closed V2 schema/delivery mapping, negative test plan, and real-provider
containment matrix
(`docs/agent-harness-comprehensive-review/challenges/codex-pair-round2.md:57-153,238-337`).
The replacement has conceptual authority fields and test categories only
(`docs/provenant-simplification/03_MINIMAL_CONTRACTS.md:23-47,152-174`;
`docs/provenant-simplification/07_SECURITY_AUTHORITY_AND_EFFECTS.md:152-172`).

**Suggested fix.** Promote the accepted closed schema, mechanical mapping, goldens,
containment matrix, and receipt/pass criteria into the new normative authority
module and conformance matrix. Repoint every live link and add a check that no
current document references either deletion candidate before removal.

### 9. P1 — Valuable governance and WorkItem semantics are omitted rather than dispositioned

**Claim.** The re-review directory contains implementable documentation governance,
decision semantics, and conflict/PR topology that the pack either gestures at or
omits. These need explicit promotion or rejection before it becomes the sole plan.

**Evidence.** The old documentation model defines one owner per claim, canonical
frontmatter, owner-based splitting, line/byte bounds, and deterministic checks
(`docs/provenant-re-review-2026-07-13/documentation-governance-model.md:3-18,65-108,138-170,307-327`),
with a machine-readable schema
(`docs/provenant-re-review-2026-07-13/proposals/schemas/document-frontmatter.schema.json:7-16,49-63,120-158`).
The pack only calls generically for normative versions, conformance links, and drift
checks (`docs/provenant-simplification/08_REPOSITORY_CHANGE_MAP.md:64-73,271-281`;
`docs/provenant-simplification/09_WORK_PACKAGES_AND_SEQUENCE.md:160-181`). The old
model also defines scope-delta/DecisionRequest semantics
(`docs/provenant-re-review-2026-07-13/issue-pr-autonomy-model.md:23-104,123-156`)
and WorkItem conflict keys plus adaptive PR topology
(`docs/provenant-re-review-2026-07-13/issue-pr-autonomy-model.md:205-270`;
`docs/provenant-re-review-2026-07-13/proposals/schemas/work-item.schema.json:7-23,128-141,201-276`).

**Suggested fix.** Promote a small project-document policy and deterministic
`check_spec_families`/`check-docs` gates. Separately disposition DecisionRequest,
conflict-key, store-identity, evidence-link, and PR-strategy semantics in a PS/ADR.
If decision delegation survives, constrain it to reversible non-material changes
inside the approved outcome, risk, and authority envelope; material acceptance
remains human-gated. Do not activate the deferred queue controller merely by
promoting its data semantics.

### 10. P1 — The programme status template resets rather than reconciles live work

**Claim.** The pack can be read as a replacement programme starting from zero,
despite live completed, active, red, and deferred lanes. This conflicts with the
kickoff's reconciliation promise and can repeat work or overwrite ownership.

**Evidence.** The kickoff requires reconciliation with active efforts and accepted
ADRs (`docs/provenant_simplification_implementation_pack_2026-07-14/README.md:15-17`).
The active capability effort records lane-specific state
(`docs/efforts/EFFORT-capability-profiles.md:3-8,53-96,159-170`), while the pack's
status template marks every replacement work package `not-started`
(`docs/provenant-simplification/18_IMPLEMENTATION_STATUS_TEMPLATE.md:17-29`). The
pack's own sequencing rule forbids broad refactor before the safe write profile and
end-to-end proof
(`docs/provenant-simplification/09_WORK_PACKAGES_AND_SEQUENCE.md:3-5`).

**Suggested fix.** Replace the blank reset with an adoption table mapping every live
lane, owner, gate, artefact, and residual to a pack WP or an explicit supersession.
Carry forward proven evidence by digest; do not credit completion without current
verification.

## Q3 promotion/disposition register before deletion

At minimum, promote or explicitly disposition:

1. the accepted AuthorityEnvelopeV2 schema, exact delivery mapping, negative
   goldens, full real-provider containment matrix, and receipt criteria;
2. the active charter's still-binding technical/safety boundaries and an explicit
   human decision about its delegation model;
3. document ownership/frontmatter, family manifests, ordered module paths/hashes,
   line/byte limits, unique-ID/canonical-key checks, link checks, and supersession;
4. WorkItem approval/authority provenance, conflict keys, evidence/review/effect
   links, store identity, and PR strategy;
5. an accept/reject decision for scope-delta and non-blocking DecisionRequest
   semantics; and
6. a complete old-link → new-owner migration table.

The old re-review directory has no live inbound link in the checked tree. That
reduces deletion mechanics, not the need to decide the unique material above.
Git history is sufficient for rejected drafts only after the accepted/current
material and its authority routes have moved.

## Q4 concrete spec-family split

Use a soft target of 850 lines and hard gates of **999 lines and 100 KiB per
Markdown file**. (`Under 1000` means 999, not a schema value of 1000.) Each root
manifest should be at most 250 lines and own only family status, cross-module
invariants, requirement namespaces, ordered module paths and hashes, ADR links, and
the conformance-matrix pointer.

```text
docs/specs/
  01-agent-fabric.md                              # family manifest <=250
  01-agent-fabric/
    scope-and-invariants.md                       # <=600
    authority.md                                  # <=850
    ownership-and-topology.md                     # <=850
    run-lifecycle-and-gates.md                    # <=900
    provider-actions-and-adapters.md              # <=900
    messaging-and-public-protocol.md              # <=850
    evidence-and-review.md                        # <=900
    effects.md                                    # <=700
    acceptance-map.md                             # <=900

  04-agent-fabric-operational-hardening.md        # family manifest <=250
  04-agent-fabric-operational-hardening/
    repository-and-architecture-assurance.md      # <=650
    daemon-and-wire.md                            # <=850
    workspace-trust-and-containment.md            # <=900
    persistence-and-cutover.md                    # <=900
    recovery-and-reconciliation.md                # <=900
    provider-route-budget-lifecycle-custody.md    # <=900
    review-bundle-and-portal-custody.md            # <=900
    retention-receipts-and-exports.md             # <=800
    observability-status-and-operations.md        # <=800
    acceptance-map.md                             # <=900

  05-project-fabric-console.md                    # family manifest <=250
  05-project-fabric-console/
    scope-and-projections.md                      # <=500
    project-sessions-and-chair.md                 # <=750
    intake-scoping-and-continuation.md            # <=850
    artifact-review-and-attention.md              # <=900
    operator-views-and-interaction.md             # <=900
    integrations-git-github-herdr.md              # <=750
    lifecycle-and-failure-ux.md                   # <=800
    acceptance-and-usability.md                   # <=900
```

Migration rules:

- Spec 01 owns public/domain contracts and the six kernel capabilities. IDs have
  one normative module owner; `acceptance-map.md` links to clauses and tests rather
  than restating them.
- Spec 04 owns enforcement, persistence, recovery, containment, operational
  custody, and observability. It must not own the public lifecycle or Console
  product policy.
- Spec 05 owns product projections and UX only. Mutable implementation status and
  amendment diaries leave normative modules; acceptance/usability remains a
  dedicated module.
- Repair and freeze semantics before moving text. The active handoff already
  requires manifests, ordered paths/hashes/version, duplicate/link/tamper/size
  rejection, and no monolith aliases
  (`docs/handoffs/HANDOFF-2026-07-13-project-fabric-console.md:149-167`).
- Generate an old section/requirement-ID → new module map and keep it until all
  conformance checks pass. Replace each monolith with its manifest in the same
  atomic change; never retain a second normative copy.
- Reconcile, rather than copy, current conflicts: Spec 01's claim that the spec owns
  decisions without ADRs, Spec 05's still-binding fixed review profile, read-only
  assumptions versus ADR 0002, and Spec 04 archive-only language versus ADR 0007.
- Do not promote the rejected god-manifest or deferred productisation/controller
  scope while splitting. A family manifest is a bounded index, not a new owner of
  every clause.

## Unresolved questions for the chair

1. Does the pack have direct human authority to supersede the active capability
   charter and its sole-human-gate directive, or must WP0 first seek that decision?
2. Is WP2 intended to change only the delivery kernel, or live Fabric/protocol
   admission as its exit criteria imply?
3. Must the accepted name `AuthorityEnvelopeV2` remain stable, or may a replacement
   type be introduced if it is proven field- and semantics-equivalent?
4. Does the programme intentionally reject general DecisionRequest/scope-delta
   semantics, or were they omitted pending a separate decision?
5. Are the numbered root manifests permanent compatibility entry points or a
   transitional shape? The active handoff currently requires them.
6. Which effective model actually ran the native reviewer subagents? The available
   collaboration interface provided no selector or receipt, so Luna routing could
   not be independently attested.

STATUS: complete
