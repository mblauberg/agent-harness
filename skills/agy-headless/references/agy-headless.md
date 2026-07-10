# agy (Antigravity / Gemini) headless notes

Use the `agy` CLI for delegated Gemini-family analysis. `agy` is the agent CLI; the separate
`antigravity` binary is just the IDE launcher (no headless agent mode) — don't confuse them.
Treat wrapper runs as best-effort sandboxed scouting unless a host policy explicitly accepts that route.

## Default invocation

The wrapper runs:

```bash
agy -p "$prompt" --sandbox        # plus --model / --add-dir / --print-timeout when given
```

`--sandbox` restricts terminal/tool actions (read-only intent). It is not a certified no-tools/no-write
mode for orchestration verification. agy is **agentic** — without a clear read-only instruction it will
explore the working directory and may run tools, so always say what the corpus is, forbid source writes,
and cap files/time/findings for broad scans.

## Preflight

Before important runs:

```bash
"${AGENTS_HOME:-$HOME/.agents}/skills/agy-headless/scripts/run-agy-headless" --preflight
```

Preflight checks the binary, `agy models`, and a sandboxed 20s `OK` smoke prompt. Failure classes are:
`auth_error`, `capacity_or_rate_limit`, `quota_or_limit`, `timeout`, `unexpected_output`, or
`cli_error`. OAuth cannot be completed from a headless call; run bare `agy` interactively if auth fails.

## Models

- Discover with `agy models` (display names, e.g. several Gemini 3.x Pro/Flash effort levels, plus some
  Claude and GPT-OSS options).
- For decorrelation from a Claude/GPT orchestrator, use the **Gemini** options.
- **Default (no `--model`) = Gemini Flash** — fast, cheap, huge context; good for breadth/orientation.
  Use a **Pro** option for hard reasoning or the very longest contexts.
- **Quirk:** an unrecognised `--model` slug **silently falls back to Flash**. Use wrapper
  `--strict-model` when a specific model matters; otherwise confirm the model that answered.

## Modes

- Default: best-effort source read-only intent — `--sandbox` on, prompt forbids edits.
- Editable: drop sandbox and add `--dangerously-skip-permissions` (wrapper `--editable`) — only when the
  user authorises edits or command execution.
- `--add-dir PATH` to widen file access; `--print-timeout DUR` (default agy 5m). The wrapper applies
  `AGY_REPO_TIMEOUT` (default 15m) when it detects repo-scope prompts or `--include-dir`.
- Large prompt guard: wrapper warns above 32 KiB and refuses above 128 KiB unless
  `--force-large-prompt` is set. Prefer file paths / `--include-dir` over pasted corpora.

## Output

- agy prints **prose** (often with a short work summary). There is **no `--output-format json`** like
  the old gemini CLI — so request a structured markdown contract in the prompt and parse that.
- For multi-agent runs, write full agy output to a namespaced scratch/report file if source writes are
  prohibited. Scratch writes are not the same as source edits.

## Auth

- `agy` uses Google OAuth. If unauthenticated it prints `Authentication required … Please sign in`.
  Re-auth interactively by running bare `agy` and completing the browser flow (the auth code pairs with
  that running process — it cannot be completed from a piped/headless call).

## PATH note

If `agy` is not on `PATH`, the wrapper also checks `~/.local/bin/agy`.
