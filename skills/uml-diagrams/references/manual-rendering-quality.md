# Manual SVG or Python rendering quality

Use this only when the project already owns a hand-built SVG/Python generator
or explicitly chooses one. Preserve its coordinate system, helpers, fonts,
palette and generated-file ownership. Manual rendering does not broaden source
or export authority.

## Geometry invariants

- Start and end each connection on the boundary of its source and destination.
  Do not leave arrowheads floating or buried inside shapes.
- Route connections through clear channels. Test each segment against the
  bounding boxes of unrelated nodes, labels and notes.
- Keep arrow direction and merge/join semantics consistent with the underlying
  UML relationship.
- Place relation labels close enough to their connection that ownership is
  unambiguous. Avoid opaque label backgrounds that erase the line.
- Give every shape and label enough canvas margin at the delivery size. Use
  measured text bounds when the generator supports them instead of fixed magic
  padding.

For a rectangle `(x, y, w, h)`, common ports are the midpoints of its four
edges. For ellipses and diamonds, compute the intersection with the actual
boundary rather than reusing a rectangular corner. Centralise these calculations
in tested helpers; do not hand-edit individual arrow coordinates when a shared
layout rule owns them.

## Activity and use case checks

- Alternate flows merge only when they really reconverge; concurrent flows join
  only when synchronisation is required.
- Each lane contains work performed by that participant.
- Use-case relationships are include, extend or generalisation rather than an
  unexplained plain association.
- Cross-boundary items use the project's canonical trace identifier, never an
  invented package or section number.
- Extension conditions are visible or linked to the canonical requirement.

## Verification loop

1. Regenerate only the authorised outputs.
2. Open the render and inspect the image, not just the source coordinates.
3. Run [rendering-quality-checklist.md](rendering-quality-checklist.md).
4. Compare source and generated-file revisions; stale output is a failure.
5. For high-stakes independent review, follow
   [multi-agent-review-loop.md](multi-agent-review-loop.md).

Prefer a maintained layout engine when manual coordinate complexity no longer
serves a project requirement. A rewrite of an established generator is an
architecture decision, not a diagram-polish shortcut.
