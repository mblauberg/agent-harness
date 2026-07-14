
Repair currency is exact per finding. Every repair requires a later delivery-
manifest revision, different delivery-review-basis digest and different bundle
digest. `repository-source` additionally requires a changed repository source-
state digest. `registered-evidence` requires every named origin evidence ref to
remain the same registration identity with a greater revision and changed
content digest; a Git-only change is insufficient. `mixed` requires both sets
of predicates. Missing, replaced, lower/equal or same-content evidence never
counts as repair. Repreparing identical bytes cannot make a finding resolvable.

Each nonempty object is split deterministically into 65,536-byte ordered
content-addressed chunks except for one final chunk of 1 through 65,536 bytes;
an empty object has no chunks. Object digest is over exact source bytes, and
each chunk digest is over its exact bytes. Digest construction is acyclic and
uses these exact domains:

1. RFC 8785 JCS of reviewBundleBodyV1 contains no body/page/root/bundle digest
   or page list. `manifestBodyDigest` is SHA-256 of those exact UTF-8 bytes.
2. Those already-hashed body bytes are split into consecutive 65,536-byte
   ranges (one final shorter range); each page digest hashes only its exact raw
   range. Concatenating pages in ordinal order must reproduce the body bytes.
3. RFC 8785 JCS of reviewBundleRootV1 binds body digest/length, coverage digest
   and the complete ordinal/page-digest/length vector.
   `manifestRootDigest` is SHA-256 of those exact root bytes and is absent from
   the root itself.
4. RFC 8785 JCS of reviewBundleRefV1 binds generation, body/root/coverage,
   search/risk and mandatory-set/count/byte values. `bundleDigest` is SHA-256
   of those exact ref bytes and is stored beside, never inside, the ref.

Before step 4, mandatory wire reservation uses the generated closed response
templates, fixed unescaped 71-byte lowercase `sha256:` placeholders and the
maximum permitted 64-byte string JSON-RPC ID sentinel. After the bundle digest
is known, every response is materialised with that sentinel and may not exceed
the reserved count before commit; mismatch fails rather than iterating a digest
cycle. Runtime debit uses the actual admitted ID and exact response bytes.

No digest domain contains itself or a later digest. The canonical body uses at
most 16 immutable pages/1 MiB; the root is at most 49,152 bytes. V1 limits are
4,096 changed paths,
1,024 required-evidence entries, 16,384 unique objects,
32,768 chunks, 16 MiB
per object, 64 MiB total unique object bytes, 1 MiB total manifest-page bytes
and 4 MiB for the immutable search index. The checked-in risk-map output is at
most 256 KiB.
Repeated references to one object digest count its bytes once while every
manifest reference remains present. Finding set/page objects count normally
against object/byte and mandatory-read ceilings; no inline duplicate or fixed
finding-count cap exists. Each safe ID is at most 64 UTF-8 bytes, summary 256
and evidence 768. Certification requires the root, every body page, finding-set
root/page, delivery manifest/map objects and all required accepted-
scope/spec/ADR/decision/gate-
decision/coordination-snapshot objects.
That mandatory set is
limited to 80 complete reads and 6 MiB exact canonical wire bytes; target preparation rejects
a delivery exceeding either bound. Complete changed-file diffs, before/after
objects, checks, evaluations, load evidence and generated contracts remain
available but are not all byte-mandatory for a large delivery.

The daemon builds a content-addressed bundle-search.v1 index and applies the
checked-in review-risk-map.v1 to the complete manifest. Closed nonempty groups
are security/auth, protocol/schema, persistence/migration, provider/adapter,
Console/UI, tests/evaluations, documentation and generated/other. The checked-
in rules score by evidence kind/path/operation sensitivity, sort by descending
score then canonical path/digest, and select exact diff chunks from the highest-
risk changed objects in every nonempty group. The combined deterministic sample
is at most 32 chunks/2 MiB and joins the mandatory read set; caller/provider
cannot choose it. Target prepare fails if it cannot form one sample per group
inside the bound.

The action-bound portal additionally accepts only literal substring or token
search over that index: at most 16 search calls and 1 MiB aggregate search-
response bytes per action, with at most 256 query bytes, 100 results, 65,536
result bytes and 250 ms CPU per call. It
returns exact object digests/offsets/snippets plus a result digest. Search has
no regex, live path or caller-selected index. Search supports deeper exploration
but does not replace the mandatory deterministic sample. The target stores the
exact risk/sample map and achievable read/byte budgets.
Exceeding a limit is bundle-too-large and requires a smaller complete delivery,
not a partial bundle.

