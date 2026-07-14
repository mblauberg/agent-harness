# Spec 05 applicability

Date: 13 July 2026

Original pack baseline: `main@0ea935f8ccaad550d8db0f9ea40324f58bdda569`

Integration precondition: [Spec 01](../specs/01-agent-fabric.md) v0.36,
[Spec 04](../specs/04-agent-fabric-operational-hardening.md) v1.31 and
[Spec 05](../specs/05-project-fabric-console.md) v1.13 draft, after its
material post-v1.0 additions receive an exact authority trace or human
acceptance

This note overlays the pack's static baseline with the current Spec 05 delivery
context. It does not rewrite the original findings or promote anything under
[`proposals/`](proposals/) to accepted policy. Merge it only with or after the
owned Spec 01 v0.36 and Spec 04 v1.31 amendments.

Current `main` contains those draft amendments through consolidation merge
`941a72f`; that satisfies ordering only. It does not freeze or accept them.
Lane A's anchored audit and human-approved spec freeze remain prerequisites for
the ADR-0002 V2 authority cutover.

The original `ARTIFACT_MANIFEST.json` and `VALIDATION.*` receipts remain
byte-valid at import commit `798c800a57176e817a62c0f5690b63a5d7ed25f5`.
They intentionally exclude this later applicability overlay and its README
link; current local checks are reported below instead.

## Delivery decision

The pack does not justify a broad architecture, build-system, retention,
installer, replay or TUI decomposition inside the current delivery. Those
changes need a fresh scope and review session. This delivery owns four narrow
responses:

1. F-005 is fixed by making the root README report 33 portable skills and by
   testing that the reported count equals the live catalogue.
2. F-006 is narrowed to source truth: the Fabric traceability runbook now names
   Specs 01 v0.36, 04 v1.31 and 05 v1.13 without claiming their implementation,
   provider review or human acceptance is complete.
3. F-007 remains a current close-out check, not an implementation in this
   document branch. The security catalogue selects `sast` for source changes,
   while the shipped static scanner is Python-specific. A TypeScript delivery
   must not claim that scanner as TypeScript SAST evidence without a truthful
   tool, version and scope record.
4. F-018 is resolved for the portable orchestration surface by isolated commit
   `97d74d9dc92fe4073b2f42f97203ad1655ec9d0e`. Parallel fan-out now requires
   separable interfaces and writes, independently checkable returns and
   expected information gain greater than coordination cost; failing cases stay
   with the chair or one serial specialist. Nine topology fixtures and their
   static checker cover the serial/parallel boundary.

The owned v0.36/v1.31 exact-read, portal-custody and lifecycle-receipt
amendments reinforce F-001 and F-027's existing classifications. They do not
complete runtime implementation or justify reclassifying another finding.

## Finding matrix

`Current` means action or evidence is required before this delivery closes.
`Resolved` means the current Spec 05 seam or this narrow patch already addresses
the finding; it does not certify the whole delivery. `Deferred` means valid
follow-on work for a fresh session. `Conflict` means the recommendation cannot
be applied in this delivery without amending a binding specification.

