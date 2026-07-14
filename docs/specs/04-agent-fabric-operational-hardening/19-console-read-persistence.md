
### 9.24 Exact Console read persistence and daemon owner

The daemon is the sole owner of the section 32.22 read surface. It reuses the
current baseline, the existing operator snapshot revision and existing route
and preparation codecs. No Console database, materialised route copy,
action-ID-only lookup, legacy projection or migration shim is permitted.

`review-target-preparation.current.read` authenticates the point-of-use
operator credential for the exact project/session/run, proves the credential's
project ID, then reads `review_target_preparation_high_water`. An existing run
with no high-water row, or generation zero with no preparation row, maps to
unavailable. A missing or zero high water while any preparation row exists for
that run is integrity failure, as is any unequal preparation/target/bundle
high-water triple. A positive equal triple must equal the run's greatest stored
preparation generation, have exactly one matching row, and equal that row's
reserved target and bundle generations. A NULL, negative or otherwise out-of-
domain high-water or preparation generation is always integrity failure; no
aggregate may hide it. The same read transaction first rejects invalid-domain
rows, then compares all three high waters, `MAX(preparation_generation)` and the
matching row. Both active and terminal rows are eligible; state is not a locator
filter. The existing per-ID read mapper
produces the nested value so
phase, progress and terminal correlation cannot drift. The wrapper generation
equals the high-water/row generation, while the accepted receipt reproduces
the exact session/run and preparation ID. Operation failures use the existing
closed `reviewTargetPreparationReadErrorV1` codec unchanged.

Stable route-list membership uses an allocation ordinal, not the daemon-global
projection revision. The current squashed baseline extends its existing
relations as follows; these are current columns, not a compatibility migration:

~~~sql
provider_route_list_high_water(
  run_id PRIMARY KEY, route_ordinal NOT NULL, revision NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(run_id),
  CHECK(route_ordinal >= 0), CHECK(revision >= 1)
)

provider_actions(
  ...existing pair-keyed columns...,
  route_ordinal, route_listed_at,
  UNIQUE(run_id, route_ordinal),
  UNIQUE(adapter_id, action_id, run_id, task_id, route_ordinal),
  CHECK((task_id IS NULL) = (route_ordinal IS NULL)),
  CHECK((route_ordinal IS NULL) = (route_listed_at IS NULL)),
  CHECK(route_ordinal IS NULL OR route_ordinal >= 1)
)

provider_action_routes(
  adapter_id NOT NULL, action_id NOT NULL, run_id NOT NULL, task_id NOT NULL,
  route_ordinal NOT NULL,
  certifying_review NOT NULL CHECK(certifying_review IN (0, 1)),
  target_generation, slot, attempt_generation, reservation_digest,
  created_at NOT NULL,
  ...existing route/admission/configuration columns...,
  PRIMARY KEY(adapter_id, action_id),
  UNIQUE(run_id, route_ordinal),
  FOREIGN KEY(adapter_id, action_id, run_id, task_id, route_ordinal)
    REFERENCES provider_actions(
      adapter_id, action_id, run_id, task_id, route_ordinal),
  FOREIGN KEY(adapter_id, action_id, run_id, target_generation, slot,
      attempt_generation, reservation_digest)
    REFERENCES review_finding_capacity_reservations(
      adapter_id, action_id, run_id, target_generation, slot,
      attempt_generation, reservation_digest),
  FOREIGN KEY(run_id, target_generation, slot)
    REFERENCES review_slot_heads(run_id, target_generation, slot),
  CHECK(route_ordinal >= 1),
  CHECK(
    (certifying_review = 1 AND
      target_generation IS NOT NULL AND slot IS NOT NULL AND
      attempt_generation IS NOT NULL AND reservation_digest IS NOT NULL) OR
    (certifying_review = 0 AND
      target_generation IS NULL AND slot IS NULL AND
      attempt_generation IS NULL AND reservation_digest IS NULL)
  )
)
~~~

Task-bound answer-bearing action admission increments the run high water,
keeps it equal to the run's greatest allocated route ordinal and equality-
copies that positive ordinal to action and route in the same transaction. It
also writes the action's immutable `route_listed_at` and equality-copies that
timestamp to the route row's `created_at`; every read arm exposes
that action column as `createdAt`, including when the route row is missing or
untrusted. The route row's own `created_at` remains internal and is equality-
checked against `route_listed_at` when present; it does not extend or replace
the canonical nested `providerRouteV1` shape.
Resolver/preflight failure that creates no action allocates no
ordinal. Ordinals never recycle. The provider action survives legitimate route
missing/integrity recovery and therefore remains the list membership owner.
Task-bound provider-action rows cannot be deleted and their run, task, ordinal
and `route_listed_at` fields are immutable; current-baseline triggers abort
either mutation.
Every route, dispatch, observation or recovery-state advance also increments
that action's existing `journal_revision`; the read wrapper exposes it as
`routeRevision`. No route bytes or freshness label is copied into another
store.

