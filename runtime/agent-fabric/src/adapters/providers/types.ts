import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

export const CHAIR_ATTESTATION_METHOD = "provider-session-random-challenge-v1" as const;
export const CHAIR_BRIDGE_CONTRACT = "agent-fabric-session-bridge-v1" as const;
export type ChairLaunchNativeAttribution =
  | "claude-sdk-assistant-request-tool-use-v1"
  | "codex-app-server-thread-turn-call-v1";

export type AdapterActionStatus =
  | "prepared"
  | "dispatched"
  | "accepted"
  | "terminal"
  | "ambiguous"
  | "cancelled";

export type AdapterActionRecord = {
  actionId: string;
  operation: string;
  payloadHash: string;
  status: AdapterActionStatus;
  history: AdapterActionStatus[];
  executionCount: number;
  effectCount: number;
  idempotencyProven: boolean;
  result?: unknown;
};

export type ProviderAdapterCapabilities = {
  protocolVersion: 1;
  adapterId: string;
  operations: string[];
  actionJournal: true;
  persistentSession: boolean;
  ephemeralWorker: true;
  answerBearingSpawn?: true;
  answerBearingSpawnTurns?: "payload-max-turns" | "one-shot";
  answerBearingUsageUnits?: string[];
  controlModes: ["managed"];
  inboxDeliveryModes: ["structured-push"];
  recoveryOperations: string[];
  compactInPlace: boolean;
  idempotencyEvidence: "per-action-fail-closed";
  chairLaunch?: ChairLaunchCapability;
  agentBridge?: AgentBridgeCapability;
};

export type AgentBridgeCapability = {
  schemaVersion: 1;
  method: "provision_agent";
  operations: ("spawn" | "attach")[];
  secretTransport: "private-handoff";
  bridgeContract: typeof CHAIR_BRIDGE_CONTRACT;
  generationBound: true;
  providerOriginatedActivation: true;
};

export function parseAgentBridgeCapability(value: unknown): AgentBridgeCapability {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 7 ||
    value.schemaVersion !== 1 ||
    value.method !== "provision_agent" ||
    !Array.isArray(value.operations) ||
    value.operations.length === 0 ||
    new Set(value.operations).size !== value.operations.length ||
    !value.operations.every((operation) => operation === "spawn" || operation === "attach") ||
    value.secretTransport !== "private-handoff" ||
    value.bridgeContract !== CHAIR_BRIDGE_CONTRACT ||
    value.generationBound !== true ||
    value.providerOriginatedActivation !== true
  ) {
    throw new ProviderAdapterError(
      "CAPABILITY_CONTRACT_INVALID",
      "agent bridge capability does not match its closed schema",
    );
  }
  return {
    schemaVersion: 1,
    method: "provision_agent",
    operations: [...value.operations] as ("spawn" | "attach")[],
    secretTransport: "private-handoff",
    bridgeContract: CHAIR_BRIDGE_CONTRACT,
    generationBound: true,
    providerOriginatedActivation: true,
  };
}

export type AgentLifecycleAttestationBinding = Readonly<{
  custodyId: string;
  checkpointDigest: string;
  challengeDigest: string;
}>;

export type AgentBridgeHandoff = {
  capability: string;
  socketPath: string;
  expectedPrincipal: AgentFabricPrincipalBinding;
  lifecycleAttestation?: AgentLifecycleAttestationBinding & { challenge: string };
};

