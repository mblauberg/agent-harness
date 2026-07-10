# Chapter And Section Patterns

Use this reference when drafting or editing a specific thesis section.

## Abstract

The abstract should state:

1. Problem and context.
2. Gap or limitation in current approaches.
3. Method or contribution.
4. Evaluation basis.
5. Main result or expected result boundary.
6. Limitation or deployment implication if important.

Avoid broad claims, citation clutter, and implementation detail. Do not include unsupported numeric results.

Target roughly 200 to 300 words as a single unstructured paragraph; engineering theses do not use headed (structured) abstracts. Quote a headline result only once it is claimable (a populated `\result`, not a placeholder). Follow your institution's template where it differs.

Good pattern:

```text
This thesis investigates [problem] by [method]. The evaluation compares [system] against [comparators] on [dataset/scope] using [metrics]. Results show [claim], subject to [boundary].
```

## Introduction

The introduction should lead from problem to thesis contribution:

- What problem matters?
- Why existing approaches are insufficient?
- What research questions are asked?
- What is the thesis contribution?
- How is the thesis structured?

Avoid opening with generic societal commentary. Start as close as possible to the real research problem.

These moves map to Swales' CARS pattern: establish the territory, establish the gap, then occupy the gap. State the contributions as an explicit, enumerated list, and give a roadmap of one or two sentences per chapter.

## Literature Review

The literature review should synthesise, not catalogue.

Prefer paragraphs organised by:

- problem framing
- methodological family
- dataset/evaluation limitation
- architectural choice
- deployment constraint
- research gap

Weak pattern:

```text
Smith et al. did X. Jones et al. did Y. Lee et al. did Z.
```

Better pattern:

```text
Prior scam-detection studies commonly frame the task as supervised text classification. This framing supports benchmark comparison, but it weakens temporal evaluation because many systems classify complete conversations rather than early-risk prefixes \cite{...}.
```

Each paragraph should make a synthesis claim and use sources as support.

## Theory

Theory sections should define constructs and connect them to later methods.

Rules:

- Define notation before use.
- Use symbols consistently.
- Keep equations close to prose explaining their role.
- State assumptions explicitly.
- Avoid turning design choices into mathematical necessity.

Good pattern:

```text
The score in Equation~\ref{...} is not a classifier output. It ranks candidate evidence for prompt assembly, so its role is retrieval selection rather than final risk estimation.
```

## Methodology

Methodology should be reproducible and bounded.

Include:

- dataset construction or selection
- inclusion/exclusion rules
- system components
- evaluation scope
- comparators
- metrics
- statistical procedure
- quality gates
- deviation handling
- compute and environment with the key hyperparameters; the random seed and run count, and the procedure used for statistical significance; and a pointer to a data and code availability statement.

Do not bury protocol boundaries in long prose. If a result is not claimable without an artefact, state the gate directly.

Reproducibility: map the protocol to a recognised checklist (the NeurIPS paper checklist, or REFORMS for ML-based science) and point a data and code availability statement at a DOI-issuing archive (Zenodo or OSF) with a tagged release and commit hash. Large artefacts link out rather than swell the appendix.

## Results

Results should report before interpreting.

Order:

1. Scope and data included.
2. Primary metric result.
3. Comparator or confidence interval.
4. Secondary metrics.
5. Caveat or gate condition.
6. Minimal interpretation.

Avoid:

- explaining method again at length
- claiming causality from descriptive results
- interpreting pilot artefacts as final evidence
- hiding missing values

Good pattern:

```text
Table~\ref{...} reports decision-turn AUPRC for the reviewed split. The full hierarchical system records \result{...}, compared with \result{...} for the sliding-window baseline. This comparison is conditional on the paired-seed evidence bundle.
```

Default to separate Results and Discussion for quantitative work: report in one, interpret in the other. Combining them per research question (present, then discuss, then state the takeaway under one subsection) is acceptable under a tight page limit or a very long results section, common in empirical software-engineering writing. Choose one mode and hold it.

## Discussion

Discussion should explain what the results mean and what they do not mean.

Useful paragraph pattern:

1. Interpretation tied to a research question.
2. Explanation or mechanism.
3. Comparison with prior work.
4. Limitation.
5. Implication.

Keep limitations concrete:

- dataset composition
- synthetic versus real-world data
- model/provider boundary
- device boundary
- annotation uncertainty
- metric scope
- untested deployment scenario

## Conclusion

The conclusion should be direct:

- Restate the problem.
- State what was built or evaluated.
- State the strongest supported contribution.
- State the main limitation.
- State the most important next work.

Avoid a ceremonial ending. Do not end with `future research is important`.

Pair each contribution with its matching limitation rather than listing all the wins and then all the caveats, and let future work follow from the limitations.

## Captions

Captions should let the figure or table stand alone.

Include:

- what is shown
- dataset or scope if relevant
- metric or unit if relevant
- claim status if values are conditional
- relevant caveat if the display could be overread

Avoid repeating the full paragraph that follows the display.

## Appendices

Appendices may carry implementation detail, manifests, extended tables, validation outputs, and provenance. Keep prose functional. Explain why the appendix exists and how it supports the main text.

For large datasets, code, or model weights, link out to a DOI-issuing archive rather than swelling the appendix.

## AI-Assisted-Writing Disclosure

A 2026 engineering thesis is expected to disclose substantive AI assistance. Routine grammar and spell checking needs no acknowledgement; drafting, restructuring, idea generation, or summarising should be disclosed. Place one brief, specific statement in the preface, acknowledgements, or methods, naming the tool, its version, and what it touched. Acknowledge and disclose; do not cite AI as a source unless the AI output is itself the object of study. The author remains fully accountable for every claim. In Australia, TEQSA expects a declaration and an institution sets the form, so follow your course or higher-degree-research profile rather than a single fixed template.
