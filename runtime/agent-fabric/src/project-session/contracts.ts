import type {
  AgentId,
  CoordinationRunId,
  OperatorId,
  IntegrationId,
  ProjectId,
  ProjectSessionId,
  ProtocolErrorCode,
} from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

export type FaultInjector = (label: string) => void;

export type CoreServiceOptions = {
  database: Database.Database;
  clock?: () => number;
  fault?: FaultInjector;
};

export type AuthenticatedOperatorContext = {
  operatorId: OperatorId;
  projectId: ProjectId;
  projectAuthorityGeneration: number;
  principalGeneration: number;
};

export type AuthenticatedAgentContext = {
  agentId: AgentId;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  principalGeneration: number;
};

export type AuthenticatedIntegrationContext = {
  integrationId: IntegrationId;
  projectId: ProjectId;
  principalGeneration: number;
};

export class ProjectFabricCoreError extends Error {
  readonly code: ProtocolErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(code: ProtocolErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "ProjectFabricCoreError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
