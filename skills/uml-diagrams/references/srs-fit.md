# SRS Fit

Use these constraints when generating UML diagrams for a Software Requirements Specification (SRS)
or similar requirements deliverable. Section numbers below reflect a common SRS layout; map them to
the target document's own structure.

## Typical requirements-specification locations

- Section 2: Use Case Packages
  - 2.1 Package Diagram
  - 2.2 Package Descriptions
- Section 3: Use Case Diagrams
  - one use case diagram per package
- Section 6: Use Case Descriptions
  - detailed textual descriptions
- Section 7: Activity Diagrams
  - activity diagrams that model flows for clearly identified use cases

## Scope guidance

- Use case diagrams should describe the whole system across releases.
- Detailed use case descriptions and activity diagrams should focus mainly on the first release.
- Write at least one significant first-release use case description, plus the ancillary included/extending/general use cases connected to it.
- Draw at least one activity diagram for a significant use case, distinct from any already described textually elsewhere.
- Activity diagram headings should identify the use case (and its author, where the document tracks authorship).
- Invoke activity nodes must be backed by a textual description or another activity diagram.

## Quality priorities relevant to diagrams

- Identify main and minor actors, and ensure they are external entities interacting directly with the system.
- Summarise main system features clearly and show which actors use them.
- Group use cases into packages representing cohesive sets of functionality.
- Activity diagrams should show an unambiguous, accurate, detailed flow from the actors' perspectives.
- Keep diagrams professional and readable for both technical and non-technical stakeholders, and consistent with the document's template.

## Naming consistency

Keep package names and actor names consistent across the package overview, use case diagrams,
feature summaries, detailed descriptions, and activity diagrams. Actor and package candidates are
domain-specific; derive them from the system under specification rather than a fixed list.
