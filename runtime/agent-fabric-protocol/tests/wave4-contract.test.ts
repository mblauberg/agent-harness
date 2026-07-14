import { createRequire } from "node:module";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { describe, expect, it } from "vitest";

import * as protocol from "../src/index.js";
import {
  FABRIC_OPERATIONS,
  PROTOCOL_SCHEMA,
  createOperatorClient,
  parseOperationInput,
  parseOperationResult,
  parseChairMutationContext,
  parseOperatorCapabilityGrant,
  parseProtocolPrincipal,
} from "../src/index.js";

const addFormats = createRequire(import.meta.url)("ajv-formats") as FormatsPlugin;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);

const projectLaunchGrant = {
  capabilityId: "capability_launch_01",
  operatorId: "operator_01",
  projectId: "project_01",
  projectAuthorityGeneration: 7,
  principalGeneration: 3,
  issuedAt: "2026-07-11T08:00:00.000Z",
  expiresAt: "2026-07-11T09:00:00.000Z",
  status: "active",
  kind: "project-launch",
  actions: ["read", "launch"],
} as const;

describe("generation-bound operator authority", () => {
  it("binds a project-launch grant to the current project authority generation", () => {
    expect(parseOperatorCapabilityGrant(projectLaunchGrant)).toStrictEqual(projectLaunchGrant);
  });

  it("rejects a grant after the daemon rotates the project authority generation", () => {
    const authorize: unknown = Reflect.get(protocol, "assertOperatorCapabilityAuthority");
    expect(typeof authorize).toBe("function");
    if (typeof authorize !== "function") return;

    expect(() => Reflect.apply(authorize, undefined, [projectLaunchGrant, {
      projectId: "project_01",
      projectAuthorityGeneration: 8,
      principalGeneration: 3,
    }])).toThrowError(/project authority generation/iu);
  });

  it("carries the daemon-verified project generation in the authenticated operator principal", () => {
    const principal = {
      kind: "operator",
      operatorId: "operator_01",
      projectId: "project_01",
      projectAuthorityGeneration: 7,
      principalGeneration: 3,
    } as const;

    expect(parseProtocolPrincipal(principal)).toStrictEqual(principal);
  });

  it("binds a persisted operator attachment to the project authority generation", () => {
    const attachment = {
      clientId: "client_01",
      projectId: "project_01",
      projectAuthorityGeneration: 7,
      projectSessionId: null,
      generation: 1,
      expiresAt: "2026-07-11T09:00:00.000Z",
    } as const;

    expect(parseOperationResult(FABRIC_OPERATIONS.operatorAttach, attachment)).toStrictEqual(attachment);
  });

  it("publishes the project authority generation as a required capability field", () => {
    const validate = ajv.compile({
      $schema: PROTOCOL_SCHEMA.$schema,
      $ref: "#/$defs/operatorCapability",
      $defs: PROTOCOL_SCHEMA.$defs,
    });

    expect(validate(projectLaunchGrant), ajv.errorsText(validate.errors)).toBe(true);
    const { projectAuthorityGeneration: _omitted, ...unboundGrant } = projectLaunchGrant;
    expect(validate(unboundGrant)).toBe(false);
  });
});

const chairCommand = {
  commandId: "command_chair_01",
  agentId: "agent_chair_01",
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  principalGeneration: 4,
  chairLeaseId: "lease_chair_01",
  chairLeaseGeneration: 5,
  expectedRunRevision: 9,
  expectedRevision: 3,
} as const;

describe("authenticated chair mutation authority", () => {
  it("binds a chair command to the authenticated agent, run, lease and run revision", () => {
    expect(parseChairMutationContext(chairCommand)).toStrictEqual(chairCommand);
  });

  it("rejects an agent command when the authenticated connection is not the current chair", () => {
    const authorize: unknown = Reflect.get(protocol, "assertChairMutationAuthority");
    expect(typeof authorize).toBe("function");
    if (typeof authorize !== "function") return;

    expect(() => Reflect.apply(authorize, undefined, [chairCommand, {
      agentId: "agent_other_01",
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      principalGeneration: 4,
      chairLeaseId: "lease_chair_01",
      chairLeaseGeneration: 5,
      runRevision: 9,
    }])).toThrowError(/authenticated agent.*current chair/iu);
  });
});

