# Updated findings register

| ID | Priority | Theme | Finding |
|---|---:|---|---|
| UR-001 | P0 | Integrated correctness | The live programme records a known red Fabric and Rust integration baseline, so current main is not a safe basis for write-profile activation or stable release. |
| UR-002 | P0 | Specification authority | Specs 01 and 04 are approximately 9,733 and 8,458 lines, contain known P0/P1 defects and have explicitly incomplete audit coverage. |
| UR-003 | P0 | Decision authority | Global policy mandates human spec/final-acceptance gates while the programme charter delegates those gates to an LLM chair/council; the protocol and delivery receipt still encode human resolution. |
| UR-004 | P0 | Provider execution | Managed primary-provider execution remains read-only; the capability-profile work has not reached AuthorityEnvelopeV2, AuthorityCompiler or a containment-proven write pilot. |
| UR-005 | P0 | Documentation truth | Operational authority is duplicated across constitution, architecture, specs, ADRs, charter, decision register, effort map, handoffs and the old review pack. |
| UR-006 | P1 | Work tracking | Issue forms exist, but the active implementation graph is not issue-backed and the accepted backlog-item schema remains unimplemented. |
| UR-007 | P1 | Scope evolution | Current scope/implement rules return any scope or design drift to a fresh human gate, contrary to the desired delegated, low-handholding implementation mode. |
| UR-008 | P1 | Soft decisions | Fabric models blocking scoped gates but lacks a first-class non-blocking decision request with an applied default and human override window. |
| UR-009 | P1 | Council governance | The charter uses 'council vote' language even though the constitution says objective evidence outranks opinions and decisions must not be majority-voted into truth. |
| UR-010 | P1 | PR strategy | The programme charter mandates one monolithic PR, while its per-leg loop says to open a PR after each leg; neither is a suitable global default. |
| UR-011 | P1 | Repository governance | The branch-protection ruleset is only a proposal and deliberately not applied; direct commits appear after the PR-based foundation change. |
| UR-012 | P1 | Runtime modularity | Fabric remains 7,403 lines and a new lifecycle engine is approximately 4,427 lines, creating multiple high-context application centres. |
| UR-013 | P1 | Console modularity | Console presenter and renderer/interaction entrypoint are each approximately 1,900 lines. |
| UR-014 | P1 | Native supervisor | The dependency-free Rust supervisor is approximately 2,549 lines and explicitly does not yet prove the certifying-review containment contract. |
| UR-015 | P1 | Portable configuration | Tracked adapter compatibility still mixes portable policy with absolute workstation executable paths and local digests. |
| UR-016 | P1 | Spec ownership | Spec 01 says the specification owns its decisions with no separate ADR, while accepted ADRs now own major architecture decisions. |
| UR-017 | P1 | Document staleness | The chair charter's embedded lane snapshot says Lane B is not started, while the current effort map says it is complete and merged. |
| UR-018 | P1 | Document archiving | Move-never-delete defaults preserve working history in the live documentation tree and increase agent context and drift risk. |
| UR-019 | P1 | Document checks | The accepted <=1,000-line spec-family gate is not present in the current harness gate, and docs/references are explicitly outside the style gate. |
| UR-020 | P1 | Review policy | Risk/oracle-adjusted review is accepted but the binding constitution and Spec 05 still mandate broader fixed review profiles. |
| UR-021 | P1 | Retention | Retention classes are accepted but class tagging and governed deletion remain unimplemented. |
| UR-022 | P1 | Issue effects | The desired autonomous creation/update of GitHub issues is an external collaboration effect but no standing project authority policy is defined for it. |
| UR-023 | P2 | Instructions | AGENTS still requires full HARNESS loading for orchestration and retains `$caveman` as the global style default despite a later accepted style split. |
| UR-024 | P2 | Architecture review skill | Architecture-review promotion is accepted but the skill is not in the 33-skill catalogue. |
| UR-025 | P2 | PR evidence | The PR template is evidence-rich but still assumes historical format readability and human gates in ways that may conflict with direct cutover and delegated decisions. |
| UR-026 | P2 | Review-pack lifecycle | The original review pack remains a live execution route even though its proposals were dispositioned and the repo has been renamed. |

