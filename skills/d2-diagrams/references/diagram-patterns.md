# Diagram Patterns

## What Good Looks Like

A useful project diagram should:

- explain a method, component boundary, or data flow
- align with the actual code, scripts, artefacts, or claims it depicts
- be readable without a live demo
- avoid jargon-heavy labels when a simpler term will do

## Recommended File Naming

- Main figure sequence: `diagrams/07_memory_architecture.d2`
- Supporting or exploratory figure: `diagrams/scratch_ablation_map.d2`
- Shared imported fragment: `diagrams/shared/<name>.d2`

If you add new numbered figures, preserve the existing numeric ordering convention already used in the diagrams directory.

## Recommended Diagram Shapes By Use Case

Pipeline or workflow:
- build or generation flow
- annotation/review flow
- training/evaluation orchestration

Architecture/container view:
- runtime components
- frontend/backend split
- distributed participants and aggregation

Class or contract view:
- component internals
- key runtime abstractions
- structured artefact contracts

SQL-table view:
- dataset or manifest summaries
- processed record fields worth discussing in prose or an appendix

## Labelling Guidance

- Prefer `Reviewed Dataset` over `Reviewed Dataset Builder Final Output Stage`.
- **For figures in a written document, never put filenames, CLI commands, type/class names, or
  schema versions in a node** — they read as codebase jargon to a reader. Put the artefact
  name in the caption instead, and label the node with the concept (`Pattern library`, not
  `pattern_index.jsonl`; `Released dataset`, not `reviewed.jsonl`). See
  [publication-figures.md](publication-figures.md) for the full rule and a translation table.
- Use filenames/script/command names only in working or appendix-internal diagrams where exact
  reproducibility is the figure's explicit purpose — and even then prefer the concept.

## Example Patterns

Runtime component architecture:

```d2
direction: right

input: "Incoming Request"

engine: {
  label: "Processing Engine"
  window: "Recent Window"
  notes: "Note Memory"
  episodic: "Episodic Memory"
  patterns: "Pattern Index"
  pinned: "Pinned Evidence"
}

backend: "Model Backend"
output: "Prediction"

input -> engine.window
engine.window -> engine.notes
engine.notes -> engine.episodic
engine.episodic -> engine.patterns
engine.patterns -> engine.pinned
engine.pinned -> backend
backend -> output
```

Evaluation flow (reader concepts, not filenames — the schematic still obeys the de-jargon rule):

```d2
inputs: "Input cases"
runner: "Evaluation run"
results: "Results"
stats: "Multi-seed statistics"

inputs -> runner
runner -> results
results -> stats
```

## When To Split A Diagram

Split the diagram when any of these are true:

- more than one main narrative is competing for attention
- labels have to become tiny to fit
- one audience needs the high-level method and another needs low-level contracts
- the same figure tries to show both runtime behaviour and offline artefact lineage

## Cross-Check Before Finishing

- Does the diagram match current code or docs?
- Are the nouns consistent with the surrounding text's terminology?
- Is the flow direction obvious?
- Would a reader understand the main claim in under 15 seconds?
