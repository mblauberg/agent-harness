
Cancelled or failed close owns only `draft`, `awaiting_launch`,
`launch_failed` and `awaiting_acceptance`. The last source supersedes all final-
close gates before the closure predicate; pending/deferred memberships become
abandoned and human-resolved history stays reconciled. Active/quiescing stop,
launch ambiguity, lost-chair recovery and quarantine remain with their typed
owners. Recovery-abandon rejects any unrelated active membership or durable
source obligation, then abandons exactly the current run/lease memberships,
revokes all run capabilities, archives agents, retires bridges and increments
membership revision once with crash rollback.

Launched-chair graceful replacement has a distinct live-handoff custody. Its
prepare/dispatch/observe/commit state is generation-bound and promotes only an
already retained successor child bridge under the same provider contract.
Generic chair takeover rejects both active and lost launched-chair rows; lost
rows use recovery custody. No path can leave the durable launched bridge naming
the predecessor while the run names the successor.

The recovery supervisor enumerates retained bridge keys globally but fences
each exact project-session/run/revision in its own SQLite transaction. One
corrupt or unavailable session reports typed recovery evidence without rolling
back a sibling session already fenced. Retries are idempotent per stable loss
ID.

`workstreams.v1` owns the chair-authenticated coordinated-workstream create and
terminal-state operations described by Spec 01. The daemon transaction binds
the root task/team, narrowed authority/budget, resource scope, workstream and
membership and proves that no second chair/run was created. Operator
projection includes `projectSessionId` in every run reference, summary and
detail. The Console retains its project-scoped client, opens a secondary exact
selected-session client, auto-selects only one attachable session and otherwise
requires an explicit stable session choice; it never discards project-level
authority needed to start another independent session.

`run-session-projection.v1` is a closed result-shape feature for operator
snapshot, projection-page, view-page and detail-read results. When negotiated,
every returned run projection and every run row summary/reference/detail
contains the same exact `projectSessionId`; missing or mixed presence rejects
the whole result before the client consumes it. When unnegotiated those fields
are omitted from the generic protocol shape. The pre-release Console requires
the feature during initialise and performs no retry or identity
inference. A peer that cannot negotiate it is explicitly incompatible.

### 9.20 Provider-budget custody and Console decision projections

The current baseline gives each task-bound ephemeral provider action an
immutable authority, task and canonical JSON reservation/settlement vector.
Each vector key is a recognised qualified unit; the settlement value is an
exact non-negative amount or the closed `unknown` marker, and action custody is
`reserved | settled | usage-unknown`. SQLite
triggers validate same-run authority/task ownership, non-terminal task state,
available `granted - reserved - consumed` capacity and complete vector shape,
then couple every insert/state transition to `authority_budget`. They reject
direct contradictory writes, rebinding, reversal, status mismatch, negative
capacity and task terminal transition while a bound action remains open.

Fabric injects default `maxTurns: 1` for ordinary one-shot work before hashing
or dispatch. Certifying review is the closed exception owned by the resolved
target profile: direct-portal Claude/Codex may reserve up to 128 SDK turns and
112 portal calls/10 MiB, preserving 16 planning/final turns, while portal-helper
Cursor/Agy reserve one Fabric turn plus at most 128 instrumented helper calls/10
MiB. Both reserve the exact at-most-80-read/6-MiB mandatory set plus 32 direct
or 48 helper exploration calls/4 MiB. An adapter
that cannot enforce or reach them advertises
certifying-review-packet-only.v1 false.
The custody reserves `turns`, `review_read_ops`, `review_read_bytes`, one `provider_calls` and one
`concurrent_turns` when configured, plus each delegated cost,
provider-qualified token and wall-clock dimension. It does not debit unrelated
descendant, message or artifact capacity.

Because provider turns may exceed the public protocol's 30-second request
maximum, task-bound answer-bearing spawn is a durable asynchronous action.
Dispatch commits `prepared` custody and its command receipt atomically, then
returns promptly while exactly one tracked daemon completion owns adapter I/O.
A bounded FIFO worker claims `prepared -> dispatched` only within the shared
provider-turn ceiling. The chair uses `provider-action.read` to observe the
terminal answer digest and safe structured review result; it does not
redispatch. Raw certifying-review output remains daemon-private. Ordinary
noncertifying local reconciliation cannot look up or quarantine queued or
active work. Every certifying action instead enters the sole section 9.21
recovery owner before generic scans. Transport loss leaves the action live,
daemon shutdown drains tracked work before adapter/database close, and restart
uses the typed owner without blind replay.

Terminal adapter evidence moves exact usage to consumed and releases unused
and concurrency reservation. A missing applicable usage value becomes unknown;
an ambiguous action retains its reservation. Recovery validates an
answer-bearing terminal lookup or replay before settlement. Empty, oversized
or invalid non-review answer evidence is quarantined and freezes unproved
dimensions. Unsafe/malformed certifying-review output commits `UNUSABLE`,
remains private/non-certifying and may still settle independently exact usage.
A later authenticated reconciliation may retry
the adapter's stable lookup and move unknown dimensions to exact settlement;
clearing the authority-level unknown flag requires no other unknown owner.
Section 9.21 is the closed certifying exception: every proved-effect terminal
settles exact authenticated usage or charges the remaining reservation, and its
single recovery owner performs at most one pair lookup.

Operator projection joins an Attention gate only by exact gate ID, project
session and coordination run, and exposes only pending/deferred rows. Intake
read reconstructs a successor-request seed from stored message context and the
current chair row; changed conversation correlation is recovery-required, and
missing provider-session continuity yields no seed. Both paths use strict
current protocol schemas and add no Console-owned state.

The Claude certifying-review adapter receives only the bounded daemon-composed
envelope and action-pair-only review-bundle portal. Its model-visible namespace has
an empty read-only cwd and no HOME; any trusted per-action auth capsule remains
outside that namespace under OS confinement. It has no project/workspace/plugin/source MCP,
Glob/Grep/Bash/edit/write/browser/general-network tool, and no portal other than
the exact digest-bound Fabric portal. Cursor and Agy apply the same substrate
rule. Unsupported adapters/platforms advertise
certifying-review-packet-only.v1 false and
fail before provider I/O. Explicit opus effort max does not change those bounds.
Non-review provider work retains its separately admitted source-tool policy.

Deterministic verification additionally covers conditional vector-reserve
races, task-completion races, crash/restart settlement, direct-SQL invariant
attacks, immutable action/budget binding, replay after task completion,
adapter turn-cap enforcement, mixed exact/unknown usage and later
reconciliation, recovered-answer validation, gate/intake positive and negative
projections, and Claude traversal/absolute/symlink/tool-denial fixtures.
