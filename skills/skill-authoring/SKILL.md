---
name: skill-authoring
description: "Use for creating a new Agent Skill, including SKILL.md, progressive disclosure, resources, fixtures, and validation. Not for auditing an existing skill or building a plugin; use skill-audit or the platform plugin workflow."
---

# Skill authoring

A skill is reusable procedure a future agent can discover and apply, not a
narrative of one solved task. Use `skill-audit` instead for an existing skill.

## Build

1. Define the task/domain, positive triggers, adjacent exclusions, authority,
   artifacts and completion gate. Keep project-only policy local.
2. Choose the smallest correct container: always-on project rule -> project
   instructions; occasional judgement-rich procedure -> skill; deterministic
   enforcement -> script; external capability/data plane -> MCP/app; stable,
   independently versioned bundle -> plugin. Split only for a distinct trigger,
   authority, artifact and gate.
3. Choose one kebab-case capability name and create `SKILL.md`. This harness's
   local profile permits only `name` and `description`; optional provider
   sidecars are compatibility outputs, never authority grants.
4. Match freedom to risk: concise principles for judgement, a bounded template
   for repeatable structure, and tested scripts for exact or failure-prone work.
   Put deterministic repeated behaviour in `scripts/`, stable depth in
   narrowly named `references/`, and reusable output shapes in `templates/`.
   References stay one hop from `SKILL.md`.
5. Record source URL, version/commit, retrieval date and component licence for
   adaptations. Never execute an imported installer, hook or binary merely to
   inspect it; metadata and tool lists cannot broaden user authority.
6. Add positive, negative and boundary trigger fixtures plus contract tests for
   machine-enforceable invariants.
7. Run the skill on a realistic fresh-agent task, repair what the run exposes,
   then execute the harness and public-safety gates.

## Description contract

The description is the routing surface. Start with `Use when`, front-load the
words users actually say, and describe *when* to load the skill rather than
summarising its workflow. State important exclusions and adjacent-skill
boundaries. Use third person, concrete symptoms/tools/file types, and keep it
under 1,024 characters; optimise the first 250.
Keep the complete rendered catalogue inside the provider budget; shortening one
entry does not help if another entry is omitted.

## Body contract

Keep `SKILL.md` roughly 500 words or less: overview, behaviour-changing rules,
workflow, gates and links. Avoid dated logs, repeated emphasis, generic advice
agents already know, exhaustive flag lists and duplicate doctrine from another
skill. Prefer one runnable example. Link another skill by name instead of
copying it or force-loading its file.

## Verification

Discipline skills need adversarial scenarios that tempt rule-breaking;
technique skills need novel tasks that prove reference discovery. Test the
model-plus-harness, not whether the prose reads well. For material changes,
freeze held-out routing cases and compare candidate, without-skill and previous
package arms across current primary families; retain omissions, failures, model
lineage, quality and total treatment cost.

Before completion confirm: routing metadata is specific; authority and stop
conditions are explicit; body is compact; links/tools resolve; deterministic
logic has tests; fixtures cover confusion pairs; and a fresh agent succeeded.

Repository naming, promotion, retirement and release rules live in
`MAINTAINING.md`.
