# Concision And Structure

Use this reference for tightening dense thesis prose without losing technical precision.

## Principle

Concision does not mean short at any cost. It means every word earns its place. Do not remove caveats, units, uncertainty, scope boundaries, or references merely to shorten a sentence.

## Condense Pass

Use this when prose is AI-authored or over-long and the job is to cut its length while keeping the meaning; rewrite mode improves a passage in place, condense mode makes it shorter. Aim to cut 20 to 50 per cent on a first-draft chapter. Cut first; add only where a real fact is missing.

Procedure:

1. Measure. Count the prose words (ignore macros, labels, and math); the checker prints this with `--wordcount`. Record the baseline so you can report the cut.
2. Reverse-outline. Write one phrase per paragraph stating its single point (the Paragraph Test below is the per-paragraph form). A paragraph that resists a one-line summary, or repeats another line, is the cut or merge target.
3. De-duplicate to one home. State each fact, caveat, definition, decision-rule, and number once, in its primary chapter. Replace every other copy with a short cross-reference or an interpretive summary. Relocate detail to an appendix or a table rather than delete it: moved is not lost.
4. Fold and collapse. Turn padded enumerations into prose. Merge table columns that mostly restate each other. Drop a list item that paraphrases its sibling. Merge two sentences that state one mechanism, keeping the sharper qualifier.
5. Cut fluff. Remove throat-clearing, decorative tails, absence tombstones, and long hypothetical `would` passages that re-explain a point already made. Throat-clearing to cut on sight: `This chapter discusses`, `This section provides an overview`, `It is worth noting`, `As previously mentioned`, `In conclusion`, `Overall`, `The following section will`. Replace vague signposting with a specific pointer (`The next section defines the decision-turn scope used in all primary metrics`), not a decorative one.
6. Narrow, do not soften. Replace a sweeping claim with the precise claim the evidence supports; it is shorter and safer. Delete an unbacked presumption outright. Never soften an honest negative.

STOP RULE: stop the moment a further cut would remove a fact, number, unit, caveat, scope condition, honest negative, or defined term, break a cross-reference, or force awkward phrasing. When unsure whether something is load-bearing, keep it, and prefer compressing to deleting whenever a fact is involved. If the prose is already tight, say so and stop. Forced cuts that sound weird are a failure, not a win.

Verify and report. Confirm every result token, every `\label` that is referenced, every citation key, every number, every defined term, and every honest negative still survives (grep each relocated item in its new home). Then report the delta: words before and after, the percentage, and that the load-bearing content is intact.

## Paragraph Test

For each paragraph, ask:

1. What is the main claim?
2. What evidence, method, or reasoning supports it?
3. What limitation or consequence matters?
4. Which sentence does not serve those functions?
5. Can the paragraph start closer to the claim?

If a paragraph has two unrelated claims, split it. If it repeats the same claim with different words, cut the weaker sentence.

## Sentence Repair

The principle is Strunk's Rule 13 (1918 edition), omit needless words: a sentence should contain no unnecessary words, as a drawing has no unnecessary lines. Every word should tell.

Common repairs:

| Pattern | Repair |
| --- | --- |
| `It is important to note that X` | `X` |
| `In order to X` | `To X` |
| `The fact that X` | `X` or a noun phrase |
| `There are several factors that` | name the factors |
| `An evaluation of X was conducted` | `X was evaluated` |
| `The implementation of X was performed` | `X was implemented` |
| `This provides support for` | `This supports` |
| `A key challenge that arises is` | `A key challenge is` |
| `the question as to whether` | `whether` |
| `there is no doubt but that` | `no doubt` |
| `X, which is the system that resolves Y` | `X resolves Y` (drop superfluous `who is` / `which was`) |

The wordier fillers (`in order to`, `is able to`, `has the ability to`, `used for the purpose of`) are cut in step 5 of the Condense Pass above.

## Keep Related Words Together

Dense thesis prose often separates subject and verb with too many qualifiers.

Weak:

```text
The hierarchical detector, after filtering context-only turns and applying the strict evidence gate, and after excluding pilot artefacts, reports AUPRC over decision turns.
```

Better:

```text
The hierarchical detector reports AUPRC over decision turns. Before aggregation, the evaluator filters context-only turns, applies the strict evidence gate, and excludes pilot artefacts.
```

## Positive Form

This is Strunk's Rule 11 (1918 edition), put statements in positive form. `Not` is weak as mere evasion (`not honest` for `dishonest`), but other negatives are strong: `No federated result table is presented` is direct and correct where the absence is the claim. Positive form is a style rule, not a licence to spin; see Positive Form Is Not Positive Spin in anti-ai-thesis-patterns.md for the integrity guard.

Prefer direct positive statements where they are precise.

| Weak negative | Stronger |
| --- | --- |
| `does not include unsupported artefacts` | `excludes unsupported artefacts` |
| `is not treated as final evidence` | `is treated as workflow evidence only` |
| `does not allow fallback` | `rejects fallback` |

Do not force positive form when the absence is the claim:

```text
No federated result table is presented because the extension lacks a claimable artefact.
```

## Parallel Structure

Use parallel structure for lists of comparable concepts:

Weak:

```text
The evaluator checks JSON validity, whether evidence IDs resolve, and rejecting fallback.
```

Better:

```text
The evaluator checks JSON validity, evidence-ID resolution, and fallback status.
```

## Dense Technical Sentences

Split a sentence when it contains:

- a method
- a result
- a caveat
- a future-work boundary
- two or more cross-references

When a dense sentence is dense because premodifiers are stacked on an abstract head noun, the fix is in Noun-Stacking And Nominal Compression in anti-ai-thesis-patterns.md: lighten the stack, keep the defined term.

Before:

```text
The reviewed implementation evaluates the full hierarchical detector and all comparator systems on the 500-conversation benchmark with five paired seeds and paired bootstrap intervals, while current pilot artefacts are retained only as workflow-refinement evidence and do not constitute final inferential evidence.
```

After:

```text
The reviewed implementation evaluates the full hierarchical detector and comparator systems on the 500-conversation benchmark. Claimable comparisons use five paired seeds and paired bootstrap intervals. Pilot artefacts remain workflow-refinement evidence and do not constitute final inferential evidence.
```

## Transition Discipline

Use transitions to express logic, not decoration.

Good transitions:

- `However` for real contrast.
- `Therefore` for a conclusion that follows.
- `For this reason` when the reason was just stated.
- `In contrast` when two things are directly compared.
- `Consequently` when a prior condition causes an outcome.

Avoid transitions that merely announce structure:

- `Having established this`
- `With this in mind`
- `This sets the stage`
- `Moving forward`

## Emphatic Position

Place the most important word or idea at the end of the sentence. That position carries the strongest emphasis, and the start carries the next strongest (Strunk, Rule 18 (1918 edition)). In results and discussion prose, end on the metric, the contrast, or the conclusion, not on procedure.

Weak (emphasis lost mid-sentence):

```text
The hierarchical detector, across five paired seeds, records a higher mean AUPRC than the baselines, which is what the comparison set out to test.
```

Stronger (the result lands last):

```text
Across five paired seeds, the hierarchical detector attains the highest mean decision-turn AUPRC.
```

## Endings

End paragraphs on the consequence, caveat, or next analytic step. Avoid generic final sentences.

Weak:

```text
This is important for future research in this area.
```

Better:

```text
The result therefore supports the decision-turn scope, but it does not establish performance on context-only turns.
```

The Condense Pass STOP RULE and its verify-and-report step are the concision checklist; do not maintain a second one.
