---
name: evaluate
description: Use when an AI, agent, prompt, retrieval system, heuristic, ranking, generated artifact, or other stochastic/judgement-bearing behaviour needs a repeatable quality or safety gate — datasets, rubrics, benchmarks, red-team cases, regression thresholds, or model comparisons. Not for deterministic unit tests or ordinary code review.
---

# Evaluate

Turn judgement into a versioned, repeatable assurance result. Deterministic
tests still run; this skill covers behaviour whose quality cannot be proven by
an exit code alone.

## Contract

Before implementation or comparison, record:

- decision the evaluation informs and unacceptable failure modes;
- dataset/corpus version, provenance, consent/data policy and holdout boundary;
- sampling method, seeds and model/runtime versions;
- metrics and thresholds chosen before results are seen;
- human rubric, evaluator independence and disagreement handling;
- safety, bias, privacy and adversarial cases proportionate to risk;
- baseline and regression budget.

Use [EVALUATION.template.json](templates/EVALUATION.template.json). Keep raw
examples outside the hot receipt; link bounded failure cases and hashes.

## Run

1. Validate fixtures and prevent train/test or prompt/holdout leakage.
2. Run the pinned configuration more than once where variance matters.
3. Report distributions and failure clusters, not only averages. Never hide
   empty, skipped, timed-out or manually excluded cases.
4. Have a fresh-context evaluator inspect a blinded sample for high-risk
   judgement. Cross-family review can expose rubric blind spots but does not
   replace evidence.
5. Compare against predeclared thresholds and baseline. A post-hoc threshold
   change is a new evaluation version with a reason and owner.
6. Preserve representative failures and route product defects to `change`,
   unclear requirements to `scope`, and operational regressions to `diagnose`.

Validate the receipt with:

```sh
${AGENTS_HOME:-$HOME/.agents}/skills/evaluate/scripts/validate_evaluation.py EVALUATION.json
```

`pass` means the named version met its declared thresholds. It does not prove
general safety outside the evaluated distribution. Human approval remains
required where the evaluation informs a one-way-door, legal, safety, release or
public claim.
