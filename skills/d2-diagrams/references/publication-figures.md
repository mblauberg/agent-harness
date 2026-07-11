# Publication figures

Use this for a D2 figure embedded in a paper, thesis, report or manuscript. The
venue, project style guide, figure index, caption and surrounding claim are the
authoritative profile. Do not silently change terminology, claims, source paths,
captions or generated-file ownership.

## Lock the communication contract

Before drawing, record:

- the reader question and the single claim the figure supports;
- the canonical terms and exclusions from the surrounding text;
- the delivery size, colour/grayscale and accessibility constraints;
- the project's source, render, caption and index locations; and
- whether edits, exports and document/index updates are authorised.

Use reader concepts by default. Exact filenames, commands, class names and
schema fields belong on the page only when reproducibility or an implementation
contract is the figure's purpose. Check the rendered labels rather than grepping
D2 identifiers, which are not necessarily visible.

## One current layout recipe

1. Choose one reading direction. Use a vertical spine for a true sequence and a
   directed graph for real branching or convergence; do not force a DAG into a
   decorative stepper.
2. Keep one conceptual level. Fold minor detail into the caption or split the
   figure instead of shrinking labels.
3. Use stable D2 identifiers and concise visible labels. Add explicit dimensions
   only where the renderer wraps a node badly.
4. Reuse the project's palette and shape grammar. Where none exists, keep a
   small role set and encode distinctions with shape or label as well as colour.
5. Try the default layout first, then ELK for a dense directed graph. Keep the
   renderer and settings that produce the clearest verified output.
6. Make legends earn their space. Include only distinctions that the caption and
   node shapes do not already explain.

Semantic correctness outranks symmetry: arrows must match the claimed direction,
future work must not feed current evidence, failure paths must not pass through a
success result, and joins must represent real combination or synchronisation.

## Render and export

First verify the installed CLI and render SVG:

```bash
d2 --version
d2 validate diagrams/figure.d2
d2 diagrams/figure.d2 output/figure.svg
```

D2's official export documentation states that native PDF exports place the PNG
render on PDF pages. Native PDF is therefore suitable when the project accepts
that representation or needs D2's PDF composition features. If the venue
requires vector shapes and text, convert the SVG with an already installed,
project-approved tool, for example:

```bash
rsvg-convert -f pdf -o output/figure.pdf output/figure.svg
```

SVG conversion can differ when Markdown or external assets are present. Inspect
the PDF visually and, where available, run `pdffonts` and `pdfimages -list`.
Reject missing text/fonts, broken layout or an unexpected full-page raster. Do
not install a converter or write into the manuscript tree without authority.

Official export behaviour: <https://www.d2lang.com/tour/exports/>.

## Evidence and review

1. Inspect the actual render at delivery size for clipping, overlap, edge-label
   ownership, whitespace and grayscale meaning.
2. Compare every visible noun and arrow with the caption and source claim.
3. Build the containing document when authorised; check page fit, caption,
   cross-reference and build warnings.
4. For high-stakes work, use `orchestrate` for risk-proportional independent
   lenses. Models and adapters are chosen at runtime; reviewer opinions are
   adjudicated against source and render evidence, not averaged.
5. After an authorised repair, rerender and repeat affected objective checks.
   Stop at the enclosing delivery run's repair cap.

For read-only review, return findings and proposed changes without updating the
figure index, source, render or manuscript.
