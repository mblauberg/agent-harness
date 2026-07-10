# Current React and Next.js notes

Version-sensitive notes checked 10 July 2026. Confirm the installed versions
and current official docs before editing.

- [React Compiler](https://react.dev/learn/react-compiler) automatically
  memoises components and values. In compiled code, do not add blanket
  `memo`/`useMemo`/`useCallback`. Keep existing manual memoisation unless its
  removal is measured and tested; it can still be a deliberate escape hatch.
- [`useEffectEvent`](https://react.dev/reference/react/useEffectEvent) reads the
  latest committed values from Effect logic. It is not a general event handler,
  cannot be called during render or passed to other components/hooks, has a
  changing identity, and must not be used to hide genuinely reactive
  dependencies.
- [`cache`](https://react.dev/reference/react/cache) is for React Server
  Components and is invalidated for each server request. It is deduplication,
  not a durable cross-request cache. Non-primitive arguments use reference
  identity.
- [`<Activity>`](https://react.dev/reference/react/Activity) preserves hidden UI
  state/DOM and can pre-render likely content. Use it when preservation or
  preparation is worth the hidden DOM and lifecycle cost, not as a default
  conditional-rendering replacement.
- Next.js caching and rendering semantics depend on router and configuration.
  Read the current [production guide](https://nextjs.org/docs/app/guides/production-checklist),
  [`fetch`](https://nextjs.org/docs/app/api-reference/functions/fetch),
  [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache)
  and [lazy-loading guide](https://nextjs.org/docs/app/guides/lazy-loading)
  instead of relying on an older default.
- [`after`](https://nextjs.org/docs/app/api-reference/functions/after) moves
  bounded work after the response; it does not guarantee execution outside the
  platform duration and may still run after an unsuccessful response.
- [Vite 8](https://vite.dev/blog/announcing-vite8) uses Rolldown as its unified
  bundler. Diagnose Vite development slowness separately from React runtime or
  production bundle cost; the official [performance guide](https://vite.dev/guide/performance.html)
  documents plugin-transform debugging and CPU profiles. Experimental bundled
  dev mode in Vite 8.1 is an evidence-driven opt-in, not a default fix.
