
SQLite enforces at most one non-terminal coordination run per project session
in either mode and at most one `active` chair lease per run. Frozen predecessor
leases may coexist only inside a bounded takeover/recovery transaction. At
commit every non-current predecessor is revoked and its membership agrees with
the current lease; ambiguous duplicate current runs are rejected without
mutation. A