export function takeAgentBridgeHandoff(environment: NodeJS.ProcessEnv): AgentBridgeHandoff | undefined {
  if (environment.AGENT_FABRIC_HANDOFF_KIND !== "agent") return undefined;
  const capability = environment.AGENT_FABRIC_CAPABILITY;
  const socketPath = environment.AGENT_FABRIC_SOCKET_PATH;
  const agentId = environment.AGENT_FABRIC_EXPECTED_AGENT_ID;
  const projectSessionId = environment.AGENT_FABRIC_EXPECTED_PROJECT_SESSION_ID;
  const runId = environment.AGENT_FABRIC_EXPECTED_RUN_ID;
  const principalGenerationValue = environment.AGENT_FABRIC_EXPECTED_PRINCIPAL_GENERATION;
  const challenge = environment.AGENT_FABRIC_ATTESTATION_CHALLENGE;
  const challengeDigest = environment.AGENT_FABRIC_ATTESTATION_CHALLENGE_DIGEST;
  const custodyId = environment.AGENT_FABRIC_LIFECYCLE_CUSTODY_ID;
  const checkpointDigest = environment.AGENT_FABRIC_LIFECYCLE_CHECKPOINT_DIGEST;
  delete environment.AGENT_FABRIC_HANDOFF_KIND;
  delete environment.AGENT_FABRIC_CAPABILITY;
  delete environment.AGENT_FABRIC_SOCKET_PATH;
  delete environment.AGENT_FABRIC_EXPECTED_AGENT_ID;
  delete environment.AGENT_FABRIC_EXPECTED_PROJECT_SESSION_ID;
  delete environment.AGENT_FABRIC_EXPECTED_RUN_ID;
  delete environment.AGENT_FABRIC_EXPECTED_PRINCIPAL_GENERATION;
  delete environment.AGENT_FABRIC_ATTESTATION_CHALLENGE;
  delete environment.AGENT_FABRIC_ATTESTATION_CHALLENGE_DIGEST;
  delete environment.AGENT_FABRIC_LIFECYCLE_CUSTODY_ID;
  delete environment.AGENT_FABRIC_LIFECYCLE_CHECKPOINT_DIGEST;
  const principalGeneration = Number(principalGenerationValue);
  if (
    typeof capability !== "string" || capability.length === 0 ||
    typeof socketPath !== "string" || !isAbsolute(socketPath) ||
    !isBoundedProviderEvidenceRef(agentId) ||
    !isBoundedProviderEvidenceRef(projectSessionId) ||
    !isBoundedProviderEvidenceRef(runId) ||
    !Number.isSafeInteger(principalGeneration) || principalGeneration < 1 ||
    ([challenge, challengeDigest, custodyId, checkpointDigest].some((value) => value !== undefined) &&
      (!/^[0-9a-f]{64}$/u.test(challenge ?? "") ||
       !/^sha256:[0-9a-f]{64}$/u.test(challengeDigest ?? "") ||
       chairLaunchChallengeDigest(challenge ?? "") !== challengeDigest ||
       !isBoundedProviderEvidenceRef(custodyId) ||
       !/^sha256:[0-9a-f]{64}$/u.test(checkpointDigest ?? "")))
  ) {
    throw new ProviderAdapterError("PRIVATE_HANDOFF_INVALID", "agent bridge private handoff is incomplete");
  }
  return {
    capability,
    socketPath,
    expectedPrincipal: { agentId, projectSessionId, runId, principalGeneration },
    ...(challenge === undefined ? {} : {
      lifecycleAttestation: { challenge, challengeDigest: challengeDigest as string,
        custodyId: custodyId as string, checkpointDigest: checkpointDigest as string },
    }),
  };
}

export type AgentProvisionBoundaryInput = {
  schemaVersion: 1;
  runId: string;
  operation: "spawn" | "attach";
  actionId: string;
  targetAgentId: string;
  authorityId: string;
  bridgeGeneration: number;
  bridgeContractDigest: string;
  payload: Record<string, unknown>;
  providerSessionRef?: string;
  expectedPrincipal: AgentFabricPrincipalBinding;
  environment: {
    AGENT_FABRIC_CAPABILITY: string;
    AGENT_FABRIC_SOCKET_PATH: string;
    AGENT_FABRIC_ATTESTATION_CHALLENGE?: string;
    AGENT_FABRIC_ATTESTATION_CHALLENGE_DIGEST?: string;
    AGENT_FABRIC_LIFECYCLE_CUSTODY_ID?: string;
    AGENT_FABRIC_LIFECYCLE_CHECKPOINT_DIGEST?: string;
  };
};

