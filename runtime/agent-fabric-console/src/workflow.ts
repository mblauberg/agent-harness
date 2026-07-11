import { createHash } from "node:crypto";

import {
  FABRIC_OPERATIONS,
  OPERATION_CODECS,
  type CommandId,
  type IntakeDraftCreateRequest,
  type IntakeRevisionRequest,
  type IntakeSubmission,
  type NegotiatedOperatorClient,
  type OperatorActionCommitRequest,
  type OperatorActionIntent,
  type OperatorActionPreview,
  type OperatorActionPreviewRequest,
  type OperatorCapabilityCredential,
  type OperatorClientId,
  type OperatorId,
  type OperatorMutationContext,
  type ProjectId,
  type ProjectSession,
  type ProjectSessionCloseRequest,
  type ProjectSessionCreateRequest,
  type ProjectSessionTransitionRequest,
  type ScopedGateResolveRequest,
} from "@local/agent-fabric-protocol";

import { operatorIntentRevision } from "./action-revision.js";
import { revisionFromProtocol, type Revision } from "./model.js";
import type { FabricConsoleDataset } from "./protocol-adapter.js";

export const CONSOLE_WORKFLOW_KINDS = Object.freeze([
  "project-session-create",
  "project-session-transition",
  "intake-draft-create",
  "intake-submit",
  "intake-revise",
  "scoped-gate-resolve",
  "project-session-close",
  "operator-action",
] as const);

export type ConsoleWorkflowKind = (typeof CONSOLE_WORKFLOW_KINDS)[number];
export type ConsoleWorkflowStage =
  | "review"
  | "confirm"
  | "pending"
  | "committed"
  | "conflict";

export type ConsoleWorkflowReview = Readonly<{
  workflowId: string;
  kind: ConsoleWorkflowKind;
  source: "local-typed-preview" | "daemon-preview";
  stage: ConsoleWorkflowStage;
  previewDigest: string;
  expectedRevision: Revision;
  consequenceClass: "routine" | "consequential" | "destructive" | "external" | "promotion";
  confirmationMode: "explicit" | "echo";
  summary: string;
  details: readonly Readonly<{ label: string; value: string }>[];
  evidence: readonly string[];
  openedByEventId: string;
  armedByEventId: string | null;
  result: string | null;
  failure: string | null;
}>;

export type ConsoleWorkflowPlanner = Readonly<{
  prepare(input: Readonly<{
    raw: string;
    dataset: FabricConsoleDataset;
    eventId: string;
  }>): Promise<ConsoleWorkflowReview>;
  arm(review: ConsoleWorkflowReview, eventId: string): ConsoleWorkflowReview;
  commit(input: Readonly<{
    review: ConsoleWorkflowReview;
    eventId: string;
    echoText?: string;
  }>): Promise<Readonly<{
    review: ConsoleWorkflowReview;
    reconnectRequired: boolean;
  }>>;
}>;

export type ProductionConsoleWorkflowPlannerOptions = Readonly<{
  client: NegotiatedOperatorClient;
  credential: OperatorCapabilityCredential;
  operatorId: OperatorId;
  clientId: OperatorClientId;
  projectId: ProjectId;
}>;

type WorkflowEnvelope = Readonly<{
  kind: ConsoleWorkflowKind;
  request: Record<string, unknown>;
}>;

type PreparedWorkflow = Readonly<{
  review: ConsoleWorkflowReview;
  request: Record<string, unknown>;
  daemonPreview?: OperatorActionPreview;
}>;

