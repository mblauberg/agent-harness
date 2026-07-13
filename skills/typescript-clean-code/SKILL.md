---
name: typescript-clean-code
description: "Use as a TypeScript or JavaScript correctness lens for type modelling, strictness, null/error boundaries, async ownership, and tests. Not a lifecycle owner or reason to rewrite stable conventions; combine with the task owner."
---

# TypeScript clean code

Generic clean-code sense is assumed. Apply these TypeScript-specific rules. See
`references/typescript-patterns.md` for worked examples.

## Types

- **Make illegal states unrepresentable.** Prefer a discriminated union to
  optional fields plus a flag.
- **Prefer `unknown` to `any`.** Narrow unknown input. Isolate and explain `any`
  required by untyped interop, compatibility work or deliberate escape hatches.
- **Do not launder types with assertions.** Narrow with guards, `in`, `typeof`
  or `instanceof`, or validate boundaries. Avoid `as` and `as unknown as`;
  `as const` and `satisfies` are fine.
- **Enforce exhaustiveness with `never`.** Use `default: assertNever(x)` for
  union switches.
- **Derive, do not duplicate.** Use `z.infer`, `keyof`, `typeof`, mapped types,
  `Pick` or `Omit`; keep one source for each shape.
- Use `type` for unions/functions/mapped types and follow the repository's
  established `type`/`interface` convention for object shapes.
- **Brand primitives that must not be interchanged**, such as `UserId` and
  `OrderId`.

## tsconfig

- Target `strict`, `noUncheckedIndexedAccess` (indexed access can be
  undefined), `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch` and
  `useUnknownInCatchVariables`. For an existing codebase, stage flags with an
  explicit migration and no silent public-type changes.
- Run `tsc --noEmit` in CI.

## Errors & null

- **`catch` binds `unknown`.** Narrow before accessing it.
- Wrap lower-layer errors in caller-meaningful classes with `{ cause: err }`.
- Prefer the repository/API convention for `null` versus `undefined`; do not
  churn a stable boundary for taste alone. Return `[]` for empty collections and a
  Result/union for expected failure. Throw only for exceptional cases. Prefer
  `?.` and `??` to scattered null checks.
- Never widen a function's return to include `null`/`undefined` "just in case"; that pushes a guard onto every caller.

## Async

- Give every promise an owner and rejection path. Await it, return it, supervise
  it in a task group/queue, or use `void task().catch(report)`. A bare `void`
  only acknowledges a linter; it does not handle rejection. Enable
  `no-floating-promises` with project-appropriate options.
- Parallelise only independent work within measured socket, memory, rate-limit,
  cancellation and failure-aggregation bounds. `Promise.all` suits a small
  fixed set; use a bounded pool/queue for large collections and deliberate
  sequential awaits when ordering or backpressure matters.
- Type async functions `Promise<T>`; do not add `async` only for a caller.

## Tests

- Test type contracts with `expectTypeOf` and `@ts-expect-error` for cases that
  must not compile.
- Type mocks to real interfaces; `any`-typed mocks pass vacuously.
- Use Arrange-Act-Assert, one public behaviour per test, and prefer
  `toEqual`/`toStrictEqual` to manual field assertions.
