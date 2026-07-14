
SQLite enforces at most one non-terminal coordination run per project session
in either mode and at most one `active` chair lease per run. Frozen predecessor
leases may coexist only inside a bounded takeover/recovery transaction; a
forward migration deterministically revokes non-current predecessors and
repairs their membership, but refuses ambiguous duplicate current runs. A
