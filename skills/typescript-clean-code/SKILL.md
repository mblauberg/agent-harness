---
name: typescript-clean-code
description: Use when writing or reviewing TypeScript/JavaScript — type-level modelling, tsconfig strictness, discriminated unions, error/null handling, async, and test structure. Bright-line rules beyond generic clean-code sense.
---

# TypeScript clean code

Generic clean-code sense (small functions, meaningful names, DRY, one-thing) is assumed. This skill carries only the TypeScript-specific, non-obvious, bright-line rules. See `references/typescript-patterns.md` for the worked examples behind each rule.

## Types

- **Model illegal states as unrepresentable.** Prefer a discriminated union over an object with optional fields + a boolean flag. `{ status: 'loading' } | { status: 'ok'; data: T } | { status: 'err'; error: E }`, not `{ loading; data?; error? }`.
- **`unknown`, never `any`.** `any` disables checking and spreads silently. Use `unknown` at boundaries and narrow. Ban `any` via lint; if unavoidable, isolate and comment why.
- **No type assertions to launder types.** `as` (and `as unknown as`) asserts a lie the compiler can't verify. Narrow with type guards / `in` / `typeof` / `instanceof`, or validate at the boundary (zod/valibot) so the type is *earned*, not asserted. `as const` and `satisfies` are fine.
- **Exhaustiveness via `never`.** In a switch over a union, a `default: assertNever(x)` (assigns to `never`) turns a missed case into a compile error when the union grows.
- **Derive, don't duplicate.** `type X = z.infer<typeof schema>`, `keyof`, `typeof`, mapped/`Pick`/`Omit`. One source of truth for each shape.
- **Prefer `type` for unions/functions/mapped types.** Use `interface` only for object shapes meant to be `extend`ed/merged.
- **Brand primitives that must not be interchanged.** `type UserId = string & { readonly __brand: 'UserId' }` stops passing an `OrderId` where a `UserId` is due.

## tsconfig (the config *is* the linter)

- `strict: true` is the floor, not the ceiling. Also turn on `noUncheckedIndexedAccess` (array/record access yields `T | undefined`), `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `useUnknownInCatchVariables` (on under `strict`).
- Treat the type-checker as a test suite: `tsc --noEmit` in CI is non-negotiable.

## Errors & null

- **`catch` binds `unknown`.** Narrow before use (`instanceof`, or a type guard) — don't touch `err.message` blind.
- **Wrap third-party/lower-layer errors** in your own error class and pass `{ cause: err }` (native, preserves the chain). Define error classes by how callers branch, not by origin.
- **Prefer `T | undefined` over `null`; don't return `null` for "none".** Return `[]` for empty collections; use a Result/union for expected failure. Reserve throwing for the truly exceptional. `?.` / `??` for safe access — not scattered `if (x == null)`.
- Never widen a function's return to include `null`/`undefined` "just in case" — that pushes a guard onto every caller.

## Async

- `await` every promise or explicitly `void` it — a floating promise swallows rejections. Enable `no-floating-promises`.
- Parallelise independent awaits with `Promise.all`; don't `await` in a loop when the iterations are independent.
- Type async functions `Promise<T>`; never mark a function `async` only to satisfy a caller.

## Tests

- Type behaviour with type-level tests where the types are the contract: `expectTypeOf` / `@ts-expect-error` on the cases that must *not* compile.
- Don't assert against `any`-typed mocks — a mistyped mock passes vacuously. Type mocks to the real interface.
- Structure Arrange-Act-Assert; one behaviour per test; test the public contract, not private shape. Vitest/Jest: prefer `toEqual`/`toStrictEqual` over deep manual field asserts.
