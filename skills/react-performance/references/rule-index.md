# Rule index

Load only the category activated by measurements or the dependency cone. Files
are individually named under `../rules/` so one narrow rule need not load the
whole corpus.

| Signal | Rule prefix | Start with |
|---|---|---|
| Sequential requests or slow server response | `async-`, `server-` | `async-parallel.md`, `server-parallel-fetching.md`, `server-cache-react.md` |
| Large client/server bundle | `bundle-` | `bundle-barrel-imports.md`, `bundle-dynamic-imports.md`, `bundle-defer-third-party.md` |
| Duplicate client fetching or global listeners | `client-` | `client-swr-dedup.md`, `client-event-listeners.md` |
| Expensive or repeated React renders | `rerender-` | `rerender-derived-state-no-effect.md`, `rerender-dependencies.md`, `rerender-memo.md` |
| Hydration, DOM, SVG or paint cost | `rendering-` | `rendering-hydration-no-flicker.md`, `rendering-content-visibility.md` |
| Effect callback or lifecycle edge | `advanced-` | `advanced-effect-events.md`, `advanced-init-once.md` |

For Vite development and production-build signals, use [vite.md](vite.md).
Generic loop, collection and syntax micro-optimisations are intentionally not
catalogued: agents already know them, and they belong only in a proven hot path.
Security rules such as server-action authentication are correctness gates, not
optional performance advice.
