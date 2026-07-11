# Requirements-spec UML diagrams

This cross-harness skill creates and checks requirements-specification UML
diagrams in PlantUML. Install it through the harness's normal skill-management
workflow; do not copy it into provider-specific directories by hand.

## Use

Ask for diagrams such as:

- "Create the package overview diagram for this system."
- "Create a use case diagram for the Booking & Reservations package."
- "Create an activity diagram for Create Booking."
- "Lint this PlantUML activity diagram against the notation rules."

## Render diagrams

Use the project's existing PlantUML installation. From any project directory:

```bash
UML_SKILL="${AGENTS_HOME:-$HOME/.agents}/skills/uml-diagrams"
python3 "$UML_SKILL/scripts/render_plantuml.py" "$UML_SKILL/templates/use_case_package_template.puml" --format svg
python3 "$UML_SKILL/scripts/render_plantuml.py" "$UML_SKILL/templates/use_case_diagram_template.puml" --format svg
python3 "$UML_SKILL/scripts/render_plantuml.py" "$UML_SKILL/templates/activity_diagram_template.puml" --format svg
```

With a JAR:

```bash
PLANTUML_JAR=/path/to/plantuml.jar python3 "$UML_SKILL/scripts/render_plantuml.py" diagram.puml --format png
```

## Lint diagrams

```bash
python3 "$UML_SKILL/scripts/lint_plantuml_diagram.py" "$UML_SKILL/templates/use_case_package_template.puml" --type package
python3 "$UML_SKILL/scripts/lint_plantuml_diagram.py" "$UML_SKILL/templates/use_case_diagram_template.puml" --type usecase
python3 "$UML_SKILL/scripts/lint_plantuml_diagram.py" "$UML_SKILL/templates/activity_diagram_template.puml" --type activity
```

These templates are neutral starting points. Project-local templates, naming,
traceability and document structure take precedence.
