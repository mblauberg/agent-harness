# D2 Syntax Quick Reference

This file covers the parts of D2 most likely to matter for project diagrams. The example labels
below are illustrative; substitute your own domain terms.

## Nodes And Edges

```d2
generator: "Synthetic Generator"
annotator: "Annotation Review"
dataset: "Reviewed Dataset"

generator -> annotator: review packets
annotator -> dataset: approved records
```

- Use stable identifiers on the left and human-readable labels on the right.
- Edge labels should be short and preferably noun phrases.

## Containers

```d2
generator_pipeline: {
  label: "Generator Pipeline"
  plan: "Corpus Plan"
  generate: "Conversation Generation"
  annotate: "Annotation Review"
}

generator_pipeline.plan -> generator_pipeline.generate
generator_pipeline.generate -> generator_pipeline.annotate
```

- Use containers to group subsystems or phases.
- Prefer one level of nesting unless the structure truly needs more.

## Basic Shapes And Styling

```d2
model: "Stage Classifier" {
  shape: rectangle
}

store: "Pattern Index" {
  shape: cylinder
}
```

- Use shapes sparingly.
- Reserve styling for distinctions that carry meaning, such as model versus data store.

## Classes

Useful for component contracts or object relationships.

```d2
RequestHandler: {
  shape: class
  +handle(request)
  +validate(payload)
}

Validator: {
  shape: class
  +check(payload)
}

RequestHandler -> Validator: uses
```

## SQL Tables

Useful for schema-like summaries of processed artefacts.

```d2
records: {
  shape: sql_table
  record_id: string
  index: int
  label: int
  category: string
}
```

## Imports

Use imports when a large diagram should be split into reusable parts.

```d2
shared: @shared/common_styles
```

- Regular import assigns the imported file to a node or map value.
- Use spread import inside a map when you want to merge imported contents, for example `...@shared/common_styles`.
- Keep imports simple and local to `diagrams/`.
- Only introduce imports when reuse or size justifies the extra indirection.

## Direction And Layout

For left-to-right flows:

```d2
direction: right
```

- Use top-down for pipelines when chronology matters.
- Use left-right when comparing subsystems or input/output flows.

## Comments

Use comments for provenance or assumptions:

```d2
# Reviewed against the runtime code at <revision>.
# Inferred: episodic retrieval happens after the note-memory update.
```

- Comments are useful for agent collaboration.
- Keep comments factual and concise.
