# Consolidated harness CLI

**Status:** reviewed and reduced; proposal only  
**Date:** 18 July 2026  
**Canonical owner:** this document owns the proposal until it is accepted,
rejected or moved to an issue or design record.

## Recommendation

Test a thin `provenant` front door for command discovery. It should expose only
the existing harness entry points and transfer control without changing their
contracts:

```text
provenant help
provenant doctor
provenant route [existing model-route arguments]
provenant worktree [existing worktree arguments]
provenant fabric [existing agent-fabric arguments]
```

`provenant` would own command names and help text. The existing commands would
remain the sole behavioural owners:

| Front-door command | Existing owner |
| --- | --- |
| `doctor` | `scripts/check-harness --doctor` |
| `route` | `scripts/model-route` |
| `worktree` | `scripts/worktree` |
| `fabric` | `scripts/agent-fabric` |

The wrapper must locate these commands through `${AGENTS_HOME:-$HOME/.agents}`
without changing the caller's working directory. `doctor` delegates the fixed
argument vector `scripts/check-harness --doctor`. `route`, `worktree` and
`fabric` pass every argument after the subcommand unchanged. Each delegation
must preserve the caller's environment, standard input and signals, preserve
stdout and stderr byte-for-byte, and return the existing command's exit code.

This gives agents one memorable discovery surface while keeping current scripts
stable for automation and direct use.

## Boundary

The front door must not become another orchestration or provider layer. Defer or
reject the following:

- direct provider execution or normalised provider flags;
- provider fallback, substitution or retry;
- cron, scheduling or a second daemon;
- `run`, `wait`, pane capture or lifecycle state;
- a rewrite of `scripts/check-harness`;
- replacing existing scripts with symlinks or redirecting their callers.

Agent Fabric remains the owner of answer-bearing provider execution, retained
sessions, receipts and communication. `scripts/model-route` remains the owner
of model selection. Herdr and native harnesses retain their existing execution
and observation roles. A thin front door must not reinterpret an error or turn
one provider's failure into another provider's action.

## Clients and providers

A harness can be a **Fabric client** without being a **Fabric provider**. A
client connects to Fabric's MCP surface to coordinate work. A provider is an
execution adapter that Fabric can select for an answer-bearing action. Global
instructions or an installed CLI establish neither role on their own.

Current work is tracked separately:

- [#264](https://github.com/mblauberg/provenant/issues/264) owns
  update-tolerant provider admission by identity and interface contract rather
  than executable version or hash. The proposed front door does not alter that
  policy.
- Kiro is registered as a Fabric MCP client and its ACP provider adapter exists,
  but the provider is not active. [#265](https://github.com/mblauberg/provenant/issues/265)
  owns activation and subscription/free-account conformance.
- OpenCode loads the global harness instructions, but is not yet a Fabric MCP
  seat or provider. [#253](https://github.com/mblauberg/provenant/issues/253)
  owns the optional subscription/free-account provider integration.

`provenant help` may report these distinctions and link to the owning issues. It
must not present installed, configured or proposed integrations as active.

## Lowest-cost experiment

Before adopting the name or expanding the surface, implement one disposable
shell wrapper and focused contract tests. Do not modify the existing commands or
their callers.

Accept the experiment only if it meets all of these measurements:

1. All four delegated commands execute the documented existing owner.
2. Representative success, usage-error and downstream-failure cases preserve
   stdout, stderr and exit status exactly.
3. The same tests pass from the Provenant root, an unrelated Git repository and
   a non-repository temporary directory.
4. Existing direct command tests and calls remain unchanged.
5. `provenant help` identifies the four behavioural owners and distinguishes
   Fabric clients from providers.

Stop after this experiment and assess whether agents actually use the front
door. If discovery does not improve, retain the existing scripts and add no
permanent command.

## Alternatives and trade-offs

**Keep the existing scripts only.** This has no new maintenance cost and keeps
ownership obvious, but agents must already know several command names.

**Add documentation without a command.** A short command index is cheaper than
a wrapper and may solve discovery. It is the preferred fallback if the
experiment shows little use.

**Build a unified execution CLI.** Normalised launching, fallback, scheduling
and waiting look convenient, but duplicate Fabric, routing and Herdr semantics.
They also create a second place for authority, receipts, provider differences
and failure handling. The reviewed proposal rejects this option.

The thin front door is worthwhile only while it remains a discovery layer with
mechanically verifiable passthrough behaviour. Any new behaviour belongs with
the existing owner or requires a separate design decision.
