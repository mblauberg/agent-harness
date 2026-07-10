---
name: scope
description: Use when scoping a feature or milestone, stress-testing a plan or design, adjudicating between approaches, or turning a vague requirement into a spec, stories, acceptance criteria and decision records — in any project. The grill-first front door for anything not yet well-specified. Project-specific variants override this skill in their own workspace.
---

# scope — grill, research, adjudicate, then specify

Nothing enters implementation half-specified. Turn an idea into decided
scope: interrogate until the decision tree is resolved, research only what's
genuinely uncertain, adjudicate options, land outputs in the docs that own
them. A project's hard constraints are inputs, never re-litigated.

## 1. Frame

- What is being decided? Who is affected? What does done look like?
- Check the terrain first: search existing decision records, open-decision
  registers, and design systems — the answer may already exist.
- Emit a risk/authority profile using `config/risk-policy.json`: minimum tier,
  allowed source/artifact paths, prohibited actions, disclosure/secrets,
  external effects, expiry and approver. Humans approve any tier downgrade.
- Decide whether deterministic checks are enough. AI, ranking, heuristic or
  judgement-bearing behaviour gets an `evaluate` assurance requirement.

## 2. Grill (human-in-the-loop)

Load `grill-me`. Resolve or explicitly park every branch:

- One theme at a time: purpose → users → constraints → edge cases →
  failure modes → success criteria → what we are NOT building.
- Ask **one decision question per round**. Offer 2–3 concrete choices where
  useful and lead with a recommendation. Resolve each branch before opening the
  next; batch only independent clerical confirmations the user explicitly
  permits.
- Separate engineering calls (decide in chat) from owner calls (business,
  legal, money) — owner calls become register rows and the branch is parked,
  not guessed.
- A parked branch gets a named marker in the output spec, not silence.

## 3. Research and spike (only surviving uncertainty)

- Evidence questions → fan out research (orchestrate if
  available). Every claim that survives into the spec carries its source.
- Questions answerable by *building* → `prototype` skill: timeboxed throwaway
  spike, harvest the learning, delete the code. Cheaper than debate.
- Time-box both — they serve the decision, not curiosity.

## 4. Adjudicate

When 2+ viable approaches survive:

- One-paragraph case per option: cost, reversibility, risk surface, fit with
  prior decisions.
- Judge from distinct lenses (correctness, cost, ops burden) — independent
  subagents if available, else explicit sequential passes.
- Recommend one. **Costly-to-reverse → decision record (ADR)** with rejected
  alternatives and consequences. Cheap-to-reverse → record in the story/spec
  and move on. Don't mint ADRs for reversible detail.
- In paired-primary mode, one chair asks the questions; the peer audits the
  evidence and options through the chair. Record stage authorship so later
  review independence is measurable.

## 5. Land the outputs (nothing lives only in chat)

| Output | Home |
|---|---|
| Spec / stories + acceptance criteria (given/when/then, testable) | project docs (`engineering-docs` skill) |
| Decision records | project ADR process |
| Owner gates discovered | project open-decision register (none exists → create `docs/OPEN_DECISIONS.md`, `engineering-docs` default) |
| Work items | project tracker |
| Non-obvious durable context | project context docs / state file |

Acceptance criteria are the TDD contract: written so a test can be named
after each one. A story an agent can't turn into a failing test is not done
scoping.

Spec format: narrative in Markdown; nested config/schemas in **flat YAML
blocks** (not prose, not JSON — measurably better agent parsing). **Pin a
version for every dependency named** — agents regress to knowledge-cutoff
versions — and vendor docs beside the spec for anything post-cutoff.

## Red flags

- "The requirement is clear enough" → if two readings exist, grill.
- "I'll research everything first" → grill first; research survivors only.
- Adjudicating an owner-owned trade-off → gate row, not judgement call.
- Spec exists only in the conversation → land it before ending the session.
