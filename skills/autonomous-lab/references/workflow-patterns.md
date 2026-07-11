# Workflow patterns — the orchestration library

> Layer 3 reference, and **the authoritative source** for the seven archetypes.
> **The skill ships NO runnable workflow files** — bootstrap copies none, and an empty (or
> absent) lab `workflows/` dir is **expected and correct**, never a defect. Each run's
> workflows are **authored/adapted per-run** from the patterns below, against the host's
> `Workflow()` / agent primitives.
> Read this when you need to choose, author, adapt, or debug a workflow.
>
> **Substrate:** the JS below is the **Claude Code** realisation. A GPT-5.6
> **Codex operator** runs the same portable archetype with Ultra/native
> multi-agent, or explicit waves below Ultra — `parallel` → independent
> subagents, `pipeline` → per-item sequential chains, schema → return contract,
> resume → ledger-diff re-dispatch — per `codex-operator.md`. Codex does not
> execute this Claude JS unchanged. The stage/gate/recovery graph binds on both.

A **workflow** is a deterministic script that orchestrates many subagents through two
composition primitives — **fan-out** and **pipeline** — and returns **one structured value the
orchestrator persists verbatim**. You (the orchestrator) launch a workflow in the background,
do other work, and ingest its typed result on completion. **You never re-author its prose.** An
`ok:false` return means re-dispatch, never hand-fill.

This reference documents **seven archetypes** as *patterns to author from* — not files to copy.
Author/adapt one per run rather than hand-writing orchestration from scratch. Every workflow you
author is domain-free code: the domain enters only through (a) the project
context file the workflow reads at `${labDir}/context/CTX.md`, and (b) per-invocation `args`
(ids, titles, questions, options, paths, the lens/angle/layer arrays, flags). Nothing about a
domain is hard-coded in a workflow.

---

## 1. The two composition primitives

Everything composes from these two. Internalize their failure modes — most VOIDed runs trace
to misusing one of them.

### `parallel(thunks)` — independent fan-out, for BREADTH

```js
// `models` contains concrete runtime IDs resolved from HARNESS aliases at bootstrap.
const results = (await parallel([
  // a THUNK: a zero-arg fn that, when called, starts the agent. Each carries its
  // own model + effort per {{MODEL_MATRIX}} (§3, references/model-effort-policy.md):
  () => agent({ task: gather(lensA), model: models.workhorse, effort: 'high' }),
  () => agent({ task: gather(lensB), model: models.workhorse, effort: 'high' }),
  () => agent({ task: gather(lensC), model: models.workhorse, effort: 'high' }),
])).filter(Boolean)          // drop dead agents
if (results.length < MIN_SURVIVORS) return { ok: false, reason: 'too few survivors' }
```

- **Pass `() => agent(...)` THUNKS, never pre-invoked promises.** If you pass `agent(...)`
  (already called), every agent fires at once *before* the scheduler/concurrency cap can apply.
  The thunk lets the runner start them under its caps.
- **`.filter(Boolean)`** removes agents that died/returned null.
- **Gate on a minimum-survivors threshold** before proceeding. A fan-out where half the agents
  died is not a quorum — decide explicitly whether to continue or return `ok:false`.

### `pipeline(items, ...stageFns)` — per-item sequential refinement, keeps stages paired

```js
const out = (await pipeline(
  items,
  // stage callbacks receive (prevResult, originalItem, index); model+effort per stage:
  (prev, item, i) => agent({ task: gather(item), model: models.workhorse, effort: 'high' })
                       .then(r => r ? { item, gathered: r } : null),     // dead → drop WHOLE item
  (prev, item, i) => prev && agent({ task: verify(prev.gathered), model: models.flagship, effort: 'high' })
                       .then(r => r ? { ...prev, verified: r } : null),  // judgement stage → flagship
)).filter(Boolean)
```

- **Stage callbacks receive `(prevResult, originalItem, index)`.** Read the unit of work from the
  **original-item slot**, not from `prevResult`, so stage-1 semantics hold for every stage.
- **Chain `.then(r => r ? {...} : null)`** so when an agent in the middle of a pipeline dies, the
  **whole item drops** rather than carrying a corrupted/half-null payload forward. This preserves
  positional correspondence — fact-check N stays bound to finding N even when finding M died.

### The choosing rule

