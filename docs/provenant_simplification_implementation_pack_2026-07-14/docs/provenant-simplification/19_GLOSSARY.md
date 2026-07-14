# Glossary

## Chair

The single primary model/session accountable for user communication, decomposition, canonical planning, integration and synthesis.

## Worker

A bounded provider-native or external agent assigned an exact objective, authority, output and budget.

## Other primary

The primary model family not acting as chair. Used for challenge, independent review or specialist work where justified.

## Invariant kernel

The small coded Provenant core that owns authority, ownership, budgets, gates, evidence, recovery and effects.

## ScopePacket

Approved durable statement of goals, non-goals, acceptance criteria, decisions, evidence, risk and authority request.

## Initiative

A parent outcome that decomposes into several independently valuable WorkItems.

## WorkItem

The normal implementation unit, binding objective, acceptance, authority, budget, dependencies, evidence and PR lineage.

## Run envelope

Minimal durable data required to govern a delivery run.

## Work graph

Optional semantic task and dependency graph used for multi-owner, long-running or recovery-heavy work. Not required for ordinary work.

## Capability profile

Provider-neutral named execution posture such as `review-readonly` or `workspace-write-offline`.

## CapabilityDecision

Kernel-produced effective permissions after intersecting all authority and capability constraints.

## Write lease

Exclusive ownership of an exact source surface or workspace generation.

## Deterministic gate

A check with machine-observable pass/fail semantics, such as tests, compiler, schema, static analysis or policy validation.

## Judgement gate

Independent qualitative evaluation used where deterministic oracles are insufficient.

## ReviewPlan

Policy-derived statement of required deterministic checks, reviewers, human gates and repair limits.

## LoopPolicy

Boundaries for adaptive iteration: success, progress, budgets, no-progress, terminal states and escalation.

## Effect

A state mutation outside the owned workspace, including push, PR, issue mutation, merge, release, deploy, send or infrastructure change.

## EffectProposal

Exact, digest-bound request for a trusted executor to perform an external effect.

## Receipt

Canonical runtime evidence of authority, actions, artefacts, checks, reviews, budgets, degradations, effects and final state.

## Projection

Read model shown through CLI, Console, Herdr or native UI. It does not own truth.

## Progressive governance

Applying control weight according to risk, blast radius, reversibility, sensitivity and oracle strength.

## Minimal baseline

A strong chair model with repository instructions, one workspace, ordinary tools and tests. Used to test whether harness complexity adds value.

## Scope drift

Material change to objective, acceptance criteria, risk or authority that invalidates the current approved run.

## No progress

Repeated actions, errors or states without new evidence or improved verification.

## Provider-native orchestration

Use of Codex or Claude's own subagents, sessions, worktrees, permissions and lifecycle mechanisms behind Provenant authority.
