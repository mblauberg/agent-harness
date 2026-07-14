
Authority/allow-list history, profile, remote, normalised grant-child, draft,
reservation, binding, custody-resolution, operation-admission and exact
`(gate_id, operation_id)` foreign keys, indexes and triggers install in one
transaction in the fresh baseline. The operation-ID join is the only
`operation_gate_block` trigger. Binding/reservation
immutability, mapped state-transition, digest, positive-containment, live-
authority, same-run and global-revision triggers become live before the schema
version advances. Recovery is forward repair or verified restore under
section 7.
