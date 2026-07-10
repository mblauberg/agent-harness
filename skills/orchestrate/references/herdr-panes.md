# Herdr pane operating contract

Herdr is the control plane for substantial interactive, long-running and
cross-family work. It does not replace native subagents or decide model routing.

## Use a pane when

- the worker may run longer than about two minutes;
- the human benefits from watching or steering it;
- it may block for input;
- it is the other primary family or a bonus-family review leg worth observing;
- the task must survive the lead's context churn.

Keep short mechanical/native fan-out inline. For substantial eligible work done
without Herdr, record `HERDR-NOT-USED: <reason>`.

## Preflight

```sh
herdr status server
herdr integration status
herdr agent list
```

Require a compatible running server and a current integration for the selected
agent. An installed CLI without an integration can still run, but its state is
`unknown`; do not treat that as reliable completion telemetry. Pi remains
dormant until its provider/model route is approved and `herdr integration
install pi` has been evaluated.

## Start and name

Discover the current CLI/model options first. Start one role per pane:

```sh
herdr agent start review-other-primary --cwd "$PWD" --split right --no-focus -- <agent command>
```

Use role names such as `review-claude`, `review-codex`, `scout-gemini` or
`implement-api`. Paired-primary runs use `pair-claude` and `pair-codex`; both
panes remain owned by the session chair when stage ownership rotates. Record
the pane/terminal ID and actual adapter, provider family
and resolved model in the run receipt.

## Send work

Use the bundled helper; it resolves the pane, sends literal text and presses
Enter exactly once. Its result is `dispatched-unconfirmed`, not proof that the
target process consumed the prompt:

```sh
printf '%s' '<bounded prompt>' | \
  "${AGENTS_HOME:-$HOME/.agents}/skills/orchestrate/scripts/herdr_prompt.sh" <name>
```

Raw `herdr agent send` does not imply Enter. The helper never waits for the
worker; collection remains a separate lead decision.

The Herdr key token is lowercase `enter`; uppercase `ENTER` can be accepted by
the CLI without submitting in the target terminal. Keep this behaviour locked
by `tests/test_herdr_prompt.py`.

Observed raw-send failure modes (2026-07-10, one session lost ~20 min to these —
use the helper instead):

- `herdr agent send <pane> '\r'` sends the two literal characters `\r`, never
  a submit; the draft sits in the composer looking sent.
- Targeting by session UUID fails with `agent_not_found` — target the pane id
  (`w3:p2`), not the session id.
- The pane buffer scrolls: output longer than the buffer is unrecoverable via
  `read` — ask the worker to re-emit only the missing span, or have it write
  findings to a file from the start.
- Long prompts land as "[Pasted Content N chars]" and the helper's Enter can
  fire before the paste settles, leaving the draft unsubmitted. After any
  helper send, `read` the pane; if the draft is still in the composer, submit
  with a REAL carriage return: `herdr agent send <pane> "$(printf '\r')"`.

Prompts state source scope, artifact directory, allowed artifact classes, source
write authority, output contract, evidence requirements and whether subagents
are permitted. For long-running work, prefer artifact-only writes plus a
compressed return over full output in the lead context. Do not paste secrets or
uncleared project data into an external provider pane.

For paired-primary work, send a bounded notification plus an assignment or
artifact path/hash. The durable envelope records task/stage, chair, owner,
peer, base revision, write scopes, prohibited actions, expected output,
objective checks and human gates. The peer acknowledges through its namespaced
artifact; pane scrollback is never the authoritative negotiation.

## Observe without poll loops

- Continue useful local work after dispatch.
- Check once near expected completion with `herdr agent get <name>` or
  `herdr agent list`.
- If the main thread truly has nothing else to do, use one bounded
  `herdr agent wait <name> --status idle --timeout <ms>`.
- Read only the bounded tail: `herdr agent read <name> --source
  recent-unwrapped --lines <n>`.

Do not repeatedly wait in 20–30 second loops. State telemetry is advisory and
can be stale. If status conflicts with a live session, inspect
`herdr pane process-info`, `herdr agent explain`, and a bounded pane tail before
declaring failure.

## Finish

Capture the worker's concise result and artifact paths, adjudicate them in the
lead context, preserve a bounded status/failure receipt, then close or reuse the
pane deliberately. Do not retain a full pane transcript when the named artifact
and receipt are sufficient. Clean pane-local temporary payload only when the
run owns it; lifecycle and retention follow `session`'s context-hygiene
contract. A pane being idle does not prove its work is correct; objective checks
and review still gate the result.
