<div align="center">

# Agent Harness

**31 reusable Agent Skills for scoped, verified delivery with Claude Code and Codex.**

[![CI](https://github.com/mblauberg/agent-harness/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mblauberg/agent-harness/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/github/license/mblauberg/agent-harness)](LICENSE)

</div>

Claude Code and Codex can each lead. For substantial work, one leads while the
other reviews independently. Gemini, xAI and other configured models can add
second opinions; their absence never blocks the work.

Platform/system policy and explicit human authority lead; the nearest project
instruction may specialise or strengthen the global harness but may not
silently broaden authority, weaken safety gates or redefine global
cross-project memory policy.

## Quick start

Clone the harness, then install its skills and instruction bootstrap:

```sh
git clone https://github.com/mblauberg/agent-harness.git "$HOME/.agents"
export AGENTS_HOME="$HOME/.agents"

# Claude Code
"$AGENTS_HOME/scripts/install-harness" --platform claude

# Codex
"$AGENTS_HOME/scripts/install-harness" --platform codex
```

The installer records harness-owned links in a versioned manifest and never
overwrites unmanaged skills or instructions.

Inspect or reconcile an installation without overwriting unmanaged content:

```sh
"$AGENTS_HOME/scripts/manage_installation.py" plan --target "$HOME/.codex/skills"
"$AGENTS_HOME/scripts/manage_installation.py" reconcile \
  --target "$HOME/.codex/skills" \
  --renames "$AGENTS_HOME/config/skill-renames.json"
```

Requires Git and an Agent Skills client. Python 3.11+, PyYAML and pytest run
the checks. [Herdr](https://herdr.dev) enables observable paired work.

## Lifecycle

```mermaid
flowchart TB
    accTitle: Agent harness lifecycle
    accDescr: Work moves from context and human-approved intent through a delivery profile, evidence, independent review and acceptance to separately authorised release, observation and improvement.
    S["session · establish context"] --> P["scope · specification and acceptance criteria"]
    P --> H1{{"HUMAN · approve specification and authority"}}
    H1 --> D["deliver · profile and typed RUN.json"]
    D --> X["execute · implement or domain skills"]
    X --> V["verify · deterministic checks and evals"]
    V --> R["review · independent lenses and bounded repair"]
    R --> H2{{"HUMAN · final acceptance"}}
    H2 --> H3{{"HUMAN · authorise external action or promotion"}}
    H3 --> L["external action · release or domain hand-off"]
    L --> O["observe · profile-specific evidence"]
    O --> T["retrospect · improve the next cycle"]
```

| Stage | Output | Human decision |
|---|---|---|
| Session | Current context and authority | None |
| Scope | Specification and acceptance criteria | Approve scope and one-way doors |
| Deliver | Profiled artifacts, typed evidence and independent review | Accept, rescope or stop |
| External action | Deploy, share, file, publish or use decision | Authorise the named action |
| Observe | Profile-specific outcome evidence | None; failure returns to diagnosis |
| Retrospect | Evidence-backed improvements and promoted learning | Material changes return through scope |

Failed checks return to execution. Blocking findings repair and re-run twice at
most; scope drift returns to the human. Failed observation opens `diagnose`.
External and irreversible actions need separate authority.

## Core workflows

| Need | Skill | Result |
|---|---|---|
| Turn an idea into an approved contract | [`scope`](skills/scope/SKILL.md) | Specification, stories and acceptance criteria |
| Deliver an approved cross-domain outcome | [`deliver`](skills/deliver/SKILL.md) | Profiled artifacts, typed evidence, review and acceptance gate |
| Deliver an approved change | [`implement`](skills/implement/SKILL.md) | Verified change, independent review and bounded repair |
| Investigate a failure | [`diagnose`](skills/diagnose/SKILL.md) | Evidence-backed cause without an unapproved permanent edit |
| Review beyond the diff | [`code-review`](skills/code-review/SKILL.md) | Multi-lens findings with structural and architectural coverage |
| Coordinate parallel agents | [`orchestrate`](skills/orchestrate/SKILL.md) | Partitioned work, cross-family verification and synthesis |
| Run a long, resumable effort | [`autonomous-lab`](skills/autonomous-lab/SKILL.md) | Crash-safe progress until a human stops the run |
| Keep long work recoverable | [`session`](skills/session/SKILL.md) and [`work-map`](skills/work-map/SKILL.md) | Lean context, hand-offs and durable state |
| Promote an accepted change | [`release`](skills/release/SKILL.md) | Controlled rollout, rollback and observation |
| Improve the next cycle | [`retrospect`](skills/retrospect/SKILL.md) | Root-cause clusters, regression gates and promoted learning |

## Skill library

<!-- skill-catalogue:start -->
| Area | Skills |
|---|---|
| Delivery | [`session`](skills/session/SKILL.md), [`scope`](skills/scope/SKILL.md), [`deliver`](skills/deliver/SKILL.md), [`implement`](skills/implement/SKILL.md), [`tdd`](skills/tdd/SKILL.md), [`diagnose`](skills/diagnose/SKILL.md), [`code-review`](skills/code-review/SKILL.md), [`evaluate`](skills/evaluate/SKILL.md), [`release`](skills/release/SKILL.md), [`retrospect`](skills/retrospect/SKILL.md), [`work-map`](skills/work-map/SKILL.md) |
| Orchestration | [`orchestrate`](skills/orchestrate/SKILL.md), [`autonomous-lab`](skills/autonomous-lab/SKILL.md), [`agy-headless`](skills/agy-headless/SKILL.md) |
| Writing and documentation | [`engineering-docs`](skills/engineering-docs/SKILL.md), [`engineering-writing`](skills/engineering-writing/SKILL.md), [`academic-writing`](skills/academic-writing/SKILL.md), [`legal-writing`](skills/legal-writing/SKILL.md), [`natural-writing`](skills/natural-writing/SKILL.md) |
| Design and diagrams | [`frontend-design`](skills/frontend-design/SKILL.md), [`prototype`](skills/prototype/SKILL.md), [`d2-diagrams`](skills/d2-diagrams/SKILL.md), [`uml-diagrams`](skills/uml-diagrams/SKILL.md) |
| Web engineering | [`playwright`](skills/playwright/SKILL.md), [`react-performance`](skills/react-performance/SKILL.md), [`tanstack-query`](skills/tanstack-query/SKILL.md), [`typescript-clean-code`](skills/typescript-clean-code/SKILL.md), [`web-stack-conventions`](skills/web-stack-conventions/SKILL.md) |
| Harness development | [`grill-me`](skills/grill-me/SKILL.md), [`skill-audit`](skills/skill-audit/SKILL.md), [`skill-authoring`](skills/skill-authoring/SKILL.md) |
<!-- skill-catalogue:end -->

## Models and review

| Role | Policy |
|---|---|
| Session chair | Claude Code or Codex owns communication, authority and final synthesis |
| Native workers | The chair's subagents provide parallel depth within partitioned scopes |
| Other primary | Required independent review for substantial and higher-risk work |
| Additional families | Gemini, xAI and other adapters provide non-blocking blind-spot checks |
| Routing | Runtime capability discovery resolves `flagship`, `workhorse` and `scout` aliases |

Review findings become blocking through evidence and corroboration, not model
votes. Missing optional providers are recorded and skipped.

## Delivery profiles

| Profile | Typical outputs | Minimum evidence shape |
|---|---|---|
| Software | Source, migrations, configuration | Tests plus code review |
| Research | Report, dataset, evidence map | Source coverage plus source-quality review |
| Analysis | Model, table, visualisation | Recalculation plus interpretation review |
| Document | Markdown, DOCX, PDF, slides, sheets | Render checks plus audience-fit review |
| Agent product | Prompts, tools, policies, eval sets | Tests, permissions, behavioural eval and red team |

High-stakes work adds source-authority, privacy, qualified-review and explicit
human-action controls to any profile. Profile rules live in
[`config/delivery-profiles.json`](config/delivery-profiles.json); the neutral
receipt and validator live with [`deliver`](skills/deliver/SKILL.md).

Run the independent profile gate from any directory:

```sh
python3 "${AGENTS_HOME:-$HOME/.agents}/scripts/validate_delivery_scenarios.py"
```

## Safety

| Boundary | Rule |
|---|---|
| Authority | Filesystem access, credentials and subscriptions never grant permission |
| Git | No branch or worktree is created without direct human authorisation |
| Concurrency | Agents never write the same source surface concurrently |
| Knowledge | Durable facts live in project-owned specs, ADRs, runbooks and state files |
| Release | Final acceptance and production promotion remain human decisions |

See [`HARNESS.md`](HARNESS.md) for the operating contract and
[`SECURITY.md`](SECURITY.md) for vulnerability reporting.

[`Architecture`](docs/ARCHITECTURE.md) ·
[`Research`](docs/research/agentic-sdlc-harness-2026.md) ·
[`Lifecycle spec`](docs/specs/02-adaptive-agent-harness.md) ·
[`Maintenance`](MAINTAINING.md) ·
[`Acknowledgements`](ACKNOWLEDGEMENTS.md) ·
[`Third-party notices`](THIRD_PARTY_NOTICES.md) ·
[`Security`](SECURITY.md) ·
[`MIT licence`](LICENSE)
