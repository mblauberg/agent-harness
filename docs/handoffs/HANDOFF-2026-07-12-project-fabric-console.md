# Project Fabric Console activation and acceptance handoff

Status: automated implementation complete; awaiting final integrated gates, independent review and human acceptance
Effort: project-fabric-console
Date: 12 July 2026
Supersedes: [Agent fabric activation handoff](HANDOFF-2026-07-11-agent-fabric-activation.md)
Authority boundary: local verification and acceptance preparation only; no push, release, deployment, provider-login change or destructive cleanup

## Goal

Verify and activate the current pre-release Fabric/Console implementation under
[Spec 01 v0.27](../specs/01-agent-fabric.md),
[Spec 04 v1.23](../specs/04-agent-fabric-operational-hardening.md) and binding
[Spec 05 v1.5](../specs/05-project-fabric-console.md), obtain fresh independent
reviews, complete the human usability gate and stop for explicit final
acceptance.

## Implemented surface

- One current public protocol and one manifest-pinned SQLite baseline. Earlier
  or unknown local state is preserved and rejected with
  `SCHEMA_CUTOVER_REQUIRED`; it is not imported or rewritten.
- Project/session/run topology, one generation-fenced chair, bounded teams,
  scoped gates, result delivery, operator effects and task-bound answer-bearing
  provider reviews remain daemon-owned.
- Task-bound provider review reserves one immutable authority-budget vector
  with adapter-enforced turn ceilings. Exact cost/token/call/time usage settles
  once; ambiguity or unavailable accounting freezes only the affected units
  until lookup evidence reconciles them.
- MCP seats use one daemon-activated, content-addressed roster generation and a
  locked filesystem pointer compare-and-swap. Superseded tokens fail at point
  of use; no flat-seat or old-pointer path exists.
- The standalone TypeScript Console uses the public protocol and eight
  operator views. It supports keyboard and optional mouse input, safe content
  rendering, exact session selection, snapshot export and terminal restoration.
- Pause/Resume appears only on an exact state-bound Runs row and always uses
  daemon Preview then explicit commit. Scoped gates create and retire linked
  Attention rows atomically. Attention decisions bind the exact gate revision;
  evidence Discuss/Request changes commits a correlated successor chair request
  with the revised artifact set.
- `80x24` is the default/reference viewport. Live `SIGWINCH` handling reflows
  smaller, reference and larger layouts while preserving focus, selected stable
  IDs, scroll, drafts and pending commands. Invalid or extreme dimensions enter
  a bounded inert state.
- Herdr remains an optional typed visibility/control adapter. It does not own
  messages, results, authority or lifecycle truth.

Live daemon, adapter, registry, session, run, seat and expiry state is not
recorded here. Query it at activation time.

## Deterministic gates

Run from the repository root on the final integrated commit:

```sh
npm --prefix runtime/agent-fabric-protocol ci
npm --prefix runtime/agent-fabric-protocol run check

npm --prefix runtime/agent-fabric ci
npm --prefix runtime/agent-fabric run check
npm --prefix runtime/agent-fabric run test:evaluation
npm --prefix runtime/agent-fabric run test:load
npm --prefix runtime/agent-fabric audit --omit=dev --audit-level=high

npm --prefix runtime/agent-fabric-console ci
npm --prefix runtime/agent-fabric-console run check
npm --prefix runtime/agent-fabric-console run test:evaluation
npm --prefix runtime/agent-fabric-console run test:load
npm --prefix runtime/agent-fabric-console audit --omit=dev --audit-level=high

npm --prefix runtime/agent-fabric-herdr ci
npm --prefix runtime/agent-fabric-herdr run check
npm --prefix runtime/agent-fabric-herdr audit --omit=dev --audit-level=high

scripts/check-harness
git diff --check
```

Record exact commands, commit, host/runtime conditions, test counts, failures
and repair reruns in the canonical delivery evidence. A passing older commit is
not evidence for the final tree.

## Live activation and MCP verification

Follow the [operations runbook](../runbooks/agent-fabric-operations.md). At
minimum:

```sh
scripts/agent-fabric status --json --project "$PWD"
scripts/agent-fabric doctor --json

export AGENT_FABRIC_PROJECT_KEY="$(scripts/agent-fabric mcp seat-path \
  --project "$PWD" --seat codex | jq -r .projectKey)"

cd runtime/agent-fabric
node smoke/registered-mcp-health.mjs ../..
node smoke/registered-mcp-roundtrip.mjs ../..
cd ../..
```

The selected project must already have an authorised current session/run and
seat roster. Provisioning or rotation is a distinct authorised action; it never
creates a run or chair. Reconnect provider sessions after a generation change.
Do not print capability files.

Run the Console against that same project:

```sh
node runtime/agent-fabric-console/dist/cli.js --project "$PWD"
```

If multiple project sessions are attachable, add `--session '<stable ID>'`.
Use `--herdr` only through the typed Herdr surface. Resize through compact,
80x24 and wide dimensions, confirm state preservation, then press `q` to
detach. Detach must not stop the project session or daemon.

## Fresh implementation review

After deterministic and live checks, obtain answer-bearing reviews from:

1. a fresh-context native reviewer;
2. Claude Opus as the other primary;
3. Cursor Grok at the approved high-reasoning route; and
4. Agy Gemini at the approved Pro route.

Create an exact Fabric review task for each external family and dispatch the
current task-bound ephemeral provider action. Persist the bounded answer,
result digest and route evidence. A direct provider CLI is only a recorded
degraded fallback. Repair every substantiated P0–P2, rerun affected gates and
obtain a fresh review of the repaired surface.

## Human timed-identification gate

`npm run test:evaluation` proves interaction mechanics but deliberately uses an
`automated-proxy` observer. Its internal usability report must remain
`passed: false` and `humanIdentificationPassed: false`; a green test command
means that this honest negative was enforced, not that the human gate passed.

Final acceptance requires a separate human-recorded run of
`runtime/agent-fabric-console/evals/usability-fixtures.v1.json` through the
exported `evaluateUsabilityManifest` evaluator:

1. Present each fixture at exactly 80x24 without showing its expected answers.
2. Use a human observer and record `observer: "human-recorded"`.
3. Run three timed repetitions for every fixture (12 observations in the
   current manifest).
4. For every observation, record the selected top attention item and the
   human's project, run, phase, owner, next-milestone and health answers.
5. Every observation must finish within 10,000 ms; the top attention item must
   be correct in 12/12 observations; at least 69 of 72 required field answers
   must be correct.
6. Preserve the complete evaluator report. It must show
   `interactionPassed: true`, `recordedIdentificationPassed: true`,
   `humanIdentificationPassed: true` and `passed: true`.

Do not infer this result from rendered text, automated answers, screenshots or
the test suite. Record the human evidence in the canonical delivery run, then
ask the maintainer for explicit final acceptance.

## Exit condition

The implementation may enter `awaiting_acceptance` only after the final commit
passes every deterministic/live gate, reviews have no unresolved substantiated
P0–P2, the human timed-identification report passes and the canonical delivery
receipt validates. Final acceptance does not authorise push, release or
deployment; each remains a separate human gate.
