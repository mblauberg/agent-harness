## Summary

Describe the outcome and link the approved spec, issue or decision record.

## Revision under review

- Exact base branch and commit:
- Exact head branch and commit:

A later commit invalidates exact-head checks and independent review. Rerun both
against the new head.

## Risk and authority

- Risk tier:
- Authorised write scope:
- Prohibited or external actions:
- User gates still pending:

## Test evidence

- [ ] `scripts/check-harness`
- [ ] Fabric typecheck, tests and build (`npm run check`)
- [ ] Fabric evaluation (`npm run test:evaluation`), when applicable
- [ ] Fabric load evidence (`npm run test:load`), when applicable
- [ ] Production dependency audit

List exact commands, results and any unavailable or intentionally skipped gate.

## Current contract and cutover

- [ ] Current schema, protocol and configuration owners checked
- [ ] Any pre-release direct cutover, regeneration or reset path is recorded
- [ ] No legacy reader, compatibility bridge or historical-format promise was added
- [ ] Persistence or schema changes include migration preflight, rollback or forward-repair, and trigger or query-plan evidence as applicable
- [ ] Not applicable

## Security and operational evidence

- [ ] Authority, secret-disclosure and least-privilege boundaries reviewed
- [ ] Resource limits, failure behaviour and recovery evidence attached
- [ ] Live provider or daemon smoke evidence attached when runtime behaviour changed
- [ ] Not applicable

## Documentation and rollback

- [ ] Operator documentation reflects expected behaviour, not workstation state
- [ ] Rollback or forward-repair procedure is recorded
- [ ] Not applicable

## Independent review

- Reviewer role:
- Model family:
- Independence from authorship/implementation context:
- Exact head reviewed:
- Unresolved P0-P2 findings:

## Acceptance

State which machine gates pass and which user acceptance or release gates remain pending.