export type AgentLifecycleLaunchAttestation = Readonly<{
  schemaVersion: 1;
  kind: "provider-session-lifecycle-attestation";
  custodyId: string;
  actionId: string;
  checkpointDigest: string;
  challengeDigest: string;
  providerSessionRef: string;
  providerSessionGeneration: number;
  bridgeGeneration: number;
  providerTurnRef: string;
  providerInvocationRef: string;
  attestationDigest: string;
}>;

export type AgentProvisionProviderResult = {
  schemaVersion: 1;
  adapterId: string;
  actionId: string;
  targetAgentId: string;
  providerSessionRef: string;
  providerSessionGeneration: number;
  bridgeGeneration: number;
  bridgeContractDigest: string;
  activationEvidenceDigest: string;
  lifecycleAttestation?: AgentLifecycleLaunchAttestation;
};

export function agentLifecycleAttestationDigest(
  value: Omit<AgentLifecycleLaunchAttestation, "attestationDigest">,
): string {
  return `sha256:${createHash("sha256").update(JSON.stringify({
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    custodyId: value.custodyId,
    actionId: value.actionId,
    checkpointDigest: value.checkpointDigest,
    challengeDigest: value.challengeDigest,
    providerSessionRef: value.providerSessionRef,
    providerSessionGeneration: value.providerSessionGeneration,
    bridgeGeneration: value.bridgeGeneration,
    providerTurnRef: value.providerTurnRef,
    providerInvocationRef: value.providerInvocationRef,
  })).digest("hex")}`;
}

export function parseAgentProvisionProviderResult(
  value: unknown,
  expected: {
    adapterId: string;
    actionId: string;
    targetAgentId: string;
    bridgeGeneration: number;
    bridgeContractDigest: string;
    lifecycleAttestation?: AgentLifecycleAttestationBinding;
  },
): AgentProvisionProviderResult {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== (expected.lifecycleAttestation === undefined ? 9 : 10) ||
    value.schemaVersion !== 1 ||
    value.adapterId !== expected.adapterId ||
    value.actionId !== expected.actionId ||
    value.targetAgentId !== expected.targetAgentId ||
    !isBoundedProviderEvidenceRef(value.providerSessionRef) ||
    typeof value.providerSessionGeneration !== "number" ||
    !Number.isSafeInteger(value.providerSessionGeneration) ||
    value.providerSessionGeneration < 1 ||
    value.bridgeGeneration !== expected.bridgeGeneration ||
    value.bridgeContractDigest !== expected.bridgeContractDigest ||
    typeof value.activationEvidenceDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(value.activationEvidenceDigest) ||
    (expected.lifecycleAttestation === undefined) !== !Object.hasOwn(value, "lifecycleAttestation")
  ) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "agent bridge result does not match its exact generation-bound contract",
    );
  }
  let lifecycleAttestation: AgentLifecycleLaunchAttestation | undefined;
  if (expected.lifecycleAttestation !== undefined) {
    const attestation = value.lifecycleAttestation;
    if (
      !isRecord(attestation) || Object.keys(attestation).length !== 12 ||
      attestation.schemaVersion !== 1 || attestation.kind !== "provider-session-lifecycle-attestation" ||
      attestation.custodyId !== expected.lifecycleAttestation.custodyId ||
      attestation.actionId !== expected.actionId ||
      attestation.checkpointDigest !== expected.lifecycleAttestation.checkpointDigest ||
      attestation.challengeDigest !== expected.lifecycleAttestation.challengeDigest ||
      attestation.providerSessionRef !== value.providerSessionRef ||
      attestation.providerSessionGeneration !== value.providerSessionGeneration ||
      attestation.bridgeGeneration !== expected.bridgeGeneration ||
      !isBoundedProviderEvidenceRef(attestation.providerTurnRef) ||
      !isBoundedProviderEvidenceRef(attestation.providerInvocationRef) ||
      typeof attestation.attestationDigest !== "string"
    ) throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "agent lifecycle attestation crossed its reserved binding");
    const unsigned = { ...attestation } as Record<string, unknown>;
    delete unsigned.attestationDigest;
    if (attestation.attestationDigest !== agentLifecycleAttestationDigest(unsigned as Omit<AgentLifecycleLaunchAttestation, "attestationDigest">)) {
      throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "agent lifecycle attestation digest is invalid");
    }
    lifecycleAttestation = attestation as AgentLifecycleLaunchAttestation;
    if (value.activationEvidenceDigest !== lifecycleAttestation.attestationDigest) {
      throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "agent activation evidence is not the lifecycle attestation");
    }
  }
  return {
    schemaVersion: 1,
    adapterId: expected.adapterId,
    actionId: expected.actionId,
    targetAgentId: expected.targetAgentId,
    providerSessionRef: value.providerSessionRef,
    providerSessionGeneration: value.providerSessionGeneration,
    bridgeGeneration: expected.bridgeGeneration,
    bridgeContractDigest: expected.bridgeContractDigest,
    activationEvidenceDigest: value.activationEvidenceDigest,
    ...(lifecycleAttestation === undefined ? {} : { lifecycleAttestation }),
  };
}

