@AGENTS.md

# Claude-specific integration

- Use Claude-native subagents and session controls for provider-local work, while
  Agent Fabric remains the cross-provider authority and evidence source.
- Use only the effective permission profile supplied for the task. Do not enable
  bypass permissions or add directories, tools, plugins, hooks or MCP servers
  outside that profile.
- When Claude-native worktree isolation is used, bind it to the canonical
  Fabric task/workspace identity; do not create a second unmanaged worktree
  pool.
- Project-scoped rules live under `.claude/rules/`; keep this file limited to
  Claude-specific mechanics.
- Emit the Fabric run, task, role, model/effort and parent identity in the
  concise native start and completion summaries.
