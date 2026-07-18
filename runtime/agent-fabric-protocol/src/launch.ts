import type { AuthorityInput } from "./baseline-contracts.js";
import { AUTHORITY_ENVELOPE_V2_CODEC, parseAuthorityEnvelopeV2 } from "./authority.js";
import {
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
  chairAuthority: AuthorityInput;
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

export type ProviderActionRefV1 = {
  adapterId: string;
  actionId: ProviderActionId;
};

type LaunchProviderActionJournalRefV1Common = {
  schemaVersion: 1;
  projectSessionId: ProjectSessionId;
  coordinationRunId: CoordinationRunId;
  actionRef: ProviderActionRefV1;
  providerContractDigest: Sha256Digest;
  custodyAttemptGeneration: number;
  journalRevision: number;
};

export type LaunchProviderActionJournalRefV1 =
  | (LaunchProviderActionJournalRefV1Common & {
      journalState: "prepared" | "dispatched" | "accepted";
      outcomeKind: null;
      outcomeDigest: null;
    })
  | (LaunchProviderActionJournalRefV1Common & {
      journalState: "terminal";
      outcomeKind: "terminal-success";
      outcomeDigest: Sha256Digest;
    })
  | (LaunchProviderActionJournalRefV1Common & {
      journalState: "terminal";
      outcomeKind: "terminal-no-effect";
      outcomeDigest: Sha256Digest;
    })
  | (LaunchProviderActionJournalRefV1Common & {
      journalState: "ambiguous";
      outcomeKind: "ambiguous";
      outcomeDigest: Sha256Digest;
    });

const RESOURCE_UNIT_PATTERN = "^(?:provider_calls|concurrent_turns|descendants|message_bytes|artifact_bytes|wall_clock_milliseconds|cost:[A-Z]{3}|(?:input_tokens|output_tokens):[a-z0-9][a-z0-9._-]{0,63})$";
const nonEmptyResourceAmountsCodec = recordOf(integer(), {
  minimum: 1,
  maximum: 128,
  keyPattern: RESOURCE_UNIT_PATTERN,
  exampleKey: "concurrent_turns",
});
const chairAuthorityCodec = AUTHORITY_ENVELOPE_V2_CODEC;
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
const launchResourcePlanExample = {
  schemaVersion: 1,
  projectId: "project_01",
  projectSessionId: "ps_01",
  runId: "run_01",
  budgetRef: "budget_01",
  scopes: {
    project: { scopeId: "scope_project_01", limits: { provider_calls: 1 } },
    projectSession: { scopeId: "scope_session_01", limits: { provider_calls: 1 } },
    coordinationRun: { scopeId: "scope_run_01", limits: { provider_calls: 1 } },
  },
  launchReservation: { amounts: { provider_calls: 1 } },
} as const;
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
const providerActionRefBaseCodec = objectCodec({
  adapterId: defineIdentifierCodec("claude-agent-sdk"),
  actionId: defineIdentifierCodec("provider_action_01"),
});
const launchProviderActionJournalRefCommonCodecs = {
  schemaVersion: literal(1),
  projectSessionId: defineIdentifierCodec("ps_01"),
  coordinationRunId: defineIdentifierCodec("run_01"),
  actionRef: providerActionRefBaseCodec,
  providerContractDigest: sha256,
  custodyAttemptGeneration: integer({ minimum: 1 }),
  journalRevision: integer({ minimum: 1 }),
};
const launchProviderActionJournalRefBaseCodec = unionOf([
  objectCodec({
    ...launchProviderActionJournalRefCommonCodecs,
    journalState: enumeration(["prepared", "dispatched", "accepted"]),
    outcomeKind: literal(null),
    outcomeDigest: literal(null),
  }),
  objectCodec({
    ...launchProviderActionJournalRefCommonCodecs,
    journalState: literal("terminal"),
    outcomeKind: enumeration(["terminal-success", "terminal-no-effect"]),
    outcomeDigest: sha256,
  }),
  objectCodec({
    ...launchProviderActionJournalRefCommonCodecs,
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
  parseLaunchResourcePlanV1(launchResourcePlanExample),
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

export const LAUNCH_PROVIDER_ACTION_JOURNAL_REF_V1_CODEC: Codec<LaunchProviderActionJournalRefV1> = parserBacked(
  launchProviderActionJournalRefBaseCodec,
  (value, path) => parseLaunchProviderActionJournalRefV1(value, path),
  parseLaunchProviderActionJournalRefV1(launchProviderActionJournalRefBaseCodec.example),
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
    chairAuthority: parseAuthorityEnvelopeV2(record.chairAuthority, `${path}.chairAuthority`),
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
  const project = parseLaunchResourceScopePlan(scopes.project, `${path}.scopes.project`);
  const projectSession = parseLaunchResourceScopePlan(scopes.projectSession, `${path}.scopes.projectSession`);
  const coordinationRun = parseLaunchResourceScopePlan(scopes.coordinationRun, `${path}.scopes.coordinationRun`);
  const amounts = parseLaunchResourceAmounts(launchReservation.amounts, `${path}.launchReservation.amounts`);
  if (amounts.provider_calls !== 1) {
    throw new TypeError(`${path}.launchReservation.amounts.provider_calls must equal 1`);
  }
  for (const [scopeName, scope] of Object.entries({ project, projectSession, coordinationRun })) {
    if ((scope.limits.provider_calls ?? 0) < 1) {
      throw new TypeError(`${path}.scopes.${scopeName}.limits.provider_calls must be at least 1`);
    }
  }
  return {
    schemaVersion: 1,
    projectId: parseIdentifier<"ProjectId">(record.projectId, `${path}.projectId`),
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, `${path}.projectSessionId`),
    runId: parseIdentifier<"CoordinationRunId">(record.runId, `${path}.runId`),
    budgetRef: parseIdentifier<"BudgetRef">(record.budgetRef, `${path}.budgetRef`),
    scopes: {
      project,
      projectSession,
      coordinationRun,
    },
    launchReservation: { amounts },
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
  const record = strictRecord(value, path, ["adapterId", "actionId"]);
  return {
    adapterId: parseIdentifier<"AdapterId">(record.adapterId, `${path}.adapterId`),
    actionId: parseIdentifier<"ProviderActionId">(record.actionId, `${path}.actionId`),
  };
}

export function parseLaunchProviderActionJournalRefV1(
  value: unknown,
  path = "launchProviderActionJournalRefV1",
): LaunchProviderActionJournalRefV1 {
  const record = strictRecord(value, path, [
    "schemaVersion",
    "projectSessionId",
    "coordinationRunId",
    "actionRef",
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
  const common: LaunchProviderActionJournalRefV1Common = {
    schemaVersion: 1,
    projectSessionId: parseIdentifier<"ProjectSessionId">(record.projectSessionId, `${path}.projectSessionId`),
    coordinationRunId: parseIdentifier<"CoordinationRunId">(record.coordinationRunId, `${path}.coordinationRunId`),
    actionRef: parseProviderActionRefV1(record.actionRef, `${path}.actionRef`),
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


function parseJsonObject(value: unknown, path: string): Readonly<Record<string, JsonValue>> {
  const parsed = parseJsonValue(value, path);
  if (!isJsonRecord(parsed)) throw new TypeError(`${path} must be an object`);
  return parsed;
}

function isJsonRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