export type ChairLaunchCapability = {
  schemaVersion: 1;
  method: "launch_chair";
  inputSchemaId: string;
  oneUse: true;
  secretTransport: "private-environment";
  environment: {
    capability: "AGENT_FABRIC_CAPABILITY";
    socketPath: "AGENT_FABRIC_SOCKET_PATH";
    attestationChallenge: "AGENT_FABRIC_ATTESTATION_CHALLENGE";
  };
  publicPayloadSchema: Record<string, unknown>;
  noEffectProofSchemas: Record<string, Record<string, unknown>>;
  attestation: {
    method: typeof CHAIR_ATTESTATION_METHOD;
    bridgeContract: typeof CHAIR_BRIDGE_CONTRACT;
    origin: "provider-session-tool-call";
    oneUse: true;
    bridgeLifetime: "provider-session";
    digestAlgorithm: "sha256";
    nativeAttribution: ChairLaunchNativeAttribution;
  };
};

function isClosedObjectSchema(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value.type === "object" &&
    value.additionalProperties === false &&
    isRecord(value.properties) &&
    Array.isArray(value.required) &&
    value.required.every((field) => typeof field === "string")
  );
}

function isBoundedProviderEvidenceRef(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= 512;
}

export function parseChairLaunchCapability(value: unknown): ChairLaunchCapability {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 9 ||
    value.schemaVersion !== 1 ||
    value.method !== "launch_chair" ||
    typeof value.inputSchemaId !== "string" ||
    value.inputSchemaId.length === 0 ||
    value.oneUse !== true ||
    value.secretTransport !== "private-environment" ||
    !isRecord(value.environment) ||
    Object.keys(value.environment).length !== 3 ||
    value.environment.capability !== "AGENT_FABRIC_CAPABILITY" ||
    value.environment.socketPath !== "AGENT_FABRIC_SOCKET_PATH" ||
    value.environment.attestationChallenge !== "AGENT_FABRIC_ATTESTATION_CHALLENGE" ||
    !isClosedObjectSchema(value.publicPayloadSchema) ||
    !isRecord(value.noEffectProofSchemas) ||
    !Object.values(value.noEffectProofSchemas).every(isClosedObjectSchema) ||
    !isRecord(value.attestation) ||
    Object.keys(value.attestation).length !== 7 ||
    value.attestation.method !== CHAIR_ATTESTATION_METHOD ||
    value.attestation.bridgeContract !== CHAIR_BRIDGE_CONTRACT ||
    value.attestation.origin !== "provider-session-tool-call" ||
    value.attestation.oneUse !== true ||
    value.attestation.bridgeLifetime !== "provider-session" ||
    value.attestation.digestAlgorithm !== "sha256" ||
    (value.attestation.nativeAttribution !== "claude-sdk-assistant-request-tool-use-v1" &&
      value.attestation.nativeAttribution !== "codex-app-server-thread-turn-call-v1")
  ) {
    throw new ProviderAdapterError(
      "CAPABILITY_CONTRACT_INVALID",
      "chair launch capability does not match its closed schema",
    );
  }
  return {
    schemaVersion: 1,
    method: "launch_chair",
    inputSchemaId: value.inputSchemaId,
    oneUse: true,
    secretTransport: "private-environment",
    environment: {
      capability: "AGENT_FABRIC_CAPABILITY",
      socketPath: "AGENT_FABRIC_SOCKET_PATH",
      attestationChallenge: "AGENT_FABRIC_ATTESTATION_CHALLENGE",
    },
    publicPayloadSchema: value.publicPayloadSchema,
    noEffectProofSchemas: value.noEffectProofSchemas as Record<string, Record<string, unknown>>,
    attestation: {
      method: CHAIR_ATTESTATION_METHOD,
      bridgeContract: CHAIR_BRIDGE_CONTRACT,
      origin: "provider-session-tool-call",
      oneUse: true,
      bridgeLifetime: "provider-session",
      digestAlgorithm: "sha256",
      nativeAttribution: value.attestation.nativeAttribution,
    },
  };
}

