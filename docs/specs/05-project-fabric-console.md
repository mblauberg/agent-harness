# Project Fabric Console and adaptive session orchestration

Status: Approved; implementation in progress
Version: 1.9
Date: 13 July 2026
Risk: Crucial
Decision owner: Human maintainer
Design chairs: Codex with Claude Code adversarial review
Independent review: native architecture, operator UX and implementability;
Cursor Grok 4.5 High; Agy Gemini 3.1 Pro
Review result (v1.0): no unresolved P0-P2 on the approved revision

Version 1.9 keeps target preparation below the public request deadline by
projecting durable Preparing/Building/Committing state, preserves current
review evidence across proved same-agent chair rotation, and makes unavailable
certifying slots explicit instead of presenting only a missing-target symptom.
It also binds the helper portal to the hardened Unix-socket supervisor, shows
the canonical provider action pair and separate evidence annotation, and keeps
dynamic terminal resize behaviour unchanged. Version 1.8 binds final review to
a daemon-generated complete immutable
review bundle over the sealed delivery basis, clean base/head Git state and all
required evidence. A target snapshots its chair and closed four-slot profile;
linear slot heads carry complete open findings, and any source or chair advance
requires reprepare. One clean native review and clean Fabric evidence for
Claude/Anthropic, Cursor Grok/xAI and Agy Gemini/Google must bind that current
bundle/coverage digest. Raw answers/errors remain private, proved terminal
provider failure is not ambiguity, and one bounded recovery owner closes route
and intact certifying-action budget custody without replay. The Console reads only the operator Evidence
projection. Version 1.7 closes the already-binding v1.4 external-review lineage gap. Fresh
provider review dispatch now includes an exact reviewed-artifact reference and
strict router request; the daemon binds its trusted-router receipt to the
answer-bearing action before provider I/O. After the terminal answer, the chair
records only exact references plus a bounded adjudication disposition. Fabric
derives provider/model identity, answer/result digest and structural
independence, then exports the immutable lineage. Direct provider CLI review
remains a degraded, non-certifying artifact. This is a current Spec 05
hardening clarification, not approval of proposed Spec 06 continuity-routing
capabilities. Version 1.6 records the live MCP review finding that provider turns can exceed
the binding 30-second public request maximum. Review dispatch therefore returns
the durable action receipt promptly and the chair reads that exact action until
its bounded terminal answer arrives; timeout, disconnect and polling never
redispatch. Version 1.5 closes the implementation-review placeholders for
Pause/Resume,
Attention decisions and evidence Discuss/Request changes. Run control uses the
existing revision-bound operator preview/commit path. Attention actions read
and resolve only the exact daemon-projected open gate and revision. Discussion
and requested changes read the exact intake then commit one atomic revision
with a correlated successor chair request derived from daemon-owned state; the
Console never guesses a chair, provider session, conversation or authority.
Version 1.4 records the implementation instruction that fresh Claude, Cursor
and Gemini reviews remain answer-bearing Fabric work. The chair creates an
exact review task and uses the current task-bound ephemeral provider action;
the durable action result and route evidence are reviewed independently. A
direct provider CLI is only an explicitly recorded degraded fallback. Version
1.3 records the human's pre-release simplification direction: Spec 05
ships only the current Console/protocol/schema epoch. Old-daemon retry,
vintage-wire presentation and implicit legacy-state import are not product
requirements; incompatible state is preserved and rejected explicitly. This
does not weaken current optional-feature negotiation or adapter verification.
The project-scoped Console retains its project client, auto-selects only one
attachable session, and otherwise uses exact session-labelled run projections
plus an explicit selector. `run-session-projection.v1` is required; a peer
without exact run/session identity is incompatible. Version 1.2 closes the
implementation-review finding that bounded evidence
content, continuation, safety disclosure and acceptance behaviour must remain
owned by this Console specification rather than Spec 04. Version 1.1 records
the human's implementation clarification of 11 July 2026:
80x24 is the default/reference acceptance viewport, not a fixed-only terminal
size. The Console follows current terminal dimensions, reflows dynamically and
preserves operator state across resize events.

## 1. Decision and relationship to existing specs

Build a project-scoped operator Console as a separate executable package over
the shared agent fabric. The Console is the human's primary local view of
project state, active runs, agents, evidence and decisions. It may initiate
explicitly requested project sessions and typed operator actions, but it is not
another task orchestrator or authority store.

