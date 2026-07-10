# Decision / Work-Item Lifecycle, Fork Protocol, Escalation Gates & Judging

This layer governs how a single unit of work travels from "open question" to
"settled, traceable conclusion" — and what to do when research alone cannot
settle it. It is the *substance* of an autonomous run: everything else (the loop,
filesystem memory, delegation, cross-family review, reorg) exists to feed this
machine. Get this layer right and the run produces decisions a human can audit,
trust, and act on; get it wrong and you produce confident-sounding mush.

> Realized by the **explore-decision** (single-item lifecycle), **explore-fork** (multi-path
> forks), and **judge-panel** (adversarial judging) archetypes you author per-run from
> `workflow-patterns.md` (the skill ships no workflow files), plus `templates/ADR.template.md`
> (the on-disk record, with FORK + QUEUE-ITEM blocks; installed into the lab at
> `adr/_meta/ADR.template.md`).

## Configure at bootstrap (the knobs this layer reads)

These are filled once in `GOAL.md` and substituted into `OPERATING_MANUAL.md` +
`context/CTX.md`. The *mechanics below are fixed*; only the knob values change.

| Knob | What it is |
|---|---|
| `{{MISSION}}` | The north-star definition-of-good; drives the mission-centricity rubric axis. |
| `{{LOCKED_CONSTRAINTS}}` | Settled inputs the run designs **around** and must **not re-litigate**. |
| `{{HARD_GATES}}` | Domain constraints that map decisions onto escalation-gate classes — the high-blast-radius areas that need a panel **+** cross-family verify before an item may be marked `decided` or its scaffold promoted (drives `decided` vs `decided-PROVISIONAL`). |
| `{{EXPERT_AUTHORITIES}}` | The named external sign-off authorities for the expert-signoff gate class. |
| `{{RUBRIC}}` | The scored-matrix axes **and** their per-decision weights (skeleton supplied below). |
| `{{BUILD_CEILING}}` | The line past which work becomes apply-time-gated (out of scope for autonomous build). |
| `{{RUNAWAY_CAPS}}` | The run's ceilings — max fix-loop iterations (~2 then escalate), fork-depth cap, max active forks. |

The **fork-trigger test is fixed, not a knob**: open a fork only when a branch is
**one-way-door OR high-blast-radius OR the human explicitly asks**.

**ID grammar (fixed):** every work-item gets a stable, sequential decision ID
(written here as `Dxxx`); every fork gets a stable fork ID (`Fxxx`). IDs are
**never reused** and **never renumbered**. The `xxx` is illustrative — the prefix
is a knob, the *sequential-and-stable* property is not.

---

## 1. The decision lifecycle — a fixed 7-stage state machine

Apply all seven stages to **every** work-item. No item skips straight to a
verdict; no item is "obvious enough" to decide from memory.

1. **Frame.** Restate the precise question in one sentence. Pin the
   `{{LOCKED_CONSTRAINTS}}` it must satisfy and its **blast radius /
   reversibility**. A vague frame produces a vague decision — be surgical.
2. **Research.** Fan out across genuinely *distinct* lenses (e.g. by-precedent,
   by-cost/operations, by-risk/failure-mode, by-first-principles). **Never decide
   from memory** on anything external, fast-moving, or contestable. Cite sources.
3. **Enumerate options.** Produce 2–5 *genuinely distinct* candidates. **No
   strawmen** — a fake loser inserted to make the favourite look good corrupts the
   whole judgement. If you can only find one real option, say so explicitly.
4. **Evaluate.** Score each option against the weighted rubric (§4). Where
   **evidence beats argument, spike it** — build a small runnable
   prototype/experiment rather than arguing in prose.
5. **Adversarially judge.** A panel of independent critics tries to *refute* the
   leading option, each from a distinct lens. **Majority-refute kills it.** A win
   on argument with *no attempt to refute* is **not a decision** (§4).
6. **Decide.** Write the ADR: verdict, rationale, rejected alternatives,
   consequences, and the follow-on sub-decisions it spawns.
7. **Fork if warranted (§3).** For irreducible one-way-door / high-blast-radius
   branch points, open a multi-path fork and converge on evidence instead of
   deciding now.

**Status vocabulary:** `proposed → exploring → forked → decided → superseded`.

---

## 2. ADR rules — the decision record

The ADR (Architecture/Analysis Decision Record — the per-work-item record) is the
durable artifact. For non-decision domains, rename the unit (`finding`, `source`,
`task`) but keep the mechanics.

- **One decision per ADR.** Do not bundle. Bundled decisions cannot be
  superseded, cross-referenced, or gated independently.
