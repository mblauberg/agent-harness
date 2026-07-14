# Agent-harness comprehensive review checkpoint

Status: active

Effort: agent-harness-comprehensive-review

Leg: W018 and upstream reconciliation complete; resume at W005, then W007-W014

Supersedes: none

Consumed-at: pending

Updated: 2026-07-14

## Goal and authority

Implement the accepted agent-harness review on `comprehensive-review`, with
mutation-sensitive evidence and independent review. The programme remains
`RUN`; this is the human-directed early clean checkpoint in D-033, not W014
acceptance. Only the branch may be pushed. Do not push or merge `main`, open or
merge the final PR, release, deploy, change credentials, enable external-effect
profiles, or access/list/enumerate `.agent-run/AFAB-004`.

## Checkpoint outcome

- `origin/main` was reconciled at
  `1ddfe24858b362decb1c507b87a466df26d205eb`; the pre-sanitation merge commit is
  `7f73c0679b9dc6ee07ebd5ed1df931f5ef3f13bd`.
- W018 is verified and integrated oldest-first as `0bb25d5` + `054ae1a`.
  Its D-032 patch `8c16cf34...`, contained Opus artifact `2004d2bf...`, M6/M8
  kills, 140 combined tests and retained private-receipt hashes pass.
- D-033's final review then found a committer-only publication false clean.
  D-034 closes it with final release-checker/test hashes
  `f20849d3...`/`4828563b...`: one end-to-end RED→GREEN, four mutation kills,
  100 focused and 194 combined tests. Artifact bindings are in the private
  checkpoint receipt; remote branch presence requires the separate final
  Opus CLEAN re-review and exact-SHA gate replay to have completed.
- The upstream bootstrap conflicts preserve both machine-portable lab-root
  commands and the bounded idle/pause validator. Two independent read-only
  reviews returned CLEAN; the combined targeted suite passed 210 tests.
- Before D-034, `scripts/check-harness` passed 963 tests plus 425 subtests.
  The final pushed checkpoint must pass 964 plus 425 with the single new test,
  as well as spec-family, JavaScript, public-tree/range, static-security and
  diff gates.
- The dirty root checkout remains untouched at `main@1ddfe24`: the user's
  modified `SPEC05-APPLICABILITY.md`, `.review-snapshots/`, and queued
  `docs/provenant-re-review-2026-07-13/` remain outside this branch's work.
- D-033 requires the pushed checkpoint to be a single synthetic-identity commit
  whose sole parent is the current `origin/main`. The authoritative result is
  the remote `comprehensive-review` ref, not a self-referential SHA in this
  document. If that ref is absent or differs from the local branch, the
  checkpoint push did not complete and must be reconciled before new work.

## Resume protocol

1. Read `HARNESS.md`, the review `CHAIR-CHARTER.md`, lab `GOAL.md`, `STATE.md`,
   `DECISION_QUEUE.md`, `.orchestrator/runs.md`, and this handoff.
2. Fetch without mutating `main`, then verify the checkpoint:

   ```sh
   git fetch origin main comprehensive-review
   git rev-parse origin/main origin/comprehensive-review
   git merge-base --is-ancestor origin/main origin/comprehensive-review
   python3.11 scripts/public_release_check.py --publication-range origin/main origin/comprehensive-review
   ```

3. Acquire/renew `lab/LEASE.json`, reconcile live panes/agents, inspect every
   owned worktree, and re-check the dirty root invariant before dispatch.
4. Continue W005 from its frozen D-031 stage. Do not regenerate or broaden it.

## Ordered remainder

1. W005 D-031: fresh contained Opus exact-stage review.
2. W005 D-029 classifier GREEN: exact `(run, adapter, action)` custody and a
   live same-action/different-adapter collision oracle.
3. W005 D-031 one-cause preflight RED, coordinator GREEN, then the serial
   lifecycle direct cut and full Fabric cascade.
4. W007 local/security evidence now; per D-035, bind hosted Linux/macOS, Linux
   mutation and final-SHA receipt evidence on the single W014 PR head because
   the workflow has no manual trigger and a branch push launches no jobs.
5. W008 `AuthorityEnvelopeV2` direct cutover.
6. W009 pure `AuthorityCompiler` extraction.
7. W010 fixed containment matrix and council verdict.
8. W011 second provider, then provider-action extraction.
9. W012 reconcile remaining tranches 2-9 and every open finding.
10. W013 programme-wide deterministic, security, evaluation, load, live MCP,
    four-family and 80x24 usability gates.
11. W014 final upstream reconciliation, evidence index, branch update and the
    single PR; the human alone merges it.
12. Migrate surviving decisions/evidence to permanent ADR/spec/effort owners,
    verify no live links or open W-items target the review directory, then prune
    the original pack/lab/proposals and retain only a compact archive/redirect.
13. Only after this programme's terminal handoff, adjudicate and implement
    `docs/provenant-re-review-2026-07-13` under the same lifecycle.

## Frozen W005 bindings

- Worktree: `.worktrees/lane-d-preflight-fixtures`
- HEAD: `cab6d8d801487038bc513bbac472a583df61f236`
- Stage: `7d779d02c8fb54e54a8efaaa3379aee9a54c8bd070dfc64ca7b39a17bbe75fc2`
- Source: `4f334ff1c52039eedf93d24478af72263d96c3d997def71dad77704bbb9eb2b7`
- Test: `55c335b564ed995c7ca5e24276d67bb2c9f753b3d55b38203cc07684d3ec2269`
- RUN: `d3726da227b69aae633a6f65d75b17668a69de6e81c7826fa45b665d62fcddcc`

## Exact verification

```sh
git diff --check
scripts/check-harness
python3.11 scripts/public_release_check.py
python3.11 scripts/static-security-check.py
node docs/agent-harness-comprehensive-review/lab/tools/gen-dashboard.mjs --check
```

The review directory is intentionally retained: W005-W014, especially W012 and
W013, still cite its findings, decisions, challenges and lab ledger. Completed
W018/D-033 containment snapshots were pruned; D-034 author/final-review
snapshots are pruned once their private artifacts are reconciled. The W005
snapshot and all programme worktrees remain live.
