import type { LegacyAuthorityInput, LegacyDisclosurePolicy } from "./baseline-contracts.js";
import {
  arrayOf,
  defineCodec,
  enumeration,
  integer,
  jsonValue,
  literal,
  nullable,
  objectCodec,
  parserBacked,
  recordOf,
  relativePath,
  sha256,
  timestamp,
  unionOf,
  type Codec,
} from "./codec.js";
import { isActiveFabricOperation, OPERATION_REGISTRY, type FabricOperation } from "./operations.js";
import {
  parseArtifactRef,
  parseCanonicalRelativePath,
  parseIdentifier,
  parseJsonValue,
  parseSha256Digest,
  parseTimestamp,
  safeInteger,
  strictRecord,
  type AgentId,
  type ArtifactRef,
  type CanonicalRelativePath,
  type CoordinationRunId,
  type JsonValue,
  type ProjectId,
  type ProjectSessionId,
  type ProviderActionId,
  type ProviderSessionRef,
  type ResourceScopeId,
  type Sha256Digest,
  type Timestamp,
} from "./primitives.js";
import { isResourceUnitKey, type ResourceAmounts } from "./resources.js";
import type { ProjectSessionLaunchIntent } from "./operator-actions.js";

export type LaunchPacketV1 = {
  schemaVersion: 1;
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  runId: CoordinationRunId;
  chairAgentId: AgentId;
  projectRunDirectory: CanonicalRelativePath;
  topologyMode: "coordinated" | "independent";
  budgetRef: string;
  resourcePlanRef: ArtifactRef;
  chairAuthority: LegacyAuthorityInput;
  provider: {
    adapterId: string;
    actionId: ProviderActionId;
    contractDigest: Sha256Digest;
    inputSchemaId: string;
    input: Readonly<Record<string, JsonValue>>;
  };
};

export type LaunchResourceScopePlan = {
  scopeId: ResourceScopeId;
  limits: ResourceAmounts;
};

export type LaunchResourcePlanV1 = {
  schemaVersion: 1;
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  runId: CoordinationRunId;
  budgetRef: string;
  scopes: {
    project: LaunchResourceScopePlan;
    projectSession: LaunchResourceScopePlan;
    coordinationRun: LaunchResourceScopePlan;
  };
  launchReservation: { amounts: ResourceAmounts };
};

export type LaunchProviderActionIdentity = {
  providerAdapterId: string;
  providerActionId: ProviderActionId;
};

type ProjectSessionLaunchCurrentStateBase = {
  schemaVersion: 1;
  projectId: ProjectId;
  projectRevision: number;
  projectSessionId: ProjectSessionId;
  sessionRevision: number;
  sessionGeneration: number;
  currentLaunchPacketRef: ArtifactRef;
  trustRecordDigest: Sha256Digest;
  providerAdapterId: string;
  providerContractDigest: Sha256Digest;
  resourceStateDigest: Sha256Digest;
};

export type ProjectSessionLaunchCurrentState =
  | (ProjectSessionLaunchCurrentStateBase & {
      sessionState: "awaiting_launch";
      provedFailedAttempt: null;
    })
  | (ProjectSessionLaunchCurrentStateBase & {
      sessionState: "launch_failed";
      provedFailedAttempt: LaunchProviderActionIdentity;
    });

export type LaunchResourceUsage = Readonly<Record<string, number | "unknown">>;

type LaunchAdapterOutcomeCommon = {
  schemaVersion: 1;
  providerAdapterId: string;
  providerActionId: ProviderActionId;
  providerContractDigest: Sha256Digest;
  observationKind: "dispatch-return" | "lookup";
  observedAt: Timestamp;
};

export type LaunchAdapterOutcomeV1 = LaunchAdapterOutcomeCommon & {
  outcome:
    | {
        kind: "terminal-success";
        providerSessionRef: ProviderSessionRef;
        providerSessionGeneration: number;
        effectDigest: Sha256Digest;
        resourceUsage: LaunchResourceUsage;
      }
    | {
        kind: "terminal-no-effect";
        failureCode: string;
        noEffectProof: {
          schemaId: string;
          proof: JsonValue;
          digest: Sha256Digest;
        };
      }
    | {
        kind: "ambiguous";
        reasonCode:
          | "absent"
          | "transport-error"
          | "adapter-error"
          | "malformed"
          | "incomplete"
          | "conflict"
          | "missing-resume-reference";
        evidenceDigest: Sha256Digest | null;
      };
};

type ProviderActionRefV1Common = {
  schemaVersion: 1;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  providerAdapterId: string;
  providerActionId: ProviderActionId;
  providerContractDigest: Sha256Digest;
  custodyAttemptGeneration: number;
  journalRevision: number;
};

export type ProviderActionRefV1 =
  | (ProviderActionRefV1Common & {
      journalState: "prepared" | "dispatched" | "accepted";
      outcomeKind: null;
      outcomeDigest: null;
    })
  | (ProviderActionRefV1Common & {
      journalState: "terminal";
      outcomeKind: "terminal-success" | "terminal-no-effect";
      outcomeDigest: Sha256Digest;
    })
  | (ProviderActionRefV1Common & {
      journalState: "ambiguous";
      outcomeKind: "ambiguous";
      outcomeDigest: Sha256Digest;
    });

