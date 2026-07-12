import { describe, expect, it } from "vitest";

import {
  parseArtifactRef,
  parseResourceReservationRequest,
  parseTaskCompleteWithReply,
  parseTimestamp,
} from "../src/index.js";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("canonical protocol primitives", () => {
  it.each(["/absolute/file", "../escape", "a/../escape", "a\\windows", "a/*/glob"])(
    "rejects non-canonical artifact path %s",
    (path) => {
      expect(() => parseArtifactRef({ path, digest }, "artifact")).toThrowError(/canonical workspace-relative path/);
    },
  );

  it.each(["July 11 2026", "2026-07-11", "2026-02-30T00:00:00Z", "2026-07-11 10:00:00Z"])(
    "rejects non-RFC3339 timestamp %s",
    (timestamp) => {
      expect(() => parseTimestamp(timestamp, "timestamp")).toThrowError(/RFC3339/);
    },
  );

  it("bounds reply bodies by UTF-8 bytes rather than code points", () => {
    const completion = {
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
        body: "😀".repeat(1025),
        artifactRefs: [],
      },
      terminalResult: {
        status: "complete",
        summary: "done",
        completedAt: "2026-07-11T10:00:00Z",
      },
    };

    expect(() => parseTaskCompleteWithReply(completion)).toThrowError(/at most 4096 UTF-8 bytes/);
  });
});

const baseReservation = {
  commandId: "command_01",
  reservationId: "reservation_01",
  projectSessionId: "ps_01",
  path: [
    { kind: "project", scopeId: "scope_project", projectId: "project_01" },
    { kind: "project-session", scopeId: "scope_session", projectId: "project_01", projectSessionId: "ps_01" },
    { kind: "coordination-run", scopeId: "scope_run", projectSessionId: "ps_01", coordinationRunId: "run_01" },
    { kind: "team", scopeId: "scope_team", coordinationRunId: "run_01", teamId: "team_01" },
    { kind: "agent", scopeId: "scope_agent", teamId: "team_01", agentId: "agent_01" },
  ],
  amounts: { concurrent_turns: 1 },
} as const;

describe("resource ancestry", () => {
  it.each([
    [1, { kind: "project-session", scopeId: "scope_session", projectId: "project_other", projectSessionId: "ps_01" }],
    [2, { kind: "coordination-run", scopeId: "scope_run", projectSessionId: "ps_other", coordinationRunId: "run_01" }],
    [3, { kind: "team", scopeId: "scope_team", coordinationRunId: "run_other", teamId: "team_01" }],
    [4, { kind: "agent", scopeId: "scope_agent", teamId: "team_other", agentId: "agent_01" }],
  ])("rejects mismatched ancestor at path index %i", (index, replacement) => {
    const path = [...baseReservation.path];
    path[index] = replacement as never;

    expect(() => parseResourceReservationRequest({ ...baseReservation, path })).toThrowError(/ancestor identity mismatch/);
  });
});
