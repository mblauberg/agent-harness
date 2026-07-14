# Findings register

## Verification annex (2026-07-13 scoping session)

All 46 findings were verified against a live checkout at HEAD `babd47a` by
three independent sonnet-5 subagents (the review itself was static, baseline
`0ea935f`; no cited evidence file changed in between — no finding is stale).

**Verdict: 45 CONFIRMED, 1 PARTIALLY CONFIRMED (F-026), 0 refuted.**

Corrections and sharpenings recorded during verification:

| Finding | Correction |
|---|---|
| F-001 | Understated: read-only is enforced twice — hardcoded in both adapters (`codex-app-server.ts:194-201`, `claude-agent-sdk.ts:219-258`) AND re-forced by `fabric.ts:6537` `#admitProviderPayload`, which strips forbidden controls and injects `sandbox: "read-only"`. Any write path needs changes at both layers. |
| F-002 | Undercount: `fabric.ts` is exactly 7,401 lines / 154 methods; beyond the listed 7 responsibility families it also owns task/message orchestration and capability/authority issuance. |
| F-003 | Evidence overstated: `config/agent-fabric.yaml` is clean (env-var interpolated, no absolute paths/digests). The mixing defect is entirely in tracked `config/adapter-compatibility.yaml` (Homebrew paths, per-machine sha256s, `darwin-arm64`, local verification dates). |
| F-005 | Confirmed precisely: README headline says 34; README's own generated catalogue table lists 33; `skills/*/SKILL.md` count is 33 (the 34th dir is `_shared/`, not a skill). `check_harness.py` never reads the README number. |
| F-007 | Nuance: `static-security-check.py` IS wired into CI, and `security-evidence.json` IS consumed — but only as fixture data for synthetic receipts, not a live gate. 13 of 14 declared checks have no implementation; the scanner covers Python only, so the whole TypeScript runtime is unscanned. |
| F-010 | Disambiguation: the runtime's `IntakeStore` (`project-session/intake-store.ts`) is Console task-request drafting, NOT the missing intake-decision kernel. Don't let the name produce a false negative. |
| F-023 | Focused D-024 audit corrected the earlier 72%/93% estimate: it overclassified cumulative current requirements as history. The residual is narrower but real — legacy import/migration/baseline wording in Spec 01; additive migration/import/backfill/old-client/compatibility wording in Spec 04; and a duplicate chronology/stale freeze statement in Spec 05. Structural packaging is complete, but F-023 remains partial/open under W017. |
| F-026 | PARTIALLY CONFIRMED: the claim (no canonical hook-policy generation) is plausible and no generator was found, but both cited evidence surfaces contain zero hook references — citations are wrong as written. |
| F-033 | Nuance: `*-boundary*.test.ts` files exist but test provider trust boundaries, not import/architecture boundaries. Core claim holds. |
| F-036 | Strengthened: live `gh api` shows `main` has no branch protection and no rulesets at all — affirmatively confirmed, not merely unverifiable. |
| F-039 | Narrowed: `skills/session` already routes durable knowledge to canonical owners; the gap is only a holding pen with expiry for undecided notes. |
| F-046 | Narrowed: a manual proposal-first flywheel exists in `skills/retrospect` ("proposal-first and read-only by default"); the missing piece is runtime enforcement, not the process. |

Live session evidence: `scripts/agent-fabric status` fails on this machine with
`ERR_MODULE_NOT_FOUND: @local/agent-fabric-protocol` — F-011 is not theoretical.

**Post-merge supersedence (same day):** the Spec 05 consolidation merge
(`941a72f`, `main` → `54ca037`) landed after this annex was written. Per
`SPEC05-APPLICABILITY.md`: **F-005, F-006 and F-018 are now RESOLVED**; F-027
is resolved at spec level; F-033 partially (Console/Herdr seam tests exist).
The annex verdicts above describe `babd47a` and remain correct for that
baseline. Seam files for the write-profile work (`fabric.ts`, both provider
adapters, `domain/types.ts`) were byte-identical across the merge
(`challenges/codex-pair-round2.md`).

## Priority definitions

- **P0:** Blocks the intended reliable, general two-primary implementation harness or undermines product truth.
- **P1:** Material maintainability, operability, assurance or user-experience improvement.
- **P2:** Useful hardening, simplification or productisation after the main architecture is sound.

## Summary