- Spec 01 remains the coordination, authority and provider-session contract.
  Its amendment in this implementation shall own project-session entities,
  operator principals, scoped gates, result-delivery state and atomic
  request/reply/task completion.
- Spec 02 remains the adaptive harness and delivery-lifecycle contract.
- Spec 03 remains the model-adapter activation and Herdr observation contract.
- Spec 04 remains the protocol, persistence, trust and operational-hardening
  contract. Its amendment shall own lock-safe on-demand bootstrap, global
  daemon liveness/stop predicates, persistence migration and crash recovery.
- This spec owns the project Console, operator projection, adaptive session
  launch, human-attention workflow, Herdr control integration and optional Git
  and GitHub operator adapters.

Specs 01 and 04 shall be amended and accepted before implementation can claim
this spec complete. Product requirements remain here; transaction, schema and
daemon invariants remain with their existing canonical owners.

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
ETA; a declared finite completed/total count is allowed only when the daemon
actually supplies it.

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

Source, delivery, unrebindable chair or adapter-contract/profile advance
supersedes the target and requires reprepare. A finalized adopted same-agent
lifecycle rotation is the exception: Fabric appends a contiguous chair binding
with the same agent/family/adapter/contract/model/profile/task/source/bundle and
preserves target, heads and evidence. Preparation racing rotation commits
against the adopted same-agent binding or conflicts. Already-current evidence
remains current; old-binding output terminalised after lifecycle adoption is
permanently noncertifying but retains adverse findings. No human gate is added
unless an existing ambiguous provider effect requires retirement.

Bundle bytes stay behind the action-pair-only digest-bound portal, so the fixed
rubric/target/profile envelope fits the prompt limit. Every portal read names
the exact bundle, root/page, object and chunk digest. Mandatory consumption is
the complete manifest/read map, delivery manifest/map, required scope/spec/ADR/
decision/gate records and bounded pages containing every full carried finding.
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
failure. A passing canary proves daemon/supervisor crash cleanup and that no
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
cursor-agent/`grok-4.5-xhigh`/xAI and
Agy/`Gemini 3.1 Pro (High)`/Google. Native is explicitly exempt from
reviewer independence; each external slot must differ from the target-chair
family. Publisher eligibility separately proves the root publisher equals that
target family, so no duplicate publisher-independence flag exists. Any chair
change outside the exact same-agent lifecycle-binding rule supersedes the
target instead of reinterpreting prior evidence.

Turns, mandatory/exploration reads and exact response bytes are separately
reserved/debited before provider I/O. Mandatory unique reads cannot be spent by
search/duplicates. An adapter or delivery that cannot meet
the mandatory/risk predicate is unavailable, not silently one-shot or falsely
byte-complete.

The Evidence header projects required-slot capability independently of target
existence. If a slot is unavailable it shows top-level
`certifying-review-capability-unavailable` and a profile-ordered
`unavailableSlots[]` row with adapter, contract, family, model and exact safe
reason. It does not reduce this to `missing-target`. Preparation is disabled
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
action/result in mandatory bundle objects, then CLEAN resolves the digests.
Target reprepare rejects an unresolved old action. Optional chair annotation is
non-gating and separate: its exact disposition is `substantiated`,
`unsubstantiated`, `duplicate` or `needs-more-evidence`. The Console shows the
one current append-only annotation revision/note/digest beside live evidence;
it cannot change or appear in completion or receipt v2. The mutation receipt is
immutable; currency appears only on fresh read/list/operator projection.

The Console reads review state only through its scoped operator Evidence
row/detail projection. Rows show slot/head, target chair/profile,
current/superseded, certifying, answer safety or terminal-failure code,
CLEAN/FINDINGS/UNUSABLE, P0-P2/open counts, provider/model, reviewer independence and
artifact/bundle/coverage/answer/result digests. Detail adds task/action, safe
pair, current annotation, active chair binding, findings, route/final-prompt
and publication lineage. Malformed fields reject
the whole variant.

The Evidence header displays the exact `reviewCompletionV1` response as
`Final review: Complete` or `Blocked`, including target chair, artifact,
bundle/coverage/profile digests, top-level ordered blockers and, when a target
profile exists, its four slot-head rows. Missing target or unavailable profile
uses the closed empty-slot branch, so the header still shows the reason.
Unavailable required capability uses the distinct typed blocker/slot list above.
`open-findings` is the only finding blocker;
`provider-terminal-failure`, `terminal-no-effect` and `retired-unknown` are
distinct from `ambiguous-action`. The Console
does not recompute, choose a latest timestamp or hide a blocker.

