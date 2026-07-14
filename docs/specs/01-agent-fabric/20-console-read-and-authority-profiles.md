
### 32.22 Exact Console read identity completion

The Console must not guess a preparation identifier, infer a provider route
from action-local state or treat run-local task, agent or evidence identifiers
as project-global. Three extension operations complete the existing read
surface:

- `fabric.v1.review-target-preparation.current.read`;
- `fabric.v1.provider-route.read`; and
- `fabric.v1.provider-route.list`.

They are operator-only reads behind negotiated
`console-read-identity.v1`. The current Console lists that feature in
`requiredFeatures`; initialize fails closed rather than offering an identity-
guessing fallback when it is unavailable. The feature owns exactly the three
operations above, and current-Console initialize is incompatible unless its
intersected `allowedOperations` contains all three. An active operator seat may invoke
them only when
its project-bound capability explicitly includes the exact operation. The
grant is `read`, never `decide`, `steer` or chair authority. They grant no
mutation, routing, review, lifecycle or topology authority. Generated RPC,
schema and operator-descriptor registries include them exactly once; the agent
MCP set does not. Unknown fields and enum values fail closed.

The current-preparation locator accepts only exact run scope:

~~~yaml
reviewTargetPreparationCurrentReadRequestV1:
  schemaVersion: 1
  credential: exact-operator-read-capability
  projectId: exact-project
  projectSessionId: exact-session
  coordinationRunId: exact-run

reviewTargetPreparationCurrentReadV1:
  commonRequired:
    - schemaVersion
    - projectId
    - projectSessionId
    - coordinationRunId
    - status
    - currentPreparationGeneration
    - preparation
  oneOf:
    - schemaVersion: 1
      status: unavailable
      currentPreparationGeneration: 0
      preparation: null
    - schemaVersion: 1
      status: current
      currentPreparationGeneration: positive-integer
      preparation: reviewTargetPreparationReadV1
~~~

Both arms equality-copy the requested project/session/run. `current` means the
greatest durably allocated preparation generation for that
exact run, whether nonterminal or terminal. The nested value is byte-shape-
identical to the existing `reviewTargetPreparationReadV1`; the locator is not a
second preparation codec. The row's preparation generation and wrapper
generation equal the high water; the nested accepted receipt reproduces the
requested project-session/run and its row's preparation ID. A missing high-
water row, or a zero high water with no preparation row, is `unavailable` when
the exact run exists and has never allocated a preparation. A missing or zero
high water while any preparation row exists for that run is integrity failure,
as is a preparation/target/bundle high-water triple that is NULL, negative or
unequal. A positive equal triple must equal the run's greatest stored
preparation generation, have exactly one matching row, and equal that row's
reserved target and bundle generations. All high waters and greatest-row
generation are compared in the same read transaction. Missing run,
wrong project/session/run pairing and denied authority use the existing closed
`reviewTargetPreparationReadErrorV1` codec and are not disguised as unavailable.
Its existing `REVIEW_TARGET_PREPARATION_NOT_FOUND`, `AUTHORITY_DENIED`,
`SCOPE_MISMATCH` and `INTEGRITY_FAILURE` arms apply unchanged.

Section 32.21's full closed route variant is canonically `providerRouteV1` and
is implemented by the existing `PROVIDER_ROUTE_V1_CODEC`:

~~~yaml
providerRouteV1:
  actionRef: ProviderActionRefV1
  taskId: exact-task
  route: providerRouteProjectionV1
  admission: deployedRouteAdmissionV1
  capabilitySummary: capabilitySnapshotSummaryV1
  latestDispatch: deployedRouteDispatchV1 | null
  observation: deployedRouteObservationV1 | null
~~~

It is the same full shape already exposed by provider-action read and receipt
v2, not the thinner `providerRouteProjectionV1`/`localProviderRoute` member and
not a new codec. Provider route reads use the daemon-global action pair and
nest that exact codec only in the present arm:

~~~yaml
providerRouteReadRequestV1:
  schemaVersion: 1
  credential: exact-operator-read-capability
  projectId: exact-project
  projectSessionId: exact-session
  coordinationRunId: exact-run
  actionRef:
    adapterId: exact-adapter
    actionId: exact-action

