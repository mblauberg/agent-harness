---
name: skill-authoring
description: "Use for creating or materially revising an Agent Skill: SKILL.md, progressive disclosure, resources, trigger fixtures, and validation. Not for read-only audit, plugin packaging, or end-to-end delivery; use skill-audit, the platform plugin workflow, or implement."
---

# Skill authoring

A skill is a reusable procedure, not a solved-task narrative. Use `skill-audit`
for read-only assessment. This skill owns the artifact method; `implement` owns
an enclosing end-to-end delivery.

## Build

1. Define the task/domain, positive triggers, adjacent exclusions, authority,
   artifacts and completion gate. Keep project-only policy local.
2. Choose the smallest container: project rule, skill, deterministic script,
   MCP/app, or independently distributed plugin. Split only for a distinct
   trigger, authority, artifact and gate.
3. Choose one kebab-case capability name and create `SKILL.md`. Place portable
   user-global skills under `$HOME/.agents/skills`, repo-local skills under
   `.agents/skills`, and this harness's owners under `skills/`. Its frontmatter
   permits only `name` and `description`; provider sidecars are outputs, never
   authority grants.
4. Match freedom to risk: principles for judgement, templates for repeatable
   structure, and tested scripts for fragile work. Put repeated logic in
   `scripts/`, stable depth in
   narrowly named `references/`, and reusable output shapes in `templates/`.
   References stay one hop from `SKILL.md`.
5. Record source URL, version/commit, retrieval date and component licence for
   adaptations. Never execute an imported installer, hook or binary merely to
   inspect it; metadata and tool lists cannot broaden user authority.
6. Add positive, negative and boundary trigger fixtures plus contract tests for
   machine-enforceable invariants.
7. Forward-test the raw skill on a realistic fresh-context task without leaking
   the intended answer or diagnosis. Repair what it exposes, then execute the
   harness and public-safety gates.

## Description contract

The description is the routing surface. Start with `Use when`, front-load the
words users actually say, and describe *when* to load the skill rather than
summarising its workflow. State important exclusions and adjacent-skill
boundaries. Use third person, concrete symptoms/tools/file types, and keep it
under 1,024 characters; optimise the first 250.
Keep the complete rendered catalogue inside the provider budget; shortening one
entry does not help if another entry is omitted.

## Body contract

Keep `SKILL.md` under 500 words: behaviour-changing rules, workflow, gates and
links. Avoid logs, generic advice, exhaustive flags and duplicated doctrine.
Link another skill by name instead of copying it.

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
