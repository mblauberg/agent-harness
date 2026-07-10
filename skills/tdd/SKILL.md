---
name: tdd
description: Use when writing the first failing test for a feature, bugfix, refactor, or behaviour change — "write a test", "TDD this", red-green-refactor. Covers vertical slices, public-interface tests and boundary mocking. Not the end-to-end delivery owner; use implement when verification, review, repair and human acceptance are also requested.
---

# Test-driven development

```text
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

If production code came first, delete it and reconstruct it from the test; do
not retain it as reference. This applies to features, bug fixes and behaviour
changes. Deliberate throwaway prototypes, generated code and configuration may
use an explicitly recorded exception; deadline pressure is not one.

## Red -> green -> refactor

1. **Red:** write one test for one observable behaviour through the public
   interface. Name it like a specification. Run it and confirm it fails because
   the behaviour is missing, not from setup, import or typo. A test that passes
   immediately needs sharpening.
2. **Green:** write only the simplest production change that passes. Avoid
   speculative options and unrelated cleanup. Run the focused test and whole
   suite; output must be clean.
3. **Refactor:** only while green, remove duplication, improve names and deepen
   modules. Rerun tests after each structural step.

Work vertically: test -> implementation -> repeat. Start with one tracer bullet
through the full path, then add behaviours from what each cycle reveals. Never
write an imagined horizontal test batch before implementation. Prioritise
critical paths and complex logic.

## Test boundaries

Test what callers observe, not private methods, internal call order or data
shape. A valid test survives an internal refactor. Verify outcomes through the
public interface rather than querying side channels. See [tests.md](tests.md).

Mock only system boundaries: external APIs, time/randomness and, when needed,
filesystem/database. Never mock owned internal collaborators to make a test
pass; inject a narrow boundary instead. See [mocking.md](mocking.md) and
[interface-design.md](interface-design.md).

Hard-to-test code is design evidence: accept dependencies, return results
instead of hiding effects, and prefer deep modules with small interfaces. On
green, use [deep-modules.md](deep-modules.md) and
[refactoring.md](refactoring.md); do not smuggle redesign into green.

## Cycle gate

Before the next behaviour confirm: public observable contract; witnessed
right-reason failure; minimal passing code; focused and broader checks green;
no dirty output; and resilience to internal refactoring.

For a bug, first reproduce the exact failure as the regression test, watch it
fail, then repair and watch it pass. If no correct seam reaches the bug, route
to `diagnose`; do not bless a shallow test. `implement` owns independent review,
repair loops, documentation and human acceptance.