providerRouteReadV1:
  commonRequired:
    - schemaVersion
    - projectId
    - projectSessionId
    - coordinationRunId
    - actionRef
    - taskId
    - routeOrdinal
    - routeRevision
    - createdAt
    - readAt
    - routeState
    - freshness
    - route
    - routeRecoveryEvidenceDigest
  oneOf:
    - schemaVersion: 1
      routeState: present
      freshness: current | stale
      route: providerRouteV1
      routeRecoveryEvidenceDigest: null
    - schemaVersion: 1
      routeState: missing | integrity-failed
      freshness: null
      route: null
      routeRecoveryEvidenceDigest: sha256-prefixed-safe-digest

providerRouteListRequestV1:
  schemaVersion: 1
  credential: exact-operator-read-capability
  projectId: exact-project
  projectSessionId: exact-session
  coordinationRunId: exact-run
  taskId: exact-run-task | null
  targetGeneration: positive-integer | null
  slot: native | other-primary | cursor-grok | agy-gemini | null
  watermarkOrdinal: nonnegative-integer | null
  pageSize: positive-integer-at-most-8
  cursor: opaque-scope-filter-watermark-bound-cursor-at-most-1024-bytes | null

providerRouteListV1:
  schemaVersion: 1
  status: page
  projectId: exact-project
  projectSessionId: exact-session
  coordinationRunId: exact-run
  watermarkOrdinal: nonnegative-integer
  readAt: timestamp
  routes: ordered-providerRouteReadV1-array
  nextCursor: opaque-scope-filter-watermark-bound-cursor-at-most-1024-bytes | null

providerRouteReadErrorV1:
  commonRequired: [schemaVersion, code, evidenceDigest]
  oneOf:
    - schemaVersion: 1
      code: NOT_FOUND | AUTHORITY_DENIED | SCOPE_MISMATCH | STALE_CURSOR
      evidenceDigest: null
    - schemaVersion: 1
      code: INTEGRITY_FAILURE
      evidenceDigest: sha256-prefixed-safe-digest
~~~

The common fields are scalar fields with the indicated names: project/session/
run and action/task identity, positive `routeOrdinal`, positive
`routeRevision`, immutable action-list admission `createdAt` and transaction-
authored `readAt`.
The present arm's nested action/task identity must equal those common fields.
The wrapper labels read-time freshness but never changes or duplicates the
nested route. `current` requires the admission capability point and, when
present, the latest-dispatch capability point to be unexpired at `readAt`;
otherwise it is `stale`. Missing/integrity-failed are legitimate recovery-owned
states, never read corruption or current routes. Their safe evidence digest is
required and freshness is inapplicable. Freshness is operator information only
and cannot rewrite historical admission, dispatch, observation or
certification evidence. Both operations return the one closed
`providerRouteReadErrorV1` on operation failure.

`GenericProviderRouteRecoveryService` is the sole owner for an
otherwise-generic task-bound answer-bearing action whose route is missing or
integrity-failed. It runs only after lifecycle, launch-custody and
certifying-route owner classification has positively excluded the pair. It
binds the exact action
pair, run and task in the existing generic provider-action recovery journal and
carries no certifying target, slot, attempt, reservation, bundle, prompt,
profile or review-lineage claim. It emits the safe recovery-evidence digest
used by the read arm and may inspect, repair or retire only under the action's
existing authority and pair-keyed recovery custody. It never writes certifying
route-integrity recovery state, reroutes, redispatches or reconstructs route
bytes. Failure to prove an owner exclusion is integrity failure, never generic
fall-through; every unresolved answer-bearing pair has exactly one recovery
owner.