const operatorCommand = {
  credential: { capabilityId: "capability_session_01", token: "test-capability-token" },
  commandId: "command_operator_01",
  expectedRevision: 3,
  actor: "operator_01",
  provenance: { kind: "console-direct-input", clientId: "client_01", inputEventId: "input_01" },
  evidenceRefs: [],
} as const;

const membershipBind = {
  origin: "operator",
  command: operatorCommand,
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  expectedMembershipRevision: 3,
  members: [{
    kind: "task",
    membershipId: "membership_task_01",
    coordinationRunId: "run_01",
    taskId: "task_01",
    state: "active",
  }],
} as const;

describe("run-correlated project-session membership", () => {
  it("binds the batch and every run-scoped member to one exact coordination run", () => {
    expect(parseOperationInput(FABRIC_OPERATIONS.membershipBind, membershipBind)).toStrictEqual(membershipBind);
  });

  it("rejects a member ID rebound from another run", () => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.membershipBind, {
      ...membershipBind,
      members: [{ ...membershipBind.members[0], coordinationRunId: "run_02" }],
    })).toThrowError(/coordination run does not match batch/iu);
  });

  it("returns the exact run binding with the committed membership revision", () => {
    const result = {
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      membershipRevision: 4,
      members: membershipBind.members,
    } as const;
    expect(parseOperationResult(FABRIC_OPERATIONS.membershipBind, result)).toStrictEqual(result);
  });

  it("requires and round-trips the provider adapter with a provider-action member", () => {
    const providerMember = {
      kind: "provider-action",
      membershipId: "membership_action_01",
      coordinationRunId: "run_01",
      providerAdapterId: "adapter_01",
      providerActionId: "action_01",
      state: "active",
    } as const;
    const request = { ...membershipBind, members: [providerMember] };
    expect(parseOperationInput(FABRIC_OPERATIONS.membershipBind, request)).toStrictEqual(request);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.membershipBind, {
      ...request,
      members: [{
        kind: "provider-action",
        membershipId: "membership_action_01",
        coordinationRunId: "run_01",
        providerActionId: "action_01",
        state: "active",
      }],
    })).toThrowError(/providerAdapterId/iu);
    const result = {
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      membershipRevision: 4,
      members: [providerMember],
    } as const;
    expect(parseOperationResult(FABRIC_OPERATIONS.membershipBind, result)).toStrictEqual(result);
  });
});

const intakeDraftCreate = {
  command: {
    ...operatorCommand,
    commandId: "command_intake_create_01",
    expectedRevision: 0,
  },
  intakeId: "intake_01",
  dedupeKey: "intake_dedupe_01",
  summary: "Discuss the approved scope.",
  artifactRefs: [],
  gateIds: [],
} as const;

const chairRequest = {
  commandId: "command_request_intake_01",
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  task: {
    taskId: "task_discuss_01",
    taskRevision: 1,
    objective: "Discuss intake 01.",
    baseRevision: "revision_01",
    expectedArtifactPaths: [],
  },
  request: {
    requestRevision: 1,
    messageId: "message_intake_01",
    conversationId: "conversation_intake_01",
    targetAgentId: "agent_chair_01",
    targetProviderSessionRef: "provider_session_chair_01",
    requiresAck: true,
    dedupeKey: "intake_01_discuss",
    responseDeadline: "2026-07-11T10:00:00.000Z",
    callbackId: "callback_intake_01",
    callbackGeneration: 1,
    dependentBarrierId: "barrier_intake_01",
    intakeBinding: {
      intakeId: "intake_01",
      intakeRevision: 2,
      gateIds: [],
      artifactDigests: [],
    },
  },
} as const;