const RESOURCE_UNIT_PATTERN = "^(?:provider_calls|concurrent_turns|descendants|message_bytes|artifact_bytes|wall_clock_milliseconds|cost:[A-Z]{3}|(?:input_tokens|output_tokens):[a-z0-9][a-z0-9._-]{0,63})$";
const activeAgentOperations = Object.values(OPERATION_REGISTRY)
  .filter((entry) => entry.kind !== "retired" && entry.principals.includes("agent"))
  .map((entry) => entry.operation);
const firstAgentOperation = activeAgentOperations[0];
if (firstAgentOperation === undefined) throw new Error("launch authority requires at least one active agent operation");

const agentAuthorityOperationCodec = defineCodec<string>({
  type: "string",
  enum: activeAgentOperations,
}, firstAgentOperation, (value, path) => parseAgentOperation(value, path));
const disclosureCodec = objectCodec({ level: literal("allowed") });
const scopedDisclosureCodec = objectCodec({
  level: literal("scoped"),
  scopes: arrayOf(defineCodec({
    type: "string",
    enum: ["local", "approved-provider", "external"],
  }, "local", parseDisclosureTarget), { minimum: 1, maximum: 3, unique: true }),
});
const forbiddenDisclosureCodec = objectCodec({ level: literal("forbidden") });
const disclosureTargetsCodec = arrayOf(defineCodec({
  type: "string",
  enum: ["local", "approved-provider", "external"],
}, "local", parseDisclosureTarget), { maximum: 3, unique: true });
const resourceAmountsCodec = recordOf(integer(), {
  maximum: 128,
  keyPattern: RESOURCE_UNIT_PATTERN,
  exampleKey: "concurrent_turns",
});
const nonEmptyResourceAmountsCodec = recordOf(integer(), {
  minimum: 1,
  maximum: 128,
  keyPattern: RESOURCE_UNIT_PATTERN,
  exampleKey: "concurrent_turns",
});
const chairAuthorityCodec = objectCodec({
  workspaceRoots: arrayOf(relativePath, { minimum: 1, maximum: 64, unique: true }),
  sourcePaths: arrayOf(relativePath, { maximum: 256, unique: true }),
  artifactPaths: arrayOf(relativePath, { maximum: 256, unique: true }),
  actions: arrayOf(agentAuthorityOperationCodec, { maximum: 256, unique: true }),
  disclosure: defineCodec({
    oneOf: [
      disclosureCodec.schema,
      scopedDisclosureCodec.schema,
      forbiddenDisclosureCodec.schema,
      disclosureTargetsCodec.schema,
    ],
  }, { level: "forbidden" }, parseDisclosure),
  expiresAt: timestamp,
  budget: resourceAmountsCodec,
}, {
  deniedPaths: arrayOf(relativePath, { maximum: 256, unique: true }),
  deniedActions: arrayOf(agentAuthorityOperationCodec, { maximum: 256, unique: true }),
});
const artifactRefCodec = objectCodec({ path: relativePath, digest: sha256 });
const launchPacketBaseCodec = objectCodec({
  schemaVersion: literal(1),
  projectId: defineIdentifierCodec("project_01"),
  projectSessionId: defineIdentifierCodec("ps_01"),
  runId: defineIdentifierCodec("run_01"),
  chairAgentId: defineIdentifierCodec("agent_chair_01"),
  projectRunDirectory: relativePath,
  topologyMode: defineCodec({ type: "string", enum: ["coordinated", "independent"] }, "coordinated", parseTopologyMode),
  budgetRef: defineIdentifierCodec("budget_01"),
  resourcePlanRef: artifactRefCodec,
  chairAuthority: chairAuthorityCodec,
  provider: objectCodec({
    adapterId: defineIdentifierCodec("claude-agent-sdk"),
    actionId: defineIdentifierCodec("provider_action_01"),
    contractDigest: sha256,
    inputSchemaId: defineIdentifierCodec("provider-launch.v1"),
    input: recordOf(jsonValue, { maximum: 256 }),
  }),
});
const launchResourceScopePlanCodec = objectCodec({
  scopeId: defineIdentifierCodec("scope_01"),
  limits: nonEmptyResourceAmountsCodec,
});
const launchResourcePlanBaseCodec = objectCodec({
  schemaVersion: literal(1),
  projectId: defineIdentifierCodec("project_01"),
  projectSessionId: defineIdentifierCodec("ps_01"),
  runId: defineIdentifierCodec("run_01"),
  budgetRef: defineIdentifierCodec("budget_01"),
  scopes: objectCodec({
    project: launchResourceScopePlanCodec,
    projectSession: launchResourceScopePlanCodec,
    coordinationRun: launchResourceScopePlanCodec,
  }),
  launchReservation: objectCodec({ amounts: nonEmptyResourceAmountsCodec }),
});
const launchProviderActionIdentityCodec = objectCodec({
  providerAdapterId: defineIdentifierCodec("claude-agent-sdk"),
  providerActionId: defineIdentifierCodec("provider_action_01"),
});
const projectSessionLaunchIntentBaseCodec = objectCodec({
  kind: literal("project-session-launch"),
  projectId: defineIdentifierCodec("project_01"),
  projectSessionId: defineIdentifierCodec("ps_01"),
  expectedProjectRevision: integer({ minimum: 1 }),
  expectedSessionRevision: integer({ minimum: 1 }),
  expectedSessionGeneration: integer({ minimum: 1 }),
  trustRecordDigest: sha256,
  launchPacketRef: artifactRefCodec,
  authorityRef: sha256,
  budgetRef: defineIdentifierCodec("budget_01"),
  resourcePlanRef: artifactRefCodec,
  providerAdapterId: defineIdentifierCodec("claude-agent-sdk"),
  providerActionId: defineIdentifierCodec("provider_action_01"),
  providerContractDigest: sha256,
  resourceStateDigest: sha256,
}, { retryOf: launchProviderActionIdentityCodec });
const launchCurrentStateCommonCodecs = {
  schemaVersion: literal(1),
  projectId: defineIdentifierCodec("project_01"),
  projectRevision: integer({ minimum: 1 }),
  projectSessionId: defineIdentifierCodec("ps_01"),
  sessionRevision: integer({ minimum: 1 }),
  sessionGeneration: integer({ minimum: 1 }),
  currentLaunchPacketRef: artifactRefCodec,
  trustRecordDigest: sha256,
  providerAdapterId: defineIdentifierCodec("claude-agent-sdk"),
  providerContractDigest: sha256,
  resourceStateDigest: sha256,
};
const projectSessionLaunchCurrentStateExample = parseProjectSessionLaunchCurrentState({
  schemaVersion: 1,
  projectId: "project_01",
  projectRevision: 1,
  projectSessionId: "ps_01",
  sessionRevision: 1,
  sessionGeneration: 1,
  sessionState: "awaiting_launch",
  currentLaunchPacketRef: { path: "launch/packet.json", digest: sha256.example },
  trustRecordDigest: sha256.example,
  providerAdapterId: "claude-agent-sdk",
  providerContractDigest: sha256.example,
  resourceStateDigest: sha256.example,
  provedFailedAttempt: null,
});
const projectSessionLaunchCurrentStateBaseCodec = defineCodec({
  oneOf: [
    objectCodec({
      ...launchCurrentStateCommonCodecs,
      sessionState: literal("awaiting_launch"),
      provedFailedAttempt: literal(null),
    }).schema,
    objectCodec({
      ...launchCurrentStateCommonCodecs,
      sessionState: literal("launch_failed"),
      provedFailedAttempt: launchProviderActionIdentityCodec,
    }).schema,
  ],
}, projectSessionLaunchCurrentStateExample, (value, path) => parseProjectSessionLaunchCurrentState(value, path));
const resourceUsageCodec = recordOf(unionOf([integer(), literal("unknown")]), {
  minimum: 1,
  maximum: 128,
  keyPattern: RESOURCE_UNIT_PATTERN,
  exampleKey: "concurrent_turns",
});
const launchOutcomeCommonCodecs = {
  schemaVersion: literal(1),
  providerAdapterId: defineIdentifierCodec("claude-agent-sdk"),
  providerActionId: defineIdentifierCodec("provider_action_01"),
  providerContractDigest: sha256,
  observationKind: enumeration(["dispatch-return", "lookup"]),
  observedAt: timestamp,
};
const terminalSuccessCodec = objectCodec({
  kind: literal("terminal-success"),
  providerSessionRef: defineIdentifierCodec("provider_session_01"),
  providerSessionGeneration: integer({ minimum: 1 }),
  effectDigest: sha256,
  resourceUsage: resourceUsageCodec,
});
const terminalNoEffectCodec = objectCodec({
  kind: literal("terminal-no-effect"),
  failureCode: defineIdentifierCodec("provider-rejected"),
  noEffectProof: objectCodec({
    schemaId: defineIdentifierCodec("provider-no-effect.v1"),
    proof: jsonValue,
    digest: sha256,
  }),
});
const ambiguousOutcomeCodec = objectCodec({
  kind: literal("ambiguous"),
  reasonCode: enumeration([
    "absent",
    "transport-error",
    "adapter-error",
    "malformed",
    "incomplete",
    "conflict",
    "missing-resume-reference",
  ]),
  evidenceDigest: nullable(sha256),
});
const launchAdapterOutcomeBaseCodec = objectCodec({
  ...launchOutcomeCommonCodecs,
  outcome: unionOf([terminalSuccessCodec, terminalNoEffectCodec, ambiguousOutcomeCodec]),
});
const providerActionRefCommonCodecs = {
  schemaVersion: literal(1),
  projectSessionId: defineIdentifierCodec("ps_01"),
  coordinationRunId: defineIdentifierCodec("run_01"),
  providerAdapterId: defineIdentifierCodec("claude-agent-sdk"),
  providerActionId: defineIdentifierCodec("provider_action_01"),
  providerContractDigest: sha256,
  custodyAttemptGeneration: integer({ minimum: 1 }),
  journalRevision: integer({ minimum: 1 }),
};
const providerActionRefBaseCodec = unionOf([
  objectCodec({
    ...providerActionRefCommonCodecs,
    journalState: enumeration(["prepared", "dispatched", "accepted"]),
    outcomeKind: literal(null),
    outcomeDigest: literal(null),
  }),
  objectCodec({
    ...providerActionRefCommonCodecs,
    journalState: literal("terminal"),
    outcomeKind: enumeration(["terminal-success", "terminal-no-effect"]),
    outcomeDigest: sha256,
  }),
  objectCodec({
    ...providerActionRefCommonCodecs,
    journalState: literal("ambiguous"),
    outcomeKind: literal("ambiguous"),
    outcomeDigest: sha256,
  }),
]);

export const LAUNCH_PACKET_V1_CODEC: Codec<LaunchPacketV1> = parserBacked(
  launchPacketBaseCodec,
  (value, path) => parseLaunchPacketV1(value, path),
  parseLaunchPacketV1(launchPacketBaseCodec.example),
);

export const LAUNCH_RESOURCE_PLAN_V1_CODEC: Codec<LaunchResourcePlanV1> = parserBacked(
  launchResourcePlanBaseCodec,
  (value, path) => parseLaunchResourcePlanV1(value, path),
  parseLaunchResourcePlanV1(launchResourcePlanBaseCodec.example),
);

export const PROJECT_SESSION_LAUNCH_CURRENT_STATE_CODEC: Codec<ProjectSessionLaunchCurrentState> = parserBacked(
  projectSessionLaunchCurrentStateBaseCodec,
  (value, path) => parseProjectSessionLaunchCurrentState(value, path),
  parseProjectSessionLaunchCurrentState(projectSessionLaunchCurrentStateBaseCodec.example),
);

export const PROJECT_SESSION_LAUNCH_INTENT_CODEC: Codec<ProjectSessionLaunchIntent> = parserBacked(
  projectSessionLaunchIntentBaseCodec,
  (value, path) => parseProjectSessionLaunchIntent(value, path),
  parseProjectSessionLaunchIntent(projectSessionLaunchIntentBaseCodec.example),
);