Read requires exact equality among request scope, the daemon-global provider
action pair and task run. An exact action pair with null route ordinal is not a
route-list member and returns `NOT_FOUND`; its legitimate lack of route/
recovery is not corruption. The present arm additionally equality-binds the
provider-action route; missing/integrity-failed instead binds the exact live
route-recovery evidence for that pair and task/run. List enumerates every
admitted task-bound answer-bearing action, including recovery-owned missing/
integrity-failed states. Each page scans at most 256 consecutive unfiltered
members strictly after the cursor's last-scanned tuple and at or below the
watermark. Every scanned member first classifies through one trustworthy
present-route or exact recovery-owned missing/integrity arm. An orphaned, crossed or
unparseable member fails the whole operation with `INTEGRITY_FAILURE`; filters
cannot hide it. List filters are then conjunctive and nullable; a slot or target filter selects only certifying
actions whose immutable route row or recovery-custody tuple proves that field.
Missing/integrity-failed recovery cannot borrow it from untrusted route bytes.

The first page supplies null watermark and cursor, then captures
`provider_route_list_high_water.route_ordinal`; zero is the empty watermark.
The action-admission transaction keeps that high water equal to the run's
greatest allocated route ordinal. A missing high-water row while any run action
has a nonnull route ordinal, or a stored high water that differs from the
greatest allocated ordinal (zero when there is no such action), is
`INTEGRITY_FAILURE`, never an empty or truncated page. Greatest ordinal is an
indexed last-key lookup, not a whole-set count. A missing high-water row
when the run has no nonnull route ordinal is exactly watermark zero. Before
applying filters, every bounded scan proves contiguity incrementally. A null
cursor expects ordinal one; otherwise the authenticated last-scanned ordinal
expects exactly its successor. Every scanned row must equal the expected
ordinal, and absence of that successor while it is at most the watermark is
`INTEGRITY_FAILURE`. The cursor is null immediately for watermark zero;
otherwise it becomes null only after last-scanned equals the watermark. The
unique/positive/immutable membership constraints complete that
proof without a whole-run count. Every later
page supplies that exact watermark and the prior opaque cursor. Rows with
ordinals above it are excluded, so continuous route/dispatch/observation
activity cannot starve pagination. Rows are ordered by immutable
`(routeOrdinal,adapterId,actionId)` and every returned ordinal is at most the
watermark. State, child data, `routeRevision` and freshness remain truthful at
the page's common `readAt`; the list does not falsely claim a cross-page atomic
cut. `pageSize` is at most 8. Generated schema bounds prove 8 maximal routes,
the actual request ID, envelope and maximal next cursor fit the negotiated
1,048,576-byte frame. The bound uses the exact JSON encoder and worst legal
UTF-8-to-JSON expansion, including six wire bytes for an escapable one-byte
control character, maximal numbers/timestamps and every key/delimiter/final LF;
example values are not a bound. Page construction therefore never discovers a
matching row it must withhold for size. Scanning stops before the next member
once the requested `pageSize` matches (at most 8) are collected, or after 256 classified members.
A nonnull cursor may therefore
accompany an empty filtered page and is the only progress/completion authority;
it advances across every classified nonmatch and nulls only after the watermark
is exhausted (immediately for watermark zero). Every ordinal is classified at
most once in one traversal. The
current Console requires the 1 MiB maximum during initialize. The opaque cursor
binds operation, principal/capability scope, project/session/run, all filters,
watermark and the last-scanned ordering tuple. Cursor
substitution, replay under another scope, changed filters, null/non-null
watermark-cursor mismatch or a non-progressing cursor fails closed.
Every malformed, forged, substituted, mismatched or non-progressing cursor/
watermark binding returns `STALE_CURSOR`; true authority, scope and stored-row
integrity failures retain their distinct codes.

The operator projection also closes multi-run identity without deleting
project/session evidence. Every Work, Agents and Activity view item, summary,
detail reference and returned detail carries nonnull `projectId`,
`projectSessionId` and `coordinationRunId` in addition to its local identifier.
Activity includes `eventId` and its source revision; a message activity's
`messageBodyRef` carries the identical project/session/run plus message ID and
revision. Task, agent, event and message identity is interpreted only inside
that full tuple. Work `parentTaskId`/`ownerAgentId`, Agent `stableTaskId` and
every Activity task/agent actor reference inherit the enclosing run tuple; no
embedded local ID is a project- or session-wide lookup key.

Every Evidence item, summary, detail reference and detail instead carries one
closed `evidenceScope` plus `evidenceId`:

