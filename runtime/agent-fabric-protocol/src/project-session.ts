import {
  parseArtifactRef,
  parseIdentifier,
  parseSha256Digest,
  safeInteger,
  strictRecord,
  type ArtifactRef,
  type CoordinationRunId,
  type OperatorId,
  type ProjectId,
  type ProjectSessionId,
  type Sha256Digest,
} from "./primitives.js";
import type { OperatorMutationContext } from "./operator.js";

export const PROJECT_SESSION_STATES = [
  "draft",
  "awaiting_launch",
  "launching",
  "active",
  "quiescing",
  "awaiting_acceptance",
  "closed",
  "launch_failed",
  "launch_ambiguous",
  "reconciling",
  "visibility_degraded",
  "recovery_required",
  "quarantined",
  "cancelled",
] as const;

export type ProjectSessionState = (typeof PROJECT_SESSION_STATES)[number];
export type ProjectSessionMode = "coordinated" | "independent";

export type ProjectSessionOrigin =
  | { kind: "operator-launch"; operatorId: OperatorId }
  | { kind: "legacy-migration"; migrationManifestRef: ArtifactRef };

export type ProjectSessionTerminalPath =
  | { kind: "accepted"; acceptanceRef: Sha256Digest }
  | { kind: "cancelled"; reason: string }
  | { kind: "failed"; reason: string; failureRef: Sha256Digest };

type ProjectSessionBase = {
  projectSessionId: ProjectSessionId;
  projectId: ProjectId;
  mode: ProjectSessionMode;
  revision: number;
  generation: number;
  authorityRef: Sha256Digest;
  budgetRef: string;
  launchPacketRef: ArtifactRef;
  membershipRevision: number;
  origin: ProjectSessionOrigin;
};

type NonTerminalProjectSessionState = Exclude<ProjectSessionState, "closed" | "cancelled">;

export type ProjectSession =
  | (ProjectSessionBase & { state: NonTerminalProjectSessionState })
  | (ProjectSessionBase & { state: "closed"; terminalPath: ProjectSessionTerminalPath })
  | (ProjectSessionBase & {
      state: "cancelled";
      terminalPath: Extract<ProjectSessionTerminalPath, { kind: "cancelled" }>;
    });

export type CoordinationRun = {
  runId: CoordinationRunId;
  projectSessionId: ProjectSessionId;
  chairAgentId: string;
  chairGeneration: number;
  authorityRef: Sha256Digest;
  budgetRef: string;
  state: string;
  revision: number;
};

export type ProjectSessionCreateRequest = {
  command: OperatorMutationContext;
  projectSessionId: ProjectSessionId;
  projectId: ProjectId;
  mode: ProjectSessionMode;
  generation: 1;
  authorityRef: Sha256Digest;
  budgetRef: string;
  launchPacketRef: ArtifactRef;
};

export type ProjectSessionGetRequest = {
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  expectedGeneration: number;
};

export type ProjectSessionTransitionRequest = {
  command: OperatorMutationContext;
  projectSessionId: ProjectSessionId;
  expectedGeneration: number;
  transition:
    | {
        to: "awaiting_launch";
        reason: string;
        launchPacketRef: ArtifactRef;
      }
    | {
        to: Exclude<
          ProjectSessionState,
          | "closed"
          | "cancelled"
          | "awaiting_acceptance"
          | "awaiting_launch"
          | "launching"
          | "launch_failed"
          | "launch_ambiguous"
        >;
        reason: string;
      }
    | { to: "awaiting_acceptance"; closureEvidence: ArtifactRef };
};

export type ProjectSessionCloseRequest = {
  command: OperatorMutationContext;
  projectSessionId: ProjectSessionId;
  expectedGeneration: number;
  terminalPath: ProjectSessionTerminalPath;
};

export type ProjectSessionDrainRequest = {
  command: OperatorMutationContext;
  projectSessionId: ProjectSessionId;
  expectedGeneration: number;
  consequencePreviewRef: ArtifactRef;
  confirmedPreviewRevision: number;
};

export type ProjectSessionStopRequest = ProjectSessionDrainRequest & {
  drainReceiptRef: ArtifactRef;
};

export type DaemonDrainRequest = {
  command: OperatorMutationContext;
  expectedDaemonGeneration: number;
  expectedGlobalStateRevision: number;
};

export type DaemonStopRequest = DaemonDrainRequest & {
  drainReceiptRef: ArtifactRef;
};

const sessionFields = [
  "projectSessionId",
  "projectId",
  "mode",
  "state",
  "revision",
  "generation",
  "authorityRef",
  "budgetRef",
  "launchPacketRef",
  "membershipRevision",
  "origin",
  "terminalPath",
] as const;

