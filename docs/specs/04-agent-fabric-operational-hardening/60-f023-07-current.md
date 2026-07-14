
The current baseline enforces at most one non-terminal run per project
session, one exact current chair and no terminal lost or pending bridge. It has
an all-mode partial unique run index and a partial unique active-chair-lease
index. Run, current/predecessor chair-lease, task, required-message,
write/task-owner-lease, workstream and provider-action membership is current
only when it agrees with source truth; each valid change advances the affected
session membership and session revision exactly once. Inconsistent membership
or retirement state fails without mutation and requires explicit recovery; no
upgrade, backfill or automatic repair path is required.

Current startup and recovery fixtures reject zero-delivery messages,
expired or abandoned delivery, cancelled or degraded tasks, missing current
chair membership and superseded predecessor leases without mutation.

Clean accepted, cancelled or failed close, typed project stop and
chair-recovery abandon persist immutable bridge-retirement evidence in their
transaction. The retirement binding names the session/run, terminal
kind/reference, exact owner command or recovery and timestamp. It is admitted
only after terminal run/session state, revoked current chair
lease/capability and archived agent are rechecked. Child bridge rows move from
`active` to `none` with provider and capability fields cleared. A terminal
row may be retired only under the same proof; otherwise the operation fails
for explicit recovery. Startup excludes retired launched bridges and `none`
child bridges. After commit, supervision best-effort closes and removes
volatile transport/action/generation mappings; process crash already closes
those transports and cannot undo durable fences.