Every certifying action is recovery-owned before generic provider recovery.
Prepared zero-dispatch proof closes no-effect; dispatched/accepted ambiguity
gets at most one pair lookup; valid answers use the same automatic terminal
transaction. Unresolved effect reaches the direct-human retirement gate above.
The Console never offers a generic retry/resume for that custody.
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
Zero, undefined and ultra-small dimensions shall enter a clipped inert state
until a valid resize rather than allocating unboundedly or mutating Fabric.

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

## 9. Herdr integration

Herdr remains the visible process and pane surface. A thin integration shall:

- launch/focus the standalone Console in a pane;
- create and arrange chair, paired-primary and selected long-running worker
  panes;
- keep short mechanical workers headless by default;
- project bounded agent metadata and attention state;
- show native desktop notifications;
- focus the exact Console item or agent pane from an action.

The Console may request these typed operations, but Herdr owns pane placement
and process presence. Pane creation is not proof that a provider session exists.
Provider identity and actual model/session references must reconcile before an
agent becomes ready.

Prompts shall normally travel through Fabric to a managed provider adapter.
Direct terminal text injection is not a protocol-compatibility path. If kept as
an explicit degraded steering helper, it remains `dispatched-unconfirmed`,
requires an already tracked no-answer task/message reference and cannot satisfy
delivery, result or barrier state; only Fabric mailbox/request-result paths use
delivery states or acknowledgements.

### 9.1 Reliable paired request/reply

Any assignment whose result a chair or lead needs shall be committed before
wake-up as a Fabric task plus correlated request message. The request includes
task and revision, conversation and message IDs, expected output/artifacts,
`requires_ack`, dedupe key, response deadline and exact target session/agent.
Herdr may wake, focus or expose the peer; it is never the reply channel.

At a safe turn boundary, the peer integration shall pull and acknowledge the
request, then commit its correlated reply, terminal task result and pending
callback in one Fabric transaction or transactional-outbox invariant. A crash
between any of those logical effects shall replay one stable action rather than
expose partial completion. The requesting chair/lead integration shall
subscribe to or await that terminal result. It shall inject the unread result
at the requester's next safe turn boundary, waking an idle requester without
interrupting an active tool/model turn. The Console may show the result
immediately but shall not consume it for the requester.

The distinct request-result delivery obligation is persisted, not represented
by an in-memory callback and not conflated with Spec 01 mailbox delivery state:
`pending -> claimed -> provider-accepted -> consumed`, with `overdue`,
`abandoned` and retry recovery transitions. Claim generation,
request/reply/task revisions and stable callback ID make provider injection and
consumption idempotent across daemon, Console and requester restart or
compaction. A response deadline moves the obligation to `overdue`, alerts the
chair and keeps its dependent barrier open. The chair may retry the same stable
action, reassign or abandon with reason; it shall never blindly redispatch. A
late reply remains linked evidence but cannot silently complete reassigned or
abandoned work.

Pane status and scrollback cannot mark a reply delivered. An integration
without structured round-trip capability must declare degradation and use a
named artifact plus an explicit bounded collection step.

The direct Herdr prompt helper shall require an explicit `--fire-and-forget`
flag and caller-supplied task/message reference. The current shell helper marks
that reference unverified; the implemented Fabric-backed operation shall
validate it authoritatively before pane injection. It is reserved for steering
a tracked task where no answer is expected; the flag is an explicit operator
acknowledgement, not semantic prompt classification.

## 10. Git and optional GitHub adapters

### 10.1 Git

The Console shall expose status, diff, log, branches, worktrees, fetch, pull,
stage, unstage, commit, merge/rebase state, push and upstream tracking through
typed operations rather than an arbitrary shell.

An approved project/session envelope may pre-authorise routine branch,
worktree, pull, stage and commit operations. Push and PR merge require an exact
remote/branch or PR grant in the active run authority or a consequential-action
gate. Release and deployment cannot be covered by a broad project/session
envelope: they require canonical final acceptance plus digest- and target-bound
release authority. Force-push, destructive branch deletion, history rewriting
and removal of a worktree with unmerged changes require a consequential-action
gate.

