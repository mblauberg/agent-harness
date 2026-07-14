
This is a pre-release implementation. The Console requires its exact current
project/run/session projection and evidence-review features. It presents a
typed protocol/schema cutover-required state for an obsolete daemon or
database; it shall not retry a vintage profile, translate legacy projection
shapes or infer/import a session from an old run. The runtime leaves rejected
state untouched. Fabric receipt schema version 2 is likewise the sole current
receipt; no v1 decoder/import/projection is retained. Current independently
optional integrations remain negotiated and visibly unavailable when absent.

The Console is local and project-scoped. GitHub is an optional project adapter,
not a prerequisite or authority store. No browser application is included in
this scope. A later client may consume the same operator API only if evidence
shows that the TUI cannot provide an acceptable operator experience.

## 2. Outcome

Give one human a concise, continuously current control surface from which they
can understand a project's position, see what requires judgement, start and
observe agent work, review artifacts, respond naturally or through typed
actions, and operate routine Git workflows. Agents retain autonomy over
decomposition, topology, routing and replanning inside a broad approved project
envelope.

The design optimises human attention rather than maximising approval events.
Google's agentic architecture guidance distinguishes dynamic orchestration,
where agents plan and delegate, from human checkpoints for
subjective, high-stakes or final decisions. This Console applies that split:
routine work continues autonomously; only affected dependency subtrees wait at
genuine human gates.

Sources:

- [The New SDLC With Vibe Coding](https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding)
- [Google Cloud: choose a design pattern for an agentic AI system](https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system)

## 3. System boundary

```text
project artifacts + Git/GitHub + Herdr + Fabric
                         |
                 operator projection
                         |
             agent-fabric-console (TUI)
                         |
           typed, revision-bound commands
                         |
                Fabric transaction owner
```

### 3.1 Canonical owners

| Concern | Canonical owner |
| --- | --- |
| Approved intent and one-way decisions | Project specs and ADRs |
| Delivery lifecycle, evidence and acceptance | `.agent-run/<run>/RUN.json` |
| Project-session lifecycle, live tasks, agents, messages, leases and operational gates | Fabric SQLite through the daemon |
| Coordination evidence | Fabric receipt |
| Repository state | Git |
| Hosted collaboration | Optional GitHub adapter |
| Pane placement, process presence and visibility | Herdr |
| Human projection and commands | Console; never canonical state |

The Console shall never write SQLite directly or infer task completion from a
pane. It shall use a distinct authenticated human-operator principal, never a
chair or agent identity. Its independently revocable capability shall separate
read, decide, steer, pause, cancel, launch, takeover and external-effect
actions, bind the exact project and generation, and expire no later than the
project session. A takeover grant also binds the handoff digest, expected chair
generation and compare-and-set revision. It
shall label every projected fact with source, revision and freshness: `live`,
`snapshot`, `stale`, `unavailable` or `conflict`.

### 3.2 Package and process boundary

The implementation shall preserve these independently versioned seams:

```text
agent-fabric-protocol   shared schemas and typed clients
agent-fabric-daemon     coordination authority and persistence
agent-fabric-console    standalone operator TUI
agent-fabric-herdr      thin Herdr control and presence adapter
```

They may remain in one repository for atomic compatibility tests. The Console
shall communicate through public protocol clients and shall not import daemon
internals. It shall run in any terminal; Herdr integration is optional.

## 4. Project sessions and accountable topology

The Console presents one selected project at a time. A trusted-project switcher
may change context, but v1 shall not aggregate a cross-project portfolio.

A Console project view may contain either topology:

1. **Coordinated session:** one Fabric coordination run and chair supervise
   multiple concurrent delivery runs or workstreams. Each workstream may have a
   lead and a bounded team, but it is not another chair authority.
2. **Independent sessions:** unrelated or deliberately isolated runs each have
   one chair and separate fabric session authority.

The project-scoped Console connection remains open in both topologies. When
exactly one attachable project session exists it may open a secondary session
client automatically. With zero or multiple attachable sessions it remains on
the project projection until the operator selects a stable session ID. Every
run projection, row summary, detail reference and detail carries that exact
session ID. Selecting a run opens only its secondary session client; returning
to the project selector closes only that secondary client.

The Console is a projection-only client. The project-session lifecycle is a
Fabric-owned protocol entity persisted by the daemon before its first run is
created. Each Fabric coordination run retains exactly one accountable chair.
In coordinated mode, every `.agent-run/<run>/RUN.json` records its parent
project session, coordination run and Fabric task/workstream owned by its lead;
the chair alone retains run-level authority and barrier accountability. In
independent mode, each coordination run has its own chair and no implicit
cross-run authority. Coordinated mode is the recommendation, not a hard
default.

