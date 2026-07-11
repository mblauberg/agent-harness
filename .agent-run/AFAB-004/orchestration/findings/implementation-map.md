# Spec 05 implementation map

Snapshot: `HEAD=c2fc623a2529f87feca27982e1a140969ab5a258`; worktree was
clean when inspected. Source inspection only. Proposed paths below are marked
`(new)`; they are not claims about implemented code.

## Baseline and hard gaps

- The runtime is one package, `runtime/agent-fabric/package.json`, with a public
  barrel that exports daemon, core, adapter and visibility internals together
  (`runtime/agent-fabric/src/index.ts:4-29`). The stable pieces to extract are
  already visible: bounded NDJSON, daemon protocol/client, typed core contracts,
  and schemas. Spec 05 requires four independently versioned seams, so preserve
  `runtime/agent-fabric/` as the daemon implementation and add sibling protocol,
  Console and Herdr packages; the Console must depend only on the protocol
  package.
- SQLite currently ends at migration `0003`; `0001-core.sql` has runs, agents,
  tasks, simple task gate IDs, mailboxes, provider actions and team budgets, but
  no project session, operator principal/capability, scoped gate, intake,
  request-result obligation, session membership, client attachment or
  notification tables. `task_human_gates` has only
  `gate_id/status/evidence` (`0001-core.sql:476-484`), and gates are checked only
  during barrier evidence (`src/core/fabric.ts:3720-3746`), not at task
  claim/start/resume or named operations.
- `Fabric` is the sole transaction owner but is 4,235 lines. Preserve it as the
  compatibility facade while extracting new application services. Integration
  into `src/core/fabric.ts`, `src/core/client.ts`, `src/domain/operations.ts`,
  `src/daemon/protocol.ts`, `src/daemon/client.ts` and MCP schemas must have one
  serial owner.
- Current daemon startup is explicit `startFabricDaemon`; the bootstrap
  capability is create-run-only, and `stop()` sends SIGTERM regardless of live
  work or attached clients (`src/daemon/client.ts:282-376`,
  `src/daemon/process.ts:260-275`). This is the inverse of Spec 05's attach-or-
  start and global authoritative stop predicate. Existing single-instance locks
  are reusable, but a persisted bootstrap lease and client attachment model are
  missing.
- No Console, Git/GitHub operator adapter, daemon notification worker, operator
  projection or usability fixtures exist. The current Herdr helper already
  enforces `--fire-and-forget`, requires a caller reference and labels it
  unverified (`skills/orchestrate/scripts/herdr_prompt.sh:53-88`); the Fabric-
  backed reference validator remains missing. `HARNESS.md` and paired-primary
  references already state chair-selectable pairing inside approved authority
  and preserve one chair/stage owner; AC31 needs regression proof, not a second
  policy rewrite.

## Required order and package seams

```text
amend Spec 01 + amend Spec 04; accept both amendments
  -> protocol package and migration-0004 contract tests
  -> daemon application services and crash/negative tests
  -> public daemon protocol/client integration
  -> Console + Herdr packages against public protocol only
  -> Git/GitHub/notification adapters
  -> skills, delivery/release receipts, docs and evaluations
  -> clean full gates -> fresh reviews -> bounded repair -> machine receipt
```

Amendment ownership before source work:

- `docs/specs/01-agent-fabric.md`: project-session/intake/operator entities;
  operator capability/action vocabulary; scoped gates and enforcement points;
  project/run/workstream membership; resource-budget hierarchy; chair takeover;
  atomic task/request/reply/result delivery; result-delivery state machine and
  closure predicates.
- `docs/specs/04-agent-fabric-operational-hardening.md`: migration `0004`,
  preflight/forward-repair and crash reconciliation; lock-safe attach-or-start;
  persisted bootstrap lease; operator-client attach/detach; global liveness and
  idle-stop predicates; concurrent multi-project start/close safety.

Recommended physical seams:

- `runtime/agent-fabric-protocol/**` (new): package manifest, closed schemas,
  protocol types, operation vocabulary, bounded transport and typed client.
- `runtime/agent-fabric/**`: daemon/core/persistence/adapters. Add
  `migrations/0004-project-console.sql` and application modules
  `src/application/{project-sessions,intakes,operator-commands,scoped-gates,request-results,resource-budgets,notifications,operator-projection}.ts` (new).
- `runtime/agent-fabric-console/**` (new): standalone TUI, projection cache,
  typed commands, Git/GitHub adapters, exports, accessibility/usability fixtures.
- `runtime/agent-fabric-herdr/**` (new): typed pane/presence/focus/wake/control
  adapter and direct-steer reference validation. No persistence ownership.

