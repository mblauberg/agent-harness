# Activity diagram rules

Use an activity diagram to model the flow of one identified requirement or
business process. Apply the project's notation and traceability profile first.

## Structure

Identify the activity with the project's canonical name or requirement ID. A
single-workflow diagram normally has one initial node and at least one justified
ending. UML permits more complex activity structures, so multiple initial nodes
are a review prompt, not an automatic defect.

Use action nodes for performed work and partitions/swimlanes when responsibility
matters. Put each action in the lane of the role or system that performs it.
Omit empty lanes. Prefer concise action labels, but preserve established domain
terms rather than enforcing a fixed word count.

## Decisions and merges

Label the decision and every outgoing guard:

```plantuml
if (Payment valid?) then (yes)
  :Confirm booking;
else (no)
  :Display error;
endif
```

Alternate paths that reconverge need merge semantics before shared downstream
work. Separate terminating paths do not need a merge merely to create one
visual ending.

## Forks and joins

Use a fork only for concurrent work, not mutually exclusive alternatives.
Close every PlantUML `fork` with the construct whose semantics match the flow.
If all branches must complete, use a synchronising join; if they do not, model
the continuation explicitly and verify it against the textual requirement.

## Calls and sub-activities

When an action calls another use case or activity, use the project's call
notation and ensure the target is defined. `<<invoke>>` is a local presentation
convention, not a universal UML requirement; do not introduce it unless the
project already uses or explicitly adopts it.

## Review checks

- The flow matches the normal, alternate and failure paths in the source
  requirement.
- Decision guards are complete enough for the intended abstraction level.
- Concurrency and joins reflect real execution semantics.
- Actions live with the responsible participant.
- Every visible arrow reaches its intended node and avoids unrelated shapes.
- Labels, IDs and outcomes match the surrounding specification.
