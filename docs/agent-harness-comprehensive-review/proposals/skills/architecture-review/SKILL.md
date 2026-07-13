---
name: architecture-review
description: Use when architectural boundaries, coupling, change amplification or a deep refactor direction need read-only analysis and competing designs. Not for a small known cleanup, ordinary diff review or an already approved implementation.
---

# Architecture review

Map the current system and recommend an evidence-backed target architecture
without making permanent source changes.

## Method

1. **Frame the pressure.** State the outcome, constraints, failure symptoms,
   affected users, stability status and known consumers. Distinguish structural
   debt from missing behaviour.
2. **Map the system.** Identify domains, ownership, entry points, state,
   side-effect boundaries, dependencies, runtime topology, tests and operational
   constraints. Use a diagram when it improves a decision.
3. **Measure change amplification.** Locate large or mixed-responsibility
   modules, dependency cycles, duplicated policy, broad public surfaces,
   transitional layers, weak seams and data that lacks a clear owner.
4. **Explore candidates.** Develop two to four materially different designs.
   Include the smallest credible change, the recommended design and at least one
   rejected alternative. Prefer deep modules, information locality and deletion.
5. **Test the design.** Define interface, dependency, behaviour, migration,
   recovery and deletion tests. For pre-release systems with no evidenced
   consumers, prefer direct replacement over compatibility scaffolding.
6. **Recommend and scope.** Explain trade-offs, migration sequence, risks,
   reversible steps and one-way doors. Produce the proposed ADR/spec changes and
   the smallest coherent implementation tranche.

## Required outputs

- current architecture and pressure map;
- candidate comparison;
- recommended target diagram;
- module/interface ownership;
- deletion and compatibility decision;
- verification and migration plan;
- open human decisions and recommended defaults.

## Boundaries

Remain read-only unless the human separately approves implementation. Do not
treat elegance, model agreement or line count as proof. Use tests, dependency
facts, operational evidence and named consumers. Route an approved change to
`scope`, then `implement` with `refactor` as the method where behaviour is
preserved.