Pressing `Start project session`, or launching an independent-mode run, is the
human starting that coordination chair. In coordinated mode, `Launch run`
creates a delivery run/workstream with a lead under the existing chair; it does
not create another chair. The Console submits the reviewed launch packet,
Fabric records and validates authority, and Herdr or a provider adapter performs
the external process action. The Console shall not autonomously invent a chair
or broaden its authority.

Parallel source writers shall use non-overlapping write scopes and separate
repository-owned `.worktrees/<task-agent>` worktrees when the project/session
launch packet grants worktree creation. This spec's human acceptance approves
that capability as an available envelope field; each active project/session
still records its chosen grant. Without it, the chair shall serialise
application or exchange immutable patch artifacts. Read-only workers do not
need worktrees. The fabric shall reject overlapping active writer leases before
launch.

## 5. Adaptive task intake and execution

### 5.1 Conversational intake

The Console shall provide a task input with an expandable structured plan. The
human may instead open a detailed form or choose `Discuss/scoping first`.

Each intake is a Fabric-owned revisioned entity with a stable `intake_id` and
states `draft`, `awaiting-chair`, `discussing`, `awaiting-human`, `accepted`,
`deferred` or `cancelled`. `Discuss/scoping first` commits a correlated Fabric
request containing that intake revision, gate and artifact references before
Herdr focuses the chair. Chair replies, revised plans and artifact digests
update the same intake. Duplicate submission is idempotent; restart or
compaction resumes the persisted state instead of creating another discussion.

The chair assesses:

- intent, uncertainty and risk;
- task size, expected duration and oracle quality;
- decomposition and useful parallelism;
- specialities, model families and review pressure;
- write scopes, worktrees and repository interactions;
- likely gates, evidence and completion conditions.

The resulting plan is a forecast, not a lock. It exposes current topology,
models, worktrees, authority, outputs and checks. The chair may revise it as new
evidence appears.

### 5.2 Chair autonomy

Within the project/session authority envelope, the chair may without human
approval:

- work solo or enable/disable paired-primary collaboration;
- add, retire, replace or reroute agents;
- appoint run leads and form bounded leader teams;
- adjust ordering, parallelism and review strategy;
- create approved branches and worktrees;
- allocate routine Git work;
- increase or reduce resource use within configured ceilings;
- replan after failures, discoveries or changed estimates.

Resource authority is persisted hierarchically from project to project session,
coordination run, team and agent across concurrency, provider turns, tokens/cost
where reported, and any project-defined dimension. Child limits only narrow the
parent. Admission atomically reserves aggregate capacity before dispatch and
releases or reconciles it after terminal/ambiguous effects and restart. Unknown
usage is shown as unknown and fails closed for new provider turns when the
remaining parent capacity cannot be proven; already-authorised in-flight work
may reach its bounded terminal state. The Console shows used, reserved,
remaining and unknown capacity at each level.

Paired programming is chair-selectable within authority and is not a default
requirement. The human may pin or prohibit a pair, chair family, model family,
visibility mode or resource ceiling at project, session, run or task level.
Preference precedence is `task > run > session > project > harness`; lower
levels may narrow authority automatically. Resolution is
intersection/minimum/earliest-expiry only; no lower layer overrides platform
policy, explicit human authority or a mandatory safety gate.

Human acceptance of this spec is the constitutional decision to amend the
harness so that `paired-primary` is chair-selectable inside an approved
project/session authority envelope rather than separately human-opt-in for each
use. Risk-required other-primary review remains distinct from live paired
programming.

### 5.3 Automatic continuation versus fresh implementation context

Routine, minor and reversible work may proceed automatically in the current
chair session when it:

- needs no spec or ADR decision;
- remains within one bounded write surface;
- has a strong objective oracle;
- needs no migration, external effect or destructive Git action;
- does not introduce an auth, privacy, legal, financial or release boundary.

Substantial or larger work shall not flow directly from scoping into
implementation. It shall create an accepted scope artifact and launch a fresh
implementation session from a compact, digest-bound handoff. Fresh means a new
provider context/session; it does not mean deleting or mutating the scoping
session. The old session remains resumable or is closed under retention policy.
Within a coordinated run, that fresh context is a lead under the existing chair
or replaces the chair only through checkpoint, handoff and generation-bound
takeover. An independent coordination run may start its own chair. No Fabric
run ever has two concurrent chairs.

