# Command routing

Load the named reference whenever a command is invoked.

| Command | Category | Purpose | Reference |
|---|---|---|---|
| `craft [feature]` | Build | Shape, then build end-to-end | [craft](craft.md) |
| `shape [feature]` | Build | Plan UX/UI before code | [shape](shape.md) |
| `teach` | Build | Set up PRODUCT.md and DESIGN.md | [teach](teach.md) |
| `document` | Build | Generate DESIGN.md from code | [document](document.md) |
| `extract [target]` | Build | Extract reusable tokens/components | [extract](extract.md) |
| `polish [target]` | Refine | Final pre-ship quality pass | [polish](polish.md) |
| `bolder [target]` | Refine | Amplify a safe or bland design | [bolder](bolder.md) |
| `quieter [target]` | Refine | Reduce aggression or stimulation | [quieter](quieter.md) |
| `distill [target]` | Refine | Remove complexity to the essence | [distill](distill.md) |
| `harden [target]` | Refine | Handle errors, i18n and edge cases | [harden](harden.md) |
| `onboard [target]` | Refine | First-run, empty and activation flows | [onboard](onboard.md) |
| `animate [target]` | Enhance | Add purposeful motion | [animate](animate.md) |
| `colorize [target]` | Enhance | Add strategic colour | [colorize](colorize.md) |
| `typeset [target]` | Enhance | Improve type hierarchy and fonts | [typeset](typeset.md) |
| `layout [target]` | Enhance | Fix spacing, rhythm and hierarchy | [layout](layout.md) |
| `delight [target]` | Enhance | Add personality | [delight](delight.md) |
| `overdrive [target]` | Enhance | Push beyond conventional limits | [overdrive](overdrive.md) |
| `clarify [target]` | Fix | Improve labels, copy and errors | [clarify](clarify.md) |
| `adapt [target]` | Fix | Adapt devices and screen sizes | [adapt](adapt.md) |
| `live` | Iterate | Generate browser-selected variants | [live](live.md) |

## Owner boundaries

- `scope` owns the approved task brief and consequential design decisions;
  `shape` supplies the frontend discovery method.
- `implement` owns every source-changing command, deterministic verification,
  independent review and user-acceptance handoff.
- `engineering-docs` owns PRODUCT/DESIGN artifact placement, indexing and
  archival; `teach` and `document` supply domain extraction and interview steps.
- This skill's own [review branch](review.md) owns read-only UX,
  accessibility, responsive and visual findings; `code-review` owns
  general source-diff review. This command set has no competing critique or
  audit route.
- `react-performance` owns measured React, bundle, hydration and Web Vitals
  diagnosis. Design changes compose only after that evidence identifies a fix.

## Lookup data

`../data/` contains CSVs for 67 UI styles, 96 colour palettes, 57 font
pairings and 25 chart types. Consult them during `colorize`, `typeset`, `craft`
or `shape`, then adapt candidates under the core laws rather than copying them
verbatim. Do not confuse this with the prose `reference/` directory these
command files live in — `reference/` (singular-first, prose) and `data/`
(lookup tables) are distinct.

## Dispatch

- No argument: show this table grouped by category and ask what to do.
- A known first word selects its reference; remaining words are the target.
- An unknown first word is general design context.

Setup and register selection have already run. Commands do not recursively
invoke the parent skill. If missing context blocks `craft`, route the context
artifact through `engineering-docs` using the `teach` method, reload, then
resume through `shape`.
