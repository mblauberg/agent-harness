import type { OperatorCapabilityCredential } from "./operator.js";
import {
  oneOf,
  parseArtifactRef,
  parseBoundedUtf8String,
  parseCanonicalRelativePath,
  parseIdentifier,
  parseSha256Digest,
  parseTimestamp,
  safeInteger,
  strictRecord,
  type AgentId,
  type ArtifactRef,
  type CanonicalRelativePath,
  type CommandId,
  type CoordinationRunId,
  type ProjectId,
  type ProjectSessionId,
  type Sha256Digest,
  type TaskId,
  type Timestamp,
} from "./primitives.js";

export const EVIDENCE_SOURCE_KINDS = ["project-file", "run-file", "git-private-diff"] as const;
export type EvidenceSourceKind = (typeof EVIDENCE_SOURCE_KINDS)[number];

export const PUBLISHABLE_EVIDENCE_SOURCE_KINDS = ["project-file", "run-file"] as const;
export type PublishableEvidenceSourceKind = (typeof PUBLISHABLE_EVIDENCE_SOURCE_KINDS)[number];

export const EVIDENCE_KINDS = ["artifact", "diff", "test", "review", "receipt"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export type EvidencePublishRequest = {
  commandId: CommandId;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  taskId?: TaskId;
  requestedSourceKind: PublishableEvidenceSourceKind;
  evidenceKind: EvidenceKind;
  relativePath: CanonicalRelativePath;
  sourceDigest: Sha256Digest;
};

export type EvidenceArtifactRegistration = {
  evidenceId: string;
  evidenceRevision: number;
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  taskId: TaskId | null;
  sourceKind: PublishableEvidenceSourceKind;
  evidenceKind: EvidenceKind;
  artifactRef: ArtifactRef;
  publisherKind: "agent";
  publisherRef: AgentId;
  createdAt: Timestamp;
};

export type ArtifactContentReadRequest = {
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  projectSessionId?: ProjectSessionId;
  evidenceId: string;
  expectedEvidenceRevision: number;
  artifactRef: ArtifactRef;
  cursor: string | null;
  maximumBytes: number;
  maximumLines: number;
};

export const ARTIFACT_CONTENT_UNAVAILABLE_REASONS = [
  "not-found",
  "forbidden",
  "unsupported-media",
  "unsafe-content",
  "stale",
  "oversized",
] as const;
export type ArtifactContentUnavailableReason = (typeof ARTIFACT_CONTENT_UNAVAILABLE_REASONS)[number];

export const ARTIFACT_MEDIA_TYPES = [
  "text/markdown",
  "application/json",
  "text/x-diff",
  "text/plain",
] as const;
export type ArtifactMediaType = (typeof ARTIFACT_MEDIA_TYPES)[number];

export const ARTIFACT_CONTENT_TRANSFORMATIONS = [
  "none",
  "terminal-neutralised",
  "capability-redacted",
  "credential-redacted",
  "combined",
] as const;
export type ArtifactContentTransformation = (typeof ARTIFACT_CONTENT_TRANSFORMATIONS)[number];

export const ARTIFACT_LINE_FRAGMENTS = ["whole", "start", "middle", "end"] as const;
export type ArtifactLineFragment = (typeof ARTIFACT_LINE_FRAGMENTS)[number];

export type ArtifactContentReadResult =
  | {
      available: false;
      artifactRef: ArtifactRef;
      reason: ArtifactContentUnavailableReason;
    }
  | {
      available: true;
      artifactRef: ArtifactRef;
      mediaType: ArtifactMediaType;
      content: string;
      totalBytes: number;
      totalLines: number;
      renderedTotalBytes: number;
      renderedTotalLines: number;
      pageIndex: number;
      lineFragment: ArtifactLineFragment;
      pageContentDigest: Sha256Digest;
      renderedArtifactDigest: Sha256Digest;
      nextCursor: string | null;
      transformation: ArtifactContentTransformation;
      terminalNeutralised: true;
      capabilityValuesRedacted: true;
      credentialValuesRedacted: true;
    };

function parseCredential(value: unknown, path: string): OperatorCapabilityCredential {
  const record = strictRecord(value, path, ["capabilityId", "token"]);
  return {
    capabilityId: parseIdentifier<"CapabilityId">(record.capabilityId, `${path}.capabilityId`),
    token: parseBoundedUtf8String(record.token, `${path}.token`, 4096),
  };
}

function parseNullableCursor(value: unknown, path: string): string | null {
  return value === null ? null : parseBoundedUtf8String(value, path, 4096);
}

function parseTrue(value: unknown, path: string): true {
  if (value !== true) throw new TypeError(`${path} must equal true`);
  return true;
}

function parseContent(value: unknown, path: string): string {
  if (typeof value !== "string") throw new TypeError(`${path} must be a string`);
  if (Buffer.byteLength(value, "utf8") > 131_072) {
    throw new TypeError(`${path} must be at most 131072 UTF-8 bytes`);
  }
  return value;
}

function boundedInteger(value: unknown, path: string, maximum: number): number {
  const parsed = safeInteger(value, path);
  if (parsed > maximum) throw new TypeError(`${path} must be at most ${String(maximum)}`);
  return parsed;
}

export function parseEvidencePublishRequest(value: unknown, path = "evidencePublish"): EvidencePublishRequest {
  const record = strictRecord(value, path, [
    "commandId",
    "projectSessionId",
    "coordinationRunId",
    "taskId",
    "requestedSourceKind",
    "evidenceKind",
    "relativePath",
    "sourceDigest",
  ]);
  return {
    commandId: parseIdentifier<"CommandId">(record.commandId, `${path}.commandId`),
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, `${path}.projectSessionId`),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(
      record.coordinationRunId,
      `${path}.coordinationRunId`,
    ),
    ...(record.taskId === undefined
      ? {}
      : { taskId: parseIdentifier<"TaskId">(record.taskId, `${path}.taskId`) }),
    requestedSourceKind: oneOf(
      record.requestedSourceKind,
      PUBLISHABLE_EVIDENCE_SOURCE_KINDS,
      `${path}.requestedSourceKind`,
    ),
    evidenceKind: oneOf(record.evidenceKind, EVIDENCE_KINDS, `${path}.evidenceKind`),
    relativePath: parseCanonicalRelativePath(record.relativePath, `${path}.relativePath`),
    sourceDigest: parseSha256Digest(record.sourceDigest, `${path}.sourceDigest`),
  };
}