A fresh implementation session is also required when any of these apply:

- a spec or ADR controls the work;
- multiple concurrent writers or worktrees are proposed;
- the work crosses major modules or is expected to span sessions;
- migration, weak-oracle or crucial-tier behaviour is present;
- the scoping context is materially polluted or near its safe context limit.

The chair may choose a fresh session earlier. A deterministic policy sets the
minimum; model judgement may escalate but not silently weaken it.

## 6. Scoping and artifact review

Extended scoping and grilling occur in the interactive Claude or Codex chair
pane, not in a second chat implementation inside the Console. The Console shall
open or focus that pane and display `scoping`, open decisions and artifact
status.

The chair shall persist decisions into project artifacts. Pane scrollback is
not authoritative. The Console shall provide an artifact view containing:

- rendered spec and ADR files;
- the diff since the previous review;
- open decisions and review findings;
- exact paths, revisions and digests;
- `Discuss`, `Accept`, `Request changes`, `Defer` and `Implement...` actions.

Artifact bytes are read only through negotiated
`artifact-content-read.v1`. The Console requests pages of at most 131,072 UTF-8
bytes and 2,000 lines, follows only daemon-issued monotonic cursors and can
continue until `nextCursor` is null. It never opens a project or private path
directly. Feature absence, unsupported/unsafe content and unavailable pages
leave the metadata view usable but visibly incomplete.

Every content pane displays, adjacent to the bytes, the exact source path and
digest, evidence revision, publisher provenance, evidence kind, current page/
coverage, source and complete-rendering sizes, complete-rendering digest and
the transformation label. The source digest is explicitly labelled as
certifying the immutable source, not displayed bytes, whenever transformation
is not `none`. Each returned page digest is verified before display; after all
pages, their ordered bytes must reproduce the complete-rendering digest.
Missing, duplicate, skipped, reordered, stale or cross-artifact cursors discard
the local review coverage and require a fresh detail/read sequence.

`Accept` and `Implement...` remain disabled while any content page is missing,
unverified, stale, unsafe or unavailable. A terminal-neutralised complete view
requires a distinct explicit confirmation that names the transformation and
source digest. A capability- or credential-redacted view cannot be accepted or
implemented from the Console because material source bytes are hidden;
`Discuss` and `Request changes` remain available to obtain a clean replacement.
The confirmation preview records complete page coverage and the verified
source/rendered digests but the reads themselves create no acknowledgement or
authority. Resize, detach and restart preserve only cursor/review UI state that
still matches the exact evidence revision; they never convert it into approval.

Natural-language acceptance in the active chair conversation may satisfy a
gate only when a contract-tested provider/Herdr integration identifies it as
direct human input and binds it to the operator principal, expected revision,
exact gate and artifact digests. Echoed text, agent-authored text, unavailable
direct-input provenance, raw pane scraping or CLI/pane-injected text cannot
approve. The integration must attest the operator input channel independently
of terminal content. The adapter shall record the provider message ID, exact
human utterance, artifact digests and interpreted decision. Ambiguity shall
trigger clarification and shall not silently approve. One-way, destructive,
external-effect, release and final-acceptance decisions require an interpreted
decision preview showing the gate, revision, digests and consequence plus an
explicit confirmation; low-consequence decisions may commit directly when the
gate reference is explicit. The human may always use the typed Console action.

After acceptance, `Implement...` shall prepare an editable launch packet. It
may target the current chair for minor work, a fresh lead/provider context under
the coordinated chair, a handoff-based chair replacement, or an independent
run chair. The prompt shall reference artifact paths and digests and require the
receiving owner to reopen them. It shall not paste large artifacts into the
prompt.

Fresh external implementation review is a Fabric review task, not an
unattributed provider transcript. Through the authenticated current chair,
Fabric seals `delivery-requirement-map.v1`,
`coordination-gate-snapshot.v1` and
`implementation-delivery-manifest.v1`, then creates the review task. Callers
cannot supply their bytes, Git base or evidence list. AFAB-004's immutable
approved run-start base is
`c2fc623a2529f87feca27982e1a140969ab5a258`. Fabric proves the publication-time
principal/bridge/provider-custody lineage; an operator-, Fabric-, project- or
Git-published root remains honestly unproved and cannot satisfy this profile.
Git diffs and other evidence remain valid covered inputs.

