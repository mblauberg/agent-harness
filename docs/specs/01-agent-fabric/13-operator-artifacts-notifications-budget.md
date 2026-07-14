
### 32.14 Bounded operator artifact-content reads

Spec 05 requires the Console to review the actual immutable artifact, not only
its path and digest. The public operator protocol therefore adds negotiated
optional feature `artifact-content-read.v1` and read-only operation
`fabric.v1.operator-artifact-content.read`. This is a projection read. It does
not publish an artifact, acknowledge evidence, resolve Attention, grant
authority or create effect custody.

Every spec, ADR, diff, decision, test, review and receipt exposed in the
Console has one daemon-owned `EvidenceArtifactRegistration`. This is immutable
projection metadata in the canonical `artifacts` relation, not another byte
store. It binds an evidence ID/revision/kind, exact project/session/run scope,
fixed source owner, artifact ref, publisher provenance and creation time. The
three V1 source owners are `project-file`, `run-file` and
`git-private-diff`. A content read accepts no caller-selected source kind or
root.

Registration also snapshots publication-time provider lineage. The closed
snapshot always records publisher kind/reference and, for an agent publisher,
the exact publisher agent and principal generation. When one current provider
custody is provable it additionally records that custody action and provider-
session generation, adapter, admitted model family/model and immutable route
receipt digest when available. Its state is `proved` or `unproved` with a
closed reason; absent, multiple or crossed custody is `unproved`. The daemon
canonicalises and digests this snapshot in the artifact-registration
transaction. Later agent rotation, route admission, artifact-kind promotion or
registry revision cannot rewrite it.

Negotiated feature `artifact-registry.v1` adds
`fabric.v1.evidence.publish` for an authenticated agent to register an exact
`project-file` or `run-file` already inside its current artifact-path
authority. The closed request includes command identity, run/task binding,
requested source kind, evidence kind, canonical relative path and source
digest; it accepts no root or locator. The daemon derives the effective source:
a requested `run-file` is admitted only below a dedicated strict-descendant run
root; for root `.` it becomes an authority-proved `project-file` or is rejected.
No active `run-file` registration may resolve to `.`. Base
`fabric.v1.artifact.publish` registers `run-file` only beneath a
strict-descendant current run root, or an authority-proved `project-file` when
the current run root is the project root. The fixed Git-read service alone registers
`git-private-diff`; receipt export and result completion use their existing
daemon/agent owners. Exact identity replay returns one evidence ID. Changed
scope, source, path, digest, publisher or kind conflicts.

A bound intake, gate, decision or acceptance may reference only a current
registration from its exact project, session and run. When an intake enters
`accepted`, that closed revision adds one `acceptedScopeRef` which must occur
exactly once in its registered `artifactRefs`; every other intake state forbids
it. Project/session projection derives accepted scope only from this persisted
binding. A prose path, launch ref or unbound intake ref is not reviewable
evidence.

The closed request is:

```yaml
credential: exact-operator-read-capability
projectId: exact-project
projectSessionId: optional-exact-session
evidenceId: exact-artifact-id
expectedEvidenceRevision: positive-integer
artifactRef:
  path: canonical-relative-path
  digest: sha256:64-lowercase-hex
cursor: null-or-daemon-issued-bounded-cursor
maximumBytes: integer-4-through-131072
maximumLines: positive-integer-at-most-2000
```

The request accepts no caller-selected filesystem root, run directory, media
type, transform, command, executable or arbitrary path. `artifactRef` is an
exact cross-check against the canonical evidence row; it is never the resolver
authority. The current project, optional session, evidence registration
revision, artifact ID, path and source digest must all still agree. The opaque
cursor carries no authority; it is integrity-bound to that tuple, the safety
algorithm version and the next rendered UTF-8 boundary.

The result repeats the exact `artifactRef` and is exactly one closed variant:

```yaml
available: false
artifactRef: {path: canonical-relative-path, digest: sha256:source-digest}
reason: not-found|forbidden|unsupported-media|unsafe-content|stale|oversized
```

or:

```yaml
available: true
artifactRef: {path: canonical-relative-path, digest: sha256:source-digest}
mediaType: text/markdown|application/json|text/x-diff|text/plain
content: bounded-inert-utf8
totalBytes: non-negative-source-byte-count
totalLines: non-negative-source-line-count
renderedTotalBytes: non-negative-rendered-byte-count
renderedTotalLines: non-negative-rendered-line-count
pageIndex: non-negative-integer
lineFragment: whole|start|middle|end
pageContentDigest: sha256:returned-page-digest
renderedArtifactDigest: sha256:complete-rendered-artifact-digest
nextCursor: null-or-daemon-issued-bounded-cursor
transformation: none|terminal-neutralised|capability-redacted|credential-redacted|combined
terminalNeutralised: true
capabilityValuesRedacted: true
credentialValuesRedacted: true
```