## Detail

### UR-001 — The live programme records a known red Fabric and Rust integration baseline, so current main is not a safe basis for write-profile activation or stable release.

**Priority:** P0  
**Theme:** Integrated correctness

**Evidence surfaces**

- `docs/efforts/EFFORT-capability-profiles.md:65-91`
- `.github/workflows/ci.yml`
- `current-head connector query returned no PR workflow evidence`

**Recommendation:** Create a machine-visible integration-red state, complete Lane D and Rust reconciliation, then require current-head clean evidence before write pilots.

**Acceptance:** One current main commit passes the complete root, Fabric, Console, Herdr and Rust matrix; the result is visible in status/Console and protected by required checks.

### UR-002 — Specs 01 and 04 are approximately 9,733 and 8,458 lines, contain known P0/P1 defects and have explicitly incomplete audit coverage.

**Priority:** P0  
**Theme:** Specification authority

**Evidence surfaces**

- `docs/specs/01-agent-fabric.md`
- `docs/specs/04-agent-fabric-operational-hardening.md`
- `docs/specs/amendment-audit-2026-07-13.md:112-171`

**Recommendation:** Repair, split and freeze the spec families before AuthorityEnvelopeV2 depends on them. Remove amendment history from current normative bodies.

**Acceptance:** Every current spec module is <=1,000 lines, has a single subject owner, passes requirement-ID uniqueness/traceability checks and has no unresolved P0-P1 audit finding.

### UR-003 — Global policy mandates human spec/final-acceptance gates while the programme charter delegates those gates to an LLM chair/council; the protocol and delivery receipt still encode human resolution.

**Priority:** P0  
**Theme:** Decision authority

**Evidence surfaces**

- `HARNESS.md:32-55`
- `docs/specs/02-adaptive-agent-harness.md:69-90,220-234`
- `docs/agent-harness-comprehensive-review/CHAIR-CHARTER.md:16-28,111-136`
- `runtime/agent-fabric-protocol/src/gates.ts:51-110`

**Recommendation:** Generalise the charter into a typed, human-approved decision-delegation contract consumed by the delivery validator, Fabric and Console.

**Acceptance:** For every decision class, all surfaces agree on chair/council/human authority; a delegated decision has an authenticated resolution type rather than masquerading as human evidence.

### UR-004 — Managed primary-provider execution remains read-only; the capability-profile work has not reached AuthorityEnvelopeV2, AuthorityCompiler or a containment-proven write pilot.

**Priority:** P0  
**Theme:** Provider execution

**Evidence surfaces**

- `docs/adr/0002-capability-compiled-execution-authority.md`
- `docs/efforts/EFFORT-capability-profiles.md:55-98`
- `docs/handoffs/HANDOFF-2026-07-13-capability-profiles-v2.md`

**Recommendation:** Do not shortcut the staged plan. Complete spec freeze, V2 cutover, pure compiler extraction and adversarial containment before one-provider workspace-write-offline.

**Acceptance:** A provider can write only in one owned worktree with no egress/effects, and hostile path, Git, symlink, settings, secret, lifecycle and process tests pass.

### UR-005 — Operational authority is duplicated across constitution, architecture, specs, ADRs, charter, decision register, effort map, handoffs and the old review pack.

**Priority:** P0  
**Theme:** Documentation truth

**Evidence surfaces**

- `docs/agent-harness-comprehensive-review/README.md`
- `docs/agent-harness-comprehensive-review/CHAIR-CHARTER.md`
- `docs/agent-harness-comprehensive-review/decision-register.md`
- `docs/efforts/EFFORT-capability-profiles.md`
- `docs/handoffs/HANDOFF-2026-07-13-capability-profiles-v2.md`

**Recommendation:** Adopt a document-routing policy with a canonical type/claim key, migrate live work to specs/ADRs/issues/project policy, and retire working-pack authority.

**Acceptance:** Every current claim resolves to exactly one canonical owner; generated indexes detect duplicates; superseded working documents contain no live directives.

### UR-006 — Issue forms exist, but the active implementation graph is not issue-backed and the accepted backlog-item schema remains unimplemented.

**Priority:** P1  
**Theme:** Work tracking

