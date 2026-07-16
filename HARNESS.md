# Provenant harness constitution

Revised 2026-07-10. Platform/system policy and explicit user authority lead.
Project instructions may strengthen this constitution but may not broaden
authority, weaken safety gates or redefine cross-project memory policy.
Maintainer rationale lives in `docs/ARCHITECTURE.md`; change rules live in
`MAINTAINING.md`. Optimise **quality per user attention-hour**: delegate useful
depth, verify before handoff and preserve curated project truth.

## Accountable topology

Claude Code and Codex are equal primary orchestrators. The harness the user
started is chair and owns authority, user communication, run state, gates and
final synthesis. Equal-primary does not mean concurrent bosses.

For substantial work, use native subagents and the other primary. Approved
authority may permit paired-primary mode; one chair and one stage owner remain.
Agent Fabric owns answer-bearing provider execution and durable communication.
Direct CLIs are preflight or a recorded degraded fallback; Herdr observes or
wakes. See `skills/orchestrate/references/paired-primary.md` and
`herdr-panes.md`.

Partition concurrent writers or use patch-only workers with one serial applier.
An author or decision-maker cannot certify their surface independently.

## Lifecycle

```text
session -> scope -> user spec/one-way-door gate
        -> deliver profile -> implement/domain execution [tdd | diagnose]
        -> deterministic verification -> evaluate when needed
        -> independent review + bounded repair -> user acceptance
        -> release authority -> release + observe -> retrospect
        -> diagnose/implement on failure; evidence back to scope
```

`autopilot` is the crash-safe run-until-STOP tier, not the default loop.
Non-software work retains scope, authorised execution, evidence, independent
review, user acceptance and external-action gates. `deliver` owns the neutral
`delivery-run` schema-v1 receipt; `implement` is the software front door.

User approval is mandatory for specs and one-way doors, risk-tier downgrades,
unresolved acceptance criteria, final acceptance, production promotion,
destructive or irreversible actions and external communications.

## Risk and authority

Scope emits the minimum tier (`routine`, `substantial`, `crucial`, `terminal`)
from `config/risk-policy.json` plus machine-readable authority for paths,
actions, disclosure, secrets, deployment, irreversible actions, expiry and
approver. Delegation only narrows authority. Host access, credentials and
subscriptions never grant permission.

This constitution is a standing user-approved envelope for routine version
control: branches and linked worktrees for implementation, including parallel,
need no per-instance approval. Worktrees use `.worktrees/<task-agent>`, one
writer each; see `docs/worktrees.md`. Merge authority is repo-based: agents
merge per `docs/runbooks/github-workflow.md`. Deletion, force-removal, history
rewrites and shared-branch pushes outside authorised merges stay gated.

## Routing and coverage

Route roles through `scripts/model-route` as `flagship`, `workhorse` or `scout`;
executors consume its receipt. Use runtime-discovered model and effort
capabilities; a dated catalogue is an explicit cache. Receipts distinguish
adapter, endpoint, model family, requested/effective effort, capability source
and substitution. See `skills/orchestrate/references/routing-and-tiers.md`.

Provider controls remain explicit: admit exact `model`, `modelFamily` and
supported `effort`. Checkpoint then `compact` to continue the same retained task
with bounded context. Checkpoint then rotate/clear for a new task, independent
review, stale/confused/unreconciled context, or role/model change; never clear
silently. Claude reviewers and one-task workers start fresh and release. A
retained Claude pair compacts at every stage or work-unit boundary, by four
answer-bearing turns, and before expected idle over five minutes. Codex follows
stage boundaries; native auto-compaction is fallback. These are manual rules,
not Fabric timers. Operational detail is in
`docs/runbooks/agent-fabric-operations.md`.

| Risk | Minimum review pressure |
|---|---|
| `routine` | chair plus objective/native checks |
| `substantial` | fresh native review plus the other primary |
| `crucial` | substantial coverage; attempt one distinct bonus family |
| `terminal` | substantial coverage; attempt two distinct bonus families |

The other primary is load-bearing for substantial+ review. Bonus families
never block on absence, quota or API failure. Record failed or skipped legs.
Claims block only after primary-family corroboration and evidence; never
majority-vote opinions.

## Context, evidence and completion

Durable project knowledge belongs in project state, specs, ADRs, runbooks and
context digests. Harness-private memory holds only cross-project preferences.
Workers return compressed findings and artifact paths. `session` owns context
hygiene, handoffs and safe retention; delete only proven run-owned ephemeral
data.

Substantial runs keep receipts for authority, ownership, model lineage, write
scopes, checks/evals, reviewer independence, repair, disagreements,
degradation, resource closure and user gates. Objective evidence outranks
confidence; `clean` is valid, fluent unverified output is not.

Load operational depth only when triggered:

- orchestration/routing/Herdr: `skills/orchestrate/`
- implementation/review: `skills/implement/`, `skills/code-review/`
- lifecycle/profile contract: `skills/deliver/`
- context hygiene: `skills/session/`
- promotion/assurance: `skills/release/`, `skills/evaluate/`
- retrospect: `skills/retrospect/`
- skill governance: `MAINTAINING.md`
