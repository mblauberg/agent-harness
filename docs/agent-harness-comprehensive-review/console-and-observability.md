# Console and observability redesign

## 1. Assessment

The Console's domain model is substantially stronger than a typical terminal dashboard. It already distinguishes project/run/work/agent/evidence/activity/system views and models freshness, conflict and read-only/degraded state.

The next improvement is not a wholesale UI framework replacement. It is:

- decomposition of rendering and interaction;
- stronger information hierarchy;
- event replay;
- explicit topology and authority;
- shared identifiers with provider-native UIs;
- a protocol-only Console core;
- improved attention management.

## 2. Operator jobs

The Console should answer, within seconds:

1. What outcome is this run pursuing?
2. Who is the chair?
3. Which agents are active, on what tasks, using which model/effort?
4. Who can write where?
5. What is blocked or waiting for me?
6. Which checks/reviews passed or failed?
7. What changed recently?
8. Are any sessions stale, degraded, over budget or ambiguous?
9. Which external effects are proposed or in flight?
10. Can I safely pause, steer, approve, reject, reassign or export?

## 3. Information architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ PROJECT  RUN/PHASE  HEALTH  BUDGET  HEAD/CI  PROVIDERS  CLOCK/FRESHNESS     │
├───────────────────┬───────────────────────────────────┬──────────────────────┤
│ RUN / AGENT TREE  │ TASK DAG / WORK BOARD             │ ATTENTION            │
│                   │                                   │                      │
│ ● chair Codex     │ [A] contract tests  done          │ ! scope decision     │
│ ├─ Claude review  │ [B] compiler         active       │ ! provider degraded  │
│ ├─ Codex worker   │ [C] Claude adapter   active       │ ? effect approval    │
│ └─ scout          │ [D] integration      blocked B,C  │                      │
│                   │                                   │                      │
├───────────────────┴───────────────────────────────────┴──────────────────────┤
│ DETAIL TABS: task | agent | evidence | review | effects | timeline | system │
│ exact scope, worktree, authority, model/effort, checks, artefacts, receipts  │
├──────────────────────────────────────────────────────────────────────────────┤
│ COMMAND / SOFT STEER / FILTER                                   ? help       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Compact mode

At 80×24:

- one status line;
- attention list first;
- selected task/agent detail;
- recent events;
- command palette;
- switchable tree/board/evidence tabs.

### Inert mode

When terminal dimensions or protocol state are insufficient:

- render health and reason;
- provide export/doctor command;
- avoid partial interactive controls.

## 4. Agent row

Every visible agent should expose or make one keystroke away:

- Fabric agent ID and generation;
- provider session/thread ID (redacted/truncated);
- provider/family/model;
- requested/effective effort;
- role;
- parent/team;
- task(s);
- authority profile;
- exact writable workspace;
- lifecycle/heartbeat/freshness;
- turn/cost/token budget;
- current provider action;
- last result/evidence;
- degradation/retry state.

Use status symbols plus text. Colour is supplemental, never the only carrier.

## 5. Attention model

Attention items are typed, prioritised and actionable.

Types:

- human decision;
- approval/effect gate;
- scope drift;
- failed deterministic check;
- blocking review finding;
- stale/ambiguous provider action;
- lost chair/agent continuity;
- budget threshold;
- lease/worktree conflict;
- provider/version degradation;
- retention/legal-hold conflict;
- current-head CI unavailable.

Each item includes:

- severity;
- source revision;
- why it matters;
- recommended action;
- available alternatives;
- whether work continues safely;
- expiry/timeout;
- affected tasks/effects.

Soft requests never block unless policy says they are gates.

## 6. Timeline and replay

Add a replay mode:

```text
live | paused at seq 12,483 | compare seq 12,100..12,483
```

Functions:

- move by event;
- jump to task/agent/effect;
- show before/after projection;
- filter by type/principal;
- export Markdown/JSON/NDJSON;
- copy a redacted incident bundle;
- link event to command/action/receipt.

Replay data is read-only and source revisions are shown.

## 7. Rendering decomposition

Recommended split of `src/index.ts`:

```text
src/
  text/
    unicode-policy.ts
    sanitise.ts
    width.ts
    clip.ts
  layout/
    geometry.ts
    responsive.ts
    panes.ts
    splitters.ts
  render/
    frame.ts
    primitives.ts
    chrome.ts
    views/
      project.ts
      topology.ts
      tasks.ts
      attention.ts
      evidence.ts
      timeline.ts
      system.ts
  interaction/
    hit-regions.ts
    keyboard.ts
    mouse.ts
    command-palette.ts
  theme/
    tokens.ts
    capability.ts
  index.ts
```

Keep pure functions wherever possible:

```ts
renderView(viewModel, viewport, uiState) -> Frame
reduceInput(uiState, input, frameBindings) -> Intent[]
```

No renderer directly mutates Fabric.

## 8. Package separation

### `console-core`

Depends only on:

- protocol types/client;
- immutable projection DTOs;
- terminal abstraction;
- rendering libraries.

### `console-cli`

Owns:

- process/terminal;
- local daemon connection;
- optional local Fabric bootstrap;
- configuration/path discovery;
- signal handling;
- exports.

### Optional future clients

- desktop application;
- web/loopback view;
- IDE extension.

All use the same protocol/projections.

## 9. Provider-native UI integration

The user wants subagents to remain legible in native Codex and Claude Code TUIs. Use native surfaces where supported:

- thread/session names;
- goals/tasks;
- parent/child lineage;
- model/effort;
- working directory/worktree;
- concise start/status/final messages;
- Fabric run/task IDs;
- MCP resource showing current task/authority.

Do not attempt to reproduce the full Fabric Console inside each provider TUI. The native view should answer “what am I doing?” and link to/export the authoritative cross-provider view.

### Native status message

```text
Fabric task T-17 · Claude reviewer · model=fable · effort=high
Scope: read-only packages/fabric/providers
Parent: chair C-1 · Run R-42
Return: findings.json + evidence links
```

## 10. Desktop and headless use

Do not couple orchestration to Herdr panes.

Modes:

- terminal + Herdr;
- terminal headless;
- desktop client;
- provider desktop app launched/attached through native API;
- CI/batch controller;
- read-only remote observer (future).

The common contract is the Fabric protocol/event projection, not a terminal process.

## 11. Human interaction design

### Commands

Examples:

- `approve gate-17`
- `reject effect-3`
- `steer agent-7 "prioritise recovery test"`
- `pause run`
- `reassign task-4 agent-9`
- `rotate chair claude`
- `export incident`
- `open evidence check-22`
- `show authority task-4`

Dangerous operations use typed confirmation showing exact effect, not a generic “are you sure?”.

### Command provenance

Every UI intent includes:

- input source (keyboard/mouse/API);
- selected binding revision;
- operator principal;
- command ID;
- expected object revision.

Stale UI actions fail with a helpful refresh/retry path.

## 12. Accessibility and terminal safety

Retain and extend:

- grapheme-safe width;
- control/bidi sanitisation;
- no raw provider escape sequences;
- bounded frame cells;
- no-colour mode;
- screen-reader-friendly exports;
- keyboard access to all functions;
- stable focus on resize;
- explicit UTC/local timestamps;
- plain-text symbols fallback.

## 13. Evaluation

### Deterministic

- golden frame tests by viewport;
- property tests for clipping/layout;
- stale-binding rejection;
- input reducer tests;
- no raw control/bidi leakage;
- replay determinism;
- projection version compatibility.

### Performance

- render under event/task/agent scale;
- replay seek latency;
- memory bound;
- terminal write volume;
- resize storm;
- event burst/backpressure.

### Human

Tasks:

- identify chair/model/effort;
- find blocked task;
- find writable worktree;
- identify stale provider;
- review evidence;
- approve exact effect;
- reconstruct failure timeline.

Record success, time, errors and confidence. Do not substitute an automated interaction suite for the human identification gate.

## 14. Completion criteria

- the principal renderer is decomposed;
- Console core does not import Fabric implementation;
- attention, topology and replay are first-class;
- agent authority/worktree/model are visible;
- all operations are protocol commands with revision binding;
- native provider UIs show concise identity/topology;
- desktop/headless use does not require panes;
- exports provide an accessible alternative.
