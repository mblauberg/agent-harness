# Implementation status

Copy and update this file as the canonical programme status.

## Current state

- Date:
- Repository head:
- Integration branch:
- Chair:
- Other-primary reviewer:
- Current work package:
- Governance level:
- Effective authority:
- Human decision pending:

## Lane adoption

This programme **adopts live work; it does not reset it.** Every lane below is live
in `docs/efforts/` as at 14 July 2026, except Lane B, which is already merged and is
recorded complete rather than re-adopted. No lane starts at zero, and no lane is
superseded by this pack — the pack supersedes the comprehensive-review programme
documents only (see `15_DECISION_REGISTER.md`, crosswalk).

The WP0 lane gate in `09_WORK_PACKAGES_AND_SEQUENCE.md` is the authority for this
table; this table conforms to it.

Adoption rules:

- **Carry proven evidence forward by digest.** Cite the commit, PR or receipt that
  proved it; an evidence claim without a digest is not evidence. Where a cell is
  genuinely not established, write `unknown — must be established in WP0`; blank and
  `—` are not allowed values.
- **Historical completion is not current-head reverification** (`09 §WP0`). A lane
  whose gate passed at a digest reachable from the current head is `complete`: it is
  recorded, not re-adopted. Re-running its gate on the current head is a separate
  WP0 baseline item, and its absence does not make the completion unverified.
- **Never credit an unmerged historical `[x]` as done.** A `[x]` in an effort file
  whose evidence is *not* reachable from the current head is a historical result
  against a historical baseline. It re-enters as `carried` and becomes `verified`
  only after re-running its gate on the current head.
- A lane maps to exactly one pack WP, **or** is recorded `complete`, **or** is an
  explicit supersession with a named replacement. Blank is not an allowed value.

Status vocabulary: `complete` (gate passed at a digest reachable from the current
head), `carried` (live evidence, not re-verified on the current head), `red`
(reproduced failing), `not-started`, `superseded` (replacement named).