Keep a transitional daemon package export for existing callers, but make its
public `exports` map expose protocol types/clients through the protocol package
and forbid Console imports from `runtime/agent-fabric/src/{core,daemon,persistence}`.

## Acceptance-criterion trace (1-32)

| AC | Owned implementation surface | First right-reason test/evaluation |
|---:|---|---|
| 1 | Console protocol client; optional Herdr adapter only | `runtime/agent-fabric-console/tests/protocol-portability.test.ts` (new): identical fixture in plain PTY and fake-Herdr PTY |
| 2 | Console reconnect/projection cursor; daemon remains authoritative | `runtime/agent-fabric-console/tests/restart-active-work.test.ts` + `runtime/agent-fabric/tests/integration/spec05-console-restart.integration.test.ts` (new) |
| 3 | `console/src/projection/attention.ts`, 80x24 renderer, no inferred percent (new) | `console/tests/usability.evaluation.test.ts` using `fixtures/usability-v1.json` (new), three timed repetitions |
| 4 | daemon event subscription and attention projection | fake-clock `runtime/agent-fabric/tests/acceptance/spec05/gate-latency.acceptance.test.ts` (new), committed gate to visible item <=2,000 ms |
| 5 | direct-input attestation schema, gate/digest binding, decision preview/confirm | `protocol/tests/operator-input-attestation.test.ts` and daemon negative acceptance test for echo, pane/CLI injection, ambiguity and missing provenance (new) |
| 6 | deterministic continuation policy and launch packet/session creation | `console/src/policy/fresh-context.ts`; `console/tests/fresh-context-policy.test.ts`; skill routing evals (new) |
| 7 | chair-owned topology/preference commands within envelope | daemon project-session service plus `tests/evaluation/adaptive-topology.evaluation.test.ts` (new); pin/prohibit and authority negatives |
| 8 | scoped-gate service and DB rows for affected tasks, dependency revision, operation IDs, enforcement points and barriers | `tests/acceptance/spec05/scoped-gates.acceptance.test.ts` (new): claim/start/resume, operation and scoped-barrier negatives; runnable sibling positive |
| 9 | generalized operator command journal with expected revision and before/after diff | `tests/acceptance/spec05/operator-command-cas.acceptance.test.ts` (new): duplicate one effect; stale returns changed state |
| 10 | existing write-scope fencing plus launch-time worktree/scope admission | extend `fenced-lease-recovery.acceptance.test.ts`; add `spec05/writer-launch.acceptance.test.ts`; retain `tests/test_worktree_policy.py` |
| 11 | `console/src/adapters/git.ts` typed operations and authority preview/receipt (new) | `console/tests/git-operations.test.ts` with temp repositories; push/history/worktree-removal gate negatives |
| 12 | `console/src/adapters/github.ts` optional/freshness-labelled boundary (new) | `console/tests/github-degradation.test.ts`: disabled and outage retain all local actions |
| 13 | Herdr presence plus provider identity/session reconciliation before ready | `agent-fabric-herdr/tests/identity-reconciliation.test.ts` and daemon ambiguous-launch integration test (new) |
| 14 | operator audit event: actor/time/provenance/command/before/after/evidence | `tests/acceptance/spec05/operator-audit.acceptance.test.ts` (new), schema-closed journal assertions |
| 15 | full body fetch via protocol; terminal neutralisation; secret/capability redaction | `console/tests/message-body-safety.test.ts` (new); reuse `src/visibility/safe-preview.ts` only for previews |
| 16 | distinct operator principal/capability bound to project, session, generation, action set and expiry | `tests/acceptance/spec05/operator-capabilities.acceptance.test.ts` (new): absent/expired/revoked/wrong-project/wrong-generation/insufficient action |
| 17 | same attestation path as AC5, exact gate revision compare-and-set | extend conversational approval negative matrix; no raw pane scraping |
| 18 | attach-or-start client, bootstrap lease, attached-client rows, global stop predicate | replace assumptions in `daemon-attached-client-shutdown.integration.test.ts`; add `spec05-bootstrap-race` and `spec05-multiproject-liveness` integration tests (new) |
| 19 | typed pause/steer/resume/cancel/drain/stop operations journalled through provider actions | `tests/acceptance/spec05/operator-lifecycle.acceptance.test.ts` plus crash-point integration tests (new) |
| 20 | daemon notification outbox/delivery worker; optional actionable Herdr/native adapter | fake notifier `tests/acceptance/spec05/notifications.acceptance.test.ts` (new): dedupe, failed/unavailable/stale, never consume/approve |
| 21 | Console input/render model: keyboard, mouse, focus, non-colour urgency, scrolling/resizing, capture/selection | versioned three-fixture manifest and scripted PTY evaluation under `console/tests/usability.evaluation.test.ts` (new) |
| 22 | project-session state/membership tables and transactional closure predicate | `tests/acceptance/spec05/project-session-lifecycle.acceptance.test.ts` plus daemon/Console restart integration (new) |
| 23 | release operation outside broad session actions; exact accepted artifact digest and target grant | extend `skills/release/scripts/validate_release.py`, `tests/test_release.py`, `tests/test_release_generalised.py`; daemon release-operation negatives (new) |
| 24 | affected skill prose/evals only; package-boundary import guard | update the eight reviewed skill fixtures; add `tests/test_project_session_skill_portability.py` and TS import-boundary test (new) |
| 25 | transactional task/request/reply/result/outbox creation | `tests/acceptance/spec05/atomic-request-result.acceptance.test.ts` with crash points after each logical effect (new) |
| 26 | persisted callback claim generation; safe-turn provider acceptance/consumption | `tests/acceptance/spec05/result-delivery.acceptance.test.ts` plus restart/compaction integration; busy not interrupted, idle woken (new) |
| 27 | deadline/overdue/retry/reassign/abandon/late-reply state machine | fake-clock `tests/acceptance/spec05/result-recovery.acceptance.test.ts` (new), barrier remains open |
| 28 | existing shell helper retained as unverified fallback; Fabric-backed Herdr operation validates ref and cannot satisfy result barriers | extend `tests/test_herdr_prompt.py`; add `agent-fabric-herdr/tests/direct-steer.test.ts` and documented artifact/collection acceptance test (new) |
| 29 | persisted chair generation, freeze/revoke, handoff digest and takeover compare-and-set | `tests/acceptance/spec05/chair-takeover.acceptance.test.ts` (new): active lease bypass and peer promotion fail |
| 30 | revisioned intake plus correlated chair request/gate/artifact refs | `tests/acceptance/spec05/intake-resumption.acceptance.test.ts` (new): duplicate/restart/compaction stays one item |
| 31 | `HARNESS.md`, `orchestrate/SKILL.md`, `paired-primary.md` already substantially aligned | extend `skills/orchestrate/evals/contract_cases.yaml` and `tests/test_harness_contract.py` for chair-selectable/pinned/prohibited/one-chair invariants |
| 32 | project -> session -> run -> team -> agent resource budgets; atomic aggregate reservation/release/reconciliation | `tests/acceptance/spec05/project-budget.acceptance.test.ts`, concurrent integration and load test (new), including unknown usage fail-closed |