`totalBytes`/`totalLines` describe the verified source and
`renderedTotalBytes`/`renderedTotalLines` describe the complete inert rendering.
An empty value has zero lines; every non-empty value has one plus its LF count.
Each page obeys both requested bounds after whole-artifact safety
transformation. Page boundaries are monotonic, non-overlapping valid UTF-8
boundaries, prefer the final complete line inside the byte limit, and may split
a longer line only at a code-point boundary. The result therefore also carries
`lineFragment: whole|start|middle|end`; a fragment counts as one returned page
line without changing `renderedTotalLines`. A boundary cannot leave a partial
terminal escape or credential token.
`nextCursor: null` proves the final page. Every page repeats the same source and
complete rendered-artifact digests; the client verifies each
`pageContentDigest` and may stream all pages into `renderedArtifactDigest`. For
a single-page `none` transformation, both rendered and page digests equal the
source `artifactRef.digest`. Otherwise the source digest remains immutable
provenance, not a claim about displayed bytes. An absent, repeated, skipped,
reordered or cross-artifact cursor fails closed.

The daemon resolves only through the canonical evidence registration and its
fixed source owner. `project-file` resolves beneath the canonical trusted
project root; `run-file` resolves beneath the exact run's dedicated artifact
directory; `git-private-diff` resolves by digest beneath the daemon's canonical
private Git-diff root. It opens one regular file without following links,
proves canonical containment, rejects any symlink or multiple-link alias,
records and rechecks device, inode, size and modification time, bounds the
source to 1 MiB and verifies its raw SHA-256 before decoding on every page. A
missing registration/source is `not-found`; a project/session/permission
mismatch is `forbidden`; a changed registration, row, ref, cursor or file is
`stale`; source or inert rendering beyond its hard ceiling is `oversized`;
binary, invalid UTF-8/JSON or unsupported media is `unsupported-media`; and
content that cannot be safely classified/redacted is `unsafe-content`.

Media classification is daemon-owned and extension allow-listed. `.md` and
`.markdown` map to `text/markdown`; `.json` maps to `application/json` only
after bounded parsing succeeds; `.diff` and `.patch` map to `text/x-diff`;
`.txt`, `.log`, `.yaml`, `.yml`, `.toml`, `.ini` and extensionless UTF-8 map to
`text/plain`. Content sniffing cannot widen this list. Before projection the
daemon neutralises terminal controls, redacts every registry-owned bearer
prefix including `afb_`, `afc_` and `afop_`, and applies the closed daemon-owned
credential classifier defined by Spec 04. It then freshly reauthenticates and
rechecks the evidence/source tuple and file identity. Mixed-revision or
pre-change content is never returned as current.

Added requirements are:

- **FR-044:** Artifact content shall be read only through the exact current
  operator/project/session/evidence/ref/cursor tuple and daemon-owned evidence
  registration plus fixed source owner. Caller path or media claims confer no
  filesystem authority.
- **NFR-027:** Artifact reads shall be no-follow, race-rechecked, source-bounded,
  cursor-paged, UTF-8/media allow-listed, terminal-neutralised and credential-
  redacted before projection, with separate source, complete-rendering and page
  digests.
- **FR-045:** Every Console evidence ref and accepted scope shall bind one
  current, exactly scoped evidence registration before projection or decision;
  no prose/path-only reference or unregistered private artifact is reviewable.

Acceptance additionally requires:

- **AC-037:** closed-codec fixtures reject missing, extra, cross-variant or
  incorrectly typed fields and limits outside `4..131072` bytes or `1..2000`
  lines. Deterministic reads cover Markdown, JSON, diff and plain text;
  untransformed and transformed whole/page digests; empty, exact-bound and
  multi-page files; monotonic continuation, restart and duplicate/skip/reorder/
  cross-artifact cursor negatives; multibyte/line boundaries; every wrong
  project/session/evidence revision/ref/digest; absolute, traversal, symlink and
  hard-link aliases; file/registration change during read; binary, invalid
  UTF-8/JSON, unsupported/unsafe media and oversize source/rendering; terminal,
  bearer and unrelated-credential canaries; absent/disabled feature; and exact
  registered scoping intake through Evidence row, detail, all content pages and
  accepted-scope projection. Baseline publication, result artifacts, receipts
  and private Git diffs register idempotently; every producer's root-equal
  `run-file` request reclassifies only with exact project-file authority or
  rejects, and direct SQL cannot retain an active root-equal `run-file`. An
  unregistered or cross-scope ref cannot enter a bound intake/gate/acceptance.
  Every rejected or unavailable
  read performs no mutation and creates no liveness, membership,
  acknowledgement or custody state.

