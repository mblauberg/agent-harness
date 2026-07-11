# Claude Code dynamic workflows (Claude-only layer)

Verified against Claude Code docs 2026-06-12. Requires Claude Code v2.1.154+; available on all paid
plans (Pro enables via `/config`). This file is Claude-specific; for Codex native subagents/custom
agents, see `codex-subagents.md`. Feature drift expected — re-check
`code.claude.com/docs/en/workflows` before relying on exact limits or flags.

A dynamic workflow is a JavaScript orchestration script Claude writes for the task; an isolated
runtime executes it in the background. The script holds loops, branching, and intermediate results,
so the orchestrator's context holds only the final answer. This is one native realisation of this
skill's doctrine: adaptive waves, file/variable-backed intermediate state, cross-family pressure, and
validation gates before synthesis.

## Triggering

- Keyword `ultracode` in the prompt, or natural language ("run a workflow", "use a workflow").
- `/effort ultracode` — combines `xhigh` reasoning with automatic workflow planning for every
  substantive task in the session; resets on new session.
- Bundled: `/deep-research <question>` — fan-out web research with claim cross-checking and voting.
- Saved workflows run as `/<name>`; accept structured input via the `args` global.

## Runtime facts

| Fact | Value |
|---|---|
| Concurrency | up to 16 agents (fewer on small machines) |
| Total agents per run | 1,000 |
| Mid-run user input | none — split stages into separate workflows for sign-off gates |
| Script FS/shell access | none — agents do the I/O; script only coordinates |
| Resumability | same session only; completed agents return cached results |
| Script location | written under `~/.claude/projects/<session>/`; readable, diffable, editable |
| Subagent permission mode | always `acceptEdits`, inherits tool allowlist regardless of session mode |

`Ctrl+G` at the approval prompt opens the script; `/workflows` lists runs, shows per-phase agent and
token counts, supports pause/resume/stop/restart and saving (`s`) to `.claude/workflows/` (project)
or `~/.claude/workflows/` (personal).

## Cost and model routing

- Every agent inherits the session model unless the script routes a stage to another model. Route
  explicitly: cheap tier for bulk scan/extract phases, mid tier for drafting/review legwork,
  flagship only for synthesis and adjudication stages.
- Pilot a small slice first (one directory, one chapter, one claim family) to gauge spend; the
  agent caps bound runaway cost.
- Pre-add the shell commands agents will need to the allowlist, or a long run stalls on prompts.

## Saved-workflow authoring

A workflow saved to `.claude/workflows/` (project) or `~/.claude/workflows/` (personal) runs as
`/<name>` and takes structured input via the `args` global. Author it to these conventions.

- **`meta` is a pure literal, first statement.** `export const meta = { name, description, … }` with no
  variables, calls, spreads, or interpolation — the runtime reads it statically. `name` and `description`
  are required; `description` is one line. `whenToUse` and `phases` are optional. Cite the portable
  doctrine doc in `description` when the workflow belongs to a documented suite.
- **Run directory and state.** The script has no FS/shell — agents do all I/O. The first phase spawns a
  bootstrap agent that runs `run_dir_init.sh .work/wf/<name>/<stamp>` (creating `findings/`,
  `crossfamily/`, `traces/`, plus the ledger/gate files `MANIFEST.md`, `RUN_RECEIPT.json`, `SYNTHESIS.md`,
  `FINAL_GATE.md`, `decisions.md`, and `traces/README.md`) and returns the resolved path; later agents receive it via
  their prompt. It does **not** create `patches/`; when a workflow writes, the bootstrap agent also runs
  `mkdir -p <dir>/patches` and agents emit patches into that subdir.
  Workers write full output to files and return only headline findings + the path. The manifest is the
  resume/audit ledger.
- **Adaptive waves.** Do not bake every workflow into the same sequence. Long runs may use several
  waves that widen, narrow, repair, verify, and document over time; small features may use a compact
  scout/implement/review/verify loop. After each reduce step, the script or orchestrator decides the
  next wave: `continue`, `narrow`, `repair`, `verify`, `document`, or `stop`.
- **`args` conventions.** Read structured input from the `args` global verbatim (pass JSON values, not
  stringified JSON; `undefined` if absent). The script has no clock and no RNG: derive `runId`/timestamps
  from `args` or from the first agent (agents have Bash/FS), and vary per-item by index, never
  `Math.random()`.