Before mutation, the Console shall show repository, branch/worktree, expected
revision and affected state. The action receipt shall record the result.

### 10.2 GitHub

Projects may opt into GitHub Issues, Projects, pull requests, checks, Actions,
releases and repository metadata. GitHub outage or absence shall not stall or
corrupt the fabric. GitHub remains the higher-level hosted collaboration and
portfolio surface, while the Console owns live local orchestration projection.

## 11. Lifecycle and failure behaviour

Project session states are:

```text
draft -> awaiting_launch -> launching -> active -> quiescing
      -> awaiting_acceptance -> closed
```

Exceptional states include `launch_failed`, `launch_ambiguous`,
`reconciling`, `visibility_degraded`, `recovery_required`, `quarantined` and
`cancelled`.

These states and their revisions are Fabric-owned and persisted in the same
SQLite transaction domain as runs and leases. The Console derives no lifecycle
state from local UI files. Draft launch content may live in a project artifact,
but its Fabric session record owns status, identity and active revision.

Project-session membership explicitly lists every coordination run, delivery
run/workstream, lease, provider action, required message, artifact obligation
and gate. `quiescing` freezes new membership. `awaiting_acceptance` requires all
members terminal or explicitly abandoned with reason, all required messages and
artifacts reconciled, no active lease/provider action and every scoped barrier
closed. `closed` additionally requires final acceptance or an explicit
cancel/failure terminal path. Membership and transition checks occur in one
transaction; concurrent close/reopen attempts use compare-and-set revisions.

Required behaviour:

- Console crash: agents continue; the Console resumes from Fabric state.
- Herdr loss: managed sessions continue as `visibility_degraded`; no task state
  is inferred from missing panes.
- Interactive chair pane loss: freeze its delivery/turn lease and explicitly
  reattach or rotate.
- Ambiguous launch: reconcile by stable action ID; never blindly duplicate it.
- Stale artifact digest or base revision: invalidate the pending launch and
  return it to review.
- Chair loss: freeze/revoke the old chair generation, require a persisted
  handoff and explicit takeover; never silently promote a peer or bypass an
  active lease.
- Overlapping writer or unreconciled predecessor: quarantine the affected
  scope while unrelated work continues.
- Direct terminal intervention: journal it where detectable and reconcile the
  affected task revision.

On the first Console/Fabric read or command, the client library uses a
lock-safe, idempotent bootstrap protocol to attach to the existing machine-wide
daemon or spawn it if the socket is absent. The daemon becomes the sole shared
socket and transaction owner before project-session creation. A short bootstrap
lease prevents duplicate starts and is reconciled after crash.

The daemon may stop only after global authoritative state proves that no active
project session, run, lease, provider action, bootstrap lease or attached
operator client remains. An attached Console intentionally keeps it alive
because the operator is working; closing the final Console allows idle shutdown
when no work remains. Concurrent project close and client detach requests are
idempotent and cannot stop another project's work. These services are on-demand,
not login services.

## 12. Notifications and exports

V1 uses the TUI and native desktop notifications. Notify only for consequential
gates, critical-path blockage, quarantine, expiring authority, integrity
failure and completion/acceptance readiness. Deduplicate repeated alerts and
roll routine activity into summaries. While project work remains active, the
daemon-owned notification worker emits best-effort desktop notifications even
when the Console is detached; Herdr may project the same durable attention item
but is not required. Sent, deduplicated and failed delivery state is journalled.
The Attention inbox remains authoritative, and the Console labels notification
delivery `available`, `unavailable` or `stale`.

V1 notifications are non-authoritative and need not be actionable. A click may
focus an exact revision only when the discovered terminal/Herdr integration has
a contract-tested link/action capability. Otherwise the notification merely
directs the human to the Console Attention view. A notification never
acknowledges, approves or consumes its item.

Markdown and JSON are generated snapshots from the operator projection. They
are portable handoff/status artifacts, never interactive authority or a second
state store. Telegram or other messaging is a later optional notification and
deep-link adapter.

## 13. Skill and lifecycle alignment

Implementation shall review and update the portable harness skills whose
behaviour contracts change. The purpose is to express the adaptive SDLC once,
not to embed Console-specific workflow into every skill.

At minimum, the implementation review shall cover:

- `scope` and `grill-me`: conversational scoping, explicit decision context and
  digest-bound handoff;
- `implement`: automatic minor work, fresh substantial implementation sessions
  and adaptive rather than frozen implementation plans;
