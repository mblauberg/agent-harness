# Publication-Quality Figures (proven recipe)

Use this for any figure that goes in a WRITTEN document (paper, thesis, report, manuscript):
a `.d2` source rendered to a figure PDF and `\includegraphics`-ed (or equivalently embedded) in
the text. Audience is a reader or reviewer, NOT a project engineer. This recipe was proven on a
real figure set through a research → build → multi-family-review loop; follow it instead of
re-deriving.

If the project maintains a figure index (which figure → which section, presentation variants,
render command), read it first and UPDATE it whenever you add or change a figure.

> **Layout style note.** The recommended layout is a LEFT-GUTTER STEPPER, not the banded-card
> layout described in the older sections below. In the stepper, the numbered step is an *unboxed*
> markdown gutter label (big number + rule + bold name) that centres on its node — NO band card;
> sequential figures are a **single vertical spine + horizontal side-stubs** for branches/inputs
> (continuation rows get a blank gutter, an output gets `↳`); only a genuine DAG keeps tidy
> converging diagonals. No serpentine, no diagonal band-to-band sweeps. Palette is the same
> role=colour+shape grammar, muted two-tonal. Fold fans into node text (components, measurements,
> sub-states). The band/spacer recipe and centred/top-left band titles below are SUPERSEDED — keep
> them only as an alternative and as history.

## Two non-negotiable laws

1. **No codebase terms on the page** — no filenames (`*.jsonl/.json/.pt/.gguf`), CLI commands
   (`run-stage --stage …`), type/class names (`PredictionResult`), schema versions
   (`run-manifest/v2`), raw thresholds (`trust >= 45`), or field lists. Every node is a
   reader concept; implementation detail goes in the caption/prose.
   - **Check what RENDERS, not the source.** D2 node *ids* are snake_case (`stage_train`) and edge
     lines repeat them — those never appear on the page, so do not grep the `.d2`. Grep the
     rendered SVG text instead:
     ```bash
     d2 diagrams/figure_0X.d2 /tmp/check.svg
     grep -oE '\.(jsonl|json|pt|gguf)|run-stage|[a-z]+_[a-z]+|>= [0-9]' /tmp/check.svg | sort -u
     ```
     Any hit here is real on-page jargon. (Hits in the `.d2` source on ids/edges are expected.)
