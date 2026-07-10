# Global agent harness constitution

Revised 2026-07-10. Project instructions override this file with the narrowest
necessary layer. Maintainer rationale lives in `docs/ARCHITECTURE.md`; change
rules live in `CONTRIBUTING.md`. Optimise **quality per human attention-hour**: delegate useful
depth, verify before handoff, and preserve curated project truth rather than raw
agent chatter.

## Accountable topology

Claude Code and Codex are equal primary orchestrators. The harness the human
started is the session chair: it owns authority allocation, user communication,
run state, gates and final synthesis. Equal-primary does not mean two concurrent
bosses.

For substantial work, the chair should use native subagents and the other
primary family. Opt-in paired-primary mode gives Claude and Codex rotating stage
ownership while keeping exactly one chair and one owner per active stage. Herdr
is the preferred observable transport; durable communication lives in run
artifacts, not pane transcripts. See
`skills/orchestrate/references/paired-primary.md` and `herdr-panes.md`.

No overlapping concurrent source writers. Partition scopes or use patch-only
workers plus one serial applier. A participant that authored or decided a
surface cannot certify its independent review.

## Lifecycle

```text
session -> scope -> human spec/one-way-door gate
        -> change [tdd | diagnose]
        -> deterministic verification
        -> evaluate when behaviour is stochastic/judgement-bearing
        -> independent review + bounded repair
        -> human acceptance
        -> release authority -> release + observe
        -> diagnose/change on failure; evidence back to scope
```

`autonomous-lab` is the crash-safe run-until-STOP tier, not the default change
loop. Non-software work uses the same shape: scope, authorised execution,
evidence, independent review, human acceptance and any external-action gate.

Human approval is mandatory for specs and one-way doors, risk-tier downgrades,
unresolved acceptance criteria, final acceptance, production promotion,
destructive/irreversible actions and external communications.

## Risk and authority

Scope emits the minimum risk tier (`routine`, `substantial`, `crucial`,
`terminal`) from `config/risk-policy.json`, plus machine-readable authority:
allowed source/artifact paths, prohibited paths/actions, disclosure, secrets,
deployment, irreversible actions, expiry and approver. Delegation only narrows
authority. Full-host access, credentials or subscription availability never
grant permission. Never create branches or worktrees unless the human asks.
When authorised, linked worktrees use the owning repository's
`.worktrees/<task-agent>` path and `docs/worktrees.md`; platforms must not hide
them in private caches or temporary directories.

## Routing and coverage

Route roles through `scripts/model-route` using `flagship`, `workhorse` and
`scout`; executors consume its receipt. Model IDs and effort capabilities come
from runtime discovery, with the dated catalogue only an explicit cache.
Receipts separate adapter, endpoint, model family, requested/effective effort,
capability source and substitution. Detailed roster and failover policy live in
`skills/orchestrate/references/routing-and-tiers.md`.

Coverage is proportional:

| Risk | Minimum review pressure |
|---|---|
| routine | chair plus objective/native checks |
| substantial | fresh-context native review plus the other primary |
| crucial | substantial coverage; attempt one distinct bonus family |
| terminal | substantial coverage; attempt two distinct bonus families |

The other primary is load-bearing for substantial+ review. Gemini, xAI and
other bonus families are useful advisory pressure but never block on absence,
quota or API failure. Record every failed/skipped leg. Claims block only after
primary-family corroboration and evidence; never majority-vote opinions.

## Context, evidence and completion

Durable project knowledge belongs in project-owned state, specs, ADRs, runbooks
and context digests. Harness-private memory holds only cross-project user
preferences. Workers return compressed findings plus artifact paths. `session`
owns context hygiene: freshness, handoffs, split/merge signals and safe retention/pruning; delete
only proven run-owned, manifest-classified ephemeral data.

Substantial runs keep machine-readable receipts covering risk/authority, chair
and stage ownership, adapter/model lineage, write scopes, checks/evals,
reviewer independence, failures, repair cycles, disagreements, degradation,
retention/resource closure and human-gate state. Objective evidence outranks
confidence. `clean` is valid; a fluent unverified result is not.

Operational depth is loaded only when triggered:

- orchestration/routing/Herdr: `skills/orchestrate/`
- ordinary change/review: `skills/change/`, `skills/code-review/`
- long sessions/context hygiene: `skills/session/`
- release and stochastic assurance: `skills/release/`, `skills/evaluate/`
- skill naming, promotion and token governance: `CONTRIBUTING.md`
