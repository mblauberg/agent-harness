# Project Fabric Console operator views and interaction

## Operator experience

The default `Attention` view is the **Adaptive Attention Deck**. It shall let the
human identify project, session, active runs, current phase, owners, next
milestone, health and required judgement within 10 seconds. The Deck composes
the canonical views below; it is not a ninth view or a new state owner.

Its primary **Needs you** queue contains only unresolved explicit questions,
approval or decision gates, acceptance-ready work, expiring authority and
critical blockers that require human judgement. It shall not promote elapsed
time, inactivity, message volume, context pressure, pane absence or an optional
integration outage into human need. It groups duplicate events and orders them
by safety/integrity, critical-path blocked, expiring authority, then
acceptance-ready. Each row shows source freshness, last-event age, exact affected
scope and available action. Non-blocking `FYI` and advisory items live in a
separate collapsed **Watch** stream and cannot outrank Needs you.

The Deck keeps active runs discoverable alongside attention. It distinguishes
project sessions, coordination runs and delivery runs/workstreams rather than
flattening them into one identity. Every run row retains its exact
`projectSessionId`, run kind, stable run/workstream IDs, owner, phase, health,
current milestone, last event and freshness. Multiple attachable project
sessions are grouped and labelled; the Deck never auto-selects one merely to
populate the roster.

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

### Run drill-down

Selecting a run opens a run-scoped composition of Runs, Work, Agents, Evidence
and Activity. It shall provide:

- a header with exact session/run/workstream identity, accepted-scope and current
  plan revisions, phase, health, lead, current/next milestone and freshness;
- an authoritative topology tree of chair, leads, workers and reviewers,
  including each visible agent's role, team/supervisor relationship, lifecycle,
  current task, provider route, context pressure and session/pane reference;
- a workflow-first task ledger showing objectives, dependencies, current,
  ready, blocked, degraded, cancelled and completed tasks, checks, barriers,
  write scopes and plan deltas;
- an issues lens that links existing gates, blocked/degraded tasks, failed
  checks, evidence conflicts and connection faults without creating another
  issue entity; and
- processed operational activity, evidence and contextual actions for the
  selected run, task or agent.

The workflow ledger is the default centre surface. A selected task shows its
latest processed activity. Where geometry permits, topology, workflow/activity
and inspector are simultaneous; compact layouts keep Activity one action away.
The Console never invents a hierarchy, dependency, current task or completion
state from prose, process presence or pane layout. Unsupported or unobserved
relationships display `Unknown` or `Unobserved` with provenance.

Progress is phase, current/next milestone and Fabric-declared task-state counts
for an exact plan revision. A finite denominator may display `n/N`; an open or
unknown plan displays known counts without a percentage, completion ratio or
ETA. Replanning appends a visible plan revision and delta. Newly discovered
work, removed work and changed dependencies remain distinguishable from the
accepted-scope baseline. Message volume, elapsed time, token use, agent count,
tool calls and model-authored claims are never progress evidence.

### Processed activity and intervention

Activity defaults to a readable operational narrative rather than a raw
transcript. Fabric-owned typed events and deterministic grouping metadata join
related message, tool, result, decision, failure and evidence records. The
Console may collapse and lay out those groups, but shall not add semantic facts
or use an LLM summary as lifecycle truth. Each group retains actor, target,
time, source, freshness, revision and evidence references. Repetitive mechanical
detail is collapsed; omissions and unavailable detail are explicit. Full
ordinary messages and available tool payload/result detail remain reachable on
demand through their source references. Any optional model-generated synthesis
is labelled advisory with its model, source range, generation time and
freshness, and is evaluated separately before enablement.

The bottom input is a contextual intervention surface, not a second global chat
or arbitrary shell. Depending on focus it may answer the exact human gate,
submit a reviewed steer/pause/resume/cancel intent against the selected
revision-bound task/run target, or attach to a supported provider session.
Before a consequential submission it shows target, affected scope, authority,
expected effect and stale-state consequences. Steering cannot satisfy an
expected result, evidence or completion barrier. Search/filter and the command
palette are distinct modes and never reinterpret free text as approval.