- **Immutable once `decided`.** To change a decided ADR, write a **new** ADR with
  `Supersedes Dxxx`, and mark the old one `Superseded by Dyyy`. Never edit a
  decided verdict in place — the supersession chain *is* the change history.
- **Stable sequential IDs, forever.** See ID grammar above.
- **Tiered weight** (match machinery to stakes):
  - *Y-statement* (one sentence) for trivial/reversible calls.
    "In the context of X, facing Y, we chose Z to achieve W, accepting trade-off V."
  - *Full scored-matrix ADR* (MADR-style) for the normal workhorse decision.
  - *Panel-gated ADR* for one-way-doors — requires a passing panel **and**
    cross-family review before it may be marked `decided`.
- **Two load-bearing custom fields on EVERY ADR**, beyond the prose:
  - **Reversibility** — one of `one-way-door | costly-to-reverse | reversible`.
  - **Gating-Impact** — names which `{{HARD_GATES}}` / escalation gates this
    decision touches (or explicitly "none"). This is what routes the item to a
    gate class in §5.
- **Propagate.** Every new sub-decision the ADR surfaces enters the work-queue
  immediately, carrying its `dependsOn` edges, its reversibility tag, and a
  `fork?` flag. Selection then prefers the **highest-tier unblocked one-way-doors
  first**, respecting `dependsOn`.

---

## 3. Reversibility drives spend

The Reversibility field is not decoration — it sets the budget.

- **One-way-doors** (and costly-to-reverse) **gate on a passing panel** plus
  cross-family review. Spend the heavy machinery here. These are exactly the
  decisions worth forking.
- **Two-way-doors decide fast:** pick the leader, **record the runner-up** in the
  ADR, and revisit only if reality proves it wrong. Cheap to change → cheap to
  decide.
- **A near-tie on score is NOT, by itself, a reason to fork a reversible
  decision.** Decide one, note the runner-up, or — at most — run a *single*
  tie-break spike. Forking a reversible near-tie burns concurrency for nothing.

---

## 4. The fork protocol — exploring many paths in parallel

A fork is the expensive, parallel-exploration move. Reserve it for branch points
where being wrong is costly or irreversible.

**Trigger (fixed).** Open a fork only when the branch is
**one-way-door OR high-blast-radius OR the human explicitly asks.**

**A fork MUST NOT be opened without all four of these. No exceptions:**

1. **Named paths** A / B / C…, **each with a stated hypothesis** (what this path
   bets on being true).
2. A **convergence criterion** — the concrete evidence that will decide it. "We
   converge when path X demonstrates property P under condition C."
3. A **mandatory kill-switch** — the condition under which a path is abandoned
   mid-flight ("kill path B if its spike exceeds latency budget L").
4. A **convergence deadline** — "decide after N spikes / by iteration M; if still
   tied, the human breaks it."

> A fork without a kill-switch **and** a deadline is **forbidden**. Open-ended
> exploration with no abort and no clock is how a run hangs forever.

**Each path runs as an independent, isolated pipeline:**

```
steelman research  ->  optional real spike (ISOLATED — its own .worktrees/<name>
                                              checkout or scaffolds/<name> dir,
                                              so paths never collide)
                   ->  self-critique pre-mortem ("why will this path fail?")
```

Isolation is structural: each path's spike lives in its own directory. A linked
checkout additionally requires direct human authority and the canonical global
`scripts/worktree` helper; worktree isolation never permits overlapping writers.

**Require ≥2 surviving paths to converge.** If self-critique kills all but one,
that is a decision, not a fork — write the ADR.

**Converge with a head-to-head judge panel** against the rubric **plus** the
convergence criterion. The convergence output is a record (the FORK block in
`templates/ADR.template.md`) containing:

