
Migration 0010 rebuilds `artifacts` as the one evidence metadata registry while
leaving all bytes with their existing owners. Additive closed columns are exact
`project_id`, nullable `project_session_id`/`run_id`/`task_id`, publisher kind
and ref, source kind, evidence kind, canonical prefixed SHA-256, registry state,
quarantine reason and positive revision. Active source/scope/path/digest are
immutable. Partial unique indexes enforce one project-, session- or run-scoped
identity. `project-file`, `run-file` and `git-private-diff` have disjoint CHECK
shapes and producer-owned namespaces. Evidence projection reads only active
rows and takes kind, revision, ref and provenance from this registry rather
than hard-coding them.

The squashed baseline `artifacts` table declares exact
`UNIQUE(artifact_id, revision)` in addition to its `artifact_id` primary key.
That apparently redundant composite key is mandatory: every immutable evidence
child in section 9.23 uses the exact two-column registration revision as a
SQLite foreign-key parent. A child can never cite a revision value merely
because the artifact ID exists.
