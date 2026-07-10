# Vite 8: Rolldown and Oxc migration

Vite 8 replaces esbuild and Rollup with the Rust-based Rolldown bundler and Oxc
transformer.

- `build.rollupOptions` becomes `build.rolldownOptions`; `external` and
  `output.globals` retain their shape.
- The top-level `esbuild` option becomes `oxc`. JSX configuration is nested:

  ```js
  oxc: { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } }
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } }
  ```

  Old `jsxFactory` and `jsxFragment` are gone. `jsxInject` belongs under `oxc`;
  scope transforms with `oxc: { include, exclude }`.
- Rollup plugins still work because Rolldown implements its plugin API. Mark a
  build-only plugin `{ ...plugin(), enforce: 'post', apply: 'build' }`.
- For gradual migration, install `rolldown-vite`, import config from
  `'rolldown-vite'` instead of `'vite'`, stabilise, then move to `vite@8`.
- A framework pinned to older Vite may need a package-manager override, for
  example pnpm: `"pnpm": { "overrides": { "vite": "8.0.0" } }`.
- `@vitejs/plugin-react` uses Oxc by default; `plugin-react-swc` remains the SWC
  alternative.