2. **Render to a TRUE VECTOR PDF, never native `d2 … .pdf`.** Native d2 PDF is vector text over a
   144 ppi RASTER of every shape/fill/edge (terrastruct/d2#1859).
   ```bash
   d2 diagrams/figure_0X.d2 diagrams/figure_0X.svg
   rsvg-convert -f pdf -o figures/figure_0X.pdf diagrams/figure_0X.svg
   ```
   `rsvg-convert` is the blessed converter. `cairosvg in.svg -o out.pdf` is a fallback only — it
   often errors on d2 0.7.x SVGs. Verify the result:
   ```bash
   pdffonts figures/figure_0X.pdf      # must list EMBEDDED fonts (text is vector)
   pdfimages -list figures/figure_0X.pdf
   ```
   A correct rsvg PDF DOES contain many tiny `smask`/`image` mask tiles (gray, ~72 ppi, a few KB
   each) — that is normal opacity handling, NOT a failure. The failure to reject is a single
   **full-page RGB `image`** (hundreds of KB) — that means you used the native raster path; redo.

## Shared design language — copy this header verbatim into every figure

One visual language across the whole set. Role = colour AND shape (redundant, so it survives
grayscale and colour-vision deficiency). Keep the `direction: down` AND `grid-columns: 1` together
(see Layout): grid fixes band *placement*; `direction: down` governs edge *routing*.

```d2
direction: down

# D2 classes carry COLOUR ONLY — they cannot set shape. You MUST also put `shape:` on each
# node (cylinder/diamond/hexagon); a class with no shape renders as a rounded rectangle.
classes: {
  data:     {style: {fill: "#DBEAFE"; stroke: "#1D4ED8"; stroke-width: 2; font-color: "#0F172A"; border-radius: 6}}  # use shape: cylinder
  process:  {style: {fill: "#EDE9FE"; stroke: "#6D28D9"; stroke-width: 2; font-color: "#0F172A"; border-radius: 6}}  # rounded rect (default)
  decision: {style: {fill: "#FEF3C7"; stroke: "#B45309"; stroke-width: 2; font-color: "#0F172A"}}                    # use shape: diamond
  human:    {style: {fill: "#FCE7F3"; stroke: "#BE185D"; stroke-width: 2; font-color: "#0F172A"; border-radius: 6}}  # rounded rect
  claim:    {style: {fill: "#DCFCE7"; stroke: "#15803D"; stroke-width: 2; font-color: "#0F172A"}}                    # use shape: hexagon
  future:   {style: {fill: "#F1F5F9"; stroke: "#94A3B8"; stroke-width: 2; stroke-dash: 4; font-color: "#334155"; border-radius: 6}}
  # Sanctioned figure-specific extras (define in that figure's legend if used):
  exit:     {style: {fill: "#F8FAFC"; stroke: "#94A3B8"; stroke-width: 2; font-color: "#334155"; border-radius: 6}}  # no-action / failure outcome
  note:     {style: {fill: "transparent"; stroke: "#94A3B8"; stroke-width: 1; stroke-dash: 2; font-color: "#475569"; border-radius: 18; font-size: 15; italic: true}}  # context note
  band:     {style: {fill: "#FBFCFE"; stroke: "#CBD5E1"; stroke-width: 1; font-size: 24; bold: true; border-radius: 8}}
  key:      {style: {fill: "#FFFFFF"; stroke: "#CBD5E1"; stroke-width: 1; font-size: 15}}
  sp:       {style: {opacity: 0}}   # transparent spacer for centring lone nodes
}
```

| Role | class | shape to set |
|------|-------|--------------|
| Data / store / artefact | `data` | `cylinder` |
| Process / step | `process` | rounded rectangle (default) |
| Decision / gate / guard | `decision` | `diamond` |
| Human review | `human` | rounded rectangle |
| Claim authority / result | `claim` | `hexagon` |
| Future work | `future` | dashed grey rectangle |

Keep ≤6 base role colours. A state-machine figure may **rename** these classes to phase names
(e.g. `everyday/setup/guard/ask/backoff/terminal`) but must REUSE the same canonical colours and
define them in its legend — never invent a new palette.

## Layout recipe

- **Header = `direction: down` + root `grid-columns: 1`** → a vertical stack of numbered bands.
  Grid gives content-hugging, deterministic bands; a free `direction: down` alone staircases
  them. Keep `direction: down` for sane edge routing.
- **Each band is its own internal `grid-columns: K`** row, titled `N · Title`.
- **dagre AND elk both IGNORE a nested container's `direction`** — children follow the root. Use
  grid; do not fight the engine. Default engine is `dagre`; only try `--layout elk` if a dense
  figure's edges are cluttered, and keep the cleaner render.
- **Set explicit `width`/`height` on multi-line and shaped nodes** or labels wrap badly and bands
  go lopsided. Typical values: process/data `width: 260–340`; tall diamond
  `width: 340; height: 150`; hexagon `width: ~170–240; height: ~110–130`; circle `150×150`.
- **Centre a lone node** in a full-width band with transparent spacer cells:
  ```d2
  b1: "1 · Incoming message" {
    class: band
    grid-columns: 3
    l: {label: ""; class: sp}
    node: {label: "New message"; class: process; width: 200}
    r: {label: ""; class: sp}
  }
  ```
- **Multi-node bands (2–3 nodes):** give the band `grid-columns: K` and a generous
  `horizontal-gap` (~40–80); keep edge labels to one short word or drop them, because a crowded
  terminal band is where labels collide. If three nodes plus their edge labels still crowd, split
  into two bands.
- **Band titles sit TOP-LEFT, over a keep-out column.** Put `label.near: top-left` on every band
  AND keep the band's far-left column an empty `sp` spacer, and keep titles short (≤ ~3 words;
  push qualifiers to the caption). Centred band titles get the vertical spine arrow run straight
  through them; top-left + an empty left column + a short title means edges enter a centre/right
  node and never cross the title.
- **Legend is OPTIONAL — a clean set can ship with NO legend.** Role still reads from
  colour + shape (cylinder/diamond/hexagon are self-evident); node text and the caption carry the
  rest. Drop the footer legend unless a colour/shape is genuinely ambiguous — it is redundant
  clutter that also lengthens an already-portrait figure. If you DO keep one, it is the last
  top-level block: a horizontal `grid-columns: N` strip (`class: key`) listing ONLY the roles used,
  in the canonical order (Process, Data, Decision, Human, Claim, then figure-specific), with
  identical wording across figures.