Requirement-map seal is current-chair-only and requires expected generation
zero iff none exists, otherwise the exact current generation. It hashes a
generation-free catalogue/scope/source/requirement/evidence closure before
allocation: an equal closure reuses the current map, and only a changed closure
allocates current plus one. Command-ID churn cannot stale a completed basis.

The seal derives the exhaustive profile/catalogue requirement/evidence closure,
pre-review gate snapshot and clean canonical Git base/head state, then commits
the immutable review basis. `review-target.prepare` accepts only that current
sealed basis, with expected target generation 0 when none exists and the exact
positive current generation otherwise. It performs bounded DB-only admission,
reserves never-reused target/bundle generations and promptly returns one
immutable accepted preparation receipt; it does not build the bundle inside the
30-second public request. The Console polls only
`review-target-preparation.read` and renders the durable states as Preparing,
Building, Committing, Succeeded, Conflicted or Failed. It shows no percentage or
ETA. `phase-only` shows only the label. `finite` shows exactly
`n/m verified build items` from the immutable plan and never derives another
unit. Terminal detail uses only the closed conflict causes (target, chair,
task/authority, delivery basis, source, profile, predecessor head/action) or
failure causes (bundle size, unsupported repository state, source
   read, content integrity, certifying capability unavailable).

The daemon worker derives the complete changed-file and required-evidence set
and builds one bounded `review-bundle.v1`. Exact before/after/diff/evidence
objects are content-addressed and chunked; a coverage digest proves the complete
manifest. Changed files use the checked-in `review-diff.v1` codec with exact
status/mode/binary/rename/path/order/digest semantics and immutable full-base/
head conformance fixture. The final target dynamically computes the actual
approved run-start-to-sealed-HEAD counts/bytes; a prior delivery-HEAD measurement
is not a gate. The request accepts no summary or caller-selected file list.
Omission, truncation, dirty or changed source/evidence fails. Recovery resumes
the same preparation/generations and may expose only one complete target or a
terminal conflict.

Source, delivery, unrebindable chair or adapter-contract/profile advance makes
the current target stale without mutation; only successful preparation Phase B
persists it superseded while inserting a successor. At true-chair lifecycle
adoption Fabric captures the exact run terminal-sequence certification cut and
either appends a contiguous same-agent/same-subject chair binding or leaves the
target stale. Lifecycle never waits, rolls back or gates on review actions.
The daemon and Console use the exact idempotent `review-target.rebind` receipt;
an already-applied automatic adoption returns that same custody-keyed receipt,
and the Console never supplies family/profile/source/bundle/head claims.
Already-current evidence at/before the first successor cut remains certifying
through the digest-valid chain; post-cut old-binding output is permanently
noncertifying but settles and retains adverse findings. Preparation may wait at
Committing for existing action ambiguity; it cannot leapfrog recovery.

