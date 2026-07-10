# D2 CLI Usage

Assumes `d2` is installed and available on `PATH`. The examples use `diagrams/diagram.d2` as a
placeholder path — substitute your own.

## Core Commands

Format a diagram:

```bash
d2 fmt diagrams/diagram.d2
```

Check formatting in scripts or CI-style workflows:

```bash
d2 --check diagrams/diagram.d2
```

Validate syntax and references:

```bash
d2 validate diagrams/diagram.d2
```

Render to SVG:

```bash
d2 diagrams/diagram.d2 diagrams/diagram.svg
```

Render to PDF for publication figure workflows — go via SVG to get a TRUE VECTOR PDF (native
`d2 … .pdf` is vector text over a 144 ppi raster of every shape; never ship it):

```bash
d2 diagrams/diagram.d2 diagrams/diagram.svg
rsvg-convert -f pdf -o figures/diagram.pdf diagrams/diagram.svg
pdffonts  figures/diagram.pdf   # must list EMBEDDED fonts (text is vector)
pdfimages -list figures/diagram.pdf
# PASS = no full-page RGB image. Many tiny gray smask tiles (~72 ppi, a few KB) are NORMAL for
# rsvg opacity handling, NOT a failure. (cairosvg is a fallback; it often errors on d2 0.7.x SVGs.)
```

Watch during iterative editing:

```bash
d2 --watch diagrams/diagram.d2 diagrams/diagram.svg
```

Use ELK for denser graphs:

```bash
d2 --layout elk diagrams/diagram.d2 diagrams/diagram.svg
```

List available themes:

```bash
d2 themes
```

Open a file in the hosted playground when local iteration is awkward:

```bash
d2 play diagrams/diagram.d2
```

## Practical Defaults

- Default export: `svg`
- Document or manuscript attachment export: vector `pdf` via `svg` → `rsvg-convert` (NOT native `d2 … .pdf`)
- Slide deck or document image export when vector is not suitable: `png`
- Default layout engine: `dagre`
- Try `elk` for crowded dependency or architecture views

## Suggested Local Loop

```bash
d2 fmt diagrams/diagram.d2
d2 validate diagrams/diagram.d2
d2 diagrams/diagram.d2 diagrams/diagram.svg
```

## Notes

- `d2` defaults to SVG output if no output path is given.
- `--watch` opens a local browser view unless browser opening is disabled.
- Keep command examples concrete and project-relative when writing instructions for other agents.
