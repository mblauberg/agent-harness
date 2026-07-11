# Use case and package rules

These are neutral requirements-UML defaults. Read the project's diagram
profile, requirements schema and existing figures first. Project terminology,
trace identifiers, document locations and presentation conventions take
precedence; do not invent section or package numbers.

## Choose one question per view

- A package overview answers which cohesive requirement areas exist and how
  they depend on one another. If the project uses this view, keep detailed use
  cases in separate diagrams.
- A system or subsystem use case diagram answers which external actors pursue
  which user-visible goals inside a named system boundary.

Packages should group related goals or business capabilities, not mirror UI
pages, database tables or team structure. Actors are external roles or systems,
not internal classes, screens, named people or implementation components.

## Use case baseline

- Put actors outside the system boundary and use cases inside it.
- Use solid actor-to-use-case associations without arrowheads unless the
  project's notation profile says otherwise.
- Name a use case for a goal or system-provided behaviour. Prefer concise
  verb-noun labels where that fits the project's language.
- Do not encode sequence or timing in a use case diagram; use an activity or
  sequence view for workflow.
- Keep direct actor associations consistent with the textual requirement.

## Include, extend and generalisation

`<<include>>` represents mandatory reused behaviour:

```plantuml
UC_Base .> UC_Included : <<include>>
```

The arrow points from the including use case to the included use case.

`<<extend>>` represents conditional behaviour added to a base use case:

```plantuml
UC_Extension .> UC_Base : <<extend>>
note on link
  Condition: optional condition is true.
end note
```

The arrow points from the extending use case to the base. Record the extension
condition either in the diagram or in a linked textual requirement, according
to the project profile. Do not use include or extend merely to show execution
order. Between use cases, use include, extend or generalisation rather than an
unexplained plain association.

Only draw direct include/extend relationships. A transitive chain remains a
chain; do not add an extra arrow or textual direct relationship unless the
requirements actually define one.

## Cross-boundary traceability

When a use case is owned elsewhere, identify it using the project's canonical
identifier or link convention. Never fabricate forms such as `P<n>`, table
numbers or section numbers. The diagram, requirements register and detailed
description must agree on the owner and relationship.

## Visual and source consistency

- Use stable aliases that follow the repository convention.
- Keep labels readable and lines unambiguous; split a crowded view.
- Do not rely on colour alone to encode meaning.
- Preserve the project's fonts, palette, naming and source/render locations.
- Verify the rendered output, not only the PlantUML source.