Bundle bytes stay behind the action-pair-only digest-bound portal, so the fixed
rubric/target/profile envelope fits the prompt limit. Every portal read names
the exact bundle, root/page, object and chunk digest. Mandatory consumption is
the complete manifest/read map, delivery manifest/map, required scope/spec/ADR/
decision/gate records and the content-addressed finding-set root plus every page
containing every full carried finding. No fixed finding-count cap or truncation
exists.
A daemon-owned immutable bundle search/risk map then
selects exact highest-risk diff chunks from every nonempty group by checked-in
score/path rules; at most 32 chunks/2 MiB are mandatory.
Zero/insufficient reads cannot certify. Literal bundle search and all other
diff/before/after objects remain available for deeper review.
`certifying-review-packet-only.v1`
binds each activated adapter contract. A daemon-built per-action 0700 synthetic
HOME may contain only exact 0600 adapter auth/config bytes outside the model
read/tool namespace; the model sees only the exact portal. Claude SDK/Codex app-
server may use direct dynamic tools only with identical schema, ledger, source-
denial and cleanup canaries; Codex must prove confinement independently. For
Cursor/Agy, the outer daemon launches the contract-pinned std-only Rust
`agent-fabric-review-portal-supervisor`, persists stopped-child PID/start/PGID/
session/executable custody before exec, and gives the supervisor private control
FD 3 with `CLOEXEC` before provider exec. The provider MCP manager launches that
same binary in fixed `portal-stdio-v1` mode with exactly the non-secret action-
socket/action-pair/contract locators. No inherited provider descriptor or
bearer is used. A one-use AF_UNIX broker verifies local peer credential/PID,
UID, start time, PGID/session, ancestry and exact executable identity. Their
exact model allowlist is
`mcp(agent-fabric-review-bundle/review_bundle_read)` and
`mcp(agent-fabric-review-bundle/review_bundle_search)`; every other MCP,
command, filesystem, web/network, resource and prompt effect is denied.
Discovery returns that one server/two tools; list probes for resources/templates/
prompts return empty. Any extra surface, successful denied effect or outside-
portal/auth-file read invalidates the action.
Portal requests are exactly one UTF-8 JSON object plus LF with no batch,
duplicate key or trailing bytes. ID is integer `0..2147483647` or a 1..64-byte
ASCII `[A-Za-z0-9._:-]` string; response is exact JCS plus LF. Read payloads use
RFC 4648 padded base64 and at most 65,536 raw bytes. Generated templates, not a
prose metadata allowance, prove the complete response is at most 98,304 bytes.
Preparation reserves the maximum 64-byte-ID form; ledgers debit exact canonical
wire bytes for the actual ID. Direct tools receive the same equivalent charge.
Search retains its separate 65,536-byte response limit.
Missing enforcement advertises false, fails before provider I/O and never
falls back. Control EOF/HUP, deadline, cancellation, provider or supervisor
death triggers TERM, 250-ms wait, KILL, reap and socket/capsule removal. Startup
verifies PID plus start time before signalling and treats mismatch as integrity
failure. Recovery also no-follow verifies the private custody directory path/
device/inode and relative socket/capsule names/digests before removal. Canonical
crash-custody metadata never appears in Console, model input or receipts; only
the three minimum non-secret broker/action/contract bootstrap locators enter the
isolated helper environment and confer no authority. A passing canary proves daemon/supervisor crash cleanup and that no
pinned child can escape via `setsid`, double-fork, daemonisation or reparenting.
The model has no executable
tool. Seatbelt/`sandbox-exec` is usable only under an exact-OS-version passing
canary. Agy requires proved direct execution or one exact pinned fixed-argv
trampoline if its hook transits `/bin/sh`. A provider process that also exposes
model web tools needs provider-native separation proof or a destination-
constrained API proxy. The narrow hardened shim is a `std`-only Rust opaque
relay for bounded binary framing/FD/process/peer checks; TypeScript owns JSON-
RPC/MCP/hook semantics and journalling. Stock Cursor/Agy routes remain
capability=false until the pinned supervisor/helper and outer confinement pass every
current-build canary.

One target has one logical bundle/root: up to 64 MiB unique objects, 16 MiB per
object, 16,384 objects and 32,768 deterministic chunks, never a bundle chain.
The mandatory set is at most 80 unique responses/6 MiB. Direct primaries reserve
up to 112 portal calls plus 16 planning/final turns; helper routes reserve 128
internal calls. Their guaranteed exploration headroom is respectively 32 or 48
calls/4 MiB, with a 10 MiB combined wire-byte ceiling; search consumes it and
is capped at 16 calls/1 MiB aggregate.

The target owns an immutable review subject plus one append-only active chair-
binding chain. Generation one snapshots the exact chair agent/principal/lease/
provider-session/bridge generation, adapter/contract/family/model and the
resolved checked-in `spec05-four-slot-v1` profile. Its slots are `native`,
`other-primary`, `cursor-grok` and `agy-gemini`; for an OpenAI chair they
resolve respectively to the native Codex route, Claude/Anthropic,
cursor-agent/`cursor-grok-4.5-high`/xAI and
Agy/`Gemini 3.1 Pro (High)`/Google. Native is explicitly exempt from
the reviewer-family relation; each external slot must differ from the target-chair
family. Publisher eligibility separately proves the root publisher equals that
target family, so no duplicate publisher-independence flag exists. Any chair
change outside the exact same-agent lifecycle-binding rule makes the target
stale; only a successful successor preparation supersedes it.

Each resolved slot displays requested effort plus the tagged result:
`applied(<value>)` or `inapplicable`. Inapplicable always has a null request.
The Console never fabricates a sentinel or infers effort from a model label.

Turns, mandatory/exploration reads and exact response bytes are separately
reserved/debited before provider I/O. Mandatory unique reads cannot be spent by
search/duplicates. An adapter or delivery that cannot meet
the mandatory/risk predicate is unavailable, not silently one-shot or falsely
byte-complete.

