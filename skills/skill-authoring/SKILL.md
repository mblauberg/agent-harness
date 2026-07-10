---
name: skill-authoring
description: Use when creating, writing, or building a new agent skill — authoring SKILL.md, structuring a skill, progressive disclosure, bundling scripts or references, or getting a skill to trigger reliably. To audit or improve existing skills, use skill-audit instead.
---

# Skill authoring

A skill is a reusable reference guide — a technique, pattern, or tool a future agent can find and apply. It is **not** a narrative of how you solved something once. Author it, then verify an agent can actually use it before calling it done.

## Process

1. **Scope it.** What task or domain does it cover? What should trigger it? Does it need executable scripts, or just instructions? Any reference material to bundle?
2. **Draft SKILL.md** — concise, keyword-rich, one strong example.
3. **Test before deploying** (see below) — the step most people skip and shouldn't.
4. **Split out depth** into reference files once the body grows.

## Structure

```
skill-name/
  SKILL.md          # required — overview + core content
  REFERENCE.md      # heavy reference (API/syntax), only if needed
  scripts/          # deterministic utilities, only if needed
```

Keep principles, concepts, and short patterns (under ~50 lines) inline. Move out only **heavy reference** (100+ lines) or **reusable tools** (scripts, templates). Keep references one level deep — SKILL.md points to a file; that file doesn't fan out further.

## The description is everything

The description is the **only** thing an agent sees when deciding whether to load your skill. Get it right or the skill never fires.

- **Triggers first.** Lead with the conditions that should surface it — verbs, symptoms, file types, error strings, tool names a user would actually say. Front-load them; the first ~250 characters do the work.
- **When, not what.** Describe *when to reach for it*, not a summary of its workflow. A workflow summary is a trap: the agent may follow the description and skip the skill body. (A "review between tasks" summary once caused one review where the skill specified two.)
- **Third person, concrete.** "Use when…" beats "Helps with…". Name the problem (race condition, flaky test), not just the abstraction.
- Keep it under ~500 characters.

```
# weak — no triggers, nothing to distinguish it
description: Helps with documents.

# strong — triggers first, concrete, no workflow dump
description: Use when extracting text or tables from PDFs, filling forms, or
merging documents — or when the user mentions PDFs or scanned files.
```

## Keep the body lean

Target **under ~500 words** in SKILL.md. Every skill competes for context; a bloated body is one agents skim past.
- Push flag lists and options to `--help` or a reference file, not the body.
- Cross-reference other skills by **name**, not by repeating their content — and never with `@`-links, which force-load the file and burn context before it's needed.
- One excellent, runnable, well-commented example beats five mediocre ones across languages. You can port later.

## Progressive disclosure

Design for how a skill is actually consumed: description (always in context) → overview (is this relevant?) → body (the how) → reference files and scripts (loaded only when applied). Put searchable terms early; keep deep material behind a link so it costs nothing until needed.

## Test before you deploy

Reading a skill isn't using it. Before considering it done:
- Hand the skill to a fresh agent with a realistic task and watch what it does.
- For **discipline** skills (rules that must hold under pressure): run a scenario that tempts the agent to break the rule and confirm it holds. Note the exact rationalisations it reaches for and add explicit counters.
- For **technique/reference** skills: give a new scenario and confirm the agent finds and applies the right part. Gaps invisible on a reread show up immediately.

Fix what the test exposes, then re-run. Cheap insurance against a skill that looks fine and fails in practice.

## Checklist

- [ ] Description leads with triggers, says *when* not *what*, third person
- [ ] Body under ~500 words; depth pushed to reference files
- [ ] Scripts for anything deterministic and repeated
- [ ] One strong example; no time-sensitive details; consistent terms
- [ ] Verified with a fresh agent on a real task

To analyse or improve skills that already exist, use the **skill-audit** skill.
