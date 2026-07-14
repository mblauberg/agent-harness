# Updated assessment

## 1. Executive judgement

Provenant is now a sophisticated pre-release control and assurance system rather
than merely a skill collection. The earlier architectural recommendations have
been evaluated, challenged and selectively adopted. That is a positive sign:
the repository did not mechanically import the prior review pack.

The project is nevertheless not ready for:

- a stable public release;
- unattended write-enabled provider execution;
- autonomous backlog processing;
- claiming a consistently enforced “only PR review is human” governance model.

The most important shift since the prior audit is this:

> The design gap has narrowed, but the operational and documentary consistency
> gap has widened.

The repository has more machinery, more evidence and more accepted decisions,
but also more live documents capable of issuing instructions. Some of those
documents disagree about human gates, PR structure, acceptance and source of
truth. Meanwhile the Fabric baseline is explicitly recorded as having 162
failing tests and 14 unhandled errors across 30 files, with additional Rust CI
reconciliation outstanding.

## 2. Current maturity

| Dimension | Updated assessment | Movement |
|---|---|---|
| Product identity | Clear personal-first pre-release product | Improved |
| Skill catalogue truth | Generated and equality-checked | Resolved |
| Build graph | Root workspace, one lockfile, project references | Resolved |
| Provider execution | Read-only primary paths; write profiles only designed | Open |
| Fabric modularity | Existing seams acknowledged, aggregate still 7,403 lines | Open |
| Lifecycle modularity | New lifecycle engine is approximately 4,427 lines | New concentration risk |
| Console modularity | Presenter and renderer are each approximately 1,900 lines | Worsened concentration |
| Specifications | Spec 01 ~9,733 lines; Spec 04 ~8,458; Spec 05 ~1,467 | Critical debt |
| Spec correctness | Known P0/P1 defects and incomplete re-audit | Critical |
| Decision governance | Strong one-off charter, inconsistent global enforcement | Critical |
| Issue/task management | Issue forms exist; live implementation is effort/handoff-driven | Partial |
| PR governance | Evidence-rich PRs; one-off charter hard-codes one monolithic PR | Partial / overconstrained |
| CI | Stronger workflow and macOS Rust lane; current integrated baseline known red | Partial |
| Branch protection | Proposal recorded but deliberately not applied | Open |
| Retention | Five classes accepted; tagging/deletion not yet implemented | Partial |
| Review policy | Risk/oracle adjustment accepted but not activated | Partial |
| Documentation discipline | Good anti-bloat prose, no enforceable spec-family/document ownership gate | Open |
| Autonomous operation | Chair/council charter exists; no typed general delegation contract | Partial |

## 3. What has been done well

### 3.1 Per-domain truth ownership

ADR 0004 correctly rejected one cross-domain “god manifest”. Skills on disk now
generate the README catalogue, protocol registries own protocol projections,
and policy files can own their own documentation/tests. This is a better
architecture than one giant registry.

The missing complement is a document-routing policy that makes it impossible
for a claim to acquire two current owners.

### 3.2 Root workspace

The root npm workspace, single lockfile and dependency-ordered build are the
right foundation. This closes a major source of stale local package resolution
and duplicated installation work.

### 3.3 Direct-cutover discipline

The accepted capability-profile decision correctly rejects a legacy authority
bridge in this pre-release repository. The direct V2 cutover and immutable
read-only goldens are appropriately rigorous.

### 3.4 Decomposition gate

The orchestration skill now requires independent artefacts, stable interfaces,
non-overlapping writes, independently verifiable returns and expected
information gain greater than coordination cost. This is a substantial
improvement over default fan-out.

### 3.5 Evidence-bearing audit

The amendment audit records base tree, reviewers, scope, exclusions, exact
findings, disagreements and unverified coverage. It also demonstrates why a
model council must adjudicate evidence rather than count votes.

### 3.6 Current-status honesty

The effort map does not conceal the red Fabric test families or Rust failures.
That honesty is essential. It should now be elevated into machine-visible
release and attention state rather than remain primarily in a Markdown route
map.

## 4. Principal unresolved risks

### 4.1 Known-red integration state

The current effort record reports 149 Fabric test files and 1,054 tests passing,
but 30 files and 162 tests failing, with 14 unhandled errors. It also records
separate Linux/macOS Rust failures.

The repository should treat this as an explicit `integration-red` project state:

- no capability-profile write pilot;
- no stable release;
- no branch-protection rule that makes recovery impossible before the failures
  are understood;
- no claim that current `main` is fully verified.

The highest-priority technical work remains Lane D and the Rust reconciliation.

### 4.2 Contradictory decision authority

Global owners say:

- human approval is mandatory for the spec, one-way doors and final acceptance;
- scope/design drift returns to the human;
- substantial work requires human acceptance.

The programme-specific chair charter says:

- every former human gate is chair/council-resolved;
- the only human gate is PR review.

The protocol gate model currently records approved/rejected/cancelled gates as
human resolutions, apart from narrow system supersession. The delivery receipt
also expects human evidence.

The one-off charter is valuable as a prototype for delegated autonomy, but it is
not yet a general, typed and consistently enforced governance model.

### 4.3 Document authority has multiplied

The same programme is governed by:

- `HARNESS.md`;
- `docs/ARCHITECTURE.md`;
- Specs 01, 02, 04 and 05;
- ADRs 0001–0008;
- the review-pack decision register;
- the chair charter;
- an effort map;
- active handoffs;
- the amendment audit;
- delivery-run and Fabric state.

Each has legitimate content, but several contain active instructions and status.
The chair charter even names itself as the first document a fresh chair reads,
while the review-pack README still names the old repository/baseline.

This is source-of-truth drift by **authority overlap**, even when the factual
content is individually accurate.

### 4.4 Specifications are too large to be safe agent inputs

Spec 01 is approximately 9,733 lines and Spec 04 approximately 8,458. Most of
their opening sections are amendment history rather than current contract.
Spec 05 is approximately 1,467 lines.

This creates four problems:

1. agents consume superseded history before current requirements;
2. requirement ownership is hard to locate;
3. reviews sample rather than cover the whole contract;
4. tiny edits create large conflict surfaces.

The repository has already accepted a <=1,000-line spec-family split. It should
be implemented before AuthorityEnvelopeV2 or write-profile changes depend on
these contracts.

### 4.5 Large runtime modules remain

The Fabric façade remains approximately 7,403 lines. A new lifecycle engine is
approximately 4,427 lines. Console `presenter.ts` and `index.ts` are each about
1,900 lines. The Rust supervisor library is about 2,549 lines.

These files are not automatically incorrect. The recurring problem is mixed
change reasons and excessive review context. The accepted “complete existing
seams” approach remains correct, but the project needs hard import/ownership
boundaries and size/change-pressure alerts.

### 4.6 The write-enabled execution plane remains absent

The accepted plan is sound:

1. freeze and repair the specs;
2. introduce `AuthorityEnvelopeV2`;
3. extract pure admission into `AuthorityCompiler`;
4. run an adversarial containment spike;
5. pilot `workspace-write-offline` with one provider;
6. add the second provider;
7. extract provider-action handling.

Only characterisation and supporting decisions have landed. The current
read-only posture therefore remains load-bearing.

### 4.7 PR policy is overfitted to one programme

The chair charter requires one long-lived integration branch and one monolithic
PR. Elsewhere its per-leg loop says to open a PR after each leg. The repository
history also contains direct commits to `main` after the PR-based foundation
change.

A global agent harness should not encode one universal PR granularity. PR shape
must be derived from the dependency and conflict graph.

### 4.8 Issues exist as intake forms, not execution truth

GitHub issue forms now collect feature/bug/skill proposals, which is useful.
The active programme, however, is still represented by effort maps, handoffs and
review-pack documents. There is no implemented backlog-item schema or canonical
issue graph.

This is precisely where the user's proposed model is strongest: scope should
produce independently deliverable vertical-slice issues, and implementation
should consume those issues.

### 4.9 Machine-local adapter facts remain tracked

`config/adapter-compatibility.yaml` still contains absolute local executable
paths, exact workstation digests and a darwin-arm64-only view. ADR 0004's
per-domain source model does not require portable and local facts to live in the
same tracked file.

### 4.10 Console decisions are still gates, not soft decisions

The gate schema already has a recommendation, consequences, deadline and
default. However, resolved gates are human resolutions or narrow system
supersessions, and gates can block operations/readiness/barriers.

A non-blocking `DecisionRequest` should be added instead of overloading
`ScopedGate`.

## 5. Updated architectural recommendation

Retain the accepted architecture:

- one transactional SQLite authority;
- provider-native session mechanics;
- Fabric authority, work, evidence and reconciliation;
- MCP for focused capabilities;
- Herdr as optional visibility/wake;
- staged external effects;
- direct pre-release cutover.

Add four governance components:

1. **Project documentation policy**: classifies every durable artefact and enforces
   one canonical owner.
2. **Work-item contract**: a vertical-slice issue schema, stored in GitHub Issues
   or `docs/issues`, never both.
3. **Decision delegation charter**: approved once during scoping; determines
   chair, council and human decision classes.
4. **Decision request projection**: informational, soft or hard; only hard
   requests block.

These are not a second lifecycle. They extend the existing delivery kernel and
project it into Fabric and the Console.

## 6. Updated release judgement

### Safe now

- read-only review/research;
- spec and ADR work;
- root workspace development;
- deterministic local work under existing explicit authority;
- issue and PR preparation under explicit collaboration authority.

### Not safe to claim now

- green integrated `main`;
- write-enabled managed provider execution;
- autonomous issue queue;
- stable release;
- fully consistent decision governance;
- complete specification coverage;
- current-head multi-platform proof.

## 7. Recommended next programme boundary

Before continuing the write-profile programme, complete a **governance and
document-normalisation tranche** that does not change runtime write authority:

1. ratify the document-routing policy;
2. define the delegation charter and scope-delta classes;
3. define the work-item schema and GitHub/local store rule;
4. replace the monolithic-PR instruction with adaptive PR planning;
5. split/freeze Specs 01/04/05 and remove amendment history from current bodies;
6. migrate the active programme from effort/handoff/review-pack authority into
   specs, ADRs, issues and one project policy;
7. archive or delete superseded working documents after links are repaired;
8. add deterministic drift/size/ownership checks.

Then finish Lane D/Rust and resume AuthorityEnvelopeV2.