Before router I/O, a normal review action reserves space for all 32 possible
new safe findings and resulting paged set roots. Failure shows target-wide
`finding-capacity-exhausted`, creates no action/budget and raises the genuine
private-store capacity gate when minimum recording space is exhausted. While
blocked, the Console may offer only an explicitly labelled resolution-only
window over at most 32 existing digests: it admits zero new findings, cannot
certify completion and requires a later normal CLEAN. It never offers truncation
or deletion of a referenced finding.

The Evidence header projects required-slot capability independently of target
existence. If a slot is unavailable it shows top-level
`certifying-review-capability-unavailable` and a profile-ordered
`unavailableSlots[]` row with adapter, contract, family, model and exact safe
reason plus profile/schema, chair family, source/runtime/platform identity and
availability revision. It does not reduce this to `missing-target`. Preparation is disabled
with the same reason before any action, budget or provider I/O.

Only the current target chair at the active binding may dispatch a new
certifying action. Every UI, protocol, recovery and receipt reference displays
the canonical `(adapterId, actionId)` pair; action ID alone is never treated as
identity. The shared
`model-route.v1` codec validates structural routing data only; effort
applicability, artifact/target currency and exact adapter/family/model/profile
agreement are rechecked transactionally after the bounded side-effect-free
router, and resolved adapter must equal the requested action adapter and slot.
Pre-router single-flight is global by provider action pair and binds run plus
authenticated actor/principal/full input: cross-run reuse conflicts before a
second router, while another adapter may reuse the same action ID. One per-
target/slot action-attempt CAS prevents concurrent actions from
running against one evidence head.

Terminal review reads expose safe CLEAN/FINDINGS/UNUSABLE result digests only.
A proved terminal failure has exactly one of `max-turns-exhausted`, `provider-
rejected`, `terminal-no-answer` or `adapter-terminal-failure`; it is distinct
from effect ambiguity and from the broader routing/substitution catalogue.
Every proved-effect safe/UNUSABLE/failure terminal
settles complete authenticated usage exactly or conservatively consumes the
remaining reservation when usage is absent/partial; proved no-effect releases,
while true ambiguity retains. It exposes only the closed result/failure digest
and is never redispatched. Raw answers, errors, bundle objects and final prompts
never enter the Console.

Provider terminal failure closes only its attempt. It creates no evidence and
does not advance the evidence head; its receipt/slot row shows the exact four-
code failure, stable terminal sequence/result digest and explicitly unchanged
head/open/repair set. Safe/UNUSABLE evidence rows show immutable certification
basis at terminal separately from the live current basis: active binding,
predecessor cut/chain or noncertifying post-cut. The UI never
labels a post-cut terminal current merely because a later binding is active.

The other terminal noncertifying states are proved no-effect, route-integrity
terminal and retired-unknown. Permanent provider-effect ambiguity remains
ambiguous with its reservation held until an exact consequential
provider-route-integrity-retire Preview/Commit receives direct-human
confirmation. Retirement performs no provider call, charges the full remaining
ceiling and exposes retired-unknown; it never fabricates no-effect. This is a
genuine review-and-liveness gate: while open it blocks slot dispatch, target
reprepare, review/run acceptance or close, and the budget. Retirement or
proved terminal reconciliation is the only escape from unprovable effect.

Every CLEAN, FINDINGS or UNUSABLE provider terminal transaction automatically
inserts evidence and linearly CAS-advances one per-target/slot head before the
result is visible. There is no chair-skippable terminal result. It names the
prior head, separately reports provider-reported and daemon-accepted resolution
sets, and carries complete prior/new open sets. Insufficient-read CLEAN becomes
UNUSABLE and resolves nothing. Safely parsed insufficient-read FINDINGS stays
visible/noncertifying, resolves nothing and adds every safe finding. An in-
flight answer whose target becomes stale still settles and advances its
reserved head; it resolves nothing, is stale/noncertifying and carries safe new
findings into the successor target. Concurrent attempts
conflict; a second FINDINGS action advances from the returned head. Every safe
P0-P2 is automatically repair-required; no chair annotation can downgrade it.
A repaired target carries full safe ID/severity/summary/evidence plus origin
action/result/manifest/basis/bundle and exact repair currency in mandatory
finding pages. Every repair requires later manifest/basis/bundle; source/mixed
requires Git source advance and evidence/mixed requires each named registration
to advance revision and content. Git-only change cannot repair evidence-only.
Only then may CLEAN resolve the digests.
Evidence detail resolves those safe records only through scoped
`review-finding-page.read`, follows the set's exact ordered page digests and
shows an integrity error rather than partial content on a missing/crossed page.
Target reprepare rejects an unresolved old action. Optional chair annotation is
non-gating and separate: its exact disposition is `substantiated`,
`unsubstantiated`, `duplicate` or `needs-more-evidence`. The Console shows the
one current append-only annotation revision/note/digest beside live evidence;
it cannot change or appear in completion or receipt v2. The mutation receipt is
immutable; currency appears only on fresh read/list/operator projection.