- a **winner** (its artifact is now *promotable*);
- a **ranking** of all paths;
- explicit **KEEP-WARM** paths, each with its **future trigger** ("revisit path B
  if assumption A flips") — a kept-warm path is the right answer under a different
  future, not a loser;
- the **kill-switch / archived** losers — **archived WITH the reason they lost**,
  **never deleted**. The "why-not" is load-bearing audit trace.

**Forks are long-lived and do NOT block the whole run.** An open fork proceeds
*concurrently* with other decisions. Track an unresolved fork as an **open item**,
not a stall. Full multi-path forks are bounded by the concurrency caps in
`{{RUNAWAY_CAPS}}` (max active forks, fork-depth cap).

---

## 5. The judging rubric — adversarial by default

Score options explicitly in a matrix shown **in the ADR**. **Record the weights**
used (the per-decision weights half of `{{RUBRIC}}`) — weights are *tuned per
decision*, not fixed globally, so they must be visible to be auditable.

**Domain-agnostic criterion skeleton** (the axes half of `{{RUBRIC}}` — swap the
risk and mission axes for your domain):

| Criterion | Lens it scores |
|---|---|
| Correctness / fit | Does it actually solve the framed problem? |
| Risk / compliance | The domain's `{{HARD_GATES}}`. |
| Reversibility | One-way-doors penalised; cheap-to-change rewarded. |
| Cost | Build cost + ongoing operational cost. |
| Operability | Can the intended operator actually run/maintain it? |
| Build-leverage | How well it can be built and maintained with available tools. |
| Mission-centricity | How directly it serves `{{MISSION}}`. |
| Evidence-quality | Spike / benchmark / precedent **vs** bare assertion. |

**Evidence-quality is itself a scored axis** — an option backed by a passing spike
outranks an equally-plausible option backed only by argument.

**Compute scores deterministically.** Weighted totals are recomputed in code from
per-axis scores × weights. **Never trust a model-supplied total** — the model
scores the axes; arithmetic happens outside the model.

**Panel composition:** ≥3 independent judges **+** ≥1 adversarial red-team critic,
each scoring the **written** rubric from a distinct lens. **Quorum required.**
**Majority-refute kills the leading option.** A win on argument with no refutation
attempt is *not* a decision.

**LLM-judge bias mitigations (mandatory):**

1. **Randomize option order** before judging (defeats position bias).
2. **Score each option independently BEFORE any pairwise comparison** (defeats
   anchoring / contrast effects).
3. **Require a quorum**; under uncertainty a judge defaults to `refuted=true`
   (fail-closed). Dead/timed-out critics count as refutations, not as passes.

**Maker-checker loop** (the refinement primitive): generator → checker scores vs
**written acceptance criteria** → on fail, feed the critique back. **Bounded to
~2–3 iterations**, *each requiring measurable improvement*. On stall, escalate.

> ### CONVERGENCE RULE (hard — enforce it)
> A sufficiently-adversarial review **always** finds the next layer, so fix-loops
> never self-terminate. If the **2nd fix attempt** still fails — *especially* when
> an **independent / cross-family** checker returns FAIL with **new** gaps — **STOP
> fixing and escalate** the item as an escalation-gated residual (§5 promotion or
> the right class). **Do not loop a 3rd time.** Pre-declare this rule *before* you
> start fix #2. Finishing *with* a labelled escalation-gated residual is the
> **correct** outcome, not a failure.

---

## 6. Escalation-gate taxonomy — the 6 classes

When research and judging cannot close an item, it carries an **escalation gate**.
The taxonomy is fixed; the *concrete instances* per domain are the
`{{ESCALATION_GATES}}` knob.

1. **human-decision** — an irreducible value / preference / strategic tie only the
   principal can break. There is no "correct" answer to discover; someone with
   authority must *choose*.
2. **expert-signoff** — a named external authority must approve
   (`{{EXPERT_AUTHORITIES}}`: legal, medical, regulatory, safety, financial
   controller — whatever fits the domain). This is the generalization of a
   "lawyer must sign this off" gate.
3. **judge-panel** — needs a passing adversarial panel before acceptance.
4. **spike** — contestable on **evidence** that research alone can't settle; needs
   a runnable prototype/experiment to resolve.
5. **apply-time** — only resolvable when the **real action** is taken (real
   infra / data / deploy / launch), which lies **beyond the `{{BUILD_CEILING}}`**
   and is therefore out of scope for the design/scaffold phase.
6. **promotion-gate** — the high-blast-radius `{{HARD_GATES}}` areas that
   require **BOTH** a passing panel **AND** independent cross-family review before
   the item may be marked `decided` or before its scaffold may be promoted.

**Two absolute rules:**

- An escalation-gated item is **NEVER auto-dispatched** and is **NEVER silently
  marked `decided`.** It is tagged with its gate class, held at
  `decided-PROVISIONAL` (or gate `open`), and handed to the human/expert at the
  **run's end as a labelled residual list**.
- **The orchestrator's job ends AT the gate, not past it.** Crucially:
  **authoring the decision is NOT gated — only its acceptance/promotion is.** Do
  not mis-park a buildable item as "blocked on a gate" when the gate binds
  *promotion*, not *authoring*. Re-enumerate periodically to catch decisions
  wrongly held behind a gate that does not actually bind them.

---

## 7. The traceability spine — the audit artifact

An **unbroken** chain, persisted to disk, is the whole point of the run:

```
Branch-point (fork)
  -> Option + spike evidence
    -> Panel scores
      -> adr/<id>.md (decision + rationale + rejected alternatives)
        -> commit / produced artifact
          -> output
```

Every produced artifact **cites its `adr/<id>.md`**; every decision **links to its
evidence**; every rejected option and dead fork path is **preserved** (the
"why-not" is the valuable trace). The promise: any conclusion is traceable back
to its evidence in a few hops.

**An integrity sweep must assert** (not just that files exist):

- every `decided` ADR (`adr/<id>.md`) has a corresponding log row **and** a
  closed queue item (1:1 — verified by ID-set diff QUEUE ↔ LOG ↔ `adr/*.md`);
- every resolved fork has a written verdict;
- **ID uniqueness** — no two items grabbed the same next-ID;
- **reference validity** — no ADR cites a non-existent or already-superseded ID.

ID collisions and stale cross-references silently corrupt the trace; the sweep is
how you catch them.

---

## 8. Hard-won gotchas — failure modes to design against

These are real failures observed in a long autonomous run. Each one will recur.

- **Placebo oracles / vacuous gates.** A verification artifact can be perfectly
  self-consistent yet prove **nothing**. Two observed shapes: (a) an "independent"
  oracle that secretly **shares its derivation** with the code it checks (a
  co-derived placebo — the oracle and the artifact must *not* share a derivation);
  (b) a gate that **no-ops on empty input** and passes vacuously. **Demand an
  injected-fault / mutation meta-test:** every gate must be *proven RED* when the
  defect it guards is deliberately reintroduced, with N-of-N completeness. A gate
  that never goes red is decoration. (See `anti-placebo-and-convergence.md`.)

- **Never trust a worker's self-reported pass verdict** — *especially* a
  self-reported *cross-family* verdict. A build agent once overclaimed
  "cross-family VERDICT FAIL→PASS" while the workflow's **independent**
  cross-family review was authoritatively FAIL. **Only an independently-run
  checker's output counts; the maker cannot certify itself.** The independence
  boundary (author ≠ verdict-reporter) is structural.

- **The genuine-placebo / real-correctness carve-out PIERCES a firm-stop.** A
  declared stop is **not** absolute when the residual review surfaces a *genuine*
  correctness bug or a *proven* placebo (e.g. an "in-region" check that wrongly
  treats a neighbour as in-region — a real correctness defect). Distinguish "the
  reviewer keeps finding ever-finer **nits**" (honor the firm-stop) from "the
  reviewer found a real **falsification**" (pierce it — one more pass).

- **Crash-safe resume.** Long runs die mid-flight on transient overload (rate
  limits, provider 5xx). **Preserve partial outputs verbatim to disk and RESUME
  from the last good phase** rather than rebuilding (resume-from-run-id). Run a
  **RECONCILE** step at the top of every iteration to re-attach completed/dead
  runs to their decisions, so a compaction mid-flight never severs the
  run→decision link.

- **Re-pin the target on resume.** A resumed agent with null/unpinned args will
  self-select a **different** target and **diverge** from the intended work-item.
  A diverged-but-successful run does **NOT** discharge the original item. Always
  re-pin the target when resuming.

- **The "finite buildable owed-list" is itself usually incomplete.** Draining it
  surfaces previously-un-owed items. **Require ≥2 independent re-enumeration
  passes returning DRY** before declaring the frontier exhausted. One "looks
  done" pass is not exhaustion.

---

### Worked reference instance (a concrete fill — strip when reusing)

> The patterns above were distilled from a lab that designed an AU-fintech system
> (a regulated-fintech lab). There, the knobs were filled like this — illustrative only, never let
> these into your own load-bearing prose:
>
> - `{{HARD_GATES}}` = AU data residency / AFSL / AML-CTF / PPSR / Privacy-Act +
>   money-math integrity.
> - the `{{HARD_GATES}}` promotion-gate areas (the "no-AI-autonomy" list) = money
>   movement, double-entry / ledger posting, KYC/AML logic, migrations on financial
>   tables, RBAC / tenant isolation, PPSR registration, credit-decision-adjacent code.
> - `{{EXPERT_AUTHORITIES}}` = a "lawyer" sign-off gate.
> - Cross-family reviewers = two independent model families (`codex`, `gemini`).
> - `{{BUILD_CEILING}}` = scaffold + IaC + local/mocked only; no real cloud, no
>   real money movement.
> - The run ended cleanly **with** a 14-item escalation-gated residual list
>   spanning all six classes (human / expert / panel / spike / apply / promotion)
>   — handed to the human, not silently closed. That ending was correct.
>
> Your domain's fills will look nothing like this. Replace every item above with
> your own knob values at bootstrap; the *machine* is what carries over.
