# Acceptance tests

## 1. Product acceptance

### A1 — advisory path

Given a read-only question, the chair answers without creating a heavy delivery run or task graph.

### A2 — routine serial change

Given a local reversible change with strong tests:

- one chair and one workspace;
- deterministic checks pass;
- no mandatory other-primary review unless a sensitive surface is detected;
- concise result and evidence.

### A3 — substantial WorkItem

Given a ready WorkItem:

- readiness validates;
- authority compiles;
- one writer owns the surface;
- implementation completes;
- checks pass;
- required independent review passes;
- PR effect proposal is produced.

### A4 — scope to several WorkItems

Given ambiguous broad scope:

- grouped decision packet is produced;
- approved ScopePacket is digest-bound;
- Initiative and vertical WorkItems are created;
- dependencies are explicit;
- each WorkItem has independent value and verification.

### A5 — optional work graph

A simple task runs without a graph. A parallel initiative creates a graph only when required.

## 2. Parallelism acceptance

### P1 — independent WorkItems

Two WorkItems with disjoint write scopes may run concurrently in separate owned worktrees.

### P2 — overlapping writes

Two tasks requesting overlapping source surfaces cannot both acquire active write ownership.

### P3 — integration owner

Cross-WorkItem integration has one designated owner and deterministic barrier conditions.

### P4 — serial fallback

If provider-native worker orchestration is unavailable, the chair completes the run serially without changing authority.

## 3. Authority and containment

### S1 — read-only compatibility

`review-readonly` reproduces current effective provider controls exactly.

### S2 — offline write

The admitted provider writes an expected file inside the owned worktree.

### S3 — sibling and parent escape

Attempts to write parent, sibling, denied and unrelated paths fail.

### S4 — symlink escape

Symlink, junction and canonicalisation attempts fail.

### S5 — network denial

DNS, HTTP and package-fetch attempts fail in the write profile.

### S6 — secret absence

External-effect credentials and unrelated host secrets are not available to the model session.

### S7 — provider override

The model cannot broaden tools, sandbox, permissions, network or effect ceiling through payload fields.

### S8 — stale authority

Expired, revoked or stale-generation authority fails before provider action.

### S9 — lease loss

A writer that loses ownership cannot continue mutating source.

## 4. Lifecycle

### L1 — invalid transition

An action requesting a transition without required evidence fails before execution.

### L2 — repair

A failed check returns to repair, then to verification. It cannot proceed directly to acceptance.

### L3 — scope drift

Material change to objective or acceptance creates a rescope state.

### L4 — routine bypass

A policy-permitted routine task does not require substantial-run artefacts.

### L5 — recovery

After process loss, the run resumes from the last valid checkpoint without skipping gates.

## 5. Loop safety

### B1 — repeated action

Repeated normalised action/result triggers no-progress handling.

### B2 — repeated error

Repeated identical error beyond threshold stops or escalates.

### B3 — oscillation

Alternating states without new evidence stop.

### B4 — repair ceiling

The repair cycle cannot exceed policy without explicit new authority.

### B5 — budget exhaustion

Turn, cost and wall-time ceilings are enforced.

### B6 — context turnover

A new chair or provider receives a complete minimal handoff and cannot infer missing authority.

## 6. Review

### R1 — strong-oracle routine change

Review may be omitted according to policy and the reason is projected.

### R2 — weak-oracle substantial change

Fresh independent review is required.

### R3 — crucial authority change

Other-primary and security/domain review are required.

### R4 — reviewer independence

An authoring or deciding participant cannot certify.

### R5 — evidence-bound finding

A blocking finding requires anchor, mechanism, impact and validation route.

### R6 — review economics

Review cost, yield and false-blocking status are recorded.

## 7. Effects

### E1 — proposal only

The writer may produce a PR proposal but cannot push or create the PR without effect authority.

### E2 — exact PR creation

After human approval, the executor creates the PR using the exact target, payload digest and expected revision.

### E3 — ambiguity

A timed-out PR action reconciles by lookup and does not blindly duplicate.

### E4 — unregistered effect

Arbitrary shell, URL or credential-bearing effect requests fail.

### E5 — merge boundary

The implementation workflow cannot merge unless separately authorised.

## 8. Provider neutrality

### N1 — both primaries

Codex and Claude compile the same neutral profiles into native settings and satisfy the same conformance suite.

### N2 — model substitution

A model substitution is recorded and cannot change effective authority.

### N3 — optional provider failure

Optional worker failure does not block unless the ReviewPlan made it load-bearing.

## 9. Portability and configuration

### C1 — clean checkout

Tracked configuration contains no machine-local executable path or local binary digest.

### C2 — local attestation

Doctor or setup generates an expiring local attestation.

### C3 — platform claim

Only tested platforms are reported as supported.

## 10. Documentation and maintainability

### D1 — lifecycle source agreement

Runtime, validator and rendered documentation agree on transition rules.

### D2 — no stale catalogue

Skill catalogue and counts cannot drift.

### D3 — architecture boundaries

Automated dependency tests prevent provider adapters, Console or domain modules from crossing prohibited boundaries.

### D4 — deleted old paths

Temporary compatibility paths have deletion tests and are removed at the planned milestone.

## 11. Evaluation acceptance

The private evaluation programme compares:

- strong-model minimal baseline;
- minimal baseline plus invariant kernel;
- conditional review;
- parallel read-only workers;
- parallel independent WorkItems.