| ID | Priority | Theme | Finding |
|---|---:|---|---|
| F-001 | P0 | Provider execution | The managed Codex and Claude paths are compiled as read-only, so the core Fabric cannot yet serve as the general managed implementation plane. |
| F-002 | P0 | Fabric architecture | The Fabric class is a roughly 7,400-line transaction façade combining policy, SQL, provider execution, recovery, budgets, barriers and projections. |
| F-003 | P0 | Configuration | Portable adapter policy and machine-local executable paths, digests, platform and local observations are mixed in tracked configuration. |
| F-004 | P0 | Lifecycle | Lifecycle, review and authority rules are repeated across HARNESS.md, skills, specifications, validators and runbooks. |
| F-005 | P0 | Product truth | The README says 34 skills while the canonical catalogue contains 33; the harness check counts skills but does not validate the README assertion. |
| F-006 | P0 | Assurance | All five active specifications still report implementation, integrated verification, provider review or human acceptance as pending/in progress. |
| F-007 | P0 | Security | The security catalogue declares secret scanning, SAST, licence, provenance, prompt-injection and other checks, while the shipped static scanner is a narrow Python AST pattern check. |
| F-008 | P0 | Retention | Retention is report/archive-only and deliberately has no apply/delete path, which prevents governed pruning of owned ephemeral and operational state. |
| F-009 | P0 | Autonomy | There is no typed, human-approved backlog queue connecting scope, readiness, authority, expiry and execution. |
| F-010 | P0 | Intake | The requested request-understanding/decomposition/model-selection behaviour is not represented as a small typed intake decision owned by the runtime. |
| F-011 | P1 | Build system | Four local Node packages use separate lockfiles and recursively install/build one another; there is no root workspace task graph. |
| F-012 | P1 | Console | The Console has good model/controller separation, but index.ts still combines Unicode handling, layout, rendering and mouse interaction across roughly 1,800 lines. |
| F-013 | P1 | Package API | The Fabric package exports a broad set of daemon, Git, Herdr, operator, routing, profile and domain internals from its root. |
| F-014 | P1 | Model routing | Routing combines dated model aliases, regex family inference and limited runtime discovery; capability and outcome feedback are not a full closed loop. |
| F-015 | P1 | Provider scope | The activation surface carries five active adapters and additional broker concepts while the two primary implementation paths remain incomplete. |
| F-016 | P1 | Review policy | Other-primary review is broadly mandatory for substantial work, which is simple but can be costly and insensitive to oracle strength. |
| F-017 | P1 | Scoping | The scope skill's one-question-per-round rule can make broad collaboration unnecessarily serial. |
| F-018 | P1 | Orchestration | The orchestration skill defaults to fan-out for bounded work without an explicit expected-information-gain/coordination-cost test. |
| F-019 | P1 | Diagnosis | No permanent fix without a reproduction/root cause is a strong default but lacks typed emergency and irreproducible-incident exceptions. |
| F-020 | P1 | Refactoring | The seam-first default can encourage transitional compatibility layers even in a pre-release project without consumers. |
| F-021 | P1 | TDD | The TDD skill has some exceptions but does not define a uniform machine-readable exception record across delivery. |
| F-022 | P1 | Long-running work | The autonomous-lab contract emphasises continuation until a human STOP, which risks unproductive re-enumeration or budget exhaustion. |
| F-023 | P1 | Specifications | Normative specs carry extensive amendment history, increasing context load and making current requirements harder to identify. |
| F-024 | P1 | Installation | The installer is safe about ownership but writes absolute repository paths and depends on Bash/POSIX and symlinks. |
| F-025 | P1 | Instructions | The global AGENTS file requires reading the whole constitution for orchestration decisions and makes `$caveman` the universal default style. |
| F-026 | P1 | Hooks | Provider lifecycle hooks are not generated from one canonical hook policy and are not integrated as a standard Fabric attestation/receipt surface. |
| F-027 | P1 | Threat model | Private files and Unix sockets do not by themselves isolate arbitrary processes running under the same operating-system identity. |
| F-028 | P1 | Effects | Typed Git and stable actions are strong, but there is no single uniform staged-effect model covering all external mutations. |
| F-029 | P1 | Worktrees | The helper requires explicit flags for every create/remove even though the policy permits a human-approved envelope; the runtime cannot yet prove the envelope automatically. |
| F-030 | P1 | Economics | Budgets are recorded, but route selection and topology do not yet learn systematically from cost, latency, review yield and outcome. |
| F-031 | P1 | Observability | Events and projections exist, but operator replay/time-travel is not a first-class Console capability. |
| F-032 | P1 | Native UX | Fabric tracks provider sessions, but there is no complete provider-neutral contract for projecting task/model/effort/topology into native Codex and Claude UIs. |
| F-033 | P1 | Architecture tests | Strict TypeScript settings are strong, but no explicit dependency-boundary test was identified for runtime contexts. |
| F-034 | P1 | Quality tooling | Package scripts include typecheck/build/test but no visible lint, format check or coverage threshold. |
| F-035 | P1 | Portability | CI is Ubuntu-only while production configuration and IPC/file-mode behaviour are macOS/POSIX specific. |
| F-036 | P1 | Repository governance | The review could not verify current-head checks or branch protection from available connector evidence, despite a substantive CI workflow. |
| F-037 | P1 | Repository governance | CODEOWNERS assigns the repository to a single individual, so code-owner approval cannot provide independent human review. |
| F-038 | P2 | Contribution | No CONTRIBUTING.md was found at the baseline, despite public visibility and substantial maintenance rules. |
| F-039 | P2 | Notes and memory | There is no governed notes inbox with promotion/expiry, while the user intends agents to retain random decisions and ideas. |
| F-040 | P2 | Supply chain | Dependency audit and action pinning are strong, but no release SBOM, provenance attestation or signed release workflow was identified. |
| F-041 | P2 | Provider assurance | Normal tests intentionally use fakes and do not prove live login, provider calls or human Console identification. |
| F-042 | P2 | Compatibility | Exact executable versions and digests improve assurance but create frequent maintenance churn and can conflate compatibility with one workstation. |
| F-043 | P2 | IPC | The control plane is tied to Unix sockets and POSIX identity/file-mode concepts. |
| F-044 | P2 | Skill metadata | Forcing every description to start with 'Use' and include an exclusion in the first 250 characters improves routing discipline but makes semantic metadata depend on prose shape. |
| F-045 | P2 | Operations | Status, doctor, installer planning, model routing, worktrees and retention are separate commands without a unified product CLI. |
| F-046 | P2 | Self-improvement | Retrospective and evaluation primitives exist, but there is no governed runtime loop that converts observations into falsifiable harness proposals. |