Finding capacity is admitted independently before every review action. A
normal action reserves durable set/page/object and byte capacity for all 32
possible safe findings plus the resulting open/repair set roots before any
router, portal or provider I/O. The reservation belongs to the action pair and
is settled atomically with terminal result; unused capacity releases. If the
complete current set plus that maximum cannot fit the physical private-store,
bundle-object or mandatory-read ceilings, admission performs zero router/
provider I/O, creates no action/budget row and returns
`FINDING_CAPACITY_EXHAUSTED`. Completion exposes the target-wide
`finding-capacity-exhausted` blocker.

While that blocker is current, the chair may dispatch only a bounded
`resolution-only` recovery window against an existing open set. It reserves no
new-finding bytes, admits at most 32 prior finding digests, requires the result
to contain zero new findings and is permanently noncertifying even if it
resolves all named digests. A response with a new finding is unusable and
resolves nothing. Resolution-only may shrink open/repair sets until a later
normal 32-finding reservation succeeds; final completion still requires a fresh
normal certifying CLEAN. Exhaustion of the minimum root/page storage needed to
record even resolution-only state is a genuine typed operator gate for private-
store capacity remediation. Fabric never drops, overwrites or evicts a finding
to clear it, and run-owned GC may remove only unreferenced objects.

Each target has one logical bundle and one manifest root. Pages/chunks are
internal addressing only; CAS content may be reused across targets, but no
bundle chain, parent bundle or partial successor exists. The body transitively
binds the complete object set and search/risk digests; the root binds that body
and every page; the final ref binds root/search/risk/mandatory values. Thus
`bundleDigest` covers every component without a self-reference and none can be
substituted independently.

Manifest, objects and chunks are written create-exclusive beneath the
daemon-private content-addressed review store, fsynced, re-read and digest
verified before target commit. Existing same-digest content is byte-verified.
A collision is an integrity failure. The two-phase no-follow source checks from
section 32.14 apply, and the delivery basis, Git state, registrations and
publication lineage are rechecked in the target transaction.

The action-pair-only review-bundle.portal.v1 is exactly one MCP stdio server named
`agent-fabric-review-bundle`. Discovery returns exactly two tools,
`review_bundle_read` and `review_bundle_search`, and zero resources, resource
templates, prompts or other tools. `review_bundle_read` names the manifest root,
one listed page, or exact object and chunk digests; `review_bundle_search` takes
only the closed literal/token query and bounds above. The action capability is
out-of-band and binds both tools to one action, target, bundle, coverage digest
and expiry. The daemon verifies the complete parent chain.

~~~yaml
reviewBundleMediaTypeV1: [application/octet-stream,
  application/vnd.agent-fabric.review-bundle-root.v1+json,
  application/vnd.agent-fabric.review-bundle-body.v1+json,
  application/vnd.agent-fabric.review-diff.v1+json,
  application/vnd.agent-fabric.review-finding-page.v1+json,
  application/vnd.agent-fabric.review-finding-set.v1+json]

reviewBundleReadArgsV1:
  schemaVersion: 1
  bundleDigest: exact-action-bundle-digest
  kind: manifest-root-or-manifest-body-page-or-object-or-chunk
  parentDigest: null-or-exact-listed-parent-digest
  payloadDigest: exact-listed-payload-digest
  ordinal: nonnegative-listed-ordinal

reviewBundleReadResultV1:
  schemaVersion: 1
  bundleDigest: exact-action-bundle-digest
  kind: manifest-root-or-manifest-body-page-or-object-or-chunk
  parentDigest: null-or-exact-listed-parent-digest
  payloadDigest: exact-listed-payload-digest
  ordinal: nonnegative-listed-ordinal
  offset: nonnegative-byte-offset
  rawByteLength: nonnegative-integer-at-most-65536
  mediaType: reviewBundleMediaTypeV1
  encoding: base64
  payload: RFC4648-padded-base64
  resultDigest: sha256-prefixed-digest

reviewBundleSearchArgsV1:
  schemaVersion: 1
  bundleDigest: exact-action-bundle-digest
  queryKind: literal-or-token
  query: UTF8-1-through-256-bytes
  maximumResults: integer-1-through-100