| ID | Class | Current decision and evidence |
|---|---|---|
| F-001 | Conflict | Certifying review actions are deliberately read-only in Spec 01 and Spec 05. A managed write profile is future scope requiring an authority/specification amendment. |
| F-002 | Deferred | `runtime/agent-fabric/src/core/fabric.ts` remains about 7,400 lines. Bounded-context extraction is a large fresh-session refactor, not a Spec 05 close-out repair. |
| F-003 | Deferred | Tracked adapter compatibility still mixes portable policy with machine-local paths and digests. Splitting it requires a Spec 03-compatible activation and attestation design. |
| F-004 | Deferred | Consolidating lifecycle prose into an executable kernel crosses the constitution, skills, validators and specifications. Scope it independently after Spec 05. |
| F-005 | Resolved | The root README now reports 33 skills, and `tests/test_harness_contract.py` equality-checks the headline against `skills/*/SKILL.md`. |
| F-006 | Resolved | The narrow stale-source defect is fixed in `docs/runbooks/agent-fabric-traceability.md`. A full acceptance-to-evidence matrix remains fresh-session assurance work; current pending statuses are truthful. |
| F-007 | Current | Current run security evidence is unverified in this review. Verify the selected source checks and their actual language/tool scope before close-out; broader catalogue/SAST hardening is deferred. |
| F-008 | Deferred | Governed deletion and retention application are outside Spec 05, which currently forbids silent deletion. Design legal holds, preview and typed removal separately. |
| F-009 | Deferred | A typed approved backlog queue is not required by Spec 05 and needs its own authority, expiry and claim lifecycle. |
| F-010 | Resolved | The Spec 05 intake seam exists in `runtime/agent-fabric/src/project-session/intake-store.ts`. A broader harness-wide intake decision kernel remains follow-on scope. |
| F-011 | Deferred | Four runtime packages still have separate lockfiles. A workspace migration changes the build graph and belongs in the build-system follow-on. |
| F-012 | Deferred | Console `src/index.ts` remains large, but file decomposition is not a Spec 05 acceptance criterion. Preserve resize/render behaviour and split it in a fresh refactor. |
| F-013 | Deferred | The Fabric root export surface remains broad. Define supported subpath APIs after the Fabric context boundaries are settled. |
| F-014 | Conflict | Learned or Pareto route selection is explicitly nonbinding future work in Spec 05. Do not add it to the current deterministic route contract. |
| F-015 | Conflict | The approved four-slot profile requires Cursor/Grok and Agy/Gemini alongside native and Claude review. Removing those adapters would contradict this delivery. |
| F-016 | Conflict | Spec 05 mandates its four certifying slots. A general risk-adjusted review policy may be scoped later but cannot weaken the current profile. |
| F-017 | Deferred | Changing scope questioning across the portable skill library is harness-wide interaction design, not a Spec 05 repair. |
| F-018 | Resolved | Isolated commit `97d74d9dc92fe4073b2f42f97203ad1655ec9d0e` adds the explicit parallel fan-out value gate, nine static topology fixtures and mutation-style boundary tests. Its final independent native review was clean; this does not certify unrelated runtime work. |
| F-019 | Deferred | Typed emergency and irreproducible-incident exceptions alter diagnosis policy and require separate safety design. |
| F-020 | Resolved | Spec 05 already binds direct cutover with no legacy decoder or vintage retry. Generalising that pre-release rule in the refactor skill is follow-on skill work. |
| F-021 | Deferred | A machine-readable TDD exception record changes delivery receipts and validators and should be designed across profiles. |
| F-022 | Deferred | Long-run terminal/budget policy belongs to an `autonomous-lab` evaluation and policy session, not Console implementation. |
| F-023 | Conflict | Restructuring approved normative Specs 01, 04 and 05 during implementation risks requirement drift. Consolidate amendment history only through a new approved spec edit. |
| F-024 | Deferred | Cross-platform installer redesign is independent of Spec 05 and needs portability fixtures. |
| F-025 | Deferred | Constitution-loading and default-style policy affect every harness task and need separate evidence, not a delivery-local edit. |
| F-026 | Deferred | A generated hook policy and Fabric attestation surface crosses providers and activation; scope it after current provider gates are complete. |
| F-027 | Resolved | Specs 01 v0.36 and 04 v1.31 now state the same-user/cooperative-control limit and the authentic-runtime threat model. Current portal-custody implementation still needs its own gates. |
| F-028 | Deferred | A uniform staged-effect model crosses Git and other external effects. The current typed operator path remains the Spec 05 owner. |
| F-029 | Deferred | Runtime-verifiable worktree capability envelopes require a broader authority design; the current human-approved worktree envelope remains binding. |
| F-030 | Conflict | Outcome-learning and route economics are nonbinding future work in Spec 05 and must not alter current route selection. |
| F-031 | Conflict | Operator time-travel is not Spec 05 replay semantics. It requires a new projection/event-retention specification. |
| F-032 | Conflict | Spec 05 excludes a second UI. A provider-neutral native-UI projection contract requires new approved scope. |
| F-033 | Resolved | Console and Herdr package-boundary tests already forbid daemon/persistence internals across the Spec 05 seam. Broader intra-Fabric architecture tests follow F-002. |
| F-034 | Deferred | Lint, format and coverage policy should land with the workspace/build-system tranche so packages cannot diverge. |
| F-035 | Deferred | macOS/POSIX CI coverage is valuable but is a portability tranche, not a reason to weaken current local acceptance gates. |
| F-036 | Deferred | Branch-protection and required-check state were not verified from repository files. Audit live GitHub governance in the fresh repository-hardening session. |
| F-037 | Deferred | Independent human ownership policy and CODEOWNERS changes are governance decisions, distinct from Spec 05 model review. |
| F-038 | Deferred | Contribution guidance is productisation work for the fresh documentation/governance session. |
| F-039 | Deferred | A governed notes inbox needs promotion, expiry and privacy rules before implementation. |
| F-040 | Deferred | SBOM, provenance and signing belong to a separately authorised release/supply-chain tranche. Push and release are not authorised in this delivery. |
| F-041 | Resolved | Specs 03 and 05 already require live provider-backed and human usability evidence in addition to hermetic tests. Those gates remain pending; no fake test is presented as live proof. |
| F-042 | Deferred | Portable compatibility ranges versus exact local identity pins is coupled to F-003 and needs the same Spec 03 amendment. |
| F-043 | Deferred | Non-POSIX IPC is a portability architecture decision; current specifications deliberately use local Unix sockets. |
| F-044 | Deferred | Skill-description prose constraints are harness-wide routing policy and need trigger-quality evaluation before change. |
| F-045 | Deferred | A unified product CLI should follow command contract and build-system consolidation, not be added during Spec 05 close-out. |
| F-046 | Conflict | A runtime self-improvement loop would turn nonbinding learning into authority-bearing behaviour. It needs a new approved proposal/evaluation policy. |

