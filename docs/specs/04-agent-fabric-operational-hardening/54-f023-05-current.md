
The current `artifacts` table is the one evidence metadata registry while all
bytes remain with their existing owners. Its closed columns are exactly
`project_id`, nullable `project_session_id`/`run_id`/`task_id`, publisher
kind and ref, source kind, evidence kind, canonical prefixed SHA-256, registry
state, quarantine reason and positive revision. Active
source/scope/path/digest are immutable. Partial unique indexes enforce one
project-, session- or run-scoped identity. `project-file`, `run-file` and
`git-private-diff` have disjoint CHECK shapes and producer-owned namespaces.
Evidence projection reads only active rows and takes kind, revision, ref and
provenance from this registry rather than hard-coding them.

The `artifacts` table declares exact `UNIQUE(artifact_id, revision)` in
addition to its `artifact_id` primary key. Every immutable evidence child in
section 9.23 uses that exact two-column registration revision as its SQLite
foreign-key parent, so a child cannot cite a revision merely because the
artifact ID exists.
