# Harness architecture

## Purpose

This repository is an operating system for agent work, not a prompt collection.
It implements a general agentic SDLC that can be used for software, research,
analysis, documentation and other evidence-bearing work. The objective is
quality per human attention-hour: agents create depth and verification; humans
retain scarce judgement at consequential gates.

`AGENTS.md` is the tiny bootstrap every operator sees. `HARNESS.md` is the
compact runtime constitution. Skills load procedural depth only when triggered.
This document preserves the design intent so future maintainers can change the
harness without rediscovering it from individual skills.

## Lifecycle and human gates

```text
start/context -> scope -> approved specification -> authorised execution
              -> objective verification -> independent review -> repair
              -> human acceptance -> authorised release -> observation
              -> retrospective evidence -> next-cycle scope
```

The lifecycle loops. A failed check returns to execution; a structural review
finding may return to scope; production evidence may open a diagnosis and a new
implementation run. `retrospect` closes the quality flywheel by benchmarking
the completed trajectory, clustering root causes, proposing small
evidence-backed harness changes, adding regression gates and monitoring the
next comparable run. It promotes durable learning into canonical project docs
instead of accumulating retrospective logs. `autonomous-lab` adds crash-safe
persistence for genuinely sprawling run-until-STOP work, but does not replace
the ordinary delivery loop.

Human approval is required for:

- the specification and unresolved acceptance criteria;
- one-way-door architecture and risk-tier downgrades;
- destructive, irreversible or externally visible actions;
- external communications and production promotion;
- final acceptance.

Routine reversible implementation inside approved authority does not need a
stream of micro-approvals.

## Neutral delivery kernel

`deliver` is the cross-domain lifecycle front door and `delivery-run` schema v1 is
its portable state machine. It selects one profile from
`config/delivery-profiles.json`: software, research, analysis, document or
agent product. The high-stakes overlay adds source-authority, privacy,
qualified-review and explicit human-action controls without multiplying the
base profiles.

A digest-bound project policy may add a complete profile or add evidence and
measure gates to a built-in profile. Global minima load first and cannot be
removed or reclassified by the project overlay.

The kernel binds approved intent, design, authority, artifacts, deterministic
and judgement evidence, review independence, acceptance, release, observation
and retrospective linkage. Domain skills own methods; the kernel owns state
and proof. `implement` remains the software front door and uses the same
canonical receipt; there is no parallel implementation schema or adapter.

Software execution composes bounded techniques rather than duplicating
lifecycle owners: `tdd` for new or changed observable behaviour, `refactor` for
approved behaviour-preserving structural work, and `diagnose` when root cause is
unknown. `code-review` remains source-read-only and independent. SOLID,
information hiding, cohesion, coupling, simplicity, idempotency and similar
principles are hypothesis generators; a finding still needs a concrete failure
mechanism, impact, evidence and validation route.

Frontend authority is similarly split: `frontend-design` owns authorised design
mutation, while `frontend-review` owns read-only UX, visual, accessibility and
responsive evidence. `playwright`, `web-stack-conventions` and
`react-performance` provide tool or standards evidence without taking over the
UI finding contract. `caveman` is a presentation overlay only; it cannot narrow
evidence, authority, high-stakes clarity or an artifact's domain-writing rules.

`release` promotes one digest-pinned, human-accepted artifact through a separately
authorised `deploy`, `publish`, `share`, `send` or `activate` action. Targets are
typed as environments, recipients or audiences; execution may use an approved
command, connector or named human operation. Completion requires target-visible
proof and an observation/reversal contract, not merely a successful command.

## Equal primaries, accountable ownership

Claude Code and Codex are equal primary orchestrators. Whichever harness the
human starts is the session chair and owns authority, user communication, run
state and synthesis. On substantial work it combines:

1. native same-family subagents for parallel depth;
2. the other primary family for independent, load-bearing review;
3. optional Gemini, xAI or other families for dissent and blind-spot discovery.

Bonus-family failure never blocks the workflow. The other primary is required
for the substantial review contract unless the human accepts an explicitly
recorded degradation.

Paired-primary mode lets Claude and Codex rotate stage ownership through Herdr.
It still has one chair and one active owner per stage, namespaced artifacts and
non-overlapping write scopes. Pane transcripts are transport, not durable state.
Pi is dormant by default until its provider, economics, permissions and receipt
quality are deliberately accepted.

## Routing, adapters and receipts

The router separates policy from execution:

- `config/model-routing.json` describes families, aliases and fallbacks;
- `scripts/model-route` resolves a role from runtime capabilities;
- adapter scripts execute the resolved route;
- receipts record requested and actual identity, effort and substitutions.