The current baseline adds these supporting indexes:

~~~sql
CREATE INDEX review_target_preparations_current_lookup
  ON review_target_preparations(
    run_id, preparation_generation DESC, preparation_id
  );

CREATE INDEX provider_actions_operator_route_page
  ON provider_actions(run_id, route_ordinal, adapter_id, action_id)
  WHERE route_ordinal IS NOT NULL;

CREATE INDEX provider_action_routes_operator_task_page
  ON provider_action_routes(
    run_id, task_id, route_ordinal, adapter_id, action_id
  );

CREATE INDEX provider_action_routes_operator_review_page
  ON provider_action_routes(
    run_id, target_generation, slot, route_ordinal, adapter_id, action_id
  ) WHERE certifying_review = 1;
~~~

The route read starts from exact `(adapter_id,action_id)` in
`provider_actions`, then equality-joins task/run/requested session and left-
joins the pair-keyed route, dispatch, observation and live route-recovery
owner. An exact action pair whose `route_ordinal` is null is not an answer-
bearing route-list member and returns `NOT_FOUND`; its lack of route/recovery is
legitimate. An intact listed row maps through the existing full
`PROVIDER_ROUTE_V1_CODEC`.
A recovery-owned missing/integrity-failed state maps the null route/evidence
arm and copies immutable action `route_listed_at` to wrapper `createdAt`. No
route plus no exact recovery evidence is an operation integrity error, not an
invented missing arm. Every child is pair-keyed; no caller-stamped
adapter ID and no action-only query may participate. Crossed parents are scope
or integrity errors, never partial route objects.

Route list starts from exact authenticated run actions with nonnull route
ordinal. Every page scans at most 256 consecutive unfiltered members strictly
after the cursor's last-scanned tuple and at or below the watermark. It first
classifies each scanned member through either the canonical present route or the
composite-FK-bound recovery arm. Any orphaned, crossed or unparseable member
fails the whole list with `INTEGRITY_FAILURE`. Only then does it apply nullable
task, target and slot predicates in SQL. Target/slot filters join either the
immutable certifying route fields or the exact daemon-derived recovery-custody
tuple; they never trust a route whose integrity failed or silently exclude an
unclassifiable member. Its immutable order is
`(route_ordinal,adapter_id,action_id)`. The first
page captures `provider_route_list_high_water.route_ordinal` and applies
`route_ordinal <= :watermark` to its rows in the same SQLite read transaction;
later pages bind and apply the same watermark. A missing high-water row while
any run action has a nonnull route ordinal, or a stored high water that differs
from the greatest allocated ordinal (zero when there is no such action), is
`INTEGRITY_FAILURE`, never an empty or truncated page. Greatest ordinal is read
by the declared route-page index's last key, not a whole-set count.
A missing high-water row when the run has no nonnull route ordinal is exactly
watermark zero.
In the first-page read transaction, before any nullable filter, the daemon
begins incremental contiguity proof at ordinal one. Each later bounded
scan begins at the authenticated cursor's last-scanned ordinal plus one; every
row must equal the expected successor. Missing that successor at or below the
watermark is `INTEGRITY_FAILURE`, and the cursor becomes null only when last-
scanned equals a positive watermark; watermark zero returns null immediately.
Unique positive ordinals plus the non-delete/
immutability triggers complete the proof without a whole-run count.
Continuous appends therefore
cannot force resnapshot or starve progress. Each page derives the latest pair-
keyed state, action journal
revision and freshness at its single `readAt`; all item read clocks equal the
page clock. The authenticated opaque cursor binds capability/principal,
operation, project/session/run, filters, watermark and last-scanned ordering tuple;
decode validates its closed version, bounds and strict forward progress before
query construction. Request and result use the same closed opaque cursor codec
with a 1,024-byte UTF-8 maximum and bind the last-scanned, not merely last-
returned, tuple. `pageSize` is at most 8. Generated schema bounds prove the
complete encoded RPC response containing 8 maximal routes, actual request ID
and maximal next cursor fits the negotiated 1,048,576-byte maximum. The bound
uses the exact JSON encoder and worst legal UTF-8-to-JSON expansion, including
six wire bytes for an escapable one-byte control character, maximal numeric/
timestamp values and every key/delimiter/final LF; schema examples are not the
bound. The scan stops before another member once the requested `pageSize` matches (at most 8)
are collected or after 256 members.
It advances the cursor across classified nonmatches; an empty page with a
nonnull cursor is progress, and null means the watermark was exhausted. No
ordinal is classified twice in one traversal; watermark zero is immediately
exhausted. Reads never persist freshness or
duplicate route bytes.

