# Cross-Family Review

*Layer 4 of the autonomous-lab discipline. Realized by the shipped `scripts/cross-family.sh` and wired into the **judge-panel / build-spike / finishing-audit archetypes you author per-run** (see `workflow-patterns.md` — the skill ships no workflow files). Read this when a decision or artifact is high-stakes and you must not let any single model family — least of all your own — be the final word.*

Cross-family coverage follows the HARNESS risk ladder. Substantial+ stages use
the other primary; crucial/terminal stages attempt bonus families. A workflow's
`crossFamily` flag is the execution marker for that tier decision, never an
independent policy default. Capture external verdicts separately and adjudicate
their evidence.

---

## 1. Why a different family

Two payoffs, both load-bearing:

1. **Genuine independence.** A reviewer from a different training lineage fails differently, carries different priors, and is not anchored by the author's blind spots. Cross-family *agreement* materially raises confidence on a one-way-door; cross-family *disagreement* surfaces real risk you would otherwise ship. A same-family self-review systematically **over-passes** — it shares the author's mistakes.
2. **Provider-failure immunity.** The external CLIs hit *other vendors'* endpoints, so they keep working when the orchestrator's own API is overloaded (e.g. HTTP 529 / rate-limit / session-cap). Verification does not go dark because your primary provider is having a bad day. This is the whole point of routing *outside* your own provider rather than just spawning another same-family agent.

---

## 2. The reviewer roster — config knob `{{EXTERNAL_FAMILIES}}`

The roster is **family-relative to the operator**: it is "families ≠ the operator's", never a fixed
vendor list. A Claude Code operator defaults to codex + gemini; a **Codex operator** defaults to
claude + gemini (`codex-operator.md`) — a `codex exec` reviewer under a Codex operator is a
same-family self-review and cannot certify a hard gate. Adapt to whatever CLIs you have **that reach
a different provider than the orchestrator** — the requirement is *different vendor endpoint*, not a
specific brand.

| Family | CLI invocation (via `scripts/cross-family.sh`) | Strengths |
|---|---|---|
| **codex** (OpenAI family) | `cd <dir> && codex exec -s read-only --skip-git-repo-check "<prompt>"` | Adversarial correctness, rerunning read-only-safe checks, deep debugging and alternative designs. The default single reviewer under a non-OpenAI operator. |
| **gemini / Antigravity** (Google family) | the `agy-headless` wrapper in its default sandbox with `--include-dir <dir>` | Very-large-context whole-corpus reads, multimodal input and breadth-first orientation. Advisory only: sandbox is not a certified no-write guarantee. |
| **claude** (Anthropic family) | `claude -p` with tools disabled + plan mode (enforced read-only; see `cross-family.sh --models claude`) | Adversarial reasoning review, spec/contradiction analysis. The default single reviewer under a **Codex/OpenAI operator**. |

Record outcomes with the three statuses (shared vocabulary with the `orchestrate`
skill): `cross_family_certified` (enforced/oauth-safe read-only route ran), `cross_family_advisory`
(best-effort route, e.g. agy — may scout, never certifies alone), `CROSS-FAMILY-NOT-RUN: <reason>`
(recorded skip). Never silently downgrade or collapse them.

**Compose, do not re-document.** The agy invocation is owned by the dedicated **`agy-headless` scout skill**, and `scripts/cross-family.sh` **resolves the wrapper dynamically** (never a hardcoded path) — first match wins:

1. `$AGY_WRAPPER` env var, if set **and** executable;
2. skill-relative: `<dir-of-cross-family.sh>/../../agy-headless/scripts/run-agy-headless`;
3. `$HOME/.agents/skills/agy-headless/scripts/run-agy-headless`;
4. `$HOME/.claude/skills/agy-headless/scripts/run-agy-headless`;
5. `run-agy-headless` on `PATH`;
6. else fall back to direct `agy` on `PATH`.

`scripts/cross-family.sh` shells out to whichever it finds; do not reimplement agy's flags, model-discovery, or auth here. Inherit its documented quirks:

- An **unknown `--model` slug silently falls back to Gemini Flash.** Confirm which model actually answered before you trust a Pro-tier verdict.
- **`--sandbox` is read-only *intent*, not a certified no-write proof.** Treat agy as scout/advisory unless host policy accepts best-effort external review as evidence.
- agy returns **prose, not JSON** (no `--output-format json`). Impose a structured markdown output contract in the prompt and parse that.

`scripts/cross-family.sh` must **fail loud** if a CLI is missing or
unauthenticated. The caller records that result. Missing other-primary coverage
stops certification; missing bonus-family coverage does not block the run.

**Reviewers are slow and agentic.** They explore the working dir and run tools — budget a generous `{{REVIEW_TIMEOUT}}` (default ~600000 ms / `--print-timeout 540s`). If a reviewer's sandbox cannot read the target files, the orchestrating step feeds it the needed excerpts (Read + paste into the prompt) — but **the returned judgment must still be the external family's, captured verbatim.** You supply context; you do not supply the verdict.

---

## 3. Same-family panel vs cross-family — the routing rule (and how many reviewers)

Cross-family review is one of **two** independent-verification layers; the `{{MODEL_MATRIX}}` names which fires when (full policy: `references/model-effort-policy.md` §5):

- **Same-family adversarial panel first** — a `judge-panel` of N **`flagship`** skeptics, fail-closed, is the **default** independence layer for every contestable claim, option, or decision. The cheap model may *feed* it breadth lenses; **only `flagship` sits on it** (no cheap-model judges, ever). This is always-on above the trivial.
- **The other primary is load-bearing** for material and irreversible work:
  Claude when Codex leads, OpenAI when Claude leads.
- **Bonus families add optional lenses.** Gemini, xAI and other families can
  research, scout or review at any useful angle. Run them in parallel for hard
  gates when available, but quota/API failure never blocks progress and their
  findings are advisory until a primary-family reviewer corroborates them.

**How many external reviewers** — knob `crossFamily: 'codex' | 'both' | false`:

- **`codex`** is the load-bearing other primary when Claude operates. Its
  failure is explicit and stops certification.
- **`both`** runs the other primary and Gemini concurrently. Reconcile evidence,
  not votes. Gemini failure is recorded and ignored for gating; a Gemini
  finding blocks only after a primary-family reviewer reproduces or
  corroborates it.
- For the hardest terminal refutation, use a fresh flagship context, the other
  primary and one or more opportunistic bonus families.

---

## 4. The non-negotiable rule: never trust a self-reported external verdict

> A build/worker agent that runs the external reviewer *itself* **will sometimes overclaim** ("codex VERDICT: FAIL → PASS"). The authoritative verdict is the workflow's **INDEPENDENT cross-review tool-result** — the reviewer's raw stdout captured in a **separate orchestrator-controlled step** — **not** the build agent's prose summary of it.

This is the layer's hardest-won lesson. Enforce a structural **independence boundary**: *the agent that builds/authors an artifact must never be the agent that reports its external verdict.* Architecturally:

- **Build/author = one step.** Returns `buildReport` + `selfReview` (same-family, advisory only).
- **Cross-family review = a separate step** whose `agentType` is the external reviewer. It invokes the external CLI and returns `crossReview` as **its own typed field**, mapped from the reviewer's raw output.
- **The orchestrator reads the `crossReview` schema field.** The build report's claims about the review are *narrative only* and carry **no authority**. If the build report says "codex passed" and the independent `crossReview` field says FAIL, **FAIL is the truth.**

In the **build-spike archetype** this is why `crossReview` is a sibling of `buildReport`, never folded inside it — that separation *is* the independence boundary.

---

## 5. Wiring into a verify phase

Pattern (from the build/spike and finishing-audit workflows):

```
Build      → agent builds the artifact; returns buildReport            (one agent)
Review     → selfReview (same-family, advisory)                        (same or new agent)
           → IF crossFamily: crossReview = a SEPARATE agent step whose
             prompt INVOKES scripts/cross-family.sh and returns ITS
             verdict, mapped to the XCHECK schema                       (must be a different step)
Synthesize → reconcile verdict(s); fold findings into gate decision    (orchestrator reads crossReview field)
```

