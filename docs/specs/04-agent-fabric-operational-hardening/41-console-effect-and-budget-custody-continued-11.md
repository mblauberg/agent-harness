
Every takeover and chair-bridge recovery transaction that increments chair
generation also revokes the predecessor chair lease, abandons its membership
with `chair-takeover` or `chair-bridge-recovery`, inserts the successor as the
sole active required lease member and advances the session membership revision.
No superseded chair lease remains frozen after the atomic successor commit.
Generic membership target/disposition validation recognises write, chair and
task-owner lease tables with exact session/run binding.

Deterministic verification additionally covers arbitrary/stale/cross-session
acceptance references, non-human and wrong-operation gates, typed and native
confirmation arms, multi-run terminal history, close/reopen preservation,
post-reopen work with old-reference rejection and fresh-gate acceptance,
takeover and bridge-recovery crash rollback, and released/revoked membership
validation for all three lease owners.

### 9.19 Terminal bridges, singleton topology and multi-session operation
