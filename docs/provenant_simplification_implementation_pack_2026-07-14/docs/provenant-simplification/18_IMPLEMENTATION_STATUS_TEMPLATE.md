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

This programme **adopts live work; it does not reset it.** Every lane below is
live in `docs/efforts/` as at 14 July 2026. No lane starts at zero, and no lane
is superseded by this pack — the pack supersedes the comprehensive-review
programme documents only (see `15_DECISION_REGISTER.md`, crosswalk).

Adoption rules:

- **Carry proven evidence forward by digest.** Cite the commit, PR or receipt
  that proved it; an evidence claim without a digest is not evidence.
- **Never credit completion without current verification.** A `[x]` in an effort
  file is a historical result against a historical baseline. It re-enters this
  programme as `carried` and becomes `verified` only after re-running its gate on
  the current head.
- A lane maps to exactly one pack WP **or** to an explicit supersession with a
  named replacement. Blank is not an allowed value.

| Live lane | Owner effort | Gate | Evidence artefact (by digest) | Residual | Adopted as |
|---|---|---|---|---|---|
| Lane A — spec authority | `EFFORT-capability-profiles.md` | Specs 01 v0.36 / 04 v1.31 freeze; council-resolved write-profile amendment | `docs/specs/amendment-audit-2026-07-13.md` (8/9 leads substantiated, 10 missed defects, 11 fixture-reproduced); repairs MF04-1 (P0), MF04-2, lead 9, lead 2 FK-mismatch landed | structural repairs (leads 1,3,4,5,6,7,8; lead-2 evidence-carry; MF04-3/4/5/6; MF01-1/3/4), freeze, spec-family split, write-profile amendment | WP1 (hard prerequisite of WP3) |
| Lane B — foundations/build | `EFFORT-capability-profiles.md` | clean-checkout build + `scripts/agent-fabric status` proof; unchanged 5 MiB release gate | PR #7; rebase build `6d88713` on `main@24ceb83`; first accepted artifact `2db4f5a`; protocol schema 2,061,826 bytes; Protocol 46 files/785 tests, Herdr 10/45, Console 20/259, 458-test harness gate | human PR-review merge of #7 | WP0 |
| Lane C — Step-1 authority contract | `EFFORT-capability-profiles.md` | Lane A freeze; non-overlapping runtime baseline | read-only characterisation goldens, commit `6748ceb` | `AuthorityEnvelopeV2` direct cutover — **BLOCKED**; resume only via `docs/handoffs/HANDOFF-2026-07-13-capability-profiles-v2.md` gates | WP2 (feeds WP3) |
| Lane D — runtime reconciliation | `EFFORT-capability-profiles.md` | TDD repair after Lane B integration | reproduction on the Lane B rebase: 149 Fabric files/1,054 tests pass; **30 files/162 tests fail, 14 unhandled errors** | **RED.** Five families: predecessor routing/review evidence stores; `lifecycle_rotation_custody` custody contract; `provider_action_pair_preflights` parent; authority enum vs current MCP registry; stale Claude/Codex adapter closure manifests | WP0 (baseline must be green before it is called truth) |
| Rust CI reconciliation | `EFFORT-capability-profiles.md` | both hosted targets green | — (no passing receipt) | **RED.** Linux clippy cfg/conversion/credential-field lints; macOS portal relay two-second helper deadlines and one unbounded broker accept | WP0 (kept off the Lane B build graph) |
| Step 2 — admission extraction | `EFFORT-capability-profiles.md` | read-only behaviour unchanged; starts after Lane C | — (not started) | whole step | WP3 |
| Step 3 — one-provider offline write pilot | `EFFORT-capability-profiles.md` | pre-approved adversarial containment spike (`25_AUTHORITY_V2_AND_CONTAINMENT.md`); D-019 isolation attestation is a **hard gate** | — (not started) | whole step | WP3 |
| Step 4 — second provider | `EFFORT-capability-profiles.md` | same containment gate; merged `ProviderActionDispatchInputV1` | — (not started) | whole step, plus provider-action structural extraction | WP5 |
| Spec 05 close-out, legs 1-4 | `EFFORT-project-fabric-console.md` | Spec 05 §15 `spec05-four-slot-v1` four-slot profile (binding) | consolidated WIP on local `main` from the `c2fc623` approval baseline | legs 5-8: serial integration; clean gates + live MCP round-trip; four-family certifying review; human 80×24 evaluation and final acceptance | carried under its own effort; its review profile is the surface the WP5 review-policy migration must amend |
| Delivery kernel (Spec 02) | `EFFORT-harness-lifecycle-refactor.md` | awaiting human acceptance | `delivery-run` v1, `config/delivery-profiles.json`, `skills/deliver/scripts/validate_delivery.py` | human acceptance | WP2 — **canonical lifecycle owner (ADR 0005); extended, never re-implemented** |
| Specs 01/03/04 Fabric baseline | `EFFORT-agent-fabric.md`, `-activation`, `-operational-hardening` | awaiting human acceptance | shipped runtime baseline | human acceptance | WP0 baseline verification |
| Skill portfolio | `EFFORT-skill-portfolio-2026.md` | awaiting human acceptance | audit outputs | human acceptance | WP6 |

## Work-package status

Seeded from the adoption table. `carried` = live evidence exists but has not been
re-verified on the current head; it is not `done`.

| Package | State | Owner | Branch/worktree | Evidence | Blocking issue | Next action |
|---|---|---|---|---|---|---|
| WP0 current truth | in-progress | capability-profiles chair |  | Lane B: `6d88713` / PR #7 (carried) | Lane D and Rust CI are RED | Re-verify Lane B on current head; repair Lane D families by TDD |
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