export function parseEvidenceArtifactRegistration(
  value: unknown,
  path = "evidenceArtifactRegistration",
): EvidenceArtifactRegistration {
  const record = strictRecord(value, path, [
    "evidenceId",
    "evidenceRevision",
    "projectId",
    "projectSessionId",
    "coordinationRunId",
    "taskId",
    "sourceKind",
    "evidenceKind",
    "artifactRef",
    "publisherKind",
    "publisherRef",
    "createdAt",
  ]);
  if (record.publisherKind !== "agent") throw new TypeError(`${path}.publisherKind must equal agent`);
  return {
    evidenceId: parseIdentifier(record.evidenceId, `${path}.evidenceId`),
    evidenceRevision: safeInteger(record.evidenceRevision, `${path}.evidenceRevision`, 1),
    projectId: parseIdentifier<"ProjectId">(record.projectId, `${path}.projectId`),
    projectSessionId: parseIdentifier<"ProjectSessionId">(
      record.projectSessionId,
      `${path}.projectSessionId`,
    ),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(
      record.coordinationRunId,
      `${path}.coordinationRunId`,
    ),
    taskId: record.taskId === null
      ? null
      : parseIdentifier<"TaskId">(record.taskId, `${path}.taskId`),
    sourceKind: oneOf(record.sourceKind, PUBLISHABLE_EVIDENCE_SOURCE_KINDS, `${path}.sourceKind`),
    evidenceKind: oneOf(record.evidenceKind, EVIDENCE_KINDS, `${path}.evidenceKind`),
    artifactRef: parseArtifactRef(record.artifactRef, `${path}.artifactRef`),
    publisherKind: "agent",
    publisherRef: parseIdentifier<"AgentId">(record.publisherRef, `${path}.publisherRef`),
    createdAt: parseTimestamp(record.createdAt, `${path}.createdAt`),
  };
}

