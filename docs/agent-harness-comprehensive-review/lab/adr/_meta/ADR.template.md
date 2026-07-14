# <ID> — <decision title>
<!--
  The per-decision record (ADR): ONE decision per file, immutable once accepted,
  lives at `adr/<id>.md` (there is NO per-decision directory). This is the
  WORKHORSE tier — a Markdown ADR (MADR) that bakes in option comparison. Authored
  from a workflow/agent return value, NOT composed by the orchestrator
  (OPERATING_MANUAL §1). IMMUTABLE once status = decided: to change it, write a NEW
  record with `Supersedes <ID>` and mark this one `superseded by`.
  Keep IDs stable + sequential ({{ID_SCHEME}}, default D###; fork branches F###).

  TIERED — match the weight to the decision (OPERATING_MANUAL §6, Appendix A):
    - minor / reversible call  → collapse to the one-line Y-STATEMENT below; drop
      the score matrix.
    - normal call              → this full MADR (the default).
    - one-way-door / {{HARD_GATES}} → this full MADR + a passing judge panel AND a
      {{CROSS_FAMILY_VERIFIER}} cross-family pass recorded in "Adversarial review"
      (and a sidecar `adr/_reviews/<id>-<family>.md`) BEFORE status may be
      `decided`. Until both land, status is `decided-provisional`.

  Y-STATEMENT (one-liner tier — use INSTEAD of the body for trivial reversible calls):
    In the context of <use case>, facing <concern>, we chose <option> to achieve
    <quality>, accepting <downside>.
-->

- **Status:** proposed | exploring | forked | decided-provisional | decided | superseded
- **Layer:** <which slice of `{{WORK_LAYERS}}` this sits in>
- **Reversibility:** one-way-door | costly-to-reverse | reversible
- **Constraint-Impact:** <which `{{LOCKED_CONSTRAINTS}}` / `{{HARD_GATES}}` this
  touches — "none" or name them. {{HARD_GATES}} items gate on a panel + cross-family.>
- **Depends on:** <IDs>   **Blocks:** <IDs>
- **Fork:** <Fxxx, if this spawned a fork>
- **Supersedes / Superseded by:** <ID, if applicable>
- **Decided:** <date — supplied by the human/launch, NOT an auto clock>

## Question
<the precise decision to be made — one decision per record>

## Context & constraints
<why this matters now; the `{{LOCKED_CONSTRAINTS}}` it must satisfy; the blast
radius / reversibility that sets the rigour level>

## Options considered
### Option A — <name>
<description · pros · cons · evidence link (`adr/_meta/…` or a spike)>
### Option B — <name>
…
<!-- Genuinely distinct candidates, NOT strawmen (OPERATING_MANUAL §3). -->

## Evaluation (scored on the `{{RUBRIC}}`)
<!-- Weights sum to 1; recompute the weighted total DETERMINISTICALLY in the judge
     workflow, not by eyeball. Swap the Risk + Mission-centricity rows per domain. -->
| Criterion (weight) | A | B | C |
|---|---|---|---|
| Correctness / fit | | | |
| Risk | | | |
| Reversibility | | | |
| Cost | | | |
| Operability | | | |
| Build leverage | | | |
| Mission-centricity | | | |
| Evidence quality | | | |
| **Weighted total** | | | |

## Adversarial review
<who tried to REFUTE the leading option, from which lenses (the `{{WORK_LAYERS}}`
critic lenses), and what survived. For a `{{HARD_GATES}}` item, the independent
`{{CROSS_FAMILY_VERIFIER}}` verdict is AUTHORITATIVE and recorded here + the
sidecar `adr/_reviews/<id>-<family>.md` — a build agent's self-report of its own
pass does NOT count (OPERATING_MANUAL §12).>

## Decision
<what was chosen and the one-paragraph why>

## Rejected alternatives (and why — KEEP this, it's valuable)
<the trace of "why not" — this is audit + future-self evidence>

## Consequences
<what this commits us to; new risks; what becomes easier/harder; any
`{{DOMAIN_INVARIANTS}}` it newly relies on>

## Spawned decisions / follow-ups
- <ID> — …

## Evidence
- `adr/_meta/…` · spike: scaffolds/… · cross-review: `adr/_reviews/<id>-<family>.md` · sources: <urls>

<!--
  ── Worked reference instance (NON-LOAD-BEARING) ──
  In the reference fintech run, Constraint-Impact named regulatory regimes,
  Privacy-Act / data-residency, and {{HARD_GATES}} records (money-movement,
  ledger-posting, tenant-isolation) carried a sidecar `adr/_reviews/<id>-codex.md`
  (and on the finish gate, `-gemini.md`) before flipping to `decided`. Those are
  domain specifics — yours will be different. The FORMAT is the durable part.
-->