Retain added complexity only when it improves at least one of:

- accepted task success;
- escaped defect rate;
- human attention;
- recovery;
- security;
- cost;
- elapsed time;

without unacceptable regression elsewhere.

## 12. Reusable acceptance criteria for still-open findings

Folded from the (now superseded)
`docs/agent-harness-comprehensive-review/findings-register.md` per-finding
acceptance criteria. Each is directly reusable as a work-package acceptance
case. F-005, F-006 and F-018 are already resolved (see
`17_BASELINE_OBSERVATIONS.md` §9) and are omitted. Criteria are verbatim.

| Finding | Acceptance criterion |
|---|---|
| F-001 | Both primaries pass a hermetic fixture that writes only inside an owned worktree, cannot access a sibling scope, has no network, cannot perform an external effect, and records effective settings. |
| F-002 | No application command handler directly depends on unrelated bounded contexts; architecture tests enforce dependencies; characterisation and recovery tests remain green. |
| F-003 | A clean checkout contains no machine path or local executable digest; doctor produces a signed/hash-bound local attestation consumed through an explicit overlay. |
| F-004 | One policy version determines route, required gates, repair bounds and retention; generated docs and fixtures prove all surfaces agree. |
| F-007 | A receipt cannot claim a declared check unless an implementation/external evidence source, version, scope and result are recorded. |
| F-008 | A test run can delete only known harness-owned ephemeral state, preserve evidence, honour holds and refuse unknown files. |
| F-009 | The controller cannot claim a stale, unapproved, dependency-blocked or over-budget item and invalidates approval on scope changes. |
| F-010 | Every run begins with a versioned intake decision; low-risk direct tasks remain lightweight; broad tasks show a preliminary topology and decision needs. |
| F-011 | A clean root install builds packages in dependency order once; CI caches one lock and package checks cannot silently use stale local builds. |
| F-012 | View modules can be tested independently and the main entry point is a composition/export surface rather than a renderer implementation. |
| F-013 | Internal modules are inaccessible through the package root; API-extractor or an export snapshot guards the supported surface. |
| F-014 | Every route receipt explains constraints, candidate scores, selection, substitution and later outcome; stale catalogues cannot silently decide. |
| F-015 | Core install and CI do not require optional providers; optional failures cannot weaken or block the two-primary path. |
| F-016 | The lifecycle engine derives reviewers from risk controls; exceptions/degradation are explicit; deterministic oracles remain primary. |
| F-017 | Wide-scope fixtures reach an approved contract with fewer conversational turns without hiding consequential decisions. |
| F-019 | Emergency mitigation can proceed under bounded authority with follow-up obligations and evidence of unresolved cause. |
| F-020 | A policy check rejects new legacy/compat paths without a waiver ADR satisfying the required fields. |
| F-021 | Every skipped red test has a reason, scope, compensating evidence, owner and expiry/follow-up. |
| F-022 | A run exits or pauses deterministically at its ceiling and can resume from a canonical checkpoint. |
| F-023 | An agent can load current requirements without reading superseded amendment prose; traceability remains available. |
| F-024 | A copied/package installation survives moving or deleting the source checkout; link mode is explicit development mode. |
| F-025 | Routine tasks load minimal instructions; specialised rules are loaded by path/trigger; output style remains domain appropriate. |
| F-026 | Provider hook configurations are generated, versioned and tested; the system remains secure when a hook is unavailable or bypassed. |
| F-027 | Security claims name the attacker model; write-enabled profiles have corresponding filesystem/network/credential isolation tests. |
| F-028 | Models cannot hold general external-write credentials; every effect has a proposal and executor receipt. |
| F-029 | The helper verifies the exact run/task/repo/operation capability; a copied flag without a capability is rejected. |
| F-030 | Retrospectives can compare predicted/actual cost, duration, defects and reviewer yield by route without exposing private content. |
| F-031 | An operator can reconstruct why a gate, route or effect changed at a prior sequence and verify source revisions. |
| F-032 | Users can identify task, role, model/effort and parent/child relation in native UIs without reading the Fabric database. |
| F-033 | CI rejects forbidden context imports and broad root-internal imports. |
| F-034 | Changed critical policy and recovery paths require branch/condition coverage or explicit waiver; formatting is deterministic. |
| F-035 | The support matrix is explicit and every supported OS runs installer, database, IPC and Console smoke tests. |
| F-036 | The released commit has independently verifiable required checks and a branch/ruleset configuration test or documented verification. |
| F-037 | Governance documentation distinguishes model review, maintainer ownership and independent human approval. |
| F-038 | A contributor can identify setup, tests, supported platforms, design authority and review expectations. |
| F-039 | A maintenance check reports expired notes and validates promotion links. |
| F-040 | Users can verify source commit, dependencies, build workflow and artefact digest. |
| F-041 | Live evidence is dated, version-bound and separate from deterministic CI; absence cannot be misrepresented as proof. |
| F-042 | A new provider version can be assessed without editing portable machine paths, while untested versions still fail or degrade explicitly. |
| F-043 | Protocol clients are transport-neutral and platform support is decided by tested transport implementations. |
| F-044 | Routing fixtures use structured metadata and descriptions can optimise clarity without losing machine checks. |
| F-045 | `harness doctor` reports installation, provider compatibility, project trust, Fabric, Console, hooks, policies and current-head evidence. |
| F-046 | The harness cannot silently edit itself; every accepted change has a prediction, evaluation lineage and post-change result. |
