---
name: skill-authoring
description: Use when creating, writing, or building a new agent skill — authoring SKILL.md, structuring a skill, progressive disclosure, bundling scripts or references, or getting a skill to trigger reliably. To audit or improve existing skills, use skill-audit instead.
---

# Skill authoring

A skill is reusable procedure a future agent can discover and apply, not a
narrative of one solved task. Use `skill-audit` instead for an existing skill.

## Build

1. Define the task/domain, positive triggers, adjacent exclusions, authority,
   artifacts and completion gate. Keep project-only policy local.
2. Choose one kebab-case capability name and create `SKILL.md`. Frontmatter has
   only `name` and `description`; quote or fold YAML-sensitive descriptions.
3. Put deterministic repeated behaviour in `scripts/`, stable depth in
   narrowly named `references/`, and reusable output shapes in `templates/`.
   References stay one hop from `SKILL.md`.
4. Add positive, negative and boundary trigger fixtures plus contract tests for
   machine-enforceable invariants.
5. Run the skill on a realistic fresh-agent task, repair what the run exposes,
   then execute the harness and public-safety gates.

## Description contract

The description is the routing surface. Start with `Use when`, front-load the
words users actually say, and describe *when* to load the skill rather than
summarising its workflow. State important exclusions and adjacent-skill
boundaries. Use third person, concrete symptoms/tools/file types, and keep it
under 1,024 characters; optimise the first 250.

```yaml
---
name: pdf-processing
description: Use when extracting text or tables from PDFs, filling forms, or merging scanned documents. Not for prose-only review.
---
```

## Body contract

Keep `SKILL.md` roughly 500 words or less: overview, behaviour-changing rules,
workflow, gates and links. Avoid dated logs, repeated emphasis, generic advice
agents already know, exhaustive flag lists and duplicate doctrine from another
skill. Prefer one runnable example. Link another skill by name instead of
copying it or force-loading its file.

## Verification

Discipline skills need adversarial scenarios that tempt rule-breaking;
technique skills need novel tasks that prove reference discovery. Test the
model-plus-harness, not whether the prose reads well. Record raw fixture
results and rerun after changes.

Before completion confirm: routing metadata is specific; authority and stop
conditions are explicit; body is compact; links/tools resolve; deterministic
logic has tests; fixtures cover confusion pairs; and a fresh agent succeeded.

Repository naming, promotion, retirement and release rules live in
`MAINTAINING.md`.
