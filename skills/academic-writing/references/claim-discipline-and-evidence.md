# Claim Discipline And Evidence (academic overlay)

Load the hub schema first:
`${AGENTS_HOME:-$HOME/.agents}/skills/natural-writing/references/claim-discipline.md`,
for the claim classes, the safer-wording table, the implicit-completion
tense trap, and the rule that a comparative claim must carry its number.
This file adds only the empirical-research specifics the hub does not cover: LaTeX result
references, small-sample statistics, and reproducibility terminology.

## Results Claims (LaTeX)

Do not interpret a table before stating what it reports.

Good:

```text
\Cref{tab:primary-results} reports mean absolute error on the held-out dataset. The comparison remains provisional until the planned paired analysis is complete.
```

Weak:

```text
\Cref{tab:rq1-accuracy} demonstrates the superiority of the proposed framework.
```

Avoid `superior` unless the metric, comparator, confidence interval, and
evaluation scope support it.

## Small-Sample Evidence

Follow the project's approved statistical analysis plan; do not introduce a
bootstrap, permutation test, or significance threshold while polishing
prose. With few independent observations, state the uncertainty and avoid a
strong comparative claim unless the declared method supports it. Name the
interval or test actually used rather than writing only `95 per cent
interval` or `significant`.

On the word significant: do not report a bare statistically significant as
a pass or fail verdict. Pair any significance wording with the effect size
and its interval, and read the p-value as a measure of compatibility, not a
gate. Statistical significance is not practical significance.

## Reproducibility Statements

Distinguish Artifacts Available (deposited and citable) from Results
Reproduced (others rerun the work using the author's artefacts) and Results
Replicated (others obtain the results without those artefacts). Claim only
that artefacts are available unless independent reproduction has actually
happened: reproducible does not mean reproduced.

## Claim Audit Checklist

Use the hub's Claim audit checklist, then confirm: are result-macro and
`\Cref` targets resolved and correct; is small-sample uncertainty stated
rather than implied; and is a reproducibility claim scoped to what actually
happened (available vs reproduced vs replicated)?