The Console reads review state only through its scoped operator Evidence
row/detail projection. Rows show slot/head, target chair/profile,
current/superseded, certifying, answer safety or terminal-failure code,
CLEAN/FINDINGS/UNUSABLE, P0-P2/open counts, provider/model, reviewer-family relation and
artifact/bundle/coverage/answer/result digests. Detail adds task/action, safe
pair, current annotation, active/action binding certification cut, paged
findings, route/final-prompt, admitted read-only authority-compilation ref and
publication lineage. A third recovery-action
row carries only the live recovery projection and retirement eligibility.
Malformed fields reject
the whole variant.

The Evidence header displays the exact `reviewCompletionV1` response as
`Final review: Complete` or `Blocked`, including target chair, artifact,
bundle/coverage/profile digests, top-level ordered blockers and, when a target
profile exists, its four slot-head rows. Missing target or unavailable profile
uses the closed empty-slot branch, so the header still shows the reason.
Unavailable required capability uses the distinct typed blocker/slot list above.
Finding-capacity exhaustion uses its target-wide empty-slot branch. A
trustworthy target whose binding/profile/head structure is corrupt retains its
immutable target/artifact/bundle fields but shows chair/profile null, empty
slots and top-level integrity-failure; multiple/no trustworthy targets use the
target-null integrity arm. Top-level and slot blocker vocabularies are disjoint,
and historical superseded currency is never shown as a completion blocker.
`open-findings` is the only finding blocker;
`provider-terminal-failure`, `terminal-no-effect` and `retired-unknown` are
distinct from `ambiguous-action`;
`authority-compilation-missing` and `authority-compilation-drift` are the exact
closed receipt/configuration blockers and are never collapsed into generic
noncertifying. The Console
does not recompute, choose a latest timestamp or hide a blocker.

Every certifying action is recovery-owned before generic provider recovery.
Prepared zero-dispatch proof closes no-effect; dispatched/accepted ambiguity
gets at most one pair lookup; valid answers use the same automatic terminal
transaction. Unresolved effect reaches the direct-human retirement gate above.
The Console never offers a generic retry/resume for that custody. It displays
the live scoped recovery-action row with pair, target/slot/attempt, recovery
generation/state/reason, reservation, route/lookup/settlement/evidence fields.
Retire is visible only when that live row says `awaiting-human-retire` and
eligible; Preview/Commit binds the same generation/state/reservation. Receipt
recovery history is audit-only and never enables an action.
The schema-v2 Fabric receipt exports this same reducer under
`reviewCompletion`, exact safe route/review rows under `providerRoutes` and
`providerReviews`, and safe recovery digests under `routeIntegrityRecoveries`;
the Console does not invent alternate receipt
fields. Receipt v2 validates standalone with literal local objective/provider/
operator catalogues and no resolver; unknown future codes fail instead of
being displayed as current truth. Raw provider-specific detail stays private
behind its evidence digest.

A direct Claude, Cursor, Gemini or other provider CLI may be used only when
Fabric is unavailable and the chair records the degraded reason. Its output may
be registered as an ordinary review artifact for diagnosis, but it is visibly
`non-certifying`, cannot create provider-review evidence and cannot satisfy the
fresh other-primary, cross-family or no-unresolved-P0-P2 completion gate. The
review must be rerun through Fabric before completion; post-hoc import,
self-attested family and caller-selected independence are unavailable.

## 7. Human-attention policy

Human intervention is required for judgement or consequential boundaries, not
ordinary replanning. At minimum, gates cover:

- unresolved intent or material subjective trade-offs;
- spec and one-way architectural decisions;
- new trusted roots or confidential-data disclosure;
- provider login or credential entry;
- destructive Git/history operations;
- non-pre-authorised push or merge;
- release or deployment of an artifact or target not covered by its exact
  final-acceptance and release gates;
- external communications;
- irreversible actions and final acceptance.

Routine topology, model, worktree, test and implementation changes shall not
create blocking gates. Material authorised changes may notify without blocking.
A pending task-scoped gate blocks only its dependent subtree or barrier;
unrelated runnable work continues.

