import type {
  AgentId,
  ArtifactRef,
  CoordinationRunId,
  Timestamp,
} from "./primitives.js";

export type RunPlanDeclareRequest = Readonly<{
  runId: CoordinationRunId;
  planArtifactRef: ArtifactRef;
  expectedAcceptedScopeRevision: number;
  declaredTaskDenominator?: number;
}>;

export type RunPlanDeclaration = Readonly<{
  runId: CoordinationRunId;
  planArtifactRef: ArtifactRef;
  acceptedScopeRef: ArtifactRef;
  acceptedScopeRevision: number;
  planRevision: number;
  declaredTaskDenominator: number | null;
  declaredByAgentId: AgentId;
  declaredAt: Timestamp;
}>;