## Detailed findings

### F-001 — The managed Codex and Claude paths are compiled as read-only, so the core Fabric cannot yet serve as the general managed implementation plane.

**Priority:** P0
**Theme:** Provider execution

**Evidence surfaces**

- `runtime/agent-fabric/src/adapters/providers/codex-app-server.ts: codexThreadConfiguration`
- `runtime/agent-fabric/src/adapters/providers/claude-agent-sdk.ts: claudeReadOnlyOptions`
- `runtime/agent-fabric/src/core/fabric.ts: provider payload admission`

**Recommendation:** Introduce provider-neutral authority profiles and compile them into native settings; retain the current posture as review-readonly and add workspace-write-offline first.

**Acceptance criterion:** Both primaries pass a hermetic fixture that writes only inside an owned worktree, cannot access a sibling scope, has no network, cannot perform an external effect, and records effective settings.

### F-002 — The Fabric class is a roughly 7,400-line transaction façade combining policy, SQL, provider execution, recovery, budgets, barriers and projections.

**Priority:** P0
**Theme:** Fabric architecture

**Evidence surfaces**

- `runtime/agent-fabric/src/core/fabric.ts`

**Recommendation:** Extract bounded command handlers behind one UnitOfWork while preserving one process, one SQLite authority and a temporary compatibility façade.

**Acceptance criterion:** No application command handler directly depends on unrelated bounded contexts; architecture tests enforce dependencies; characterisation and recovery tests remain green.

### F-003 — Portable adapter policy and machine-local executable paths, digests, platform and local observations are mixed in tracked configuration.

**Priority:** P0
**Theme:** Configuration

**Evidence surfaces**

- `config/adapter-compatibility.yaml`
- `config/agent-fabric.yaml`

**Recommendation:** Split portable adapter catalogue/policy from gitignored local attestations and project/user activation overlays.

**Acceptance criterion:** A clean checkout contains no machine path or local executable digest; doctor produces a signed/hash-bound local attestation consumed through an explicit overlay.

### F-004 — Lifecycle, review and authority rules are repeated across HARNESS.md, skills, specifications, validators and runbooks.

**Priority:** P0
**Theme:** Lifecycle

**Evidence surfaces**

- `HARNESS.md`
- `skills/implement/SKILL.md`
- `skills/refactor/SKILL.md`
- `skills/release/SKILL.md`
- `docs/specs/02-adaptive-agent-harness.md`

**Recommendation:** Create a versioned executable lifecycle policy; keep the constitution concise and make skills supply methods rather than duplicate gates.

**Acceptance criterion:** One policy version determines route, required gates, repair bounds and retention; generated docs and fixtures prove all surfaces agree.