~~~yaml
evidenceScope:
  oneOf:
    - kind: project
      projectId: exact-project
    - kind: session
      projectId: exact-project
      projectSessionId: exact-session
    - kind: run
      projectId: exact-project
      projectSessionId: exact-session
      coordinationRunId: exact-run
~~~

The daemon derives the arm from the stored project/session/run registration:
nonnull run requires the exact run arm, null run plus nonnull session requires
session, and both null require project. Thus project files and private Git diffs
remain Evidence rows while run evidence cannot cross-bind another run. The
Evidence `taskId` must be null in project/session arms and, when nonnull, is
interpreted only in the exact run arm. The
detail request's outer project/session scope and its detail ref must equality-
bind wherever that arm contains a session. A stale or crossed tuple returns
resnapshot/scope failure, never a row found by local identifier alone.

The stable item-ID prefixes are exactly the view names `work`, `agents`,
`activity` and `evidence`. Work/Agents/Activity use
`<view>:<base64url-no-padding(SHA-256(UTF-8(JCS([projectId,
projectSessionId,coordinationRunId,localId]))))>`; Evidence uses
`evidence:<base64url-no-padding(SHA-256(UTF-8(JCS([evidenceScope,
evidenceId]))))>`. These 43-character digests plus the pinned prefix fit the
existing 128-byte identifier codec even when every tuple member is maximal.
Summaries, detail refs, detail payloads, page rows and selection/hit-region
state use the same tuple. There is no decoder for the previous local-ID-only
shape and no Console-side fallback join.

Work pages use the exact total source order
`(projectId,projectSessionId,coordinationRunId,taskId)` and Agents pages use
`(projectId,projectSessionId,coordinationRunId,agentId)`. The existing numeric
page cursor is a position in that pinned snapshot order, never an order by local
ID alone. Activity pages preserve reverse source-revision order and use
`(sourceRevision DESC,projectId,projectSessionId,coordinationRunId,eventId)` as
the exact total tie-break order. Reused local IDs therefore cannot gap, repeat
or exchange position across pages.

Conformance tests start with wrong-reason RED fixtures for two sessions/runs
that deliberately reuse the same task and agent IDs. Distinct Activity/message
rows in both runs prove summaries, detail refs/details and message-body reads
remain inside the exact run tuple. Evidence fixtures retain
the globally unique artifact ID but attempt a scope-crossed detail read and
prove project/session/run arms remain distinct. They cover
absent, active and terminal current preparations; exact pair route reads;
generic and certifying route list filters; stable multi-page watermarks;
expired capability freshness; crossed session/run/action pairs; cursor and
filter substitution; descriptor/schema parity; missing/integrity-failed route
arms; and proof that every present route parses through `providerRouteV1`
rather than a copy. Boundary oracles cover maximal tuple identifiers, stable
digest IDs, a maximal single route RPC frame and an 8-maximal-route page below
the negotiated 1 MiB limit, plus an interior ordinal-gap fixture on a later page
that must fail before nullable filters are applied. A filtered orphan fixture fails
integrity rather than returning an empty page, and multi-page Work/Agents/Activity
fixtures reuse local IDs across runs without gaps or replay. Frame oracles use
the maximal 1,024-byte route-list cursor in both request and response positions.
A selective-filter load oracle traverses empty progress pages and proves no
ordinal is classified more than once while each page scans at most 256 members.
The zero-watermark fixture returns an empty page with null cursor immediately.
Initialize fixtures reject a missing feature, any one missing preissued/
intersected operation and a narrowed frame limit; the positive arm contains all
three operations, and a wrong-reason negative proves initialize never expands
the credential.

Requirements:

- **FR-083:** The current Console shall negotiate `console-read-identity.v1`
  with all three operator-only read operations and shall fail closed when any
  operation or its project-bound read capability is absent.
- **FR-084:** Current preparation read shall resolve only the exact run's equal
  preparation/target/bundle high water and its unique matching row, with no
  caller-guessed identifier.
- **FR-085:** Provider-route read/list shall start from the daemon-global action
  pair and immutable route ordinal, classify every member through one exact
  present or recovery-owned arm, and preserve a stable authenticated watermark.
- **FR-086:** Work, Agents and Activity identities shall include project,
  session and run; Evidence shall use its closed project/session/run scope arm.
  No local identifier shall be resolved outside that tuple.
