# Handoffs

[GitHub Issues](https://github.com/mblauberg/provenant/issues) owns current work
status. Read the relevant open issue, its linked specification and ADRs, then
inspect live repository and runtime state.

Dated handoffs through 15 July 2026 were consumed during
[W012 reconciliation](https://github.com/mblauberg/provenant/issues/23) and
remain available in Git history. A new handoff is only for live session or run
continuity: it must name its current issue or run and be removed when consumed.

[ADR 0002](../adr/0002-capability-compiled-execution-authority.md) and the
standalone [authority](../specs/agent-fabric/authority.md), [workspace
containment](../specs/agent-fabric/workspace-containment.md) and [provider
actions](../specs/agent-fabric/provider-actions-and-adapters.md) specifications
own the architecture and mechanisms. The [provider-write containment
specification](../specs/agent-fabric/provider-write-containment.md) owns the
fixed 21-case, 42-execution matrix, oracles and evidence gate. [Issue
#22](https://github.com/mblauberg/provenant/issues/22) owns live W010 delivery,
evidence and human gates. The historical implementation pack is
non-authoritative provenance pending retirement under [issue
#23/W013](https://github.com/mblauberg/provenant/issues/23), not an active
dependency.