reviewBundleSearchResultV1:
  schemaVersion: 1
  bundleDigest: exact-action-bundle-digest
  entries:
    - objectDigest: exact-bundle-object-digest
      offset: nonnegative-byte-offset
      rawByteLength: positive-integer
      encoding: base64
      snippet: RFC4648-padded-base64
  resultDigest: sha256-prefixed-digest

reviewBundlePortalErrorV1:
  schemaVersion: 1
  code: INVALID_REQUEST-or-UNAUTHENTICATED-or-BUNDLE_MISMATCH-or-NOT_LISTED-or-CROSS_BUNDLE-or-BUDGET_EXHAUSTED-or-RESULT_TOO_LARGE-or-INTEGRITY_FAILURE
  evidenceDigest: null-or-sha256-prefixed-digest
~~~

The read root alone requires null parent and ordinal zero; every other read
requires the exact listed parent/ordinal. Search entries sort uniquely by
object digest, offset and raw length. Each result digest hashes RFC 8785 JCS of
the complete result with only `resultDigest` omitted. Tools accept only these
arguments and return only these results or the closed error. Unknown fields,
unlisted media types and snippets beyond the separate search limit reject.

Every portal request is exactly one UTF-8 JSON object followed by one LF. BOM,
CRLF, JSON batch, trailing bytes, duplicate object keys and non-object roots are
invalid. JSON-RPC `id` is either an integer in `0..2147483647` or an ASCII
string matching `^[A-Za-z0-9._:-]{1,64}$`; every other ID is rejected before a
tool or ledger effect. The TypeScript broker is the sole JSON/JSON-RPC/MCP
parser. A successful or error response is RFC 8785 JCS of exactly one closed
JSON object followed by LF and repeats the exact admitted ID.

`review_bundle_read` uses RFC 4648 padded base64 for one exact raw root/page/
chunk payload. A closed result includes schema version, bundle/kind/parent/
payload digests, ordinal/offset/raw length, `encoding: base64`, payload and
result digest. That digest hashes RFC 8785 JCS of the closed tool result with
only `resultDigest` omitted. Raw payload is at most 65,536 bytes, so base64 is at most 87,384
ASCII bytes. There is no independent prose metadata allowance. Checked-in
generated request/result templates enumerate every field, maximum value and
escaping rule and prove the complete response, including JSON-RPC envelope and
LF, is at most 98,304 bytes.

Target preparation reserves each mandatory response from the generated
template instantiated with the maximum 64-byte string ID sentinel. Once the
bundle digest is known it materialises and checks every reserved response. At
runtime the ledger debits the exact canonical response bytes for the actual
admitted ID; that value may not exceed the reservation. Direct Claude/Codex
dynamic-tool calls use the same equivalent JSON-RPC charge: the adapter exposes
its allowed correlation ID or Fabric assigns a deterministic action-local
integer ID, then charges the identical canonical envelope. No transport gets a
zero-cost or estimated-byte path. Mandatory/exploration ledgers count those
complete bytes, not decoded payload. Search keeps its separate 65,536-byte
response ceiling. Exact-bound generated fixtures cover both ID forms, a
64-byte ID, full 65,536-byte binary chunk, full body page, maximum root, empty
object, every error and maximum search result before capability activation.
Neither tool
accepts an arbitrary command, caller path/root, glob, URL, server name or
mutable cursor. Cross-bundle, reordered, missing or substituted pages/chunks
fail closed.

The MCP method allowlist is initialize/initialized, ping, tools/list and
tools/call for those exact tools. resources/list, resources/templates/list and
prompts/list are permitted and return exact empty arrays because clients may
probe them. resources/read, subscribe/unsubscribe, prompts/get and all sampling,
roots, completion, elicitation and logging methods are denied. Unknown methods
fail closed without provider/source effect.