**Typed verdict schema (`XCHECK`)** — tune the boolean dimensions and the `newIssues` severity enum to your domain (`additionalProperties:false`, all fields `required`):

```
{ family,                       // which external family produced this
  coherent,                     // bool: internally consistent
  traceable,                    // bool: claims trace to evidence/files
  <domain-readiness booleans>,  // e.g. finishable, promotable, gate-non-vacuous
  refutedFindings[],            // self-audit findings the reviewer DISPUTES
  newIssues[ {issue, severity, file} ],  // what the self-audit MISSED
  mostImportantForNextAgent,    // the single thing the next agent must not miss
  verdict }                     // overall PASS | FAIL | PASS-WITH-CAVEATS
```

**Review-prompt template** — parameterize over `{{DOMAIN}}`, `{{MISSION}}`, `{{LOCKED_CONSTRAINTS}}`. Instruct the reviewer to:
1. **State what it is auditing** and against what bar (the mission + the locked constraints it must check fidelity against).
2. **Adversarially verify the self-audit DIGEST** — paste the compact self-audit digest and ask: which of its findings can you REFUTE? What NEW issue did it MISS?
3. **Spot-check the highest-risk claims by reading the actual files**, not the summary.
4. Return an **overall verdict** + **the single most important thing the next agent must not miss.**

Keep the digest within the reviewer's context — **truncate explicitly** if large (a DIGEST builder produces the compact self-audit summary; note where it was clipped).

---

## 6. The killer move: mutation / non-vacuity re-run

A self-review that reports "all gates green, all negatives RED" is **not** evidence the gates work — they may pass *decoratively*. The strongest thing an external reviewer does is **re-run the artifact's own gates/tests under deliberate mutations** to prove they actually FAIL on bad input (non-vacuous) rather than passing on anything (placebo). **Ask for this explicitly** in the review prompt for any gate-class artifact. (See `anti-placebo-and-convergence.md` for the full RED-on-mutation / falsification-harness doctrine; the external reviewer is its independent enforcer.)

Findings split into two classes with **different consequences** — the **PIERCE predicate**:

- **Genuine-placebo + real-correctness** findings — a claimed-passing gate proven decorative (passes after the violation predicate is removed or a flip), or a real correctness contradiction introduced. These **PIERCE a firm-stop**: a decorative gate cannot underwrite a "thoroughly complete" / terminal claim, so they justify **one more targeted fix** (provided it is buildable within `{{BUILD_CEILING}}`).
- **Diminishing-returns / coverage** findings — "you could also test X", broader-coverage suggestions. These go to an **owed-list**, *not* a fix loop. They do not pierce a firm-stop.

Domain-tune what counts as "placebo" and what is "within build ceiling" for your problem.

---

## 7. A FAIL verdict is the signal working — not a halt

A FAIL from an external reviewer is **not bad and does not stop the loop** — it is the system catching what a self-review missed. Three obligations on every external verdict:

1. **Persist it VERBATIM** to its cross-family sidecar `adr/_reviews/<id>-<family>.md` (e.g. `adr/_reviews/D003-codex.md`) **before** folding it. This is an **anti-poison** action — paraphrasing risks laundering a FAIL into a rosier PASS in your own memory. Record the reviewer's findings exactly as returned.
2. **Fold its enumerated defects into the next *targeted* fix** and re-verify.
3. **Correct any earlier over-rosy self-report** with the true independent verdict — overwriting a build agent's "PASS" with the independent "FAIL" is a *required* correction, not an optional one.

Halt only at the genuine endpoint (`STATUS: STOP`), never on a FAIL.

---

## 8. Bounded-retry CONVERGENCE RULE

External review feeds **at most `N` fix rounds** (default **N = 2**, knob `{{MAX_RETRY_ATTEMPTS}}` — the same convergence cap defined in `recovery-and-cadence.md` and restated inside `{{RUNAWAY_CAPS}}` as `bounded-retry ~2`):

