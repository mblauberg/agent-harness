# STATE — orchestrator heartbeat
Updated: 2026-07-14T10:13:00Z

> **RELOCATION (2026-07-15, main@91d73fe).** This lab moved from
> `docs/agent-harness-comprehensive-review/lab/` to `docs/lab/` and now lives on
> `main`. The `comprehensive-review` branch and worktree are merged and pruned —
> do not fetch, verify or resume from them. The review programme that wrapped this
> lab is superseded and deleted; the lab itself is not.
>
> Two claims in the resume protocol below are now stale: `main` is no longer dirty
> at `1ddfe24` (it is clean at `91d73fe`), and the `SPEC05-APPLICABILITY.md` edit
> plus the re-review docs are no longer "untouched" — they were committed to history
> (`3656240`) and then superseded (`701d663`), with their content extracted into
> `docs/provenant_simplification_implementation_pack_2026-07-14/`.
>
> The spec-family split this programme produced was **not** adopted (ADR 0009);
> `scripts/check_spec_families.py`, `tests/test_spec_families.py` and
> `tests/spec_fixtures/` are coupled to it and were not merged. All are recoverable
> with `git show d773cf0:<path>`. See issues #16, #17, #18.
<!--
  ORCHESTRATOR-OWNED. Rewritten every iteration. This is the durable memory that
  SURVIVES context compaction — anyone (a human, or a fresh orchestrator session)
  must be able to resume the run from THIS FILE ALONE. If it isn't written here,
  it does not exist. Re-read this at the start of every loop (OPERATING_MANUAL §2).

  Two parts: (1) a small mutable HEARTBEAT header at the top that you OVERWRITE
  each iteration with the current truth; (2) a newest-first HOT NOTE WINDOW below
  it. Keep five notes here. Rotate older notes verbatim, exactly once, into the
  indexed .orchestrator/history/ ledger. The heartbeat is the source of "where
  are we right now"; history holds the full trail.
-->

## Heartbeat (OVERWRITE this block every iteration)

- **Run status:** RUNNING — the public-safe checkpoint remains exact locally/remotely at `d773cf02...` with its fresh replay and contained Opus rebind CLEAN. W005 D-031 is committed as `209e95f`; D-029 is independently native/Opus CLEAN and committed as `12247d8` with exact staged/commit diff `0d366adc...ec02`. Its cross-adapter and terminal-task oracles pass, typecheck passes, and the synchronous preflight tracer now reaches the capability hook and fails only because the `resolving` preflight is absent, with zero unhandled errors.
- **Orchestrator lease:** Codex root chair · generation 75 · renewed 2026-07-14T10:12:46Z · expires 2026-07-14T10:27:46Z. Generation 66 expired during the session boundary; the same holder reacquired generation 67 after proving no competing holder or mutation, then renewed through generation 75.
- **Iteration:** 1.
- **This iteration:** Recovered and re-certified the exact checkpoint, closed its final-review evidence gap, committed the frozen D-031 boundary oracle, then executed D-029's four-step right-reason ladder through exact pair classification. Fresh native and Claude exact-stage reviews are CLEAN; Claude's artifact is `be1749fd...` and the native artifact binds the same full 64-character stage digest.
- **In flight:** None. W005 source is at clean `12247d8`; the next mutation is the separately bounded coordinator GREEN. W007 hosted/final-SHA gates cannot launch before the single W014 PR because the workflow has no manual trigger; they remain honestly pending.
- **Next up:** Implement the W005 canonical preflight coordinator from the now-single-cause RED, migrate every production/fixture action writer and pair read, then take the serial lifecycle direct cut and full Fabric cascade. Preserve the honest transitional label for non-routed lifecycle journals until W008-W011 supply the frozen authority-compilation receipt binding. Route D-036's annotated-tag and duplicate-parser P2s into W012 rather than reopening the valid branch checkpoint.
- **Open forks:** No open fork. Chair accepted reversible structural packaging but rejected the false F-023 closure claim; semantic consolidation is a separate W017 work unit, not a bounded repair fork.
- **Blockers / escalations:** No human blocker. Native security-sensitive review is platform-content-blocked and native agent credits also report exhausted; per direct human instruction these legs route to Opus without native retries. Two earlier Opus passes violated the live-repository all-ref-history boundary and are discarded; the current pass is capability-contained. One unrecorded native topology helper also enumerated private path names despite its boundary; no contents were read, its private output is discarded, and chair re-proved only allowlisted non-private topology. Preserved hard stops: any genuine external-effect authority expansion or AFAB-004 need; final PR review/merge remains human-only.
- **Spend checkpoint (§0a):** W004/W006/W015/W016 completed on first pass. W002's three exploratory jobs converged on NOT CLEAN/PARTIAL; repair cycle 1 was dual-primary CLEAN, chair staging caught an untracked-file whitespace blind spot, and final cycle 2/2 is independently CLEAN. W017's bounded cycle-2 corrections and exact-candidate reviews are CLEAN and locally integrated. W018 closed all D-030/D-032 findings: the final production repair is independently CLEAN and the only two residual test gaps now have right-reason mutation kills. W007 source cycle 1 and both mandatory primary reviews are CLEAN with no repair cycle; hosted proof remains pending.
- **Queued human follow-on:** Only after this active programme reaches its authorised terminal handoff, read and execute `docs/provenant-re-review-2026-07-13` as a new full review/implementation programme. Independently decide its proposed changes, implement every accepted change thoroughly, and use the same TDD, dual-primary, receipt, integration and acceptance process. Read its nearest authority docs before choosing branch or promotion mechanics.
- **Resume protocol:** Read this file, `GOAL.md`, queue head, `.orchestrator/runs.md`, `HANDOFF.md` and the canonical `docs/handoffs/HANDOFF-2026-07-14-agent-harness-comprehensive-review.md`; renew/acquire `LEASE.json`; fetch and verify remote `comprehensive-review`, then inspect every owned worktree. Preserve dirty root `main@1ddfe24`: the user's modified `SPEC05-APPLICABILITY.md` and queued re-review docs are untouched. Reconcile live agents before re-dispatch. Never access/list/enumerate `.agent-run/AFAB-004`.

> **STOP handling:** when `GOAL.md` STATUS flips to STOP, the final heartbeat must
> state the terminal truth (build-ceiling reached, the escalation-gated remainder,
> where the next agent/human starts) and `HANDOFF.md` must agree. GOAL + STATE +
> HANDOFF agreeing on the terminal truth is the finish gate.

---

## Hot note window (newest-first — maximum five; rotate older notes verbatim)

<!--
  Convention for each entry (keep them dense; this is a ledger, not an essay):
    - **Note (iter<N>): <headline — what landed / what was caught>.** <1–4 sentences
      of detail: the result, the evidence (test counts, cross-family verdict,
      RED-on-mutation proof), any decision/fork spawned, what was dispatched next.>
  Flag corrections explicitly: if a later iteration finds an earlier note
  over-claimed (e.g. "done" while buildable work remained, or a gate was a
  placebo), write a NEW note that says "⚠️ COURSE-CORRECT — iter<M>'s X was
  over-claimed" and leave the old note in place (the trail of the mistake is
  valuable). Use ⚠️ for catches/pierces and ⭐ for headline wins so the log skims.
-->

- **Note (iter1): ⭐ Lane D and Rust cascades reduced to repairable causes.** Lane D is five ordered causes (preflight parent, lifecycle direct cut, current caller/schema shape, current route/review persistence, final closure regeneration), not 162 independent failures. Rust is Linux target-specific Clippy plus macOS ambient-FD test launch and an unbounded test-side accept. Curated evidence is in `context/lane-d-diagnosis-2026-07-14.md` and `context/rust-ci-diagnosis-2026-07-14.md`.
- **Note (iter1): ⚠ W018 post-cap certification found four concrete escapes.** Native reproduced dropped secret findings from direct blob refs plus unbounded tree-name and stderr backing storage; Opus independently found an embedded-prefix terminal secret false clean. D-030 accepts all four and freezes correction to the existing two source/test paths plus private evidence.
- **Note (iter1): ⚠ Recovery-spine defaults corrected before delegation drift.** Bootstrap had substituted generic optional defaults before GOAL's model, rubric, layer, verifier and invariant knobs were final. `context/CTX.md`, the operating manual and HANDOFF now project GOAL accurately; mission and authority were unchanged.
- **Note (iter1): ⚠ Opus pierced Lane A's F-023 closure claim.** Byte/hash/SQL/path/mutation controls are strong, but the filtered loader omits only explicit preambles/review history and retains concretely superseded legacy-import and numbered-migration prose. Native review corroborated the miss; repair cycle 1 narrows D-024 to structural-only acceptance and leaves semantic closure to W017.
- **Note (iter1): ⭐ Durable recovery spine established mid-programme.** The three already-running native legs were recovered into STATE/ledger after bootstrap. The initial family design established exact frozen reconstruction and standalone SQL-fence modules; later review rejected its filtered stream as binding net-current authority, so the active repair restores exact frozen bytes as the default.
