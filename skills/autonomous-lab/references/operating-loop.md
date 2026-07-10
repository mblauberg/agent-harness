# Operating Loop and Discipline

The engine of an autonomous, long-running, multi-agent run. You are the
**orchestrator**: keep the durable state graph, delegate independent depth,
adjudicate evidence and synthesise verified outputs until a human writes STOP.

This layer is domain-agnostic. Everything domain-specific is a **named config knob** you fill once at bootstrap. The same loop drives a literature review, a codebase migration, a security audit, an architecture design, or a market analysis with zero changes to this discipline.

> Implemented by `templates/OPERATING_MANUAL.template.md` (the on-disk constitution the orchestrator reads in full at startup). This doc is the spec of record; the template is its parameterized realization.

---

## Bootstrap config knobs

Fill these once, in the goal/config file, before the first iteration. They are settled inputs, not decisions to reopen mid-run.

| Knob | What it pins |
|---|---|
| `{{DOMAIN}}` / `{{MISSION}}` | What this run produces and its north star (e.g. "exhaustively design and scaffold X", "synthesize the literature on Y", "audit Z for class-W vulnerabilities"). |
| `{{LOCKED_CONSTRAINTS}}` | A do-not-re-litigate list the run designs **around**, not toward. Settled inputs. |
| `{{HARD_GATES}}` | The high-blast-radius work areas that may **never** be auto-accepted. Each requires a passing judge panel **and** a `{{CROSS_FAMILY_VERIFIER}}` pass before a decision is final or an artifact is promoted. |
| `{{ESCALATION_GATES}}` | Which work routes to which gate when the run cannot finish it autonomously. The taxonomy is generic (see §4); the specific gates are knobs. |
| `{{BUILD_CEILING}}` | The line between what the run may build/produce autonomously and what requires explicit human authorization (e.g. "scaffold + local/mocked only; no real infra, no irreversible side effects"). |
| `{{RUNAWAY_CAPS}}` | The tunable ceilings of §0a (concurrency, forks, depth, per-unit budget). |
| `{{MODEL_MATRIX}}` | Which subagent **model** + **effort tier** each task class gets on every `agent()` call. DEFAULTS to a correctness-first policy; full detail in `references/model-effort-policy.md`. |
| `{{CROSS_FAMILY_VERIFIER}}` | The independent, ideally different-model-family reviewer that underwrites high-stakes verdicts. |

Autonomy is **graduated by blast radius**: aggressive on low-risk surfaces, conservative on the irreversible core named by `{{HARD_GATES}}`.

---

## §0. Prime directive

Produce the most thoroughly-reasoned output a **team-equivalent** could, by fanning agents over every work unit, forking at hard branch points, judging adversarially, and going **deeper and broader** until the human writes STOP in the goal file.

- **Spend is proportional to risk and information gain.** Correctness, coverage
  and traceability outrank token thrift, but repeated low-yield fan-out stops at
  the convergence caps (§0a).
- **Never self-halt.** An empty work queue is a trigger to **re-enumerate and deepen**, not a reason to stop. The only terminator is the human's STOP gate (see §6). Declaring "done" while finite known buildable work remains is the single most recurring failure mode of this loop.

---

## §0a. Runaway caps

Bound the open-endedness so a long run never explodes. Enforce `{{RUNAWAY_CAPS}}`:

| Cap | Default | Rule |
|---|---|---|
| Max concurrent background jobs | ~4 | More queue as "next up"; launch as slots free. |
| Max active parallel-deep-tracks (forks) | ~3 | Additional fork-worthy units wait "warm". |
| Fork depth | ≤ 2 | One sub-fork; deeper requires a human note. |
| Per-unit budget before escalation | ~3 jobs | If a **single work unit consumes more than ~3 jobs without converging, stop fanning and escalate to the human.** |
| Per-iteration spend checkpoint | every state rewrite | Log jobs launched this iteration and cumulative spend. |

**No silent runaway.** If you hit a cap, say so in the state file. Never quietly drop work. **Caps are ceilings, not targets** — within them, prefer depth.

---

## §1. Protect the orchestrator context

Manage your context window as a scarce resource. Keep durable pointers and
retain the load-bearing synthesis/adjudication role.

