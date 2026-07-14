# Pull-request checklist

## Scope

- [ ] PR maps to one approved work package or explicit vertical slice.
- [ ] Objective, non-goals and acceptance criteria are stated.
- [ ] Scope did not materially drift without a new decision.
- [ ] No unrelated cleanup is mixed in.

## Architecture

- [ ] Change follows the thin-kernel responsibility split.
- [ ] Provider-native capability is used where appropriate.
- [ ] No new universal workflow or duplicate scheduler was introduced.
- [ ] Simple work remains possible without a task graph.
- [ ] One source-surface owner is maintained.
- [ ] Architecture dependency tests pass.

## Authority and security

- [ ] Effective authority is no broader than the human envelope.
- [ ] Provider payload cannot widen permissions.
- [ ] Network and external effects remain denied where required.
- [ ] Secrets and credentials are correctly isolated.
- [ ] Worktree containment claims are test-backed.
- [ ] Untrusted content cannot grant authority.

## Lifecycle and loops

- [ ] Runtime and validator use the canonical lifecycle source.
- [ ] Invalid transitions fail before action.
- [ ] Verification precedes judgement.
- [ ] Repair loops are bounded.
- [ ] No-progress, expiry and cancellation are handled.
- [ ] Recovery resumes without skipping gates.

## Review

- [ ] Review requirement is derived and recorded.
- [ ] Reviewer independence is proven.
- [ ] Blocking findings contain anchor, mechanism, impact and validation.
- [ ] Required repairs were re-verified and re-reviewed.
- [ ] Review cost and result are recorded where applicable.

## Effects

- [ ] External mutations are represented as typed effects.
- [ ] Exact target, payload digest and preconditions are bound.
- [ ] Idempotency and ambiguity reconciliation are tested.
- [ ] The writing agent cannot merge or release without separate authority.

## Tests

- [ ] Clean supported install/build succeeds or baseline exception is explained.
- [ ] Focused tests pass.
- [ ] Full relevant tests pass.
- [ ] Generated artefacts are clean.
- [ ] Provider conformance tests pass where affected.
- [ ] Fault and recovery tests pass where affected.
- [ ] Security/adversarial tests pass where affected.
- [ ] Documentation and conformance matrix are updated.

## Simplification

- [ ] Superseded logic and documentation were deleted.
- [ ] Temporary compatibility has an owner, removal condition and test.
- [ ] Permanent context did not grow without necessity.
- [ ] No new top-level Skill was added without the admission criteria.
- [ ] The change is smaller than the behaviour it replaces or clearly enforces a necessary invariant.

## Evidence

- [ ] Current provider/model/effort lineage is recorded.
- [ ] Artefact and verification digests are bound.
- [ ] Degradations and unavailable checks are explicit.
- [ ] Human decisions and remaining effect authority are explicit.
- [ ] Final status is accurate.

## Human acceptance

- [ ] The PR summary explains user-visible and architectural impact.
- [ ] Risks and limitations are stated.
- [ ] Required human decision is clear.
- [ ] No merge, release or deployment is implied by implementation acceptance.
