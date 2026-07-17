import { createHash } from "node:crypto";

import type {
  CommandId,
  NegotiatedOperatorClient,
  OperatorActionIntent,
  OperatorActionAvailability,
  OperatorAvailableAction,
  OperatorCapabilityCredential,
  OperatorClientId,
  OperatorId,
  OperatorMutationContext,
  OperatorRevisionTarget,
  OperatorViewPageResult,
  ProjectId,
  ProjectSession,
  ProjectSessionDiscovery,
  ProjectSessionId,
  ChairBridgeRecoveryIntent,
} from "@local/agent-fabric-protocol";

import type {
  ConsoleActionPlanner,
  ConsoleBootstrapPort,
  ConsoleBootstrapResult,
} from "./application.js";
import { parseArtifactReferenceDraft } from "./action-input.js";
import { operatorIntentRevision } from "./action-revision.js";
import type { ConsoleControllerState } from "./controller.js";
import { revisionToProtocol, type ConsoleRow } from "./model.js";
import {
  bindConsoleProtocolClient,
  type BootstrapUnavailableReason,
  type ConsoleProtocolBinding,
  type ConsoleSessionCompatibility,
  type FabricConsoleDataset,
} from "./protocol-adapter.js";
import type { FabricRuntimeActivation } from "./runtime.js";
import { createProductionConsoleWorkflowPlanner } from "./workflow.js";
import type { ConsoleTypedEntryPlanner } from "./workflow.js";
import type { ProductionConsoleTypedEntryPlannerFactory } from "./typed-entry-planner.js";

export type ProductionConsoleActionPlannerOptions = Readonly<{
  credential: OperatorCapabilityCredential;
  operatorId: OperatorId;
  clientId: OperatorClientId;
  chairRecoveryIntent?: Extract<ChairBridgeRecoveryIntent, { path: "abandon" }>;
}>;

const supportedActions = [
  "pause",
  "resume",
  "cancel",
  "steer",
  "project-session-drain",
  "project-session-stop",
  "chair-bridge-recovery",
] as const satisfies readonly OperatorAvailableAction[];
type ProductionConsoleAction = typeof supportedActions[number];

function restrictRowActionAvailability(
  availability: OperatorActionAvailability,
  view: string,
  detailKind: string,
): OperatorActionAvailability {
  if (availability.state === "read-only") return availability;
  if (view === "attention") {
    return { state: "read-only", reason: "state-ineligible" };
  }
  const actions = availability.actions.filter((action) => {
    if (view === "runs" && detailKind === "run") {
      return action === "pause" || action === "resume" ||
        action === "cancel" || action === "steer";
    }
    if (view === "project" && detailKind === "project") {
      return action === "project-session-drain" ||
        action === "project-session-stop" ||
        action === "project-session-launch" ||
        action === "chair-bridge-recovery" ||
        action === "git" ||
        action === "promotion";
    }
    return false;
  });
  return actions.length === 0
    ? { state: "read-only", reason: "state-ineligible" }
    : { ...availability, actions };
}

function restrictProductionActions(
  binding: ConsoleProtocolBinding,
): ConsoleProtocolBinding {
  if (!binding.ok) return binding;
  return {
    ...binding,
    port: {
      ...binding.port,
      async viewPage(request) {
        const result = await binding.port.viewPage(request);
        if (result.status !== "page") return result;
        return {
          ...result,
          rows: result.rows.map((row) => {
            if (
              row.fact.freshness === "unavailable" ||
              row.fact.freshness === "conflict"
            ) return row;
            return {
              ...row,
              fact: {
                ...row.fact,
                value: {
                  ...row.fact.value,
                  actionAvailability: restrictRowActionAvailability(
                    row.fact.value.actionAvailability,
                    request.view,
                    row.fact.value.detailRef.kind,
                  ),
                },
              },
            };
          }),
        } as OperatorViewPageResult;
      },
    },
  };
}

