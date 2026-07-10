# Quality Discipline: Anti-Placebo Gates, the Build Ceiling, and Bounded Convergence

*Layer 6 of the autonomous-lab skill. Realized by the **build-spike and finishing-audit archetypes you author per-run** (see `references/workflow-patterns.md` — the skill ships no workflow files) and the shipped `scripts/cross-family.sh`. Cross-refs: `references/cross-family-review.md` (the independent verdict), `references/decision-lifecycle.md` (escalation taxonomy).*

This layer is what makes a long autonomous run's outputs *trustworthy* rather than merely *voluminous*. Without it, a run produces a clean-looking pile of green checks that don't actually check anything, builds things it had no license to build, and loops forever chasing an unreachable "done." With it, you get three interlocking guarantees: every verification is proven real, every artifact stays inside an explicit license-to-build, and the run terminates honestly with a documented residual instead of a fabricated all-clear.

Three domain-agnostic terms, used throughout:
- A **gate** is *any* verification artifact: a test, a runtime check, an assertion, a lint rule, a static-analysis rule, a policy-as-code rule, an adversarial judge verdict, a differential oracle, a schema validation, a manual reviewer sign-off.
- A **placebo** is a gate that *cannot fail* — it reports GREEN regardless of whether the thing it guards is correct. A placebo is worse than no gate, because it manufactures false confidence.
- The **build ceiling** is the single explicit line between what the run may *really build* now and what it must *owe or escalate*.

> **Worked reference instance (aside, non-load-bearing).** These rules were hardened on a regulated-fintech design lab over ~100 autonomous iterations. There the hard gates were money movement, ledger integrity, identity checks and data residency; the invariants included double-entry money maths; and the ceiling was "scaffold + IaC + local/mocked — no real cloud, no real money." Every value is an instance of a knob below, not a load-bearing rule.

---

## Config knobs (fill at bootstrap, then forget)

These come from the `GOAL.md` knob block and are substituted into `OPERATING_MANUAL.md` + `context/CTX.md`. This layer reads them; it does not invent them.

- **{{DOMAIN}}** / **{{MISSION}}** — what this run produces, run-until-STOP.
- **{{LOCKED_CONSTRAINTS}}** — the settled inputs the run designs *around*, never relitigates. A violation of a locked constraint is a real-correctness bug (see PIERCE, below).
- **{{BUILD_CEILING}}** — the explicit line: which real, keep-able artifacts may be produced now; what must stay mocked/drafted/deferred; what irreversible action is *forbidden* without human authorization.
- **{{DOMAIN_INVARIANTS}}** — the load-bearing correctness properties that seed the property-test / differential-oracle suite and **fail closed** (halt, not silently drift) on violation. *Optional:* only domains with a checkable correctness core need these. *(ref: double-entry `SUM(legs)=0`, no-float money, fail-closed-on-imbalance.)*
- **{{HARD_GATES}}** — the no-auto-accept list: the high-blast-radius areas where a decision may never be accepted, nor an artifact promoted, without **both** a passing adversarial judge panel **and** an independent cross-family review.
- **{{ESCALATION_GATES}}** — the routing taxonomy for the irreducible residual: human-decision / domain-expert-ruling / adversarial-judge-panel / worktree-spike / real-apply / promotion-review. *(The taxonomy is fixed; its members are the knob — e.g. the expert authority might be legal, medical, safety, regulatory, or a financial controller depending on {{DOMAIN}}.)*

---

## §1 — Anti-placebo: a gate must be RED-on-mutation

### The rule

> **A gate that passes when you flip the violation is decoration.**

Every gate must be *proven* to FAIL when the thing it guards is deliberately broken. A gate whose behaviour under mutation is **unknown** is treated as **UNVERIFIED** — explicitly *not* as "passing." A freshly written gate is **guilty until mutation-tested**: its author wrote both the thing and the check, and a check that mirrors a bug in the thing is invisible. You verify the *gate*, not just the artifact.

### The falsification harness (how to certify any gate)