**Evidence surfaces**

- `.github/ISSUE_TEMPLATE/feature.yml`
- `docs/adr/0006-backlog-schema-first-store-pluggable.md`
- `docs/efforts/EFFORT-capability-profiles.md`

**Recommendation:** Publish the vertical-slice work-item schema and select GitHub Issues as Provenant's canonical work store; use docs/issues only for non-GitHub projects.

**Acceptance:** Every active implementation slice has one issue with spec/ADR links, dependencies, authority, write scope and acceptance; effort maps no longer own task status.

### UR-007 — Current scope/implement rules return any scope or design drift to a fresh human gate, contrary to the desired delegated, low-handholding implementation mode.

**Priority:** P1  
**Theme:** Scope evolution

**Evidence surfaces**

- `skills/scope/SKILL.md:70-73`
- `skills/implement/SKILL.md:45-47,56-74`
- `docs/specs/02-adaptive-agent-harness.md:87-90`

**Recommendation:** Introduce three delta classes: implementation detail, delegated reversible spec delta, and hard authority/one-way-door change.

**Acceptance:** Class A/B deltas proceed under the delegation charter, update issue/spec/PR and raise a soft decision; only Class C blocks for human authority.

### UR-008 — Fabric models blocking scoped gates but lacks a first-class non-blocking decision request with an applied default and human override window.

**Priority:** P1  
**Theme:** Soft decisions

**Evidence surfaces**

- `runtime/agent-fabric-protocol/src/gates.ts:35-163`
- `runtime/agent-fabric-console/src/presenter.ts`

**Recommendation:** Add informational, soft and hard decision modes; keep hard decisions as gates and project soft decisions into Attention without blocking work.

**Acceptance:** A soft decision shows default, rationale, council record, override cut-point and related issue/PR; work proceeds and any override becomes a traceable replan.

### UR-009 — The charter uses 'council vote' language even though the constitution says objective evidence outranks opinions and decisions must not be majority-voted into truth.

**Priority:** P1  
**Theme:** Council governance

**Evidence surfaces**

- `docs/agent-harness-comprehensive-review/CHAIR-CHARTER.md:89-109`
- `HARNESS.md:89-92`

**Recommendation:** Rename the mechanism council deliberation; require independent first passes and chair adjudication against evidence, policy and oracle strength.

**Acceptance:** Council records contain claims, evidence, dissent and adjudication; vote count is never sufficient to override deterministic evidence or authority.

### UR-010 — The programme charter mandates one monolithic PR, while its per-leg loop says to open a PR after each leg; neither is a suitable global default.

**Priority:** P1  
**Theme:** PR strategy

**Evidence surfaces**

- `docs/agent-harness-comprehensive-review/CHAIR-CHARTER.md:67-87`
- `docs/agent-harness-comprehensive-review/CHAIR-CHARTER.md:172-185`

**Recommendation:** Derive PR topology from task dependencies and path conflicts: independent, stacked, consolidated, or no-PR/direct-commit by project policy.

**Acceptance:** Each plan records a conflict graph and PR strategy; concurrently open PRs are mergeable in the declared order and do not race on canonical docs/generated files.

### UR-011 — The branch-protection ruleset is only a proposal and deliberately not applied; direct commits appear after the PR-based foundation change.

**Priority:** P1  
**Theme:** Repository governance

**Evidence surfaces**

- `docs/efforts/EFFORT-capability-profiles.md:100-140`
- `current commit history at baseline`

**Recommendation:** After the red baseline is repaired, apply branch rules consistent with the selected project policy and test the ruleset as repository assurance.

**Acceptance:** Current main can advance only through the authorised route, and the route is consistent with the project delegation/PR policy.

### UR-012 — Fabric remains 7,403 lines and a new lifecycle engine is approximately 4,427 lines, creating multiple high-context application centres.

**Priority:** P1  
**Theme:** Runtime modularity

**Evidence surfaces**

- `runtime/agent-fabric/src/core/fabric.ts`
- `runtime/agent-fabric/src/lifecycle/engine.ts`
- `docs/adr/0003-modular-monolith-complete-existing-seams.md`