function parseOrigin(value: unknown): ProjectSessionOrigin {
  const kindRecord = strictRecordWithKnownKind(value, "projectSession.origin");
  if (kindRecord.kind === "operator-launch") {
    const record = strictRecord(value, "projectSession.origin", ["kind", "operatorId"]);
    return {
      kind: "operator-launch",
      operatorId: parseIdentifier<"OperatorId">(record.operatorId, "projectSession.origin.operatorId"),
    };
  }
  if (kindRecord.kind === "legacy-migration") {
    const record = strictRecord(value, "projectSession.origin", ["kind", "migrationManifestRef"]);
    return {
      kind: "legacy-migration",
      migrationManifestRef: parseArtifactRef(record.migrationManifestRef, "projectSession.origin.migrationManifestRef"),
    };
  }
  throw new TypeError("projectSession.origin.kind must be operator-launch or legacy-migration");
}

function strictRecordWithKnownKind(value: unknown, path: string): Record<string, unknown> & { kind: unknown } {
  const record = strictRecord(value, path, Object.keys(typeof value === "object" && value !== null ? value : {}));
  if (!("kind" in record)) throw new TypeError(`${path}.kind is required`);
  return Object.assign(record, { kind: record.kind });
}

function parseTerminalPath(value: unknown, state: ProjectSessionState): ProjectSessionTerminalPath {
  if (value === undefined) throw new TypeError(`projectSession.terminalPath is required when state is ${state}`);
  const discriminant = strictRecordWithKnownKind(value, "projectSession.terminalPath");
  if (discriminant.kind === "accepted") {
    const record = strictRecord(value, "projectSession.terminalPath", ["kind", "acceptanceRef"]);
    return {
      kind: "accepted",
      acceptanceRef: parseSha256Digest(record.acceptanceRef, "projectSession.terminalPath.acceptanceRef"),
    };
  }
  if (discriminant.kind === "cancelled") {
    const record = strictRecord(value, "projectSession.terminalPath", ["kind", "reason"]);
    if (typeof record.reason !== "string" || record.reason.length === 0) {
      throw new TypeError("projectSession.terminalPath.reason must be a non-empty string");
    }
    return { kind: "cancelled", reason: record.reason };
  }
  if (discriminant.kind === "failed") {
    const record = strictRecord(value, "projectSession.terminalPath", ["kind", "reason", "failureRef"]);
    if (typeof record.reason !== "string" || record.reason.length === 0) {
      throw new TypeError("projectSession.terminalPath.reason must be a non-empty string");
    }
    return {
      kind: "failed",
      reason: record.reason,
      failureRef: parseSha256Digest(record.failureRef, "projectSession.terminalPath.failureRef"),
    };
  }
  throw new TypeError("projectSession.terminalPath.kind is invalid");
}

function parseSessionState(value: unknown): ProjectSessionState {
  if (typeof value !== "string") throw new TypeError("projectSession.state is invalid");
  const state = PROJECT_SESSION_STATES.find((candidate) => candidate === value);
  if (state === undefined) throw new TypeError("projectSession.state is invalid");
  return state;
}

export function parseProjectSession(value: unknown): ProjectSession {
  const record = strictRecord(value, "projectSession", sessionFields);
  const state = parseSessionState(record.state);
  const base: ProjectSessionBase = {
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, "projectSession.projectSessionId"),
    projectId: parseIdentifier<"ProjectId">(record.projectId, "projectSession.projectId"),
    mode: record.mode === "coordinated" || record.mode === "independent"
      ? record.mode
      : (() => { throw new TypeError("projectSession.mode is invalid"); })(),
    revision: safeInteger(record.revision, "projectSession.revision"),
    generation: safeInteger(record.generation, "projectSession.generation", 1),
    authorityRef: parseSha256Digest(record.authorityRef, "projectSession.authorityRef"),
    budgetRef: typeof record.budgetRef === "string" && record.budgetRef.length > 0
      ? record.budgetRef
      : (() => { throw new TypeError("projectSession.budgetRef must be a non-empty string"); })(),
    launchPacketRef: parseArtifactRef(record.launchPacketRef, "projectSession.launchPacketRef"),
    membershipRevision: safeInteger(record.membershipRevision, "projectSession.membershipRevision"),
    origin: parseOrigin(record.origin),
  };

  if (state === "closed") return { ...base, state, terminalPath: parseTerminalPath(record.terminalPath, state) };
  if (state === "cancelled") {
    const terminalPath = parseTerminalPath(record.terminalPath, state);
    if (terminalPath.kind !== "cancelled") {
      throw new TypeError("projectSession.terminalPath must be cancelled when state is cancelled");
    }
    return { ...base, state, terminalPath };
  }
  if (record.terminalPath !== undefined) {
    throw new TypeError(`projectSession.terminalPath is forbidden when state is ${state}`);
  }
  return { ...base, state };
}
