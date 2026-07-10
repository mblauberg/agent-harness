---
name: d2-diagrams
description: Use when creating, editing, formatting, validating, or rendering D2 diagrams in any project — architecture, pipeline, flow, component, class, schema, or publication-quality figures — needing D2 syntax, CLI usage, layout, or vector-PDF export guidance. Not for Mermaid, Graphviz, or PlantUML source.
---

# D2 Diagrams

Use this skill when an agent needs to create, update, format, validate, or render D2 diagrams in a project.

## Scope

- This is a practical usage guide for authoring D2, not a full D2 manual.
- Prefer D2 for diagrams that need to be source-controlled, repeatably rendered, and revised alongside the surrounding text or docs.
- Prefer Mermaid only when you are explicitly updating an existing Mermaid-only artefact and there is no reason to convert it.

## Publication figures (anything in a written document)

If the diagram goes into a written document (paper, thesis, report, manuscript) rendered to a
figure file and included in the text, its audience is a reader or reviewer, not an engineer. Two
hard laws override the generic defaults below:

1. **No codebase terms on the page** — no filenames, CLI commands, type/class names, schema
   versions, or raw thresholds. Reader concepts only; implementation detail belongs in the
   caption/prose.
2. **Render to a TRUE VECTOR PDF** via `d2 … .svg` then `rsvg-convert -f pdf` (the blessed path;
   `cairosvg` is a fallback that often errors on d2 SVGs). Native `d2 … .pdf` rasterises every
   shape at 144 ppi — never ship it.

The full proven recipe — shared design language (copy-paste class header, role→colour+shape
table), the `grid-columns: 1` banded layout with spacer-centred nodes, the footer legend, the
aspect/page-fit rule, the semantic-correctness checklist, and the cross-family visual review
loop — is in [references/publication-figures.md](references/publication-figures.md). Read it
before creating or editing a publication figure.

## Where To Put Things

- Put D2 source files in a dedicated `diagrams/` directory (or wherever the project keeps them).
- Follow the project's existing file-naming convention; use a numeric prefix when the diagrams form an ordered figure set, for example `07_memory_architecture.d2`.
- Export `svg`, `pdf`, or `png` only when the user asks for rendered outputs or the workflow needs them.
- Do not overwrite unrelated existing Mermaid or Structurizr artefacts.

## Default Workflow

1. Decide whether the diagram is best expressed as a pipeline, architecture, component map, sequence, class/table, or mixed view.
2. Draft the `.d2` source with concise labels and stable identifiers.
3. Run `d2 fmt` on the file.
4. Run `d2 validate` on the file.
5. Render to `svg` by default. For a document-submission PDF, convert the SVG to a true vector PDF (`rsvg-convert -f pdf -o out.pdf in.svg`) — do NOT use native `d2 … .pdf` (it is a 144 ppi raster). Use `png` only when raster is explicitly needed.
6. Check that labels are readable, edge directions are sensible, and the figure is useful rather than decorative. For publication figures, also read the rendered PNG and run the checks in [references/publication-figures.md](references/publication-figures.md).

## Defaults

- Optimise for explanatory value over visual novelty.
- Prefer `dagre` for directed flows and staged pipelines.
- Try `elk` when a dense architecture diagram becomes hard to read under `dagre`.
- Use short labels in the diagram and keep detailed explanation in the surrounding prose or captions.
- Group related subsystems with containers.
- Make data stores, artefacts, models, and scripts visually distinct when that distinction matters to the argument.
- Use Australian English in labels and comments.
- Do not include real PII or real user examples in figures.

## Common Diagram Types

- Build, generation, or annotation pipelines
- Runtime or service architecture
- Training or evaluation workflows
- Component and memory-structure relationships
- Frontend/backend data flow
- Schema-like views for structured artefacts

## Syntax And CLI References

- For publication figures in a written document, read [references/publication-figures.md](references/publication-figures.md) FIRST (design language, layout, vector-PDF render, review loop).
- For core D2 syntax, read [references/syntax.md](references/syntax.md).
- For local CLI usage, read [references/cli.md](references/cli.md).
- For diagram-shaping and naming guidance, read [references/diagram-patterns.md](references/diagram-patterns.md).

## Guardrails

- Do not invent advanced D2 syntax when a plain node-and-edge diagram will communicate better.
- Do not add themes, sketch mode, icons, or styling flourishes by default.
- Do not commit large batches of rendered exports unless the user asked for them.
- If a diagram is becoming crowded, split it into two focused diagrams instead of forcing one giant canvas.

## Official Sources

- D2 repository: https://github.com/terrastruct/d2
- D2 tour/docs: https://d2lang.com/tour/