`flagship`, `workhorse` and `scout` are capability aliases, not permanent jobs
for a vendor. Claude Fable is preferred for the Claude lead route with Opus as
fallback; GPT-5.6 supports `ultra` where runtime discovery proves it. Model
catalogues are dated caches, not assertions about current availability.

## Review as a council, not a vote

The review system borrows the useful parts of council-style workflows:
independent first passes, deliberately different lenses, anonymised challenge
where anchoring matters, and a fresh reducer that adjudicates against evidence.
It rejects majority voting and repetitive reviewers.

The review lead chooses lenses proportional to the work: correctness, security,
performance, reliability/concurrency, state and type boundaries, test coverage,
spec alignment, readability/maintainability and larger structural
simplification. Findings become blocking only when evidence and primary-family
corroboration justify it.

## Authority and concurrency

Authority is a machine-readable envelope: allowed source and artifact paths,
prohibited paths/actions, disclosure, secrets, deployment, irreversible
actions, expiry and approver. Delegation may only narrow it.

There is no overlapping concurrent source writing. Partition ownership, use
artifact-only workers, or have one serial integrator apply patches. Worktrees
are visibility and isolation aids, not permission boundaries; their shared
location and lifecycle are defined in [worktrees.md](worktrees.md).

## Context and durable memory

Project knowledge must remain visible to every family. Durable facts therefore
live in project-owned state files, specifications, ADRs, runbooks and context
digests. Private harness memory is limited to cross-project user preferences.

Workers return compressed findings and artifact paths. Session hygiene checks
freshness, size, duplication, stale logs, scratch manifests and handoff quality.
Pruning is conservative: delete only proven run-owned ephemeral data, compact
rather than blindly append, and merge or split curated documents when their
retrieval cost signals demand it. Sibling `.worktrees` are protected and
excluded from context scans.

## Managed installation

`scripts/manage_installation.py` plans, installs, reconciles and removes only
harness-owned skill links. A versioned manifest records ownership, source
tree digests, the bound target and rename history beside the target skills
directory. Unmanaged paths are never claimed or overwritten; changed managed
targets fail for human resolution and link
mutations roll back if the manifest commit fails.
Provider bootstraps remain small and share the same precedence sentence.

## Project Fabric Console

The Spec 05 Console remains a projection-only executable over the public
Fabric protocol. Its terminal layer uses Node 24 with a project-owned
responsive cell-grid renderer and bounded keyboard/SGR parser, selected through the
[terminal-runtime decision](research/project-fabric-console-tui-options-2026.md).
It does not use Ink, blessed or a native UI core. An early PTY gate must prove
the exact default/reference 80 by 24 frame, dynamic terminal reflow,
resize-state preservation, mouse selection, hostile-text handling and terminal
restoration; failure switches the implementation to the documented
Rust/Ratatui fallback.

The language choice does not move authority into the Console. Fabric remains
the transaction owner, and keyboard, mouse and typed commands converge on one
revision-bound action-intent and confirmation path.

The live control path follows `observe external facts -> commit durable facts
-> derive projection and attention -> typed action`. A snapshot cursor and the
snapshot are read atomically; live transport is a wake accelerator for durable
at-least-once cursor catch-up with stable-cursor idempotence, never another
event truth. Consequential Git actions bind the source and expected destination
object IDs plus state digests, hold or revalidate local state through the
effect, and use an atomic destination lease. These and other retained patterns
are recorded in the
[open-source harness comparison](research/open-source-agent-harness-patterns-2026.md).

The canonical skill catalogue is also a constrained interface. Every skill has
balanced positive, negative and boundary routes; descriptions place the trigger
and nearest exclusion early and the complete rendered catalogue stays inside
the provider discovery budget. A skill carries occasional judgement-rich
procedure, a script/hook enforces deterministic policy, an MCP/app adds an
external capability, and a plugin distributes a stable coherent bundle. Public
packs are research inputs, not wholesale imports.

## Completion evidence

Substantial runs record risk and authority, chair/stage ownership, actual model
lineage, checks and evals, reviewer independence, repair cycles, disagreements,
degradation, retained artifacts and human-gate state. Deterministic checks come
before judgement. A fluent answer without trajectory evidence is not complete.

## Design constraints for maintainers

- Keep `AGENTS.md` and `HARNESS.md` small enough to load every session.
- Put operational detail in skill references and executable checks.
- Keep model identities in routing data, not scattered prose or shell cases.
- Make optional providers additive and non-blocking.
- Prefer explicit receipts over raw transcripts or hidden memory.
- Generalise only proven cross-project patterns; leave project policy local.
- Test failure modes that were observed in real runs, including Herdr transport,
  provider limits, context churn and partial review artifacts.
