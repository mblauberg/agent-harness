---
name: agy-headless
description: "Use when the user explicitly asks for Gemini, Antigravity, agy, or a Gemini-family analyst, or for a single Gemini-family scout on authorised long-context, multimodal, whole-repo, or breadth-first review via the agy CLI. Use orchestrate for fan-out/synthesis. Do not trigger on passive mentions."
---

# Agy headless

Use `agy` (Antigravity/Gemini family) as one delegated analyst. The caller
preflights, scopes, runs, parses and verifies; `orchestrate` owns fan-out,
synthesis and certified cross-family review.

Canonical root:
`${AGENTS_HOME:-$HOME/.agents}/skills/agy-headless`. Prefer
`scripts/run-agy-headless`, which defaults to `agy -p` with sandboxing.

## Gates

- Trigger only on an explicit Gemini/Antigravity/agy request, never passive
  text or tool names.
- Keep source read-only unless the human authorised edits/commands. Sandbox is
  a terminal restriction plus read-only intent, **not** certified no-write or
  no-tools evidence; Agy remains advisory unless host policy accepts it.
- Agy is agentic. Name the corpus, forbid source writes, cap files/time/findings
  and keep sandboxing on.
- Discover current options with `agy models`. Unknown model slugs silently fall
  back to Gemini Flash; use `--strict-model` when tier matters and verify the
  answering model.
- Do not leave artifacts unless requested or assigned a namespaced report path.

## Good fits

Use Gemini for very large context, multimodal documents, breadth-first
orientation or economical broad scanning. Flash suits fast breadth; choose a
discovered Pro option for hard reasoning/longest contexts. Different-family
insight can reveal blind spots but is not self-certifying.

## Workflow

1. Confirm explicit request and authority.
2. Run `scripts/run-agy-headless --preflight` for important/long work.
3. Prompt with role, corpus, limits, prohibited actions and output contract.
4. Run from the relevant directory with a timeout; widen access only with
   deliberate `--include-dir`/wrapper options.
5. Ask for ranked markdown findings with paths/lines or source URLs. Agy emits
   prose, not JSON.
6. Verify useful findings and the reported model; return a compact synthesis,
   not tool chatter.

```sh
"${AGENTS_HOME:-$HOME/.agents}/skills/agy-headless/scripts/run-agy-headless" \
  --timeout 15m --strict-model --model "<exact agy models line>" \
  --prompt "Source-read-only: audit named paths. Do not edit. Return ranked file:line findings."
```

See [agy-headless.md](references/agy-headless.md) for flags, auth, limits and
quirks; [prompt-templates.md](references/prompt-templates.md) for scoped prompt
patterns.
