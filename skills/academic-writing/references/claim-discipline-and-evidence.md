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
This thesis makes a novel and impactful contribution to scam detection.
```

Better:

```text
This thesis contributes a reviewed evaluation pipeline for hierarchical-memory scam detection and tests it against sliding-window and flat-retrieval comparators.
```

Use `novel` only when the text has established novelty against prior work. Otherwise use `contributes`, `implements`, `evaluates`, or `extends`.

## Results Claims

Do not interpret a table before stating what the table reports.

Good:

```text
\Cref{tab:rq1-accuracy} reports decision-turn AUPRC on the reviewed split. The comparison is conditional on the paired-seed evidence bundle.
```

Weak:

```text
\Cref{tab:rq1-accuracy} demonstrates the superiority of the proposed framework.
```

Avoid `superior` unless the metric, comparator, confidence interval, and evaluation scope support it.

## Implicit Completion And Magnitude

Neutral present tense can silently assert that a pending experiment is finished. `The detector is evaluated on a reviewed corpus` reads as completed evidence. Where results are not yet sealed, scope the claim to the protocol (`the evaluation protocol scores risk at decision turns`) or state the status, and match tense to evidence.

Every comparative results claim must carry its quantity or an explicit table pointer. Ban bare `higher`, `better`, `improved` on their own.

Weak:

```text
The hierarchical detector records a higher mean AUPRC than both baselines.
```

Stronger:

```text
The hierarchical detector attains the highest mean decision-turn AUPRC (0.NN), ahead of sliding-window (0.NN) and flat-retrieval (0.NN); the 95 per cent paired bootstrap intervals for these differences exclude zero (\Cref{tab:rq1-auprc}).
```

Disclose the interval level when an `excludes zero` or `significant` claim is made. Avoid limp reporting verbs (`records`, `exhibits`) and the stock `This result [verb]s...` opener. Do not let project-internal artefact nouns (`evidence bundle`, `paired-seed bundle`) leak into thesis prose.

Small-sample evidence. With only a few paired seeds, declare a difference significant, or its interval as excluding zero, only when a BCa bootstrap confidence interval on the per-seed deltas excludes zero and a sign-flip permutation test agrees. With about three seeds, the honest outcome for a small gain is usually no strong conclusion yet, so prefer to under-claim. Name the interval type (a BCa 95 per cent paired bootstrap), not just a 95 per cent interval.

On the word significant: do not report a bare statistically significant as a pass or fail verdict. Pair any significance wording with the effect size and its interval, and read the p-value as a measure of compatibility, not a gate. Statistical significance is not practical significance.

## Pending And Pilot Evidence

Keep pending evidence visibly pending. Do not smooth it into final prose.

If the draft says:

```text
The detector outperforms the baseline.
```

but the result is pending, rewrite:

```text
The planned comparison tests whether the detector outperforms the baseline. The claim remains conditional on the completed evidence bundle.
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
The evaluation does not establish performance on live user traffic because all primary metrics are computed on the reviewed synthetic benchmark.
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
Future work should evaluate the federated-training extension with a separate gate-passing evidence bundle and paired centralised baseline.
```

## Claim Audit Checklist

- Is the claim observed, inferred, protocol-bound, limited, future, background, or pending?
- Does the verb match the evidence class?
- Does the sentence name the evaluation scope?
- Does the limitation bound the right claim?
- Does the contribution claim avoid unsupported novelty?
- Are pending or pilot artefacts kept out of final result claims?