### F-005 — The README says 34 skills while the canonical catalogue contains 33; the harness check counts skills but does not validate the README assertion.

**Priority:** P0
**Theme:** Product truth

**Evidence surfaces**

- `README.md`
- `scripts/check_harness.py`

**Recommendation:** Generate the README catalogue/count from a canonical manifest and fail CI on a dirty regeneration.

**Acceptance criterion:** There is no manually maintained count; adding/removing a skill changes generated documentation and provider metadata in one check.

### F-006 — All five active specifications still report implementation, integrated verification, provider review or human acceptance as pending/in progress.

**Priority:** P0
**Theme:** Assurance

**Evidence surfaces**

- `docs/specs/00-index.md`

**Recommendation:** Publish a current conformance matrix linking each normative requirement to code, deterministic test, live smoke, independent review and human acceptance.

**Acceptance criterion:** No specification is called complete until every required evidence cell is present and current for the released commit.

### F-007 — The security catalogue declares secret scanning, SAST, licence, provenance, prompt-injection and other checks, while the shipped static scanner is a narrow Python AST pattern check.

**Priority:** P0
**Theme:** Security

**Evidence surfaces**

- `config/security-evidence.json`
- `scripts/static-security-check.py`

**Recommendation:** Represent check implementation status explicitly and wire real deterministic tools or project-provided evidence for each required check.

**Acceptance criterion:** A receipt cannot claim a declared check unless an implementation/external evidence source, version, scope and result are recorded.

### F-008 — Retention is report/archive-only and deliberately has no apply/delete path, which prevents governed pruning of owned ephemeral and operational state.

**Priority:** P0
**Theme:** Retention

**Evidence surfaces**

- `docs/runbooks/agent-fabric-operations.md`
- `skills/session/SKILL.md`

**Recommendation:** Add retention classes, preview, legal hold, redaction, compact and typed delete with protected paths and receipts.

**Acceptance criterion:** A test run can delete only known harness-owned ephemeral state, preserve evidence, honour holds and refuse unknown files.

### F-009 — There is no typed, human-approved backlog queue connecting scope, readiness, authority, expiry and execution.

**Priority:** P0
**Theme:** Autonomy

**Evidence surfaces**

- `skills/autonomous-lab/SKILL.md`
- `skills/work-map/SKILL.md`

**Recommendation:** Add backlog item schema and a queue controller with approval digest, dependencies, limits and terminal states.

**Acceptance criterion:** The controller cannot claim a stale, unapproved, dependency-blocked or over-budget item and invalidates approval on scope changes.

### F-010 — The requested request-understanding/decomposition/model-selection behaviour is not represented as a small typed intake decision owned by the runtime.

**Priority:** P0
**Theme:** Intake

**Evidence surfaces**

- `AGENTS.md`
- `HARNESS.md`
- `skills/scope/SKILL.md`
- `skills/orchestrate/SKILL.md`

**Recommendation:** Implement an intake decision kernel that classifies outcome, ambiguity, risk, authority, decomposition, evidence and lifecycle route.

**Acceptance criterion:** Every run begins with a versioned intake decision; low-risk direct tasks remain lightweight; broad tasks show a preliminary topology and decision needs.

### F-011 — Four local Node packages use separate lockfiles and recursively install/build one another; there is no root workspace task graph.

**Priority:** P1
**Theme:** Build system

**Evidence surfaces**

- `runtime/agent-fabric/package.json`
- `runtime/agent-fabric-console/package.json`
- `.github/workflows/ci.yml`

**Recommendation:** Adopt a root npm or pnpm workspace, one lockfile, TypeScript project references and root check/test/audit commands before considering Nx/Turbo.

**Acceptance criterion:** A clean root install builds packages in dependency order once; CI caches one lock and package checks cannot silently use stale local builds.

### F-012 — The Console has good model/controller separation, but index.ts still combines Unicode handling, layout, rendering and mouse interaction across roughly 1,800 lines.

**Priority:** P1
**Theme:** Console

**Evidence surfaces**

- `runtime/agent-fabric-console/src/index.ts`

**Recommendation:** Split text/graphemes, layout, render primitives, views, hit regions and mouse interaction; keep snapshots and controller interfaces stable.

**Acceptance criterion:** View modules can be tested independently and the main entry point is a composition/export surface rather than a renderer implementation.

### F-013 — The Fabric package exports a broad set of daemon, Git, Herdr, operator, routing, profile and domain internals from its root.

**Priority:** P1
**Theme:** Package API

