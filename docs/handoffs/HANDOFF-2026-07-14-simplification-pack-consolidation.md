# Provenant simplification pack consolidation — scoping close-out

Status: **scoping complete**. Implementation outstanding, tracked as GitHub issues.

Date: 15 July 2026

Chair: Claude (Opus 4.8). Cross-family: pair-codex (gpt-5.6-sol) via Herdr pane
`w5:p16`, cwd `~/.agents`.

Consumed-at: 2026-07-15. This handoff supersedes its own earlier "active" state.

## What this session closed

The scoping is finished. `docs/provenant_simplification_implementation_pack_2026-07-14/`
is now the single surviving implementation plan, the two superseded review
programmes are deleted, the normative decisions are recorded as ADRs, and every
piece of remaining *implementation* work is a GitHub issue. No implementation was
done, by design.

### Landed on `main`

| Commit | What |
|---|---|
| `42da7ee` | H2b — the ten adjudicated pack repairs (codex findings 1,2,4,5,6,7,9,10 + native P2s) |
| `428d231` | H2b-r2 — the two regressions and four gaps the cross-family review found in `42da7ee` |
| `3656240` | Recoverability — tracked the untracked re-review dir and the outstanding SPEC05 edit; ignored `.review-snapshots/` |
| `701d663` | H4 — deleted both superseded review programmes |
| `eb2fbc9` | ADRs 0009 and 0010; ADR-0007 amendment |
| `e7fdf20` | This handoff |
| `91d73fe` | Merged `comprehensive-review` selectively: kept the live lab, rejected the spec split |
| `4a05919` | Carried the worktree's uncommitted live state (D-035, D-036, W005/W007/W012) into `docs/lab/` |

All pushed to `origin/main`. `scripts/check-harness`: **608 passed**.

### The lab moved, and the branch is gone

`comprehensive-review` is **merged and pruned** — worktree, local branch and remote
branch all deleted. The live lab moved from
`docs/agent-harness-comprehensive-review/lab/` to **`docs/lab/`** and now lives on
`main`, with a durable home that does not depend on a worktree. Its internal
self-references and link depths were rewritten for the new location.

Two things this protects:

- The supersession can no longer be undone. There is no branch left from which the
  W014 PR could re-add the deleted review directory (issue #19, closed).
- The worktree held **uncommitted** programme state that a plain merge of the branch
  tip would have destroyed: decisions **D-035** and **D-036**, and current W005/W007/
  W012 status. It was captured to `docs/lab/` in `4a05919` before the prune.

The spec-family split, `scripts/check_spec_families.py`, `tests/test_spec_families.py`
and `tests/spec_fixtures/` were **not** merged — they are coupled (the fixtures load
spec text through `load_family_text()`, so they cannot collect without the family
manifests) and the split is rejected by ADR 0009. All of it is recoverable:
`d773cf0` is an ancestor of `main`, so `git show d773cf0:<path>` restores any of it.
`check_spec_families.py` is consequently **not wired into `check-harness`** today;
re-wire it when the split lands per ADR 0009.

### Review record

- `review/pair-codex-findings.md` — round 1 (0 P0, 8 P1, 2 P2)
- `review/ADJUDICATION.md` — every finding ruled on
- `review/pair-codex-h2b-verification.md` — verified `42da7ee`: 2 SATISFIED,
  4 PARTIAL, **2 REGRESSED**. All six repaired in `428d231`.
- `review/pair-codex-closeout-verification.md` — verification of this close-out.

The second review round earned its keep: it caught two regressions I introduced
(WP4 could not derive a valid ReviewPlan under binding policy; the adoption table
contradicted WP0 on Lane B). Do not skip the verification leg on pack edits.

## New normative decisions

- **ADR 0009 — spec families are unnumbered durable topic modules.** Modules are
  named for what they own (`authority.md`, `run-lifecycle-and-gates.md`,
  `effects.md`), never for their position. `…-continued-N` is rejected: a
  line-chop is not a semantic fold. Repair and freeze before any text moves.
- **ADR 0010 — the lifecycle receipt authority is a trust boundary distinct from
  provider authority compilation.** Resolves the apparent W005 → W008 circular
  dependency: it is an artefact of three unrelated things sharing the word
  "receipt", not a real edge in the schema.
- **ADR 0007 amended** — records the prose-name → machine-identifier mapping
  (`durable knowledge` → `durable-knowledge`). Five classes unchanged.

## Outstanding work — all implementation, all ticketed

**Do not start these without reading the issue.** Each carries file:line anchors,
a concrete failure scenario and a minimal fix.

### W005 provider-action admission — defects found in independent review

The structural refactor is sound (single writer, pair keying, preflight before
the outer transaction, digest identity). The defects cluster in one place:
**failure handling around `release()`**. Because `released` is terminal and two
caller families derive their `actionId`, releasing on a *transient* error is a
permanent denial-of-service on that pair.

- **#8 (P0)** — one transient capability failure permanently freezes an operator
  control pair; the operator can never pause or cancel that turn again
- **#9 (P0)** — Herdr principal generation drifts with presence polls, so exact
  replay is permanently unreachable
- **#10 (P1)** — launch-custody and Herdr never release a failed preflight
- **#11 (P1)** — budget-error conversion launders the error type and permanently
  releases the pair
- **#12 (P1)** — cleanup releases admitted tickets; lifecycle-release releases
  after commit
- **#13 (P1)** — the migration drops the preflight `run_id` foreign key
- **#14 (P1)** — a positive fixture bypasses the admission coordinator

### W005 lifecycle direct cut

- **#15** — retire the dead `engine.ts` island (4,425 lines, zero SQL, zero
  production importers), split the receipt/authority ledger out of the 1,016-line
  god `rotation-repository.ts`, delete the empty `recovery-repository.ts`.
  **Port `tests/spec05/lifecycle/` onto the repositories first** — those tests are
  the only durable statement of the Spec 03/04 invariants. Deleting first keeps
  the corpse and loses the specification.

