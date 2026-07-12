import { describe, expect, it } from "vitest";

import type {
  AgentId,
  BarrierId,
  CoordinationRunId,
  MessageId,
  ProjectId,
  ProjectSessionId,
  ProviderActionId,
  Sha256Digest,
  TaskId,
} from "@local/agent-fabric-protocol";

import { DirectSteerRejectedError, DirectSteerService } from "../src/direct-steer.js";
import { HerdrAdapter, digestHerdrIntent } from "../src/herdr-adapter.js";
import type {
  DirectSteerIntent,
  DirectSteerRequest,
  FabricActionJournalPort,
  FabricDirectSteerPort,
  FabricSteerReference,
  FabricSteerReferenceValidation,
  HerdrActionRecord,
  HerdrControlPort,
  HerdrPaneRef,
} from "../src/contracts.js";

const actionId = "herdr-steer-01" as ProviderActionId;
const targetAgentId = "agent-peer-01" as AgentId;
const paneRef = "window-2:pane-1" as HerdrPaneRef;
const reference: FabricSteerReference = {
  kind: "message",
  projectId: "project-01" as ProjectId,
  projectSessionId: "session-01" as ProjectSessionId,
  coordinationRunId: "run-01" as CoordinationRunId,
  taskId: "task-01" as TaskId,
  messageId: "message-steer-01" as MessageId,
  expectedRevision: 4,
};
const request: DirectSteerRequest = {
  actionId,
  fireAndForget: true,
  targetAgentId,
  paneRef,
  reference,
  prompt: "Pause after the current check.",
};
const referenceDigest = `sha256:${"a".repeat(64)}` as Sha256Digest;
const validReference: FabricSteerReferenceValidation = {
  status: "valid",
  referenceDigest,
  targetAgentId,
  purpose: "steer",
  requiresAck: false,
  expectsResult: false,
  dependentBarrierId: null,
};

describe("Fabric-backed direct Herdr steering", () => {
  it("rejects an unknown Fabric reference before commit or pane injection", async () => {
    const fixture = createFixture({
      status: "rejected",
      code: "unknown-reference",
      reason: "message does not exist in the selected project session",
    });

    await expect(fixture.service.dispatch(request)).rejects.toMatchObject({
      name: "DirectSteerRejectedError",
      code: "unknown-reference",
    });
    expect(fixture.prepares).toEqual([]);
    expect(fixture.injections).toEqual([]);
  });

  it.each([
    [{ ...validReference, expectsResult: true }, "answer-bearing-reference"],
    [{ ...validReference, requiresAck: true }, "acknowledgement-required"],
    [
      { ...validReference, dependentBarrierId: "barrier-01" as BarrierId },
      "completion-barrier-bound",
    ],
    [{ ...validReference, purpose: "request" as const }, "answer-bearing-reference"],
  ] as const)("rejects result-bearing semantics with %s", async (validation, expectedCode) => {
    const fixture = createFixture(validation);

    await expect(fixture.service.dispatch(request)).rejects.toMatchObject({ code: expectedCode });
    expect(fixture.prepares).toEqual([]);
    expect(fixture.injections).toEqual([]);
  });

  it("requires explicit fire-and-forget acknowledgement", async () => {
    const fixture = createFixture(validReference);

    await expect(
      fixture.service.dispatch({ ...request, fireAndForget: false }),
    ).rejects.toBeInstanceOf(DirectSteerRejectedError);
    expect(fixture.validations).toBe(0);
    expect(fixture.injections).toEqual([]);
  });

  it.each(["", "bad\u001bsequence", "x".repeat(4_097), `afop_${"x".repeat(32)}`])(
    "rejects unsafe or unbounded prompt text before validation",
    async (prompt) => {
      const fixture = createFixture(validReference);

      await expect(fixture.service.dispatch({ ...request, prompt })).rejects.toMatchObject({
        code: "invalid-prompt",
      });
      expect(fixture.validations).toBe(0);
      expect(fixture.injections).toEqual([]);
    },
  );

  it("rejects a target that differs from the authoritative reference binding", async () => {
    const fixture = createFixture({
      ...validReference,
      targetAgentId: "agent-other" as AgentId,
    });

    await expect(fixture.service.dispatch(request)).rejects.toMatchObject({ code: "target-mismatch" });
    expect(fixture.prepares).toEqual([]);
    expect(fixture.injections).toEqual([]);
  });

  it("commits a validated stable action before injection and never claims delivery", async () => {
    const fixture = createFixture(validReference);

    const result = await fixture.service.dispatch(request);

    expect(fixture.prepares).toHaveLength(1);
    expect(fixture.injections).toEqual(["herdr-steer-01:dispatched"]);
    expect(result).toMatchObject({
      status: "terminal",
      receipt: {
        status: "dispatched-unconfirmed",
        operation: "steer.inject-fire-and-forget",
        referenceValidation: "verified",
        deliveryEvidence: "none",
        canSatisfyExpectedResult: false,
        canCloseBarrier: false,
      },
    });
  });
});

