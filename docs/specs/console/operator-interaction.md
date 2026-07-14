# Project Fabric Console operator views and interaction

## Operator experience

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
provider/family/model, every other observed-versus-admitted route field,
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