The TUI shall remain fully usable at its default/reference viewport of 80x24
with a keyboard, visible focus and non-colour urgency indicators. At 80x24 the
Deck uses stacked Needs you and active-runs surfaces rather than crushing three
panes. At wider/taller geometries it progressively exposes simultaneous run,
workflow/activity and inspector panes. Short-wide and narrow-tall terminals are
resolved independently from available row and column budgets. Ultra-wide panes
cap readable text widths and spend surplus cells on useful detail rather than
stretching prose.

Layout capabilities are selected from minimum content widths/heights, not a
terminal brand or one width breakpoint. At every usable size the current
project/session, Needs you count, active-run count, connection/freshness state
and path to Detach remain reachable. Lower-priority panes collapse into tabs,
drawers or stacked sections before required identity, freshness and action
fields. No primary list requires two-dimensional scrolling. At other sizes the
TUI shall use the available rows and columns, reflow and expand or compact
master/detail content, and recompute pointer regions without hiding required
identity, freshness or action fields where the current geometry can display
them.

`SIGWINCH` and equivalent resize events shall be treated as redraw signals;
layout uses the dimensions observed for the render. Coalesced or repeated resize
events preserve selected stable IDs, focus owner, scroll anchors and follow-tail
state, per-surface scroll positions, input draft and pending command state;
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
Live inserts above a selected row preserve that stable selection and its visual
anchor. A followed activity tail may continue following; otherwise new events
do not steal focus or scroll. If a selected item disappears, focus moves by one
documented deterministic fallback and announces the removal.

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


## Route evidence and context pressure

The Agents, Runs and Evidence views consume the exact closed the Agent Fabric contract provider-
route projection: admission, separately labelled admission/dispatch capability
summaries, latest dispatch and optional observation. They render only fields
owned by each arm:

| Arm | Displayed fields |
|---|---|
| Requested | adapter alias, model alias, explicit model, raw provider effort, raw native mode |
| Admitted | host, adapter/contract, endpoint provider, family, model, resolved effort, normalised reasoning effort, raw native mode, orchestration mode, capability snapshot instance/body, effective-configuration ref plus requested/effective digests, permission profile and discovery surface |
| Observed | host, adapter, endpoint provider, family, model, resolved effort, normalised reasoning effort, raw native mode and orchestration mode, each with source/confidence |

Requested null displays `Not requested`, never `Unknown`. An applied admitted
effort with no requested raw effort is labelled `Configured default`; the
tagged inapplicable effort arm and its null normalised value display
`Inapplicable`. An observed `state: unavailable` displays `Unknown` with its
unavailable/unknown provenance. An observed raw-native-mode value of null
displays `None` with source/confidence; it is distinct from unavailable.
Observed inapplicable effort likewise displays `Inapplicable`. No other null is
silently converted to any of these labels.

Detail shows admission and dispatch snapshot generation/source/observedAt/
expiresAt/body digest separately, plus route-policy and discovery-surface refs.
An instance-only capability refresh is visible without implying drift; body,
permission or surface drift displays the terminal no-effect route outcome.
Requested/admitted differences link the ordered substitution journal. The
Console never copies admission into actual, infers effort/native mode from a
model label, or turns a vendor/product name into capability evidence.

Certifying review detail also displays required versus actual endpoint
provider/family/model, every other observed and admitted route-field comparison,
observation digest, actual-route identity digest and
`proved equal`, `actual-route-unproved` or `actual-route-mismatch`. The latter
two visibly block certification and resolution acceptance while retained
adverse findings remain reviewable. Generic work has no actual-route
certification badge. Route/topology evaluation references from the harness lifecycle contract show
task class, trial count, baseline, exact topology-wave ref, evidence age, expiry
and promotion state without presenting a universal model rank.

Context pressure and spend are separate rows. The context row consumes only
the Agent Fabric contract `providerContextPressureReadV1` and displays
`low`, `medium`, `high` or `unknown` plus source, confidence and observation
age/currency; token counts may appear as raw nullable values, while cost/turn
reservations remain in resource capacity. Missing or stale state is labelled,
never refreshed by a UI write. Unknown current window state never becomes a
fabricated percentage. This contract adds no
automatic threshold, hysteresis, maximum-compaction count or successor picker.
Existing lifecycle actions and recovery custody remain the only mutation path.