| Lane | Status | Owner | Gate | Evidence (digest-bound) | Residual | Adopted as |
|---|---|---|---|---|---|---|
| Lane A — spec authority (`EFFORT-capability-profiles.md`) | `carried` | capability-profiles chair | Specs 01 v0.36 / 04 v1.31 freeze; write-profile spec amendment. Its adoption is **pending the D-021 human ruling** — the D-021 §6 gate-supersession is not assumed (`09 §WP0`) | `dab4697` (lead-2 FK-mismatch repair; fixture evidence and repair status recorded) landing repairs MF04-1 (P0), MF04-2 and lead 9 against `docs/specs/amendment-audit-2026-07-13.md` (8/9 leads substantiated, 10 missed defects, 11 fixture-reproduced) | structural repairs (leads 1,3,4,5,6,7,8; lead-2 evidence-carry; MF04-3/4/5/6; MF01-1/3/4), freeze, spec-family split, write-profile amendment | WP1 (hard prerequisite of WP3) |
| Lane B — foundations/build (`EFFORT-capability-profiles.md`) | `complete` | capability-profiles chair | clean-checkout build + `scripts/agent-fabric status` proof; unchanged 5 MiB release gate — **passed; merged** | merge `90a10f7` ("Merge pull request #7"), an ancestor of head `42da7ee`; rebased build `6d88713` on `main@24ceb83`; protocol schema 2,061,826 bytes; Protocol 46 files/785 tests, Herdr 10/45, Console 20/259, 458-test harness gate | none for the lane — PR #7 is merged, so no PR-review merge is outstanding. Separate open item: current-head reverification of its build/status gate on `42da7ee` (a WP0 baseline obligation, not a lane residual) | **not re-adopted** — recorded `complete` per `09 §WP0` |
| Lane C — Step-1 authority contract (`EFFORT-capability-profiles.md`) | `carried` (cutover **BLOCKED**) | capability-profiles chair | Lane A freeze; non-overlapping runtime baseline | read-only characterisation goldens `6748ceb` (ancestor of head) | `AuthorityEnvelopeV2` direct cutover — **BLOCKED**; resume only via `docs/handoffs/HANDOFF-2026-07-13-capability-profiles-v2.md` gates | WP2 (feeds WP3) |
| Lane D — runtime reconciliation (`EFFORT-capability-profiles.md`) | `red` | capability-profiles chair | TDD repair after Lane B integration; green Fabric suite on the current head | reproduction on the Lane B rebase `6d88713`: 149 Fabric files/1,054 tests pass; **30 files/162 tests fail, 14 unhandled errors**. No passing receipt: `unknown — must be established in WP0` | five families: predecessor routing/review evidence stores; `lifecycle_rotation_custody` custody contract; `provider_action_pair_preflights` parent; authority enum vs current MCP registry; stale Claude/Codex adapter closure manifests | WP0 (baseline must be green before it is called truth) |
| Rust CI reconciliation (`EFFORT-capability-profiles.md`) | `red` | capability-profiles chair | both hosted targets green | `unknown — must be established in WP0` (failures are described in `EFFORT-capability-profiles.md`, but no digest-bound receipt exists) | Linux clippy cfg/conversion/credential-field lints; macOS portal relay two-second helper deadlines and one unbounded broker accept | WP0 (kept off the Lane B build graph) |
| Step 2 — admission extraction (`EFFORT-capability-profiles.md`) | `not-started` | capability-profiles chair | read-only behaviour unchanged; starts after Lane C | none — not started; no receipt to carry | whole step | WP3 |
| Step 3 — one-provider offline write pilot (`EFFORT-capability-profiles.md`) | `not-started` | capability-profiles chair | pre-approved adversarial containment spike (`25_AUTHORITY_V2_AND_CONTAINMENT.md`); D-019 isolation attestation is a **hard gate** | none — not started; no receipt to carry | whole step | WP3 |
| Step 4 — second provider (`EFFORT-capability-profiles.md`) | `not-started` | capability-profiles chair | same containment gate; merged `ProviderActionDispatchInputV1` | none — not started; no receipt to carry | whole step, plus provider-action structural extraction | WP5 |
| Spec 05 close-out, legs 1-4 (`EFFORT-project-fabric-console.md`) | `carried` | console chair | Spec 05 §15 `spec05-four-slot-v1` four-slot profile (binding) | consolidated WIP on local `main` from approval baseline `c2fc623` (ancestor of head); session closed at `d7f3536` | legs 5-8: serial integration; clean gates + live MCP round-trip; four-family certifying review; human 80×24 evaluation and final acceptance | carried under its own effort; its review profile is the surface the WP5 review-policy migration must amend |
| Delivery kernel, Spec 02 (`EFFORT-harness-lifecycle-refactor.md`) | `carried` | harness-lifecycle chair | human acceptance | `1ddfe24` — `delivery-run` v1, `config/delivery-profiles.json`, `skills/deliver/scripts/validate_delivery.py` | human acceptance | WP2 — **canonical lifecycle owner (ADR 0005); extended, never re-implemented** |
| Specs 01/03/04 Fabric baseline (`EFFORT-agent-fabric.md`, `-activation`, `-operational-hardening`) | `carried` | agent-fabric chair (one owner across the three efforts) | human acceptance | shipped runtime at head `42da7ee`; review-invariant baseline `e28e2e7`. Acceptance receipt: `unknown — must be established in WP0` | human acceptance | WP0 baseline verification |
| Skill portfolio (`EFFORT-skill-portfolio-2026.md`) | `carried` | skill-portfolio chair | human acceptance | `8051f94` (flatten skill schemas and routing); `1ddfe24` (simplify skill audits and lifecycle gates) | human acceptance | WP6 |