**Recommendation:** Continue vertical extraction through existing seams, preceded by architecture/import tests; alert on responsibility/change-pressure rather than only line count.

**Acceptance:** Provider admission, lifecycle custody and projection responsibilities have focused owners, forbidden imports are gated and old paths are deleted.

### UR-013 — Console presenter and renderer/interaction entrypoint are each approximately 1,900 lines.

**Priority:** P1  
**Theme:** Console modularity

**Evidence surfaces**

- `runtime/agent-fabric-console/src/presenter.ts`
- `runtime/agent-fabric-console/src/index.ts`

**Recommendation:** Separate view models, text safety, layout, rendering, hit regions and input reduction; keep protocol bindings immutable.

**Acceptance:** Individual views and reducers are independently testable; no principal Console module mixes Unicode handling, full layout and action interaction.

### UR-014 — The dependency-free Rust supervisor is approximately 2,549 lines and explicitly does not yet prove the certifying-review containment contract.

**Priority:** P1  
**Theme:** Native supervisor

**Evidence surfaces**

- `runtime/agent-fabric-review-portal-supervisor/README.md:35-54`
- `runtime/agent-fabric-review-portal-supervisor/src/lib.rs`

**Recommendation:** Keep capability=false until daemon integration and escape canaries pass; split process, framing and custody modules where ownership is stable.

**Acceptance:** Both hosted platforms pass, outer confinement is attested and every required failure/death path is tested end to end.

### UR-015 — Tracked adapter compatibility still mixes portable policy with absolute workstation executable paths and local digests.

**Priority:** P1  
**Theme:** Portable configuration

**Evidence surfaces**

- `config/adapter-compatibility.yaml`

**Recommendation:** Keep portable adapter contracts/ranges in Git and generate private local attestation overlays through doctor/activation.

**Acceptance:** A clean checkout contains no user-machine executable path; local pins remain exact and fail closed through a private overlay.

### UR-016 — Spec 01 says the specification owns its decisions with no separate ADR, while accepted ADRs now own major architecture decisions.

**Priority:** P1  
**Theme:** Spec ownership

**Evidence surfaces**

- `docs/specs/01-agent-fabric.md:3-15`
- `docs/adr/README.md`

**Recommendation:** Define precedence: ADR owns decision/rationale, current spec owns normative behaviour, Git owns history.

**Acceptance:** Specs link decisions but do not claim competing decision ownership; ADR changes trigger exact spec updates.

### UR-017 — The chair charter's embedded lane snapshot says Lane B is not started, while the current effort map says it is complete and merged.

**Priority:** P1  
**Theme:** Document staleness

**Evidence surfaces**

- `docs/agent-harness-comprehensive-review/CHAIR-CHARTER.md:201-215`
- `docs/efforts/EFFORT-capability-profiles.md:3-10,45-54`

**Recommendation:** Remove mutable status snapshots from policy/charter documents; project live state only from issues/Fabric.

**Acceptance:** No durable policy document embeds mutable lane status; stale-state checks flag any such section.

### UR-018 — Move-never-delete defaults preserve working history in the live documentation tree and increase agent context and drift risk.

**Priority:** P1  
**Theme:** Document archiving

**Evidence surfaces**

- `skills/engineering-docs/SKILL.md:66-70`
- `skills/session/SKILL.md:36-38`
- `skills/work-map/SKILL.md:63-64`

**Recommendation:** Use Git history as the default archive; retain/move only audit, legal or operational evidence required by policy. Delete superseded working docs after reference migration.

**Acceptance:** A prune action can delete known superseded docs under policy, refuses unknown files, and leaves one current owner plus immutable Git history.

### UR-019 — The accepted <=1,000-line spec-family gate is not present in the current harness gate, and docs/references are explicitly outside the style gate.

**Priority:** P1  
**Theme:** Document checks

**Evidence surfaces**

- `docs/efforts/EFFORT-capability-profiles.md:31-44`
- `scripts/check-harness:43-62`
- `CONTRIBUTING.md:67-81`

**Recommendation:** Add document schemas, spec size/name/ownership checks, link/duplicate-key checks and changed-file style gating.

**Acceptance:** CI rejects numbered new spec names, >1,000-line spec modules, duplicate canonical keys, stale indexes and unowned active working docs.

