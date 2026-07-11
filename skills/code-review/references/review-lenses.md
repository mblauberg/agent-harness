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

### Design-principle probes, not verdicts

Use SOLID and related principles to generate hypotheses, never as standalone
findings:

- **Single responsibility/cohesion:** do state and behaviour that change for the
  same reason have one clear owner, or are policy and effects scattered?
- **Open/closed:** does a recurring extension require distributed conditionals,
  or would one proven seam remove them? Do not add an abstraction for a
  hypothetical extension.
- **Liskov substitution:** can each implementation preserve the caller-visible
  preconditions, postconditions, errors and invariants of its contract?
- **Interface segregation:** are clients forced to depend on methods, data or
  permissions they do not use, or is the interface small and deep?
- **Dependency inversion/information hiding:** does stable policy depend directly
  on volatile infrastructure detail, and does the proposed boundary actually
  hide complexity rather than relocate it?

Also test simplicity/YAGNI, duplication of knowledge rather than mere text,
coupling, idempotency, explicit state/invariants, failure atomicity,
concurrency/cancellation, observability and operational ownership. Report only
when evidence ties the principle to a present defect, regression or material
risk with a validation route.

## Verification

- Map acceptance criteria to tests, checks or inspected evidence.
- Prefer public-interface and integration-style coverage over implementation
  assertions.
- Check negative paths and regression coverage, not merely the happy path.
- Record the exact command and result. A claimed check without evidence is
  unknown, not passing.
- For delegated work, verify the trajectory: the worker ran the stated checks,
  used the permitted authority, and did not silently skip failed lanes.

## Generated and dependency surfaces

- Verify newly named packages, APIs, flags and platform features exist in the
  installed or authoritative version; generated-looking confidence is not proof.
- Inspect manifest and lockfile deltas for maintenance, licence, provenance and
  unexpected transitive or install-script risk when dependencies changed.
- Check for weakened, deleted, skipped or assertion-light tests; compatibility
  shims and comments must describe live behaviour, not an imagined migration.
- Record unsupported binary, generated, vendored or platform-specific surfaces
  as excluded/unknown rather than implying full coverage.

## Security and privacy overlay

Activate for changed trust, identity, data, execution, dependency or external
boundaries. Review both the delta and the unchanged enforcement path it relies
on; a secure-looking diff can still bypass a weak baseline.

- Trace untrusted input through parsing, validation, authorisation, effects,
  persistence, logging and output encoding.
- Separate authentication from object/action authorisation; test tenant,
  ownership, role and confused-deputy boundaries on every mutation path.
- Check secret sources, redaction, error/log/trace exposure, retention and
  least-privilege scope. Access to a credential is not authority to use it.
- Inspect injection, traversal, deserialisation, command/template/query
  construction, unsafe evaluation and generated-code execution boundaries.
- Verify dependency provenance, install scripts, integrity/lock state, licence
  and known-advisory evidence when the supply chain changes.
- For agents, include prompt/tool injection, memory poisoning, delegated
  permission inheritance, inter-agent payload validation, budget/circuit-break
  enforcement and human-trust overclaims.
- Require safe partial failure, idempotent retry where applicable, containment
  and audit evidence. Never label an untested threat surface secure.

## Optional overlays

Activate project and domain skills when relevant: language/type discipline,
frontend accessibility and performance, database/policy controls, security,
legal or financial authority boundaries, and release/rollback requirements.
