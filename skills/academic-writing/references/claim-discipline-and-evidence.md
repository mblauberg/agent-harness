# Claim Discipline And Evidence

Use this reference when a thesis paragraph contains results, contribution claims, evaluation wording, limitations, or future-work boundaries.

## Claim Classes

Before editing, classify each claim:

- `observed`: directly measured, implemented, generated, or validated.
- `inferred`: supported by evidence but not directly measured.
- `protocol`: required by the methodology, gate, or contract.
- `limitation`: states what was not measured, not included, or not established.
- `future work`: specified but not completed.
- `background`: supported by literature.
- `pending`: placeholder, result macro, unverified artefact, or incomplete evidence.

Do not mix classes in one sentence if it creates ambiguity.

## Wording By Evidence Class

| Class | Safer wording |
| --- | --- |
| observed | `measured`, `recorded`, `observed`, `reported`, `validated` |
| inferred | `suggests`, `indicates`, `is consistent with`, `supports` |
| protocol | `requires`, `checks`, `rejects`, `enforces`, `conditions` |
| limitation | `does not establish`, `was not measured`, `remains untested` |
| future work | `is left for future work`, `requires separate evaluation` |
| pending | `is pending`, `is conditional on`, `cannot yet be claimed` |

## Contribution Claims

A contribution claim must name the contribution and its evidence.

Weak:

```text
This thesis makes a novel and impactful contribution to forecasting.
```

Better:

```text
This thesis contributes a calibrated forecasting method and evaluates it against two declared comparators on the held-out datasets.
```

Use `novel` only when the text has established novelty against prior work. Otherwise use `contributes`, `implements`, `evaluates`, or `extends`.

## Results Claims

Do not interpret a table before stating what the table reports.

Good:

```text
\Cref{tab:primary-results} reports mean absolute error on the held-out dataset. The comparison remains provisional until the planned paired analysis is complete.
```

Weak:

```text
\Cref{tab:rq1-accuracy} demonstrates the superiority of the proposed framework.
```

Avoid `superior` unless the metric, comparator, confidence interval, and evaluation scope support it.

## Implicit Completion And Magnitude

Neutral present tense can silently assert that a pending experiment is finished. `The method is evaluated on the held-out dataset` reads as completed evidence. Where results are not yet verified, scope the claim to the protocol (`the evaluation protocol compares error on the held-out dataset`) or state the status, and match tense to evidence.

Every comparative results claim must carry its quantity or an explicit table pointer. Ban bare `higher`, `better`, `improved` on their own.

Weak:

```text
Method A records a lower mean error than both comparators.
```

Stronger:

```text
Method A attains the lowest mean error (0.NN), compared with Method B (0.NN) and Method C (0.NN); the declared 95 per cent intervals for both paired differences exclude zero (\Cref{tab:primary-results}).
```

Disclose the interval level when an `excludes zero` or `significant` claim is made. Avoid limp reporting verbs (`records`, `exhibits`) and the stock `This result [verb]s...` opener. Do not let project-internal workflow or artefact names leak into thesis prose.

Small-sample evidence. Follow the project's approved statistical analysis plan;
do not introduce a bootstrap, permutation test or significance threshold while
polishing prose. With few independent observations, state the uncertainty and
avoid a strong comparative claim unless the declared method supports it. Name
the interval or test actually used rather than writing only `95 per cent
interval` or `significant`.

On the word significant: do not report a bare statistically significant as a pass or fail verdict. Pair any significance wording with the effect size and its interval, and read the p-value as a measure of compatibility, not a gate. Statistical significance is not practical significance.

## Pending And Pilot Evidence

Keep pending evidence visibly pending. Do not smooth it into final prose.

If the draft says:

```text
Method A outperforms the comparator.
```

but the result is pending, rewrite:

```text
The planned comparison tests whether Method A outperforms the comparator. The claim remains conditional on completion of the declared analysis.
```

Pilot artefacts can support workflow readiness, smoke testing, interface checks, and protocol refinement. They do not support final inferential performance unless the thesis explicitly defines them as final evidence.

Reproducibility statements. Distinguish Artifacts Available (deposited and citable) from Results Reproduced (others rerun the work using the author's artefacts) and Results Replicated (others obtain the results without those artefacts). Claim only that artefacts are available unless independent reproduction has actually happened: reproducible does not mean reproduced.

## Limitations

A good limitation is specific and tied to the claim it bounds.

Weak:

```text
The study has some limitations that should be considered.
```

Better:

```text
The evaluation does not establish field performance because all primary outcomes are measured in a controlled laboratory setting.
```

Calibration runs both ways: do not over-hedge. State a real implication plainly, reserve hedges for genuine uncertainty, and avoid stacked qualifiers (might possibly suggest). An honest negative stays negative; do not bury it under hedging either.

## Future Work

Future work should be bounded and concrete.

Weak:

```text
Future work should explore more advanced and scalable approaches.
```

Better:

```text
Future work should evaluate the method at an independent site using the same preregistered outcomes and a declared comparator.
```

## Claim Audit Checklist

- Is the claim observed, inferred, protocol-bound, limited, future, background, or pending?
- Does the verb match the evidence class?
- Does the sentence name the evaluation scope?
- Does the limitation bound the right claim?
- Does the contribution claim avoid unsupported novelty?
- Are pending or pilot artefacts kept out of final result claims?
