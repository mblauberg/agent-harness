# Paired MCP session smoke

This opt-in smoke starts one isolated temporary daemon and proves a real
Codex/Fable round trip through two separately invoked MCP stdio proxies. It
does not register MCP globally, invoke a model provider, use provider login, or
leave the daemon running after the bounded session.

From `runtime/agent-fabric`, first build the already-implemented runtime:

```sh
npm run build
```

In a coordinator terminal, choose a run-owned evidence directory:

```sh
node smoke/paired-mcp.mjs coordinate \
  --session ../../../.agent-run/AFAB-001/live-smoke/paired-session \
  --timeout-ms 180000
```

While it waits, invoke Codex and Fable independently (one command in each
visible pane):

```sh
node smoke/paired-mcp.mjs participant \
  --session ../../../.agent-run/AFAB-001/live-smoke/paired-session \
  --role codex \
  --message "Codex asks Fable to confirm this live MCP exchange."
```

```sh
node smoke/paired-mcp.mjs participant \
  --session ../../../.agent-run/AFAB-001/live-smoke/paired-session \
  --role fable \
  --message "Fable asks Codex to confirm this live MCP exchange."
```

Each participant prints short, human-readable `sender → recipient` and
`recipient ← sender` lines with message IDs and text. Tokens are read only
from a mode-0600 rendezvous file and are never included in output or retained
evidence. The coordinator cross-checks the two identities, message IDs, reply
links, sender IDs and four acknowledgements, writes `summary.json`, removes the
rendezvous, stops the daemon and deletes its private temporary state.

The local automated proof uses the same coordinator, participant and MCP proxy
paths:

```sh
node --test smoke/paired-mcp.self-test.mjs
```