export function parseArtifactContentReadRequest(
  value: unknown,
  path = "artifactContentRead",
): ArtifactContentReadRequest {
  const record = strictRecord(value, path, [
    "credential",
    "projectId",
    "projectSessionId",
    "evidenceId",
    "expectedEvidenceRevision",
    "artifactRef",
    "cursor",
    "maximumBytes",
    "maximumLines",
  ]);
  const maximumBytes = safeInteger(record.maximumBytes, `${path}.maximumBytes`, 4);
  if (maximumBytes > 131_072) throw new TypeError(`${path}.maximumBytes must be at most 131072`);
  const maximumLines = safeInteger(record.maximumLines, `${path}.maximumLines`, 1);
  if (maximumLines > 2_000) throw new TypeError(`${path}.maximumLines must be at most 2000`);
  return {
    credential: parseCredential(record.credential, `${path}.credential`),
    projectId: parseIdentifier<"ProjectId">(record.projectId, `${path}.projectId`),
    ...(record.projectSessionId === undefined
      ? {}
      : {
          projectSessionId: parseIdentifier<"ProjectSessionId">(
            record.projectSessionId,
            `${path}.projectSessionId`,
          ),
        }),
    evidenceId: parseIdentifier(record.evidenceId, `${path}.evidenceId`),
    expectedEvidenceRevision: safeInteger(
      record.expectedEvidenceRevision,
      `${path}.expectedEvidenceRevision`,
      1,
    ),
    artifactRef: parseArtifactRef(record.artifactRef, `${path}.artifactRef`),
    cursor: parseNullableCursor(record.cursor, `${path}.cursor`),
    maximumBytes,
    maximumLines,
  };
}

export function parseArtifactContentReadResult(
  value: unknown,
  path = "artifactContentReadResult",
): ArtifactContentReadResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const available = Reflect.get(value, "available");
  if (available === false) {
    const record = strictRecord(value, path, ["available", "artifactRef", "reason"]);
    return {
      available: false,
      artifactRef: parseArtifactRef(record.artifactRef, `${path}.artifactRef`),
      reason: oneOf(record.reason, ARTIFACT_CONTENT_UNAVAILABLE_REASONS, `${path}.reason`),
    };
  }
  if (available !== true) throw new TypeError(`${path}.available must be a boolean`);
  const record = strictRecord(value, path, [
    "available",
    "artifactRef",
    "mediaType",
    "content",
    "totalBytes",
    "totalLines",
    "renderedTotalBytes",
    "renderedTotalLines",
    "pageIndex",
    "lineFragment",
    "pageContentDigest",
    "renderedArtifactDigest",
    "nextCursor",
    "transformation",
    "terminalNeutralised",
    "capabilityValuesRedacted",
    "credentialValuesRedacted",
  ]);
  return {
    available: true,
    artifactRef: parseArtifactRef(record.artifactRef, `${path}.artifactRef`),
    mediaType: oneOf(record.mediaType, ARTIFACT_MEDIA_TYPES, `${path}.mediaType`),
    content: parseContent(record.content, `${path}.content`),
    totalBytes: boundedInteger(record.totalBytes, `${path}.totalBytes`, 1_048_576),
    totalLines: boundedInteger(record.totalLines, `${path}.totalLines`, 1_048_577),
    renderedTotalBytes: boundedInteger(record.renderedTotalBytes, `${path}.renderedTotalBytes`, 2_097_152),
    renderedTotalLines: boundedInteger(record.renderedTotalLines, `${path}.renderedTotalLines`, 2_097_153),
    pageIndex: safeInteger(record.pageIndex, `${path}.pageIndex`),
    lineFragment: oneOf(record.lineFragment, ARTIFACT_LINE_FRAGMENTS, `${path}.lineFragment`),
    pageContentDigest: parseSha256Digest(record.pageContentDigest, `${path}.pageContentDigest`),
    renderedArtifactDigest: parseSha256Digest(
      record.renderedArtifactDigest,
      `${path}.renderedArtifactDigest`,
    ),
    nextCursor: parseNullableCursor(record.nextCursor, `${path}.nextCursor`),
    transformation: oneOf(
      record.transformation,
      ARTIFACT_CONTENT_TRANSFORMATIONS,
      `${path}.transformation`,
    ),
    terminalNeutralised: parseTrue(record.terminalNeutralised, `${path}.terminalNeutralised`),
    capabilityValuesRedacted: parseTrue(
      record.capabilityValuesRedacted,
      `${path}.capabilityValuesRedacted`,
    ),
    credentialValuesRedacted: parseTrue(
      record.credentialValuesRedacted,
      `${path}.credentialValuesRedacted`,
    ),
  };
}
