# Manual SVG/Python Generator Rendering Quality

Use this reference whenever a project edits a hand-rolled SVG/Python diagram generator (e.g. `svgwrite`, `cairosvg`, or `Pillow`) instead of PlantUML. Manual generators bypass the layout engine, so coordinate mistakes become rendering defects that PlantUML would have prevented.

Lessons collected from a multi-round diagram-polish cycle (Codex, Sonnet, and Haiku reviewers). Treat as hard rules.

## 1. Arrows must end at a node port, not in empty space

Every polyline that draws an arrow must have its **last point** on the destination node's boundary. Common failure modes:

- Arrow ends at `(x, y)` where no shape exists. The arrowhead floats.
- Arrow ends short of a merge node by `>20 px`. The merge appears disconnected.
- Arrow ends inside the destination shape rather than on the boundary. The arrowhead is partially eaten by the shape.

Rules:

- Compute the destination port explicitly. For a rectangle `(x, y, w, h)`, ports are `(x+w/2, y)` top, `(x+w, y+h/2)` right, `(x+w/2, y+h)` bottom, `(x, y+h/2)` left.
- For an ellipse `(cx, cy, rx, ry)`, ports are `(cx, cy-ry)` top, `(cx+rx, cy)` right, `(cx, cy+ry)` bottom, `(cx-rx, cy)` left; diagonals `(cx ± rx·cos45°, cy ± ry·sin45°)`.
- For a merge diamond `(x, y, w, h)`, ports are top `(x+w/2, y)`, right `(x+w, y+h/2)`, bottom `(x+w/2, y+h)`, left `(x, y+h/2)`.
- Verify each arrow ends at a port coordinate before regenerating.

## 2. Arrows must start at a node boundary, not inside

Symmetric to (1). An include arrow that starts at `(700, 585)` inside a Process Payment oval visually bisects the oval. Move the start to the boundary.

## 3. Route around obstructions

Plan every polyline route to avoid crossing action bounding boxes or ellipse bodies. Use this algorithm:

1. List every box bounding-box `(x_min, y_min, x_max, y_max)` in the canvas region the route must cross.
2. Find an empty `x` column or `y` row inside that region.
3. Route the line horizontally to that column, vertically through it, and horizontally to the destination.
4. Re-render and visually verify no crossings.

Lines that pass through ellipse bodies, condition notes, or other action boxes are a real defect. Plain associations between use cases and actor associations both have this risk in dense diagrams.

## 4. Canvas margins

- Allow ≥60 px below the last final node.
- Allow ≥60 px to the right of the rightmost actor body and label (actor label is rendered ~160 px below the head).
- Allow ≥60 px above the diagram title.

When in doubt bump canvas dimensions before pushing actors.

## 5. Multiple finals are fine; stacked finals are not

UML accepts one final per terminating flow. Two finals at the same `(x, y)` on the same arrow is an error. Either:

- Place each final on its own column with its own arrow, or
- Merge the flows through a merge diamond into a single shared final.

## 6. Merge nodes exist where 2+ flows reconverge

Only insert a merge diamond when two or more alternate paths flow into the SAME downstream node. A single edge from a decision branch to its first action does not need a merge.

For each merge:

- Each incoming branch arrow ends at the merge's left/top/right port.
- One outgoing arrow leaves the bottom port to the next action.

## 7. Swimlanes contain the work of their role

Every declared swimlane must contain at least one action. If a role has no action, do not declare a lane for it.

Action assignment rule: an action lives in the lane of the role that *performs* it. For request/response patterns:

- Requester's lane holds `Request X Evidence`.
- Responder's lane holds `Provide X Evidence`.
- Cross-lane arrows make the handoff explicit.

## 8. Cross-package use case ovals are annotated

When a base use case in package P_n references an included or extended use case defined in P_m, draw the destination oval with a subtitle `(defined in P_m)` so a reviewer can trace it. Use the **defining package number**, not where it is referenced.

## 9. Use case to use case relationships

Only valid relationships between two use cases are `<<include>>`, `<<extend>>`, and generalisation. A plain `assoc(uc_a, uc_b)` between two use cases is invalid UML; remove it or change to a stereotyped relationship.

Actor-to-use-case associations remain plain solid lines `--` without arrowheads.

