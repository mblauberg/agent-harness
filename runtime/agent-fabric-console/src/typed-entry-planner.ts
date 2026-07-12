import type {
  NegotiatedOperatorClient,
  OperatorCapabilityCredential,
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
}>;

export type ProductionConsoleTypedEntryPlannerFactory = (
  options: ProductionConsoleTypedEntryPlannerOptions,
) => ConsoleTypedEntryPlanner;

const LAUNCH_PREPARATION_UNAVAILABLE =
  "daemon-launch-intent-preparation-unavailable";
const GIT_PREPARATION_UNAVAILABLE =
  "daemon-git-intent-preparation-unavailable";

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
 * authoritative daemon read. Launch and Git stay explicit until their closed
 * daemon preparation APIs exist; operators never hand-author CAS digests.
 */
export const createProductionConsoleTypedEntryPlanner:
ProductionConsoleTypedEntryPlannerFactory = (options) => {
  const gateRead = options.client.console?.gates.read;
  const actionPreviewAvailable = options.client.console?.readOnly === false;
  const promotionCapability = gateRead === undefined || !actionPreviewAvailable
    ? {
        state: "unavailable" as const,
        reason: gateRead === undefined
          ? "scoped-gate-read-unavailable"
          : "operator-action-preview-unavailable",
      }
    : { state: "available" as const };
  const capabilities: ConsoleTypedEntryPlanner["capabilities"] = {
    launch: {
      state: "unavailable",
      reason: LAUNCH_PREPARATION_UNAVAILABLE,
    },
    git: {
      state: "unavailable",
      reason: GIT_PREPARATION_UNAVAILABLE,
    },
    promotion: promotionCapability,
  };

  return {
    capabilities,
    async buildIntent(input) {
      if (input.kind === "launch") throw new Error(LAUNCH_PREPARATION_UNAVAILABLE);
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
