# Autonomous lab: {{DOMAIN}} — start here

> This file is the **single human entry point**. It never hard-codes a status
> snapshot — those drift. Live state is **generated**; see *Status & what's waiting*.

## What this lab is

This lab is the durable, filesystem-as-memory **brain** for an autonomous run over:

> **{{MISSION}}**

An AI **orchestrator** drives it: it researches every decision, forks the hard
one-way-door calls into parallel paths, judges the options adversarially on a
deterministic rubric, **cross-family-verifies** the high-stakes core with an
independent model family, and builds real artifacts **up to the build ceiling** —
pausing at **human-in-the-loop (HITL) gates** for the calls only you can make. It is
a continuous process, **run until you write STOP**, not a finished report. (Full
domain context: `context/CTX.md`.)

## Status & what's waiting on you

Three pointers — never a snapshot pasted here:

- **Status at a glance:** `DASHBOARD.md` — the one-screen **generated** snapshot
  (lifecycle, decided count, live forks, queue summary, in-flight runs, human-gate
  count). Marked *GENERATED — do not hand-edit*; regenerate, never patch it.
- **The one switch:** `GOAL.md` → `STATUS` (`RUN` | `STOP`) — the lifecycle gate the
  orchestrator obeys at the start of every iteration.
- **Your worklist:** `STATE.md` → **Blockers** (escalation-gated items + anything
  awaiting a human call) and the `*-GATED` / `HUMAN-TIE-BREAK` rows in
  `DECISION_QUEUE.md`. This is the HITL backlog — each item says what it unblocks;
  `DASHBOARD.md`'s human-gate count is its tally.

## The read path (review the work)

1. **This file** → 2. **`DASHBOARD.md`** (current state) + your **worklist**
   (`STATE.md` Blockers) → 3. **`GOAL.md`** (mission + your steering directives + the
   `STATUS` switch) → 4. **`DECISION_LOG.md`** (one line per decision, newest first) →
   5. drill into any **`adr/<id>.md`** for the full reasoning.

## How to verify (don't trust)

- **Trace any decision in ≤3 hops:** a `DECISION_LOG.md` row → its **`adr/<id>.md`** →
  that ADR's **Evidence-links** section (research / verification / artifact). The
  independent cross-family check for a decision lives at
  **`adr/_reviews/<id>-codex.md`** (and `-gemini.md`).
- **Run the spine checks** (need `node`): `node tools/check-adr-immutability.mjs`
  (decided ADRs unchanged since frozen) · `node tools/gen-dashboard.mjs --check`
  (DASHBOARD is not stale) · `node tools/gen-adr-code-index.mjs` (refresh
  `ADR_CODE_INDEX.md`, the decision→implementing-code map).
- **Test gates RED-on-mutation:** a gate that still passes when you flip the
  violation is decoration. Re-run the relevant proof with the invariant deliberately
  broken and confirm it fails. (Domain-specific proof commands, if any, live in the
  artifact dirs and are surfaced in `DASHBOARD.md`.)
- **Read the roads not taken:** each ADR's *Rejected alternatives* + `forks/<id>/`
  (losing paths preserved with their reasons).

## Run / resume / steer / stop

The lab is driven entirely through **`GOAL.md`**.

- **Resume / launch:** set `GOAL.md` → `STATUS: RUN`, open a Claude Code session **in
  the lab root** at high effort (`/effort ultracode` or `high`), and paste the
  self-pacing loop below:

  ```
  /loop You are the orchestrator for the autonomous lab in this lab root.
  Read OPERATING_MANUAL.md IN FULL first — it is your constitution.
  Then read GOAL.md (mission + STATUS gate + Active directives), STATE.md (your
  recover-after-compaction anchor), and the work-queue head.
  Run ONE iteration of the 8-step loop (RECONCILE → READ → SELECT → DISPATCH →
  RECORD → PROPAGATE → REORG-if-due → STATE → WAKE/STOP), obeying every rule in the
  manual: context-protecting orchestrator, provenance-before-promotion,
  record-before-launch, and human-only mission closure. If GOAL STATUS==STOP,
  write a clean handoff and HALT. Otherwise self-pace while work is active and
  use the validated idle-frontier PAUSED checkpoint when the frontier is dry.
  Before accepting PAUSED, run
  `python3 "${AGENTS_HOME:-$HOME/.agents}/skills/autonomous-lab/scripts/validate_idle_pause.py" "STATE.md" --runs ".orchestrator/runs.md" --queue "DECISION_QUEUE.md"`.
  A non-zero result means re-invoke one iteration; do not exit the driver.
  ```

  `/loop` with no interval **self-paces** (it schedules its own wake-ups).

  **Codex operator variant:** an eligible GPT-5.6 lead uses Ultra/native
  multi-agent for the same portable one-iteration stage graph; lower efforts
  use explicit waves. Codex still has no Claude `/loop`/Stop hook, so invoke the
  iteration from the validated external driver in the autonomous-lab skill's
  `references/codex-operator.md`; it rejects premature pauses and stops
  self-waking after a valid dry-frontier checkpoint.
