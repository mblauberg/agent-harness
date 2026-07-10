---
name: uml-diagrams
description: "Use when creating or editing requirements-spec UML deliverables in PlantUML: use-case package overviews, per-package use case diagrams, activity diagrams, include/extend notation, swimlanes, and SRS-style diagram sets. Do not use for C4, Structurizr, Mermaid, or unrelated .puml work."
---

# Requirements-Spec UML Diagrams

Create requirements-specification UML diagrams. Prefer PlantUML source (`.puml`) and render SVG/PNG before finalising.

## Platform choice

1. PlantUML first: use cases, packages, actors, include/extend, swimlanes, decisions, forks, joins, and finals auto-route reliably.
2. Manual SVG/Python only when an existing project already uses it. Read `references/manual-rendering-quality.md`.
3. Excalidraw/D2 only when explicitly requested.

## Workflow

1. Read the relevant guide:
   - package overview or per-package use case diagram: `references/use-case-and-package-rules.md`
   - activity diagram: `references/activity-rules.md`
   - before finalising: `references/common-mistakes.md`
   - high-stakes deliverable: `references/multi-agent-review-loop.md`
2. Start from the matching template:
   - `templates/use_case_package_template.puml`
   - `templates/use_case_diagram_template.puml`
   - `templates/activity_diagram_template.puml`
3. Use stable aliases: `UC_BookTrip`, `A_RegisteredUser`, `P_Booking`.
4. Lint:
   ```bash
   python scripts/lint_plantuml_diagram.py path/to/diagram.puml --type auto
   ```
5. Render:
   ```bash
   python scripts/render_plantuml.py path/to/diagram.puml --format svg
   ```
6. Inspect the image using `references/rendering-quality-checklist.md`; fix and re-render until clean.

## Mark-Critical Rules

- `<<include>>`: base -> included, arrowhead at included.
- `<<extend>>`: extension -> base, arrowhead at base, condition note required.
- No solid use-case-to-use-case associations; only include, extend, or generalisation.
- Package overview shows packages and actors only, not individual use cases.
- Cross-package use cases need `(defined in P<n>)`.
- Transitive includes are not direct includes; document chains in Notes.
- Activity diagrams show workflow for one use case; use swimlanes when roles/systems participate.
- Alternate flows that reconverge need merge nodes. Separate terminating flows may have separate finals, but never stacked finals.
- Every swimlane contains at least one action. Request/provide actions belong in their real actor/system lanes.
- Keep actors, the actor table, the detailed use-case descriptions, and diagram associations consistent.
- Leave enough canvas margin so labels do not clip.

## Resources

- `references/plantuml-patterns.md` and `references/srs-fit.md`.
- `references/rendering-quality-checklist.md`.
- `scripts/lint_plantuml_diagram.py`, `scripts/render_plantuml.py`.