> **Pipeline-by-default; parallel-barrier only when sub-units are genuinely independent.**

Go sequential/deep (pipeline) when stages share context or there is a cross-stage dependency —
splitting them would force a lossy handoff (e.g. research→spike→critique on one path; gather→verify
on one angle). Fan out (parallel) only when sub-questions truly don't share context — N forks of a
branch point, N independent research lenses, N skeptics attacking one claim.

Most real workflows do both: **fan out → judge → deepen the winner.**

---

## 2. The seven archetypes

Each is a `Workflow()` with a `meta` (name/description/phases), a defensive `args` parse at the top
(§4), `phase('...')` boundaries (the resume seam), and a single structured return. Knobs that feed
each one arrive via `args` (with sane defaults) and the shared `CTX.md`.

### 1. `enumerate-work` — refresh the work backlog
- **Purpose:** surface NEW or under-specified work items so the queue never silently empties.
- **Phases:** `Enumerate (parallel, one agent per layer)` → `Merge`.
  Each layer agent is given the *existing backlog* (so it proposes only genuinely new items) and
  returns a typed schema per item: `{ title, question, options, dependsOn, forkWorthy, priority,
  reversibility }`. The **merge** agent reads the current **MAX id**, verifies no collision, dedupes,
  assigns collision-free ids, and formats backlog additions per the queue-item template.
- **Returns:** `{ ok, newItems[], queueMarkdown }` — orchestrator appends `queueMarkdown` verbatim.
- **Knobs:** `{{WORK_LAYERS}}` (the problem-space slices to fan out across; default a generic set
  like Scope/Structure/Inputs/Quality/Risks/Process/Outputs), item schema, id scheme.

### 2. `explore-decision` — fully work ONE decision → draft its record
- **Purpose:** take a single framed decision from question to a defensible recorded answer.
- **Phases:** `Research (parallel, N lenses — workhorse/high)` → `Synthesize options (2–5 distinct, no
  strawmen — flagship/high)` → `Judge (parallel, one adversarial judge per option — flagship/high, xhigh on
  {{HARD_GATES}})` → `optional Spike` → `Draft record (flagship/high–xhigh)`. This is the canonical
  breadth-on-workhorse, judgement-on-flagship split (§3, `references/model-effort-policy.md`).
  - Each judge **scores the option against a fixed weighted rubric** *and* writes **the strongest
    case AGAINST it**, setting `survives=false` if the refutation is decisive.
  - The **weighted total is recomputed in JS** (`weighted(scores)`) and the options re-sorted — a
    model-supplied total is never trusted for the ranking.
  - Computes `nearTie = (|top1 − top2| ≤ threshold)`. If **near-tie AND one-way-door** →
    `status='forked'`, recommend opening a fork rather than forcing a pick. A **reversible**
    near-tie → decide and just record the runner-up.
- **Returns:** `{ ok, adrMarkdown, recommendation, nearTie, optionScores, spikeNote }`; the
  orchestrator writes `adrMarkdown` verbatim. `ok:false` → re-dispatch.
- **Knobs:** `{{RUBRIC}}` (weights+criteria via `args.weights`), `{{RESEARCH_LENSES}}`
  (via `args.lenses`), record template, spike/spikeWorktree flags.

### 3. `explore-fork` — pursue N hard paths in parallel → converge
- **Purpose:** for one-way-doors / high-blast-radius branch points only — explore competing paths
  in genuine parallel and pick a winner with a kill-switch.
- **Phases:** each path runs an **independent pipeline**:
  `Research (steelman this path)` → `optional Spike (isolated)` → `Self-critique (pre-mortem its own
  path)`. Then a **Converge** judge compares the survivors head-to-head against the rubric + an
  explicit **convergence criterion**, names a **winner**, ranks the rest, names which to **keep warm**
  (and the future trigger), and states an explicit **kill-switch**.
  - Requires **≥ 2 surviving paths** to converge (else `ok:false`).
  - **`clip()`** each path's text before the converge agent so a big upstream output can't overflow
    the judge's context.
  - A *reversible* near-tie is **NOT** a reason to fork — record the runner-up instead.
- **Returns:** `{ ok, forkMarkdown, winner, ranking[], keepWarm[], killSwitch }` — written verbatim.
- **Knobs:** paths, convergence criterion (via `args`), spike on/off, worktree on/off, rubric.