**Evidence surfaces**

- `runtime/agent-fabric/src/index.ts`

**Recommendation:** Shrink the public surface to runtime factory/client/protocol types and explicit subpath exports for supported integration ports.

**Acceptance criterion:** Internal modules are inaccessible through the package root; API-extractor or an export snapshot guards the supported surface.

### F-014 — Routing combines dated model aliases, regex family inference and limited runtime discovery; capability and outcome feedback are not a full closed loop.

**Priority:** P1
**Theme:** Model routing

**Evidence surfaces**

- `config/model-routing.json`
- `scripts/model_route.py`

**Recommendation:** Make aliases intent bands, prefer provider-native capability discovery, score candidates on quality/cost/latency/tools/privacy/availability and calibrate from receipts.

**Acceptance criterion:** Every route receipt explains constraints, candidate scores, selection, substitution and later outcome; stale catalogues cannot silently decide.

### F-015 — The activation surface carries five active adapters and additional broker concepts while the two primary implementation paths remain incomplete.

**Priority:** P1
**Theme:** Provider scope

**Evidence surfaces**

- `config/agent-fabric.yaml`
- `config/adapter-compatibility.yaml`
- `docs/specs/03-agent-fabric-activation.md`

**Recommendation:** Define a core distribution containing Claude and Codex; move extras to opt-in adapters with independent conformance and support levels.

**Acceptance criterion:** Core install and CI do not require optional providers; optional failures cannot weaken or block the two-primary path.

### F-016 — Other-primary review is broadly mandatory for substantial work, which is simple but can be costly and insensitive to oracle strength.

**Priority:** P1
**Theme:** Review policy

**Evidence surfaces**

- `HARNESS.md`
- `MAINTAINING.md`
- `README.md`

**Recommendation:** Preserve paired scoping as the broad-task default but make certifying review risk-, novelty-, independence- and oracle-aware.

**Acceptance criterion:** The lifecycle engine derives reviewers from risk controls; exceptions/degradation are explicit; deterministic oracles remain primary.

### F-017 — The scope skill's one-question-per-round rule can make broad collaboration unnecessarily serial.

**Priority:** P1
**Theme:** Scoping

**Evidence surfaces**

- `skills/scope/SKILL.md`

**Recommendation:** Use small decision packets with recommended defaults; reserve one-at-a-time questioning for genuinely dependent choices.

**Acceptance criterion:** Wide-scope fixtures reach an approved contract with fewer conversational turns without hiding consequential decisions.

### F-018 — The orchestration skill defaults to fan-out for bounded work without an explicit expected-information-gain/coordination-cost test.

**Priority:** P1
**Theme:** Orchestration

**Evidence surfaces**

- `skills/orchestrate/SKILL.md`

**Recommendation:** Require a decomposition test: independent information, stable interfaces, non-overlapping writes and expected value greater than coordination cost.

**Acceptance criterion:** Fixtures choose serial work for tightly coupled tasks and parallel work only where the return contract is independently checkable.

### F-019 — No permanent fix without a reproduction/root cause is a strong default but lacks typed emergency and irreproducible-incident exceptions.

**Priority:** P1
**Theme:** Diagnosis

**Evidence surfaces**

- `skills/diagnose/SKILL.md`

**Recommendation:** Add containment, external outage, nondeterministic production-only and observation-only exception records; never label containment as root-cause closure.

**Acceptance criterion:** Emergency mitigation can proceed under bounded authority with follow-up obligations and evidence of unresolved cause.

### F-020 — The seam-first default can encourage transitional compatibility layers even in a pre-release project without consumers.

**Priority:** P1
**Theme:** Refactoring

**Evidence surfaces**

- `skills/refactor/SKILL.md`
- `docs/specs/01-agent-fabric.md`

**Recommendation:** Default to direct replacement before stable release; require consumer evidence, owner, expiry, telemetry and removal test for compatibility.

**Acceptance criterion:** A policy check rejects new legacy/compat paths without a waiver ADR satisfying the required fields.

### F-021 — The TDD skill has some exceptions but does not define a uniform machine-readable exception record across delivery.

**Priority:** P1
**Theme:** TDD

**Evidence surfaces**

- `skills/tdd/SKILL.md`

**Recommendation:** Add typed exceptions for generated output, declarative migrations, security containment, exploratory spikes and legacy seams.

**Acceptance criterion:** Every skipped red test has a reason, scope, compensating evidence, owner and expiry/follow-up.

### F-022 — The autonomous-lab contract emphasises continuation until a human STOP, which risks unproductive re-enumeration or budget exhaustion.

