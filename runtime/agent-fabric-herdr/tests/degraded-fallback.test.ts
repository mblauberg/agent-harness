import { describe, expect, it } from "vitest";

import type {
  AgentId,
  CanonicalRelativePath,
  MessageId,
  ProviderActionId,
  Sha256Digest,
  TaskId,
  Timestamp,
} from "@local/agent-fabric-protocol";

import {
  collectDegradedArtifact,
  createDegradedArtifactCollectionPlan,
} from "../src/degraded-fallback.js";
import type { ArtifactCollectionPort } from "../src/degraded-fallback.js";

const expectedDigest = `sha256:${"b".repeat(64)}` as Sha256Digest;
const planInput = {
  requestTaskId: "task-review-01" as TaskId,
  requestMessageId: "message-review-01" as MessageId,
  collectorAgentId: "agent-chair-01" as AgentId,
  collectionActionId: "collect-review-01" as ProviderActionId,
  artifact: {
    path: ".agent-run/AFAB-004/reviews/review.md" as CanonicalRelativePath,
    digest: expectedDigest,
  },
  maximumAttempts: 3,
  deadline: "2026-07-11T02:00:00Z" as Timestamp,
};

describe("degraded artifact collection fallback", () => {
  it("collects only the named digest through an explicit bounded step and remains unverified", async () => {
    const plan = createDegradedArtifactCollectionPlan(planInput);
    let attempts = 0;
    const port: ArtifactCollectionPort = {
      inspect: async (artifact, attempt) => {
        attempts += 1;
        expect(artifact).toEqual(planInput.artifact);
        return attempt === 1
          ? { status: "missing" }
          : { status: "present", digest: expectedDigest };
      },
    };

    const result = await collectDegradedArtifact(plan, port, {
      now: () => "2026-07-11T01:00:00Z" as Timestamp,
    });

    expect(attempts).toBe(2);
    expect(plan).toMatchObject({
      mode: "degraded-artifact-collection",
      verification: "unverified",
      reason: "structured-provider-callback-unavailable",
      collection: {
        actionId: planInput.collectionActionId,
        maximumAttempts: 3,
        deadline: planInput.deadline,
      },
      canSatisfyExpectedResult: false,
      canCloseBarrier: false,
    });
    expect(result).toEqual({
      status: "collected-unverified",
      attempts: 2,
      artifact: planInput.artifact,
      deliveryEvidence: "none",
      canSatisfyExpectedResult: false,
      canCloseBarrier: false,
    });
  });

  it("stops at the declared attempt bound", async () => {
    const plan = createDegradedArtifactCollectionPlan({ ...planInput, maximumAttempts: 2 });
    let attempts = 0;

    const result = await collectDegradedArtifact(
      plan,
      {
        inspect: async () => {
          attempts += 1;
          return { status: "missing" };
        },
      },
      { now: () => "2026-07-11T01:00:00Z" as Timestamp },
    );

    expect(attempts).toBe(2);
    expect(result).toMatchObject({ status: "exhausted-unverified", attempts: 2 });
  });

  it("reports a conflicting digest without treating the artifact as a result", async () => {
    const plan = createDegradedArtifactCollectionPlan(planInput);

    const result = await collectDegradedArtifact(
      plan,
      {
        inspect: async () => ({
          status: "present",
          digest: `sha256:${"c".repeat(64)}` as Sha256Digest,
        }),
      },
      { now: () => "2026-07-11T01:00:00Z" as Timestamp },
    );

    expect(result).toMatchObject({
      status: "digest-conflict-unverified",
      attempts: 1,
      expectedDigest,
      canSatisfyExpectedResult: false,
      canCloseBarrier: false,
    });
  });

  it("rejects an unbounded collection plan", () => {
    expect(() =>
      createDegradedArtifactCollectionPlan({ ...planInput, maximumAttempts: Number.POSITIVE_INFINITY }),
    ).toThrow("maximumAttempts");
  });

  it("performs no inspection after the explicit deadline", async () => {
    const plan = createDegradedArtifactCollectionPlan(planInput);
    let attempts = 0;

    const result = await collectDegradedArtifact(
      plan,
      {
        inspect: async () => {
          attempts += 1;
          return { status: "missing" };
        },
      },
      { now: () => planInput.deadline },
    );

    expect(attempts).toBe(0);
    expect(result).toMatchObject({ status: "deadline-expired-unverified", attempts: 0 });
  });
});