## 10. Include/extend label positioning

Place the stereotype label near the source or near the destination, not in the middle of an L-shaped route. A label dropped midway between two unrelated use cases reads as a relationship between those two.

Avoid placing labels:

- Inside another use case oval.
- On top of cross-package subtitles like `(defined in P_n)`.
- Overlapping a condition note for a different relationship.

## 11. `<<include>>` / `<<extend>>` labels must not mask the line behind them

If the label is drawn with a filled background rectangle (a `label_box` with `fill=WHITE` or any opaque colour), it covers the dashed relation line behind it. The label box also adds 30–60 px of horizontal padding around the text that masks even more of the line.

Fix the label helper to draw transparent text only, no background:

```python
def label_box(self, s, x, y, w=170, h=36, size=16, fill=WHITE):
    # Tight, transparent label so the dashed relation line remains visible.
    self.text(s, x + w/2, y + size + 2, size, 'middle', BLUE_DARK, 'bold')
```

Set the label coordinate close to the line's mid-arc, not over an empty area where it becomes ambiguous.

## 12. Condition notes must be placed predictably

Random note positions force the reviewer to hunt for which extension the condition belongs to. Place every condition note at a consistent column to the right of the extension use case oval, at the same y-band as the use case itself.

For example with extensions on the right column at x in `[1240, 1700]`:

```python
NOTE_X = 1720   # consistent column for all condition notes
NOTE_W = 400
for ext_uc_y_mid in [985, 1145, 1335, 1505]:
    d.note(f'Condition: ...', NOTE_X, ext_uc_y_mid, NOTE_W, 60)
```

Rules:

- One note per `<<extend>>` arrow, immediately beside its extension use case.
- Same `x` and `w` for every note in a diagram.
- Note height tight to the wrapped text (60–72 px for a single sentence).
- Notes never overlap a use case oval or a relation line.

## 13. Package overview dependency arrows are diagonal, not orthogonal

For the use-case package overview, package-to-package dependencies that span columns should be drawn as direct diagonal arrows from the source package edge to the destination package edge.

Avoid orthogonal (right-angled) routes through the middle channel because they:

- Overlap with intra-column vertical dependency arrows.
- Read as a stack of unrelated lines.
- Create T-junctions that the reviewer has to disambiguate.

Right:

```python
d.line([(source_pkg_right, source_y_mid), (dest_pkg_left, dest_y_mid)],
       stroke=BLUE, sw=3, dash='8,8', arrow=True)
```

Wrong:

```python
d.line([(source_pkg_right, y),
        (middle_x, y),
        (middle_x, dest_y),
        (dest_pkg_left, dest_y)], ...)
```

Reserve right-angled routes for activity diagrams where the layout grid genuinely requires them and the route stays in clear channels.

## 11. Verify after every regeneration

After every diagram edit:

1. Regenerate (e.g. `python generate_diagrams.py`).
2. Visually inspect the affected PNGs. Do not assume a coordinate change worked.
3. Walk the `rendering-quality-checklist.md`.
4. If anything is wrong, fix coordinates and regenerate. Do not push without visual confirmation.

## 12. Multi-round review catches more

A single visual inspection misses defects. For final deliverables, run the `multi-agent-review-loop.md` process: multiple reviewers in parallel, fix every flagged defect, re-render, repeat until READY-TO-SUBMIT.

## Quick lookup: failure → fix

| Symptom | Fix |
|---|---|
| Arrowhead floats in empty space | End the polyline at a node port coordinate |
| Arrow visibly stops short of merge | Extend last point to merge's right/top port |
| Arrow passes through an action box | Reroute through an empty `x` column or `y` row |
| Two finals stacked on same arrow | Separate to two finals at different positions |
| Empty swimlane | Move work into the lane or remove the lane |
| Action sits in the wrong lane | Move to the performer's lane; add cross-lane arrows |
| Use case oval subtitle clips against a label | Move the label outside the oval's bounding box |
| Solid line between two use cases | Replace with `<<include>>`, `<<extend>>`, or remove |
| Banks/TSA actor clipped at canvas edge | Bump canvas width/height by ≥80 px |
| Include label sits between two unrelated use cases | Move label adjacent to its source or destination port |