- **Steer:** add bullets under *Active directives* in `GOAL.md`. Empty = follow the
  default traversal order.
- **Answer a gate:** resolve the item in `STATE.md` Blockers (or add a directive /
  fill the relevant `GOAL.md` field). Your answer unblocks the dependent work.
- **Pause / stop:** a dry frontier creates a resumable `STATE.md` PAUSED idle
  checkpoint without changing human-owned `GOAL.md`. Set `GOAL.md` →
  `STATUS: STOP` only to close the mission; the operator then refreshes the
  terminal handoff before halting.
- **Watch:** `/workflows` for live progress; `STATE.md` is the human-readable
  heartbeat (a fresh session resumes from it alone). **Alt modes:** paste the prompt
  once per iteration for manual control, or use the `schedule` skill for unattended
  cron runs.
- **Precondition:** the owning project is a Git repo. Linked-checkout spikes
  additionally need direct human authority and use only
  `<primary-root>/.worktrees/<name>` via the global `scripts/worktree` helper.

## Guardrails & durability (how it stays trustworthy over months)

- **The build ceiling** — declared by the `BUILD_CEILING` knob in `GOAL.md` and
  enforced by `OPERATING_MANUAL.md`: the line between what the run may build
  autonomously and what needs your sign-off. The orchestrator **never raises it
  itself**.
- **`OPERATING_MANUAL.md`** — the orchestrator's constitution: the 8-step loop, the
  runaway caps, provenance-before-promotion, and the no-autonomy-past-the-ceiling rule.
- **Immutable decisions** — a decided `adr/<id>.md` (Status `decided` | `superseded`)
  is frozen audit evidence. Changes arrive as a **new superseding ADR**, never an
  in-place rewrite; enforced by `tools/check-adr-immutability.mjs` (+ the
  `.decided-adr-manifest.json` baseline).
- **Cross-family verification** — high-stakes / hard-gate calls get an independent
  **different-model-family** review before they count as final (DECIDED, not
  DECIDED-PROVISIONAL). Each is persisted verbatim at `adr/_reviews/<id>-<family>.md`.

## Navigation map

```
<lab-root>/
│  ── human entry & control ──
├── README.md             ← you are here (the single human entry point)
├── DASHBOARD.md          ← generated one-screen status (never hand-edited)
├── GOAL.md               ← mission + Active directives + the STATUS: RUN/STOP switch
├── OPERATING_MANUAL.md   ← the orchestrator's constitution (loop · caps · ceiling)
├── STATE.md              ← live heartbeat + Blockers worklist (resume from this alone)
│  ── the decision ledger ──
├── DECISION_LOG.md       ← one line per decision, 1:1 with adr/*.md (the spine)
├── DECISION_QUEUE.md     ← prioritized backlog index (status + where-to-look)
├── ADR_CODE_INDEX.md     ← generated decision→implementing-code map
├── HANDOFF.md            ← capstone synthesis + terminal pickup
├── reorg-log.md          ← one entry per reorganization
├── adr/                  ← one FILE per decision: adr/<id>.md, immutable once decided
│   ├── _reviews/         ← cross-family review sidecars: <id>-<family>.md (codex/gemini)
│   └── _meta/            ← option matrices · heavy research · specs · ADR.template.md
│  ── work & evidence ──
├── forks/                ← parallel deep-dive tracks for one-way-doors (losers preserved)
├── scaffolds/            ← non-Git artifacts + linked-worktree evidence/metadata
├── .worktrees/           ← ignored human-authorised linked checkouts, if any
├── context/             ← domain ground-truth digests (CTX.md = what this lab is)
├── tools/                ← spine generators (gen-dashboard · check-adr-immutability · gen-adr-code-index)
├── workflows/            ← author each run's workflows here from the skill's pattern reference
└── .orchestrator/        ← append-only run ledger (runs.md): crash-safety, out of the read path
```

> **Generated — do not hand-edit:** `DASHBOARD.md`, `ADR_CODE_INDEX.md`, and
> `.decided-adr-manifest.json` are produced by `tools/`. Regenerate them rather than
> patching; they are gitignore candidates. Everything else is hand- or
> orchestrator-maintained.
