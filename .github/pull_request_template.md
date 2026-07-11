## Summary

Describe the outcome and link the approved spec, issue or decision record.

## Risk and authority

- Risk tier:
- Authorised write scope:
- Prohibited or external actions:
- Human gates still pending:

## Test evidence

- [ ] `scripts/check-harness`
- [ ] Fabric typecheck, tests and build (`npm run check`)
- [ ] Fabric evaluation (`npm run test:evaluation`), when applicable
- [ ] Fabric load evidence (`npm run test:load`), when applicable
- [ ] Production dependency audit

List exact commands, results and any unavailable or intentionally skipped gate.

## Migration, schema and compatibility evidence

- [ ] Migration preflight, rollback/restore path and query-plan evidence attached
- [ ] Generated schema drift and compatibility pins checked
- [ ] Historical formats remain readable or have an approved migration
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

- Reviewer and model family:
- Independence from authorship/implementation context:
- Unresolved P0-P2 findings:

## Acceptance

State which machine gates pass and which human acceptance or release gates remain pending.