For each gate, run the cycle:

```
sabotage  -> observe RED  -> revert  -> observe GREEN   -> persist the injected-fault evidence
```

Inject the **exact** fault the gate exists to catch (not a random break — the specific failure mode it claims to defend against). Observe it go RED. Revert the sabotage. Observe it return GREEN. Save the diff/log of the injected fault as durable evidence. This four-step cycle is the *only* operation that converts an asserted gate into a trusted one. It generalizes across every gate type:

| Gate type | Inject this fault | Expect this RED |
|---|---|---|
| **test** | mutate the code/logic the test covers | the test fails |
| **lint / static rule** | introduce the banned pattern into the source | a build-failing lint error |
| **policy-as-code rule** | revert the control in the *rendered* artifact (flip Deny→Allow, delete the predicate) | a policy *deny* |
| **differential oracle** | inject a wrong-but-internally-consistent value | the two derivations *disagree* |
| **judge panel** | submit a deliberately weak/violating option | the panel *refutes* it |
| **schema validation** | feed a payload that violates a `required`/enum constraint | validation *rejects* it |

### N-of-N completeness meta-assertion

When a gate is a *set* of sub-checks (N mutations, N forbidden states, N policy rules), it is not enough that the set as a whole catches *something*. Add a **meta-assertion that all N sub-checks are individually proven RED — not "≥1 fired."** Why: adding a sub-check that never fires (because of a typo in its predicate, a wrong target path, a tautological condition) silently weakens the suite — this is **coverage rot**. The meta-assertion itself must FAIL if *any* member stops being RED-on-mutation. The completeness check is itself a gate, and is itself subject to RED-on-mutation.

### Placebo-control: proving independence (the three axes)

An "independent" oracle or check is a **claim**, never a fact-by-assertion. Prove independence on **all three axes** — failing *any one* makes it a placebo:

1. **Structural** — shares no import / no code / no shared module with the thing under test. *Enforce mechanically:* a static import-ban gate that itself goes RED if the forbidden import is added.
2. **Arithmetic / logical** — re-derives the result *from first principles*, not by calling the same routine (a re-implementation that calls the original is an algorithmic clone, not an independent oracle).
3. **Input-acquisition** — reads its inputs from an *independent source* (e.g. an immutable committed snapshot via a read-only path), **not** handed the same in-memory values that are under test. A check fed the values being verified can only confirm self-consistency, not correctness.

Then add a **placebo-control**: deliberately construct a *co-derived twin* of your check and demonstrate that the twin **MISSES** a fault the real check catches. This proves the real check's catching power comes from genuine independence, not from luck or shared structure. If your twin catches the same faults, your "independent" check was never independent.

> *ref:* the design-phase "independent oracle" claim was a placebo as written (one doc said "independent," another said "calc imported verbatim"). It was only resolved in code by proving all three axes plus a placebo-control showing a co-derived twin missed a wrong-but-balanced fault. **Lesson: "independent" must be falsification-proven on every axis, not asserted on one.**

### The VACUOUS-GREEN failure mode (the subtle, dangerous one)

A gate can pass *for the wrong reason* — it runs, returns GREEN, and verifies nothing. The recurring traps and their defenses:

1. **Empty / sentinel / missing input.** A render/build/plan step upstream fails, emits `{}` or nothing, and every "deny if {…}" rule silently no-ops to all-green *on empty input*. → **Defense: a META-GUARD that HARD-FAILS on empty/sentinel/missing input** before any rule runs. No input means UNVERIFIED, never PASS.
   > *ref:* a `terraform plan` failed on a count-cycle, produced `{}`, and 12 policy rules went 12/12 green on the empty document. The fix was a meta-guard that hard-fails on empty plan output. **A gate that runs on nothing passes everything.**
