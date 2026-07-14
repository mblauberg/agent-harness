# Delta from the prior audit

## 1. Confirmed resolutions

### Skill catalogue truth (prior F-005)

Resolved. Skills on disk are the source of truth, and the README count/catalogue
is generated and drift-checked.

### Root workspace (prior F-011)

Resolved. Provenant now has one root npm workspace, lockfile, project references
and dependency-ordered root commands.

### Orchestration value gate (prior F-018)

Resolved at the skill front door. Parallel fan-out now requires independent
information/artefacts, stable interfaces, non-overlapping writes, independently
checkable returns and net value over coordination cost.

### Contribution guidance (prior F-038)

Resolved. `CONTRIBUTING.md`, issue forms and a code of conduct are present.

## 2. Design decisions accepted, implementation incomplete

- capability profiles / write authority (F-001);
- per-domain truth owners and lifecycle-kernel extension (F-004);
- retention classes/deletion sequencing (F-008);
- backlog schema/store choice (F-009);
- risk/oracle-adjusted review (F-016);
- decision packets (F-017);
- direct cutover/compatibility discipline (F-020);
- spec-family split (F-023);
- human-facing style split (F-025);
- architecture-review skill (F-024 in updated register);
- branch-protection proposal (F-036);
- portable/local adapter split (F-003).

These should not be reported as delivered until their code, skills, schemas and
validators change.

## 3. Material implementation progress

- root workspace and compact protocol schema;
- current read-only provider permission goldens;
- extensive Console/operator protocol work;
- review portal supervisor and lifecycle custody machinery;
- ADR/decision evidence;
- anchored spec amendment audit;
- issue intake forms and repository governance files.

## 4. Prior findings still open

The following earlier themes remain substantially open:

- write-capable managed provider execution;
- Fabric aggregate decomposition;
- portable/local adapter compatibility split;
- security evidence implementation map;
- autonomous backlog/intake runtime;
- Console renderer/presenter decomposition;
- package public-surface reduction;
- adaptive outcome-calibrated model routing;
- uniform external-effect model;
- worktree capabilities rather than self-attested flags;
- cost/reviewer-yield calibration;
- event replay/time travel;
- provider-native topology projection;
- architecture import boundaries;
- full security/lint/coverage gates;
- cross-platform core support;
- unified product CLI and relocatable installer;
- hook compilation;
- explicit adversarial-process threat modes;
- SBOM/provenance;
- authorised live-provider and human usability acceptance;
- governed self-improvement.

## 5. New or worsened risks

### Governance split

The one-off autonomous charter has not been reconciled into the global
constitution, validator and protocol.

### Document concentration

Spec 01/04/05 and the review-pack/effort/handoff chain have grown into major
agent-context and authority risks.

### Runtime concentration

The lifecycle engine, Console presenter/renderer and Rust supervisor add several
new multi-thousand-line centres.

### Known red baseline

The repository now records exact integration failures, which is better than
concealing them but still blocks release/write activation.

### PR overconstraint

The one-monolithic-PR programme rule is a new workflow anti-pattern.

## 6. Overall movement

The prior review's strategic direction was largely correct and has been handled
thoughtfully. Provenant has moved from “architecturally promising but missing
foundations” to “strong foundations and governance ideas, but too many
unreconciled sources and incomplete integration”.

The next gains come from consolidation, not further feature expansion.