function commandId(
  clientId: OperatorClientId,
  phase: "preview" | "commit" | "reconcile",
  eventId: string,
): CommandId {
  return `console_${createHash("sha256")
    .update(`${clientId}\0${phase}\0${eventId}`)
    .digest("hex")
    .slice(0, 48)}` as CommandId;
}

function command(
  options: ProductionConsoleActionPlannerOptions,
  phase: "preview" | "commit" | "reconcile",
  activation: FabricRuntimeActivation,
  expectedRevision: number,
): OperatorMutationContext {
  return {
    credential: options.credential,
    commandId: commandId(options.clientId, phase, activation.eventId),
    expectedRevision,
    actor: options.operatorId,
    provenance: {
      kind: "console-direct-input",
      clientId: options.clientId,
      inputEventId: activation.eventId,
    },
    evidenceRefs: [],
  };
}

function selectedSession(dataset: FabricConsoleDataset): ProjectSession | null {
  const session = dataset.snapshot?.session;
  if (
    session === undefined ||
    session.freshness !== "live" ||
    session.value === null
  ) {
    return null;
  }
  return session.value;
}

function selectedRow(
  activation: FabricRuntimeActivation,
  dataset: FabricConsoleDataset,
  state: ConsoleControllerState,
): ConsoleRow | null {
  const binding = activation.binding;
  if (
    binding === null ||
    dataset.snapshotRevision !== binding.projectionRevision ||
    state.selectionByView[binding.view]?.stableId !== binding.itemId
  ) {
    return null;
  }
  const row = dataset.pages[binding.view].rows.find(
    (candidate) => candidate.stableId === binding.itemId,
  );
  if (
    row === undefined ||
    row.revision !== binding.itemRevision ||
    row.freshness.state !== "live"
  ) {
    return null;
  }
  return row;
}

function actionFromActivation(
  activation: FabricRuntimeActivation,
): ProductionConsoleAction | null {
  if (!activation.regionId.startsWith("action:")) return null;
  const action = activation.regionId.slice("action:".length);
  return (supportedActions as readonly string[]).includes(action)
    ? action as ProductionConsoleAction
    : null;
}

function controlTarget(
  row: ConsoleRow,
  session: ProjectSession,
): OperatorRevisionTarget | null {
  const detail = row.detailRef;
  if (detail?.kind === "run") {
    return {
      kind: "run",
      projectSessionId: session.projectSessionId,
      coordinationRunId: detail.coordinationRunId,
      expectedRevision: detail.expectedRevision,
    };
  }
  if (
    detail?.kind === "session" &&
    detail.projectSessionId === session.projectSessionId
  ) {
    return {
      kind: "session",
      projectSessionId: session.projectSessionId,
      expectedRevision: detail.expectedRevision,
      expectedGeneration: session.generation,
    };
  }
  return null;
}