export type ChairLaunchHandoff = {
  capability: string;
  socketPath: string;
  attestationChallenge: string;
  expectedPrincipal: AgentFabricPrincipalBinding;
};

export type AgentFabricPrincipalBinding = Readonly<{
  agentId: string;
  projectSessionId: string;
  runId: string;
  principalGeneration: number;
}>;

export type ChairLaunchBoundaryInput = {
  actionId: string;
  providerAdapterId: string;
  providerContractDigest: string;
  challengeDigest: string;
  expectedPrincipal: AgentFabricPrincipalBinding;
  payload: Record<string, unknown>;
  environment: {
    AGENT_FABRIC_CAPABILITY: string;
    AGENT_FABRIC_SOCKET_PATH: string;
    AGENT_FABRIC_ATTESTATION_CHALLENGE: string;
  };
};

export type ChairRecoveryBoundaryInput = ChairLaunchBoundaryInput & {
  recoveryId: string;
  lossId: string;
  resumeReference: string;
  expectedProviderSessionGeneration: number;
  nextProviderSessionGeneration: number;
  bridgeGeneration: number;
};

export type ChairLaunchProviderResult = {
  resumeReference: string;
  providerSessionGeneration: number;
  fabricContinuity: ChairLaunchFabricContinuityEvidence;
};

export type ChairLaunchFabricContinuityEvidence = {
  schemaVersion: 1;
  kind: "provider-session-fabric-attestation";
  method: typeof CHAIR_ATTESTATION_METHOD;
  bridgeContract: typeof CHAIR_BRIDGE_CONTRACT;
  providerAdapterId: string;
  providerActionId: string;
  providerContractDigest: string;
  providerSessionRef: string;
  providerSessionGeneration: number;
  providerTurnRef: string;
  challengeDigest: string;
  providerInvocationRef: string;
  attestationDigest: string;
};

export type ChairLaunchAttestationBinding = {
  providerAdapterId: string;
  providerActionId: string;
  providerContractDigest: string;
  challengeDigest: string;
};

export function chairLaunchChallengeDigest(challengeResponse: string): string {
  return `sha256:${createHash("sha256").update(Buffer.from(challengeResponse, "hex")).digest("hex")}`;
}

export type ChairLaunchUnsignedAttestation = Omit<ChairLaunchFabricContinuityEvidence, "attestationDigest">;

