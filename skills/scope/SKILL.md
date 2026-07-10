---
name: scope
description: Use when scoping a feature or milestone, stress-testing a plan or design, adjudicating between approaches, or turning a vague requirement into a spec, stories, acceptance criteria and decision records — in any project. The grill-first front door for anything not yet well-specified. Project-specific variants override this skill in their own workspace.
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
the spike. Neither lane exists for curiosity.

For multiple viable options, compare cost, reversibility, risk and prior
decision fit through distinct correctness/cost/operations lenses. Use
independent reviewers when available. Recommend one. Record costly-to-reverse
choices and rejected alternatives in an ADR; keep reversible detail in the
spec/story. Paired-primary mode has one chair ask questions while the peer
audits evidence; record authorship for later independence.

## Land outputs

Nothing stays only in chat:

| Output | Owner |
|---|---|
| Spec, stories, acceptance criteria | project docs via `engineering-docs` |
| One-way decisions | project ADR process |
| Human gates | existing register or `docs/OPEN_DECISIONS.md` |
| Work items | project tracker |
| Durable context | project context/state owners |

Write acceptance criteria as observable Given/When/Then behaviour so `tdd` can
name a failing test for each. If that is impossible, scope is incomplete.
Markdown holds narrative; flat YAML blocks hold nested config/schemas. Pin every
named dependency version; use YAML, not JSON, and vendor authoritative docs
beside the spec for post-cutoff APIs.

Before handoff confirm all branches are decided or parked, exclusions and
failure modes are explicit, authority/risk are machine-readable, evidence is
anchored, and a human approved the spec and one-way doors.