Operator projection source queries are likewise exactly scoped. Work, Agent and
Activity
rows join `projects -> project_sessions -> runs -> tasks|agents`; source rows,
summary builders, detail references and detail readers carry the same project/
session/run/local-ID tuple. Activity message-body refs and reads equality-carry
that tuple, and embedded task/agent IDs inherit it. Evidence derives the closed project/session/run
scope arm from its actual nullable registration columns and always includes
project ID; nonnull Evidence task ID requires the run arm. It never flattens on `evidence_id` alone, never invents a run for a
project file or private Git diff, and never drops those approved Evidence rows.
The existing projection transaction constructs the section 32.22 composite ID
with the pinned view prefix and rejects duplicate item IDs before publication.
Detail reads equality-check outer scope, detail-ref scope and source row at the
requested snapshot. Run-local IDs reused under another run therefore coexist
without collision and cannot cross-select.
Work source pages order by
`(project_id,project_session_id,run_id,task_id)` and Agent source pages by
`(project_id,project_session_id,run_id,agent_id)`. The existing numeric cursor
is the position in that exact snapshot order; local-ID-only ordering is
forbidden. Activity pages retain reverse source revision and total tie-break by
`(source_revision DESC,project_id,project_session_id,run_id,event_id)`.

The operation registry declares all three as operator-only under
`console-read-identity.v1`. The current Console requires that feature and the
1,048,576-byte frame maximum during initialize; absence is incompatible, not a
legacy fallback. When the daemon's offered registry contains the feature,
current-project operator `read` credential provisioning shall preissue all
three exact operation names; initialize never mints them. Initialize intersects
those preissued operations with the negotiated required feature and operator
principal, and current-Console initialize fails incompatible unless the
resulting `allowedOperations` contains all three. Every request carries that credential and project ID;
point-of-use authentication revalidates
project authority generation, active seat, project/session/run, principal
generation, operation subset and expiry. These reads do not require or mint
chair authority. The private control protocol exposes no new mutation or
filesystem path.

Implementation is TDD. Database fixtures deliberately reuse task and agent IDs
across two runs. Distinct Activity rows in both runs prove row/summary/detail/
message-body reads
must stay in the exact run. Evidence retains its globally unique artifact ID while a
cross-scope detail request must fail for the right reason. Tests cover absent/
zero/positive, NULL/negative, crossed-triple and lagging high water, NULL/
negative or crossed reserved preparation generations, active and every terminal
preparation state, pair-
keyed route reads, declared columns and conjunctive indexes, ordinal allocation
and non-reuse, continuous-append page progress, generic versus certifying
filters, missing/integrity-failed recovery arms, cursor/filter/principal/
watermark substitution, expired capability freshness, action journal revision
on every route child change, closed error/digest arms, maximal digest item IDs,
maximal single-route frame fit, worst-case 8-route page fit and a no-
action-ID-only-query source assertion. Frame limits use a maximal 1,024-byte
request/result cursor. Negative route-arm fixtures reject null
and half-null certifying identity plus crossed/null/mutated recovery custody and
crossed present-route target/slot/attempt/reservation custody, plus direct-SQL
null high-water/route identity. Attempt-allocation fixtures reject
gap, reuse, crossed capacity target/slot, null owner/state, nonnull preflight/
released state and split slot-head/reservation/
action/route admission commit. An interior ordinal-gap fixture on a later page fails before
task, target or slot filtering; crash/restart tests prove admitted action
membership cannot be deleted or renumbered.
An exact non-answer-bearing action-pair read returns `NOT_FOUND`, while only a
nonnull-ordinal member lacking both route and recovery fails integrity.
Target/slot filters cannot hide that orphan, and multi-page Work/Agent/Activity fixtures
with reused local IDs prove total-order pagination without gaps or replay.
A selective-filter load fixture accepts empty progress pages, scans no more than
256 members per page and classifies every ordinal at most once.
The zero-watermark fixture returns an empty page with null cursor immediately.
Initialize fixtures reject a missing feature, each missing preissued or
intersected operation and a narrowed frame maximum; the positive arm returns all
three, and a wrong-reason negative proves initialize never adds an operation to
the credential.
Protocol/daemon contract tests prove the nested preparation and present route
values are produced by their existing codecs. Full migration generation,
foreign-key check, schema, runtime, evaluation and load gates remain binding.