## Non-overlapping writer topology

Use detached, human-authorised worktrees rooted only at
`.worktrees/<task-agent>`. Do not run concurrent writers until both spec
amendments are integrated.

| Wave/worktree | Sole write scope | Dependency/output |
|---|---|---|
| W0 `spec-01-owner` | `docs/specs/01-agent-fabric.md` | amendment accepted before code |
| W0 `spec-04-owner` | `docs/specs/04-agent-fabric-operational-hardening.md` | amendment accepted before code |
| W1 `protocol-contract` | `runtime/agent-fabric-protocol/**` only | closed schemas/types/client; immutable handoff to daemon/Console |
| W1 `console-ui` | `runtime/agent-fabric-console/**` only | may begin renderer/projection against protocol fixtures; no daemon imports |
| W1 `herdr-adapter` | `runtime/agent-fabric-herdr/**` only | fake Herdr boundary; no source outside package |
| W2 `daemon-project-core` | `runtime/agent-fabric/migrations/0004-project-console.sql`, `runtime/agent-fabric/src/application/*.ts` new Spec-05 modules, `runtime/agent-fabric/tests/{acceptance,integration,performance}/spec05*` | starts after protocol handoff; avoid shared facade files |
| W3 serial chair | existing shared files: `runtime/agent-fabric/src/{core,domain,daemon,mcp,persistence,index.ts}`, package/lock files, config, scripts, CI, CODEOWNERS, runbooks | sole integrator; wires packages, migration catalogue, operations and public exports |
| W4 `skills-lifecycle` | `skills/{scope,grill-me,implement,orchestrate,session,deliver,work-map,release,retrospect}/**`, related root Python tests/evals | after protocol names/state are frozen |
| W5 reviewers | `.agent-run/AFAB-004/reviews/**` only | source-read-only, fresh context, no authored surface certification |

If package extraction must touch current daemon imports before W3, stop the
parallel wave and let the serial chair apply it. Do not give protocol and daemon
writers concurrent ownership of `src/domain`, `src/daemon/client.ts`, package
manifests or lockfiles.

