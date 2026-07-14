
Migration 0013 is forward-only. Its preflight rejects more than one
non-terminal run per project session, a missing/ambiguous current chair, or a
terminal lost/pending bridge; it never edits migrations 0001–0012. It installs
an all-mode partial unique run index and a partial unique active-chair-lease
index. It re-derives run/current-and-predecessor chair lease, task,
required-message, write/task-owner lease, workstream and provider-action
membership from source truth, updates each changed membership, and advances
each affected session membership/session revision exactly once. Upgrade and
restart fixtures cover zero-delivery messages, expired/abandoned delivery,
cancelled/degraded tasks, missing current chair membership and superseded
predecessor leases.

Clean accepted/cancelled/failed close, typed project stop and chair-recovery
abandon persist immutable bridge-retirement evidence in their transaction.
The retirement binding names the session/run, terminal kind/reference, exact
owner command or recovery and timestamp. It is admitted only after terminal
run/session state, revoked current chair lease/capability and archived agent
are rechecked. Child bridge rows move from `active` to `none` with provider and
capability fields cleared. Existing terminal rows are backfilled only under the
same proof; otherwise migration fails for explicit recovery. Startup excludes
retired launched bridges and `none` child bridges. After commit, supervision
best-effort closes and removes volatile transport/action/generation mappings;
process crash already closes those transports and cannot undo durable fences.
