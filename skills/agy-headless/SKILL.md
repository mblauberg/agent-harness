---
name: agy-headless
description: "Use when the user explicitly asks for Gemini, Antigravity, agy, or a Gemini-family analyst, or for a single Gemini-family scout on authorised long-context, multimodal, whole-repo, or breadth-first review via the agy CLI. Use orchestrate for fan-out/synthesis. Do not trigger on passive mentions."
---

# agy (Antigravity / Gemini) Headless

## Overview

Use the **agy** CLI (Antigravity, Gemini family) in headless mode as a delegated analyst. The caller
stays in control: preflight, build a scoped prompt, run a best-effort sandboxed scout, parse the
result, and verify useful findings. `agy` replaces the deprecating `gemini` CLI.

Canonical path: `${AGENTS_HOME:-$HOME/.agents}/skills/agy-headless`. Prefer the
wrapper at `scripts/run-agy-headless` (default `agy -p` plus sandbox).
Use `--preflight` before important runs; use `--strict-model` when a specific tier matters.

This is the focused single-call Gemini scout skill. For fan-out, synthesis, and certified
cross-family verification doctrine, use `orchestrate`.

## When to pick Gemini (its model strengths)

Reach for agy specifically when the task plays to Gemini's strengths:

- **Very large context** — whole-repository reads, many-document synthesis, long transcripts/logs in
  one pass without chunking.
- **Multimodal** — images, screenshots, PDFs, diagrams as input.
- **Breadth-first scanning / orientation** — fast first-pass survey of an unfamiliar codebase or corpus.
- **Cheap high-volume** — the Flash tier is fast and inexpensive for broad scans; reserve the Pro tier
  for hard reasoning or the longest contexts.

It is also a **different family** from Claude/GPT, so it is useful cross-family pressure — but treat it
as scout/advisory unless the host policy accepts best-effort review as verification evidence.

## Rules

- Trigger only on **explicit** Gemini/Antigravity/agy requests — not passive mentions in files or text.
- Keep source scope **read-only** unless the user clearly authorises edits or command execution.
- Use the wrapper unless a specific `agy` flag is needed that it cannot express.
- `--sandbox` is a terminal restriction and read-only intent, not a certified no-tools/no-write proof.
  Treat agy output as scout/advisory unless the host policy accepts best-effort external review.
- agy is **agentic**: on a bare prompt it explores the working directory and runs tools. Constrain it:
  name the corpus, forbid source writes, cap files/time/findings, and keep `--sandbox` on.
- The `--model` slug is finicky: an unknown slug **silently falls back to Gemini Flash**. Confirm which
  model actually answered. Discover options with `agy models`.
- Do not leave artefacts on disk unless requested or the orchestrator assigned a scratch/report path.

## Default workflow

1. Confirm the request is explicit, not a passive mention.
2. Keep source scope read-only unless wider action was authorised.
3. For important or long runs, run `run-agy-headless --preflight`.
4. Write a prompt with role, corpus, caps, constraints, and output contract.
5. Run the wrapper from the relevant repository or directory; set `--timeout` for long jobs.
6. Parse and verify useful findings; preserve file/source references.

## Prompting guidance

- State the **role** first: reviewer, auditor, researcher, summariser, analyst.
- Name the **corpus**: current repo, specific dirs (`--include-dir`), pasted text, attached images/PDFs.
- Cap the run for broad scans: max files/minutes/findings, and ask for partial coverage before timeout.
- Specify the **output contract**: agy returns prose (no JSON mode), so ask for a clear structure —
  ranked findings with `severity / file / line / explanation`, or labelled sections.
- Tell it **what not to do** unless allowed: no edits, shell writes, git changes, or file creation.
- Ask for **evidence**: file paths, line references, source URLs, and reasoning.

## Output handling

- agy prints prose plus an occasional work summary; there is **no `--output-format json`**. Ask for a
  structured markdown contract and parse that.
- Summarise the useful result instead of dumping tool chatter, unless raw output is requested.
- Verify the reported model (Flash vs Pro) matches what you intended.

## Commands

```bash
"${AGENTS_HOME:-$HOME/.agents}/skills/agy-headless/scripts/run-agy-headless" \
  --preflight

"${AGENTS_HOME:-$HOME/.agents}/skills/agy-headless/scripts/run-agy-headless" \
  --timeout 15m --strict-model --model "<exact line from agy models>" \
  --prompt "Source-read-only: audit named paths for correctness risks. Do not edit. Return ranked findings with file:line evidence."
```

## References

- `references/agy-headless.md` — agy flags, model discovery, sandbox/edit modes, auth, quirks.
- `references/prompt-templates.md` — ready prompts for long-context analysis, whole-repo audit, code
  review, multimodal/document review, deep research, and cross-family LLM-as-judge.