export function chairLaunchAttestationDigest(attestation: ChairLaunchUnsignedAttestation): string {
  const canonical = JSON.stringify({
    schemaVersion: attestation.schemaVersion,
    kind: attestation.kind,
    method: attestation.method,
    bridgeContract: attestation.bridgeContract,
    providerAdapterId: attestation.providerAdapterId,
    providerActionId: attestation.providerActionId,
    providerContractDigest: attestation.providerContractDigest,
    providerSessionRef: attestation.providerSessionRef,
    providerSessionGeneration: attestation.providerSessionGeneration,
    providerTurnRef: attestation.providerTurnRef,
    challengeDigest: attestation.challengeDigest,
    providerInvocationRef: attestation.providerInvocationRef,
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export type ChairLaunchContinuityUnprovenEvidence = {
  kind: "continuity-unproven";
  providerContractDigest: string;
  resumeReference: string;
  providerSessionGeneration: number;
};

export function parseChairLaunchContinuityUnprovenEvidence(
  value: unknown,
  expectedProviderContractDigest: string,
): ChairLaunchContinuityUnprovenEvidence {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    value.kind !== "continuity-unproven" ||
    value.providerContractDigest !== expectedProviderContractDigest ||
    !isBoundedProviderEvidenceRef(value.resumeReference) ||
    typeof value.providerSessionGeneration !== "number" ||
    !Number.isSafeInteger(value.providerSessionGeneration) ||
    value.providerSessionGeneration <= 0
  ) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "chair launch continuity failure evidence does not match the launch contract",
    );
  }
  return {
    kind: "continuity-unproven",
    providerContractDigest: expectedProviderContractDigest,
    resumeReference: value.resumeReference,
    providerSessionGeneration: value.providerSessionGeneration,
  };
}

export function parseChairLaunchProviderResult(
  value: unknown,
  expected: ChairLaunchAttestationBinding,
): ChairLaunchProviderResult {
  if (
    !isBoundedProviderEvidenceRef(expected.providerAdapterId) ||
    !isBoundedProviderEvidenceRef(expected.providerActionId) ||
    !/^sha256:[0-9a-f]{64}$/u.test(expected.providerContractDigest) ||
    !/^sha256:[0-9a-f]{64}$/u.test(expected.challengeDigest) ||
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    !Object.hasOwn(value, "resumeReference") ||
    !isBoundedProviderEvidenceRef(value.resumeReference) ||
    !Object.hasOwn(value, "providerSessionGeneration") ||
    typeof value.providerSessionGeneration !== "number" ||
    !Number.isSafeInteger(value.providerSessionGeneration) ||
    value.providerSessionGeneration <= 0 ||
    !Object.hasOwn(value, "fabricContinuity") ||
    !isRecord(value.fabricContinuity)
  ) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "chair launch provider result does not match its closed schema",
    );
  }
  const continuity = value.fabricContinuity;
  if (
    Object.keys(continuity).length !== 13 ||
    continuity.schemaVersion !== 1 ||
    continuity.kind !== "provider-session-fabric-attestation" ||
    continuity.method !== CHAIR_ATTESTATION_METHOD ||
    continuity.bridgeContract !== CHAIR_BRIDGE_CONTRACT ||
    continuity.providerAdapterId !== expected.providerAdapterId ||
    continuity.providerActionId !== expected.providerActionId ||
    typeof continuity.providerContractDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(continuity.providerContractDigest) ||
    continuity.providerContractDigest !== expected.providerContractDigest ||
    continuity.providerSessionRef !== value.resumeReference ||
    continuity.providerSessionGeneration !== value.providerSessionGeneration ||
    !isBoundedProviderEvidenceRef(continuity.providerTurnRef) ||
    typeof continuity.challengeDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(continuity.challengeDigest) ||
    continuity.challengeDigest !== expected.challengeDigest ||
    !isBoundedProviderEvidenceRef(continuity.providerInvocationRef) ||
    typeof continuity.attestationDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(continuity.attestationDigest)
  ) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "chair launch Fabric continuity evidence does not match the launch contract",
    );
  }
  const unsigned: ChairLaunchUnsignedAttestation = {
    schemaVersion: 1,
    kind: "provider-session-fabric-attestation",
    method: CHAIR_ATTESTATION_METHOD,
    bridgeContract: CHAIR_BRIDGE_CONTRACT,
    providerAdapterId: expected.providerAdapterId,
    providerActionId: expected.providerActionId,
    providerContractDigest: expected.providerContractDigest,
    providerSessionRef: value.resumeReference,
    providerSessionGeneration: value.providerSessionGeneration,
    providerTurnRef: continuity.providerTurnRef,
    challengeDigest: expected.challengeDigest,
    providerInvocationRef: continuity.providerInvocationRef,
  };
  if (continuity.attestationDigest !== chairLaunchAttestationDigest(unsigned)) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "chair launch Fabric continuity digest does not match its canonical evidence",
    );
  }
  return {
    resumeReference: value.resumeReference,
    providerSessionGeneration: value.providerSessionGeneration,
    fabricContinuity: {
      ...unsigned,
      attestationDigest: continuity.attestationDigest,
    },
  };
}