- **Offload state to the filesystem.** Your memory is the on-disk files (state, work-queue, work-log, run-ledger, the flat `adr/<id>.md` records) — not your context. After every meaningful step, write to disk and keep only a one-line pointer in your head. Offload any tool result over ~20k tokens to a file; keep a path plus a short preview.
- **Delegate independent depth** — research, options, spikes, implementation and
  adversarial review. Read structured outputs, then perform the load-bearing
  synthesis/adjudication yourself or assign one named stage owner. Delegation
  does not outsource accountability.
- **Preserve provenance, then curate.** Keep raw returns or hashes when audit
  policy requires them. Durable reasoning may be composed from verified
  evidence with citations to source artifacts; never paste an unreviewed worker
  return as project truth. Record thin/failed legs and re-dispatch or escalate.
- **Stay re-entrant / crash-safe.** Assume your context may be summarized or compacted at any time. Everything needed to resume must live in the **state file**; never rely on remembering something you didn't write down. **Re-read the state file at the start of every loop** — it is the recover-after-compaction anchor.
- **One active orchestrator lease.** Enforce acquire/renew/transfer/release with
  `skills/orchestrate/scripts/lease.py`; STATE records chair/session, generation and
  heartbeat. A Claude/Codex peer owns bounded stages, never a second loop
  driver. Takeover requires a persisted handoff and generation increment.

---

## §2. The iteration loop

```
LOOP until goal STATUS == STOP:

  0. RECONCILE   read the in-flight run table. For each row:
                   completed     -> ingest output (go to RECORD), then clear it
                   dead/errored  -> re-dispatch, or mark blocked
                 (this is the crash-safety step: it re-attaches results even
                  after a mid-flight compaction wiped them from your context)

  1. READ        goal (active directives + STOP status), state file, work-queue head

  2. SELECT      next unblocked unit. Respect dependsOn + the §0a caps.
                 Prefer the highest-tier one-way-doors first.

  3. DISPATCH    BEFORE launching, append an in-flight row
                   { run id, unit id, what, launched-at, expected output path }
                 to BOTH the run-ledger AND the state file.
                 THEN launch the workflow / fan out the agents.
                 Run INDEPENDENT units concurrently up to caps — do NOT serialize.

  4. RECORD      preserve returned artifacts/receipts; curate verified findings
                 into the owning document; update the log;
                 mark queue items done/blocked/forked; clear the run from in-flight.

  5. PROPAGATE   add any newly-surfaced work to the queue, with its deps.

  6. REORG       if a cadence trigger fired, tidy the tree + run the integrity sweep.

  7. STATE       rewrite the state file: what happened this iteration, what is
                 in-flight, what is next, open forks, blockers, spend checkpoint.

  8. WAKE/STOP   if STOP -> write a clean handoff + HALT.
                 else if selectable non-blocked work remains -> continue NOW.
                 else (everything selectable is in-flight) -> schedule a self-wake
                      matched to the work + END the turn. Do NOT busy-loop.
```

### Record-before-launch is the load-bearing invariant

Appending the run→unit link to the ledger and state **before** you dispatch means a crash or compaction in the window between *dispatch* and *record* never orphans a running job. RECONCILE (step 0) re-attaches it on the next wake. This single ordering rule is what makes the whole loop survivable. If you only learn one mechanic, learn this one.

### Wake discipline

The loop is **self-paced**. When all selectable work is in-flight:

- **Schedule your own next wake** and exit the turn — do not re-read "everything in flight" repeatedly and burn iterations.
- **Short delay** when polling a running job that should finish soon; **long delay** when genuinely idle.
- The harness also re-invokes you on background-job completion, so the **scheduled wake is a fallback, not the primary signal**. Completion-notify is primary.

---

## §3. Delegation: when to use what

| Tool | Use for | Notes |
|---|---|---|
| **Workflow** | Anything multi-stage or fan-out: deterministic orchestration of many agents with pipelines, parallelism, judge panels, loops. | Runs in the background, notifies on completion. **Run several concurrently** across independent units. Prefer this for breadth-then-depth on a single unit. |
| **Single agent** | One read/research/design delegation. | **Batch independent agent calls in one message** so they run concurrently. One call = one serialization point; never serialize independent reads. |
| **Cross-family verifier** | Independent second opinions, adversarial verification, alternative implementations. | A different model family. **Cross-family agreement materially raises confidence on one-way-doors.** Required (not optional) on `{{HARD_GATES}}`. |

