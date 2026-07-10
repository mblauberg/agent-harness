# HANDOFF — human-handoff capstone  ·  <LIVE | TERMINAL> state (iteration <N>)
<!--
  ORCHESTRATOR-OWNED, regenerated on material change and refreshed at STOP. This
  is the CAPSTONE deliverable: it takes the run's output from "adversarially
  validated on the lab's terms" to "handed to a human / next agent to carry
  forward." It SYNTHESIZES existing lab artifacts — it does NOT introduce new
  decisions or re-decide anything (a handoff that decides is a bug). Every claim
  traces to a source file (relative paths from the lab root).

  Until the run produces artifacts this is a STUB. Fill the bracketed <...> as the
  run matures. Closing the run is a finish-blocker unless GOAL + STATE + HANDOFF
  all agree on the terminal truth.

  This template is domain-agnostic. The escalation taxonomy in §0 is FIXED (the 6
  gate classes); the SPECIFIC items filling each class are {{ESCALATION_GATES}}
  from GOAL.md. Strip none of the section skeleton; fill or write "n/a" per section.
-->

> **Purpose.** Capstone for taking <DELIVERABLE / {{MISSION}}> from
> *adversarially-validated* to *carried-forward*. Synthesis only — no new decisions.
>
> **Run status:** <LIVE refresh | ⛔ FINISHED (human-authorized STOP)>. The lab
> sits at its `{{BUILD_CEILING}}` build-ceiling. <One line: what is complete vs
> what remains.>
>
> **Authoritative sources:** `README.md` (the single human entry) · `DASHBOARD.md`
> (GENERATED live status — never hand-edited) · the decision-log (decided index,
> **<count>** entries newest-first, 1:1 with `adr/*.md`) · `adr/<id>.md` (one file
> per record) + `adr/_reviews/<id>-<family>.md` (cross-family sidecars) ·
> `forks/<Fxxx>/README.md` (parallel tracks) · `STATE.md` (heartbeat, iteration
> <N>) · `GOAL.md` / `context/CTX.md` (mission + `{{LOCKED_CONSTRAINTS}}`) ·
> `OPERATING_MANUAL.md` §7 (build-ceiling) + §12 (`{{HARD_GATES}}`) · the deepening
> layer (`adr/_meta/<id>-<name>.md` for heavy research · diagrams · specs ·
> threat/failure-models, and `scaffolds/` for real artifacts) · the latest
> cross-family audit.

---

## 0. TERMINAL PICKUP — the next agent / human starts HERE

<One paragraph: the lab's terminal state in plain terms — what is build-complete,
what is verified-coherent, and that the genuine-design frontier is exhausted (cite
the re-enumeration passes). State plainly that the SOLE remainder is the
escalation-gated list below, and that NONE of it is orchestrator-dispatchable —
each item is owned by a human, an expert authority, a judge panel, a worktree
spike, an apply-time act, or a promotion review.>

**START with #<k> — <the single highest-priority remainder item and why it's first>.**

### The escalation-gated remainder (the 6 FIXED classes; items are `{{ESCALATION_GATES}}`)

*(Each item: `[class] short-id` — what it is · what it blocks · where its spec /
source lives. The class TAXONOMY is fixed; the members are domain knobs.)*

- **[promotion]** — artifacts that may only be promoted past a `{{HARD_GATES}}`
  review (judge panel + cross-family). *(worked-ref: an infra artifact whose
  policy gates failed an independent cross-family review and were escalated rather
  than mechanically re-greened a third time — per the §12a convergence rule.)*
- **[expert]** — items needing a named external sign-off authority
  (`{{EXPERT_AUTHORITIES}}`). *(worked-ref: a legal/compliance sign-off cluster.)*
- **[human]** — one-way-door picks a person must own (provisional default recorded;
  does not block downstream). *(worked-ref: a cloud-vendor tie-break at a near-tie.)*
- **[judge/panel]** — calls needing an adversarial judge panel + cross-family pass
  + a falsification spike. *(worked-ref: an isolation one-way-door.)*
- **[spike]** — questions only a runnable prototype answers; full specs live in the
  named `adr/_reviews/<id>-<family>.md` sidecars (or `adr/_meta/`). Note which
  spikes are orchestrator-resolvable (no human gate) vs deferred.
- **[apply]** — acts that take effect only at real apply-time (deferred build-time
  gates). *(worked-ref: deferred isolation gates flagged shipped/partial/deferred.)*

> **The corpus is fully traceable and the build is verified-coherent. Do NOT treat
> any item above as a design gap** — they are all escalation-gated. Detail per
> item: promotion → §3/§5; experts → §7; human tie-breaks + spawned-open → §8;
> forks → §4; invariant conditions → §6.

---

## 1. Executive summary