export function takeChairLaunchHandoff(environment: NodeJS.ProcessEnv): ChairLaunchHandoff | undefined {
  if (environment.AGENT_FABRIC_HANDOFF_KIND === "agent") return undefined;
  const capability = environment.AGENT_FABRIC_CAPABILITY;
  const socketPath = environment.AGENT_FABRIC_SOCKET_PATH;
  const attestationChallenge = environment.AGENT_FABRIC_ATTESTATION_CHALLENGE;
  const agentId = environment.AGENT_FABRIC_EXPECTED_AGENT_ID;
  const projectSessionId = environment.AGENT_FABRIC_EXPECTED_PROJECT_SESSION_ID;
  const runId = environment.AGENT_FABRIC_EXPECTED_RUN_ID;
  const principalGenerationValue = environment.AGENT_FABRIC_EXPECTED_PRINCIPAL_GENERATION;
  delete environment.AGENT_FABRIC_CAPABILITY;
  delete environment.AGENT_FABRIC_SOCKET_PATH;
  delete environment.AGENT_FABRIC_ATTESTATION_CHALLENGE;
  delete environment.AGENT_FABRIC_EXPECTED_AGENT_ID;
  delete environment.AGENT_FABRIC_EXPECTED_PROJECT_SESSION_ID;
  delete environment.AGENT_FABRIC_EXPECTED_RUN_ID;
  delete environment.AGENT_FABRIC_EXPECTED_PRINCIPAL_GENERATION;
  delete environment.AGENT_FABRIC_HANDOFF_KIND;
  if (
    capability === undefined && socketPath === undefined && attestationChallenge === undefined &&
    agentId === undefined && projectSessionId === undefined && runId === undefined &&
    principalGenerationValue === undefined
  ) return undefined;
  const principalGeneration = Number(principalGenerationValue);
  if (
    typeof capability !== "string" ||
    capability.length === 0 ||
    typeof socketPath !== "string" ||
    socketPath.length === 0 ||
    !isAbsolute(socketPath) ||
    typeof attestationChallenge !== "string" ||
    !/^[0-9a-f]{64}$/u.test(attestationChallenge) ||
    !isBoundedProviderEvidenceRef(agentId) ||
    !isBoundedProviderEvidenceRef(projectSessionId) ||
    !isBoundedProviderEvidenceRef(runId) ||
    !Number.isSafeInteger(principalGeneration) ||
    principalGeneration < 1
  ) {
    throw new ProviderAdapterError(
      "PRIVATE_HANDOFF_INVALID",
      "chair launch private environment must contain a capability, 32-byte challenge, exact agent principal and absolute socket path",
    );
  }
  return {
    capability,
    socketPath,
    attestationChallenge,
    expectedPrincipal: { agentId, projectSessionId, runId, principalGeneration },
  };
}

export type AdapterRequestHandler = {
  request(method: string, params: Record<string, unknown>): Promise<unknown>;
};

export class ProviderAdapterError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderAdapterError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderAdapterError("INVALID_PARAMS", `${field} must be a non-empty string`);
  }
  return value;
}

export function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field);
}

export function actionPayload(params: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(params.payload)) return params.payload;
  return Object.fromEntries(Object.entries(params).filter(([key]) => key !== "actionId"));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}
