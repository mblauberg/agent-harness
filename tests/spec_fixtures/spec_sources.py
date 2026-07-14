"""Explicit test-only source sets for normative SQLite/text oracles."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

AGENT_FABRIC_BEHAVIOUR = (
    "agent-fabric/scope-and-invariants.md",
    "agent-fabric/authority.md",
    "agent-fabric/ownership-and-topology.md",
    "agent-fabric/lifecycle-and-gates.md",
    "agent-fabric/provider-actions-and-adapters.md",
    "agent-fabric/messaging-and-public-protocol.md",
    "agent-fabric/evidence-and-review.md",
    "agent-fabric/effects.md",
)

AGENT_FABRIC_HARDENING = (
    "agent-fabric/architecture-assurance.md",
    "agent-fabric/daemon-and-wire.md",
    "agent-fabric/workspace-containment.md",
    "agent-fabric/provider-custody.md",
    "agent-fabric/review-custody.md",
    "agent-fabric/persistence.md",
    "agent-fabric/retention-and-exports.md",
    "agent-fabric/observability.md",
    "agent-fabric/recovery.md",
)


def read_spec(relative: str) -> str:
    return (ROOT / "docs" / "specs" / relative).read_text(encoding="utf-8")


def read_specs(relatives: tuple[str, ...]) -> str:
    return "\n\n".join(read_spec(relative).rstrip("\n") for relative in relatives) + "\n"
