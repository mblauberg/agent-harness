---
name: typescript-clean-code
description: Use when writing or reviewing TypeScript/JavaScript — type-level modelling, tsconfig strictness, discriminated unions, error/null handling, async, and test structure. Bright-line rules beyond generic clean-code sense.
---

# TypeScript clean code

Generic clean-code sense is assumed. Apply these TypeScript-specific rules. See
`references/typescript-patterns.md` for worked examples.

## Types

- **Make illegal states unrepresentable.** Prefer a discriminated union to
  optional fields plus a flag.
- **`unknown`, never `any`.** Use `unknown` at boundaries and narrow. Ban `any`
  via lint; if unavoidable, isolate and explain it.
- **Do not launder types with assertions.** Narrow with guards, `in`, `typeof`
  or `instanceof`, or validate boundaries. Avoid `as` and `as unknown as`;
  `as const` and `satisfies` are fine.
- **Enforce exhaustiveness with `never`.** Use `default: assertNever(x)` for
  union switches.
- **Derive, do not duplicate.** Use `z.infer`, `keyof`, `typeof`, mapped types,
  `Pick` or `Omit`; keep one source for each shape.
- **Prefer `type` for unions/functions/mapped types.** Use `interface` only for object shapes meant to be `extend`ed/merged.
- **Brand primitives that must not be interchanged**, such as `UserId` and
  `OrderId`.

## tsconfig

- Require `strict`, `noUncheckedIndexedAccess` (indexed access can be
  undefined), `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch` and
  `useUnknownInCatchVariables`.
- Run `tsc --noEmit` in CI.

## Errors & null

- **`catch` binds `unknown`.** Narrow before accessing it.
- Wrap lower-layer errors in caller-meaningful classes with `{ cause: err }`.
- Prefer `T | undefined` to `null`; return `[]` for empty collections and a
  Result/union for expected failure. Throw only for exceptional cases. Prefer
  `?.` and `??` to scattered null checks.
- Never widen a function's return to include `null`/`undefined` "just in case" — that pushes a guard onto every caller.

## Async

- `await` every promise or explicitly `void` it — a floating promise swallows rejections. Enable `no-floating-promises`.
- Parallelise independent awaits with `Promise.all`; don't `await` in a loop when the iterations are independent.
- Type async functions `Promise<T>`; do not add `async` only for a caller.

## Tests

- Test type contracts with `expectTypeOf` and `@ts-expect-error` for cases that
  must not compile.
- Type mocks to real interfaces; `any`-typed mocks pass vacuously.
- Use Arrange-Act-Assert, one public behaviour per test, and prefer
  `toEqual`/`toStrictEqual` to manual field assertions.