### 32.15 Negotiated native-notification projection shape

Spec 05 requires native delivery state on Attention without making a Console
and daemon built from different compatible revisions reject each other's
otherwise valid projection frames. Negotiated result-shape feature
`native-notification-projection.v1` therefore extends the existing
`fabric.v1.operator-projection.snapshot` and
`fabric.v1.operator-projection.page` Attention variant plus
`fabric.v1.operator-projection.view-page` Attention result. It grants no
operation and cannot widen operator authority.

The summary is part of the already-authorised exact project/session Attention
read. It exposes only the fixed `native-desktop` integration identifier and
bounded delivery/availability state; it carries no destination, credential,
actionable link or unrelated integration data. Negotiation never changes an
authorisation decision. A future need to hide or add summary data requires a
new closed result-shape feature rather than omission or field-level redaction
inside v1. The v1 summary shape is otherwise frozen.

Without that negotiated feature, all three operations retain their pre-extension
closed shapes and omit `nativeNotification`. With the feature, every Attention
item in a snapshot and every Attention view-row summary requires exactly one
closed `nativeNotification` value. Other views never carry it. The value binds
the exact Attention item revision to target `native-desktop`, delivery journal
state and revision/generation, integration availability and observation time;
its Console label is only `available`, `unavailable` or `stale`.

The server derives the result shape from the authenticated connection's
negotiated current feature set and omits the extension when the independently
optional native-notification feature is unavailable. The Console then renders
`feature-unavailable` without implying a delivery-journal observation. When
the feature is negotiated, a missing or malformed extension fails closed as a
protocol result error; an extension received without negotiation also fails.
Every Attention-typed node reachable from one result root, including conflict
candidates, uses the same mode. Mixed presence invalidates the whole result.
The client consumes no partial projection and the operator receives a typed
`protocol-incompatible` connection failure with the rejected operation and
closed reason. There is one connection attempt and no alternate-profile retry or
result-shape translation.

For future additive features, the amended daemon accepts bounded, unique,
well-formed feature names in initialise requests. An unknown required name
produces `required-features-unavailable`; an unknown optional name is ignored.
Names use the closed lowercase dotted-version grammar, are at most 64 bytes and
the required and optional arrays contain at most 64 names combined. The exact
ASCII grammar is
`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*\.v[1-9][0-9]*$`.
No exact name may repeat within or across the two arrays. Initialise results still carry
only features known to and negotiated by both peers. This forward-tolerance
does not grant an unknown operation or relax result validation. A count,
duplicate, ASCII-byte-length or grammar violation rejects the entire initialise
request as `PROTOCOL_INVALID` before required/optional classification. Parsing
uses exact ASCII byte equality without truncation, case folding or Unicode
normalisation.

The Console's feature-unavailable presentation has no timestamp, count, empty
journal state or synthetic zero. Notification aggregates exclude that branch
rather than treating unavailable as zero; Markdown/JSON exports preserve the
explicit unknown state.

Every insert, update or delete that can change the projected native delivery
summary advances `daemon_global_state.revision` in the same SQLite transaction.
This includes `notification_deliveries`; `integration_availability` remains
covered by its existing revision triggers. The next snapshot/page therefore
cannot reuse a revision or state digest after a pending, claimed, sent, failed,
deduplicated or ambiguous transition. An eventless resnapshot that otherwise
returns the same stable rows preserves selection, focus, scroll, draft and
pending command state as required by Spec 05. Load evaluation bounds refresh
work under delivery churn; correctness never depends on coalescing multiple
row triggers into one revision increment.

The deterministic churn gate starts from 1,000 open Attention rows and one
attached Console, applies 2,000 delivery transitions in 200 transactions of 10
across a simulated 10-second interval, and drives exactly twenty 500 ms poll
ticks. After warm-up it permits at most twenty completed resnapshots, zero
overlapping refreshes, 250 ms p95 refresh latency, five seconds total wall and
process CPU time, and 32 MiB additional heap. It records host and Node version.

Added requirements are:

- **FR-046:** Native notification delivery fields shall appear only under the
  exact negotiated result-shape feature and shall be required there, while the
  unextended projection shapes remain wire-compatible and closed.
- **NFR-028:** Every database transition visible in a notification delivery
  summary shall atomically invalidate the daemon projection revision.
- **NFR-029:** Protocol initialise shall ignore bounded well-formed unknown
  optional features, report unknown required features as unavailable and never
  derive an operation grant from an unknown name.
- **NFR-030:** Result-shape validation shall cover every Attention node at one
  mandatory send/receive boundary, reject mixed or wrong negotiated presence as
  a whole-result incompatibility and never expose partial data.

Acceptance additionally requires:
