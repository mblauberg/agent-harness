import { OPERATION_REGISTRY, FABRIC_OPERATIONS, type FabricOperation } from "./operations.js";
import { OPERATION_CODECS } from "./operation-codecs.js";
import { parseJsonValue, type JsonValue } from "./primitives.js";
import type { ProtocolOperation } from "./rpc-contract.js";

const digestA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const digestB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const artifact = { path: "docs/spec.md", digest: digestA };
const timestamp = "2026-07-11T10:00:00Z";

const operatorCommand = {
  credential: { capabilityId: "capability_01", token: "test-capability-token" },
  commandId: "command_01",
  expectedRevision: 1,
  actor: "operator_01",
  provenance: { kind: "console-direct-input", clientId: "client_01", inputEventId: "input_01" },
  evidenceRefs: [artifact],
};

const session = {
  projectSessionId: "ps_01",
  projectId: "project_01",
  mode: "coordinated",
  state: "active",
  revision: 2,
  generation: 1,
  authorityRef: digestA,
  budgetRef: "budget_01",
  launchPacketRef: artifact,
  membershipRevision: 1,
  origin: { kind: "operator-launch", operatorId: "operator_01" },
};

const resultDelivery = {
  resultDeliveryId: "delivery_01",
  revision: 1,
  projectSessionId: "ps_01",
  taskId: "task_01",
  requestMessageId: "request_01",
  requestRevision: 1,
  replyMessageId: "reply_01",
  replyRevision: 1,
  taskRevision: 2,
  callbackId: "callback_01",
  callbackGeneration: 1,
  assignmentGeneration: 1,
  targetAgentId: "agent_01",
  targetProviderSessionRef: "provider_session_01",
  payloadDigest: digestA,
  responseDeadline: timestamp,
  dependentBarrierId: "barrier_01",
  required: true,
  state: "pending",
  claimGeneration: 0,
};

const taskRequest = {
  commandId: "command_task_01",
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  task: {
    taskId: "task_01",
    taskRevision: 1,
    objective: "Review protocol.",
    baseRevision: "revision_01",
    expectedArtifactPaths: ["reviews/protocol.md"],
  },
  request: {
    requestRevision: 1,
    messageId: "request_01",
    conversationId: "conversation_01",
    targetAgentId: "agent_01",
    targetProviderSessionRef: "provider_session_01",
    requiresAck: true,
    dedupeKey: "dedupe_01",
    responseDeadline: timestamp,
    callbackId: "callback_01",
    callbackGeneration: 1,
    dependentBarrierId: "barrier_01",
  },
};

const taskCompletion = {
  commandId: "command_complete_01",
  taskId: "task_01",
  expectedTaskRevision: 1,
  ownerLeaseId: "lease_01",
  ownerLeaseGeneration: 1,
  requestMessageId: "request_01",
  expectedRequestRevision: 1,
  callbackId: "callback_01",
  callbackGeneration: 1,
  reply: {
    messageId: "reply_01",
    conversationId: "conversation_01",
    replyToMessageId: "request_01",
    body: "Complete.",
    artifactRefs: [artifact],
  },
  terminalResult: { status: "complete", summary: "Complete.", completedAt: timestamp },
};

const gate = {
  gateId: "gate_01",
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  scope: { kind: "task", taskId: "task_01" },
  affectedTaskIds: ["task_01"],
  dependencyRevision: 1,
  blockedOperationIds: [FABRIC_OPERATIONS.taskCompleteWithReply],
  enforcementPoints: ["task-readiness", "operation"],
  question: "Proceed?",
  reason: "Decision required.",
  options: ["Approve", "Reject"],
  recommendation: "Approve",
  consequences: ["Implementation continues."],
  evidenceRefs: [artifact],
  revision: 1,
  createdByRef: "operator_01",
  expectedApproverRef: "operator_01",
  status: "pending",
};

const attestation = {
  attestationId: "attestation_01",
  integrationId: "integration_01",
  integrationGeneration: 1,
  operatorId: "operator_01",
  projectId: "project_01",
  projectSessionId: "ps_01",
  providerEvent: {
    providerId: "codex",
    providerSessionRef: "provider_session_01",
    providerMessageId: "provider_message_01",
    inputEventId: "provider_event_01",
    eventDigest: digestA,
    classification: "direct-human",
  },
  humanUtterance: "Approve.",
  gateBinding: {
    gateId: "gate_01",
    expectedGateRevision: 1,
    artifactDigests: [digestB],
    interpretedDecision: "approve",
  },
  recordedAt: timestamp,
};

type ContractFixture = { input: JsonValue; result: JsonValue; wrongOperation: FabricOperation };

function buildFixtures(): Readonly<Record<ProtocolOperation, ContractFixture>> {
  const fixtures: Partial<Record<ProtocolOperation, ContractFixture>> = {};
  for (const operation of Object.keys(OPERATION_REGISTRY) as ProtocolOperation[]) {
    fixtures[operation] = {
      input: parseJsonValue(OPERATION_CODECS[operation].input.example, `${operation}.input.fixture`),
      result: parseJsonValue(OPERATION_CODECS[operation].result.example, `${operation}.result.fixture`),
      wrongOperation: FABRIC_OPERATIONS.acknowledgeDelivery,
    };
  }

  const set = (operation: ProtocolOperation, input: JsonValue, result: JsonValue): void => {
    fixtures[operation] = { input, result, wrongOperation: FABRIC_OPERATIONS.acknowledgeDelivery };
  };
  set(FABRIC_OPERATIONS.projectSessionCreate, {
    command: operatorCommand,
    projectSessionId: "ps_01",
    projectId: "project_01",
    mode: "coordinated",
    generation: 1,
    authorityRef: digestA,
    budgetRef: "budget_01",
    launchPacketRef: artifact,
  }, session);
  set(FABRIC_OPERATIONS.projectSessionTransition, {
    command: operatorCommand,
    projectSessionId: "ps_01",
    expectedGeneration: 1,
    transition: { to: "active", reason: "launch complete" },
  }, session);
  set(FABRIC_OPERATIONS.projectSessionClose, {
    command: operatorCommand,
    projectSessionId: "ps_01",
    expectedGeneration: 1,
    terminalPath: { kind: "cancelled", reason: "fixture" },
  }, { ...session, state: "closed", terminalPath: { kind: "cancelled", reason: "fixture" } });
  set(FABRIC_OPERATIONS.intakeSubmit, {
    command: operatorCommand,
    intakeId: "intake_01",
    expectedRevision: 1,
    projectSessionId: "ps_01",
    coordinationRunId: "run_01",
    summary: "Discuss protocol.",
    artifactRefs: [artifact],
    gateIds: ["gate_01"],
    chairRequest: {
      ...taskRequest,
      request: {
        ...taskRequest.request,
        intakeBinding: {
          intakeId: "intake_01",
          intakeRevision: 2,
          gateIds: ["gate_01"],
          artifactDigests: [digestA],
        },
      },
    },
  }, {
    intakeId: "intake_01",
    projectId: "project_01",
    projectSessionId: "ps_01",
    coordinationRunId: "run_01",
    revision: 2,
    state: "awaiting-chair",
    dedupeKey: "intake_dedupe_01",
    summary: "Discuss protocol.",
    artifactRefs: [artifact],
    gateIds: ["gate_01"],
  });
  set(FABRIC_OPERATIONS.intakeRevise, {
    origin: "operator",
    command: operatorCommand,
    intakeId: "intake_01",
    projectSessionId: "ps_01",
    coordinationRunId: "run_01",
    expectedRevision: 1,
    state: "discussing",
    summary: "Discuss protocol.",
    artifactRefs: [artifact],
    gateIds: ["gate_01"],
  }, {
    intakeId: "intake_01",
    projectId: "project_01",
    projectSessionId: "ps_01",
    coordinationRunId: "run_01",
    revision: 2,
    state: "discussing",
    dedupeKey: "intake_dedupe_01",
    summary: "Discuss protocol.",
    artifactRefs: [artifact],
    gateIds: ["gate_01"],
  });
  set(FABRIC_OPERATIONS.scopedGateCreate, {
    origin: "operator",
    command: operatorCommand,
    intent: {
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      dedupeKey: "gate_intent_01",
      scope: { kind: "task", taskId: "task_01" },
      blockedOperationIds: [FABRIC_OPERATIONS.taskCompleteWithReply],
      enforcementPoints: ["task-readiness", "operation"],
      question: "Proceed?",
      reason: "Decision required.",
      options: ["Approve", "Reject"],
      recommendation: "Approve",
      consequences: ["Implementation continues."],
      evidenceRefs: [artifact],
    },
  }, gate);
  set(FABRIC_OPERATIONS.scopedGateResolve, {
    command: operatorCommand,
    gateId: "gate_01",
    status: "approved",
    decisionEvidence: { kind: "typed-console", confirmationCommandId: "command_confirm_01" },
  }, gate);
  for (const operation of [
    FABRIC_OPERATIONS.projectSessionCreate,
    FABRIC_OPERATIONS.projectSessionGet,
    FABRIC_OPERATIONS.projectSessionTransition,
    FABRIC_OPERATIONS.projectSessionClose,
    FABRIC_OPERATIONS.projectSessionDrain,
    FABRIC_OPERATIONS.projectSessionStop,
  ] as const) {
    const existing = fixtures[operation];
    if (existing !== undefined) fixtures[operation] = { ...existing, result: session };
  }
  const closeFixture = fixtures[FABRIC_OPERATIONS.projectSessionClose];
  if (closeFixture !== undefined) {
    fixtures[FABRIC_OPERATIONS.projectSessionClose] = {
      ...closeFixture,
      result: { ...session, state: "closed", terminalPath: { kind: "cancelled", reason: "fixture" } },
    };
  }
  set(FABRIC_OPERATIONS.integrationInputAttest, {
    context: {
      commandId: "command_attest_01",
      integrationId: "integration_01",
      expectedIntegrationGeneration: 1,
      eventId: "provider_event_01",
      eventDigest: digestA,
    },
    attestation,
  }, attestation);
  set(FABRIC_OPERATIONS.taskRequest, taskRequest, {
    taskRevision: 1,
    requestRevision: 1,
    callbackId: "callback_01",
    callbackGeneration: 1,
  });
  set(FABRIC_OPERATIONS.taskCompleteWithReply, taskCompletion, {
    taskRevision: 2,
    replyRevision: 1,
    resultDelivery,
  });
  set(FABRIC_OPERATIONS.resourceReserve, {
    commandId: "command_reserve_01",
    reservationId: "reservation_01",
    projectSessionId: "ps_01",
    path: [
      { kind: "project", scopeId: "scope_project", projectId: "project_01" },
      { kind: "project-session", scopeId: "scope_session", projectId: "project_01", projectSessionId: "ps_01" },
    ],
    amounts: { concurrent_turns: 1 },
  }, {
    reservationId: "reservation_01",
    revision: 1,
    state: "active",
    path: [
      { kind: "project", scopeId: "scope_project", projectId: "project_01" },
      { kind: "project-session", scopeId: "scope_session", projectId: "project_01", projectSessionId: "ps_01" },
    ],
    amounts: { concurrent_turns: 1 },
    capacity: {
      concurrent_turns: { unknown: false, used: 0, reserved: 1, remaining: 1 },
    },
  });
  const resourceFixture = fixtures[FABRIC_OPERATIONS.resourceReserve];
  if (resourceFixture !== undefined) {
    for (const operation of [FABRIC_OPERATIONS.resourceRelease, FABRIC_OPERATIONS.resourceReconcile] as const) {
      const existing = fixtures[operation];
      if (existing !== undefined) fixtures[operation] = { ...existing, result: resourceFixture.result };
    }
  }
  set(FABRIC_OPERATIONS.scopedGateCheck, {
    projectSessionId: "ps_01",
    coordinationRunId: "run_01",
    dependencyRevision: 1,
    enforcementPoint: "task-readiness",
    taskId: "task_01",
  }, { allowed: true, checkedGateRevisions: {} });
  for (const operation of [FABRIC_OPERATIONS.scopedGateCreate, FABRIC_OPERATIONS.scopedGateResolve] as const) {
    const existing = fixtures[operation];
    if (existing !== undefined) fixtures[operation] = { ...existing, result: gate };
  }
  for (const operation of [
    FABRIC_OPERATIONS.resultDeliveryClaim,
    FABRIC_OPERATIONS.resultDeliveryProviderAccept,
    FABRIC_OPERATIONS.resultDeliveryConsume,
    FABRIC_OPERATIONS.resultDeliveryRetry,
    FABRIC_OPERATIONS.resultDeliveryReassign,
    FABRIC_OPERATIONS.resultDeliveryAbandon,
  ] as const) {
    const existing = fixtures[operation];
    if (existing !== undefined) fixtures[operation] = { ...existing, result: resultDelivery };
  }
  return Object.freeze(fixtures) as Readonly<Record<ProtocolOperation, ContractFixture>>;
}

export const OPERATION_CONTRACT_FIXTURES = buildFixtures();

export const EXTENSION_OPERATIONS = Object.freeze(
  Object.entries(OPERATION_REGISTRY)
    .filter(([, definition]) => definition.kind === "extension")
    .map(([operation]) => operation as ProtocolOperation),
);
