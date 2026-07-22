import type { AgentId, RunIdentity, Timestamp } from "@local/agent-fabric-protocol";

export function fixtureRunIdentity(chairAgentId: AgentId, timestamp: Timestamp): RunIdentity {
  return {
    runKind: "coordination",
    chairAgentId,
    acceptedScopeRef: null,
    currentPlanRef: null,
    planRevision: null,
    workstreams: [],
    lastEventAt: timestamp,
  };
}
