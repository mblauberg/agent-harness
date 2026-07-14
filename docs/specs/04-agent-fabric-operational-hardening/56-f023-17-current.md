
`intakes` and `intake_revisions` store an accepted-scope registry ID and closed
state. An accepted revision requires the one explicit registered
`acceptedScopeRef`; other states forbid one. Zero, multiple or quarantined
candidates are rejected; the runtime never chooses the first ref. Changing
accepted scope increments the project revision in the same transaction so
Project row/detail references cannot remain current.
