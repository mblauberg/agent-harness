# Requirements-Spec UML Diagrams Skill

This skill helps an agent create requirements-specification UML diagrams (use-case package
overviews, per-package use case diagrams, and activity diagrams) using PlantUML.

## Install in a Claude Code-style skill directory

```bash
mkdir -p ~/.claude/skills
cp -R uml-diagrams ~/.claude/skills/
```

Project-local install:

```bash
mkdir -p .claude/skills
cp -R uml-diagrams .claude/skills/
```

## Use

Ask for diagrams such as:

- "Create the package overview diagram for this system."
- "Create a use case diagram for the Booking & Reservations package."
- "Create an activity diagram for Create Booking."
- "Lint this PlantUML activity diagram against the notation rules."

## Render diagrams

Install the PlantUML CLI or download `plantuml.jar`, then run:

```bash
python scripts/render_plantuml.py templates/use_case_package_template.puml --format svg
python scripts/render_plantuml.py templates/use_case_diagram_template.puml --format svg
python scripts/render_plantuml.py templates/activity_diagram_template.puml --format svg
```

With a JAR:

```bash
PLANTUML_JAR=/path/to/plantuml.jar python scripts/render_plantuml.py diagram.puml --format png
```

## Lint diagrams

```bash
python scripts/lint_plantuml_diagram.py templates/use_case_package_template.puml --type package
python scripts/lint_plantuml_diagram.py templates/use_case_diagram_template.puml --type usecase
python scripts/lint_plantuml_diagram.py templates/activity_diagram_template.puml --type activity
```