## Focused and full gates

Focused red/green commands (as slices land):

```sh
npm --prefix runtime/agent-fabric-protocol run typecheck
npm --prefix runtime/agent-fabric-protocol test -- --run
npm --prefix runtime/agent-fabric test -- --run tests/acceptance/spec05
npm --prefix runtime/agent-fabric test -- --run tests/integration/spec05
npm --prefix runtime/agent-fabric-console run typecheck
npm --prefix runtime/agent-fabric-console test -- --run
npm --prefix runtime/agent-fabric-herdr run typecheck
npm --prefix runtime/agent-fabric-herdr test -- --run
python3 -m pytest -q tests/test_herdr_prompt.py tests/test_worktree_policy.py \
  tests/test_harness_contract.py tests/test_release.py \
  tests/test_release_generalised.py tests/test_skill_eval_fixtures.py
```

Full machine gate from a clean verification checkout/worktree:

```sh
scripts/check-harness
npm --prefix runtime/agent-fabric run typecheck
npm --prefix runtime/agent-fabric run build
npm --prefix runtime/agent-fabric run test:unit
npm --prefix runtime/agent-fabric run test:integration
npm --prefix runtime/agent-fabric run test:acceptance
npm --prefix runtime/agent-fabric run test:evaluation
npm --prefix runtime/agent-fabric run test:load
npm --prefix runtime/agent-fabric-protocol run check
npm --prefix runtime/agent-fabric-console run check
npm --prefix runtime/agent-fabric-console run test:evaluation
npm --prefix runtime/agent-fabric-console run test:load
npm --prefix runtime/agent-fabric-herdr run check
npm --prefix runtime/agent-fabric audit --omit=dev --audit-level=high
npm --prefix runtime/agent-fabric-protocol audit --omit=dev --audit-level=high
npm --prefix runtime/agent-fabric-console audit --omit=dev --audit-level=high
npm --prefix runtime/agent-fabric-herdr audit --omit=dev --audit-level=high
node runtime/agent-fabric/smoke/paired-mcp.self-test.mjs
git diff --check
python3 skills/deliver/scripts/validate_delivery.py \
  .agent-run/AFAB-004/RUN.json --workspace-root "$PWD" --verify-hashes
```

Add CI coverage and clean installs for every package before treating these
commands as canonical. Existing registered/provider smokes touch live local
state or quota; run them only under the run's explicit operational authority
and record unavailable legs, never substitute silently.

Fresh review wave after final source freeze:

- native fresh-context `code-review` (load-bearing);
- Claude other-primary via `cf_dispatch.sh --tool claude --role critical-review
  --alias flagship --effort high --orchestrator-family openai` (load-bearing);
- Cursor with the runtime-discovered Grok 4.5 High model via `--tool cursor
  --model <discovered-grok-id>` (advisory);
- Agy with the runtime-discovered Gemini 3.1 Pro model,
  `CF_DISPATCH_ENABLE_AGY=1`, via `--tool agy --model <discovered-gemini-id>`
  (advisory/best-effort).

Each review writes a separate artifact and receipt recording adapter, endpoint,
actual family/model, effective effort, read-only guarantee and failure status.
Repair substantiated P0-P2 only, rerun affected gates, then rerun load-bearing
reviews; maximum two repair cycles under `implement`.

## Integration hotspots

1. `src/core/fabric.ts` + operation vocabulary + authority schema + daemon RPC
   + MCP schemas must change atomically. A missing operation in any layer will
   create false capability failures or an untyped bypass.
2. Migration `0004`, its preflight/invariant catalogue, startup reconciliation
   and closure queries are one consistency boundary. Crash-point tests must use
   the real transaction owner, not mocks of partial effects.
3. The current command journal and events assume an agent actor. Generalising to
   operator principals must preserve old receipts while preventing an operator
   from masquerading as chair/agent.
4. Package extraction affects CI, Dependabot, CODEOWNERS, scripts, adapter
   manifests and hard-coded `runtime/agent-fabric` paths. Keep this a serial
   integration/refactor step with characterization tests.
5. Natural-language approval is provider-input provenance, not terminal text.
   Any implementation based on pane scraping, injected text or echoed content
   violates AC5/17 regardless of UI polish.
6. Git/GitHub/Herdr/desktop notifications are external-effect adapters. Their
   typed intent must commit before dispatch and ambiguous effects must reconcile
   by stable action ID; unit/acceptance gates use fakes and temp repositories.
7. Do not mutate or stop the currently activated workstation daemon as part of
   deterministic testing. All daemon/Console tests should use private temporary
   socket, state directory and SQLite database.
