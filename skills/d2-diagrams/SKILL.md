---
name: d2-diagrams
description: Use when creating, editing, formatting, validating, or rendering D2 diagrams in any project — architecture, pipeline, flow, component, class, schema, or publication-quality figures — needing D2 syntax, CLI usage, layout, or vector-PDF export guidance. Not for Mermaid, Graphviz, or PlantUML source.
---

# D2 diagrams

Use D2 when fixed layout, repeatable exports or publication quality justify
maintaining source plus a rendered asset. Prefer native Mermaid for GitHub
READMEs and living operational docs. Simplify or split an overloaded Mermaid
graph before converting it; a tool change cannot fix mixed conceptual levels.

## Publication figures (anything in a written document)

For a paper, thesis, report or manuscript:

1. Use reader concepts, not filenames, commands, code symbols, schema versions
   or raw thresholds.
2. Render SVG, then convert with `rsvg-convert -f pdf`. Native D2 PDF output
   rasterises shapes at 144 ppi; do not use it for publication.

Read [publication-figures.md](references/publication-figures.md) before editing
a publication figure.

## Where To Put Things

- Use the project's diagram directory and naming convention.
- Export only when requested or required by the workflow.
- Never overwrite unrelated Mermaid or Structurizr artefacts.

## Default Workflow

1. Choose the reader question and diagram type.
2. Draft concise labels and stable identifiers.
3. Run `d2 fmt` on the file.
4. Run `d2 validate` on the file.
5. Render SVG by default; use PNG only when raster is required.
6. Open the render and inspect labels, edges, grouping, whitespace and page fit.

## Defaults

- Prefer `dagre` for directed flows; try `elk` for dense architecture.
- Group related systems; distinguish roles only when it aids the argument.
- Keep detail in prose, use Australian English and exclude real PII.

## Syntax And CLI References

- For core D2 syntax, read [references/syntax.md](references/syntax.md).
- For local CLI usage, read [references/cli.md](references/cli.md).
- For diagram-shaping and naming guidance, read [references/diagram-patterns.md](references/diagram-patterns.md).

## Guardrails

- Prefer plain nodes and edges; avoid themes, icons and flourishes by default.
- Do not commit batches of exports without authority.
- Split crowded diagrams instead of forcing one canvas.

## Official Sources

- D2 repository: https://github.com/terrastruct/d2
- D2 tour/docs: https://d2lang.com/tour/
