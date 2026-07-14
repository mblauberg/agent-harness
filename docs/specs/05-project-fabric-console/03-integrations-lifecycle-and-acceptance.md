
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
   its route equals the activated adapter/family/model/effort snapshot, and its
   observed endpoint provider/family/model actual-route identity is proved and
   equals both admission and the resolved profile, while every other observed
   route field is admission-equal (honest unavailable optional arms remain
   allowed), and its route/evidence/completion rows equality-bind one admitted
   `review-readonly` compilation ref whose native-settings digest equals the
   effective-configuration permission digest;
4. `native` is explicitly `same-family-exempt`, while
   `other-primary`, `cursor-grok` and `agy-gemini` each prove reviewer family
   distinct from the target-chair family; this is not a contributor-family
   independence claim; and
5. required `unavailableSlots` is empty, normal finding capacity is available,
   and top-level blockers and every slot
   blocker array are empty. A nonterminal, ambiguous, route-integrity,
   insufficient-read, authority-compilation-missing,
   authority-compilation-drift, actual-route-unproved, actual-route-mismatch, stale,
   UNUSABLE or proved terminal provider-failure
   action cannot complete a slot.

For the current Codex/OpenAI target the resolved matrix requires native Codex,
Claude/Anthropic, Cursor/Grok/xAI and Agy/Gemini/Google. This is a target
snapshot, not a permanent vendor interpretation: any chair generation/family
change outside the exact adopted same-agent binding rule makes the target stale;
a successful successor preparation resolves all four slots again and then
persists supersession.

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
    Resize sequences cover zero/undefined/invalid extremes, 29x5 inert, 30x6
    minimum compact, default 80x24 and a wide terminal and verify dynamic
    reflow, recomputed hit regions and preservation of focus, selected IDs,
    scroll, drafts and pending commands. Inert state keeps q/Detach and terminal
    restoration live while every mutation is inert. Mouse activation or a
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
    actor/principal and full input. It reserves normal worst-case finding
    capacity, or an explicit zero-new-finding resolution-only reservation,
    before the bounded side-effect-free router. The structural shared codec
    carries tagged `resolvedEffort`; transactional effort/currency/adapter/model
    admission follows the router. Current active target-chair binding, resolved
    profile, complete bundle/coverage, publication lineage and final prompt bind
    before provider I/O. Requested, resolved and slot adapters must match.
    Concurrent changed input or cross-run pair reuse conflicts before a second
    router; same action ID on another adapter remains legal. Capacity, timeout,
    process-tree, source or route failure leaves no provider effect.
37. Current-chair certifying dispatch accepts the exact target/head/action-pair/
    task/route/bundle/artifact tuple. CLEAN/FINDINGS/UNUSABLE atomically creates
    immutable evidence and advances one linear head with a mandatory complete
    paged finding set. A proved provider failure instead writes the closed
    terminal-failure receipt, advances neither evidence nor head and records the
    exact unchanged head/open/repair roots. Concurrent forks fail, old-target
    reprepare cannot leapfrog and second FINDINGS remains recoverable. Stale or
    insufficient terminal input accepts zero resolutions but still settles and
    retains safe new findings. Chair annotation remains separate, append-only,
    non-gating and annotation-free in completion/receipt.
38. Terminal classification is frozen with classifier/secret-set identity and
    the exact six-arm terminal-result digest. Proved failure uses exactly max-
    turns-exhausted/provider-rejected/terminal-no-answer/adapter-terminal-failure
    and is terminal/noncertifying rather than ambiguous; every terminal action
    receives one stable run-global terminal sequence. The first successor-chair
    adoption captures a certification cut; evidence at or before that cut may
    certify only through the proved same-subject binding chain, while later or
    stale-binding output remains adverse and permanently noncertifying. Exact
    callback/lookup replay is idempotent, changed input quarantines and recovery
    never redispatches. Bundle/source mutation, CLEAN/P0-P2 grammar, unsafe
    canaries, reviewer-family relation, four-slot completion and repaired-target
    carry-forward all pass.
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
    observed provider/context high-water and supports only validated-checkpoint fresh rotation or
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
    current state through its read. Progress is the exact phase-only or verified-
    build-items union; terminal state is the exact succeeded/conflicted/failed
    union and never a fabricated percentage or ETA. Exact replay and same-digest
    join preserve one job; changed input conflicts. High-water target/bundle
    generations are never reused. Crash at every build/CAS/Phase-B point resumes
    the same row or exposes one complete target, never partial/duplicate state.
41. True-chair lifecycle adoption never waits for review. At the same
    serialization point it captures the certification cut and either appends
    one exact same-subject target-chair binding or leaves the target stale.
    Prepared old work is terminalised no-effect; dispatched/ambiguous old work
    completes under its recovery owner but cannot roll back adoption. Previously
    current evidence/head/finding IDs remain unchanged, and late post-cut output
    is adverse but noncertifying. Every crossed agent, family, adapter, contract,
    model, profile, task, source or bundle prevents rebind and requires prepare.
42. Claude, Codex, Cursor and Agy portal gates prove exact two-tool source
    confinement and common ledgers. Helper gates additionally prove non-secret
    UDS locators, local peer/PID/start/PGID/session/ancestry/executable identity,
    one connection, private no-follow path/device/inode custody, FD-3
    noninheritance, generated ID/wire bounds and daemon/
    supervisor/PID-reuse/setsid/double-fork/reparent cleanup. Required capability
    absence appears before target as typed unavailable slots. Receipt v2
    validates without a resolver and rejects unknown future closed codes.
43. Discovery-surface fixtures prove exact digest-free manifest JCS bytes,
    manifest/artifact/registration equality and route/launch host/version/
    profile/raw-mode binding. Capability fixtures prove admission instance/body,
    harmless same-body refresh with separate dispatch clocks, actual dispatch
    append and no-effect body/permission/surface drift. Activation/smoke/action
    effective-configuration evidence proves subject uniqueness and activation
    lineage without global mutation.
44. Route projection fixtures enumerate the requested/admitted/observed field
    matrix and all `Not requested`/`Configured default`/`Inapplicable`/`None`/
    `Unknown` states. Certifying review proves actual endpoint provider/family/
    model identity and rejects every other observed route-field inequality, or
    emits the exact unproved/mismatch blocker, accepts no
    resolution and retains every safe adverse finding.
45. Topology-wave fixtures prove closed plan/ref/current shapes, append-only
    revision/rationale, predecessor/current CAS, scoped list/read, one chair,
    intact historical-predecessor chain semantics, existing authority/policy
    fencing, discriminated current/stale/unavailable arms and stale display.
    Context-pressure fixtures prove the exact lifecycle-observation join,
    source/confidence/token invariants, crossed-arm rejection, scoped read,
    age/stale derivation without mutation, spend separation and absence of
    percentages or automatic lifecycle effects.
