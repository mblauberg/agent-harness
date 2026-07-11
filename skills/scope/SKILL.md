---
name: scope
description: "Use when unsettled requirements or decisions need a spec, options, acceptance criteria, authority bounds, or decision record. Not for implementing approved scope or writing files during read-only advice; use implement."
---

# Scope

Turn an idea into decided, testable scope. Project constraints are inputs, not
debate topics; nothing enters execution with two plausible interpretations.

## Frame

Define the decision, affected users and done. Search current specs, decision
registers and design systems first. Emit the minimum tier from
`config/risk-policy.json` plus allowed source/artifact paths, prohibited
actions, disclosure/secrets, external effects, expiry and approver. Only a
human may downgrade risk. Judgement-bearing AI, ranking or heuristic behaviour
adds an `evaluate` requirement.

Preserve decision context: intake/revision, goals, constraints, alternatives,
evidence and decided/parked branches. Revise it rather than spawning a
competing scope thread.

## Grill

Load `grill-me` and resolve purpose -> users -> constraints -> edge cases ->
failure modes -> success -> exclusions. Ask one decision question per round;
offer 2–3 concrete choices and a recommendation when useful. Batch only
independent clerical confirmations the human permits.

Agents decide engineering calls. Business, legal or financial owner calls
become named open-decision rows and remain parked; never guess them. Every
unresolved branch appears explicitly in the spec.

## Resolve uncertainty

Research only surviving evidence questions; use `orchestrate` for useful
fan-out and attach a source to every retained claim. Use `prototype` when a
timeboxed throwaway build can answer feasibility; harvest the result and delete
or quarantine only manifest-owned scratch under its authority. Neither lane
exists for curiosity.

For multiple viable options, compare cost, reversibility, risk and prior
decision fit through distinct correctness/cost/operations lenses. Use
independent reviewers when available. Recommend one. Record costly-to-reverse
choices and rejected alternatives in an ADR; keep reversible detail in the
spec/story. Paired-primary mode has one chair ask questions while the peer
audits evidence; record authorship for later independence.

## Land outputs

First resolve artifact authority and the project's canonical owners. In
advisory/read-only mode, return a proposed scope and named open decisions in
chat; do not create or update project files. In project-write mode, land only
the approved artifacts:

| Output | Owner |
|---|---|
| Spec, stories, acceptance criteria | project docs via `engineering-docs` |
| One-way decisions | project ADR process |
| Human gates | existing register or `docs/OPEN_DECISIONS.md` |
| Work items | project tracker |
| Durable context | project context/state owners |

Write acceptance criteria in the clearest observable, verifiable form;
Given/When/Then is useful for behavioural cases but not mandatory for every
research, document or operational outcome. Preserve the project's established
Markdown/YAML/JSON schema. Pin only decision-critical external interfaces in
the project-native lock or constraint mechanism. Link or cache permitted
authoritative material with source, version/date and digest; do not vendor it
without licence and redistribution authority.

Before handoff confirm all branches are decided or parked, exclusions and
failure modes are explicit, authority/risk are machine-readable, evidence is
anchored, and a human approved the spec and one-way doors. The execution
handoff is digest-bound to the exact approved scope, decisions and authority;
change creates a new revision and gate.
