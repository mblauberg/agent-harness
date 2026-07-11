---
name: react-performance
description: "Use for measuring or improving React rendering, hydration, bundles, waterfalls, Server Components, or Core Web Vitals. Not for general UI design, TanStack cache semantics, or Vite config; use the matching specialist."
---

# React performance

Improve measured user or server outcomes without trading away correctness,
security, accessibility or maintainability. It covers shared React behaviour,
Next.js server/rendering boundaries and Vite build/runtime performance. Confirm
installed versions, router, runtime and React Compiler status before using
version-sensitive APIs.

## Priority order

1. **Measure the real path.** Reproduce in a production build. Use field Core
   Web Vitals where available, then browser traces, React DevTools Profiler,
   bundle analysis and server timings. Do not optimise from render counts alone.
2. **Remove waits and bytes.** Start independent work together, move fetches to
   route/server boundaries, stream deliberate Suspense regions, shrink client
   boundaries, and lazy-load code that is not needed for the initial path.
3. **Fix ownership.** Keep request data isolated, authenticate server actions,
   minimise serialised props, and distinguish request-local deduplication from
   persistent or cross-request caching.
4. **Reduce rendering work.** Remove state derived through Effects, narrow
   subscriptions, keep transient values out of state, and profile expensive
   subtrees. With React Compiler enabled, prefer its automatic memoisation;
   retain or add manual `memo`, `useMemo` and `useCallback` only with evidence.
5. **Tune hot code last.** Only retain a micro-optimisation when a trace or
   benchmark proves that exact path is material.

## Workflow

- Record baseline, device/network profile, route or interaction, and target
  metric. Identify whether the bottleneck is network, server, JavaScript,
  render, layout/paint, memory or development-only tooling.
- Read [current-platform.md](references/current-platform.md), then select only
  relevant detailed rules through [rule-index.md](references/rule-index.md).
- For Vite, use [vite.md](references/vite.md); for version-specific Vite 8
  configuration, load `web-stack-conventions` rather than duplicating it here.
- When edits are authorised, use `implement` and apply `tdd` to behaviour
  changes. Use `tanstack-query` for React Query server state,
  `web-stack-conventions` for Lighthouse/WCAG version deltas, and
  `frontend-design` when measured performance work affects UX/accessibility.
- Re-measure under the same conditions. Reject improvements that merely move
  work, weaken freshness/authentication, or improve synthetic data while field
  behaviour regresses.
- Review with [review-checklist.md](references/review-checklist.md). Report the
  before/after evidence, trade-offs and any unmeasured residual risk.

The detailed rules are adapted material; provenance and licence terms are in
[NOTICE.md](NOTICE.md) and [LICENSE](LICENSE). Current primary sources are
indexed in [sources.md](references/sources.md).