The adapter prompt is a bounded envelope containing the fixed review rubric,
review instruction, target generation, slot, prior open-finding digests,
bundle/coverage/profile digests and portal contract. It contains no
caller-selected source summary. It binds the complete carried-finding set and,
where bounded, includes its safe text; otherwise those records are mandatory
reads. Its exact UTF-8 bytes remain at most 65,536 and
its digest is action-bound; bundle content remains behind the portal, so source
size cannot overflow the prompt. The strict provider result repeats the target
generation and coverage digest. A partial or stale summary therefore cannot
masquerade as complete bundle review, and every source read is digest-bound.
The portal journal must prove the mandatory set including every deterministic
risk sample, then derives readCoverageDigest and one coverage summary. Zero or
insufficient mandatory reads are noncertifying insufficient-read-coverage. A
syntactic CLEAN becomes public UNUSABLE and resolves nothing; a safely parsed
FINDINGS remains visible/noncertifying, resolves nothing and adds every new
P0-P2 to open repair-required state. Provider repetition of coverageDigest is
not consumption proof. Complete means complete bundle availability and
manifest awareness, not byte-for-byte review. The daemon declares every unread
object group/count/set digest as a coverage gap; neither provider nor chair can
hide it.

The committed target is:

~~~yaml
reviewSubjectV1:
  schemaVersion: 1
  taskId: exact-review-task
  reviewedArtifactRef: exact-eligible-delivery-manifest
  publicationLineageDigest: exact-registration-snapshot
  deliveryReviewBasisRevision: positive-revision
  deliveryReviewBasisDigest: sha256-prefixed-digest
  repositorySourceStateDigest: sha256-prefixed-digest
  reviewBundleBinding: exact-reviewBundleBinding-object-below
  completionProfile: exact-completionProfile-object-below

reviewTargetV1:
  schemaVersion: 1
  preparationId: exact-succeeded-preparation
  targetGeneration: positive-run-CAS-generation
  reviewSubjectDigest: sha256-prefixed-reviewSubjectV1-digest
  taskId: exact-review-task
  reviewedArtifactRef: exact-eligible-delivery-manifest
  publicationLineageDigest: exact-registration-snapshot
  deliveryReviewBasisRevision: positive-revision
  deliveryReviewBasisDigest: sha256-prefixed-digest
  repositorySourceStateDigest: sha256-prefixed-digest
  reviewBundleBinding:
    bundleGeneration: positive-generation
    bundleDigest: sha256-prefixed-digest
    manifestBodyDigest: sha256-prefixed-digest
    manifestRootDigest: sha256-prefixed-digest
    coverageDigest: sha256-prefixed-digest
    bundleSearchIndexDigest: sha256-prefixed-digest
    riskReadMapDigest: sha256-prefixed-digest
    mandatoryReadSetDigest: sha256-prefixed-digest
    mandatoryReadCount: positive-count-at-most-80
    mandatoryReadBytes: positive-count-at-most-6291456
    objectCount: bounded-count
    chunkCount: bounded-count
    totalObjectBytes: bounded-count
  initialChairBindingGeneration: 1
  initialChairBindingDigest: sha256-prefixed-reviewTargetChairBindingV1-digest
  completionProfile:
    profileId: spec05-four-slot-v1
    profileSchemaDigest: sha256-prefixed-checked-in-schema
    resolvedProfileDigest: sha256-prefixed-target-snapshot
    slots: exact-four-resolved-slots
~~~

`reviewSubjectDigest` is SHA-256 of RFC 8785 JCS of exactly
`reviewSubjectV1`. It excludes preparation/target generations and every mutable
chair-binding field. Every displayed subject field in `reviewTargetV1` equality-
copies that preimage. Checked-in golden and field-permutation vectors cover the
complete preimage; omission, extra field, changed nested bundle/profile value or
a target equality-copy mismatch fails before target commit or rebind.

`reviewBundleBinding` is a target projection, not the hashed
reviewBundleRefV1 document: `bundleDigest` hashes the exact stored ref bytes;
the remaining digest/budget fields equality-copy that ref and counts equality-
derive from its bound body.

Chair custody is not part of the immutable review subject. Target commit also
appends the initial generation-one binding and installs its active pointer:

~~~yaml
reviewTargetChairBindingV1:
  schemaVersion: 1
  targetGeneration: exact-target
  bindingGeneration: positive-contiguous-generation
  predecessorBindingGeneration: null-for-one-otherwise-exact-prior
  predecessorBindingDigest: null-for-one-otherwise-exact-prior-digest
  predecessorCertificationCutSequence: null-for-one-otherwise-nonnegative-sequence
  predecessorCertificationCutDigest: null-for-one-otherwise-exact-cut-digest
  predecessorCertificationCutCustodyRef: null | lifecycleCustodyRefV1
  agentId: exact-same-chair-agent
  principalGeneration: positive-generation
  chairLeaseGeneration: positive-generation
  providerSessionGeneration: positive-generation
  bridgeGeneration: positive-generation
  adapterId: exact-adapter
  adapterContractDigest: sha256-prefixed-digest
  modelFamily: openai-or-anthropic
  model: exact-model
  routeReceiptDigest: null-or-sha256-prefixed-digest
  profileDigest: exact-target-profile-digest
  taskId: exact-target-task
  reviewedArtifactRef: exact-target-artifact
  deliveryReviewBasisDigest: exact-target-basis-digest
  repositorySourceStateDigest: exact-target-source-digest
  bundleDigest: exact-target-bundle-digest
  lifecycleCustodyRef: null | lifecycleCustodyRefV1
  checkpointDigest: null-for-one-otherwise-exact-custody-checkpoint
  lifecycleAdoptionEvidenceDigest: null-for-one-otherwise-sha256-prefixed-digest
  bindingDigest: sha256-prefixed-canonical-binding-digest

reviewCertificationCutV1:
  schemaVersion: 1
  runId: exact-run
  targetGeneration: exact-target
  predecessorBindingGeneration: exact-active-binding-at-adoption
  predecessorBindingDigest: exact-active-binding-digest
  terminalSequenceHighWater: nonnegative-run-sequence
  lifecycleCustodyRef: lifecycleCustodyRefV1
  lifecycleAdoptionEvidenceDigest: sha256-prefixed-digest
  cutDigest: sha256-prefixed-canonical-cut-digest

reviewTargetChairBindingPointerV1:
  targetGeneration: exact-target
  activeBindingGeneration: positive-generation
  revision: positive-CAS-revision
~~~

Every nonnull custody ref above uses the exact closed
`lifecycleCustodyRefV1`; its run equals the cut/target run, its agent equals the
chair binding agent and its revision identifies the immutable finalized
`adopted` custody row. Crossed agent, custody ID or revision rejects.

The public idempotent execution/replay surface for this transition is:

~~~yaml
reviewTargetRebindV1:
  schemaVersion: 1
  commandId: stable-command-id
  targetGeneration: exact-current-target
  expectedChairBindingGeneration: exact-current-active-binding
  lifecycleCustodyRef: lifecycleCustodyRefV1

reviewTargetRebindReceiptV1:
  schemaVersion: 1
  status: rebound
  targetGeneration: unchanged-exact-target
  reviewSubjectDigest: unchanged-exact-subject-digest
  priorBindingGeneration: exact-requested-generation
  newBindingGeneration: prior-plus-one
  priorBindingDigest: exact-prior-digest
  newBindingDigest: exact-new-digest
  lifecycleAdoptionDigest: exact-adoption-digest
  bundleDigest: unchanged-exact-bundle-digest
  profileDigest: unchanged-exact-profile-digest
  slotHeadSetDigest: unchanged-exact-four-head-set-digest
  openAndRepairFindingSetDigest: unchanged-exact-set-digest
  rebindReceiptDigest: sha256-prefixed-canonical-receipt-digest
~~~

`fabric.v1.review-target.rebind` accepts no family, model, profile, source,
bundle, head, evidence or lineage claim. It derives all of them from the target,
active pointer and exact finalized adopted custody. Admission requires the same
chair agent; exact custody source tuple equal to the prior binding; exact
custody successor tuple equal to the current chair; and unchanged adapter,
contract, family, model, task, artifact, review basis, repository source,
bundle/profile and four head/open/repair tuples. It performs no router, provider,
portal or lookup I/O. Wrong agent, non-adopted custody, changed immutable subject,
crossed generation or pointer/head CAS fails without mutation and requires a
fresh target preparation where applicable.

True-chair lifecycle adoption invokes the same deterministic mutation inside
its serialization transaction when these predicates hold. A later exact public
request or daemon retry returns the already-committed receipt for that target/
custody semantic key; a changed command replay conflicts. If adoption left the
target stale, the operation may append the binding only while the exact prior
pointer and all immutable/head predicates still match. Multiple rotations form
one contiguous digest chain with no reused generation or ABA.

Binding rows are append-only and immutable; only the one active pointer may
advance by contiguous compare-and-set. Generation one snapshots the chair used
by preparation Phase B and has all predecessor/cut fields null. A later binding
is legal only when one finalized `adopted` lifecycle custody proves the same
`agentId`, an unbroken predecessor binding, and exact equality of adapter,
contract, family, model, profile, task, artifact, basis, source and bundle.
Only principal, chair-lease, provider-session, bridge and route-receipt
generations may advance. Its predecessor binding digest and predecessor
certification-cut custody/sequence/digest are nonnull and exact.

