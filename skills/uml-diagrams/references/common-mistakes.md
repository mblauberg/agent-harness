# Common mistakes

Treat notation, semantic and traceability defects as blockers. Treat layout and
wording preferences as findings only when they impair the diagram's purpose or
violate the project's declared profile.

## Package and use case views

- **Mixed conceptual levels.** A package overview also contains every use case.
  Split the overview from detailed views unless the project deliberately uses a
  combined notation.
- **Implementation-shaped packages or actors.** Group packages by cohesive
  goals/capabilities and use external roles or systems as actors.
- **Missing or misleading system boundary.** Make the subject and scope of the
  use case diagram explicit.
- **Wrong include direction.** The including use case points to the included
  use case.
- **Wrong extend direction.** The extending use case points to the base; record
  the condition in the diagram or its linked requirement.
- **Include/extend used for chronology.** Use an activity or sequence view for
  order.
- **Unexplained use-case association.** Between use cases, use include, extend
  or generalisation with the intended semantics.
- **Transitive relationship presented as direct.** Draw and describe only the
  direct relationships unless the requirements define another direct link.
- **Invented cross-package locator.** Use the project's canonical requirement
  ID or link. Do not invent package, section or table numbers.
- **Actor or relationship drift.** Reconcile the diagram with the canonical
  requirements register and detailed descriptions.

## Activity views

- **Unlabelled decision or guard.** Name the decision and its outgoing guards.
- **Fork used for alternatives.** Forks represent concurrency; decisions
  represent mutually exclusive paths.
- **Incorrect merge/join semantics.** A merge reunites alternatives; a join
  synchronises concurrent work.
- **Empty or incorrect swimlane.** Remove empty lanes and put work with the
  participant that performs it.
- **Undefined call activity.** Link the called behaviour to its canonical
  requirement or activity.
- **Flow disagrees with the requirement.** Include relevant normal, alternate
  and failure outcomes at the chosen abstraction level.

## Render and source

- Labels, arrowheads or shapes clip, overlap or become ambiguous.
- A connection appears to stop in empty space or crosses an unrelated shape.
- Colour is the only carrier of meaning.
- The rendered file is stale relative to its source.
- A caption, filename or index claims an owner or status not supported by the
  canonical project source.

Fix the source, render again and inspect the resulting image. For a read-only
review, report the proposed repair without changing project files.
