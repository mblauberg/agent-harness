import { createHash } from "node:crypto";

import type {
  ArtifactRef,
  CommandId,
  NegotiatedOperatorClient,
  OperatorActionIntent,
  OperatorAvailableAction,
  OperatorCapabilityCredential,
  OperatorClientId,
  OperatorId,
  OperatorMutationContext,
  OperatorRevisionTarget,
  OperatorViewPageResult,
  ProjectId,
  ProjectSession,
  ProjectSessionId,
} from "@local/agent-fabric-protocol";

import type {
  ConsoleActionPlanner,
  ConsoleBootstrapPort,
} from "./application.js";
import { operatorIntentRevision } from "./action-revision.js";
import type { ConsoleControllerState } from "./controller.js";
import { revisionToProtocol, type ConsoleRow } from "./model.js";
import {
  bindConsoleProtocolClient,
  type ConsoleProtocolBinding,
  type FabricConsoleDataset,
} from "./protocol-adapter.js";
import type { FabricRuntimeActivation } from "./runtime.js";
import { createProductionConsoleWorkflowPlanner } from "./workflow.js";

export type ProductionConsoleActionPlannerOptions = Readonly<{
  credential: OperatorCapabilityCredential;
  operatorId: OperatorId;
  clientId: OperatorClientId;
}>;

const supportedActions = [
  "pause",
  "resume",
  "cancel",
  "steer",
  "project-session-drain",
  "project-session-stop",
] as const satisfies readonly OperatorAvailableAction[];
type ProductionConsoleAction = typeof supportedActions[number];
const supportedActionSet = new Set<OperatorAvailableAction>(supportedActions);

function restrictActionAvailability<Availability extends {
  state: "read-only" | "available";
}>(availability: Availability): Availability {
  if (availability.state === "read-only") return availability;
  const available = availability as Availability & {
    state: "available";
    actions: readonly OperatorAvailableAction[];
    requiresPreview: true;
  };
  const actions = available.actions.filter((action) => supportedActionSet.has(action));
  return (actions.length === 0
    ? { state: "read-only", reason: "feature-unavailable" }
    : { ...available, actions }) as Availability;
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
                  actionAvailability: restrictActionAvailability(
                    row.fact.value.actionAvailability,
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
): OperatorActionIntent | null {
  const session = selectedSession(dataset);
  if (session === null) return null;
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
    const drainReceiptRef = parseArtifactRef(draft);
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

function parseArtifactRef(value: string): ArtifactRef | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || Object.keys(parsed).sort().join(",") !== "digest,path") {
    return null;
  }
  const path = parsed.path;
  const digestValue = parsed.digest;
  if (
    typeof path !== "string" ||
    path.length < 1 ||
    path.length > 4_096 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
    typeof digestValue !== "string" ||
    !/^sha256:[a-f0-9]{64}$/u.test(digestValue)
  ) {
    return null;
  }
  return { path: path as ArtifactRef["path"], digest: digestValue as ArtifactRef["digest"] };
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
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  operatorId: OperatorId;
  projectSessionId?: ProjectSessionId;
  clientId: OperatorClientId;
  detach(input: Readonly<{ reason: "operator" | "safety" | "signal" }>): Promise<void>;
  close(): Promise<void>;
}>;

type PublicFabricModule = Readonly<{
  openLocalOperatorConsoleSession(input: Readonly<{
    projectRoot: string;
    surface: "standalone" | "herdr";
  }>): Promise<PublicLocalOperatorConsoleSession>;
}>;

export type ProductionConsoleBootstrapOptions = Readonly<{
  loadFabric?: () => Promise<unknown>;
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
  return value as PublicLocalOperatorConsoleSession;
}

async function loadInstalledFabric(): Promise<unknown> {
  const packageName = "@local/agent-fabric";
  return await import(packageName);
}

function unavailableReason(error: unknown):
  | "configuration-missing"
  | "start-failed"
  | "authority-unavailable" {
  if (isRecord(error)) {
    const reason = error.reason;
    if (
      reason === "configuration-missing" ||
      reason === "start-failed" ||
      reason === "authority-unavailable"
    ) return reason;
  }
  return "start-failed";
}

export function createProductionConsoleBootstrap(
  options: ProductionConsoleBootstrapOptions = {},
): ConsoleBootstrapPort {
  const loadFabric = options.loadFabric ?? loadInstalledFabric;
  return {
    async startOrAttach(request) {
      let openedSession: unknown;
      try {
        const fabric = publicFabricModule(await loadFabric());
        openedSession = await fabric.openLocalOperatorConsoleSession(request);
        const session = publicSession(
          openedSession,
        );
        return {
          status: "connected",
          binding: restrictProductionActions(
            bindConsoleProtocolClient(session.client),
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
          }),
          workflowPlanner: createProductionConsoleWorkflowPlanner({
            client: session.client,
            credential: session.credential,
            operatorId: session.operatorId,
            clientId: session.clientId,
            projectId: session.projectId,
          }),
          detach: (input) => session.detach(input),
          close: () => session.close(),
        };
      } catch (error: unknown) {
        if (
          isRecord(openedSession) &&
          typeof openedSession.close === "function"
        ) {
          await Promise.resolve(
            Reflect.apply(openedSession.close, openedSession, []),
          ).catch(() => undefined);
        }
        return { status: "unavailable", reason: unavailableReason(error) };
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
      const intent = plannedIntent(action, row, input.dataset, input.draft);
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
