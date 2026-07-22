import { FABRIC_OPERATIONS } from "../operations.js";
import { parseArtifactContentReadRequest, parseArtifactContentReadResult, parseEvidenceArtifactRegistration, parseEvidencePublishRequest } from "../artifacts.js";
import { boundedString, enumeration, identifier, integer, literal, nullable, objectCodec, parserBacked, relativePath, sha256, timestamp, unionOf } from "../codec.js";
import { artifactRefCodec, credentialCodec, positiveInteger, type OperationCodecFragment, type OperationShapeFragment, object } from "./common.js";

export const ARTIFACTS_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.evidencePublish]: object(
    [
      "commandId",
      "projectSessionId",
      "coordinationRunId",
      "requestedSourceKind",
      "evidenceKind",
      "relativePath",
      "sourceDigest",
    ],
    ["taskId"],
  ),
  [FABRIC_OPERATIONS.operatorArtifactContentRead]: object(
    [
      "credential",
      "projectId",
      "evidenceId",
      "expectedEvidenceRevision",
      "artifactRef",
      "cursor",
      "maximumBytes",
      "maximumLines",
    ],
    ["projectSessionId"],
  ),
} as const satisfies OperationShapeFragment;

export const ARTIFACTS_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.evidencePublish]: object([
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
  ]),
  [FABRIC_OPERATIONS.operatorArtifactContentRead]: object(
    ["available", "artifactRef"],
    [
      "reason",
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
    ],
  ),
} as const satisfies OperationShapeFragment;

export const evidenceKindCodec = enumeration(["artifact", "diff", "test", "review", "receipt"]);

export const publishableEvidenceSourceKindCodec = enumeration(["project-file", "run-file"]);

export const evidencePublishInputCodec = parserBacked(
  objectCodec({
    commandId: identifier,
    projectSessionId: identifier,
    coordinationRunId: identifier,
    requestedSourceKind: publishableEvidenceSourceKindCodec,
    evidenceKind: evidenceKindCodec,
    relativePath,
    sourceDigest: sha256,
  }, { taskId: identifier }),
  parseEvidencePublishRequest,
  parseEvidencePublishRequest({
    commandId: "command_01",
    projectSessionId: "session_01",
    coordinationRunId: "run_01",
    requestedSourceKind: "run-file",
    evidenceKind: "artifact",
    relativePath: "artifacts/item.json",
    sourceDigest: sha256.example,
  }),
);

export const evidenceRegistrationCodec = parserBacked(
  objectCodec({
    evidenceId: identifier,
    evidenceRevision: positiveInteger,
    projectId: identifier,
    projectSessionId: identifier,
    coordinationRunId: identifier,
    taskId: nullable(identifier),
    sourceKind: publishableEvidenceSourceKindCodec,
    evidenceKind: evidenceKindCodec,
    artifactRef: artifactRefCodec,
    publisherKind: literal("agent"),
    publisherRef: identifier,
    createdAt: timestamp,
  }),
  parseEvidenceArtifactRegistration,
  parseEvidenceArtifactRegistration({
    evidenceId: "artifact_01",
    evidenceRevision: 1,
    projectId: "project_01",
    projectSessionId: "session_01",
    coordinationRunId: "run_01",
    taskId: null,
    sourceKind: "run-file",
    evidenceKind: "artifact",
    artifactRef: artifactRefCodec.example,
    publisherKind: "agent",
    publisherRef: "agent_01",
    createdAt: timestamp.example,
  }),
);

export const artifactContentReadInputCodec = parserBacked(
  objectCodec({
    credential: credentialCodec,
    projectId: identifier,
    evidenceId: identifier,
    expectedEvidenceRevision: positiveInteger,
    artifactRef: artifactRefCodec,
    cursor: nullable(boundedString({ maxBytes: 4096, example: "cursor_01" })),
    maximumBytes: integer({ minimum: 4, maximum: 131_072 }),
    maximumLines: integer({ minimum: 1, maximum: 2_000 }),
  }, { projectSessionId: identifier }),
  parseArtifactContentReadRequest,
  parseArtifactContentReadRequest({
    credential: credentialCodec.example,
    projectId: "project_01",
    evidenceId: "artifact_01",
    expectedEvidenceRevision: 1,
    artifactRef: artifactRefCodec.example,
    cursor: null,
    maximumBytes: 131_072,
    maximumLines: 2_000,
  }),
);

export const artifactContentReadResultCodec = parserBacked(
  unionOf([
    objectCodec({
      available: literal(false),
      artifactRef: artifactRefCodec,
      reason: enumeration(["not-found", "forbidden", "unsupported-media", "unsafe-content", "stale", "oversized"]),
    }),
    objectCodec({
      available: literal(true),
      artifactRef: artifactRefCodec,
      mediaType: enumeration(["text/markdown", "application/json", "text/x-diff", "text/plain"]),
      content: boundedString({ minBytes: 0, maxBytes: 131_072, example: "safe content\n" }),
      totalBytes: integer(),
      totalLines: integer(),
      renderedTotalBytes: integer(),
      renderedTotalLines: integer(),
      pageIndex: integer(),
      lineFragment: enumeration(["whole", "start", "middle", "end"]),
      pageContentDigest: sha256,
      renderedArtifactDigest: sha256,
      nextCursor: nullable(boundedString({ maxBytes: 4096, example: "cursor_02" })),
      transformation: enumeration([
        "none",
        "terminal-neutralised",
        "capability-redacted",
        "credential-redacted",
        "combined",
      ]),
      terminalNeutralised: literal(true),
      capabilityValuesRedacted: literal(true),
      credentialValuesRedacted: literal(true),
    }),
  ]),
  parseArtifactContentReadResult,
  parseArtifactContentReadResult({
    available: false,
    artifactRef: artifactRefCodec.example,
    reason: "not-found",
  }),
);

export const artifactsOperationCodecFragment = {
  [FABRIC_OPERATIONS.evidencePublish]: { input: evidencePublishInputCodec, result: evidenceRegistrationCodec },
  [FABRIC_OPERATIONS.operatorArtifactContentRead]: { input: artifactContentReadInputCodec, result: artifactContentReadResultCodec },
} satisfies OperationCodecFragment;