- **NFR-036:** Route-list pagination shall scan at most 256 consecutive members,
  return at most eight routes, fit the negotiated 1,048,576-byte frame and make
  progress only through the authenticated last-scanned cursor tuple.
- **NFR-037:** Reused task, agent, event or message identifiers shall never
  cross a project/session/run boundary in summary, detail, body, selection or
  pagination state.
- **NFR-038:** All three Console identity operations shall be read-only and
  shall neither mint authority nor mutate preparation, route, recovery,
  freshness or projection state.

Acceptance additionally requires:

- **AC-060:** preparation locator fixtures cover absent, zero, positive, NULL,
  negative, unequal and lagging high-water triples plus every active/terminal
  row; only the unique exact equal row returns current.
- **AC-061:** route read/list fixtures cover exact pair scope, generic and
  certifying filters, stable multi-page watermarks, interior gaps, crossed
  admission/recovery identities, maximal cursor/frame bounds and empty progress
  pages without duplicate classification.
- **AC-062:** two-run fixtures deliberately reuse task, agent, event and message
  IDs and prove summary, detail, body, selection and pagination stay within the
  full project/session/run tuple; Evidence scope-arm crossings fail.
- **AC-063:** initialize fixtures reject a missing feature, each missing
  preissued/intersected operation and a narrowed frame limit; the positive arm
  returns exactly the three read operations and never expands the credential.

Fresh-origin and scope-admission requirements:

- **FR-087:** Every custody revision one created by fresh recovery shall bind
  exactly one authenticated `fresh-origin` receipt in the apply's single
  authorized batch; no custody, loss, commit or head mutation shall precede
  that authorization.
- **FR-088:** The system shall externally admit each exact lifecycle scope
  through one idempotent crash-recoverable outbox intent before materialising
  its local admitted-scope state.
- **NFR-039:** Lifecycle hydration shall be read-only and shall start only
  after every durable scope-admission outbox intent has an exact externally
  verified local resolution.

Acceptance additionally requires:

- **AC-064:** Codec and SQLite fixtures shall exhaust the seven legal batch
  arms and reject every crossed transition, secondary intent, count, review,
  handoff, source-mode, effect and completion combination.
- **AC-065:** Fault-injection fixtures shall cover every scope-admission crash
  boundary, lost response, exact replay, changed-byte conflict, local rollback
  and hydration write attempt.

## 33. Capability-compiled execution authority

This section is the sole execution-authority-profile owner. The wire dimension
is named `authorityProfile` so it cannot be confused with section 9 execution
control profiles or the Spec 05 four-slot review profile. Its initial closed
enum is exactly `review-readonly | workspace-write-offline`. There is no third,
legacy, ad hoc, adapter-defined or caller-defined authority profile.

### 33.1 Canonical authority envelope and direct cutover

Every public request, launch packet, stored authority, reopened session and
delegation uses this exact closed protocol-owned object:

~~~yaml
DisclosurePolicy:
  oneOf:
    - level: allowed
    - level: scoped
      scopes: nonempty-proper-subset-of-[local, approved-provider, external]
    - level: forbidden

authorityBudgetMap:
  type: Readonly<Record<string, number>>
  key: recognised-qualified-budget-unit-key
  value: nonnegative-safe-integer

AuthorityEnvelopeV2:
  schemaVersion: 2
  approval:
    approvedBy: nonempty-operator-identity
    evidenceId: exact-authority-approval-evidence
    evidenceDigest: sha256-prefixed-digest
  workspaceRoots: nonempty-sorted-unique-canonical-workspace-relative-prefixes
  sourcePaths: sorted-unique-canonical-workspace-relative-prefixes
  artifactPaths: sorted-unique-canonical-workspace-relative-prefixes
  actions: sorted-unique-FabricOperation-values
  deniedPaths: sorted-unique-canonical-workspace-relative-prefixes
  deniedActions: sorted-unique-FabricOperation-values
  prohibitedActions: sorted-unique-nonempty-identifiers
  disclosure: DisclosurePolicy
  secrets:
    oneOf:
      - access: none
      - access: use-without-disclosure
        references: nonempty-sorted-unique-secret-reference-identifiers
  deployment:
    oneOf:
      - allowed: false
      - allowed: true
        targets: nonempty-sorted-unique-target-identifiers
  irreversibleActions:
    oneOf:
      - allowed: false
      - allowed: true
        actionIds: nonempty-sorted-unique-action-identifiers
  network:
    oneOf:
      - toolEgress: none
      - toolEgress: allowlist
        allowedHosts: nonempty-sorted-unique-host-identifiers
  expiresAt: canonical-millisecond-UTC-timestamp
  budget: authorityBudgetMap