export const LAUNCH_ADAPTER_OUTCOME_V1_CODEC: Codec<LaunchAdapterOutcomeV1> = parserBacked(
  launchAdapterOutcomeBaseCodec,
  (value, path) => parseLaunchAdapterOutcomeV1(value, path),
  parseLaunchAdapterOutcomeV1(launchAdapterOutcomeBaseCodec.example),
);

export const PROVIDER_ACTION_REF_V1_CODEC: Codec<ProviderActionRefV1> = parserBacked(
  providerActionRefBaseCodec,
  (value, path) => parseProviderActionRefV1(value, path),
  parseProviderActionRefV1(providerActionRefBaseCodec.example),
);

export function parseLaunchPacketV1(value: unknown, path = "launchPacketV1"): LaunchPacketV1 {
  const record = strictRecord(value, path, [
    "schemaVersion",
    "projectId",
    "projectSessionId",
    "runId",
    "chairAgentId",
    "projectRunDirectory",
    "topologyMode",
    "budgetRef",
    "resourcePlanRef",
    "chairAuthority",
    "provider",
  ]);
  if (safeInteger(record.schemaVersion, `${path}.schemaVersion`, 1) !== 1) {
    throw new TypeError(`${path}.schemaVersion must equal 1`);
  }
  const provider = strictRecord(record.provider, `${path}.provider`, [
    "adapterId",
    "actionId",
    "contractDigest",
    "inputSchemaId",
    "input",
  ]);
  return {
    schemaVersion: 1,
    projectId: parseIdentifier<"ProjectId">(record.projectId, `${path}.projectId`),
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, `${path}.projectSessionId`),
    runId: parseIdentifier<"CoordinationRunId">(record.runId, `${path}.runId`),
    chairAgentId: parseIdentifier<"AgentId">(record.chairAgentId, `${path}.chairAgentId`),
    projectRunDirectory: parseCanonicalRelativePath(record.projectRunDirectory, `${path}.projectRunDirectory`),
    topologyMode: parseTopologyMode(record.topologyMode, `${path}.topologyMode`),
    budgetRef: parseIdentifier<"BudgetRef">(record.budgetRef, `${path}.budgetRef`),
    resourcePlanRef: parseArtifactRef(record.resourcePlanRef, `${path}.resourcePlanRef`),
    chairAuthority: parseChairAuthority(record.chairAuthority, `${path}.chairAuthority`),
    provider: {
      adapterId: parseIdentifier<"AdapterId">(provider.adapterId, `${path}.provider.adapterId`),
      actionId: parseIdentifier<"ProviderActionId">(provider.actionId, `${path}.provider.actionId`),
      contractDigest: parseSha256Digest(provider.contractDigest, `${path}.provider.contractDigest`),
      inputSchemaId: parseIdentifier<"InputSchemaId">(provider.inputSchemaId, `${path}.provider.inputSchemaId`),
      input: parseJsonObject(provider.input, `${path}.provider.input`),
    },
  };
}

export function parseLaunchResourcePlanV1(
  value: unknown,
  path = "launchResourcePlanV1",
): LaunchResourcePlanV1 {
  const record = strictRecord(value, path, [
    "schemaVersion",
    "projectId",
    "projectSessionId",
    "runId",
    "budgetRef",
    "scopes",
    "launchReservation",
  ]);
  if (safeInteger(record.schemaVersion, `${path}.schemaVersion`, 1) !== 1) {
    throw new TypeError(`${path}.schemaVersion must equal 1`);
  }
  const scopes = strictRecord(record.scopes, `${path}.scopes`, ["project", "projectSession", "coordinationRun"]);
  const launchReservation = strictRecord(record.launchReservation, `${path}.launchReservation`, ["amounts"]);
  return {
    schemaVersion: 1,
    projectId: parseIdentifier<"ProjectId">(record.projectId, `${path}.projectId`),
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, `${path}.projectSessionId`),
    runId: parseIdentifier<"CoordinationRunId">(record.runId, `${path}.runId`),
    budgetRef: parseIdentifier<"BudgetRef">(record.budgetRef, `${path}.budgetRef`),
    scopes: {
      project: parseLaunchResourceScopePlan(scopes.project, `${path}.scopes.project`),
      projectSession: parseLaunchResourceScopePlan(scopes.projectSession, `${path}.scopes.projectSession`),
      coordinationRun: parseLaunchResourceScopePlan(scopes.coordinationRun, `${path}.scopes.coordinationRun`),
    },
    launchReservation: {
      amounts: parseLaunchResourceAmounts(launchReservation.amounts, `${path}.launchReservation.amounts`),
    },
  };
}

function parseLaunchResourceScopePlan(value: unknown, path: string): LaunchResourceScopePlan {
  const record = strictRecord(value, path, ["scopeId", "limits"]);
  return {
    scopeId: parseIdentifier<"ResourceScopeId">(record.scopeId, `${path}.scopeId`),
    limits: parseLaunchResourceAmounts(record.limits, `${path}.limits`),
  };
}

function parseLaunchResourceAmounts(value: unknown, path: string): ResourceAmounts {
  const fields = typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
  const record = strictRecord(value, path, fields);
  if (fields.length === 0 || fields.length > 128) throw new TypeError(`${path} must contain 1-128 dimensions`);
  const amounts: Record<string, number> = {};
  for (const [unit, amount] of Object.entries(record)) {
    if (!isResourceUnitKey(unit)) throw new TypeError(`${path}.${unit} is not a qualified resource unit`);
    amounts[unit] = safeInteger(amount, `${path}.${unit}`);
  }
  return amounts;
}

export function parseProjectSessionLaunchCurrentState(
  value: unknown,
  path = "projectSessionLaunchCurrentState",
): ProjectSessionLaunchCurrentState {
  const record = strictRecord(value, path, [
    "schemaVersion",
    "projectId",
    "projectRevision",
    "projectSessionId",
    "sessionRevision",
    "sessionGeneration",
    "sessionState",
    "currentLaunchPacketRef",
    "trustRecordDigest",
    "providerAdapterId",
    "providerContractDigest",
    "resourceStateDigest",
    "provedFailedAttempt",
  ]);
  if (safeInteger(record.schemaVersion, `${path}.schemaVersion`, 1) !== 1) {
    throw new TypeError(`${path}.schemaVersion must equal 1`);
  }
  const common: ProjectSessionLaunchCurrentStateBase = {
    schemaVersion: 1,
    projectId: parseIdentifier<"ProjectId">(record.projectId, `${path}.projectId`),
    projectRevision: safeInteger(record.projectRevision, `${path}.projectRevision`, 1),
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, `${path}.projectSessionId`),
    sessionRevision: safeInteger(record.sessionRevision, `${path}.sessionRevision`, 1),
    sessionGeneration: safeInteger(record.sessionGeneration, `${path}.sessionGeneration`, 1),
    currentLaunchPacketRef: parseArtifactRef(record.currentLaunchPacketRef, `${path}.currentLaunchPacketRef`),
    trustRecordDigest: parseSha256Digest(record.trustRecordDigest, `${path}.trustRecordDigest`),
    providerAdapterId: parseIdentifier<"AdapterId">(record.providerAdapterId, `${path}.providerAdapterId`),
    providerContractDigest: parseSha256Digest(record.providerContractDigest, `${path}.providerContractDigest`),
    resourceStateDigest: parseSha256Digest(record.resourceStateDigest, `${path}.resourceStateDigest`),
  };
  if (record.sessionState === "awaiting_launch") {
    if (record.provedFailedAttempt !== null) {
      throw new TypeError(`${path}.provedFailedAttempt must be null when sessionState is awaiting_launch`);
    }
    return { ...common, sessionState: "awaiting_launch", provedFailedAttempt: null };
  }
  if (record.sessionState === "launch_failed") {
    return {
      ...common,
      sessionState: "launch_failed",
      provedFailedAttempt: parseLaunchProviderActionIdentity(record.provedFailedAttempt, `${path}.provedFailedAttempt`),
    };
  }
  throw new TypeError(`${path}.sessionState must be awaiting_launch or launch_failed`);
}

export function parseProjectSessionLaunchIntent(
  value: unknown,
  path = "projectSessionLaunchIntent",
): ProjectSessionLaunchIntent {
  const record = strictRecord(value, path, [
    "kind",
    "projectId",
    "projectSessionId",
    "expectedProjectRevision",
    "expectedSessionRevision",
    "expectedSessionGeneration",
    "trustRecordDigest",
    "launchPacketRef",
    "authorityRef",
    "budgetRef",
    "resourcePlanRef",
    "providerAdapterId",
    "providerActionId",
    "providerContractDigest",
    "resourceStateDigest",
    "retryOf",
  ]);
  if (record.kind !== "project-session-launch") throw new TypeError(`${path}.kind must be project-session-launch`);
  return {
    kind: "project-session-launch",
    projectId: parseIdentifier<"ProjectId">(record.projectId, `${path}.projectId`),
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, `${path}.projectSessionId`),
    expectedProjectRevision: safeInteger(record.expectedProjectRevision, `${path}.expectedProjectRevision`, 1),
    expectedSessionRevision: safeInteger(record.expectedSessionRevision, `${path}.expectedSessionRevision`, 1),
    expectedSessionGeneration: safeInteger(record.expectedSessionGeneration, `${path}.expectedSessionGeneration`, 1),
    trustRecordDigest: parseSha256Digest(record.trustRecordDigest, `${path}.trustRecordDigest`),
    launchPacketRef: parseArtifactRef(record.launchPacketRef, `${path}.launchPacketRef`),
    authorityRef: parseSha256Digest(record.authorityRef, `${path}.authorityRef`),
    budgetRef: parseIdentifier<"BudgetRef">(record.budgetRef, `${path}.budgetRef`),
    resourcePlanRef: parseArtifactRef(record.resourcePlanRef, `${path}.resourcePlanRef`),
    providerAdapterId: parseIdentifier<"AdapterId">(record.providerAdapterId, `${path}.providerAdapterId`),
    providerActionId: parseIdentifier<"ProviderActionId">(record.providerActionId, `${path}.providerActionId`),
    providerContractDigest: parseSha256Digest(record.providerContractDigest, `${path}.providerContractDigest`),
    resourceStateDigest: parseSha256Digest(record.resourceStateDigest, `${path}.resourceStateDigest`),
    ...(record.retryOf === undefined
      ? {}
      : { retryOf: parseLaunchProviderActionIdentity(record.retryOf, `${path}.retryOf`) }),
  };
}

