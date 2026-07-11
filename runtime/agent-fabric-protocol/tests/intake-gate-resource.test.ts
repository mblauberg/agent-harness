import { describe, expect, it } from "vitest";

import {
  parseIntakeSubmission,
  parseResourceReservationRequest,
  parseScopedGate,
} from "../src/index.js";

const artifact = {
  path: "docs/specs/05-project-fabric-console.md",
  digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
} as const;

const taskRequest = {
  commandId: "command_request_intake",
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  task: {
    taskId: "task_discuss_01",
    taskRevision: 1,
    objective: "Discuss intake 01.",
    baseRevision: "c2fc623",
    expectedArtifactPaths: [artifact.path],
  },
  request: {
    requestRevision: 1,
    messageId: "message_intake_01",
    conversationId: "conversation_intake_01",
    targetAgentId: "agent_chair",
    targetProviderSessionRef: "session_chair",
    requiresAck: true,
    dedupeKey: "intake-01-discuss",
    responseDeadline: "2026-07-11T10:00:00.000Z",
    callbackId: "callback_intake_01",
    callbackGeneration: 1,
    dependentBarrierId: "barrier_intake_01",
    intakeBinding: {
      intakeId: "intake_01",
      intakeRevision: 1,
      gateIds: ["gate_scope_01"],
      artifactDigests: [artifact.digest],
    },
  },
} as const;

const intakeSubmission = {
  intake: {
    intakeId: "intake_01",
    projectSessionId: "ps_01",
    revision: 1,
    state: "awaiting-chair",
    dedupeKey: "intake-01-submit",
    summary: "Implement the approved console spec.",
    artifactRefs: [artifact],
    gateIds: ["gate_scope_01"],
  },
  chairRequest: taskRequest,
} as const;

describe("revisioned intake schema", () => {
  it("accepts one intake whose correlated request binds its exact revision and evidence", () => {
    expect(parseIntakeSubmission(intakeSubmission)).toStrictEqual(intakeSubmission);
  });

  it("rejects a correlated request bound to a stale intake revision", () => {
    expect(() => parseIntakeSubmission({
      ...intakeSubmission,
      chairRequest: {
        ...taskRequest,
        request: {
          ...taskRequest.request,
          intakeBinding: { ...taskRequest.request.intakeBinding, intakeRevision: 2 },
        },
      },
    })).toThrowError(/intake revision does not match/);
  });

  it("rejects a correlated request that omits an intake artifact digest", () => {
    expect(() => parseIntakeSubmission({
      ...intakeSubmission,
      chairRequest: {
        ...taskRequest,
        request: {
          ...taskRequest.request,
          intakeBinding: { ...taskRequest.request.intakeBinding, artifactDigests: [] },
        },
      },
    })).toThrowError(/artifact digests do not match/);
  });
});

const scopedGate = {
  gateId: "gate_scope_01",
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  scope: { kind: "subtree", rootTaskId: "task_root" },
  affectedTaskIds: ["task_root", "task_child"],
  dependencyRevision: 7,
  blockedOperationIds: ["fabric.v1.task.complete-with-reply"],
  enforcementPoints: ["task-readiness", "operation", "scoped-barrier"],
  question: "Accept the architecture?",
  reason: "One-way decision.",
  options: ["Accept", "Request changes"],
  recommendation: "Accept",
  consequences: ["Implementation may begin."],
  evidenceRefs: [artifact],
  revision: 2,
  createdByRef: "operator_01",
  expectedApproverRef: "operator_01",
  status: "pending",
} as const;

describe("scoped gate schema", () => {
  it("accepts a subtree gate with all three explicit enforcement points", () => {
    expect(parseScopedGate(scopedGate)).toStrictEqual(scopedGate);
  });

  it("rejects a release gate without exact artifact/action/target binding", () => {
    expect(() => parseScopedGate({
      ...scopedGate,
      scope: { kind: "release" },
    })).toThrowError(/releaseBinding is required/);
  });

  it("rejects an approved gate without an authenticated human resolver", () => {
    expect(() => parseScopedGate({ ...scopedGate, status: "approved" })).toThrowError(/resolution is required/);
  });
});

const reservationRequest = {
  commandId: "command_reserve_01",
  reservationId: "reservation_01",
  projectSessionId: "ps_01",
  path: [
    { kind: "project", scopeId: "resource_project", projectId: "project_01" },
    {
      kind: "project-session",
      scopeId: "resource_session",
      projectId: "project_01",
      projectSessionId: "ps_01",
    },
    {
      kind: "coordination-run",
      scopeId: "resource_run",
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
    },
  ],
  amounts: {
    concurrent_turns: 2,
    "input_tokens:openai": 1000,
  },
  writerAdmission: {
    repositoryRoot: "/Users/user/.agents",
    worktreePath: "/Users/user/.agents/.worktrees/spec05-protocol",
    sourcePrefixes: ["runtime/agent-fabric-protocol"],
    writerGeneration: 1,
  },
} as const;

describe("hierarchical resource reservation schema", () => {
  it("accepts an ancestor path and bounded writer admission", () => {
    expect(parseResourceReservationRequest(reservationRequest)).toStrictEqual(reservationRequest);
  });

  it("rejects unknown usage as a new reservation amount", () => {
    expect(() => parseResourceReservationRequest({
      ...reservationRequest,
      amounts: { concurrent_turns: "unknown" },
    })).toThrowError(/must be a non-negative safe integer/);
  });

  it("rejects a writer path outside the repository-owned worktree directory", () => {
    expect(() => parseResourceReservationRequest({
      ...reservationRequest,
      writerAdmission: { ...reservationRequest.writerAdmission, worktreePath: "/tmp/writer" },
    })).toThrowError(/must be under repositoryRoot.*\.worktrees/);
  });
});