Every digest above was checked reachable from head `42da7ee` with
`git merge-base --is-ancestor`. The pre-rebase Lane B artifact `2db4f5a` is **not**
reachable from `main` and is therefore not cited as evidence; the rebased build
`6d88713` and the merge `90a10f7` supersede it.

## Work-package status

Seeded from the adoption table. `carried` = live evidence exists but has not been
re-verified on the current head; it is not `done`. A `complete` lane is not seeded
here as work; only its current-head reverification is.

| Package | State | Owner | Branch/worktree | Evidence | Blocking issue | Next action |
|---|---|---|---|---|---|---|
| WP0 current truth | in-progress | capability-profiles chair |  | Lane B complete at merge `90a10f7` (ancestor of head `42da7ee`); its current-head reverification is still outstanding | Lane D and Rust CI are RED | Run the current-head baseline, including reverification of the Lane B build/status gate; repair Lane D families by TDD |
| WP1 design ratification | in-progress | chair |  | ADRs 0001-0008 accepted 2026-07-13 | PS-017 pending human decision; Lane A spec freeze outstanding | Ratify PS-018/019/020; land Lane A structural repairs and freeze |
| WP2 contracts/lifecycle | in-progress | capability-profiles chair |  | Lane C goldens `6748ceb` (carried) | `AuthorityEnvelopeV2` cutover blocked on Lane A freeze + runtime baseline | Clear the capability-profiles-v2 handoff gates |
| WP3 offline write pilot | not-started |  |  |  | Blocked on WP1 (Lane A) and WP2 (Lane C) | Hold; containment spike is a hard gate |
| WP4 WorkItem-to-PR | not-started |  |  |  |  |  |
| WP5 second provider/review | not-started |  |  |  | Spec 05 four-slot profile binding until the atomic review-policy migration lands | Sequence the migration with the Console close-out |
| WP6 Skills/docs simplification | not-started |  |  |  | PS-020 (work-store identity) undecided | Hold the `docs/efforts/` move until PS-020 is ratified |
| WP7 effects/portability | not-started |  |  |  |  |  |
| WP8 evaluation/deletion | not-started |  |  |  |  |  |

## Current decisions

Link to `15_DECISION_REGISTER.md` and repository ADRs.

## Current checks

| Check | Command | Result | Commit | Evidence |
|---|---|---|---|---|
| Root clean install |  |  |  |  |
| Harness gate |  |  |  |  |
| Protocol |  |  |  |  |
| Fabric |  |  |  |  |
| Console |  |  |  |  |
| Herdr |  |  |  |  |
| Rust supervisor |  |  |  |  |
| Architecture boundaries |  |  |  |  |
| Provider conformance |  |  |  |  |
| Containment |  |  |  |  |
| Live provider smoke |  |  |  |  |

## Active risks

| Risk | Probability | Impact | Mitigation | Owner | Status |
|---|---|---|---|---|---|

## Deletion register

| Surface | Delete condition | Test/evidence | Owner | Status |
|---|---|---|---|---|

## Human decisions

Open as at 14 July 2026; keep in step with `15_DECISION_REGISTER.md`.

| Decision | Recommended default | Alternatives | Consequence | Needed by |
|---|---|---|---|---|
| D-021 charter carry-over to this programme | Treat §7 preserved boundaries as still in force | Charter lapses with the superseded programme; or carries over intact | Determines whether PR review is the only human gate | Before any WP3 write-pilot leg |
| PS-017 `DecisionRequest` / scope-delta semantics | Reject silent delegation: reversible, non-material deltas only; material acceptance stays human-gated | Adopt `21_DECISION_DELEGATION.md` as drafted | Determines who may resolve a Class B delta | WP1 ratification |

## Next session handoff

- Outcome:
- Non-goals:
- Approved digest:
- Authority digest:
- Current state:
- Source owners:
- Artefacts:
- Checks:
- Open blockers:
- Next exact action:
- Remaining budget:
- Recovery instruction:
