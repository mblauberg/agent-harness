# STATE — orchestrator heartbeat
Updated: <YYYY-MM-DDTHH:MM:SSZ>
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

- **Run status:** RUNNING | PAUSED — reason: idle-frontier | STOPPED  — one line on the live posture.
- **Orchestrator lease:** <chair family/session · generation · acquired-at · heartbeat-at; use release-on-driver-exit for PAUSED>
  <!-- exactly one active loop driver; takeover increments generation after a persisted handoff -->
- **Iteration:** <N>
- **This iteration:** <one line: what just happened — the headline result>
- **In flight:** <run-id · unit-id · what · launched-at · expected output path; use (none) for PAUSED>
  <!-- one row per concurrent job; MUST match the .orchestrator run-ledger. Empty if idle. -->
- **Next up:** <the next selectable unit(s) and why; use (none — dry after bounded re-enumeration) for PAUSED>
- **Open forks:** <Fxxx: branch question · status · kill-switch + deadline> (+ the warm waitlist)
- **Blockers / escalations:** <gated items ({{ESCALATION_GATES}} class), cap hits,
  orphans found by the integrity sweep, anything needing the human>
- **Spend checkpoint (§0a):** <jobs launched this iter · cumulative · any unit over
  the ~3-run budget>
- **Resume protocol:** <for PAUSED, use exactly `restart-on:` plus a comma-separated
  subset of `human-directive`, `gate-answer`, `external-completion`,
  `material-change`, `explicit-restart`; for RUNNING, record the exact recovery
  steps and retained partial paths. This is what makes the run crash-safe.>

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

- **Note (iter0):** Lab scaffolded from templates. `GOAL.md` CONFIG KNOBS block
  filled + substituted by `scripts/bootstrap-lab.sh`; `README.md` installed and
  `DASHBOARD.md` seeded by `tools/gen-dashboard.mjs`. Work-queue seeded by the
  first `enumerate-work` run. STATUS: RUN. Next: select the highest-tier
  one-way-door and dispatch `explore-fork` / `explore-decision`.
