# Diagram quality gate

Use this gate for README, architecture and lifecycle diagrams. A successful
parser run is necessary but not sufficient; it is not visual verification.

## Choose the representation

- Prefer native Mermaid for GitHub READMEs and living operational docs.
- Use one conceptual level per diagram. Show the lifecycle overview separately
  from a detailed repair, retry or state loop.
- Prefer `stateDiagram-v2` for lifecycles and bounded loops; use `flowchart`
  when routing or branching is the point. A compact flowchart may show only a
  labelled success spine when adjacent prose carries every omitted return path.
- Consider D2 when a stable fixed layout matters enough to maintain both source
  and an exported SVG. Do not convert merely to rescue an overloaded graph.

Split the diagram before adding layout tricks when it combines a nested cycle,
multiple return edges, cross-boundary feedback and optional sidecars. Preserve
omitted semantics in the companion detail diagram or adjacent prose.

## Render, inspect, revise

1. Render the exact Markdown block with the target's Mermaid version. For
   GitHub, use its documented Mermaid `info` block to check the current
   version, then use a compatible local CLI where feasible. A newer local
   renderer is a visual smoke test, not proof of GitHub compatibility.
2. Open the rendered SVG or PNG. Do not infer visual quality from source.
3. Check a normal desktop presentation and scaling between 320 and 480 CSS
   pixels wide.
4. Reject node or label overlap, clipped text, edges through nodes, ambiguous
   arrow direction, a loop that dominates the canvas, excessive blank space or
   important stages pushed outside their visual group.
5. Recheck semantic completeness: gates, failure paths and loop exits must not
   disappear during layout repair. Never draw a false transition to make a
   loop narrower; label a partial spine and move complete routing into adjacent
   prose instead.
6. Give each Mermaid block an `accTitle` and `accDescr`. Provide an equivalent
   table or short ordered description for load-bearing routes, and keep user
   gates visually distinct in the view where they control progression.

Run Markdown-mode `mmdc` from a temporary working directory with an explicit
output file. It writes per-block SVG siblings beside that output (or beside the
input when no output is given), so an incautious command can leave scratch in
the repository.

After publication or in an authorised preview, inspect the target renderer as
well. GitHub's version check is documented at
<https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams#checking-your-version-of-mermaid>.

Shorten labels before styling. Prefer a second focused diagram over invisible
spacers, hard-coded positions or theme-specific colours. Keep important labels
readable without zoom and describe the load-bearing invariant in nearby prose.