~~~

Authority digests use a separate exact namespace; lifecycle `LD` is forbidden:

~~~text
AD(domain, value) =
  "sha256:" + lowerhex(SHA256(
    UTF8("agent-fabric.authority.v1\u0000" + domain + "\u0000") ||
    RFC8785_JCS_UTF8(value)))
~~~

The two NULs are literal bytes and `domain` is one exact lowercase ASCII value
from this complete registry: `authority-envelope-v2`,
`provider-authority-profile-request-v1`, `authority-local-attestation-v1`,
`authority-task-ownership-v1`, `owned-worktree-identity-v1`,
`authority-workspace-root-identity-v1`,
`authority-private-temp-root-v1`, `authority-risk-policy-v1`,
`authority-host-identity-v1`,
`authority-containment-matrix-policy-v1`,
`authority-step3-containment-matrix-v1`,
`authority-containment-evidence-v1`, `authority-containment-decision-v1`,
`provider-authority-native-settings-v1`,
`provider-control-plane-exception-v1`, `effective-provider-authority-v1`, or
`provider-authority-compilation-receipt-v1`. An unregistered label or use of
the lifecycle prefix rejects; a digest never occurs in its own preimage.

`authorityEnvelopeDigest=AD("authority-envelope-v2",exactEnvelope)`. No field
has a permissive default. Enabling union arms require their displayed nonempty
sets. Unknown, missing, noncanonical, expired or unversioned input fails before
mutation, reservation or provider I/O. The pre-release cutover retains no V1
decoder, alias, quarantine profile, dual stored state or compatibility bridge.
Existing `authority_ref`/`authorityDigest` record fields are exact references to
one stored V2 object and its digest; they are not alternate authority payloads.
A request that supplies a body supplies V2, while a request permitted to supply
a ref resolves and validates the complete V2 object before admission.

The squashed pre-release store has one immutable envelope wrapper:

~~~yaml
storedAuthorityEnvelopeV2:
  coordinationRunId: exact-run
  authorityId: stable-id
  parentAuthorityId: stable-id | null
  envelope: AuthorityEnvelopeV2
  authorityEnvelopeDigest: sha256-prefixed-digest
~~~

The digest recomputes from the exact envelope and its approval evidence digest
foreign-keys the registered passing `authority-approval` artifact. The registry
has one exact `(evidenceId,evidenceDigest,approvedBy)` candidate and resolves
its immutable artifact revision without adding a revision to the accepted V2
wire shape. Stable ID
identity is unique on `(coordinationRunId, authorityId)`; the additional exact
candidate `(coordinationRunId, authorityId, authorityEnvelopeDigest)` is used
by task/receipt FKs. Update/delete is forbidden. A nonnull parent ID resolves
that one same-run stable row before complete V2 containment. No opaque JSON,
unversioned row or digest-only authority satisfies a compiler/receipt FK.

Section 31's path coordinate remains binding for V2. Every envelope path is a
canonical workspace-relative prefix: `.` is the root; empty, absolute,
traversing, globbed or unresolved-escape values reject. The human/delivery wire
object never embeds a host path. The authenticated task/worktree input below
binds one relative coordinate root to one no-follow absolute execution-root
identity; only the compiled `canonicalReadRoots`, `canonicalWriteRoots` and
`canonicalDenyRoots` are absolute host paths. This preserves the mechanical
delivery-to-Fabric mapping and keeps an approval digest machine-independent.