- `orchestrate`: chair-selected pairing, dynamic leaders/teams, model routing
  and isolated concurrent writers;
- `session`: fresh-session thresholds, checkpoint/handoff, compaction and safe
  provider-session retention;
- `deliver`: canonical `delivery-run` ownership and explicit project-session,
  coordination-run and workstream relationships;
- `work-map`: project/run/lead dependencies without becoming live task truth;
- `release`: exact accepted-artifact and target-bound promotion gates;
- `retrospect`: human-attention, gate latency and unnecessary-interruption
  evidence feeding the next scope cycle.

Only affected skills shall change. Existing trigger boundaries remain explicit:
`scope` decides, `implement` builds, `orchestrate` forms teams, `deliver` owns
acceptance evidence and `release` promotes. A skill shall not import the
Console, parse its screen, require Herdr or write Fabric persistence directly.
The Console shall not parse `SKILL.md` prose or reproduce skill logic. Skills
and the Console communicate only through stable project artifacts and typed
Fabric lifecycle/events.

Every changed skill shall receive focused positive, negative and adjacent
trigger evaluations plus portability coverage proving that its workflow still
works when the Console, Herdr and GitHub adapters are absent. Shared lifecycle
schema belongs to the protocol/delivery contract, not to any UI package.

## 14. Explicit exclusions

- No mandatory GitHub account, issue tracker or project board.
- No browser/HTML Console in this implementation scope.
- No Pi-based operator shell or replacement main harness; Pi remains an
  optional generic model adapter.
- No second task orchestrator, database or canonical status store.
- No arbitrary shell terminal inside the Console.
- No full provider TUI for every short-lived worker.
- No silent session deletion, context clearing or automatic chair takeover.
- No unattended/login daemon. An attached operator client or active project
  work may keep the on-demand daemon alive; it shuts down when neither remains.

## 15. Verification and acceptance

For this approved AFAB-004 delivery, `finalReviewComplete` is one daemon query,
not a chair assertion. It is true only when:

1. one current target binds the current fabric-sealed
   implementation-delivery-manifest.v1 and delivery-requirement-map.v1, proved
   publication lineage, sealed delivery review basis, clean
   base/head source-state and review-diff.v1 digest, complete review bundle/
   coverage digest, one unbroken active target-chair binding and one resolved
   `spec05-four-slot-v1` snapshot;
2. its four linear slot heads each name one current terminal safe certifying
   CLEAN evidence record and an empty complete open-finding set;
3. every head/action-pair/evidence record binds that target, active chair-
   binding chain, artifact,
   bundle, coverage, profile, task, route, answer/result and final-prompt digest,
   and its route equals the activated adapter/family/model/effort snapshot;
4. `native` satisfies its explicit reviewer-independence exemption, while
   `other-primary`, `cursor-grok` and `agy-gemini` each prove reviewer family
   distinct from the target-chair family; and
5. required `unavailableSlots` is empty and top-level blockers and every slot
   blocker array are empty. A nonterminal, ambiguous, route-integrity,
   insufficient-read, stale, UNUSABLE or proved terminal provider-failure
   action cannot complete a slot.

For the current Codex/OpenAI target the resolved matrix requires native Codex,
Claude/Anthropic, Cursor/Grok/xAI and Agy/Gemini/Google. This is a target
snapshot, not a permanent vendor interpretation: any chair generation/family
change outside the exact adopted same-agent binding rule supersedes the target
and resolves all four slots again.

The daemon derives CLEAN by strict review-result.v1 parsing over the exact
target generation and coverage digest. Current chair annotation is displayed
but ignored by completion and cannot downgrade P0-P2. FINDINGS/UNUSABLE advance one
head but leave deterministic blockers. A later safe CLEAN must resolve the
complete prior open set. Every safe P0-P2 finding carries into a repaired target
and new bundle; immutable prior evidence remains historical. Live currency is
read-derived and never changes the original mutation receipt.

Implementation is accepted only when objective tests demonstrate:

1. The Console runs inside and outside Herdr against the same protocol.
2. Closing/restarting the Console neither stops nor duplicates active work.
3. A human can identify project/run/phase/owner/next milestone/health/attention
   within 10 seconds in an 80x24 terminal; safety/critical-path items outrank
   FYIs, duplicates group, freshness is visible and no inferred percentage is
   displayed.