### 4. `judge-panel` — adversarially verify a single claim
- **Purpose:** decide whether one claim survives skeptical attack.
- **Phases:** `Refute (parallel, N independent skeptics by lens — all flagship; high, xhigh on
  {{HARD_GATES}})` → `optional cross-family critic` → `Tally`. Each skeptic tries hard to **refute**
  the claim and **defaults to `refuted=true` under genuine uncertainty**. **No cheap-model judges,
  ever** (rule R1, `references/model-effort-policy.md`) — the cheap model may *feed* the panel a
  breadth lens, but never *sits on* it.
  - **Fail-closed survival:** dead critics count as refutations; the claim survives only on
    **strict-majority-not-refuted of the FULL (including-dead) panel** — a shrunken panel can never
    rubber-stamp.
- **Returns:** `{ survives, refuteCount, total, deadCount, verdicts[], summary }`.
- **Knobs:** `{{JUDGE_LENSES}}` (default correctness/risk/cost/operability/reversibility, via
  `args.lenses`), cross-family critic on/off + reviewer identity.

### 5. `deep-research` — multi-angle research with verification
- **Purpose:** a controllable fan-out research pass that fact-checks itself. (For a *very large*
  open question prefer the standalone deep-research skill; this is the lighter, in-loop variant.)
- **Phases:** `Gather (per angle)` → `Verify (fact-check, paired to its angle)` as a **pipeline** so
  each fact-check stays bound to its finding even when agents die → `Synthesize` — a **cited**
  synthesis with a comparison table, a shortlist, a stated confidence level, and explicit **OPEN
  QUESTIONS** needing a spike/human.
- **Returns:** `{ ok, reportMarkdown, shortlist[], openQuestions[], confidence }`.
- **Knobs:** `{{RESEARCH_ANGLES}}` (default state-of-the-art / cost / risks-and-failure-modes /
  precedent / domain-specifics, via `args.angles`).

### 6. `build-spike` — real runnable artifact + independent review
- **Purpose:** build a real, keep-able artifact (not a throwaway demo) and have it independently
  reviewed.
- **Phases:** `Build (optional worktree isolation)` → `Review (self-review + optional cross-family
  review)`. The artifact is **production-intended** (may later be promoted), links back to the
  decision(s) that justify it, and follows the decided process (TDD/CI/lint).
  - **The cross-family verdict is a SEPARATE return field**, never folded into the build agent's own
    report — that separation *is* the independence boundary (§3, and see `cross-family-review.md`).
  - For gate-class artifacts, add a **mutation / non-vacuity** request to the cross-review prompt
    (see `anti-placebo-and-convergence.md`).
- **Returns:** `{ ok, buildReport, selfReview, crossReview }` (`crossReview` is the OTHER family's
  verdict captured verbatim, or null if disabled). Dead build agent → `ok:false`.
- **Knobs:** target/spec/decisionRefs (via `args`), worktree on/off, `{{CROSS_FAMILY_VERIFIER}}`.

### 7. `finishing-audit` — prepare a large corpus for a clean finish
- **Purpose:** before declaring a run finishable, prove the whole corpus is traceable, current,
  consistent, and non-vacuous — with TWO external families checking the work *and* the self-audit.
  *(This is the heaviest customization point — the most knobs.)*
- **Phases:**
  1. `Inventory` (parallel readers map traceability + currency: items 1:1 with records/log/queue).
  2. `Align-stale` (cross-consistency; stale/poison sweep; gate-status; escalation-gate census;
     locked-constraint fidelity).
  3. `Cross-check` (**TWO external families independently, adversarially** verify both the corpus
     and the self-audit, in parallel, with digest-clipping of their inputs).
  4. `Synthesize` (authoritative action plan + readiness verdict; **reconcile the two external
     verdicts**).
  5. `Cleanup` (conservative, **file-scoped**: stamp-superseded for substance, remove only clear
     cruft; orchestrator-owned ledgers + in-flight-remediation paths are **EXCLUDED** via an
     `isExcluded()` guard).
  - **Rule:** a NEW HIGH issue from *either* external reviewer that is in-scope must surface as a
    blocker or per-file action — it cannot be silently dropped.