const intakeSubmission = {
  command: {
    ...operatorCommand,
    commandId: "command_intake_submit_01",
    expectedRevision: 1,
  },
  intakeId: "intake_01",
  expectedRevision: 1,
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  summary: "Discuss the approved scope.",
  artifactRefs: [],
  gateIds: [],
  chairRequest,
} as const;

describe("project-bound revisioned intake", () => {
  it("creates a Fabric-owned draft before a session or run exists", () => {
    const operation: unknown = Reflect.get(FABRIC_OPERATIONS, "intakeDraftCreate");
    expect(operation).toBe("fabric.v1.intake.draft.create");
    if (typeof operation !== "string") return;

    expect(parseOperationInput(operation as never, intakeDraftCreate)).toStrictEqual(intakeDraftCreate);
  });

  it("reads the stable project-bound draft without inventing nullable session or run IDs", () => {
    const operation: unknown = Reflect.get(FABRIC_OPERATIONS, "intakeRead");
    expect(operation).toBe("fabric.v1.intake.read");
    if (typeof operation !== "string") return;

    const input = {
      credential: operatorCommand.credential,
      intakeId: "intake_01",
    } as const;
    const result = {
      intakeId: "intake_01",
      projectId: "project_01",
      revision: 1,
      state: "draft",
      dedupeKey: "intake_dedupe_01",
      summary: "Discuss the approved scope.",
      artifactRefs: [],
      gateIds: [],
    } as const;
    expect(parseOperationInput(operation as never, input)).toStrictEqual(input);
    expect(parseOperationResult(operation as never, result)).toStrictEqual(result);
    expect(result).not.toHaveProperty("projectSessionId");
    expect(result).not.toHaveProperty("coordinationRunId");
  });

  it("revisionedly binds the same intake to one exact session and run on chair submission", () => {
    expect(parseOperationInput(FABRIC_OPERATIONS.intakeSubmit, intakeSubmission)).toStrictEqual(intakeSubmission);

    const result = {
      intakeId: "intake_01",
      projectId: "project_01",
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      revision: 2,
      state: "awaiting-chair",
      dedupeKey: "intake_dedupe_01",
      summary: "Discuss the approved scope.",
      artifactRefs: [],
      gateIds: [],
    } as const;
    expect(parseOperationResult(FABRIC_OPERATIONS.intakeSubmit, result)).toStrictEqual(result);
  });

  it("rejects a chair request rebound to another coordination run", () => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.intakeSubmit, {
      ...intakeSubmission,
      chairRequest: { ...chairRequest, coordinationRunId: "run_02" },
    })).toThrowError(/coordination run does not match/iu);
  });

  it("does not accept caller-authoritative project identity on draft creation", () => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.intakeDraftCreate, {
      ...intakeDraftCreate,
      projectId: "project_spoofed",
    })).toThrowError(/unknown field.*projectId/iu);
  });

  it("exposes typed create, read, submit and revise intake operations only when all are granted", () => {
    const allowedOperations = new Set([
      FABRIC_OPERATIONS.intakeDraftCreate,
      FABRIC_OPERATIONS.intakeRead,
      FABRIC_OPERATIONS.intakeSubmit,
      FABRIC_OPERATIONS.intakeRevise,
    ]);
    const client = createOperatorClient({
      features: ["intakes.v1"],
      principal: {
        kind: "operator",
        operatorId: "operator_01",
        projectId: "project_01",
        projectAuthorityGeneration: 7,
        principalGeneration: 3,
      },
      allowedOperations,
      call: () => Promise.reject(new Error("not called")),
      close: () => Promise.resolve(),
    } as never);

    expect(client.intakes?.createDraft).toBeTypeOf("function");
    expect(client.intakes?.read).toBeTypeOf("function");
    expect(client.intakes?.submit).toBeTypeOf("function");
    expect(client.intakes?.revise).toBeTypeOf("function");
  });
});