4. A consequential gate appears within two seconds of the committed event with
   scope, revision, evidence, consequence and available actions.
5. Natural-language acceptance is bound to an independently attested operator
   input channel, exact gate and artifact digests; CLI/pane injection, echo and
   ambiguous language cannot approve. Consequential decisions require preview
   and explicit confirmation.
6. Minor routine work may continue automatically, while substantial work
   produces a fresh digest-bound implementation session.
7. The chair can dynamically change topology, pairing, models, leads and
   worktrees inside authority without approval.
8. A gate's persisted scope, dependency revision, blocked operations and
   enforcement points reject affected task claim/start/resume, named operations
   and scoped-barrier closure as applicable. Dependent descendants block when
   required; unrelated siblings remain runnable.
9. Duplicate commands have one effect; stale commands fail closed with a
   visible state diff.
10. Parallel writers cannot acquire overlapping scopes and use separate
    worktrees.
11. Git operations respect pre-authorisation and consequential-action gates.
12. GitHub-disabled and GitHub-outage scenarios preserve all local functions
    with explicit freshness labels.
13. Provider, pane and fabric identities reconcile before an agent becomes
    ready; ambiguous launches do not respawn blindly.
14. All operator actions journal actor, time, provenance, command ID,
    before/after state and linked evidence.
15. Full normal messages are readable on demand without terminal-control
    injection or capability rendering.
16. Every Console mutation rejects absent, expired, revoked, wrong-project,
    wrong-generation and action-insufficient operator capabilities.
17. Conversational approval succeeds only for authenticated direct human input
    bound to the expected gate revision; echo, injection and unavailable-input
    provenance fail closed.
18. A first Console read lock-safely starts or attaches the daemon before
    project-session creation. Two projects can start/close and clients can
    attach/detach concurrently without duplicating or prematurely stopping it.
19. Pause, steer, resume, cancel, drain and stop enforce authority, survive
    Console restart and reconcile ambiguous external effects.
20. Native notifications deduplicate repeated events, journal delivery and
    label unavailable/stale state. They never approve or acknowledge; exact
    focus is enabled only for a contract-tested actionable integration.
21. Scripted keyboard-only and mouse usability evaluations at 80x24 verify
    every required view and action, visible focus, non-colour urgency, click
    targets, scrolling, configurable capture and preserved text selection.
    Resize sequences across smaller-than-reference, 80x24 and larger terminal
    sizes
    verify dynamic reflow, recomputed hit regions and preservation of focus,
    selected IDs, scroll, drafts and pending commands. Mouse activation or a
    resize cannot duplicate a command or bypass review. A
    versioned usability-fixture manifest covers: empty/healthy work; concurrent
    independent sessions or coordinated workstreams; and consequential-gate
    plus degraded/stale/conflict state.
    Each fixture declares the expected top attention item and correct
    project/run/phase/owner/next-milestone/health answers. Across three timed
    repetitions per fixture, the top item is always correct and at least 95% of
    required fields are identified within 10 seconds.
22. Project-session draft, launch, active, quiescing, acceptance and close
    states survive daemon/Console restart. Membership and closure predicates
    prevent terminal state while any required run, lease, provider action,
    message, artifact, gate or barrier remains unresolved.
23. Broad project/session authority cannot release or deploy; promotion accepts
    only exact accepted-artifact digests and target-bound release authority.
24. Every affected lifecycle skill has focused trigger, boundary and
    Console/Herdr/GitHub-absent portability evaluations; no skill or Console
    package imports the other's implementation details.
25. Answer-bearing paired work creates a correlated Fabric task/request before
    Herdr wake-up. Reply, terminal task result and pending delivery commit
    atomically or through a transactional outbox; crash-point tests expose no
    partial completion.
26. The requesting chair or lead receives the result at its next safe turn. A
    busy requester is not interrupted; an idle requester is woken. Persisted
    callback IDs, claims and delivery states survive daemon, Console and
    requester restart/compaction without loss, reinjection or pane scraping.
27. Response-deadline, overdue, same-action retry, reassignment, abandonment and
    late-reply tests keep dependent barriers open and never blindly redispatch
    or silently complete superseded work.
28. The direct Herdr prompt helper requires `--fire-and-forget` plus a
    caller-supplied task/message reference and labels it unverified. The shipped
    Fabric-backed operation rejects unknown references before injection;
    steering cannot satisfy an expected result or completion barrier. The
    documented degraded artifact/collection path works before structured
    provider callback integration ships.
