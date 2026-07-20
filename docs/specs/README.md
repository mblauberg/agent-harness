# Specifications

This directory is Provenant requirements doctrine, not a live work tracker or
globally applied cross-project harness policy. Current specifications use
semantic domain/topic paths. Each linked file is an independent normative
owner; directories exist only for discovery. Git owns content integrity and
history. Requirements and acceptance stay with the spec that owns the
behaviour. GitHub issues and their Project Status fields own current delivery
state, owner, dependencies and user gates.

## Agent Fabric

The protocol and operational requirements are owned by the specifications
below. Follow their linked GitHub issues for delivery state.

- [Scope and invariants](agent-fabric/scope-and-invariants.md)
- [Authority](agent-fabric/authority.md)
- [Ownership and topology](agent-fabric/ownership-and-topology.md)
- [Lifecycle and gates](agent-fabric/lifecycle-and-gates.md)
- [Provider actions and adapters](agent-fabric/provider-actions-and-adapters.md)
- [Messaging and public protocol](agent-fabric/messaging-and-public-protocol.md)
- [Evidence and review](agent-fabric/evidence-and-review.md)
- [Effects](agent-fabric/effects.md)
- [Activation and operations](agent-fabric/activation.md)
- [Architecture assurance](agent-fabric/architecture-assurance.md)
- [Daemon and wire](agent-fabric/daemon-and-wire.md)
- [Workspace containment](agent-fabric/workspace-containment.md)
- [Provider-write containment evidence](agent-fabric/provider-write-containment.md)
- [Provider custody](agent-fabric/provider-custody.md)
- [Review custody](agent-fabric/review-custody.md)
- [Persistence and cutover](agent-fabric/persistence.md)
- [Retention, receipts and exports](agent-fabric/retention-and-exports.md)
- [Observability and operations](agent-fabric/observability.md)
- [Recovery and reconciliation](agent-fabric/recovery.md)

## Project Fabric Console

The Console requirements are owned by the specifications below. [Issue
#141](https://github.com/mblauberg/provenant/issues/141) and its Project Status
field own current Console delivery state and user gates.

- [Scope and projections](console/scope-and-projections.md)
- [Sessions and chair](console/sessions-and-chair.md)
- [Intake and continuation](console/intake-and-continuation.md)
- [Artifact review and attention](console/artifact-review.md)
- [Operator interaction](console/operator-interaction.md)
- [Integrations](console/integrations.md)
- [Lifecycle and failure UX](console/lifecycle-and-failure.md)
- [Acceptance and usability](console/acceptance.md)

## Harness

- [Adaptive agent harness lifecycle](harness/lifecycle.md)
- [Progressive-disclosure refactor](harness/disclosure-refactor.md)
