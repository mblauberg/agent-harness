import {
  parseArtifactRef,
  parseIdentifier,
  parseTimestamp,
} from "@local/agent-fabric-protocol";
import type {
  AgentId,
  ArtifactRef,
  MessageId,
  ProviderActionId,
  Sha256Digest,
  TaskId,
  Timestamp,
} from "@local/agent-fabric-protocol";

export type DegradedArtifactCollectionPlanInput = {
  requestTaskId: TaskId;
  requestMessageId: MessageId;
  collectorAgentId: AgentId;
  collectionActionId: ProviderActionId;
  artifact: ArtifactRef;
  maximumAttempts: number;
  deadline: Timestamp;
};

export type DegradedArtifactCollectionPlan = {
  mode: "degraded-artifact-collection";
  verification: "unverified";
  reason: "structured-provider-callback-unavailable";
  requestTaskId: TaskId;
  requestMessageId: MessageId;
  artifact: ArtifactRef;
  collection: {
    kind: "bounded-named-artifact-read";
    actionId: ProviderActionId;
    collectorAgentId: AgentId;
    maximumAttempts: number;
    deadline: Timestamp;
  };
  canSatisfyExpectedResult: false;
  canCloseBarrier: false;
};

export type ArtifactInspection =
  | { status: "present"; digest: Sha256Digest }
  | { status: "missing" }
  | { status: "unavailable"; reason: string };

export interface ArtifactCollectionPort {
  inspect(artifact: ArtifactRef, attempt: number): Promise<ArtifactInspection>;
}

type UnverifiedCollectionSafety = {
  deliveryEvidence: "none";
  canSatisfyExpectedResult: false;
  canCloseBarrier: false;
};

export type DegradedArtifactCollectionResult =
  | ({
      status: "collected-unverified";
      attempts: number;
      artifact: ArtifactRef;
    } & UnverifiedCollectionSafety)
  | ({
      status: "digest-conflict-unverified";
      attempts: number;
      artifact: ArtifactRef;
      expectedDigest: Sha256Digest;
      observedDigest: Sha256Digest;
    } & UnverifiedCollectionSafety)
  | ({
      status: "exhausted-unverified" | "deadline-expired-unverified";
      attempts: number;
      artifact: ArtifactRef;
    } & UnverifiedCollectionSafety);

export type ArtifactCollectionClock = {
  now(): Timestamp;
};

const UNVERIFIED_SAFETY = {
  deliveryEvidence: "none",
  canSatisfyExpectedResult: false,
  canCloseBarrier: false,
} as const;

export function createDegradedArtifactCollectionPlan(
  input: DegradedArtifactCollectionPlanInput,
): DegradedArtifactCollectionPlan {
  if (
    !Number.isSafeInteger(input.maximumAttempts) ||
    input.maximumAttempts < 1 ||
    input.maximumAttempts > 100
  ) {
    throw new TypeError("maximumAttempts must be a safe integer from 1 to 100");
  }

  return {
    mode: "degraded-artifact-collection",
    verification: "unverified",
    reason: "structured-provider-callback-unavailable",
    requestTaskId: parseIdentifier<"TaskId">(input.requestTaskId, "degradedFallback.requestTaskId"),
    requestMessageId: parseIdentifier<"MessageId">(
      input.requestMessageId,
      "degradedFallback.requestMessageId",
    ),
    artifact: parseArtifactRef(input.artifact, "degradedFallback.artifact"),
    collection: {
      kind: "bounded-named-artifact-read",
      actionId: parseIdentifier<"ProviderActionId">(
        input.collectionActionId,
        "degradedFallback.collectionActionId",
      ),
      collectorAgentId: parseIdentifier<"AgentId">(
        input.collectorAgentId,
        "degradedFallback.collectorAgentId",
      ),
      maximumAttempts: input.maximumAttempts,
      deadline: parseTimestamp(input.deadline, "degradedFallback.deadline"),
    },
    canSatisfyExpectedResult: false,
    canCloseBarrier: false,
  };
}

/**
 * Performs only the explicitly bounded artifact checks. A matching digest is
 * useful evidence, but is not a provider callback, delivery ack or barrier result.
 */
export async function collectDegradedArtifact(
  plan: DegradedArtifactCollectionPlan,
  port: ArtifactCollectionPort,
  clock: ArtifactCollectionClock,
): Promise<DegradedArtifactCollectionResult> {
  let completedAttempts = 0;
  for (let attempt = 1; attempt <= plan.collection.maximumAttempts; attempt += 1) {
    const observedNow = parseTimestamp(clock.now(), "degradedFallback.collection.now");
    if (Date.parse(observedNow) >= Date.parse(plan.collection.deadline)) {
      return {
        status: "deadline-expired-unverified",
        attempts: completedAttempts,
        artifact: plan.artifact,
        ...UNVERIFIED_SAFETY,
      };
    }

    const observation = await port.inspect(plan.artifact, attempt);
    completedAttempts = attempt;
    if (observation.status !== "present") continue;
    if (observation.digest !== plan.artifact.digest) {
      return {
        status: "digest-conflict-unverified",
        attempts: completedAttempts,
        artifact: plan.artifact,
        expectedDigest: plan.artifact.digest,
        observedDigest: observation.digest,
        ...UNVERIFIED_SAFETY,
      };
    }
    return {
      status: "collected-unverified",
      attempts: completedAttempts,
      artifact: plan.artifact,
      ...UNVERIFIED_SAFETY,
    };
  }

  return {
    status: "exhausted-unverified",
    attempts: completedAttempts,
    artifact: plan.artifact,
    ...UNVERIFIED_SAFETY,
  };
}
