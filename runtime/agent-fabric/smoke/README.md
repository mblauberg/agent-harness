# Registered MCP smoke

These opt-in smokes inspect an explicitly provisioned current project session
and coordination run. They never create a project, session, run, authority,
agent or chair. Run them only after operator launch has established the exact
current identity and `agent-fabric mcp provision` has bound its existing agents
to the registered seat generation.

From `runtime/agent-fabric`, build the runtime and export the project key shown
by `agent-fabric status --json`:

```sh
npm run build
export AGENT_FABRIC_PROJECT_KEY='<project-key>'
```

Verify all registered seats, discovery and readable current-run state:

```sh
node smoke/registered-mcp-health.mjs ../..
```

Then prove a Codex-to-Claude and Claude-to-Codex mailbox exchange through two
separate MCP stdio proxies:

```sh
node smoke/registered-mcp-roundtrip.mjs ../..
```

Both commands consume the atomically installed current seat generation. They
fail closed when seats disagree on the run or a credential is stale, revoked,
expired or no longer bound to its recorded principal generation. They do not
invoke a model provider or expose bearer credentials in output.
