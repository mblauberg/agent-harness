# Operating the Lab from Codex

How a **Codex** session runs the full autonomous-lab loop as the orchestrator. The memory layout,
8-step loop, gates, escalation taxonomy, and traceability spine are **identical** to the Claude Code
substrate — only the dispatch mechanics and the re-invocation wiring differ. Everything in
`operating-loop.md`, `filesystem-memory.md`, `decision-lifecycle.md`, and
`anti-placebo-and-convergence.md` applies unchanged.

**Do not pass Claude workflow JavaScript to Codex.** Codex has no Claude
`Workflow()` runtime, `/loop`, ScheduleWakeup or Stop hook. An eligible GPT-5.6
lead at `ultra` can proactively coordinate native subagents and therefore run
the same portable workflow graph adaptively; lower efforts use explicit waves.
The external driver still owns cross-session re-invocation and the STOP gate.

## Substrate mapping

| Claude Code primitive | Codex realisation |
|---|---|
| `Workflow()` background run | Ultra/native multi-agent stage graph, or one explicit wave per stage when Ultra is unavailable |
| `pipeline(items, s1, s2…)` | Per-item sequential subagent chains inside a wave; reduce in the main thread |
| `parallel(thunks)` | One wave of subagents; wait for all; reduce |
| `agent(prompt, {schema})` | Subagent prompt ending with an explicit return contract ("return ONLY this JSON shape"); validate on ingest, re-dispatch on malformed (bounded by the ~2-attempt convergence rule, then escalate) |
| `resumeFromRunId` (journal cache) | The **run ledger + findings files ARE the journal**: on RECONCILE, diff expected outputs vs on-disk files and re-dispatch **only the missing/failed items**, never the whole wave |
| `/loop` + ScheduleWakeup | The external loop driver below; wake pacing = the driver's sleep |
| Stop hook | The driver's `STATUS == STOP` check — same gate, same goal file |
| `/workflows` progress view | `DASHBOARD.md` (regenerate via `node tools/gen-dashboard.mjs`) + the in-flight table in `STATE.md` |

At `ultra`, Codex may delegate proactively. At other efforts, make every fan-out
concrete: "Spawn one subagent per work-unit below. Wait for all. Return the
reduce table only." Even under Ultra, preserve the work-unit, write-scope,
artifact and reduction contracts; proactive delegation does not widen authority.

## The external loop driver

The Codex equivalent of Stop-hook-plus-`/loop`. Run it from the lab root; steer and stop exactly as
on Claude Code — edit `GOAL.md` directives, set `STATUS: STOP`.

```sh
#!/bin/sh
# lab-driver.sh — re-invoke one lab iteration until GOAL.md says STOP.
LAB_DIR="${1:?usage: lab-driver.sh <LAB_DIR>}"
LEASE_TOOL="${AGENTS_HOME:-$HOME/.agents}/skills/orchestrate/scripts/lease.py"
LEASE="$LAB_DIR/LEASE.json"
HOLDER="codex-driver-$$"
python3 "$LEASE_TOOL" acquire "$LEASE" --holder "$HOLDER" --ttl "${LAB_LEASE_SECONDS:-900}" || exit 1
trap 'python3 "$LEASE_TOOL" release "$LEASE" --holder "$HOLDER" >/dev/null 2>&1 || true' EXIT INT TERM HUP
PROMPT="You are the orchestrator for the autonomous lab at $LAB_DIR.
Read $LAB_DIR/OPERATING_MANUAL.md IN FULL first — it is your constitution.
Then read GOAL.md, STATE.md, and the work-queue head. Run ONE iteration of the
8-step loop (RECONCILE → READ → SELECT → DISPATCH → RECORD → PROPAGATE →
REORG-if-due → STATE → WAKE/STOP), obeying: protect orchestrator context,
provenance-before-promotion, record-before-launch, never self-halt. You are on the
Codex substrate: dispatch via native parallel subagent waves per
references/codex-operator.md, NOT Claude workflow JavaScript. If GOAL
STATUS==STOP, write a clean handoff and end. Otherwise end the turn when all
selectable work is in-flight or recorded."
while ! grep -q '^STATUS: *STOP' "$LAB_DIR/GOAL.md"; do
  python3 "$LEASE_TOOL" renew "$LEASE" --holder "$HOLDER" --ttl "${LAB_LEASE_SECONDS:-900}" || exit 1
  codex exec --cd "$LAB_DIR" "$PROMPT" & iteration_pid=$!
  (
    while kill -0 "$iteration_pid" 2>/dev/null; do
      sleep "${LAB_LEASE_HEARTBEAT_SECONDS:-240}"
      python3 "$LEASE_TOOL" renew "$LEASE" --holder "$HOLDER" --ttl "${LAB_LEASE_SECONDS:-900}" >/dev/null || {
        kill "$iteration_pid" 2>/dev/null || true
        exit 1
      }
    done
  ) & heartbeat_pid=$!
  wait "$iteration_pid" || sleep 300                  # transient-failure backoff
  kill "$heartbeat_pid" 2>/dev/null || true
  wait "$heartbeat_pid" 2>/dev/null || true
  sleep "${LAB_WAKE_SECONDS:-60}"                     # wake pacing between iterations
done
```