**Priority:** P1
**Theme:** Long-running work

**Evidence surfaces**

- `skills/autonomous-lab/SKILL.md`

**Recommendation:** Add complete, paused-budget, paused-decision, blocked-external, failed-invariant and idle-reenumeration terminal states.

**Acceptance criterion:** A run exits or pauses deterministically at its ceiling and can resume from a canonical checkpoint.

### F-023 — Normative specs carry extensive amendment history, increasing context load and making current requirements harder to identify.

**Priority:** P1
**Theme:** Specifications
**Status:** Partial under D-024; W017 net-current consolidation remains open.

**Evidence surfaces**

- `docs/specs/01-agent-fabric.md`
- `docs/specs/04-agent-fabric-operational-hardening.md`
- `docs/specs/05-project-fabric-console.md`

**Recommendation:** Keep a current normative document; move decisions to ADRs and revision history to a changelog/archive.

**Acceptance criterion:** An agent can load current requirements without reading superseded amendment prose; traceability remains available.

The focused D-024 audit supersedes the scoping session's 72%/93% estimate,
which treated cumulative current requirements as history. The exact frozen
family is now reversible and bounded, but the non-binding topical candidate
still carries the focused obsolete/mixed clauses recorded in D-024. W017 must
map each supersession by hash and prove net-effective equivalence before this
acceptance criterion is closed.

### F-024 — The installer is safe about ownership but writes absolute repository paths and depends on Bash/POSIX and symlinks.

**Priority:** P1
**Theme:** Installation

**Evidence surfaces**

- `scripts/install-harness`
- `scripts/manage_installation.py`

**Recommendation:** Create a cross-platform installer CLI with user/project scope, copy/link modes, profiles, marked blocks, rollback and doctor/update/uninstall.

**Acceptance criterion:** A copied/package installation survives moving or deleting the source checkout; link mode is explicit development mode.

### F-025 — The global AGENTS file requires reading the whole constitution for orchestration decisions and makes `$caveman` the universal default style.

**Priority:** P1
**Theme:** Instructions

**Evidence surfaces**

- `AGENTS.md`
- `scripts/install-harness`

**Recommendation:** Use a small intake/bootstrap contract, path-scoped instructions and ordinary style guidance; remove the global pseudo-skill default.

**Acceptance criterion:** Routine tasks load minimal instructions; specialised rules are loaded by path/trigger; output style remains domain appropriate.

### F-026 — Provider lifecycle hooks are not generated from one canonical hook policy and are not integrated as a standard Fabric attestation/receipt surface.

**Priority:** P1
**Theme:** Hooks

**Evidence surfaces**

- `scripts/install-harness`
- `docs/research/native-orchestration-and-discovery-surfaces.md`

**Recommendation:** Compile a hook policy to Claude and Codex forms for session start/end, authority attestation, command/effect observation and receipt validation.

**Acceptance criterion:** Provider hook configurations are generated, versioned and tested; the system remains secure when a hook is unavailable or bypassed.

### F-027 — Private files and Unix sockets do not by themselves isolate arbitrary processes running under the same operating-system identity.

**Priority:** P1
**Theme:** Threat model

**Evidence surfaces**

- `runtime/agent-fabric/src/persistence/sqlite.ts`
- `runtime/agent-fabric/README.md`
- `docs/specs/04-agent-fabric-operational-hardening.md`

**Recommendation:** Publish explicit cooperative/adversarial-input/adversarial-process modes and require substrate isolation for the strongest mode.

**Acceptance criterion:** Security claims name the attacker model; write-enabled profiles have corresponding filesystem/network/credential isolation tests.

### F-028 — Typed Git and stable actions are strong, but there is no single uniform staged-effect model covering all external mutations.

**Priority:** P1
**Theme:** Effects

**Evidence surfaces**

- `runtime/agent-fabric/src/operator/typed-git-service.ts`
- `runtime/agent-fabric/src/operator/external-effect-service.ts`

**Recommendation:** Standardise effect proposals, validation, minimum-credential executors, idempotency and reconciliation.

**Acceptance criterion:** Models cannot hold general external-write credentials; every effect has a proposal and executor receipt.

### F-029 — The helper requires explicit flags for every create/remove even though the policy permits a human-approved envelope; the runtime cannot yet prove the envelope automatically.

**Priority:** P1
**Theme:** Worktrees

**Evidence surfaces**

- `docs/worktrees.md`
- `scripts/worktree.py`

**Recommendation:** Let Fabric mint a short-lived worktree capability from the approved plan and pass an unforgeable reference rather than a self-attested flag.