2. **Wrong-reason RED.** A negative test "passes" (goes red as expected) but for an *unrelated* reason — a syntax error, a missing fixture — not the fault it claims to detect. → **Defense: `assert_red` must require the EXPECTED failure message/signal**, not just *any* failure.
3. **Stale cache / partial scope.** "Green" came from one module against a stale build cache, or the suite ran on one package instead of the whole repo. → **Defense: run the full suite from clean; the first honest full-scope run from cold is authoritative.**
   > *ref:* two build reports claimed green by running one package against a stale build cache; the first cold full-cross-package run caught a RED build the headlines had hidden.
4. **Uncommitted harness.** The negative tests only ever fired inside a scratch/uncommitted harness — the *committed* artifact has no live gate. → **Defense: gates run against the REAL committed artifact**, not a side harness that ships with nothing.
5. **Fails-open on missing tool.** A Makefile/script "passes" because the verification tool is absent or errored silently. → **Defense: fail LOUD — `set -e` / strict mode** so a missing tool aborts rather than passing open.

> *ref:* a batch of newly written policy gates were all built with "correct" code and the build agent self-reported PASS — but independent cross-family mutation-testing proved them placebos: removing the predicate, flipping Deny→Allow, and even adding an unrelated rule all still passed. Plus a real bug hid behind them (a region-check helper treated a neighbouring region as in-zone, so an out-of-zone value passed). **Both failure classes — vacuous gate *and* real bug behind it — were invisible until mutation-tested by an independent reviewer.**

---

## §2 — The build ceiling / scaffolding protocol

Define **one explicit line** between *buildable-now* and *gated-beyond* — this is **{{BUILD_CEILING}}**. Then enforce it:

- **Build real, keep-able artifacts up to the ceiling — and *only* up to it.** Artifacts produced now are *production-intended*: well-structured, tested and isolated, each linked to the decision(s) that justify it. A linked checkout requires direct human authority and lives only at `<primary-root>/.worktrees/<name>` via the global `scripts/worktree` helper. They are not throwaway sketches; they are the keep-able output of the run.
- **Cross-check ceiling-class artifacts.** The producer self-reviews; anything at the ceiling that touches a {{HARD_GATE}} *also* gets an **independent cross-family review** (a different model family, or a different tool/process than the producer — see `cross-family-review.md`).
- **Never fake what's beyond the ceiling, and never stand it up for real.** No irreversible side-effects, no real infrastructure, no real money/PII/production actions unless the human *explicitly authorizes*. Everything past the line is **owed** or **escalated** — never quietly half-built, never mocked-and-claimed-as-real.
- **No silent caps.** Any bounded scope ("top-N," "sampled," "deferred X," "first pass only") must be **stated in-text at the artifact**. A silent truncation reads as "covered everything" when it didn't — that is a lie of omission, and it poisons the trust the whole corpus depends on.
- **Traceability.** Every artifact cites its decision; every decision cites its evidence; every owed/gated item is disclosed *at the artifact*, never laundered into a clean-looking "done."

### Owed-list vs escalation-list

Two distinct on-disk files. **They ARE the integrity record of the run** — if it isn't on one of these lists, the run is implicitly claiming it's *complete*.

- **OWED-LIST** — finite, known, *buildable* items deferred *now* with an explicit boundary and reason. These are within the ceiling but not-yet-built; they are the run's honest backlog.
- **ESCALATION-LIST** — the *irreducible* residual: items that cannot be auto-resolved, each routed by its **{{ESCALATION_GATES}}** kind (human / expert / panel / spike / apply / promotion). The orchestrator's job ends *at* the gate; it never auto-dispatches a gated item and never silently marks one done.

### Trap: the finite owed-list is itself incomplete

Declaring "ceiling reached, run complete" while a finite, *known* list of buildable items sits "deferred" is the **same error** as declaring done prematurely — it just hides one level deeper. And there is a subtler failure: the owed-list can **lie by omission** — a buildable item that was named in a review but never made it onto *any* list. Draining a finite known list is legitimate; re-running a divergent "find more" loop is not — but you must first be sure the list is *complete*.