- **What this is.** <one paragraph: the deliverable, the locked posture
  (`{{LOCKED_CONSTRAINTS}}`), the centre of gravity (`{{MISSION}}`).>
- **What the lab produced.** <decided-record count (with the 1:1 traceability
  claim) · cross-family reviews run · open forks · the deepening artifact layer ·
  the headline build result, with evidence (test counts, RED-on-mutation proof,
  falsification-harness result).>
- **The headline finding.** <the single most important result + its evidence —
  e.g. "the critical-path oracle is empirically proven NOT a placebo.">

## 2. The decided spine

<The decided architecture / findings / design, organized by dependency tier or
work-layer (`{{WORK_LAYERS}}`). One bullet per load-bearing decision: ID → the
call → the one-line why. This is the "what was decided" map.>

## 3. `{{HARD_GATES}}` gate status — the cross-family reviews

<For each `{{HARD_GATES}}` item: its cross-family (`{{CROSS_FAMILY_VERIFIER}}`)
verdict — CONCUR / CONCUR-WITH-CONDITIONS / REJECT — and what conditions remain.
A `{{HARD_GATES}}` item is `DECIDED-PROVISIONAL` until BOTH a judge panel and this
cross-family pass land.>

## 4. The OPEN forks = the spike/decision backlog

<Each open fork: `Fxxx` — branch question · status (open/converging/warm) · the
kill-switch + convergence deadline · what evidence resolves it · where the spec
lives. Flag which resolve FIRST (the critical-path forks) and which are warm.>

## 5. Build-time enforcement gaps — claimed-but-not-yet-enforced-by-construction

<Controls a decision RELIES ON but that are not yet enforced by the build (the
honest gap between "decided" and "mechanically guaranteed"). Source each to the
review that found it. This is the anti-placebo ledger — a decorative gate is NOT a
gate (§12a).>

## 6. The `{{DOMAIN_INVARIANTS}}` required conditions

<If the domain has a checkable correctness core: the load-bearing invariant
conditions (RCs) that propagate cluster-wide, their status (proven / owed /
spike-gated), and the differential-oracle / fail-closed wiring. Omit / "n/a" if
`{{DOMAIN_INVARIANTS}}` = none.>

## 7. Expert gates — escalations needing `{{EXPERT_AUTHORITIES}}`

<Each item needing a named external sign-off: what it is, what it blocks, why it
is correctly NOT a record yet (no ADR until its gate lands). These are the
`[expert]` class of the §0 remainder, expanded.>

## 8. Human tie-breaks + spawned-OPEN items

### Human tie-breaks
<one-way-door picks the human must own; the provisional default the run used; why
it doesn't block downstream.>

### Spawned-OPEN items (no record yet — author only when their gate lands)
<decisions surfaced but deliberately left OPEN with ZERO artifact references
today; the trigger that re-opens each.>

## 9. Recommended build / promotion sequence (the critical path)

<The ordered path a builder/human takes to carry this forward: what to promote
first, what each step unblocks, where the cross-family / expert / spike gates sit
on the path. This is the "what next, in order" map.>

## 10. What the lab did NOT do (the `{{BUILD_CEILING}}` ceiling)

<The explicit ceiling the artifacts matured TO but did not cross (e.g. no real
infra, no real money, no production data). State it plainly so no one mistakes a
scaffold for a deployed system.>

## 11. Housekeeping — done + outstanding inconsistencies

<Reorgs done, integrity-sweep results, any known-stale references being tracked,
the 1:1 traceability assertion (records ↔ log rows ↔ queue citations, zero
orphans) with how it was verified (e.g. set-diff of both ID sets).>

## 12. The deepening + scaffold layer

<Inventory of the detail artifacts produced beyond the core decisions: diagrams,
threat/failure models, runbooks, user stories, verification passes, scaffolds —
each with a one-line "what it is" + path. This is the depth the run added once the
decision frontier went dry.>

### Appendix — navigation (≤3 hops)
<the map that makes the ≤3-hop traceability promise concrete: from any decision →
rationale → research → artifact, name the hops.>

---

<!--
  ── Worked reference instance (NON-LOAD-BEARING illustration) ──
  In the reference fintech run this capstone closed at iteration ~101 with: a build-complete
  scaffold at the {{BUILD_CEILING}}; full 1:1 traceability (records ↔ log ↔ queue,
  zero orphans) confirmed by self-audit AND two independent model families; and a
  single ~14-item escalation-gated remainder spread across the 6 fixed classes
  (promotion / expert[lawyer] / human / judge / spike / apply). #1 was a promotion
  gate on an infra artifact whose policy gates an independent cross-family review
  had pierced as placebo. NONE of those specifics are load-bearing — they only
  show the shape a filled HANDOFF takes. Your domain's remainder is entirely
  different.
-->