Driver notes:

- **One iteration per invocation.** The inner session must end its turn (not self-loop); the driver
  owns re-invocation, exactly as the Stop hook does on Claude Code. A driver re-fire after a "done"
  claim is the same over-claim signal as a Stop-hook re-fire (`recovery-and-cadence.md` §7).
- **Crash-safety is unchanged**: record-before-launch + RECONCILE make a killed `codex exec`
  recoverable — the next invocation re-attaches from the ledger. Session continuity is a
  nice-to-have (`codex exec resume`), never a dependency.
- Raise `LAB_WAKE_SECONDS` (~3600) when the queue is drained and the run is idling on gates —
  same wake discipline as §6.
- **Canonical STOP line**: the driver greps `^STATUS: *STOP` — the goal file must carry exactly
  `STATUS: STOP` at line start (that casing). Anything else does not halt the run.
- **Supervise the driver.** The driver is the one process whose death stops re-invocation (state
  and ledger survive; nothing re-launches iterations). Run it under `tmux`/`nohup`/a service
  supervisor; if it dies, just restart it — RECONCILE re-attaches everything.
- **Model/effort per wave**: discover what the local Codex install exposes at runtime
  (`codex exec --help`, profiles in `~/.codex/config.toml`); if per-subagent model selection is
  not available, run the wave at the flagship reasoning tier and keep the cheap-tier work inside
  explicitly contract-bounded prompts — never guess model names from memory.

## Cross-family, family-relative

The independence rule is "a family **≠ the operator's**", never a fixed vendor list. With Codex
(OpenAI) operating: the load-bearing verifier is **claude** (Anthropic) through
Agent Fabric. Gemini (Google) is an optional Fabric bonus task. A `codex exec` "verifier" from a
Codex operator is a same-family self-review: it **cannot certify** a hard gate — the wrapper
fail-closes it. All capture/independence rules of `cross-family-review.md` (raw-verdict-to-disk,
never-trust-self-report, build≠verdict-reporter) apply unchanged.

`{{MODEL_MATRIX}}` is likewise operator-relative: keep the task-class → tier/effort policy of
`model-effort-policy.md`, substituting the Codex model lineup for the flagship/workhorse instance (flagship
reasoning tier for judgement/design/synthesis + all adversarial judges; a cheaper tier only for
mechanical breadth under a flagship-authored contract).

## Codex-operator pitfalls

- **Silent under-fan-out.** Codex may keep work in the main thread. Delegate
  genuinely independent depth and record any reason not to; keep synthesis and
  adjudication with the accountable stage owner.
- **Wave = barrier.** Native waves join before reduce; don't hold a mega-wave open across the whole
  queue. Dispatch per work-unit batches sized to `{{RUNAWAY_CAPS}}`.
- **No background completion-notify.** Unlike Claude Code, nothing re-invokes mid-turn on job
  completion; RECONCILE at the top of each driver iteration is the only re-attach point. Keep
  iterations short so the ledger stays fresh.
