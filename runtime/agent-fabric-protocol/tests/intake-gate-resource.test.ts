import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  parseIntakeSubmission,
  parseResourceReservationRequest,
  parseScopedGate,
} from "../src/index.js";

const artifact = {
  path: "docs/specs/05-project-fabric-console.md",
  digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
} as const;

const operatorCommand = {
  credential: { capabilityId: "capability_01", token: "test-capability-token" },
  commandId: "command_intake_01",
  expectedRevision: 1,
  actor: "operator_01",
  provenance: { kind: "console-direct-input", clientId: "client_01", inputEventId: "input_01" },
  evidenceRefs: [artifact],
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
      intakeRevision: 2,
      gateIds: ["gate_scope_01"],
      artifactDigests: [artifact.digest],
    },
  },
} as const;

const intakeSubmission = {
  command: operatorCommand,
  intakeId: "intake_01",
  expectedRevision: 1,
  projectSessionId: "ps_01",
  coordinationRunId: "run_01",
  summary: "Implement the approved console spec.",
  artifactRefs: [artifact],
  gateIds: ["gate_scope_01"],
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
          intakeBinding: { ...taskRequest.request.intakeBinding, intakeRevision: 3 },
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

const repositoryRoot = realpathSync(mkdtempSync(join(tmpdir(), "protocol-resource-")));
mkdirSync(join(repositoryRoot, ".worktrees"));
afterAll(() => rmSync(repositoryRoot, { recursive: true, force: true }));

const reservationRequest = {
  commandId: "command_reserve_01",
  reservationId: "reservation_01",
  projectSessionId: "ps_01",
  taskId: "task_01",
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
    repositoryRoot,
    worktreePath: join(repositoryRoot, ".worktrees", "spec05-protocol"),
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
      writerAdmission: { ...reservationRequest.writerAdmission, worktreePath: join(repositoryRoot, "writer") },
    })).toThrowError(/direct child under repositoryRoot.*\.worktrees/);
  });
});