## Fresh-session route

Use this dependency order for the larger work:

1. truth and security scope: F-007 full hardening, then F-036;
2. configuration and attestation: F-003 with F-042;
3. build and portability: F-011, F-034 and F-035;
4. architecture: broader F-033, then F-002, F-012, F-013 and F-028;
5. authority and lifecycle: F-001, F-004, F-008, F-009, broader F-010 and
   F-029;
6. installer, hooks, CLI and supply chain: F-024, F-026, F-040, F-043 and
   F-045;
7. remaining skill-policy changes: F-017, F-019, F-021, F-022, F-025 and
   F-044; and
8. spec-gated futures: F-014, F-016, F-023, F-030 through F-032 and F-046.

## Local overlay validation

The documentation/test overlay passed these focused checks in the isolated
`spec05-review-pack-docs` worktree:

- `pytest tests/test_harness_contract.py -q`: 27 passed;
- `pytest tests/test_command_docs.py -q`: 3 passed;
- `python3 scripts/check_harness.py`: pass with 33 skills and clean links;
- `git diff --check`: pass; and
- matrix check: 46 classified finding rows with no duplicate ID.

These checks validate this overlay only. They are not Spec 05 runtime, provider,
security or human-acceptance evidence.

F-018's separately owned patch was verified at
`97d74d9dc92fe4073b2f42f97203ad1655ec9d0e`:

- `PYTHONPATH=. pytest tests/test_orchestrate_value_gate.py -q`: 5 passed;
- `python3 skills/orchestrate/evals/check_skill_triggers.py`: pass with 23
  doctrine cases, 21 reference cases and 9 topology cases;
- `python3 scripts/check_harness.py`: pass with 33 skills and clean fixtures,
  links and sidecars;
- `PYTHONPATH=. pytest -q`: 444 passed; and
- final independent native review: clean, with no substantiated P0-P2.

This evidence certifies only the portable skill/evaluation repair. It does not
claim that the Spec 05 protocol, daemon, Console, provider or acceptance gates
are complete.

## Evidence boundary and review reconciliation

The current run directory `.agent-run/AFAB-004` is prohibited for this task and
was not read. Its security receipt, live provider evidence and acceptance map
therefore remain unverified here. The chair must check that evidence through an
authorised gate before delivery close-out. This note neither passes nor fails a
current `sast` claim.

The Claude review identified the F-007 scope mismatch as a current candidate and
the F-005/F-006 truth defects as narrow repairs. The Cursor review treated the
truth defects as outside Spec 05 and otherwise found no current blocker. The
human explicitly asked that relevant pack findings be applied during this
delivery, so the two objective truth defects are repaired; the security claim
remains an explicit current gate because its run evidence could not be
inspected. Neither model verdict is used as proof by itself.
