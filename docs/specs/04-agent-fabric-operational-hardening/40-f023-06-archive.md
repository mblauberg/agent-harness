Transitions among active, visibility-degraded and exceptional session states
also CAS the affected run lifecycle and current chair-lease status, and crash
rollback exposes neither half. A work-admitting target requires exact active
required run and current-chair membership plus a live current-chair
capability. A lost launched-chair bridge blocks every generic departure until
its typed recovery custody commits or abandons the loss. Legacy imports bind
both memberships, and a forward-only migration repairs earlier task, message
and chair-lease membership dispositions plus session revisions idempotently.
Protocol parsing and projection distinguish a human decision from the closed
system-supersession disposition. Reopen may write the latter only while moving
a pending/deferred close gate to `superseded`; it never satisfies a gate,
acceptance receipt or consequential-operation authority check.
The disposition's cause is a closed `{kind, ref}` union, so an internal chair-
loss event is never mislabeled as an operator command and every reference names
an existing durable owner record.
Daemon dispatch checks the negotiated `gate-system-supersession.v1` result
feature before returning a gate carrying that arm. Old-client/new-daemon
fixtures prove read and dedupe replay fail with typed feature unavailability
and zero mutation, rather than failing later during client decode.
Gate create, human terminal resolution and reopen supersession update the gate
row, membership row and owning session membership/session revisions in one
transaction. Exact command replay returns the committed revisions without a
second increment; crash rollback exposes none of them.
