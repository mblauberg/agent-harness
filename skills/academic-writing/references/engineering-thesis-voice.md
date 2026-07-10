# Engineering Thesis Voice

Use this reference when the thesis needs to sound like a precise engineering research document rather than generic academic prose.

## Voice Target

The voice should be:

- precise without being brittle
- concise without dropping caveats
- technical without becoming a schema dump
- restrained without becoming vague
- human without becoming casual

The reader should be able to tell what was built, what was measured, what failed, what remains uncertain, and why the result matters.

## Concrete Verbs

Prefer verbs that name the actual operation:

- `trained`
- `evaluated`
- `measured`
- `compared`
- `sampled`
- `filtered`
- `validated`
- `rejected`
- `exported`
- `quantised`
- `aggregated`
- `aligned`
- `bounded`
- `failed`

Avoid verbs that add prestige without information:

- `showcases`
- `highlights`
- `underscores`
- `demonstrates` when no demonstration is described
- `facilitates`
- `enables` when the mechanism is unnamed
- `leverages`
- `drives`
- `enhances`

If `demonstrates` is justified, specify what the evidence demonstrates and under what conditions.

## Abstraction Level

Use the lowest abstraction level that still fits the point.

Too abstract:

```text
The architecture improves scalability and reliability by supporting enhanced memory processing.
```

Better:

```text
The architecture separates recent-window, episodic, pattern, and pinned-evidence retrieval, so each memory source can be ablated without changing the evaluator.
```

## Active And Passive Voice

Use active voice for mechanisms:

```text
The quality gate rejects outputs with invalid supporting-turn identifiers.
```

Use passive voice for procedures and results where the actor is irrelevant:

```text
Predictions were aggregated over decision turns.
```

Avoid passive chains:

```text
The report was generated after predictions were validated and metrics were calculated.
```

Better:

```text
After validation, the evaluator calculated metrics and generated the report.
```

## Technical Term Discipline

Use one term for one concept. Do not rotate between `detector`, `classifier`, `model`, `framework`, and `system` unless they refer to different things.

Before editing, identify:

- the system name
- the model name
- the data split
- the metric
- the artefact or manifest
- the evaluation scope
- the claim status

Keep those names stable.

## Defensible Claim Wording

Use exact verbs for claim strength:

| Evidence strength | Good wording |
| --- | --- |
| direct measurement | `measured`, `observed`, `recorded` |
| supported inference | `suggests`, `is consistent with`, `indicates` |
| protocol guarantee | `requires`, `rejects`, `enforces` |
| implementation fact | `implements`, `loads`, `exports`, `validates` |
| limitation | `does not measure`, `does not establish`, `remains untested` |
| future work | `is left for future work`, `requires separate evaluation` |

Avoid turning:

- `suggests` into `proves`
- `supports` into `confirms`
- `pilot` into `final evidence`
- `workflow readiness` into `model performance`
- `specified extension` into `completed result`

## Engineering Detail Without Clutter

A thesis should not list every file path or module unless traceability requires it. Keep implementation detail at the level that supports the argument.

Good:

```text
The runtime separates memory maintenance, retrieval, prompt assembly, risk scoring, and quality gating. This separation supports component ablations without changing data loading or metric aggregation.
```

Too much for main prose:

```text
The runtime calls detector/runtime/memory.py, detector/runtime/retrieval.py, detector/runtime/prompt.py, and detector/runtime/gate.py in sequence.
```

Move file-level detail to appendices, provenance notes, or implementation tables unless the chapter is explicitly about software architecture.

## Good Sentence Patterns

- `X is evaluated on Y because Z.`
- `X rejects Y before Z, which prevents W.`
- `The comparison isolates X by holding Y constant.`
- `This result is conditional on X and does not establish Y.`
- `The pilot artefact tests X, not Y.`

In each, the load-bearing element sits at the end, where emphasis is strongest. Put the metric, contrast, or conclusion last; move setup and conditions to the front.

## Bad Sentence Patterns

- `This section explores...`
- `The results highlight the importance of...`
- `The system leverages a robust framework to...`
- `This innovative approach provides a comprehensive solution...`
- `The findings demonstrate the potential of...`

Replace these with the actual claim, method, or limitation.