- **Returns:** `{ ok, readiness, blockers[], perFileActions[], reconciledVerdict }`.
- **Knobs:** `{{CORPUS_INVENTORY}}`, `{{IN_FLIGHT_EXCLUSIONS}}`/`OWNED` list, `{{HARD_GATES}}`,
  `{{ESCALATION_GATES}}` (the 6-class taxonomy is fixed; the members are knobs),
  `{{LOCKED_CONSTRAINTS}}`, cross-family reviewers.

---

## 3. Cross-cutting patterns (apply across all workflows)

- **Model + effort per stage (`{{MODEL_MATRIX}}`).** Every `agent()` call carries a concrete model
  resolved from an alias and an `effort` (`references/model-effort-policy.md`). Bounded research and
  contract-driven implementation run on **`workhorse`**; schema-forced inventory/format work runs on
  **`scout`**;
  judgement stages (synthesis, ADR authoring, **every** judge/refuter/finalizer) run on **`flagship`**
  (`high`; `xhigh` on `{{HARD_GATES}}`; `max` for the single hardest synthesis). Resolve and record
  aliases at bootstrap. Workhorse/scout agents **never sit on a judge panel or decide**. A
  fan-out→judge workflow is typically workhorse/scout gather stages under
  an `flagship` synthesize/judge stage.
- **Adversarial-by-default.** Every leading option/finding/claim faces a refutation attempt before
  acceptance. *A win on argument with no refutation attempt is not a decision.* (Detail in
  `decision-lifecycle.md`.)
- **Adversarial-verify with N skeptics, fail-closed.** Strict-majority survival of the full panel;
  dead critics count as refutations.
- **Cross-family / independent verification for high-stakes calls.** A reviewer from a different
  model family (`{{CROSS_FAMILY_VERIFIER}}`) returns a judgment captured **verbatim from that
  family's output** — and the workflow's **own independent** review is authoritative over any build
  agent's *self-reported* external verdict. (Full doctrine in `cross-family-review.md`.)
- **Deterministic ranking outside the model.** Rubric weights + thresholds live in JS; the weighted
  total is recomputed in code and re-sorted. Never trust a model-supplied total for ordering.
- **Schemas everywhere.** Every structured agent return has `additionalProperties:false` + explicit
  `required`, so the orchestrator branches on **typed fields**, not free text.
- **Loop-until-converged (maker-checker).** Generator → checker scores vs *written* acceptance
  criteria → on fail, feed the critique back. **Bound to ~2 attempts**, require measurable
  improvement, and **escalate on stall** (the CONVERGENCE RULE, §4).
- **Multi-modal / completeness.** Research fans out by precedent, by cost, by failure-mode, by
  first-principles — never a single angle. Periodically **re-enumerate** the space and assert the
  frontier is genuinely dry; don't assume it.
- **No silent truncation.** Bounded coverage (top-N, sampled, skipped) is stated explicitly in the
  output. Convergence outputs are bounded and explicit (winner + ranked rest + keep-warm + trigger +
  kill-switch; synthesis lists open questions).
- **Resume via run-id.** Record `run-id → work-unit` in a ledger **BEFORE** launch. On crash or
  transient overload, completed phases' real outputs are preserved verbatim to disk, and a
  re-dispatch re-runs **only the failed phases** (cached phases intact). On resume, **re-pin the
  exact target** in `args` (§4). (Full protocol in `recovery-and-cadence.md`.)

---

## 4. The `args` contract and load-bearing gotchas

Every workflow takes **ONE `args` object**, parsed defensively at the very top:

```js
const a = (() => {
  try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) }
  catch { return {} }
})()
```

**This guard is MANDATORY.** In some sessions `args` arrives **stringified** (a JSON string, not an
object); without the parse, destructuring yields empty and the workflow VOIDs with "no paths
supplied" / 0 agents. Every workflow you author must carry this guard.

All knobs arrive through `a`: ids, titles, questions, options, paths, the lens/angle/layer arrays,
`labDir`, `date`, and the flags (`spike`, `spikeWorktree`, `worktree`, `crossFamily`, `model`,
`effort`). This object **is** the per-invocation extension point — swap the rubric, lenses, angles,
layers, per-stage `model`/`effort` (§3, `references/model-effort-policy.md`), and toggle expensive
stages without editing the script. Stage defaults should follow `{{MODEL_MATRIX}}` (breadth →
`workhorse` or `scout`, judgement → `flagship`); `args` lets a single invocation override them.