export function assertProjectSessionLaunchCurrentState(
  intent: ProjectSessionLaunchIntent,
  current: ProjectSessionLaunchCurrentState,
): void {
  if (intent.projectId !== current.projectId) throw new TypeError("launch project identity changed");
  if (intent.expectedProjectRevision !== current.projectRevision) throw new TypeError("launch project revision changed");
  if (intent.projectSessionId !== current.projectSessionId) throw new TypeError("launch project session identity changed");
  if (intent.expectedSessionRevision !== current.sessionRevision) throw new TypeError("launch session revision changed");
  if (intent.expectedSessionGeneration !== current.sessionGeneration) throw new TypeError("launch session generation changed");
  if (intent.trustRecordDigest !== current.trustRecordDigest) throw new TypeError("launch trust record digest changed");
  if (intent.providerAdapterId !== current.providerAdapterId) throw new TypeError("launch provider adapter changed");
  if (intent.providerContractDigest !== current.providerContractDigest) throw new TypeError("launch provider contract changed");
  if (intent.resourceStateDigest !== current.resourceStateDigest) throw new TypeError("launch resource state changed");

  if (current.sessionState === "awaiting_launch") {
    if (intent.retryOf !== undefined) throw new TypeError("launch retryOf is forbidden for awaiting_launch");
    if (!sameArtifactRef(intent.launchPacketRef, current.currentLaunchPacketRef)) {
      throw new TypeError("launch packet reference changed");
    }
    return;
  }

  if (intent.retryOf === undefined) throw new TypeError("launch retryOf is required for launch_failed");
  if (!sameProviderActionIdentity(intent.retryOf, current.provedFailedAttempt)) {
    throw new TypeError("launch retryOf does not match the proved failed attempt");
  }
  if (sameProviderActionIdentity({
    providerAdapterId: intent.providerAdapterId,
    providerActionId: intent.providerActionId,
  }, current.provedFailedAttempt)) {
    throw new TypeError("launch retry requires a new provider action identity");
  }
}

function parseLaunchProviderActionIdentity(value: unknown, path: string): LaunchProviderActionIdentity {
  const record = strictRecord(value, path, ["providerAdapterId", "providerActionId"]);
  return {
    providerAdapterId: parseIdentifier<"AdapterId">(record.providerAdapterId, `${path}.providerAdapterId`),
    providerActionId: parseIdentifier<"ProviderActionId">(record.providerActionId, `${path}.providerActionId`),
  };
}

function sameArtifactRef(left: ArtifactRef, right: ArtifactRef): boolean {
  return left.path === right.path && left.digest === right.digest;
}

function sameProviderActionIdentity(left: LaunchProviderActionIdentity, right: LaunchProviderActionIdentity): boolean {
  return left.providerAdapterId === right.providerAdapterId && left.providerActionId === right.providerActionId;
}