Each gate therefore records `scope_kind` (`task`, `subtree`, `run` or
`release`), affected task IDs, dependency revision, blocked operation IDs and
enforcement points (`task-readiness`, `operation` and/or `scoped-barrier`). The
daemon checks gates before task claim/start/resume, before a named consequential
operation and before scoped-barrier closure. The affected task and, when the
scope requires it, its dependent descendants are blocked; unrelated siblings
remain runnable. Run closure evaluates the union of scoped barriers and does
not treat an unrelated task gate as a global stop. Gate creation/resolution and
dependency changes are transactional, and negative tests exercise each
enforcement point.

Every gate shall include the question, affected run/task/subtree, reason,
options, recommendation, consequences, evidence, revision, approver and any
deadline/default. No gate auto-approves on timeout.

The Console shall permit typed responses and natural-language responses. Every
operator command shall carry the operator capability, a stable command ID,
expected revision, actor, provenance and before/after audit event. The daemon
shall authorise the exact action and project before mutation. Duplicate
commands have one effect; stale revisions fail closed and show the changed
state. Negative tests shall cover absent, expired, revoked, wrong-project,
wrong-generation and action-insufficient operator capabilities.

## 8. Operator experience

The default `Attention` view shall let the human identify project, session,
active runs, current phase, owners, next milestone, health and required
judgement within 10 seconds.

It shall group duplicate events into one attention item and order items by:
safety/integrity, critical-path blocked, expiring authority, acceptance-ready,
then advisory. Every row is labelled `Decision`, `Approval`, `Blocked` or `FYI`
and shows source freshness plus last-event age. Progress displays current/next
milestone and declared finite counts only; it shall never infer a percentage
from message volume, elapsed time or agent activity.

Required views are:

- **Attention:** decisions, blockers, quarantines, expiring authority and
  acceptance-ready work.
- **Project:** goal, explicitly registered accepted-scope ref, work map,
  repository and optional GitHub summary.
- **Runs:** active/history runs, leads, dependencies, evidence and completion.
- **Work:** task graph, write scopes, worktrees, barriers and checks.
- **Agents:** chair, leads, workers, provider/model, state, current task,
  context pressure and pane/session references.
- **Evidence:** registered project/run artifacts, private Git diffs, tests,
  reviews, receipts, revision, publisher provenance and content safety/coverage.
- **Activity:** readable messages, decisions and lifecycle events.
- **System:** daemon, adapters, trust, seats, expiry and degraded integrations.

The TUI shall remain fully usable at its default/reference viewport of 80x24
with a keyboard, visible focus and non-colour urgency indicators. At other
sizes it shall use the available rows and columns, reflow and expand or compact
master/detail content, and recompute pointer regions without hiding required
identity, freshness or action fields where the current geometry can display
them. `SIGWINCH` and equivalent resize events shall preserve selected stable
IDs, focus owner, scroll positions, input draft and pending command state;
shrinking clamps layout and scroll safely and shall not submit, repeat or
discard an action. Smaller-than-reference layouts may collapse panes or require
scrolling, but shall remain bounded, retain the Detach binding and terminal
restoration path, and show Help/Detach affordances whenever geometry permits.
Any normalised geometry at least 30 columns by 6 rows is usable compact mode;
30x6 is the exact minimum. Fewer than 30 columns **or** fewer than 6 rows enters
clipped inert mode. Zero, undefined, negative, non-integer, overflow or otherwise
invalid/extreme dimensions also normalise to inert without allocating from the
reported value. In inert mode `q`/Detach and terminal restoration remain live;
all Fabric/state-changing controls, mouse activation and submit are inert.
Resize into/out of inert preserves selected stable IDs, focus owner, scroll,
input drafts and pending-command identity without dispatch, repeat or discard.

It shall also accept mouse input inside and outside Herdr: click to
focus/select/activate, wheel to scroll, and pointer actions for tabs, lists,
links, buttons and split resizing where the terminal supports them. Mouse and
keyboard actions shall use the same command, confirmation and audit paths;
pointer input cannot bypass a consequential-action review. Mouse capture shall
be configurable and preserve an explicit terminal text-selection gesture. No
required information or action may be hover-only.

Normal message bodies shall be readable on demand; default list previews remain
bounded and terminal-neutralised. The UI shall not suppress ordinary content
merely because the machine is private, but shall not render capability tokens
or unrelated credential values.

Closing the Console detaches the UI. It shall not stop agents or the daemon.
`Stop project session` is a distinct action that shows checkpoint, drain,
evidence and worktree consequences before execution.
