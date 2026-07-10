# React performance review

Select relevant lenses; do not manufacture micro-optimisation findings.

## Evidence

- Baseline and result use the same production build, route, data, device and
  network profile.
- Field data and user-visible latency outrank isolated render counts.
- Bundle, server, React and browser traces identify the claimed bottleneck.
- The change improves a declared metric beyond normal variance.

## Architecture and correctness

- Independent work starts together; real data dependencies remain explicit.
- Server/Client Component boundaries minimise shipped JavaScript and serialised
  data without moving secrets or privileged work to the browser.
- Server actions authenticate and authorise like public endpoints.
- Request-local deduplication, framework data caching, process-local caching
  and durable shared caches are not conflated.
- Cache keys include tenant/authorisation scope; retention and invalidation are
  explicit.

## Rendering and bundles

- State is not derived through Effects when render-time derivation suffices.
- Manual memoisation is supported by profiling and accounts for React Compiler.
- Lazy loading removes initial work rather than creating interaction jank or a
  new request waterfall.
- Hydration fixes preserve semantic HTML, accessibility and error visibility.
- Large dependencies and barrel imports are verified in the actual bundle.

## Completion

- Relevant tests, typecheck and production build pass.
- Core Web Vitals or product thresholds have not regressed.
- The report states trade-offs, measurement gaps and rollback path.
