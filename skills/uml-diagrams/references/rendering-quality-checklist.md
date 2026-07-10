# Rendering Quality Checklist

Walk this list against every rendered diagram before declaring it done. Open the PNG/SVG and tick each item. If any item fails, fix and re-render.

## Use case diagrams

- [ ] Every actor sits OUTSIDE the system boundary.
- [ ] Every use case sits INSIDE a named `rectangle "Package Name" { ... }` boundary.
- [ ] Actor-to-use-case lines are solid `--`, no arrowheads.
- [ ] `<<include>>` arrows point base → included.
- [ ] `<<extend>>` arrows point extension → base, AND each has a condition note.
- [ ] No solid line connects two use cases without a stereotype.
- [ ] Cross-package use case ovals carry a `(defined in P<n>)` subtitle.
- [ ] No two ovals overlap.
- [ ] No actor label clips against the canvas edge.
- [ ] No `<<include>>` or `<<extend>>` label sits midway between two unrelated use cases (potential misread as a third relationship).
- [ ] No stereotype label has a padded opaque background that masks the dashed relation line behind it (use transparent text only).
- [ ] Every `<<extend>>` condition note sits at a consistent column, directly beside its extension use case oval.
- [ ] In the package overview, cross-column package dependencies are diagonal, not right-angled.
- [ ] Every actor in Section 4 is associated with at least one use case in the diagrams across the whole spec.
- [ ] Every use case shown in the diagram is also in Section 5 Table 5.

## Activity diagrams

- [ ] Exactly one `start` node.
- [ ] Every terminating flow has its own final node, placed at its own coordinate (no stacked finals).
- [ ] Every decision diamond is labelled with a question (e.g. `Payment Valid?`).
- [ ] Every outgoing decision branch has a guard label `[yes]/[no]/[approved]/...`.
- [ ] Alternative flows that reconverge on a shared action pass through an explicit merge diamond. (A single edge does NOT need a merge.)
- [ ] Every fork has a closing `end fork` or `end merge`.
- [ ] Every declared swimlane contains at least one action.
- [ ] Actions live in the performer's lane.
- [ ] Request/Provide pairs split across two lanes when they involve two parties.
- [ ] Every arrow ends at a node port (not in empty space, not inside a different shape).
- [ ] No arrow visibly crosses through an action box or ellipse body.
- [ ] Action labels are Verb–Noun, no more than 5 words.
- [ ] No action uses UML metaterms (`Node`, `Decision`, `Fork`).

## Cross-cutting

- [ ] No text clips at any canvas edge (top, bottom, left, right).
- [ ] No two shapes overlap.
- [ ] Title, package name, and author header are readable at A4 print scale.
- [ ] Diagram aliases match between the source code and the spec's figure caption.

## Trace-back to spec

- [ ] Detailed use case's Includes/Extension Points fields match the diagram's `<<include>>`/`<<extend>>` arrows (or document transitive includes in Notes).
- [ ] Detailed use case's Secondary Actors match the diagram's actor associations and Section 5 Table 5.
- [ ] Activity diagram's swimlane roles match the use case's primary and secondary actors.
- [ ] Cross-package references in the diagram match the package allocation in Section 5.