29. On chair loss, the run remains blocked until the old generation is
    frozen/revoked, a persisted handoff exists and a takeover-authorised,
    generation/revision-bound command reassigns the chair. Active-lease bypass
    and peer promotion without all evidence fail closed.
30. A scoping intake and its correlated chair discussion survive duplicate
    submission, daemon/Console/provider restart and compaction while updating
    one revisioned Console item.
31. HARNESS and paired-primary references reflect chair-selectable pairing
    inside approved authority while preserving one chair and one stage owner.
32. Concurrent runs cannot overbook a shared project/session budget. Atomic
    reserve/release, exhaustion, unknown usage and restart reconciliation tests
    cover every configured dimension and the Console projects remaining or
    unknown capacity honestly.
33. Fresh native and other-primary reviews report no unresolved P0-P2 findings.
    The exact head-based `finalReviewComplete` predicate above also proves
    current clean Cursor Grok and Agy Gemini slots against one complete bundle;
    direct CLI evidence cannot satisfy it.
34. A real scoping intake registers a spec, ADR, decision/finding and Git diff;
    Project/Evidence row and detail preserve exact accepted scope, kind,
    revision, provenance and source digest. Multi-page content continues without
    gaps or replay, verifies page and complete-rendering digests and survives
    compact/80x24/wide resize without losing valid coverage. Metadata-only,
    stale, unsafe, incomplete or credential-redacted views cannot `Accept` or
    `Implement...`; terminal-neutralised complete content requires a distinct
    transformation/source-digest confirmation. Raw PTY output contains no
    terminal-control or credential canary.
35. A project with multiple attachable independent sessions does not
    auto-select one. Project-scoped run snapshots, pages, row summaries, detail
    references and details bind the exact `projectSessionId`; Enter on a run
    selects its secondary client, `s` returns to the retained project selector,
    and `--session` selects an exact stable ID for interactive or export use.
    A peer without `run-session-projection.v1` is explicitly incompatible.
36. Provider-review routing performs immutable replay before daemon-global
    `(adapterId, actionId)` single-flight, whose owner digest includes run,
    actor/principal and full input. It uses a structural shared codec and performs
    effort/currency/adapter/model admission after the bounded router. It binds
    current active target-chair binding, exact resolved profile, complete bundle/coverage,
    publication lineage and final prompt before provider I/O. Requested,
    resolved and slot adapters must match. Concurrent changed input or cross-run
    pair reuse conflicts before a second router; same action ID on another
    adapter remains legal. Timeout/process-tree/source/route failure leaves no
    action or budget.
37. Current-chair certifying dispatch accepts the exact target/head/action-pair/task/
    route/bundle/artifact tuple. Every CLEAN/FINDINGS/UNUSABLE terminal
    transaction atomically creates immutable evidence and advances one linear
    head with complete open findings before visibility; concurrent forks fail,
    old-target reprepare cannot leapfrog and second FINDINGS remains recoverable.
    Stale or insufficient terminal input accepts zero resolutions but still
    settles and retains safe new findings. Chair annotation is separate/non-
    gating, append-only and limited to the exact four dispositions; currency
    and current annotation appear only on reads, while completion/receipt stays
    annotation-free.
38. Terminal classification is frozen with classifier/secret-set identity.
    Proved failure uses exactly max-turns-exhausted/provider-rejected/terminal-
    no-answer/adapter-terminal-failure and is terminal/noncertifying rather
    than ambiguous; every proved-effect terminal settles exact usage or
    conservatively consumes its reservation, while no-effect releases and true
    ambiguity retains. The terminal-input digest makes exact callback/lookup
    replay idempotent and changed input an integrity quarantine. It exposes no
    raw error and never redispatches. Bundle/source mutation, CLEAN/P0-P2
    grammar, unsafe canaries, reviewer independence, all-certifying-action
    recovery/generic exclusion, four-slot completion and repaired-target carry-
    forward all pass.
