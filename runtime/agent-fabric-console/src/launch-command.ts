import { createHash } from "node:crypto";

import type {
  ArtifactRef,
  CommandId,
  OperatorId,
  ProjectId,
  ProjectSessionId,
} from "@local/agent-fabric-protocol";

export function consoleLaunchCommandId(input: Readonly<{
  phase: "commit";
  operatorId: OperatorId;
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  sessionGeneration: number;
  launchPacketRef: ArtifactRef;
}>): CommandId {
  const digest = createHash("sha256")
    .update([
      "console-launch-command.v1",
      input.phase,
      input.operatorId,
      input.projectId,
      input.projectSessionId,
      String(input.sessionGeneration),
      input.launchPacketRef.path,
      input.launchPacketRef.digest,
    ].join("\0"))
    .digest("hex")
    .slice(0, 48);
  return `console_launch_${digest}` as CommandId;
}

export function consoleImplementationCommandId(input: Readonly<{
  operatorId: OperatorId;
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  sessionGeneration: number;
  acceptedScopeRef: ArtifactRef;
  launchPacketRef: ArtifactRef;
  resourcePlanRef: ArtifactRef;
}>): CommandId {
  const digest = createHash("sha256")
    .update([
      "console-implementation-command.v1",
      input.operatorId,
      input.projectId,
      input.projectSessionId,
      String(input.sessionGeneration),
      input.acceptedScopeRef.path,
      input.acceptedScopeRef.digest,
      input.launchPacketRef.path,
      input.launchPacketRef.digest,
      input.resourcePlanRef.path,
      input.resourcePlanRef.digest,
    ].join("\0"))
    .digest("hex")
    .slice(0, 48);
  return `console_implement_${digest}` as CommandId;
}
