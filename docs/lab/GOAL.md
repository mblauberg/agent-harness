# GOAL — the north star + the RUN/STOP gate
<!--
  HUMAN-OWNED FILE. The orchestrator reads this at the START of every iteration
  and obeys it. The orchestrator must NEVER author content into this file — it
  is the one place the human steers and stops the run. The ONLY clean exit is a
  human setting STATUS: STOP below.

  This template is domain-agnostic. Every domain fact lives in the CONFIG KNOBS
  block — fill it ONCE, then run scripts/bootstrap-lab.sh to substitute the
  knobs into OPERATING_MANUAL.md + context/CTX.md. GOAL.md is intentionally the
  only file you hand-edit.
-->

```config-knobs
# ============================================================================
# CONFIG KNOBS — fill these ONCE, then re-run scripts/bootstrap-lab.sh to
# substitute them everywhere. This fenced block is the SINGLE domain-injection
# point for the whole lab. A thin fill produces thin output across every
# workflow — write a substantive MISSION + constraint set.
# Each knob: replace the {{...}} value; keep the KEY = on the left.
# ============================================================================

DOMAIN            = Agent harness comprehensive review implementation
# ^ one line naming the field/system this run operates in. Sets the vocabulary
#   every delegated agent inherits. (worked-ref instance, see footer: an
#   AU accounting-practice SaaS whose revenue engine is invoice factoring.)

MISSION           = Implement the entire agent-harness comprehensive review cleanly on one comprehensive-review branch and one final PR: every substantiated finding, accepted decision, Lane A-D obligation, roadmap step, deterministic gate, live local verification, and required independent review; continue until the human sets STOP.
# ^ the open-ended north star + definition-of-good: what the run PRODUCES, run
#   until STOP. Be concrete and substantive — this is the prompt every workflow
#   ultimately serves. (worked-ref: "exhaustively design + scaffold the system;
#   drive every decision to a justified, adversarially-judged record; fork every
#   one-way-door; build real keep-able scaffolds; never declare done.")

LOCKED_CONSTRAINTS = D-021 chair charter; KICKOFF ordering; one branch and one PR; no merge or origin/main push; worktrees only under owning-repo .worktrees; preserve dirty root; no release deploy publish production credential registry mutation standing egress or external-effect profile; workspace-write-offline stays inert until the exact Step-3 gate; never access list or enumerate .agent-run/AFAB-004; durable truth lives in repo docs and exact per-lane receipts.
# ^ the do-not-relitigate set the run designs AROUND — settled inputs, NOT
#   decisions to reopen. The orchestrator treats these as axioms; it never spends
#   a fork relitigating them. (worked-ref: data-residency in one jurisdiction +
#   the operating licence + AML obligations + privacy regime + minimal-cost,
#   solo-but-AI-augmented build.)

BUILD_CEILING     = Authorised local source docs tests fixtures schemas configs worktrees commits and deterministic mocked or local-only probes; push only comprehensive-review and open one draft/final-review PR. No merge release deploy publish provider-login change production credential or registry mutation external messaging standing network-egress enablement or other shipping action.
# ^ the explicit line between what the run may build AUTONOMOUSLY and what
#   requires human authorization / is owed / escalated. Everything below the line
#   is fair game; crossing it needs explicit human sign-off. (worked-ref:
#   "scaffold + infra-as-code + local/mocked is the ceiling — no real cloud
#   provisioning, no real money movement, no production data.")

HARD_GATES        = Normative authority and schema one-way doors; security and containment controls; provider-action and lifecycle custody; write-profile containment verdict; irreversible migration or compatibility decisions; Spec-05 80x24 usability adjudication; programme acceptance. Each needs objective mutation-sensitive evidence plus fresh native review and Claude Opus cross-family review; bonus-family attempt where the charter requires it.
# ^ high-blast-radius work areas that may NEVER be auto-accepted: each needs a
#   passing judge panel AND an independent cross-family pass before a decision is
#   final or an artifact promoted. Drives the DECIDED vs DECIDED-PROVISIONAL
#   split (see OPERATING_MANUAL §4). (worked-ref: money-movement; double-entry /
#   ledger posting; KYC/AML logic; tenant-isolation / RBAC; asset-registration
#   logic; anything readable as a regulated decision.)

ESCALATION_GATES  = human: any genuine external-effect authority expansion or need to access AFAB-004, plus final PR review and merge; expert: none presently named; judge-panel: disputed one-way doors and final programme acceptance; spike: fixed Step-3 containment matrix and other questions with no deterministic oracle; apply: release deploy credential registry and provider-login effects remain forbidden without new human authority; promotion: only one green comprehensive-review PR may be presented and the human alone merges it.
# ^ the concrete instances, for THIS domain, of each of the 6 GENERIC gate
#   classes (the taxonomy is fixed; the members are the knob):
#     [human]      one-way-door picks a person must own (e.g. a vendor tie-break)
#     [expert]     items needing a named external sign-off authority
#                  ({{EXPERT_AUTHORITIES}} — e.g. a lawyer / auditor / clinician)
#     [judge/panel]calls that need an adversarial judge panel + cross-family pass
#     [spike]      questions only a runnable prototype can answer
#     [apply]      acts that take effect only at real apply-time (deferred gates)
#     [promotion]  artifacts that may only be promoted past a §-gate review
#   List the named items per class so the orchestrator designs AROUND them
#   instead of stalling. (worked-ref: a legal sign-off cluster [expert]; a
#   cloud-vendor human tie-break [human]; an ops-isolation one-way-door [panel];
#   deferred infra apply-gates [apply]; promotion-gated infra [promotion].)

# ---- the knobs below DEFAULT sensibly; edit only to TUNE --------------------

RUBRIC            = Correctness and contract fit 0.30; security and authority safety 0.25; evidence quality and falsifiability 0.15; reversibility 0.10; operability 0.08; maintainability 0.07; human-attention efficiency 0.05.
# ^ weighted scoring criteria (weights sum to 1), recomputed DETERMINISTICALLY
#   in the judge workflow — never eyeballed. Default skeleton (swap the Risk and
#   Mission-centricity axes for your domain): Correctness/fit · Risk ·
#   Reversibility · Cost · Operability · Build-leverage · Mission-centricity ·
#   Evidence-quality.

WORK_LAYERS       = Spec authority and traceability; build and CI foundations; runtime persistence and custody; protocol authority cutover; provider adapters and containment; Console Herdr and Rust supervisor; skills lifecycle and policy; security supply chain and release assurance; live usability and final evidence.
# ^ the slices of the problem space the enumerate/research/judge workflows fan
#   out across (research lenses + judge lenses). Default array, overridable via
#   workflow args. (worked-ref: by-technology, by-precedent, by-failure-mode,
#   by-cost, by-compliance, by-operability.)

RUNAWAY_CAPS      = Maximum 4 concurrent agents including chair; maximum 3 active deep tracks; fork depth at most 2; at most 3 jobs per work unit; at most 2 repair cycles before council or recorded escalation; long idle wake 3600 seconds; one serial writer per file.
# ^ the ceilings that keep a multi-week run from exploding (see OPERATING_MANUAL
#   §0a). Defaults: max ~4 concurrent jobs · max ~3 active forks · fork-depth ≤2
#   · ~3 runs per unit before escalating · bounded-retry ≤2 · long-wake ~3600s.
#   These are CEILINGS, not targets — within them, prefer depth and rigour.

MODEL_MATRIX      = Chair Codex gpt-5.6-sol xhigh rising to max or ultra for crucial synthesis; native flagship subagents for judgement review and bounded implementation where selectable; Claude Opus 4.8 xhigh as other primary; mechanical scouts use the lowest available bounded tier only when runtime model routing is explicit and recorded; never invent unavailable model aliases.
# ^ durable aliases: flagship for judgement/design, workhorse for bounded
#   research/implementation, scout for schema-forced mechanical work; plus effort
#   (low/medium/high/xhigh/max). Resolve each alias to a concrete runtime model at
#   bootstrap and record the mapping. Full policy + matrix:
#   references/model-effort-policy.md.

CROSS_FAMILY_VERIFIER = Claude Opus 4.8 xhigh in the owned Herdr pane as load-bearing other primary; attempt Cursor Grok 4.5 High and Agy Gemini 3.1 Pro through Fabric for charter-required bonus review after runtime health permits, recording degraded or unavailable legs; bounded review timeout 30 minutes unless a lane contract is stricter.
# ^ which independent / DIFFERENT-MODEL-FAMILY reviewer(s) underwrite high-stakes
#   verdicts and Fabric route/result receipts. Cross-family agreement can raise
#   confidence on one-way doors; evidence still outranks votes. Default: the
#   other primary plus risk-proportional bonus attempts; a REVIEW_TIMEOUT.

EXPERT_AUTHORITIES = None presently named; the human repository owner retains final PR review and any authority-expansion decision.
# ^ named domain sign-off authorities for the expert escalation class (fill per domain;
#   referenced by HANDOFF + the escalation taxonomy). Defaults if left unfilled.

DOMAIN_INVARIANTS = Exact clean integration base and preserved ancestry; no source claim without live recheck; current specs load without superseded history while archival bytes reconstruct the freeze; authority compilation is monotone and cannot widen any input; certifying review stays read-only; workspace-write-offline remains unavailable until exact tuple certification; no duplicate effect on replay; all schema and receipt identities are closed hash-bound and fail-closed; no forbidden external effect or AFAB-004 access.
# ^ OPTIONAL: load-bearing correctness properties that seed the property-test /
#   differential-oracle suite and FAIL CLOSED on violation. Only domains with a
#   checkable correctness core need this. Leave as "none" otherwise. (worked-ref:
#   a set of money-math coherence checks used as both the seed property suite and
#   a differential-testing oracle; the calc engine fails closed rather than drifts.)
# ============================================================================
```