export function parseLaunchAdapterOutcomeV1(
  value: unknown,
  path = "launchAdapterOutcomeV1",
): LaunchAdapterOutcomeV1 {
  const record = strictRecord(value, path, [
    "schemaVersion",
    "providerAdapterId",
    "providerActionId",
    "providerContractDigest",
    "observationKind",
    "observedAt",
    "outcome",
  ]);
  if (safeInteger(record.schemaVersion, `${path}.schemaVersion`, 1) !== 1) {
    throw new TypeError(`${path}.schemaVersion must equal 1`);
  }
  const common: LaunchAdapterOutcomeCommon = {
    schemaVersion: 1,
    providerAdapterId: parseIdentifier<"AdapterId">(record.providerAdapterId, `${path}.providerAdapterId`),
    providerActionId: parseIdentifier<"ProviderActionId">(record.providerActionId, `${path}.providerActionId`),
    providerContractDigest: parseSha256Digest(record.providerContractDigest, `${path}.providerContractDigest`),
    observationKind: parseObservationKind(record.observationKind, `${path}.observationKind`),
    observedAt: parseTimestamp(record.observedAt, `${path}.observedAt`),
  };
  const discriminant = strictRecord(
    record.outcome,
    `${path}.outcome`,
    typeof record.outcome === "object" && record.outcome !== null && !Array.isArray(record.outcome)
      ? Object.keys(record.outcome)
      : [],
  );
  if (discriminant.kind === "terminal-success") {
    const outcome = strictRecord(record.outcome, `${path}.outcome`, [
      "kind",
      "providerSessionRef",
      "providerSessionGeneration",
      "effectDigest",
      "resourceUsage",
    ]);
    return {
      ...common,
      outcome: {
        kind: "terminal-success",
        providerSessionRef: parseIdentifier<"ProviderSessionRef">(outcome.providerSessionRef, `${path}.outcome.providerSessionRef`),
        providerSessionGeneration: safeInteger(outcome.providerSessionGeneration, `${path}.outcome.providerSessionGeneration`, 1),
        effectDigest: parseSha256Digest(outcome.effectDigest, `${path}.outcome.effectDigest`),
        resourceUsage: parseLaunchResourceUsage(outcome.resourceUsage, `${path}.outcome.resourceUsage`),
      },
    };
  }
  if (discriminant.kind === "terminal-no-effect") {
    const outcome = strictRecord(record.outcome, `${path}.outcome`, ["kind", "failureCode", "noEffectProof"]);
    const proof = strictRecord(outcome.noEffectProof, `${path}.outcome.noEffectProof`, ["schemaId", "proof", "digest"]);
    return {
      ...common,
      outcome: {
        kind: "terminal-no-effect",
        failureCode: parseIdentifier<"FailureCode">(outcome.failureCode, `${path}.outcome.failureCode`),
        noEffectProof: {
          schemaId: parseIdentifier<"ProofSchemaId">(proof.schemaId, `${path}.outcome.noEffectProof.schemaId`),
          proof: parseJsonValue(proof.proof, `${path}.outcome.noEffectProof.proof`),
          digest: parseSha256Digest(proof.digest, `${path}.outcome.noEffectProof.digest`),
        },
      },
    };
  }
  if (discriminant.kind === "ambiguous") {
    const outcome = strictRecord(record.outcome, `${path}.outcome`, ["kind", "reasonCode", "evidenceDigest"]);
    return {
      ...common,
      outcome: {
        kind: "ambiguous",
        reasonCode: parseAmbiguousReasonCode(outcome.reasonCode, `${path}.outcome.reasonCode`),
        evidenceDigest: outcome.evidenceDigest === null
          ? null
          : parseSha256Digest(outcome.evidenceDigest, `${path}.outcome.evidenceDigest`),
      },
    };
  }
  throw new TypeError(`${path}.outcome.kind is not an allowed launch outcome`);
}

export function parseProviderActionRefV1(value: unknown, path = "providerActionRefV1"): ProviderActionRefV1 {
  const record = strictRecord(value, path, [
    "schemaVersion",
    "projectSessionId",
    "coordinationRunId",
    "providerAdapterId",
    "providerActionId",
    "providerContractDigest",
    "custodyAttemptGeneration",
    "journalRevision",
    "journalState",
    "outcomeKind",
    "outcomeDigest",
  ]);
  if (safeInteger(record.schemaVersion, `${path}.schemaVersion`, 1) !== 1) {
    throw new TypeError(`${path}.schemaVersion must equal 1`);
  }
  const common: ProviderActionRefV1Common = {
    schemaVersion: 1,
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, `${path}.projectSessionId`),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(record.coordinationRunId, `${path}.coordinationRunId`),
    providerAdapterId: parseIdentifier<"AdapterId">(record.providerAdapterId, `${path}.providerAdapterId`),
    providerActionId: parseIdentifier<"ProviderActionId">(record.providerActionId, `${path}.providerActionId`),
    providerContractDigest: parseSha256Digest(record.providerContractDigest, `${path}.providerContractDigest`),
    custodyAttemptGeneration: safeInteger(record.custodyAttemptGeneration, `${path}.custodyAttemptGeneration`, 1),
    journalRevision: safeInteger(record.journalRevision, `${path}.journalRevision`, 1),
  };
  if (record.journalState === "prepared" || record.journalState === "dispatched" || record.journalState === "accepted") {
    if (record.outcomeKind !== null || record.outcomeDigest !== null) {
      throw new TypeError(`${path}.outcomeKind and outcomeDigest must be null for journalState ${record.journalState}`);
    }
    return { ...common, journalState: record.journalState, outcomeKind: null, outcomeDigest: null };
  }
  if (record.journalState === "terminal") {
    if (record.outcomeKind !== "terminal-success" && record.outcomeKind !== "terminal-no-effect") {
      throw new TypeError(`${path}.outcomeKind is invalid for journalState terminal`);
    }
    return {
      ...common,
      journalState: "terminal",
      outcomeKind: record.outcomeKind,
      outcomeDigest: parseSha256Digest(record.outcomeDigest, `${path}.outcomeDigest`),
    };
  }
  if (record.journalState === "ambiguous") {
    if (record.outcomeKind !== "ambiguous") {
      throw new TypeError(`${path}.outcomeKind must be ambiguous for journalState ambiguous`);
    }
    return {
      ...common,
      journalState: "ambiguous",
      outcomeKind: "ambiguous",
      outcomeDigest: parseSha256Digest(record.outcomeDigest, `${path}.outcomeDigest`),
    };
  }
  throw new TypeError(`${path}.journalState is invalid`);
}

function parseLaunchResourceUsage(value: unknown, path: string): LaunchResourceUsage {
  const fields = typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
  const record = strictRecord(value, path, fields);
  if (fields.length === 0 || fields.length > 128) throw new TypeError(`${path} must contain 1-128 dimensions`);
  const usage: Record<string, number | "unknown"> = {};
  for (const [unit, amount] of Object.entries(record)) {
    if (!isResourceUnitKey(unit)) throw new TypeError(`${path}.${unit} is not a qualified resource unit`);
    usage[unit] = amount === "unknown" ? "unknown" : safeInteger(amount, `${path}.${unit}`);
  }
  return usage;
}