function createFixture(validation: FabricSteerReferenceValidation): {
  service: DirectSteerService;
  prepares: DirectSteerIntent[];
  injections: string[];
  validations: number;
} {
  let record: HerdrActionRecord | null = null;
  const prepares: DirectSteerIntent[] = [];
  const injections: string[] = [];
  let validations = 0;
  const journal: FabricActionJournalPort = {
    readAction: async () => record,
    markDispatched: async (_requestedActionId, expectedRevision) => {
      if (record === null) throw new Error("missing prepared action");
      expect(expectedRevision).toBe(record.revision);
      record = { ...record, revision: record.revision + 1, status: "dispatched" };
      return record;
    },
    completeAction: async (_requestedActionId, expectedRevision, receipt) => {
      if (record === null) throw new Error("missing dispatched action");
      expect(expectedRevision).toBe(record.revision);
      record = { ...record, revision: record.revision + 1, status: "terminal", receipt };
      return record;
    },
    markAmbiguous: async () => {
      throw new Error("not expected");
    },
  };
  const fabric: FabricDirectSteerPort = {
    validateSteerReference: async (receivedReference) => {
      validations += 1;
      expect(receivedReference).toEqual(reference);
      return validation;
    },
    prepareDirectSteerAction: async (receivedActionId, intent) => {
      expect(receivedActionId).toBe(actionId);
      prepares.push(intent);
      record = {
        actionId: receivedActionId,
        revision: 1,
        intentDigest: digestHerdrIntent(intent),
        status: "prepared",
      };
      return record;
    },
  };
  const control = controlFixture(async (receivedActionId, intent) => {
    if (record === null) throw new Error("action was not prepared");
    expect(intent.validatedReferenceDigest).toBe(referenceDigest);
    injections.push(`${receivedActionId}:${record.status}`);
  });
  const adapter = new HerdrAdapter({
    journal,
    control,
    presence: { observeAgent: async () => unexpected() },
  });
  const service = new DirectSteerService({ fabric, adapter });
  return {
    service,
    prepares,
    injections,
    get validations() {
      return validations;
    },
  };
}

function controlFixture(
  inject: (actionId: ProviderActionId, intent: DirectSteerIntent) => Promise<void>,
): HerdrControlPort {
  return {
    lookupAction: async () => ({ status: "unknown" }),
    ensureConsolePane: async () => unexpected(),
    ensureAgentPane: async () => unexpected(),
    arrangePanes: async () => unexpected(),
    projectAgentMetadata: async () => unexpected(),
    projectAttention: async () => unexpected(),
    focusTarget: async () => unexpected(),
    wakeAgent: async () => unexpected(),
    showNotification: async () => unexpected(),
    injectDirectSteer: inject,
  };
}

function unexpected(): never {
  throw new Error("unexpected call");
}