const MAX_WORKFLOW_BYTES = 65_536;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function stableId(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}_${createHash("sha256")
    .update(parts.join("\0"))
    .digest("hex")
    .slice(0, 48)}`;
}

function workflowEnvelope(raw: string): WorkflowEnvelope {
  if (Buffer.byteLength(raw) > MAX_WORKFLOW_BYTES) {
    throw new TypeError("Console workflow exceeds 65536 bytes");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new TypeError("Console workflow must be valid JSON");
  }
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "kind,request") {
    throw new TypeError("Console workflow must contain exactly kind and request");
  }
  if (
    typeof value.kind !== "string" ||
    !(CONSOLE_WORKFLOW_KINDS as readonly string[]).includes(value.kind)
  ) {
    throw new TypeError(`unsupported Console workflow: ${String(value.kind)}`);
  }
  if (!isRecord(value.request)) {
    throw new TypeError("Console workflow request must be an object");
  }
  for (const forbidden of ["command", "credential", "decisionEvidence", "origin"] as const) {
    if (forbidden in value.request) {
      throw new TypeError(`Console workflow request cannot supply ${forbidden}`);
    }
  }
  return { kind: value.kind as ConsoleWorkflowKind, request: value.request };
}

function liveProjectRevision(dataset: FabricConsoleDataset, projectId: ProjectId): number {
  const project = dataset.snapshot?.project;
  if (
    dataset.connection.state !== "live" ||
    !dataset.canMutate ||
    project?.freshness !== "live" ||
    project.value.projectId !== projectId
  ) {
    throw new Error("Console workflow requires a live project projection");
  }
  return project.revision;
}

function liveSession(dataset: FabricConsoleDataset): ProjectSession {
  const session = dataset.snapshot?.session;
  if (
    dataset.connection.state !== "live" ||
    !dataset.canMutate ||
    session?.freshness !== "live" ||
    session.value === null
  ) {
    throw new Error("Console workflow requires a live selected project session");
  }
  return session.value;
}

function expectedRevision(
  envelope: WorkflowEnvelope,
  dataset: FabricConsoleDataset,
  projectId: ProjectId,
): number {
  if (envelope.kind === "project-session-create") {
    return liveProjectRevision(dataset, projectId);
  }
  if (envelope.kind === "intake-draft-create") return 0;
  if (envelope.kind === "intake-submit" || envelope.kind === "intake-revise") {
    const revision = envelope.request.expectedRevision;
    if (!Number.isSafeInteger(revision) || Number(revision) < 1) {
      throw new TypeError(`${envelope.kind} requires a positive expectedRevision`);
    }
    return Number(revision);
  }
  if (envelope.kind === "operator-action") {
    const revision = operatorIntentRevision(envelope.request.intent as OperatorActionIntent);
    if (revision === null) throw new TypeError("typed Git workflow revision is unavailable");
    return revision;
  }
  return liveSession(dataset).revision;
}

function mutationContext(
  options: ProductionConsoleWorkflowPlannerOptions,
  eventId: string,
  phase: "preview" | "commit",
  revision: number,
  workflowDigest: string,
): OperatorMutationContext {
  return {
    credential: options.credential,
    commandId: stableId("console", options.clientId, phase, eventId, workflowDigest) as CommandId,
    expectedRevision: revision,
    actor: options.operatorId,
    provenance: {
      kind: "console-direct-input",
      clientId: options.clientId,
      inputEventId: eventId,
    },
    evidenceRefs: [],
  };
}

function parseOperation<Input>(operation: keyof typeof OPERATION_CODECS, value: unknown): Input {
  return OPERATION_CODECS[operation].input.parse(value, operation) as Input;
}

function validateDirectRequest(
  envelope: WorkflowEnvelope,
  options: ProductionConsoleWorkflowPlannerOptions,
  revision: number,
  eventId: string,
): void {
  if (envelope.kind === "operator-action") return;
  const command = mutationContext(
    options,
    eventId,
    "preview",
    revision,
    sha256(envelope),
  );
  switch (envelope.kind) {
    case "project-session-create":
      parseOperation<ProjectSessionCreateRequest>(
        FABRIC_OPERATIONS.projectSessionCreate,
        { ...envelope.request, command },
      );
      return;
    case "project-session-transition":
      parseOperation<ProjectSessionTransitionRequest>(
        FABRIC_OPERATIONS.projectSessionTransition,
        { ...envelope.request, command },
      );
      return;
    case "project-session-close":
      parseOperation<ProjectSessionCloseRequest>(
        FABRIC_OPERATIONS.projectSessionClose,
        { ...envelope.request, command },
      );
      return;
    case "intake-draft-create":
      parseOperation<IntakeDraftCreateRequest>(
        FABRIC_OPERATIONS.intakeDraftCreate,
        { ...envelope.request, command },
      );
      return;
    case "intake-submit":
      parseOperation<IntakeSubmission>(
        FABRIC_OPERATIONS.intakeSubmit,
        { ...envelope.request, command },
      );
      return;
    case "intake-revise":
      parseOperation<Extract<IntakeRevisionRequest, { origin: "operator" }>>(
        FABRIC_OPERATIONS.intakeRevise,
        { ...envelope.request, origin: "operator", command },
      );
      return;
    case "scoped-gate-resolve":
      parseOperation<ScopedGateResolveRequest>(
        FABRIC_OPERATIONS.scopedGateResolve,
        {
          ...envelope.request,
          command,
          decisionEvidence: {
            kind: "typed-console",
            confirmationCommandId: command.commandId,
          },
        },
      );
      return;
  }
}

function safeValue(value: unknown, key = ""): unknown {
  if (/credential|capability|token|secret/iu.test(key)) return "[REDACTED capability]";
  if (Array.isArray(value)) return value.map((item) => safeValue(item));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, safeValue(item, name)]));
  }
  if (typeof value === "string") {
    return value.replace(/\b(?:afb|afc|afop)_[A-Za-z0-9._~+/=-]{4,}\b/gu, "[REDACTED capability]");
  }
  return value;
}

function requestDetails(request: Record<string, unknown>): readonly Readonly<{ label: string; value: string }>[] {
  return Object.keys(request).sort().map((label) => ({
    label,
    value: canonical(safeValue(request[label], label)),
  }));
}

function consequence(kind: ConsoleWorkflowKind): ConsoleWorkflowReview["consequenceClass"] {
  if (kind === "project-session-close") return "destructive";
  if (kind === "project-session-create" || kind === "project-session-transition" || kind === "scoped-gate-resolve") {
    return "consequential";
  }
  return "routine";
}

function assertSessionBinding(
  request: Record<string, unknown>,
  dataset: FabricConsoleDataset,
): void {
  if (!("projectSessionId" in request)) return;
  const session = liveSession(dataset);
  if (request.projectSessionId !== session.projectSessionId) {
    throw new Error("Console workflow request targets another project session");
  }
}

function resultSummary(kind: ConsoleWorkflowKind, result: unknown): string {
  if (!isRecord(result)) return `${kind} committed`;
  const id = [
    result.projectSessionId,
    result.intakeId,
    result.gateId,
    result.commandId,
  ].find((value) => typeof value === "string");
  const state = typeof result.state === "string" ? result.state : null;
  const revision = Number.isSafeInteger(result.revision) ? result.revision : null;
  return [kind, id, state, revision === null ? null : `r${String(revision)}`]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" | ");
}

function directPreview(
  envelope: WorkflowEnvelope,
  revision: number,
  eventId: string,
): ConsoleWorkflowReview {
  const digest = sha256({ kind: envelope.kind, request: envelope.request, expectedRevision: revision });
  return {
    workflowId: stableId("workflow", eventId, digest),
    kind: envelope.kind,
    source: "local-typed-preview",
    stage: "review",
    previewDigest: digest,
    expectedRevision: revisionFromProtocol(revision),
    consequenceClass: consequence(envelope.kind),
    confirmationMode: "explicit",
    summary: envelope.kind,
    details: requestDetails(envelope.request),
    evidence: [],
    openedByEventId: eventId,
    armedByEventId: null,
    result: null,
    failure: null,
  };
}

export function createProductionConsoleWorkflowPlanner(
  options: ProductionConsoleWorkflowPlannerOptions,
): ConsoleWorkflowPlanner {
  const prepared = new Map<string, PreparedWorkflow>();

  const prepare = async (input: Readonly<{
    raw: string;
    dataset: FabricConsoleDataset;
    eventId: string;
  }>): Promise<ConsoleWorkflowReview> => {
    const envelope = workflowEnvelope(input.raw);
    if (envelope.kind !== "project-session-create") assertSessionBinding(envelope.request, input.dataset);
    if (envelope.kind === "project-session-create" && envelope.request.projectId !== options.projectId) {
      throw new Error("Console workflow request targets another project");
    }
    const revision = expectedRevision(envelope, input.dataset, options.projectId);
    validateDirectRequest(envelope, options, revision, input.eventId);
    let review: ConsoleWorkflowReview;
    let daemonPreview: OperatorActionPreview | undefined;
    if (envelope.kind === "scoped-gate-resolve") {
      const gateId = envelope.request.gateId;
      if (typeof gateId !== "string") throw new TypeError("scoped-gate-resolve requires gateId");
      const session = liveSession(input.dataset);
      const gateRead = options.client.console?.gates.read;
      if (gateRead === undefined) throw new Error("scoped gate read is unavailable");
      const current = await gateRead({
        credential: options.credential,
        projectId: options.projectId,
        projectSessionId: session.projectSessionId,
        gateId: gateId as never,
      });
      const gate = current.gate;
      if (gate.projectSessionId !== session.projectSessionId) {
        throw new Error("scoped gate belongs to another project session");
      }
      if (gate.status !== "pending" && gate.status !== "deferred") {
        throw new Error("scoped gate is no longer open");
      }
      review = {
        ...directPreview(envelope, gate.revision, input.eventId),
        summary: `Gate: ${gate.question}`,
        details: [
          { label: "Gate", value: `${gate.gateId} r${String(gate.revision)}` },
          { label: "Scope", value: canonical(gate.scope) },
          { label: "Reason", value: gate.reason },
          { label: "Options", value: gate.options.join(" | ") },
          { label: "Recommendation", value: gate.recommendation },
          ...gate.consequences.map((value) => ({ label: "Consequence", value })),
          ...requestDetails(envelope.request),
        ],
        evidence: gate.evidenceRefs.map(
          (reference) => `${reference.path}@${reference.digest}`,
        ),
      };
    } else if (envelope.kind === "operator-action") {
      const actions = options.client.console?.actions;
      if (actions === undefined) throw new Error("operator actions are unavailable");
      const workflowDigest = sha256(envelope);
      const request = parseOperation<OperatorActionPreviewRequest>(
        FABRIC_OPERATIONS.operatorActionPreview,
        {
          command: mutationContext(options, input.eventId, "preview", revision, workflowDigest),
          projectId: options.projectId,
          intent: envelope.request.intent,
        },
      );
      daemonPreview = await actions.preview(request);
      if (canonical(daemonPreview.intent) !== canonical(request.intent)) {
        throw new Error("operator action Preview changed the requested intent");
      }
      review = {
        workflowId: stableId("workflow", input.eventId, daemonPreview.previewDigest),
        kind: envelope.kind,
        source: "daemon-preview",
        stage: "review",
        previewDigest: daemonPreview.previewDigest,
        expectedRevision: revisionFromProtocol(revision),
        consequenceClass: daemonPreview.consequenceClass,
        confirmationMode: daemonPreview.confirmationMode,
        summary: `operator-action:${daemonPreview.intent.kind}`,
        details: requestDetails({ intent: daemonPreview.intent }),
        evidence: daemonPreview.evidenceRefs.map((reference) => `${reference.path}@${reference.digest}`),
        openedByEventId: input.eventId,
        armedByEventId: null,
        result: null,
        failure: null,
      };
    } else {
      review = directPreview(envelope, revision, input.eventId);
    }
    prepared.set(review.workflowId, {
      review,
      request: envelope.request,
      ...(daemonPreview === undefined ? {} : { daemonPreview }),
    });
    return review;
  };

  const arm = (review: ConsoleWorkflowReview, eventId: string): ConsoleWorkflowReview => {
    const stored = prepared.get(review.workflowId);
    if (
      stored === undefined ||
      canonical(stored.review) !== canonical(review) ||
      review.stage !== "review"
    ) {
      throw new Error("Console workflow Review is stale or unavailable");
    }
    if (eventId === review.openedByEventId) {
      throw new Error("Console workflow Review requires a distinct confirmation gesture");
    }
    const armed = { ...review, stage: "confirm" as const, armedByEventId: eventId };
    prepared.set(review.workflowId, { ...stored, review: armed });
    return armed;
  };

  const commit = async (input: Readonly<{
    review: ConsoleWorkflowReview;
    eventId: string;
    echoText?: string;
  }>): Promise<Readonly<{ review: ConsoleWorkflowReview; reconnectRequired: boolean }>> => {
    const stored = prepared.get(input.review.workflowId);
    if (
      stored === undefined ||
      canonical(stored.review) !== canonical(input.review) ||
      input.review.stage !== "confirm" ||
      input.eventId === input.review.openedByEventId ||
      input.eventId === input.review.armedByEventId
    ) {
      throw new Error("Console workflow confirmation is stale or not distinct");
    }
    if (stored.review.confirmationMode === "echo" && input.echoText !== stored.review.previewDigest) {
      throw new Error("Console workflow requires the exact preview digest");
    }
    const revision = Number(stored.review.expectedRevision);
    const command = mutationContext(
      options,
      input.eventId,
      "commit",
      revision,
      stored.review.previewDigest,
    );
    const pending = { ...stored.review, stage: "pending" as const, failure: null };
    let result: unknown;
    try {
      switch (stored.review.kind) {
        case "project-session-create": {
          const client = options.client.projectSessions;
          if (client === undefined) throw new Error("project-session creation is unavailable");
          result = await client.create(parseOperation<ProjectSessionCreateRequest>(
            FABRIC_OPERATIONS.projectSessionCreate,
            { ...stored.request, command },
          ));
          break;
        }
        case "project-session-transition": {
          const client = options.client.projectSessions;
          if (client === undefined) throw new Error("project-session transition is unavailable");
          result = await client.transition(parseOperation<ProjectSessionTransitionRequest>(
            FABRIC_OPERATIONS.projectSessionTransition,
            { ...stored.request, command },
          ));
          break;
        }
        case "project-session-close": {
          const client = options.client.projectSessions;
          if (client === undefined) throw new Error("project-session acceptance is unavailable");
          result = await client.close(parseOperation<ProjectSessionCloseRequest>(
            FABRIC_OPERATIONS.projectSessionClose,
            { ...stored.request, command },
          ));
          break;
        }
        case "intake-draft-create": {
          const client = options.client.intakes;
          if (client === undefined) throw new Error("intake draft creation is unavailable");
          result = await client.createDraft(parseOperation<IntakeDraftCreateRequest>(
            FABRIC_OPERATIONS.intakeDraftCreate,
            { ...stored.request, command },
          ));
          break;
        }
        case "intake-submit": {
          const client = options.client.intakes;
          if (client === undefined) throw new Error("intake submission is unavailable");
          result = await client.submit(parseOperation<IntakeSubmission>(
            FABRIC_OPERATIONS.intakeSubmit,
            { ...stored.request, command },
          ));
          break;
        }
        case "intake-revise": {
          const client = options.client.intakes;
          if (client === undefined) throw new Error("intake revision is unavailable");
          result = await client.revise(parseOperation<Extract<IntakeRevisionRequest, { origin: "operator" }>>(
            FABRIC_OPERATIONS.intakeRevise,
            { ...stored.request, origin: "operator", command },
          ));
          break;
        }
        case "scoped-gate-resolve": {
          const client = options.client.gates;
          if (client === undefined) throw new Error("scoped gate resolution is unavailable");
          result = await client.resolve(parseOperation<ScopedGateResolveRequest>(
            FABRIC_OPERATIONS.scopedGateResolve,
            {
              ...stored.request,
              command,
              decisionEvidence: {
                kind: "typed-console",
                confirmationCommandId: command.commandId,
              },
            },
          ));
          break;
        }
        case "operator-action": {
          const actions = options.client.console?.actions;
          const preview = stored.daemonPreview;
          if (actions === undefined || preview === undefined) {
            throw new Error("operator action Preview is unavailable");
          }
          const confirmation = preview.confirmationMode === "echo"
            ? { kind: "echo" as const, echoedPreviewDigest: preview.previewDigest }
            : { kind: "explicit" as const, confirmationId: stableId("confirmation", input.eventId, preview.previewDigest) };
          result = await actions.commit(parseOperation<OperatorActionCommitRequest>(
            FABRIC_OPERATIONS.operatorActionCommit,
            {
              command,
              projectId: options.projectId,
              previewId: preview.previewId,
              expectedPreviewRevision: preview.previewRevision,
              previewDigest: preview.previewDigest,
              expectedIntentDigest: preview.intentDigest,
              confirmation,
            },
          ));
          break;
        }
      }
    } catch (error: unknown) {
      const failureCode = isRecord(error) && typeof error.code === "string" &&
          /^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(error.code)
        ? error.code
        : "WORKFLOW_COMMIT_FAILED";
      const failed: ConsoleWorkflowReview = {
        ...pending,
        stage: "conflict",
        failure: failureCode,
      };
      return { review: failed, reconnectRequired: false };
    }
    prepared.delete(input.review.workflowId);
    const completed: ConsoleWorkflowReview = {
      ...pending,
      stage: "committed",
      result: resultSummary(stored.review.kind, result),
    };
    return {
      review: completed,
      reconnectRequired: stored.review.kind === "project-session-create",
    };
  };

  return { prepare, arm, commit };
}
