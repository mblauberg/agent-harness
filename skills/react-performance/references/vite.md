# React performance in Vite

Separate three different problems before changing code:

| Problem | Evidence | Typical route |
|---|---|---|
| Slow dev start/HMR/full reload | `vite --profile`, `vite --debug plugin-transform`, clean browser profile | expensive plugins/transforms, import fan-out, dependency optimisation, targeted warm-up |
| Large or slow production app | production build chunks, browser trace, Core Web Vitals | route/component dynamic imports, dependency replacement, asset strategy |
| React interaction/render cost | React DevTools Profiler and browser performance trace | state/effect ownership, subscriptions, compiler, expensive subtree |

Vite-specific rules:

- Measure with browser caching enabled; DevTools “Disable cache” distorts Vite
  startup and reload behaviour.
- Audit community plugin hooks before blaming React. `config`, `buildStart`,
  `resolveId`, `load` and `transform` can serialize expensive work.
- Avoid local barrel files that force Vite to fetch and transform an entire
  module fan-out. Confirm the fan-out in the request/transform trace.
- Use dynamic `import()` or lazy `import.meta.glob` for code not required on the
  initial route. Verify chunk and interaction behaviour in the production build.
- React Compiler is stable and supports Vite. Confirm whether the project uses
  it before adding manual component/value memoisation.
- Vite 8 uses Rolldown. Treat Vite 8.1 bundled dev mode as experimental and use
  it only for large-module-graph evidence; do not confuse faster development
  startup with a smaller or faster production application.

Sources: [Vite performance](https://vite.dev/guide/performance.html),
[Vite features](https://vite.dev/guide/features.html),
[Vite 8](https://vite.dev/blog/announcing-vite8),
[Vite 8.1](https://vite.dev/blog/announcing-vite8-1), and
[React Compiler](https://react.dev/learn/react-compiler).