39. Rotate/compact returns an immutable accepted-suspended receipt after
    unique caller inference, pre-digest write quarantine, durable checkpoint,
    delivery and predecessor-turn fencing. Replacement is asynchronous; each
    provider/principal target is its global run/agent durable high-water plus
    one and bridge target its chair-or-child bridge high-water plus one, never
    reused; only provider-originated launch.attest over the exact checkpoint and
    exact source-row snapshot may atomically swap the proper bridge owner at
    those reserved generations. Current state is read through lifecycle read.
    A delivery cut keeps ready/unclaimed and later enqueues in stored state
    `ready` with the derived `successor-pending` routing disposition outside
    the adoption vector, so they cannot stale the checkpoint; claims/
    acks are blocked and writes remain quarantined. Unannounced generation or
    context advance creates the exact typed generation-loss predecessor;
    provider-generation advance is canonical if both change. It ratchets
    observed high-water and supports only validated-checkpoint fresh rotation or
    abandon. Context revision is adapter-normalised/nonnegative and strictly
    increases within one provider generation; duplicate/lower/reordered events
    do not mutate lifecycle and arbitrary forward jumps are valid. Direct-open
    abandon has a null recovery action/direct-open provenance; attempted-
    recovery abandon carries the exact action pair. Startup adopt/no-effect/
    quarantine/supersede recovery owns
    every lifecycle row before generic scans without replay. A stranded agent
    cannot self-rotate: exact narrow-capability `agent-lifecycle-recovery`
    fresh-rotate binds distinct custody/action/adapter/contract and an empty
    caller boundary without rewriting a finalized predecessor, or destructive-
    confirmed abandon performs the exact delivery/watermark/barrier and owner-
    row terminal transitions without orphaning work. Lifecycle is sole owner for a rotating chair;
    generic Resume and chair-loss recovery cannot substitute.
40. Review-target preparation returns a DB-only immutable accepted receipt
    within the public deadline, then exposes Preparing/Building/Committing and
    terminal state through its read. Exact replay and same-digest join preserve
    one job; changed input conflicts. High-water target/bundle generations are
    never reused. Crash at every build/CAS/Phase-B point resumes the same row or
    exposes one complete target, never partial/duplicate state or fake progress.
41. Same-agent lifecycle adoption appends one active target-chair binding and
    preserves previously current evidence/head/finding IDs. Prepared old work
    closes no-effect; effectful/ambiguous work blocks binding advance; late old-
    binding output remains adverse but noncertifying. Every crossed agent,
    family, adapter, contract, model, profile, task, source or bundle rejects.
42. Claude, Codex, Cursor and Agy portal gates prove exact two-tool source
    confinement and common ledgers. Helper gates additionally prove non-secret
    UDS locators, local peer/PID/start/PGID/session/ancestry/executable identity,
    one connection, FD-3 noninheritance, generated ID/wire bounds and daemon/
    supervisor/PID-reuse/setsid/double-fork/reparent cleanup. Required capability
    absence appears before target as typed unavailable slots. Receipt v2
    validates without a resolver and rejects unknown future closed codes.

## 16. Implementation gate

Spec 05 v1.0 records the human-approved product direction. The direct
instruction of 11 July 2026 launched canonical run AFAB-004 from a fresh
context, authorised the local implementation and later clarified dynamic
terminal resizing in v1.1. Version 1.2 records the review-required Console
evidence UX needed to implement that approved artifact-review outcome without
changing effect authority. Version 1.3 records exact multi-session selection
without changing the one-live-run-per-session topology. Version 1.4 binds
fresh external reviews to answer-bearing Fabric tasks. Version 1.5 makes every
shipped Pause/Resume, Attention decision and evidence discussion/request-
changes affordance execute its typed revision-bound review/confirm path; no
required action remains an implementation placeholder. Version 1.6 binds those
review tasks to durable dispatch/read completion within the existing public
protocol deadline. Version 1.7 binds trusted-router admission and daemon-derived
review lineage to those same tasks without adding Spec 06 continuity modes.
Version 1.8 binds those reviews to one current complete immutable bundle,
linear slot heads, frozen safe results and the exact four-slot completion
predicate above. It also closes the existing asynchronous lifecycle-rotation
custody contract without adding automatic Spec 06 routing policy.
Version 1.9 makes target construction a durable asynchronous preparation,
preserves evidence through proved same-agent lifecycle bindings, replaces the
helper's inherited descriptor with authenticated crash-safe Unix-socket
supervision, canonicalises provider action pairs and review-diff bytes, and
closes capability, annotation, receipt and context-telemetry projections. It
adds no continuity routing or automatic successor-selection policy.
Final human acceptance remains pending; Git push,
release, deployment and other separately gated effects remain unauthorised.
