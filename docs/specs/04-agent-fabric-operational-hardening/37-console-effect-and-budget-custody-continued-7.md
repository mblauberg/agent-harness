
Deterministic verification additionally covers:

- zero filesystem I/O for wrong/expired/revoked credential, action, project,
  session, generation, evidence revision, ID, ref or cursor;
- exact project/run/private source routing and rejection of caller-selected
  source/root, arbitrary, absolute, traversal, sensitive, replaced-ancestor,
  symlink, hard-link, FIFO, device and socket paths, including races before
  open, during read and before response;
- source digest mismatch, size growth/shrink, inode replacement, invalid UTF-8,
  NUL/binary content, malformed or deeply nested bounded JSON, unsupported
  extension, unsafe credential construct and source/rendering overflow;
- byte/line caps at below, exact and above bounds, empty source, CRLF,
  combining/multibyte characters and transformation/page boundaries, including
  complete multi-page reconstruction and duplicate/skip/reorder/cross-ref
  cursor negatives;
- every terminal family, bidi control and bootstrap/agent/operator capability
  plus private-key/auth-header/URL/provider/assignment canaries proving literal
  safety flags only when output is inert and no credential fragment remains;
- untransformed source/rendered/page digest equality and independent transformed
  complete-rendering and per-page digest verification;
- concurrent credential/session/evidence/source-root/file changes producing
  only `stale`, never mixed/current content, while unrelated global activity
  does not starve a valid read;
- a second connection committing a relevant change between the two short
  transactions, and a writer completing during slow filesystem I/O;
- operator-relative roots, prefixed digests, receipts/intake bindings and
  accepted scope; invalid/ambiguous roots fail, while unrepresentable artifacts
  quarantine without parser crash;
- idempotent authorised project/run publication, result/receipt registration,
  private Git-diff registration and exact intake/gate/acceptance binding, with
  cross-scope/unregistered refs rejected atomically; root-equal requests from
  every producer reclassify only with exact authority proof or reject, and no
  active root-equal `run-file` survives direct SQL/postflight checks;
- negotiated client presence/absence, malformed closed variants, restart and
  at least 32 concurrent bounded reads without unbounded memory, descriptor
  drift or database writer starvation; and
- the Spec 05 production Console evidence workflow over every source kind, with
  raw terminal output free of controls and credential canaries.

### 9.15 Notification result-shape negotiation and revision invalidation

Spec 01 section 32.15 owns the public result semantics. This section owns the
daemon/client negotiation boundary and persistence enforcement. Feature
`native-notification-projection.v1` is a result-shape capability with no
operation grant: it may be advertised only when the daemon can condition all
three affected projection operations on the authenticated connection's
negotiated features and the client can enforce the same condition after
decoding.

The closed v1 summary is within the exact operator credential's existing
project/session Attention visibility. It exposes no destination, bearer value,
deep link or cross-scope integration record. No per-field redaction arm exists
in v1 because every authorised Attention reader is authorised for this bounded
status; any future visibility or payload change requires another feature
version.

The generated wire codecs represent `nativeNotification` as an optional schema
property solely because the affected operations each have two negotiated
closed shapes. The connection-aware boundaries restore strictness: server
dispatch passes an explicit include/omit mode into snapshot, projection-page
and view-page construction; the client rejects absence in include mode and
presence in omit mode before the value reaches the Console. Internal callers
use omit mode unless they request the extension explicitly. Validation
recursively walks every Attention-typed value and conflict candidate at the
single public send and receive choke points. Mixed presence invalidates the
whole result. A mismatch closes the attempted attach and emits typed
`protocol-incompatible` state; no cached, replayed, partial or fallback
projection from that result may enter the Console.

Console protocol binding records whether the feature was negotiated. A
Console-local discriminated presentation value separates a real
`daemon-journal` summary from `feature-unavailable`; the latter is never
inserted into the wire `NativeNotificationDeliverySummary`. When the optional
feature is unavailable its presenter, evaluation and export say `notification status unavailable
(feature not negotiated)` and do not fabricate a journal state, delivery
revision, claim generation, integration observation or observation time.
It contributes neither zero nor an empty bucket to notification aggregates,
and exports retain explicit unknown/unavailable state. Protocol incompatibility
is a connection failure, never a per-row delivery summary or unavailable value.

The local Console makes one current-protocol connection attempt. It requires
the exact current project/run/session projection and artifact-read features;
it does not retry an alternate optional profile or translate another result shape.
The request parser admits no more than 64 unique well-formed
feature names combined across required and optional arrays, each at most 64
bytes, ignores unknown optional names during negotiation and reports unknown
required names as unavailable. Unknown names
can never enter the offered result feature set or operation-grant calculation.
Count overflow, duplicates, uppercase or invalid grammar, non-ASCII or
over-64-byte names reject the whole request as `PROTOCOL_INVALID` before
classification. Comparison is exact ASCII byte equality with no truncation,
folding or Unicode normalisation. The exact grammar is
`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*\.v[1-9][0-9]*$`;
duplicates within or across the two arrays reject.

The current baseline adds `AFTER INSERT`, `AFTER UPDATE` and `AFTER DELETE` triggers
on `notification_deliveries` that increment `daemon_global_state.revision` in
the mutating transaction. They follow the existing projection-trigger policy,
compose with the evidence-registry constraints in the same schema and do
not create events, Attention mutations or delivery retries. Existing
`integration_availability` triggers remain mandatory and are verified rather
than duplicated. Baseline catalogue verification rejects missing trigger
coverage before the result-shape feature is advertised.

Multiple row-trigger increments in one SQLite transaction are valid. The
Console preserves stable IDs, focus, scroll, drafts and pending actions when an
eventless revision change reloads otherwise identical rows, and load tests
bound repeated refresh work under notification churn. The gate uses one
Console, 1,000 open Attention rows, 2,000 delivery transitions in 200
transactions of 10 over a simulated 10 seconds and exactly twenty 500 ms poll
ticks. After warm-up it requires no overlapping refresh, at most twenty
completed resnapshots, p95 refresh at most 250 ms, total wall and process CPU
time at most five seconds and additional heap at most 32 MiB; host and Node
version are recorded.

Deterministic verification additionally covers:

- negotiated and unnegotiated server responses for snapshot, projection-page
  Attention and view-page, including closed unknown/missing/malformed, mixed-
  presence and conflict-candidate negatives at both mandatory choke points;
- current client/server fixtures proving required-feature rejection, honest
  optional notification unavailability, whole-result/attach rejection of an
  unnegotiated extra field and no partial projection;
- forward-compatible bounded unknown-feature parsing, combined-count,
  cross-list duplicate and exact-grammar rejection, one connection attempt and
  zero fabricated or aggregate journal/freshness claims;
- delivery insert/update/delete plus availability changes advancing revision,
  invalidating a stale page/read transaction and refreshing Console polling
  while resize/resnapshot preserves UI state under bounded churn;
  and
- baseline reopen/catalogue behavior and absence of any notification-caused
  Attention acknowledgement, approval, focus or other authority effect.

### 9.16 Scoped-operation enforcement, operator-effect custody and Herdr seam
