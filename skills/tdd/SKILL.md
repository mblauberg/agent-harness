---
name: tdd
description: Use when implementing any feature, bugfix, refactor, or behavior change, before writing implementation code — "write a test", "TDD this", red-green-refactor. Covers vertical slices, integration-style tests through public interfaces, and mocking at boundaries.
---

# Test-Driven Development

Write the test first. Watch it fail. Write the minimal code to pass. Refactor.

**Core principle:** if you didn't watch the test fail, you don't know it tests the right thing.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? Delete it and start fresh — don't keep it "as reference", don't adapt it while writing the test. Reconstruct it from the test. This holds for features, bugfixes, and behavior changes alike. Deliberate exceptions (throwaway spikes, generated code, config) are fine; "just this once" under pressure is not.

## Red–Green–Refactor

**RED — write one failing test.** One behavior, a name that reads like a spec ("user can checkout with valid cart"), exercising real code through its public interface. Run it. Confirm it fails *for the right reason* — the behavior is missing, not a typo or import error. A test that passes immediately is testing something that already exists; sharpen it.

**GREEN — minimal code to pass.** The simplest thing that turns the test green. No extra options, no speculative parameters, no "while I'm here". Run the test and the rest of the suite; everything green, output clean.

**REFACTOR — clean up on green.** Remove duplication, improve names, deepen modules. Never refactor while red — get to green first, then tidy with the tests as a net.

## Vertical slices, not horizontal

**Do not write all the tests, then all the code.** That "horizontal slicing" produces tests of *imagined* behavior — you test the shape of things (signatures, data structures) instead of what the system does, and commit to a structure before you understand it.

Go **vertical**: one test → its implementation → repeat. Each cycle responds to what the last one taught you.

```
WRONG (horizontal):  test1..test5, then impl1..impl5
RIGHT (vertical):    test1→impl1, test2→impl2, test3→impl3, ...
```

Start with a **tracer bullet**: one test proving the path works end to end. Then loop, one behavior at a time. You can't test everything — favour critical paths and complex logic over exhaustive edge cases.

## Test behavior, not implementation

Good tests are **integration-style**: they run real code paths through public APIs and describe *what* the system does, so they survive refactors. Bad tests couple to *how* — they mock internal collaborators, reach into private methods, or verify through side channels (querying the DB directly instead of through the interface). The tell: the test breaks when you refactor but behavior hasn't changed. See [tests.md](tests.md) for good/bad examples.

## Mocking

Mock only at **system boundaries** — external APIs, time, randomness, sometimes the database or filesystem. Never mock your own classes or internal collaborators; if you feel you must, the design is too coupled — inject dependencies instead. See [mocking.md](mocking.md).

## Design for testability

Hard-to-test code is usually hard-to-use code — listen to it.
- Accept dependencies, don't construct them internally ([interface-design.md](interface-design.md)).
- Prefer returning results over side effects.
- Aim for **deep modules**: small interface, substantial implementation ([deep-modules.md](deep-modules.md)).
- After green, scan for [refactor candidates](refactoring.md).

## Per-cycle checklist

```
[ ] Test describes behavior, not implementation
[ ] Test uses the public interface only
[ ] Watched it fail for the right reason
[ ] Minimal code to pass — nothing speculative
[ ] Whole suite green, output clean
[ ] Would survive an internal refactor
```

## Bug fixes

Reproduce the bug as a failing test first, watch it fail, then fix. The test proves the fix and guards against regression. Never fix a bug without one.