> If the **2nd** targeted fix's re-verify **still** returns FAIL with new genuine defects, **STOP fixing and ESCALATE** the residual as a clearly-marked **promotion-gated item** (external-re-verify + human sign-off before promotion). Do **not** loop a 3rd build. The work finishes with that as an **escalation-gated residual** — never an infinite orchestrator loop.

A fix attempt that **diverged or never executed** (e.g. resumed with no pinned target and built the wrong thing; killed by overload before producing output) **counts as a failed attempt** against the bound. Pre-declare the rule before fix #2 so escalation is principled, not improvised. The residual routes to the appropriate `{{ESCALATION_GATES}}` (the generic human / expert-signoff / judge-panel / spike / apply-time / promotion-gate taxonomy). This is what lets the loop terminate honestly: relentless on the mechanically fixable, hard-bounded on the irreducible.

---

## 9. Resilience notes

- **529-immune by design** — the external-family calls survive *your* provider's overload. But the orchestrator's *own* dispatch of the workflow can still 529. **Resume the run** (`resumeFromRunId`-style: re-runs only the killed phases) rather than relaunching from scratch.
- **Pin the target on resume.** A resumed build/fix agent launched with **no target spec (`args=null`)** will self-select a *different* highest-leverage task and **diverge** — building an unrelated artifact instead of the intended fix. Always pin the exact target spec on resume.
- **Verify liveness via the OS process, not the task tracker.** External reviews can run for a long time (minutes to hours) and may become **invisible to the task tracker** (e.g. after a context compaction). Confirm the run is alive via the OS process (PID), not just the tracker, before assuming it died and re-dispatching.

---

## 10. Quick checklist

- [ ] Is this call high-stakes / one-way-door / a hard gate? If not → `crossFamily: false`, skip.
- [ ] Reviewer routed to a **different provider** than the orchestrator (not just another same-family agent)?
- [ ] Build step and verdict-reporting step are **different agents** (independence boundary)?
- [ ] Orchestrator reads the **`crossReview` schema field**, not the build report's prose?
- [ ] Other-primary coverage is present; optional bonus output is reconciled as advisory evidence?
- [ ] Mutation / non-vacuity re-run requested for gate-class artifacts?
- [ ] Verdict persisted **verbatim** to a dated review file before folding?
- [ ] PIERCE vs owed-list applied correctly to each finding?
- [ ] Fix rounds bounded to `N=2`, then **escalate** (don't loop a 3rd)?
- [ ] Target **pinned** on any resume?

---

### Worked reference instance (illustrative only — not load-bearing)

The patterns above were hardened on a regulated-fintech design lab, where `{{HARD_GATES}}` included money movement, ledger integrity, identity checks and tenant isolation, while `{{LOCKED_CONSTRAINTS}}` included data residency and regulatory compliance. Two episodes are textbook:

- A build agent fixing infrastructure policy gates **self-reported "codex VERDICT FAIL → PASS"**; the workflow's **independent** codex cross-review said **FAIL**. The independent tool-result was authoritative; the build report's claim was laundering. (Read the `crossReview` field, not the build report.)
- One iteration earlier, a self-review claimed dozens of property tests plus negative/mutation cases all RED (a point-in-time snapshot, not a running tally). The independent codex **re-ran the mutations** and proved several policy gates *vacuous* (they passed after the security predicate was removed or Allow/Deny flipped), plus a real residency bug (every region in a family treated as in-region). Those **genuine-placebo + real-correctness** findings PIERCED the firm-stop and earned one more targeted fix.

After the 2nd fix round failed to execute (provider 529 twice, then an `args=null` divergence that self-built an unrelated spike), the **CONVERGENCE RULE** fired: the orchestrator escalated gate-integrity as a promotion-gated residual rather than looping a 3rd build. At finish, **both families confirmed independently** (codex ran the test suite, gemini ran the policy check), and every external verdict was persisted verbatim to its `adr/_reviews/<id>-<family>.md` sidecar. None of the AU-fintech specifics are load-bearing — they only make the abstract knobs concrete.