- **Model-tier routing.** Express routing as `role → family/tier/effort → runtime-discovered model`;
  never hard-code a dated model ID in the script body. Scout for bulk scan/extract, workhorse
  for drafting/review legwork, flagship for synthesis/adjudication, cross-family for decorrelated
  review. Override per stage via `agent(…, { model })`; default to omitting `model` so agents inherit the
  session model.
- **Escalation as output.** The runtime cannot pause for mid-run approval. End the workflow at the
  escalation boundary: a serial applier lands low-risk patches after objective checks; high-risk patches
  are left in `patches/` with rationale and validation evidence for a separate approve-then-apply step.
  See the skill's "Cross-Family Workers & Escalation Gate".

**Static-check checklist** (run before saving / committing a workflow):

- [ ] Script parses as plain JavaScript (no TypeScript).
- [ ] `meta` is the first statement and a pure literal (no variables/calls/spreads/interpolation).
- [ ] No `Date.now()`, argless `new Date()`, or `Math.random()` anywhere.
- [ ] No hard-coded dated model IDs in the script body (route by tier/family instead).
- [ ] No banned/unsafe CLI flags in cross-family dispatch (read-only/plan modes enforced).
- [ ] Reads `args` as a value, not stringified JSON; guards loops on `budget.total` (not `remaining()`).
- [ ] Writes go through the run-dir + serial applier; high-risk paths escalate, never auto-apply.

## Cross-family layering

The workflow runtime spawns same-family subagents only, so cross-family agents come in via Bash. Treat
them as **expected parallel workers** for orchestrated work when data policy and tooling allow it.
They explore + review + verify at different angles with deliberate overlap, not only a final gate. The
dispatcher is optional mechanism; cross-family pressure is not optional doctrine. Three ways to bring
them in:

1. **Explore in a phase**: a fan-out phase dispatches cross-family scouts over the same slices Claude
   agents read, from a different framing, writing normalised findings to `crossfamily/` for the reduce
   phase.
2. **Review in a phase**: pair narrow native section reviewers with broader cross-family reviewers
   given architecture, omission, contradiction, or adversarial lenses; reduce both into one conflict
   map.
3. **Verify (inside or between workflows)**: workflow agents call dispatcher-managed adapters per
   `cli-headless.md`, writing normalised results to files for the next phase; or run a separate
   cross-family verification pass over the production workflow's artifacts before acting. Only routes with
   `status=ok`, `cross_family=true`, and `read_only_guarantee=enforced` or `oauth_safe_mode` certify
   (`cross_family_certified`); best_effort routes may scout but not certify
   (`cross_family_advisory`). Gemini-family bonus work uses Agent Fabric. Give
   it bounded evidence packets—`scope`, `diff/artifacts`, `anchors`, and
   `questions`—and verify every returned claim through native or certified
   evidence.

Keep the verifier's input artifact-only (no orchestrator reasoning) per `verification.md`. Apply
the host data policy before any external-family dispatch — classify/redact and record the authorised
disclosure (or an explicit skip) in the manifest; if a payload cannot be cleared, the dispatch does
not run. Use the three distinct statuses — `cross_family_certified`, `cross_family_advisory`, and
`CROSS-FAMILY-NOT-RUN: <reason>` (no safe route, failure, or out of scope) — and never silently
downgrade or collapse them.

Codex does not execute Claude workflow JavaScript unchanged. Port the stage,
gate and recovery graph: eligible GPT-5.6 Ultra/native multi-agent can
coordinate it adaptively; lower efforts use explicit waves plus run-dir state.
Use a driver only when repeatability or cross-session re-invocation justifies it.

## Quality patterns worth codifying in the script

- Adaptive fan-out → reduce → add/narrow/repair/document waves as needed → synthesis.
- Multi-angle drafting: independent plans from different framings, then a weighing stage.
- Claim voting with objective anchors; drop claims that fail cross-checking rather than averaging.
- Stage boundaries as validation gates: schema checks, test runs, citation/source existence checks.
- Document update wave after implementation or major audit: update runbooks, ADR notes, changelogs, or
  decision logs, then verify those docs against current source/artifacts.