**Acceptance criterion:** The helper verifies the exact run/task/repo/operation capability; a copied flag without a capability is rejected.

### F-030 — Budgets are recorded, but route selection and topology do not yet learn systematically from cost, latency, review yield and outcome.

**Priority:** P1
**Theme:** Economics

**Evidence surfaces**

- `runtime/agent-fabric/src/core/fabric.ts`
- `scripts/model_route.py`

**Recommendation:** Add predicted and actual utility measures; calibrate routes and agent-team templates from held-out outcomes.

**Acceptance criterion:** Retrospectives can compare predicted/actual cost, duration, defects and reviewer yield by route without exposing private content.

### F-031 — Events and projections exist, but operator replay/time-travel is not a first-class Console capability.

**Priority:** P1
**Theme:** Observability

**Evidence surfaces**

- `runtime/agent-fabric-console/src/model.ts`
- `runtime/agent-fabric/src/core/fabric.ts`

**Recommendation:** Add cursor-based replay, immutable projection snapshots and exportable incident timelines.

**Acceptance criterion:** An operator can reconstruct why a gate, route or effect changed at a prior sequence and verify source revisions.

### F-032 — Fabric tracks provider sessions, but there is no complete provider-neutral contract for projecting task/model/effort/topology into native Codex and Claude UIs.

**Priority:** P1
**Theme:** Native UX

**Evidence surfaces**

- `docs/specs/05-project-fabric-console.md`
- `runtime/agent-fabric/src/adapters/providers/`

**Recommendation:** Add a native presentation adapter that sets supported names/goals/metadata and emits concise start/status/final summaries with Fabric IDs.

**Acceptance criterion:** Users can identify task, role, model/effort and parent/child relation in native UIs without reading the Fabric database.

### F-033 — Strict TypeScript settings are strong, but no explicit dependency-boundary test was identified for runtime contexts.

**Priority:** P1
**Theme:** Architecture tests

**Evidence surfaces**

- `runtime/agent-fabric/tsconfig.json`
- `runtime/agent-fabric/src/`

**Recommendation:** Add import-boundary rules or architecture tests before extraction to stop new cycles and Console/runtime leakage.

**Acceptance criterion:** CI rejects forbidden context imports and broad root-internal imports.

### F-034 — Package scripts include typecheck/build/test but no visible lint, format check or coverage threshold.

**Priority:** P1
**Theme:** Quality tooling

**Evidence surfaces**

- `runtime/agent-fabric/package.json`
- `runtime/agent-fabric-console/package.json`

**Recommendation:** Add a low-noise formatter/linter and risk-weighted coverage/contract thresholds rather than chasing one global percentage.

**Acceptance criterion:** Changed critical policy and recovery paths require branch/condition coverage or explicit waiver; formatting is deterministic.

### F-035 — CI is Ubuntu-only while production configuration and IPC/file-mode behaviour are macOS/POSIX specific.

**Priority:** P1
**Theme:** Portability

**Evidence surfaces**

- `.github/workflows/ci.yml`
- `config/adapter-compatibility.yaml`
- `runtime/agent-fabric/src/cli/status.ts`

**Recommendation:** Either declare supported macOS/Linux targets and test both, or abstract IPC and permissions before claiming Windows support.

**Acceptance criterion:** The support matrix is explicit and every supported OS runs installer, database, IPC and Console smoke tests.

### F-036 — The review could not verify current-head checks or branch protection from available connector evidence, despite a substantive CI workflow.

**Priority:** P1
**Theme:** Repository governance

**Evidence surfaces**

- `.github/workflows/ci.yml`
- `.github/pull_request_template.md`

**Recommendation:** Require named checks on protected main, forbid direct unverified pushes for release candidates and show check state in the operator projection.

**Acceptance criterion:** The released commit has independently verifiable required checks and a branch/ruleset configuration test or documented verification.

### F-037 — CODEOWNERS assigns the repository to a single individual, so code-owner approval cannot provide independent human review.

**Priority:** P1
**Theme:** Repository governance

**Evidence surfaces**

- `.github/CODEOWNERS`

**Recommendation:** Keep single ownership if this is a personal project, but do not describe CODEOWNERS as independence; add teams/collaborators when human independence is required.

**Acceptance criterion:** Governance documentation distinguishes model review, maintainer ownership and independent human approval.

### F-038 — No CONTRIBUTING.md was found at the baseline, despite public visibility and substantial maintenance rules.

**Priority:** P2
**Theme:** Contribution

**Evidence surfaces**

- `MAINTAINING.md`
- `.github/pull_request_template.md`

