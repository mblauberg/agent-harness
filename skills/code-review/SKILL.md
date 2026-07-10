---
name: code-review
description: Use when reviewing a pull request, commit, diff, patch, refactor, migration, or implementation for defects, regressions, maintainability, architecture, state/type boundaries, concurrency, or structural simplification — including "review this code", "audit this PR", "look beyond the diff", and deep code-quality review. Not for reproducing a known failure (diagnose) or an edit-authorised review/fix loop (implement).
---

# Code review

Review is source-read-only unless the user separately authorises fixes. A
reviewer may write compressed findings and traces only to an explicitly assigned
artifact directory. The diff is the entry point, not the boundary. Judge the
resulting system, not just changed lines.

## Review

1. Read project instructions and preserve the requested scope and output
   contract.
2. Establish the change intent from the spec, issue, tests, commit message, or
   user request. Mark unclear intent instead of inventing it.
3. Trace the affected dependency cone: full touched files, live callers and
   consumers, exports, canonical owners, tests, configuration, migrations,
   persistence boundaries, and generated artefacts.
4. Select review lenses from the task/risk profile. Correctness/spec alignment
   is mandatory; add security/privacy, data/concurrency,
   performance/reliability, tests, architecture, readability, UX/accessibility
   or operations only when activated by the dependency cone.
5. For substantial+ or comprehensive work, use 2–4 blind independent agents
   with distinct primary lenses and deliberate overlap on the riskiest
   invariant. Then run an anonymised claim challenge and a fresh reduction.
   Never rank prose or majority-vote findings.
6. Review the design delta. Look for duplicated ownership, scattered flags,
   nullable modes, casts hiding invariants, thin wrappers, parallel flows, and
   abstractions that add concepts without reducing complexity.
7. Ask whether a proven reframe could delete branches, state, layers, or
   duplicated flows. Size is a signal, never an automatic defect.
8. Check tests and verification against the acceptance criteria. Confirm the
   trajectory: relevant checks actually ran and their results are available.
9. Report only high-confidence, actionable findings. Return `clean` when there
   is no genuine defect.

Load [review-lenses.md](references/review-lenses.md) for the detailed inspection
questions, [multi-agent-review.md](references/multi-agent-review.md) for lens
fan-out/council reduction, and [finding-contract.md](references/finding-contract.md)
before writing findings.

## Boundaries

- `orchestrate` chooses reviewer topology, families, and waves. This skill
  defines what each reviewer inspects and the independence/reduction contract.
- `diagnose` owns reproduction and root cause for known broken behaviour.
- `tdd` owns authorised fixes. Do not mutate source during review.
- Artifact-only authority permits named outputs under the assigned run
  directory; it does not permit arbitrary repo-root scratch. Use the system
  temporary directory when no run directory exists. Never redirect a command
  over a wildcard/list that can include its own growing output, and keep
  captures bounded.
- Language, framework, UI, security, and project skills add specialised lenses;
  do not repeat their doctrine here.
- A structural alternative is blocking only when tied to a present defect or
  material regression with a demonstrably safer design and validation route.
  Attractive redesign alone is not a finding.