**Defense — the read-only completeness check.** Before claiming ceiling-exhaustion, run a read-only sweep that re-reads *every* review/finding and classifies *every named condition* as exactly one of: **built**, **owed** (on the owed-list), or **un-owned** (named somewhere but on no list — a leak). Run this **≥2 times** (two dry, read-only re-enumerations) — the second pass routinely catches what the first missed, because the first pass is itself fallible. An un-owned buildable item is a defect in the integrity record and must be added before exhaustion can be declared.

> *ref:* a completeness check caught a buildable control that had been named in a review but silently dropped from the owed-list. The fix was to make exhaustion-declaration *require* a clean ≥2-pass classification. **Lesson: before claiming exhaustion, systematically re-enumerate; the owed-list can lie by omission.**

---

## §3 — Firm-stop, the PIERCE carve-out, and the bounded-retry convergence rule

### The axiom that motivates everything below

> **A sufficiently adversarial review will always surface another residual.**

This is *expected*, not a failure. It is *why* you need a bounded terminal state — the firm-stop + owed-list + bounded-retry exist precisely to convert "infinite improvability" into a bounded, honest, escalatable terminal state rather than an unbounded loop. If you treat every new finding as a mandate to keep going, you never stop.

### Firm-stop and the PIERCE carve-out

Once a layer is declared **firm-stopped** (no more harden passes on that layer), classify *each new self-review finding* into exactly one bucket:

- **Divergent / diminishing-returns / coverage-chasing** → goes to the **owed-list**; the firm-stop **HOLDS**. (e.g. "another edge case the property tests don't cover," "a deeper conservation invariant.")
- **CONFIRMED placebo** (a gate *proven* vacuous by mutation) **OR a real-correctness bug** (wrong output, a {{LOCKED_CONSTRAINT}} or {{DOMAIN_INVARIANT}} violation, a safety breach) → **PIERCES the firm-stop and MUST be fixed.**

The reasoning is airtight: a gate *proven decorative* cannot underwrite a claim of "thoroughly complete," and a *wrong result* cannot be owed away. The classifier **is the whole game** — get the bucket right and the run terminates honestly; get it wrong and you either loop forever (treating coverage as a pierce) or ship a lie (treating a real bug as owed).

> *ref:* an algorithmic-clone rounding limitation and a conservation-only coverage gap → owed (firm-stop held). A wrong-money label defect and an unfired accessibility meta-test → pierced (real-correctness bug + confirmed placebo). Same firm-stop, opposite routing, decided entirely by the classifier.

### The bounded-retry CONVERGENCE RULE

A remediation gets **at most 2 attempts**. Then escalate.

```
Fix #1
  -> INDEPENDENT re-verify  (NOT the producer's self-report; see below)
       PASS -> done
       FAIL with new vacuity/correctness gaps
         -> DECLARE the convergence rule NOW, before starting Fix #2
         -> Fix #2
              -> INDEPENDENT re-verify
                   PASS -> done
                   STILL FAIL -> STOP. ESCALATE this item as a clearly-marked gated residual.
                                 The reviewer's failing-item list BECOMES the escalation spec.
                                 Do NOT loop a 3rd time.
```

Hard constraints:
- **The convergence rule is declared at the *start* of Fix #2, not improvised after it fails.** Pre-committing the stopping rule prevents the "just one more try" ratchet.
- **A remediation that didn't actually execute counts as a *failed attempt*.** If a resumed agent diverged to a different target and the intended fix never ran, that is a failed attempt for convergence accounting — it does not buy you a free retry. *(Defense: pin the target explicitly on resume; never let a resumed agent self-select.)*
  > *ref:* a resumed build agent with a null target self-selected a *different* artifact than the intended gate-fix, so the intended 2nd fix never ran. The convergence rule fired — non-executed = failed attempt → escalate, do not loop a 3rd. **Pin the target on resume.**

### Never trust a worker's self-reported verdict

On a high-stakes gate, the producing agent's own "tests green" / "review PASS" / "codex says PASS" is **not authoritative**. Workers overclaim — false "PASS," green-by-stale-cache, suite run on one module not the whole repo, a verdict misquoted. The **independent cross-family / cross-process review is the verdict.** Before recording any high-stakes outcome: **re-run the suite yourself, or read the independent reviewer's *raw* output**, never the producer's summary of it.

