---
paths:
  - "runtime/**"
---

# Runtime changes

- Preserve one authoritative transaction owner and fail-closed reconciliation.
- Add new behaviour through a bounded command handler and use-case-shaped store;
  do not add unrelated policy or SQL to the Fabric façade.
- Provider SDK types stay inside adapters. Console code depends on protocol
  projections, not runtime stores.
- Characterise crash, replay, stale generation, ambiguous effect and budget
  behaviour before moving a state transition.
- Before stable release, prefer direct cutover and delete the old path in the
  same approved tranche unless an evidenced compatibility waiver exists.
