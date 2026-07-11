import { describe, expect, it, vi } from "vitest";

import {
  FABRIC_OPERATIONS,
  OPERATION_CONTRACT_FIXTURES,
  type NegotiatedOperatorClient,
  type OperatorCapabilityCredential,
  type OperatorProjectionSnapshot,
  type ProjectId,
  type ProjectSessionId,
  type Sha256Digest,
  type Timestamp,
} from "@local/agent-fabric-protocol";

import { createProductionConsoleWorkflowPlanner } from "../src/workflow.js";
import { createEmptyViewPages, revisionFromProtocol } from "../src/model.js";
import type { FabricConsoleDataset } from "../src/protocol-adapter.js";

const credential = {
  capabilityId: "capability_workflow",
  token: "afop_secret_must_not_render",
} as OperatorCapabilityCredential;
const projectId = "project_workflow" as ProjectId;
const projectSessionId = "ps_workflow" as ProjectSessionId;
const digest = (`sha256:${"a".repeat(64)}`) as Sha256Digest;
const observedAt = "2026-07-12T00:00:00.000Z" as Timestamp;

function dataset(withSession = true): FabricConsoleDataset {
  const snapshot: OperatorProjectionSnapshot = {
    schemaVersion: 1,
    snapshotRevision: 11,
    readTransactionId: "read_workflow",
    project: {
      freshness: "live",
      source: "fabric",
      revision: 3,
      observedAt,
      value: { projectId, canonicalRoot: "/repo" },
    },
    session: withSession
      ? {
          freshness: "live",
          source: "fabric",
          revision: 8,
          observedAt,
          value: {
            projectSessionId,
            projectId,
            mode: "coordinated",
            state: "active",
            revision: 8,
            generation: 2,
            authorityRef: digest,
            budgetRef: "budget_workflow",
            launchPacketRef: { path: "launch/packet.json" as never, digest },
            membershipRevision: 1,
            origin: { kind: "operator-launch", operatorId: "operator_workflow" as never },
          },
        }
      : {
          freshness: "live",
          source: "fabric",
          revision: 3,
          observedAt,
          value: null,
        },
    runs: {
      freshness: "live",
      source: "fabric",
      revision: 4,
      observedAt,
      value: [],
    },
    attention: {
      freshness: "live",
      source: "fabric",
      revision: 1,
      observedAt,
      value: [],
    },
    capacity: {
      freshness: "live",
      source: "fabric",
      revision: 11,
      observedAt,
      value: {},
    },
    cursor: 0,
    stateDigest: digest,
  };
  return {
    connection: { state: "live", compatibility: { mode: "current" } },
    snapshot,
    snapshotRevision: revisionFromProtocol(11),
    cursor: 0,
    pages: createEmptyViewPages(),
    loadedAtMs: Date.parse(observedAt),
    canMutate: true,
  };
}

function client(overrides: Partial<NegotiatedOperatorClient> = {}): NegotiatedOperatorClient {
  return {
    kind: "operator",
    features: [],
    operations: {},
    close: async () => {},
    ...overrides,
  };
}

function envelope(kind: string, request: unknown): string {
  return JSON.stringify({ kind, request });
}

function sessionBoundFixture(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value)
      .replaceAll('"ps_01"', `"${projectSessionId}"`)
      .replaceAll('"project_01"', `"${projectId}"`),
  );
}