**Recommendation:** Add a concise contribution guide or explicitly state that external contributions are not currently accepted.

**Acceptance criterion:** A contributor can identify setup, tests, supported platforms, design authority and review expectations.

### F-039 — There is no governed notes inbox with promotion/expiry, while the user intends agents to retain random decisions and ideas.

**Priority:** P2
**Theme:** Notes and memory

**Evidence surfaces**

- `skills/session/SKILL.md`
- `skills/work-map/SKILL.md`

**Recommendation:** Add a project notes inbox with owner, created date, expiry and promotion target; never treat notes as canonical truth.

**Acceptance criterion:** A maintenance check reports expired notes and validates promotion links.

### F-040 — Dependency audit and action pinning are strong, but no release SBOM, provenance attestation or signed release workflow was identified.

**Priority:** P2
**Theme:** Supply chain

**Evidence surfaces**

- `.github/workflows/ci.yml`
- `scripts/public_release_check.py`

**Recommendation:** Add reproducible release artefacts, SBOM, provenance and signing when a distributable package/binary is published.

**Acceptance criterion:** Users can verify source commit, dependencies, build workflow and artefact digest.

### F-041 — Normal tests intentionally use fakes and do not prove live login, provider calls or human Console identification.

**Priority:** P2
**Theme:** Provider assurance

**Evidence surfaces**

- `runtime/agent-fabric/README.md`
- `runtime/agent-fabric-herdr/README.md`

**Recommendation:** Keep hermetic CI, but add an explicitly authorised release-candidate acceptance suite with bounded real-provider calls and human usability evidence.

**Acceptance criterion:** Live evidence is dated, version-bound and separate from deterministic CI; absence cannot be misrepresented as proof.

### F-042 — Exact executable versions and digests improve assurance but create frequent maintenance churn and can conflate compatibility with one workstation.

**Priority:** P2
**Theme:** Compatibility

**Evidence surfaces**

- `config/adapter-compatibility.yaml`
- `runtime/agent-fabric-herdr/README.md`

**Recommendation:** Keep exact local attestations; define portable tested ranges/capabilities separately and require conformance for an unseen compatible version.

**Acceptance criterion:** A new provider version can be assessed without editing portable machine paths, while untested versions still fail or degrade explicitly.

### F-043 — The control plane is tied to Unix sockets and POSIX identity/file-mode concepts.

**Priority:** P2
**Theme:** IPC

**Evidence surfaces**

- `runtime/agent-fabric/README.md`
- `runtime/agent-fabric/src/cli/status.ts`
- `runtime/agent-fabric/src/persistence/sqlite.ts`

**Recommendation:** Abstract local transport and credential storage behind ports; retain Unix sockets as the current POSIX implementation.

**Acceptance criterion:** Protocol clients are transport-neutral and platform support is decided by tested transport implementations.

### F-044 — Forcing every description to start with 'Use' and include an exclusion in the first 250 characters improves routing discipline but makes semantic metadata depend on prose shape.

**Priority:** P2
**Theme:** Skill metadata

**Evidence surfaces**

- `scripts/check_harness.py`

**Recommendation:** Move triggers, exclusions, authority and artefact class into a canonical manifest while retaining human-readable descriptions.

**Acceptance criterion:** Routing fixtures use structured metadata and descriptions can optimise clarity without losing machine checks.

### F-045 — Status, doctor, installer planning, model routing, worktrees and retention are separate commands without a unified product CLI.

**Priority:** P2
**Theme:** Operations

**Evidence surfaces**

- `scripts/install-harness`
- `scripts/model_route.py`
- `scripts/worktree.py`
- `runtime/agent-fabric/src/cli/`

**Recommendation:** Expose a single `harness` CLI with stable subcommands and machine-readable output; preserve specialised binaries internally.

**Acceptance criterion:** `harness doctor` reports installation, provider compatibility, project trust, Fabric, Console, hooks, policies and current-head evidence.

### F-046 — Retrospective and evaluation primitives exist, but there is no governed runtime loop that converts observations into falsifiable harness proposals.

**Priority:** P2
**Theme:** Self-improvement

**Evidence surfaces**

- `skills/retrospect/SKILL.md`
- `skills/evaluate/SKILL.md`
- `docs/research/agentic-sdlc-harness-2026.md`

**Recommendation:** Add proposal-first self-improvement: predict impact, run held-out evaluation, require approval, deploy, observe and roll back.

**Acceptance criterion:** The harness cannot silently edit itself; every accepted change has a prediction, evaluation lineage and post-change result.
