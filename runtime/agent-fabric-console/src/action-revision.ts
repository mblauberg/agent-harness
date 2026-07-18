import type { OperatorActionIntent } from "@local/agent-fabric-protocol";

export function operatorIntentRevision(intent: OperatorActionIntent): number | null {
  if (intent.kind === "control") return intent.target.expectedRevision;
  if (intent.kind === "project-session-launch") return intent.expectedSessionRevision;
  if (intent.kind === "chair-bridge-recovery") return intent.expectedBridgeRevision;
  if (intent.kind === "project-session-drain" || intent.kind === "project-session-stop") {
    return intent.expectedSessionRevision;
  }
  if (intent.kind === "daemon-drain" || intent.kind === "daemon-stop") {
    return intent.expectedGlobalStateRevision;
  }
  if (intent.kind === "registered-external-effect") return intent.expectedTargetRevision;
  if (intent.kind === "promotion") return intent.expectedGateRevision;
  // Git uses immutable object and repository digests rather than a numeric
  // target revision. Its production planner must obtain a typed state revision
  // from the operation boundary before enabling it.
  return null;
}
