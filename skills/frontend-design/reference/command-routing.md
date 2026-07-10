# Command routing

Load the named reference whenever a command is invoked.

| Command | Category | Purpose | Reference |
|---|---|---|---|
| `craft [feature]` | Build | Shape, then build end-to-end | [craft](craft.md) |
| `shape [feature]` | Build | Plan UX/UI before code | [shape](shape.md) |
| `teach` | Build | Set up PRODUCT.md and DESIGN.md | [teach](teach.md) |
| `document` | Build | Generate DESIGN.md from code | [document](document.md) |
| `extract [target]` | Build | Extract reusable tokens/components | [extract](extract.md) |
| `critique [target]` | Evaluate | Heuristic UX review | [critique](critique.md) |
| `audit [target]` | Evaluate | Accessibility, performance, responsive checks | [audit](audit.md) |
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
| `optimize [target]` | Fix | Diagnose and fix UI performance | [optimize](optimize.md) |
| `live` | Iterate | Generate browser-selected variants | [live](live.md) |

## Lookup data

`../references/` contains CSVs for 67 UI styles, 96 colour palettes, 57 font
pairings and 25 chart types. Consult them during `colorize`, `typeset`, `craft`
or `shape`, then adapt candidates under the core laws rather than copying them
verbatim.

## Dispatch

- No argument: show this table grouped by category and ask what to do.
- A known first word selects its reference; remaining words are the target.
- An unknown first word is general design context.

Setup and register selection have already run. Commands do not recursively
invoke the parent skill. If missing context blocks `craft`, finish `teach`,
reload, then resume the original command through `shape`.

## Pin and unpin

`pin <command>` creates `$<command>` as a standalone shortcut;
`unpin <command>` removes it from every harness directory in the project.

```bash
node "${AGENTS_HOME:-$HOME/.agents}/skills/frontend-design/scripts/pin.mjs" <pin|unpin> <command>
```

Accept any command in the table. On success, report the result and confirm the
shortcut; on error, relay stderr verbatim.