### Load-bearing gotchas (each one cost a real VOID/divergence)

- **Stringified-args VOID.** See the guard above — the single most common cause of a dead run.
- **Thunks, not eager promises, into `parallel`.** Pass `() => agent(...)`. Pre-invoked promises fire
  every agent before any cap applies.
- **Pipeline positional correspondence.** Stage callbacks get `(prev, original, index)` — read the
  unit from the **original** slot; `.then(r => r ? {...} : null)` so a dead agent drops the **whole
  item** rather than corrupting the pairing of downstream stages.
- **Worktree isolation is gated (default OFF).** A worktree stage needs a Git repo **and direct human
  worktree authority**; otherwise it fails hard rather than treating an agent-selected flag as
  permission. Create it only with the global `scripts/worktree` helper at the owning repository's
  primary-root `.worktrees/<name>`. `scaffolds/`, temp directories and private platform roots are
  not linked-worktree locations. When off, confine each concurrent writer to its **own distinct
  non-Git output dir** and tell it **not to run git**, so parallel writers never collide.
- **Never trust a build agent's self-reported cross-family verdict.** A build agent once over-claimed
  "codex VERDICT FAIL→PASS"; the workflow's own independently-run codex review was the truth (= FAIL).
  Treat any agent's report of an external verdict as a **claim**; the independently-run review is the
  truth. (Wired as a separate `crossReview` field, §2.6.)
- **Anti-placebo: prove gates RED-on-mutation.** Credit a gate green only if an injected fault /
  mutation actually makes it fail first. A control that passes present-but-empty is a placebo; a
  same-snapshot oracle is a placebo unless it captures an *independent pre-application intent-witness*.
  (Detail in `anti-placebo-and-convergence.md`.)
- **CONVERGENCE RULE.** If a 2nd fix attempt still fails (new gaps), **STOP and escalate** it as a
  gated residual — do **not** loop a 3rd build. Maker-checker loops are bounded to ~2 attempts,
  require measurable improvement, and escalate on stall. A diverged/non-executed remediation counts
  as a failed attempt.
- **Firm-stop vs the finite-list carve-out.** A firm-stop is correct for an **open-ended** harden
  loop (each pass generates NEW divergent findings → infinite). It is **wrong** to apply to draining
  a **finite known buildable list** — that is not the divergent find-more loop. Premature "done" while
  a finite buildable list remained is the recurring error.
- **ID-collision on spawn.** A new item must be assigned the **verified MAX+1**; the merge/enumerate
  agent must read the current max id and confirm no collision before assigning (it has spawned
  already-taken ids before).
- **Stale "verified-absent" claims poison fresh agents.** A "X does not exist" note that later becomes
  false silently corrupts a downstream agent. Fix with a dated correction/superseded stamp — never a
  silent deletion of rationale. (`finishing-audit` hunts for these.)
- **Strip conversational preamble before persisting.** Agents sometimes prepend "I have what I
  need…" to a return meant to be written verbatim. Strip any such heading/preamble before persisting
  the artifact (provenance-before-promotion hygiene).

---

> **Worked reference instance (regulated-fintech lab — illustration only, not load-bearing).** These seven templates
> were distilled from an AU-fintech design-lab. There the rubric carried a `factoringCentricity`
> weight (here generalized to `missionCentricity`), the five research lenses were precedent-fintech /
> cost-ops-solo / AU-compliance-risk / failure-at-scale / first-principles (→ `{{RESEARCH_LENSES}}`),
> the enumerate layers were a 20-element product/domain/compliance list (→ `{{WORK_LAYERS}}`), the
> build ceiling was "scaffold + IaC + local/mocked, no real money/infra" (→ `{{BUILD_CEILING}}`), the
> hard gates were money-movement/ledger/KYC/tenant-isolation (→ `{{HARD_GATES}}`), and the
> cross-family reviewers were the other primary plus a Fabric-routed Gemini bonus (→ `{{CROSS_FAMILY_VERIFIER}}`). Swap every one of those;
> the primitives, archetype shapes, cross-cutting patterns, and gotchas above are domain-agnostic.
> the reference run's `lab/workflows/` are *worked examples* in this same vein — read them for reference, do not
> expect to copy them (the skill ships no runnable workflow files; each run authors its own).