## Mission (open-ended — run until STOP)

{{MISSION}}

The framing is **never declare "done."** An empty queue is a trigger to
re-enumerate the next layer of now-visible work and to deepen + harden — never a
reason to halt. The orchestrator may not end the run on its own; the only stop is
`STATUS: STOP` in this file.

## Traversal order (default — "Active directives" below override it)

1. **Foundational one-way-doors first.** Drive the highest-blast-radius,
   hardest-to-reverse decisions early, using forks + judge panels rather than
   single-agent picks. Flag the `{{ESCALATION_GATES}}` ones and design AROUND
   them — never stall the whole run on a gated item.
2. **Descend the dependency tiers**, respecting `Depends-on`; run INDEPENDENT
   units concurrently within the `{{RUNAWAY_CAPS}}` caps.
3. As decisions settle, **build** the decided directions up to `{{BUILD_CEILING}}`
   (real, tested, isolated artifacts), promoting winning forks.
4. **When the queue empties, DO NOT STOP.** Re-enumerate the next layer; deepen
   and harden the artifacts; add detail (specs, diagrams, threat/failure models,
   runbooks, stories); re-verify the `{{DOMAIN_INVARIANTS}}`; reorganize for
   navigability. There is always more depth — go get it.

## Definition of "good" for this run