A delegated child keeps the exact approval binding and can only narrow. Its
workspace/source/artifact/action/host/secret/target/action-ID sets are subsets;
denials and prohibitions only accumulate; disclosure only narrows; expiry only
shortens; every budget only decreases; and `false`/`none` dominates an enabling
arm. A changed approval binding is a different human grant, not delegation.
`workspaceRoots` enumerates workspace-relative repository coordinates within
which the task may operate and grants no read or write scope by itself. An
owned worktree binding must select exactly one surviving coordinate and its
physical root must be the owning repository's registered `.worktrees` member;
neither that binding nor repository metadata widens `sourcePaths`,
`artifactPaths` or the profile's writable root.

### 33.2 Closed authority-profile contracts

`review-readonly` preserves the current checked-in provider-permission
characterisation bytes. It exposes no model/tool write surface. Model-visible
secret access, deployment, irreversible action, external effect and tool egress
are all absent. Provider authentication and the provider API control plane are
separately admitted host responsibilities outside the model/tool namespace;
their availability does not make tool egress nonnull.

`workspace-write-offline` is available only to generic, noncertifying work. Its
only project/repository writable root is one canonical generation-bound owned
linked worktree at the owning repository's `.worktrees/<task-agent>` path. The
effective `artifactPaths`, task writer lease and requested writes must all be
contained by that root, and the intersected writable scope must be nonempty.
Effective read scope remains `sourcePaths`; denied paths dominate both.
Common/worktree Git metadata, refs, index, configuration,
branches, commits, worktree creation/removal and every other repository root
remain unwritable. Relative `..`, absolute-path substitution, redirection,
subprocesses, `git -C`, hard links where applicable, and escaping or swapped
symlinks cannot widen either scope. A worktree is an ownership/scoping aid, not
a permission boundary.

The write profile forces `network.toolEgress:none`, including loopback, local
binds and Unix-socket tool paths; `secrets.access:none`;
`deployment.allowed:false`; `irreversibleActions.allowed:false`; and no
external-effect operation. An AuthorityEnvelopeV2 allowlist or enabling arm is
therefore narrowed to the restrictive `none`/`false` arm and never survives in
effective authority. That narrowing is not itself rejection; rejection occurs
only when the envelope lacks an action/path/budget dimension the restrictive
profile actually requires. The compiler may select one separately
pre-provisioned Fabric-custodied private session temp root only when the
provider requires it, the receipt identifies it, the containment gate proves
it and global temp remains denied. It creates nothing and the root is not a
second worktree or project root.

The owning `repositoryRoot` is an identity/containment boundary, not a deny
prefix: the owned `.worktrees/<task-agent>` is physically beneath it, so a
repository-root deny would also erase the positive write scope. For the write
profile, `canonicalDenyRoots` mandatorily adds the exact worktree `.git` link
path and `commonGitDirectory` from `ownedWorktreeIdentityV1`; the latter covers
its refs, index, config and per-worktree administrative metadata. These two
identity-derived absolute denies supplement the absolute projection of
effective relative `deniedPaths`, and deny wins. The primary checkout, sibling
worktrees, home and global temp are outside the closed `canonicalWriteRoots`
allowlist and therefore default-denied without pretending that the entire
owning repository root is one deny prefix.

Both profiles require a surviving positive `turns` budget because each
admitted answer-bearing action reserves at least one bounded provider turn.
All other recognised budget keys remain sparse and action-dependent; the
later atomic admission reservation must be contained by the compiled map.

`FabricOperation` and the authority action ceiling are registry-derived, never
profile-owned hand lists. The exact ceiling for either profile is
`operationsForPrincipal("agent")` filtered by
`isDaemonGrantableOperation` from the protocol `OPERATION_REGISTRY`; a new or
removed registry row therefore changes the generated vocabulary and drift
fixtures atomically. Effective `actions` are the literal intersection of that
ceiling with the human envelope, selected risk rule and task request. At least
the action's already-authenticated `fabric.v1.provider-action.dispatch`
authority must survive or compilation rejects `authority-insufficient`.
Provider-native read, shell, edit and patch tools are not `FabricOperation`
values and never enter this array; the requested profile compiles those tools
only into the exact native settings. The operator-only external-effect service
and operator action operations are outside the agent ceiling, and a provider
dispatch grants no external-effect capability by implication.