- **A band with internal edges MUST be a single row.** A 2-row grid that also has internal edges
  makes d2 abandon the grid and dagre-scramble the nodes. For a row-over-node convergence (e.g. N
  evidence streams onto one hexagon), use a **nested transparent container** (`label: ""`,
  `style.fill/stroke: transparent`) for the row plus a sibling node below it; the edges then drop
  through the open inter-row gap and cross no box. For a two-step pair that must stay adjacent
  (train→model x2), keep it single-row and accept one short backward arrow.
- **Avoid a bidirectional 2-cycle between two side-by-side nodes** — both arrows are horizontal so
  the two edge labels stack and garble. Use ONE labelled arrow into a self-explaining node, or a
  serpentine so the return is vertical.
- **Serpentine multi-step phase bands** (band 1 left→right, band 2 right→left, …) so every
  band-to-band hand-off is a clean vertical drop instead of a long sweep across the next title.
- **Edges:** one reading direction; reserve dashed/grey for the ONE feedback loop or secondary/
  back-off paths. **Drop an edge label that merely repeats its target node's name** (it just
  collides with the node).
- **Aspect / page fit:** read the SVG `viewBox` (`grep viewBox file.svg`); aim w/h ~0.68–1.0
  (portrait figures around ~0.57–0.77 also fit well). In LaTeX, give EVERY document figure
  `height=0.9\textheight,keepaspectratio` (body figures use `width=\textwidth`, appendix uses
  `width=\linewidth`) so tall/portrait figures cannot overflow. Confirm with **zero
  `Overfull \vbox`** in the build log.

## Semantic-correctness checklist (a clean-looking figure can still be WRONG)

General rules (always apply):
- **Arrow direction matches the claim.** If A is the authority that defines B, draw
  `A -> B: "defines"`, not the reverse.
- **A "future work" node must have NO edge into a current claim/result** — an edge there reads as
  future work feeding current evidence. Leave it unconnected or attach it to the relevant stage.
- **A failure/`invalid` exit must not route through the success node** — place it on the opposite
  side or a separate row so it never crosses the claim hexagon.
- **Joins/merges must be technically true** — only draw what actually combines (e.g. if only an
  adapter merges into a base model, a separate classifier that joins a bundle later does NOT enter
  the "merge" step).

## How these were validated (do the same)

1. Render a review PNG: `d2 diagrams/figure_0X.d2 /tmp/figure_0X.png` (native PNG is fine for
   visual review — only the *document* PDF must be vector).
2. READ the PNG (the image, not the source) and score it.
3. Best-effort decorrelated review: yourself + cross-family models where available — gemini
   (`gemini --approval-mode plan -p "@/tmp/x.png …"`) and codex (`codex exec -i /tmp/x.png … < prompt`,
   background it; it is slow) + 1–2 Claude subagents, each scoring /10 with concrete fixes. These
   CLIs can be flaky/unavailable; if so, fall back to careful self-review of the PNG.
4. Apply fixes, re-render, re-review. Loop until jargon-free, balanced, and drop-in ready.
5. Objective gates before commit: rendered-SVG jargon grep clean; vector PDF (`pdffonts` shows
   embedded fonts, no full-page raster); document builds with zero overfull; figure agrees with its
   caption.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Filenames / CLI / type names on the page | Reader concepts; detail to caption |
| Grepping the `.d2` for jargon | Grep the rendered SVG (ids/edges are not on-page) |
| Native `d2 x.pdf` (raster) | `d2 x.svg` then `rsvg-convert -f pdf` |
| Rejecting a PDF for having `smask` tiles | Only a full-page RGB image is the raster failure |
| `class: data` renders a rectangle | Classes carry colour only — also set `shape: cylinder` |
| Multi-line nodes cramped / bands lopsided | Set explicit `width`/`height` |
| Lone node clustered left | Centre with `sp` spacer cells |
| Crowded terminal band, colliding edge labels | Wider gap, drop redundant labels, or split the band |
| Nested `direction: right` "not working" | dagre/elk ignore it — use grid |
| Spine arrow runs through a centred band title | Title `label.near: top-left` + empty left `sp` column + short title |
| 2-row grid band scrambles when it has edges | Single-row bands only; nested transparent container for row-over-node convergence |
| Bidirectional 2-cycle labels stack/garble | One labelled arrow into a self-explaining node, or serpentine |
| Long sweep from band N right into band N+1 left title | Serpentine the bands so the hand-off is a vertical drop |
| Tall figure overflows the page | `height=0.9\textheight,keepaspectratio` on every figure |
| Looks clean, reads wrong | Run the semantic-correctness checklist |