Every first terminalisation of a certifying provider action atomically reserves
one stable positive `terminalSequence` from the run high-water; replay returns
that sequence. At the same serialization point as each true-chair lifecycle
adoption, the daemon snapshots the current terminal-sequence high-water into
one exact `reviewCertificationCutV1` keyed by the adopting lifecycle custody. A
stale target may therefore accumulate multiple distinct custody-keyed cuts for
the same target and predecessor binding. The unique cut digest prevents
duplicate identity without collapsing those adoptions. If the same-subject
predicates above hold, that adoption transaction appends the successor binding,
equality-binds the exact custody/cut, copies the cut sequence/digest into its
predecessor fields and advances the pointer. A successor can never cite a cut
from another custody. Review state never waits, rejects, rolls back or creates a
human gate for adoption. If any predicate does not hold, lifecycle adoption
still succeeds and the unchanged target becomes read-derived stale.

An action retains its dispatch binding generation. Evidence under binding `b`
uses normal current predicates while `b` is active and has no successor. Once a
successor exists, that evidence can certify only when its stable terminal
sequence is no greater than the first successor's predecessor cut and every
binding from `b` to the active binding is contiguous and digest-valid. A post-
cut terminal is permanently noncertifying, accepts no resolutions, still
settles and retains every adverse safe finding. Prepared old-binding actions
cannot pass their worker currency check and the ordinary recovery owner closes
them proved no-effect; dispatched, accepted and ambiguous actions recover
normally without delaying lifecycle. Target, heads, existing evidence IDs,
bundle and findings are never rewritten by binding advance.

`cutDigest` is SHA-256 of RFC 8785 JCS of the complete
`reviewCertificationCutV1` with `cutDigest` omitted. `bindingDigest` is SHA-256
of RFC 8785 JCS of every displayed binding field with only `bindingDigest`
omitted, including predecessor binding/cut fields. Public evidence and
completion expose the closed `reviewCertificationBasis` arm, not an inferred
watermark.

Preparation and lifecycle rotation serialize at commit, not by a long-lived
lock. Preparation Phase B rechecks the adopted current chair. It may commit the
initial binding against a same-agent adopted generation only when every
non-generation binding field and all source/profile preconditions remain exact;
otherwise it terminalises the preparation as conflicted. A rotation that
adopts after target commit performs the automatic cut/rebind-or-stale decision
above. Existing effect ambiguity remains owned by route recovery; a preparation
may remain built/Committing while that fence exists and Phase B cannot leapfrog
it. A changed predecessor action tuple conflicts as
`predecessor-action-nonterminal`. No transaction exposes a target with a
missing active binding.

The succeeded preparation Phase B atomically inserts its reserved bundle
metadata, supersedes the former target, creates the immutable target, initial
chair binding/pointer and four slot heads, then commits the preparation
`built -> succeeded` transition. A CAS mismatch commits no target and marks the
preparation conflicted with evidence. Exact prepare-command replay continues to
return its immutable accepted receipt; progress/target are read separately.
A delivery review-basis/source-state advance, root artifact advance, an
unrebindable chair change, or any resolved adapter-contract/profile change
makes the current target stale without mutation. A
dispatch or annotation mutation rejects it without changing target state. The
action-bound terminal evidence transaction always settles/persists even when
currency changed. Only a newly succeeded preparation Phase B inserts a
successor and persists the prior row as superseded.
No read advances global revision.

`ReviewTargetPreparationRecoveryService` runs before review CAS garbage
collection and generic job recovery. It reclaims an expired worker lease by
incrementing the same preparation's worker-claim generation; it never allocates
another target/bundle generation or inserts a duplicate target. `prepared`
restarts at build. `building` revalidates/reuses only digest-verified
create-exclusive CAS bytes and continues the same build; `built` reruns only
Phase B. If captured state changed, recovery commits conflicted/failed rather
than silently rebuilding against another source. CAS garbage collection may
delete bytes only after proving no active preparation, target or bundle row
references their digest. Crash tests at every file write, fsync, state edge and
Phase-B statement expose either the same resumable preparation or one complete
target, never a partial/duplicate target.