function parseObservationKind(value: unknown, path: string): "dispatch-return" | "lookup" {
  if (value === "dispatch-return" || value === "lookup") return value;
  throw new TypeError(`${path} must be dispatch-return or lookup`);
}

function parseAmbiguousReasonCode(
  value: unknown,
  path: string,
): Extract<LaunchAdapterOutcomeV1["outcome"], { kind: "ambiguous" }>["reasonCode"] {
  const reasons = [
    "absent",
    "transport-error",
    "adapter-error",
    "malformed",
    "incomplete",
    "conflict",
    "missing-resume-reference",
  ] as const;
  const match = reasons.find((reason) => reason === value);
  if (match === undefined) throw new TypeError(`${path} is not an allowed ambiguity reason`);
  return match;
}

function defineIdentifierCodec(example: string): Codec<string> {
  return defineCodec({
    type: "string",
    pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
  }, example, (value, path) => parseIdentifier<"Identifier">(value, path));
}

function parseTopologyMode(value: unknown, path: string): "coordinated" | "independent" {
  if (value === "coordinated" || value === "independent") return value;
  throw new TypeError(`${path} must be coordinated or independent`);
}

function parseAgentOperation(value: unknown, path: string): FabricOperation {
  if (typeof value !== "string" || !isActiveFabricOperation(value) || !OPERATION_REGISTRY[value].principals.includes("agent")) {
    throw new TypeError(`${path} must be an active agent protocol operation`);
  }
  return value;
}

function parseDisclosureTarget(value: unknown, path: string): "local" | "approved-provider" | "external" {
  if (value === "local" || value === "approved-provider" || value === "external") return value;
  throw new TypeError(`${path} must be local, approved-provider or external`);
}

function parseDisclosure(value: unknown, path: string): LegacyDisclosurePolicy | readonly string[] {
  if (Array.isArray(value)) return parseUniqueArray(value, path, 0, 3, parseDisclosureTarget);
  const record = strictRecord(value, path, ["level", "scopes"]);
  if (record.level === "allowed" || record.level === "forbidden") {
    if (record.scopes !== undefined) throw new TypeError(`${path}.scopes is forbidden for ${record.level}`);
    return { level: record.level };
  }
  if (record.level === "scoped") {
    return { level: "scoped", scopes: parseUniqueArray(record.scopes, `${path}.scopes`, 1, 3, parseDisclosureTarget) };
  }
  throw new TypeError(`${path}.level is invalid`);
}

function parseChairAuthority(value: unknown, path: string): LegacyAuthorityInput {
  const record = strictRecord(value, path, [
    "workspaceRoots",
    "sourcePaths",
    "artifactPaths",
    "actions",
    "deniedPaths",
    "deniedActions",
    "disclosure",
    "expiresAt",
    "budget",
  ]);
  const authority: LegacyAuthorityInput = {
    workspaceRoots: parseUniqueArray(record.workspaceRoots, `${path}.workspaceRoots`, 1, 64, parseCanonicalRelativePath),
    sourcePaths: parseUniqueArray(record.sourcePaths, `${path}.sourcePaths`, 0, 256, parseCanonicalRelativePath),
    artifactPaths: parseUniqueArray(record.artifactPaths, `${path}.artifactPaths`, 0, 256, parseCanonicalRelativePath),
    actions: parseUniqueArray(record.actions, `${path}.actions`, 0, 256, parseAgentOperation),
    disclosure: parseDisclosure(record.disclosure, `${path}.disclosure`),
    expiresAt: parseTimestamp(record.expiresAt, `${path}.expiresAt`),
    budget: parseAuthorityBudget(record.budget, `${path}.budget`),
  };
  return {
    ...authority,
    ...(record.deniedPaths === undefined
      ? {}
      : { deniedPaths: parseUniqueArray(record.deniedPaths, `${path}.deniedPaths`, 0, 256, parseCanonicalRelativePath) }),
    ...(record.deniedActions === undefined
      ? {}
      : { deniedActions: parseUniqueArray(record.deniedActions, `${path}.deniedActions`, 0, 256, parseAgentOperation) }),
  };
}

function parseAuthorityBudget(value: unknown, path: string): Readonly<Record<string, number>> {
  const fields = typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
  const record = strictRecord(value, path, fields);
  if (fields.length > 128) throw new TypeError(`${path} must contain at most 128 dimensions`);
  const amounts: Record<string, number> = {};
  for (const [unit, amount] of Object.entries(record)) {
    if (!isResourceUnitKey(unit)) throw new TypeError(`${path}.${unit} is not a qualified resource unit`);
    amounts[unit] = safeInteger(amount, `${path}.${unit}`);
  }
  return amounts;
}

function parseUniqueArray<T>(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  parse: (entry: unknown, path: string) => T,
): readonly T[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new TypeError(`${path} must contain ${String(minimum)}-${String(maximum)} items`);
  }
  const parsed = value.map((entry, index) => parse(entry, `${path}[${String(index)}]`));
  if (new Set(parsed.map((entry) => JSON.stringify(entry))).size !== parsed.length) {
    throw new TypeError(`${path} must contain unique items`);
  }
  return parsed;
}

function parseJsonObject(value: unknown, path: string): Readonly<Record<string, JsonValue>> {
  const parsed = parseJsonValue(value, path);
  if (!isJsonRecord(parsed)) throw new TypeError(`${path} must be an object`);
  return parsed;
}

function isJsonRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
