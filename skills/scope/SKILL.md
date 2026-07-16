---
name: scope
description: "Use when unsettled requirements or decisions need a spec, options, acceptance criteria, authority bounds, or decision record. Not for implementing approved scope or writing files during read-only advice; use implement."
---

# Scope

Turn an idea into decided, testable scope. Treat project constraints as inputs;
leave no plausible execution ambiguity.

## Frame

Define the decision, affected users and done. Search current specs, registers
and design systems. Emit the minimum `config/risk-policy.json` tier plus allowed
source/artifact paths, prohibited actions, disclosure/secrets, external effects,
expiry and approver. Only a user may downgrade risk. Judgement-bearing AI,
ranking or heuristics require `evaluate`.

Preserve decision context: intake/revision, goals, constraints, alternatives,
evidence and decided/parked branches. Revise it; never fork competing scope.

## Grill

Load `grill-me` only when the user explicitly asks to be grilled or dependent
owner decisions remain materially unresolved. Then work purpose -> users ->
constraints -> edge cases -> failure modes -> success -> exclusions, one
decision question per round. Otherwise use the supplied/current context and
present a compact decision packet with 2–3 concrete choices, a recommendation
and clearly parked owner calls.

Agents decide engineering calls. Business, legal or financial owner calls stay
parked as named open-decision rows; never guess. Put every unresolved branch in
the spec.

## Resolve uncertainty

Research only surviving evidence questions; use `orchestrate` for useful
fan-out and source every retained claim. Use `prototype` when a timeboxed
throwaway answers feasibility; harvest its result and delete/quarantine only
manifest-owned scratch under its authority. Neither lane exists for curiosity.

For multiple viable options, compare cost, reversibility, risk and prior
decision fit through correctness/cost/operations lenses. Use independent
reviewers when available; recommend one. Put costly-to-reverse choices and
rejected alternatives in an ADR, reversible detail in the spec/story.
Paired-primary mode has one chair ask while the peer audits evidence; record
authorship for later independence.

## Land outputs

First resolve artifact authority and canonical owners. In advisory/read-only
mode, return proposed scope and named open decisions in chat; do not change
project files. In project-write mode, land only approved artifacts:

| Output | Owner |
|---|---|
| Spec, stories, acceptance criteria | project docs via `engineering-docs` |
| One-way decisions | project ADR process |
| User gates | existing register or `docs/OPEN_DECISIONS.md` |
| Work items | project tracker |
| Durable context | project context/state owners |

Write clear, observable, verifiable acceptance criteria. Given/When/Then helps
behavioural cases but is not mandatory for research, documents or operations.
Preserve project Markdown/YAML/JSON schema. Pin only decision-critical external
interfaces through project-native locks/constraints. Link or cache permitted
authoritative material with source, version/date and digest; never vendor
without licence and redistribution authority.

Before handoff confirm: branches decided/parked; explicit exclusions/failure
modes; machine-readable authority/risk; anchored evidence; user approval of
spec and one-way doors. Execution handoff is digest-bound to exact approved
scope, decisions and authority; change creates a new revision and gate.

## Adapter-absent path

Without optional Console, Herdr or GitHub, use canonical project artifacts and
emit the skill-owned kind in
[portable-workflow.v1.json](portable-workflow.v1.json). It records scope
evidence; never supplies user approval.
