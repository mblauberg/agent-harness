# Open-source agent-harness patterns for Project Fabric

Date: 11 July 2026
Decision: retain the approved Fabric architecture; apply bounded implementation
hardening without importing another control plane or changing the binding spec

## Finding

No reviewed project combines Fabric's one accountable chair per coordination
run, generation-fenced authority, atomic scoped gates, hierarchical
reservations, durable paired-result delivery and one SQLite transaction owner.
The closest product/control-plane analogue is
[Agent Orchestrator](https://github.com/AgentWrapper/agent-orchestrator), the
strongest event-stream reference is
[OpenCode](https://github.com/anomalyco/opencode), the strongest immutable Git
approval reference is [Open SWE](https://github.com/langchain-ai/open-swe), and
the closest persistent worker/worktree fleet is
[Gas Town](https://github.com/gastownhall/gastown) with
[Beads](https://github.com/gastownhall/beads). These are pattern sources, not
dependencies.

Other useful comparisons were
[OpenAI Symphony](https://github.com/openai/symphony),
[OpenAI Codex](https://github.com/openai/codex),
[OpenHands](https://github.com/OpenHands/OpenHands),
[Cline](https://github.com/cline/cline) and
[Cline Kanban](https://github.com/cline/kanban),
[agtx](https://github.com/fynnfluegge/agtx),
[Claude Squad](https://github.com/smtg-ai/claude-squad),
[Gemini CLI](https://github.com/google-gemini/gemini-cli),
[Goose](https://github.com/aaif-ai/goose),
[Aider](https://github.com/Aider-AI/aider),
[SWE-agent](https://github.com/SWE-agent/SWE-agent),
[Continue](https://github.com/continuedev/continue),
[Vibe Kanban](https://github.com/BloopAI/vibe-kanban) and the archived
[Overstory](https://github.com/jayminwest/overstory). Maintained and archived
projects were used as evidence, not as claims of compatibility.

## Adopted implementation patterns

These are non-normative implementation and test constraints derived from the
existing projection-only, revision-bound and fail-closed requirements. They do
not amend Spec 05 or widen its product surface.

| Pattern | Fabric placement |
| --- | --- |
| Event journal plus materialized snapshot/query tables and row revisions | Keep the daemon database authoritative; use at-least-once durable cursor reads and stable-cursor idempotence so snapshot-to-live catch-up has no silent gaps. |
| One scheduler/transaction owner with stable task identity | Keep one accountable chair and daemon mutator; provider sessions may rotate without changing task/workstream identity. |
| Generation-specific adapter readiness | Relaunch, resume, reattach or provider rotation clears old readiness and proves the new provider/session/pane/capability tuple. |
| Structural worktree preflight | Verify canonical root, managed containment, `.git` indirection, registration, expected object and lease generation before admission/recovery/removal. |
| Safe-turn input delivery with a durable transaction | Use provider safe boundaries only after persisted claim; consume only after structured acknowledgement. |
| Typed source/revision attention dedupe | Dedupe by stable source, revision/generation and attention class, never rendered wording. |
| Immutable Git approval | Bind preview and authority to repository, expected destination object, source object and dirty/diff facts; hold or revalidate local state through the effect and execute with an atomic destination lease. |
| Dynamic full-frame terminal layout | Derive regions from current dimensions, keep state outside rendering and recompute hit regions after resize. |
| Exact configuration, trajectory and outputs | Preserve run/evaluation inputs, results, receipts and review provenance under the canonical delivery run. |

The resulting invariant is:

```text
observe external facts -> commit durable facts -> derive projection/attention -> typed act
```

An observer or adapter failure changes freshness to `stale` or `unavailable`.
It never proves completion, gate resolution, provider death or successful
delivery.

## Rejected anti-patterns

- pane output, process presence, idle time, artifact existence or PR state as
  authoritative lifecycle truth;
- approval through a generic button, issue closure, permissive prompt or
  in-memory callback;
- auto-commit, auto-push, auto-PR, auto-merge or auto-release defaults;
- a second task/gate database or external issue tracker as canonical state;
- peer authority without one accountable chair and one active stage owner;
- delete-before-inject queues or child failure that loses partial results;
- worktree/sandbox isolation treated as an authority grant; and
- fixed viewport coordinates or UI-side mutation logic.

## Parked scope

Do not add a browser Console, cloud sandbox requirement, general workflow
engine, external issue-ledger authority, multi-project portfolio, automatic
merge queue or second database to Spec 05 v1.1. Diff-hunk-bound review feedback
and persisted adapter capability discovery are useful later refinements; the
current implementation may expose compatible typed fields but shall not widen
the accepted product scope to ship them.
