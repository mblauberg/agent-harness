# Review lenses

Use only the lenses relevant to the change. Follow evidence, not a fixed
checklist quota.

## Dependency cone

- Read each touched file in full where practical.
- Find live callers, consumers, re-exports, registrations and configuration.
- Identify the canonical owner of the changed behaviour or data.
- Trace persistence, network, queue, cache and generated-artifact boundaries.
- Check migrations, rollback compatibility and mixed-version operation.
- Read tests around the public behaviour, including sibling and integration
  tests that the diff did not touch.

Stop at the affected cone. Nearby pre-existing debt is in scope only when the
change depends on it, worsens it, or makes it newly dangerous.

## Correctness and failure

- What invariant must remain true before and after each operation?
- What happens on empty, duplicate, stale, malformed, partial and retried input?
- Can ordering, cancellation, timeout, concurrency or re-entry corrupt state?
- Are multi-step writes atomic? If not, what observable partial states exist?
- Are errors propagated with enough context, or silently converted to success?
- Does the change preserve public API, schema, protocol and behavioural
  compatibility?

## Ownership and structure

- Is logic placed with its canonical data or policy owner?
- Did the change create a second source of truth or duplicate an existing
  helper, flow, type or validation rule?
- Do new flags, optionals, casts or distributed conditionals represent a state
  machine that should be modelled explicitly?
- Does a wrapper or layer hide complexity, or merely move it?
- Can a reframe remove concepts, branches, layers or synchronisation points
  while preserving behaviour?
- Is the proposed simplification local enough to validate, or speculative
  redesign outside the dependency cone?

## Verification

- Map acceptance criteria to tests, checks or inspected evidence.
- Prefer public-interface and integration-style coverage over implementation
  assertions.
- Check negative paths and regression coverage, not merely the happy path.
- Record the exact command and result. A claimed check without evidence is
  unknown, not passing.
- For delegated work, verify the trajectory: the worker ran the stated checks,
  used the permitted authority, and did not silently skip failed lanes.

## Optional overlays

Activate project and domain skills when relevant: language/type discipline,
frontend accessibility and performance, database/policy controls, security,
legal or financial authority boundaries, and release/rollback requirements.