function plannedIntent(
  action: ProductionConsoleAction,
  row: ConsoleRow,
  dataset: FabricConsoleDataset,
  draft: string,
  chairRecoveryIntent?: Extract<ChairBridgeRecoveryIntent, { path: "abandon" }>,
): OperatorActionIntent | null {
  const session = selectedSession(dataset);
  if (session === null) return null;
  if (action === "chair-bridge-recovery") {
    return row.view === "project" &&
      session.state === "recovery_required" &&
      chairRecoveryIntent?.projectSessionId === session.projectSessionId &&
      chairRecoveryIntent.expectedSessionRevision === session.revision &&
      chairRecoveryIntent.expectedSessionGeneration === session.generation
      ? chairRecoveryIntent
      : null;
  }
  const controlAction = action === "pause" || action === "resume" ||
    action === "cancel" || action === "steer";
  if (controlAction && (row.view !== "runs" || row.detailRef?.kind !== "run")) {
    return null;
  }
  if (action === "project-session-drain") {
    const globalRevision = dataset.snapshotRevision;
    if (globalRevision === null) return null;
    return {
      kind: "project-session-drain",
      projectSessionId: session.projectSessionId,
      expectedSessionRevision: session.revision,
      expectedSessionGeneration: session.generation,
      expectedGlobalStateRevision: revisionToProtocol(globalRevision),
    };
  }
  if (action === "project-session-stop") {
    const globalRevision = dataset.snapshotRevision;
    const drainReceiptRef = parseArtifactReferenceDraft(draft);
    if (globalRevision === null || drainReceiptRef === null) return null;
    return {
      kind: "project-session-stop",
      projectSessionId: session.projectSessionId,
      expectedSessionRevision: session.revision,
      expectedSessionGeneration: session.generation,
      expectedGlobalStateRevision: revisionToProtocol(globalRevision),
      drainReceiptRef,
    };
  }
  const target = controlTarget(row, session);
  if (target === null) return null;
  if (action === "pause" || action === "resume") {
    return { kind: "control", action, target };
  }
  if (action === "cancel") {
    return draft.trim().length === 0
      ? null
      : { kind: "control", action, target, reason: draft };
  }
  if (action === "steer") {
    return draft.trim().length === 0
      ? null
      : { kind: "control", action, target, instruction: draft, evidenceRefs: [] };
  }
  return null;
}

function requiredIntentRevision(intent: OperatorActionIntent): number {
  const revision = operatorIntentRevision(intent);
  if (revision === null) {
    throw new TypeError("typed Git revision is unavailable to the Console planner");
  }
  return revision;
}

type PublicLocalOperatorConsoleSession = Readonly<{
  client: NegotiatedOperatorClient;
  compatibility: ConsoleSessionCompatibility;
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  operatorId: OperatorId;
  projectSessionId?: ProjectSessionId;
  chairRecoveryIntent?: Extract<ChairBridgeRecoveryIntent, { path: "abandon" }>;
  clientId: OperatorClientId;
  attachableProjectSessions?: readonly ProjectSessionDiscovery[];
  selectProjectSession?(projectSessionId: ProjectSessionId): Promise<void>;
  selectProject?(): Promise<void>;
  detach(input: Readonly<{ reason: "operator" | "safety" | "signal" }>): Promise<void>;
  close(): Promise<void>;
}>;

type PublicFabricModule = Readonly<{
  openLocalOperatorConsoleSession(input: Readonly<{
    projectRoot: string;
    surface: "standalone" | "herdr";
    projectSessionId?: ProjectSessionId;
  }>): Promise<PublicLocalOperatorConsoleSession>;
}>;