### UR-020 — Risk/oracle-adjusted review is accepted but the binding constitution and Spec 05 still mandate broader fixed review profiles.

**Priority:** P1  
**Theme:** Review policy

**Evidence surfaces**

- `docs/adr/0008-review-pressure-risk-and-oracle-adjusted.md`
- `HARNESS.md:80-92`
- `docs/specs/05-project-fabric-console.md:19-73`

**Recommendation:** Land one coherent amendment and validator change before relying on the new policy.

**Acceptance:** Risk/oracle inputs deterministically derive required reviewers, and no current document or validator retains the superseded profile.

### UR-021 — Retention classes are accepted but class tagging and governed deletion remain unimplemented.

**Priority:** P1  
**Theme:** Retention

**Evidence surfaces**

- `docs/adr/0007-retention-classes-then-governed-deletion.md`
- `docs/specs/04-agent-fabric-operational-hardening.md:207-217`

**Recommendation:** Class-tag new docs/run artefacts now; implement deletion after the write-profile prerequisites without extending archive-only as a permanent policy.

**Acceptance:** Every retained artefact has a class/owner/expiry; deletion preview/apply is protected, hold-aware and receipt-bearing.

### UR-022 — The desired autonomous creation/update of GitHub issues is an external collaboration effect but no standing project authority policy is defined for it.

**Priority:** P1  
**Theme:** Issue effects

**Evidence surfaces**

- `docs/adr/0006-backlog-schema-first-store-pluggable.md:14-24`
- `runtime/agent-fabric-protocol/src/operator-actions.ts:154-187`

**Recommendation:** Register issue create/update/close as bounded external operations and allow a project charter to pre-authorise them independently of release/push/merge.

**Acceptance:** Agents can raise traceable issues without human micro-approval, but cannot broaden labels, repositories, recipients or other external effects beyond the charter.

### UR-023 — AGENTS still requires full HARNESS loading for orchestration and retains `$caveman` as the global style default despite a later accepted style split.

**Priority:** P2  
**Theme:** Instructions

**Evidence surfaces**

- `AGENTS.md:3-20`
- `docs/adr/0008-review-pressure-risk-and-oracle-adjusted.md:24-30`

**Recommendation:** Update the bootstrap to load document/decision policy progressively and use domain-appropriate human-facing prose.

**Acceptance:** Global instructions and ADR agree; routine tasks do not load unrelated deep governance.

### UR-024 — Architecture-review promotion is accepted but the skill is not in the 33-skill catalogue.

**Priority:** P2  
**Theme:** Architecture review skill

**Evidence surfaces**

- `docs/adr/0008-review-pressure-risk-and-oracle-adjusted.md:24-27`
- `README.md:143-160`

**Recommendation:** Implement it through the normal skill-authoring/evaluation path after the document policy is in place.

**Acceptance:** The skill has a distinct trigger, read-only authority, outputs, nearest-neighbour tests and generated catalogue entry.

### UR-025 — The PR template is evidence-rich but still assumes historical format readability and human gates in ways that may conflict with direct cutover and delegated decisions.

**Priority:** P2  
**Theme:** PR evidence

**Evidence surfaces**

- `.github/pull_request_template.md:24-29,44-52`
- `docs/adr/0002-capability-compiled-execution-authority.md:44-48`

**Recommendation:** Add direct-cutover/not-applicable paths, scope-delta and soft-decision sections, issue closure and conflict/stack strategy.

**Acceptance:** PRs describe current policy without implying compatibility or human gates that do not apply.

### UR-026 — The original review pack remains a live execution route even though its proposals were dispositioned and the repo has been renamed.

**Priority:** P2  
**Theme:** Review-pack lifecycle

**Evidence surfaces**

- `docs/agent-harness-comprehensive-review/README.md:3-36`
- `docs/agent-harness-comprehensive-review/CHAIR-CHARTER.md:49-65`

**Recommendation:** Extract current decisions into ADR/spec/policy/issues; retain the pack only as frozen evidence or delete it from the live tree after the programme closes.

**Acceptance:** Fresh agents never need the old review pack to determine current authority or work state.