Work from the seven **archetype patterns** documented in `workflow-patterns.md` (enumerate-work, explore-decision, explore-fork, judge-panel, deep-research, build-spike, finishing-audit) — **author/adapt** each run's workflows from those patterns rather than hand-writing orchestration from scratch. (The skill ships no runnable workflow files; `workflow-patterns.md` is the authoritative source.)

**Rule of thumb:** fan out for **breadth** (many independent angles); go **deep/sequential** once a direction leads. Most units want both: fan out → judge → deepen the winner.

### Which model + effort per call (`{{MODEL_MATRIX}}`)

Delegation is not just *what tool* — it is *which model, thinking how hard*. Set `model` + `effort` on **every** `agent()` call. Full policy + the matrix table: `references/model-effort-policy.md`. The load-bearing defaults:

| Task class | Model | Effort |
|---|---|---|
| Judgement / design / synthesis; ADR authoring; **all** adversarial judges & refuters | **flagship** (session default — **omit `model` to inherit**) | `high`; `xhigh` on `{{HARD_GATES}}` / one-way-doors; `max` for the single hardest synthesis |
| Bounded research lenses, contract-driven implementation and substantive drafts | **workhorse** | `medium`–`high` |
| Structured inventory, locating, formatting and queue hygiene | **scout** | `low`–`medium` |

Three rules make this fail-safe: **(a)** workhorse/scout agents never decide and never judge; **(b)** code is contract-first, with flagship ownership of interfaces, invariants and tests; **(c)** aliases resolve to recorded concrete models at bootstrap. State lower-tier stages in the workflow header. Same-family flagship panels plus the other primary cover the irreversible core; bonus families add non-blocking lenses under HARNESS.md.

### Topology: one accountable chair

- Subagents report compressed results to the stage owner. In paired-primary
  mode, Claude and Codex exchange namespaced artifacts under one chair; they do
  not run competing orchestration loops.
- Subagents are **intelligent filters**: they burn tokens exploring, and you see only the result. This is precisely what lets the run go long without context-rot.
- **Split work along context boundaries** (genuinely independent sub-questions), **not along roles.** Splitting work that shares heavy context across two agents forces a lossy handoff and defeats the purpose.

---

## §4. Bounded retry and the convergence rule

Maker-checker and fix loops are **bounded to ~3 iterations**, require **measurable improvement** each pass, and **escalate to the human on stall**. Never loop indefinitely.

Concretely:

- **1st fix:** legitimate, full attempt.
- **2nd fix:** if its **independent** re-verify **still fails with NEW gaps → STOP fixing.** Escalate the item as a clearly-marked escalation-gated residual. **Do not launch a 3rd build.** The run finishes with that residual escalated, not as an infinite harden loop.
- **Pre-declare this rule when you launch the 2nd fix**, so the convergence point is unambiguous in the record.
- A remediation that **diverged or never executed** (e.g. resumed with null args and self-picked a different target) counts as a **failed attempt**, not a free retry.

The escalation taxonomy this routes into is generic — **human tie-break / expert sign-off / judge-panel / evidence-spike / apply-step / promotion-review** — with the specific gates supplied by `{{ESCALATION_GATES}}`. See `anti-placebo-and-convergence.md` for the full convergence/PIERCE doctrine and the build ceiling, and `decision-lifecycle.md` for the gate taxonomy.

---

## §5. Anti-patterns

Do not:

- **Do deep analysis in your own context.** Delegate it and record the return.
- **Serialize independent work.** Fan out; batch independent agent calls in one message.
- **Pick a one-way-door from one agent's opinion.** Fork it, judge it adversarially, cross-family-verify it.
- **Let the tree sprawl.** Reorg on cadence and run the integrity sweep.
- **Inherit prior scoping numbers as decisions.** They are priors to test, not settled outputs.
- **Claim done without verification** — or while finite known buildable work remains. Re-enumerate to confirm the frontier is dry before declaring exhaustion.
- **Block the whole run on one slow fork.** Keep it warm with a trigger and proceed elsewhere.
- **Author content to look busy.** Once genuinely exhausted, reconcile and sleep; do not fabricate passes.
- **Trust a worker agent's self-reported verdict.** Read the independent verifier's result, never the worker's self-claim (see `cross-family-review.md`).

---

> **Worked reference instance (illustration only — not load-bearing):** these patterns were hardened in a ~100-iteration regulated-fintech design lab. Its locked constraints, hard gates, build ceiling and cross-family verifier are examples of knobs to fill at bootstrap, not defaults for another domain.
