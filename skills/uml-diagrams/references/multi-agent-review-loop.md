# Multi-Agent Review Loop

Use this for the final polish on a high-stakes deliverable. A single reviewer misses defects. Multiple parallel reviewers with different strengths catch most of them. Iterate until every reviewer returns READY-TO-SUBMIT.

This process reliably takes a diagram set from good-enough to defect-free. It typically converges in 4–7 rounds.

## Reviewers and their strengths

| Reviewer | Strengths | What to ask |
|---|---|---|
| **Codex (gpt-5-codex, --effort xhigh)** | UML correctness, cross-reference integrity, traceability between the actor table / detailed descriptions / diagrams, NFR measurability. Catches subtle defects (transitive include claims, plain assoc between use cases, wrong cross-package number). | A punch list grouped by quality area with file:line + fix per defect. Verdict line. |
| **Sonnet** | Per-diagram visual quality. Spotting overlapping shapes, arrows that don't reach node ports, clipped text, misplaced labels. | One verdict line per PNG: `NN_<name>.png: Excellent | Good | Needs-Work: <defect or "clean">.` |
| **Haiku** | Mechanical coherence: actor counts, NFR counts, risk fields, release-plan arithmetic, glossary completeness, spelling consistency. | Pass/Fail per check with line numbers. Verdict. |
| **Gemini (gemini-headless)** | Independent second-opinion read of dense PDFs/specs. Useful when codex and sonnet agree but you want a third voice. | Free-form audit against the quality bar. |

Dispatch the three in PARALLEL (single tool call message with multiple Agent invocations) to save wall-clock time and to keep their views independent.

## Round loop

```
while any reviewer returns NEEDS-FIXES:
  1. Read every flagged defect.
  2. Classify each as (a) real defect to fix, (b) false positive (verify against source/render), (c) stylistic preference (skip if not a release blocker).
  3. Apply fixes. For each fix, name the source file:line.
  4. Re-render diagrams; rebuild docx; lint; re-render PDF.
  5. Dispatch next round with a "round N" prompt that lists exactly which round (N-1) defects were addressed and what was changed. This anchors reviewers to verify those edits, not re-flag them.
  6. Mark false positives explicitly in the next-round prompt so reviewers don't repeat them.
```

## Prompt patterns

### First-round prompt template

```
Round 1 review of <project> v<version> for <quality target>.

Inputs (read them all):
- Spec source: <path>
- PDF: <path>
- Diagrams: <path>
- Quality bar / checklist: <path>

Your job: rate every quality area Excellent / Good / Needs-Work. For each defect, give file:line, problem, fix. Be brutal — we are targeting the highest quality.

Format the response as a punch list grouped by area. End with a verdict line: READY-TO-SUBMIT / NEEDS-FIXES. Under <N> words.
```

### Subsequent-round template

```
Round N review.

Round (N-1) defects you flagged are addressed:
- <Defect 1 description and fix>
- <Defect 2 description and fix>
- ...

Verify each fix landed. Then re-scan for remaining defects. Same format as before.

Round (N-1) false positives to NOT repeat:
- <False positive 1 and why it isn't a defect>
- <False positive 2 and why it isn't a defect>

Reminder: <any specific UML rule the reviewer keeps misreading, e.g. "single-edge nodes don't need a merge", or "d.ext() draws arrowhead at the last polyline point">.

Verdict line at end. Under <N> words.
```

## When to stop

Stop when ALL of:

- Codex returns READY-TO-SUBMIT with no Band-7 blocker.
- Sonnet returns each diagram Excellent or Good with no defect that would cost a mark.
- Haiku returns every coherence check Pass.

Do not stop on:

- One round of READY-TO-SUBMIT after a wave of fixes — run one more confirmation round.
- Disagreement between reviewers — fix the defect or formally accept the design with rationale documented in the prompt.

## Anti-patterns

- **Spawning all three reviewers serially.** Always parallel. Tool call cost is the same; wall-clock is 3× faster.
- **Asking reviewers to fix.** They review; the main thread fixes. Reviewers don't have full context.
- **Re-running the same prompt every round.** Always update the prompt with what was fixed and what's a confirmed false positive.
- **Skipping the build/lint/render between rounds.** Reviewers may be looking at stale artefacts. Always rebuild before dispatching.
- **Accepting "Good" as the target.** "Good" still leaves defects against the highest quality bar. Push to "Excellent" or document the trade-off.

## Cost discipline

Each round costs 3 model calls plus a build cycle. Cap at 7 rounds in practice; if reviewers still flag defects at round 7, escalate to a human reviewer rather than burn more tokens.
