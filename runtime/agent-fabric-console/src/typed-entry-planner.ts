import { createHash } from "node:crypto";

import type {
  CommandId,
  NegotiatedOperatorClient,
  OperatorCapabilityCredential,
  OperatorClientId,
  OperatorId,
  ProjectId,
  ProjectSession,
  PromotionIntent,
} from "@local/agent-fabric-protocol";

import type { ConsoleInspectionBinding, FabricConsoleDataset } from "./protocol-adapter.js";
import {
  ConsoleGuidedInputError,
  type ConsoleTypedEntryPlanner,
} from "./workflow.js";

export type ProductionConsoleTypedEntryPlannerOptions = Readonly<{
  client: NegotiatedOperatorClient;
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  operatorId: OperatorId;
  clientId: OperatorClientId;
}>;

export type ProductionConsoleTypedEntryPlannerFactory = (
  options: ProductionConsoleTypedEntryPlannerOptions,
) => ConsoleTypedEntryPlanner;

const GIT_PREPARATION_UNAVAILABLE =
  "daemon-git-intent-preparation-unavailable";

function launchPreparationCommandId(clientId: OperatorClientId, eventId: string): CommandId {
  return `console_${createHash("sha256")
    .update(`${clientId}\0launch-preview\0${eventId}`)
    .digest("hex")
    .slice(0, 48)}` as CommandId;
}

function assertNoLaunchFields(fields: Readonly<Record<string, string>>): void {
  if (Object.keys(fields).length !== 0) {
    throw new ConsoleGuidedInputError(
      "CONSOLE_GUIDED_LAUNCH_FIELDS_INVALID",
      "guided Launch uses the reviewed session launch packet and accepts no fields",
    );
  }
}

function exactProjectBinding(
  dataset: FabricConsoleDataset,
  binding: ConsoleInspectionBinding,
  projectId: ProjectId,
): ProjectSession {
  if (
    dataset.connection.state !== "live" ||
    !dataset.canMutate ||
    binding.view !== "project" ||
    dataset.snapshotRevision !== binding.projectionRevision
  ) {
    throw new Error("typed entry requires the exact live Project row");
  }
  const row = dataset.pages.project.rows.find(
    (candidate) => candidate.stableId === binding.itemId,
  );
  const project = dataset.snapshot?.project;
  const session = dataset.snapshot?.session;
  if (
    row === undefined ||
    row.revision !== binding.itemRevision ||
    row.freshness.state !== "live" ||
    row.detailRef?.kind !== "project" ||
    row.detailRef.projectId !== projectId ||
    project?.freshness !== "live" ||
    project.value.projectId !== projectId ||
    session?.freshness !== "live" ||
    session.value === null ||
    session.value.projectId !== projectId
  ) {
    throw new Error("typed entry requires the exact live Project row");
  }
  return session.value;
}

function exactGateField(fields: Readonly<Record<string, string>>): string {
  if (Object.keys(fields).sort().join(",") !== "gate") {
    throw new ConsoleGuidedInputError(
      "CONSOLE_GUIDED_PROMOTION_FIELDS_INVALID",
      "guided Promotion requires exactly gate=<stable-id>",
    );
  }
  const gateId = fields.gate;
  if (gateId === undefined || gateId.length === 0) {
    throw new ConsoleGuidedInputError(
      "CONSOLE_GUIDED_REQUIRES_GATE",
      "guided Promotion requires exactly gate=<stable-id>",
    );
  }
  return gateId;
}

/**
 * Builds only intents whose security bindings can be obtained from an
 * authoritative daemon read. Operators never hand-author CAS digests.
 */
export const createProductionConsoleTypedEntryPlanner:
ProductionConsoleTypedEntryPlannerFactory = (options) => {
  const gateRead = options.client.console?.gates.read;
  const actionPreviewAvailable = options.client.console?.readOnly === false;
  const launchPrepare = options.client.projectSessions?.prepareLaunch;
  const launchCapability = launchPrepare === undefined
    ? { state: "unavailable" as const, reason: "project-session-launch-prepare-unavailable" }
    : options.client.console?.launchAvailable !== true
      ? { state: "unavailable" as const, reason: "launch-custody-unavailable" }
      : !actionPreviewAvailable || options.client.console?.actions === undefined
        ? { state: "unavailable" as const, reason: "operator-action-commit-unavailable" }
        : { state: "available" as const };
  const promotionCapability = gateRead === undefined || !actionPreviewAvailable
    ? {
        state: "unavailable" as const,
        reason: gateRead === undefined
          ? "scoped-gate-read-unavailable"
          : "operator-action-preview-unavailable",
      }
    : { state: "available" as const };
  const capabilities: ConsoleTypedEntryPlanner["capabilities"] = {
    launch: launchCapability,
    git: {
      state: "unavailable",
      reason: GIT_PREPARATION_UNAVAILABLE,
    },
    promotion: promotionCapability,
  };

  return {
    capabilities,
    async buildIntent(input) {
      if (input.kind === "launch") {
        if (launchCapability.state === "unavailable" || launchPrepare === undefined) {
          throw new Error(launchCapability.reason);
        }
        assertNoLaunchFields(input.fields);
        const session = exactProjectBinding(input.dataset, input.binding, options.projectId);
        const commandId = launchPreparationCommandId(options.clientId, input.eventId);
        const daemonPreview = await launchPrepare({
          command: {
            credential: options.credential,
            commandId,
            expectedRevision: session.revision,
            actor: options.operatorId,
            provenance: {
              kind: "console-direct-input",
              clientId: options.clientId,
              inputEventId: input.eventId,
            },
            evidenceRefs: [],
          },
          projectId: options.projectId,
          projectSessionId: session.projectSessionId,
          expectedSessionGeneration: session.generation,
          launchPacketRef: session.launchPacketRef,
        });
        const intent = daemonPreview.intent;
        if (
          intent.kind !== "project-session-launch" ||
          intent.projectId !== options.projectId ||
          intent.projectSessionId !== session.projectSessionId ||
          intent.expectedSessionRevision !== session.revision ||
          intent.expectedSessionGeneration !== session.generation ||
          intent.launchPacketRef.path !== session.launchPacketRef.path ||
          intent.launchPacketRef.digest !== session.launchPacketRef.digest
        ) {
          throw new Error("Launch preparation changed the selected session binding");
        }
        return { intent, expectedRevision: session.revision, daemonPreview };
      }
      if (input.kind === "git") throw new Error(GIT_PREPARATION_UNAVAILABLE);
      if (promotionCapability.state === "unavailable" || gateRead === undefined) {
        throw new Error(promotionCapability.reason);
      }
      const session = exactProjectBinding(
        input.dataset,
        input.binding,
        options.projectId,
      );
      const gateId = exactGateField(input.fields);
      const current = await gateRead({
        credential: options.credential,
        projectId: options.projectId,
        projectSessionId: session.projectSessionId,
        gateId: gateId as never,
      });
      const gate = current.gate;
      if (
        gate.gateId !== gateId ||
        gate.projectSessionId !== session.projectSessionId ||
        gate.scope.kind !== "release" ||
        gate.status !== "approved" ||
        gate.releaseBinding === undefined
      ) {
        throw new Error("Promotion requires the exact approved release gate");
      }
      const intent: PromotionIntent = {
        kind: "promotion",
        projectSessionId: session.projectSessionId,
        coordinationRunId: gate.coordinationRunId,
        gateId: gate.gateId,
        expectedGateRevision: gate.revision,
        expectedGateStatus: "approved",
        releaseBinding: gate.releaseBinding,
      };
      return { intent, expectedRevision: gate.revision };
    },
  };
};