describe("typed Console workflow planner", () => {
  it("reviews then creates and attaches a project session through the typed client", async () => {
    const create = vi.fn(async (request) => ({
      ...request,
      state: "draft" as const,
      revision: 1,
      membershipRevision: 1,
      origin: { kind: "operator-launch" as const, operatorId: "operator_workflow" as never },
    }));
    const planner = createProductionConsoleWorkflowPlanner({
      client: client({ projectSessions: { create, get: vi.fn(), transition: vi.fn(), close: vi.fn(), bindMembership: vi.fn() } as never }),
      credential,
      operatorId: "operator_workflow" as never,
      clientId: "console_workflow" as never,
      projectId,
    });
    const raw = envelope("project-session-create", {
      projectSessionId,
      projectId,
      mode: "coordinated",
      generation: 1,
      authorityRef: digest,
      budgetRef: "budget_workflow",
      launchPacketRef: { path: "launch/packet.json", digest },
    });

    const review = await planner.prepare({ raw, dataset: dataset(false), eventId: "palette-create" });
    expect(create).not.toHaveBeenCalled();
    expect(review).toMatchObject({
      kind: "project-session-create",
      stage: "review",
      expectedRevision: "3",
      consequenceClass: "consequential",
      confirmationMode: "explicit",
    });
    expect(JSON.stringify(review)).not.toContain(credential.token);

    const armed = planner.arm(review, "workflow-arm");
    const committed = await planner.commit({ review: armed, eventId: "workflow-confirm" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      projectSessionId,
      command: expect.objectContaining({
        credential,
        expectedRevision: 3,
        provenance: expect.objectContaining({ inputEventId: "workflow-confirm" }),
      }),
    }));
    expect(committed.reconnectRequired).toBe(true);
    expect(committed.review).toMatchObject({ stage: "committed", result: expect.stringContaining(projectSessionId) });
  });

  it("dispatches intake discussion/revision, gate decision and delivery acceptance only after confirmation", async () => {
    const createDraft = vi.fn(async () => OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.intakeDraftCreate].result as never);
    const submit = vi.fn(async () => OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.intakeSubmit].result as never);
    const revise = vi.fn(async () => OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.intakeRevise].result as never);
    const resolve = vi.fn(async () => OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.scopedGateResolve].result as never);
    const close = vi.fn(async () => OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.projectSessionClose].result as never);
    const gateRead = vi.fn(async () => ({
      status: "current" as const,
      gate: sessionBoundFixture(OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.scopedGateResolve].result) as never,
      readTransactionId: "gate-read",
      stateDigest: digest,
    }));
    const planner = createProductionConsoleWorkflowPlanner({
      client: client({
        intakes: { createDraft, read: vi.fn(), submit, revise },
        gates: { create: vi.fn(), resolve },
        projectSessions: { create: vi.fn(), get: vi.fn(), transition: vi.fn(), close, bindMembership: vi.fn() },
        console: {
          readOnly: false,
          launchAvailable: true,
          actions: { preview: vi.fn(), commit: vi.fn(), status: vi.fn(), reconcile: vi.fn() },
          gates: { read: gateRead },
          projection: { viewPage: vi.fn(), readDetail: vi.fn() },
        },
      }),
      credential,
      operatorId: "operator_workflow" as never,
      clientId: "console_workflow" as never,
      projectId,
    });

    const fixtures = [
      ["intake-draft-create", OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.intakeDraftCreate].input, createDraft],
      ["intake-submit", OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.intakeSubmit].input, submit],
      ["intake-revise", OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.intakeRevise].input, revise],
      ["scoped-gate-resolve", OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.scopedGateResolve].input, resolve],
      ["project-session-close", OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.projectSessionClose].input, close],
    ] as const;

    for (const [kind, fixture, dispatch] of fixtures) {
      const request = { ...(sessionBoundFixture(fixture) as Record<string, unknown>) };
      delete request.command;
      if (kind === "intake-revise") delete request.origin;
      if (kind === "scoped-gate-resolve") delete request.decisionEvidence;
      const review = await planner.prepare({
        raw: envelope(kind, request),
        dataset: dataset(),
        eventId: `palette-${kind}`,
      });
      expect(dispatch).not.toHaveBeenCalled();
      if (kind === "scoped-gate-resolve") {
        expect(review.summary).toContain("Proceed?");
        expect(review.details).toContainEqual({
          label: "Consequence",
          value: "Implementation continues.",
        });
        expect(review.evidence).toContain(`docs/spec.md@${digest}`);
      }
      const result = await planner.commit({ review: planner.arm(review, `arm-${kind}`), eventId: `confirm-${kind}` });
      expect(result.review.stage).toBe("committed");
      expect(dispatch).toHaveBeenCalledTimes(1);
    }
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
      decisionEvidence: {
        kind: "typed-console",
        confirmationCommandId: expect.stringMatching(/^console_[a-f0-9]{48}$/u),
      },
    }));
  });

  it("uses the daemon's Preview to review and commit launch/watch/control/stop actions", async () => {
    const actionFixture = OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.operatorActionPreview];
    const previewResult = {
      ...(actionFixture.result as Record<string, unknown>),
      confirmationMode: "echo",
    };
    const preview = vi.fn(async () => previewResult as never);
    const commit = vi.fn(async () => OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.operatorActionCommit].result as never);
    const planner = createProductionConsoleWorkflowPlanner({
      client: client({
        console: {
          readOnly: false,
          launchAvailable: true,
          actions: { preview, commit, status: vi.fn(), reconcile: vi.fn() },
          gates: { read: vi.fn() },
          projection: { viewPage: vi.fn(), readDetail: vi.fn() },
        },
      }),
      credential,
      operatorId: "operator_workflow" as never,
      clientId: "console_workflow" as never,
      projectId,
    });
    const fixtureInput = actionFixture.input as Record<string, unknown>;
    const raw = envelope("operator-action", { intent: fixtureInput.intent });

    const review = await planner.prepare({ raw, dataset: dataset(), eventId: "palette-action" });
    expect(preview).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(review).toMatchObject({ stage: "review", source: "daemon-preview" });

    const armed = planner.arm(review, "action-arm");
    await expect(planner.commit({
      review: { ...armed, confirmationMode: "explicit" },
      eventId: "forged-action-confirm",
    })).rejects.toThrow("stale or not distinct");
    await planner.commit({
      review: armed,
      eventId: "action-confirm",
      echoText: armed.previewDigest,
    });
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      previewId: expect.any(String),
      confirmation: expect.objectContaining({ kind: "echo" }),
    }));
  });

  it("rejects unsupported or changed payloads before dispatch and never treats arbitrary methods as workflow", async () => {
    const planner = createProductionConsoleWorkflowPlanner({
      client: client(),
      credential,
      operatorId: "operator_workflow" as never,
      clientId: "console_workflow" as never,
      projectId,
    });
    await expect(planner.prepare({
      raw: JSON.stringify({ kind: "arbitrary-rpc", request: { method: "fabric.v1.any" } }),
      dataset: dataset(),
      eventId: "palette-unsafe",
    })).rejects.toThrow("unsupported Console workflow");
    await expect(planner.prepare({
      raw: JSON.stringify({ kind: "project-session-close", request: {}, extra: true }),
      dataset: dataset(),
      eventId: "palette-extra",
    })).rejects.toThrow("exactly kind and request");
    await expect(planner.prepare({
      raw: JSON.stringify({
        kind: "project-session-close",
        request: {
          projectSessionId,
          to: "closed",
          terminalPath: { kind: "cancelled", reason: "fixture" },
          unexpected: "must fail before Review",
        },
      }),
      dataset: dataset(),
      eventId: "palette-invalid-request",
    })).rejects.toThrow();
  });
});