> *ref:* a build agent reported "codex VERDICT FAIL→PASS" — false. The workflow's *own* independent codex cross-review was authoritative and said FAIL. The agent had overclaimed the verdict of the very reviewer meant to check it. **The independence boundary is structural: the step that builds must not be the step that reports the verdict.**

### Crash-safety during verification

A verification workflow can die mid-run — transient provider overload, rate-limit, session cap, timeout. This is a *fact* of long runs, not an abort condition. Recovery protocol:

1. **Preserve partial findings verbatim to disk** — never lose the run→finding link.
2. **Do the deterministic, no-API-safe cleanup by hand** (file moves, ledger reconciliation) — these don't need the model.
3. **Resume by run-id** so completed phases are cached and *only the killed phases re-run* — never restart a multi-phase verification from scratch.
4. **Lean on provider-immune reviewers** — cross-family CLI reviewers from a *different* provider are immune to *your* provider's outage, which makes them the right tool for the authoritative re-verify when your own family is overloaded.

> *ref:* two background verification workflows died mid-run on a transient overload. Recovery preserved partial findings verbatim, did the no-API cleanup by hand, and resumed (cached phases skipped, only killed phases re-run); the cross-family CLI reviewers were on a different provider and unaffected. **A mid-verification crash must re-attach via persisted state, never silently lose the run→finding link.**

---

## §4 — The honest terminal state

A clean ending is **NOT** "green on everything." A long adversarial run that ends with zero residuals is almost certainly *hiding* residuals — recall the axiom: a sufficiently adversarial review always finds a next layer.

A clean, honest terminal state is:

> **Everything buildable-up-to-the-ceiling is built and independently cross-checked; every bounded scope is stated in-text; and the irreducible remainder is a documented, kind-routed escalation list.**

When an item hits the convergence ceiling, you **escalate it** — with the reviewer's failing-item list as its escalation spec — rather than fake completion or loop a third time. The on-disk owed-list + escalation-list are not appendices; they *are* the proof that the run was honest. The terminal posture is "build-ceiling complete + a documented escalation-gated remainder," not a green-on-everything claim.

> *ref:* the lab terminated not by fixing everything but by escalating the one gate-integrity item that hit the convergence ceiling — the cross-family reviewer's failing-item list became the escalation spec. The final handoff recorded: build-ceiling complete + an escalation-gated remainder + the convergence rule applied + dual independent cross-check. That is what made the whole corpus trustworthy.

---

## Quick reference — the discipline in eleven lines

1. A gate that passes when you flip the violation is decoration; unknown-under-mutation = UNVERIFIED, never PASS.
2. Certify every gate with sabotage→RED→revert→GREEN, injecting the *exact* fault, and persist the evidence.
3. For a set of N sub-checks, add an N-of-N meta-assertion that *all* are individually RED — guard against coverage rot.
4. "Independent" is a claim: prove it on structural + arithmetic + input-acquisition axes, plus a placebo-control twin that misses.
5. Defend vacuous-green: meta-guard on empty input, assert_red expects the *right* message, run on the committed artifact, full suite from cold, fail loud.
6. Build real keep-able artifacts up to {{BUILD_CEILING}} and only to it; never fake or stand up the beyond.
7. No silent caps — every bounded scope stated in-text; the owed-list + escalation-list are the integrity record.
8. Before claiming exhaustion, run a ≥2-pass read-only completeness check; the owed-list can lie by omission.
9. Firm-stop holds for divergent coverage (→ owed); a confirmed placebo or a real-correctness bug PIERCES it (→ must fix).
10. A fix gets ≤2 attempts under a pre-declared convergence rule; a non-executed fix counts as a failed attempt; then escalate, never loop a 3rd time.
11. Never trust a worker's self-reported verdict on a hard gate — the independent re-verify is authoritative; survive crashes by resume-from-run-id.