- Every decision has a record with options, evidence, a judged verdict (scored on
  the `{{RUBRIC}}`), rejected alternatives, and consequences.
- Every `{{HARD_GATES}}` item passed a judge panel **and** a `{{CROSS_FAMILY_VERIFIER}}`
  cross-family pass before counting as final (DECIDED, not DECIDED-PROVISIONAL).
- Hard / one-way-door decisions were explored down **multiple forked paths** with
  spikes before converging, and the forks are preserved for inspection.
- Built artifacts are production-intended, runnable, and trace back to the
  decisions that justify them.
- The lab stays **navigable**: any decision → rationale → research → artifact in
  **≤3 hops**.

## Locked constraints (do NOT relitigate)

{{LOCKED_CONSTRAINTS}}

> Design around these; do not reopen them. They are settled inputs, not decisions.

## Escalation-gated items (design around — do not stall the run)

{{ESCALATION_GATES}}

> Each of these is owned by a human, an expert authority, a judge panel, a spike,
> an apply-time act, or a promotion review — not by the orchestrator. Build to the
> intent, keep the flagged optionality, record the open question, mark the gate in
> `STATE.md` "Blockers", and proceed on everything else.

## Active directives (human-editable steering)

> Add bullets here to focus the run on something specific. Empty = follow the
> traversal order above. This block overrides the default traversal.



## STATUS gate

To stop: change `STATUS:` below to `STOP` (and interrupt the loop if running).
The orchestrator checks this **every iteration** and writes a clean handoff in
`STATE.md` + refreshes `HANDOFF.md` before halting.

> **Flipping to STOP is a finish-blocker unless GOAL + STATE + HANDOFF all agree
> on the terminal truth.** A STOP written while the capstone is stale is a bug.
> When you flip it, write an inline audit note (who / why / when) and update PREV.

STATUS: RUN
<!-- audit note: who/why/when this last flipped. RUN at scaffold. -->
PREV: (none)

---

<!--
  ── Worked reference instance (NON-LOAD-BEARING — for pattern-matching only) ──
  The patterns above were hardened on a ~100-iteration autonomous reference run
  in an AU fintech domain. There the knobs were filled concretely, e.g.:
    DOMAIN             = AU accounting-PM SaaS, revenue engine = invoice factoring
    LOCKED_CONSTRAINTS = AU data residency + AFSL/AML-CTF/PPSR/Privacy-Act + minimal-cost
    HARD_GATES         = money-movement / ledger-posting / KYC-AML / tenant-isolation / PPSR
    BUILD_CEILING      = scaffold + IaC + local/mocked, no real cloud or money
    CROSS_FAMILY_VERIFIER = other primary + optional Fabric-routed Gemini bonus
  NONE of that is load-bearing. It is shown only to make the abstract knobs
  concrete. Your domain fills them with entirely different values.
-->