export type ProductionConsoleBootstrapOptions = Readonly<{
  loadFabric?: () => Promise<unknown>;
  typedEntryPlanner?: ConsoleTypedEntryPlanner;
  typedEntryPlannerFactory?: ProductionConsoleTypedEntryPlannerFactory;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicFabricModule(value: unknown): PublicFabricModule {
  if (
    !isRecord(value) ||
    typeof value.openLocalOperatorConsoleSession !== "function"
  ) {
    throw new TypeError("public agent-fabric Console bootstrap is unavailable");
  }
  return value as PublicFabricModule;
}

function publicSession(value: unknown): PublicLocalOperatorConsoleSession {
  if (
    !isRecord(value) ||
    !isRecord(value.client) ||
    !isRecord(value.compatibility) ||
    !isRecord(value.credential) ||
    typeof value.credential.capabilityId !== "string" ||
    typeof value.credential.token !== "string" ||
    typeof value.projectId !== "string" ||
    typeof value.operatorId !== "string" ||
    (value.projectSessionId !== undefined && typeof value.projectSessionId !== "string") ||
    typeof value.clientId !== "string" ||
    typeof value.detach !== "function" ||
    typeof value.close !== "function"
  ) {
    throw new TypeError("public agent-fabric Console session is invalid");
  }
  if (value.compatibility.mode !== "current") {
    throw new TypeError("public agent-fabric Console requires the current protocol baseline");
  }
  const selectionFields = [
    value.attachableProjectSessions,
    value.selectProjectSession,
    value.selectProject,
  ];
  if (
    selectionFields.some((field) => field !== undefined) &&
    (
      !Array.isArray(value.attachableProjectSessions) ||
      typeof value.selectProjectSession !== "function" ||
      typeof value.selectProject !== "function"
    )
  ) {
    throw new TypeError("public agent-fabric Console session selection is invalid");
  }
  return value as PublicLocalOperatorConsoleSession;
}

async function loadInstalledFabric(): Promise<unknown> {
  const packageName = "@local/agent-fabric";
  return await import(packageName);
}

const PRODUCTION_BOOTSTRAP_UNAVAILABLE_REASONS = [
  "configuration-missing",
  "schema-cutover-required",
  "authority-unavailable",
  "daemon-unreachable",
  "daemon-incompatible",
  "socket-unavailable",
  "daemon-election-conflict",
  "daemon-spawn-failed",
  "bootstrap-receipt-invalid",
  "start-failed",
] as const satisfies readonly BootstrapUnavailableReason[];

type ProductionBootstrapUnavailableReason =
  typeof PRODUCTION_BOOTSTRAP_UNAVAILABLE_REASONS[number];

function unavailableReason(error: unknown): ProductionBootstrapUnavailableReason {
  if (isRecord(error)) {
    const reason = error.reason;
    if (
      typeof reason === "string" &&
      (PRODUCTION_BOOTSTRAP_UNAVAILABLE_REASONS as readonly string[]).includes(reason)
    ) {
      return reason as ProductionBootstrapUnavailableReason;
    }
  }
  return "start-failed";
}

function protocolIncompatibleResult(
  error: unknown,
): Extract<ConsoleBootstrapResult, { status: "protocol-incompatible" }> | null {
  if (!isRecord(error) || error.code !== "CONSOLE_PROTOCOL_INCOMPATIBLE") return null;
  const primaryValue = error.primary;
  if (
    !isRecord(primaryValue) ||
    typeof primaryValue.code !== "string" ||
    typeof primaryValue.message !== "string"
  ) return null;
  const resultValue = error.result;
  const result = isRecord(resultValue) &&
      typeof resultValue.code === "string" &&
      typeof resultValue.message === "string"
    ? {
        code: resultValue.code,
        message: resultValue.message,
        ...(typeof resultValue.operation === "string" ? { operation: resultValue.operation } : {}),
        ...(typeof resultValue.closedReason === "string" ? { closedReason: resultValue.closedReason } : {}),
      }
    : undefined;
  return {
    status: "protocol-incompatible",
    primary: { code: primaryValue.code, message: primaryValue.message },
    ...(result === undefined ? {} : { result }),
  };
}

export function createProductionConsoleBootstrap(
  options: ProductionConsoleBootstrapOptions = {},
): ConsoleBootstrapPort {
  if (
    options.typedEntryPlanner !== undefined &&
    options.typedEntryPlannerFactory !== undefined
  ) {
    throw new TypeError("Console bootstrap accepts one typed-entry planner source");
  }
  const loadFabric = options.loadFabric ?? loadInstalledFabric;
  const connectedSession = (
    session: PublicLocalOperatorConsoleSession,
  ): Extract<ConsoleBootstrapResult, { status: "connected" }> => {
    const typedEntryPlanner = options.typedEntryPlanner ??
      options.typedEntryPlannerFactory?.({
        client: session.client,
        credential: session.credential,
        projectId: session.projectId,
        operatorId: session.operatorId,
        clientId: session.clientId,
      });
    const selection =
      session.attachableProjectSessions !== undefined &&
      session.selectProjectSession !== undefined &&
      session.selectProject !== undefined
        ? {
            choices: session.attachableProjectSessions,
            async selectProjectSession(projectSessionId: ProjectSessionId) {
              await session.selectProjectSession?.(projectSessionId);
              return connectedSession(session);
            },
            async selectProject() {
              await session.selectProject?.();
              return connectedSession(session);
            },
          }
        : undefined;
    return {
      status: "connected",
      binding: restrictProductionActions(
        bindConsoleProtocolClient(session.client, session.compatibility),
      ),
      credential: session.credential,
      projectId: session.projectId,
      ...(session.projectSessionId === undefined
        ? {}
        : { projectSessionId: session.projectSessionId }),
      actionPlanner: createProductionConsoleActionPlanner({
        credential: session.credential,
        operatorId: session.operatorId,
        clientId: session.clientId,
        ...(session.chairRecoveryIntent === undefined
          ? {}
          : { chairRecoveryIntent: session.chairRecoveryIntent }),
      }),
      workflowPlanner: createProductionConsoleWorkflowPlanner({
        client: session.client,
        credential: session.credential,
        operatorId: session.operatorId,
        clientId: session.clientId,
        projectId: session.projectId,
        ...(typedEntryPlanner === undefined
          ? {}
          : { typedEntryPlanner }),
      }),
      ...(selection === undefined ? {} : { sessionSelection: selection }),
      detach: (input) => session.detach(input),
      close: () => session.close(),
    };
  };
  return {
    async startOrAttach(request) {
      let openedSession: unknown;
      try {
        const fabric = publicFabricModule(await loadFabric());
        openedSession = await fabric.openLocalOperatorConsoleSession(request);
        const session = publicSession(
          openedSession,
        );
        return connectedSession(session);
      } catch (error: unknown) {
        if (
          isRecord(openedSession) &&
          typeof openedSession.close === "function"
        ) {
          await Promise.resolve(
            Reflect.apply(openedSession.close, openedSession, []),
          ).catch(() => undefined);
        }
        return protocolIncompatibleResult(error) ?? {
          status: "unavailable",
          reason: unavailableReason(error),
        };
      }
    },
  };
}

export function createProductionConsoleActionPlanner(
  options: ProductionConsoleActionPlannerOptions,
): ConsoleActionPlanner {
  return {
    async plan(input) {
      const action = actionFromActivation(input.activation);
      const row = selectedRow(input.activation, input.dataset, input.state);
      if (
        action === null ||
        row === null ||
        row.actionAvailability.state !== "available" ||
        !row.actionAvailability.actions.includes(action)
      ) {
        return null;
      }
      const intent = plannedIntent(
        action,
        row,
        input.dataset,
        input.draft,
        options.chairRecoveryIntent,
      );
      const binding = input.activation.binding;
      if (intent === null || binding === null) return null;
      return {
        view: binding.view,
        itemId: binding.itemId,
        itemRevision: binding.itemRevision,
        projectionRevision: binding.projectionRevision,
        availableAction: action,
        intent,
        command: command(
          options,
          "preview",
          input.activation,
          requiredIntentRevision(intent),
        ),
        activation: {
          eventId: input.activation.eventId,
          source: input.activation.provenance,
        },
      };
    },
    async confirmation(input) {
      const review = input.state.review;
      if (review === null || review.stage !== "confirm") {
        throw new Error("typed action Review is not armed");
      }
      return {
        command: command(
          options,
          "commit",
          input.activation,
          requiredIntentRevision(review.preview.intent),
        ),
        ...(review.preview.confirmationMode === "echo"
          ? { echoText: input.draft }
          : {}),
      };
    },
    async reconcile(input) {
      const review = input.state.review;
      if (review === null) throw new Error("typed action Review is unavailable");
      return command(
        options,
        "reconcile",
        input.activation,
        requiredIntentRevision(review.preview.intent),
      );
    },
  };
}