### Specs

- **#17 — Lane A structural DDL repairs and freeze.** This is the gate. It blocks
  both the spec split (ADR 0009: repair and freeze before text moves) and the
  Lane C `AuthorityEnvelopeV2` cutover.
- **#16 — redo the spec split** as unnumbered durable topic modules. The attempt
  on `comprehensive-review` (`d773cf0`) is not adoptable: numbered modules,
  sixteen `-continued-N` line-chops, specs 01+04 grew 18,187 → 23,827 lines, and
  family versions were bumped to 0.37/1.32 **while the freeze gate is still open**.
- **#18 — review the 2,523-line `check_spec_families.py`** against ADR 0009 rather
  than rebuilding it.

### Programme hygiene

- **#19 — W014 must drop `docs/agent-harness-comprehensive-review/` on the
  `comprehensive-review` branch before its evidence-index PR merges**, or the merge
  will re-add the directory to `main` and silently undo the supersession.

## Open human decisions (unchanged, still yours)

From `review/ADJUDICATION.md`. None currently block the ticketed work.

1. **D-021 charter carry-over** to this programme. Until ruled, §7 boundaries stay
   in force and the stricter (pack) approval reading applies.
2. `AuthorityEnvelopeV2` name stability vs an equivalent replacement.
3. Whether the spec family manifests are permanent or transitional entry points.
4. Accept/reject DecisionRequest + scope-delta semantics as pack policy
   (drafted in pack `21_DECISION_DELEGATION.md`; recorded as PS-017).

## Known state and degradations

- `scripts/check-harness` was **already red before this session** on a personal
  absolute path in this handoff; fixed here. Re-run to confirm green.
- `.worktrees/net-current-consolidation` existed at session start and was removed
  mid-session by another agent. The spec-split artefacts it carried now live on
  `comprehensive-review`.
- `FABRIC-ROUNDTRIP-UNAVAILABLE` for the whole run: cross-family exchange ran via
  named artifacts plus bounded pane reads, not Fabric request/reply.
- Codex subagent model family remains unattested — the collaboration interface
  exposes no per-agent effective-model receipt. Recorded as a substitution; no
  Luna coverage is claimed.
- Five worktrees are active. Never write to `.worktrees/`; never run
  `git checkout/restore/stash` on shared state.

## Resume prompt

```text
Scoping for the Provenant simplification programme is complete (see
docs/handoffs/HANDOFF-2026-07-14-simplification-pack-consolidation.md). The pack at
docs/provenant_simplification_implementation_pack_2026-07-14/ is the single plan.
All remaining work is implementation, ticketed as GitHub issues #8-#19.

Pick up the highest-value gate first: issue #17 (Lane A structural DDL repairs +
freeze). It blocks both the spec split (#16) and the Lane C V2 cutover. It is a
crucial-tier programme in its own right — run it as a dedicated /implement leg with
executable SQLite fixture evidence and a cross-family certifying review, per
docs/specs/amendment-audit-2026-07-13.md.

The W005 admission defects (#8-#14) are independent of that gate and can run in
parallel by a different agent. #8 and #9 are P0.

Read docs/adr/0009 and 0010 before touching specs or lifecycle authority.
```
