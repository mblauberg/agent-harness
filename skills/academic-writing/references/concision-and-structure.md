# Concision And Structure (academic overlay)

Load the `natural-writing` skill first for the hub condense procedure, the
stop rule, the paragraph test, condense
integrity, sentence repair, positive form, and emphatic position. This file
adds only the LaTeX-specific details the hub does not cover.

## Measuring In LaTeX

The checker's `--wordcount` mode ignores macros, labels, and math when
counting prose words, so the reported count matches what an examiner reads,
not the source markup. Report the same measure (words before/after,
percentage cut) that the hub procedure asks for.

## Locked Invariants Specific To This Domain

In addition to the hub's general invariant list (facts, numbers, units,
citations, defined terms), lock every `\label` that is referenced, every
citation key, every result macro, and every cross-reference target before
condensing. Verify each survives in its new home by grep, not by re-reading
for a feeling of completeness.

## Dense Technical Sentences

Split a sentence when it contains a method, a result, a caveat, a
future-work boundary, or two or more cross-references:

Before:

```text
The study evaluates the primary and comparator methods on two datasets with five paired runs and confidence intervals, while pilot observations are retained only as protocol-refinement evidence and do not support the final inference.
```

After:

```text
The study evaluates the primary and comparator methods on two datasets. Comparisons use five paired runs and confidence intervals. Pilot observations support protocol refinement only, not the final inference.
```

When a dense sentence is dense because premodifiers are stacked on an
abstract head noun, the fix is in Noun-Stacking in
`anti-ai-thesis-patterns.md` and the hub taxonomy: lighten the stack, keep
the defined term.
