# Current primary sources

Checked 10 July 2026. Prefer installed-version documentation and measured
project evidence over generic rules.

## React

- [React Compiler](https://react.dev/learn/react-compiler) — stable automatic
  memoisation, supported build tools and incremental adoption.
- [`<Profiler>`](https://react.dev/reference/react/Profiler) — render-duration
  measurement; pair it with browser and field evidence.
- [`useTransition`](https://react.dev/reference/react/useTransition) — pending
  state, interruption and explicit async ordering limits.
- [`useEffectEvent`](https://react.dev/reference/react/useEffectEvent) —
  Effect-only latest values and changing identity.
- [`cache`](https://react.dev/reference/react/cache) and
  [`<Activity>`](https://react.dev/reference/react/Activity) — current server
  deduplication and hidden/pre-rendered UI semantics.

## Next.js

- [Production guide](https://nextjs.org/docs/app/guides/production-checklist)
- [Package bundling](https://nextjs.org/docs/pages/guides/package-bundling)
- [`fetch`](https://nextjs.org/docs/app/api-reference/functions/fetch),
  [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache),
  [`after`](https://nextjs.org/docs/app/api-reference/functions/after), and
  [lazy loading](https://nextjs.org/docs/app/guides/lazy-loading)

## Vite

- [Performance guide](https://vite.dev/guide/performance.html) and
  [features](https://vite.dev/guide/features.html)
- [Vite 8](https://vite.dev/blog/announcing-vite8) and
  [Vite 8.1](https://vite.dev/blog/announcing-vite8-1)

`web-stack-conventions` owns current Lighthouse/WCAG/Vite configuration deltas;
this skill owns React-specific diagnosis and optimisation decisions.
