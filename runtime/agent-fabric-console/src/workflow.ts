import { createHash } from "node:crypto";

import {
  FABRIC_OPERATIONS,
  OPERATION_CODECS,
  parseIdentifier,
  parseLaunchPacketV1,
  parseLaunchResourcePlanV1,
  parseTimestamp,
  type CommandId,
  type IntakeDraftCreateRequest,
  type Intake,
  type IntakeRevisionRequest,
  type IntakeSubmission,
  type NegotiatedOperatorClient,
  type OperatorActionCommitRequest,
  type OperatorActionIntent,
  type OperatorActionPreview,
  type OperatorActionPreviewRequest,
  type OperatorActionStatus,
  type OperatorCapabilityCredential,
  type OperatorClientId,
  type OperatorId,
  type OperatorMutationContext,
  type ProjectId,
  type ProjectSession,
  type ProjectSessionCloseRequest,
  type ProjectSessionCreateRequest,
  type ProjectSessionId,
  type ProjectSessionLaunchPacketPrepareRequest,
  type ProjectSessionTransitionRequest,
  type ScopedGateResolveRequest,
  type TaskRequest,
} from "@local/agent-fabric-protocol";
import { redactLaunchProviderInput } from "@local/agent-fabric";

import { operatorIntentRevision } from "./action-revision.js";
import { consoleImplementationCommandId, consoleLaunchCommandId } from "./launch-command.js";
import {
  revisionFromProtocol,
  type ConsoleWorkflowCapabilities,
  type GuidedWorkflowAction,
  type Revision,
} from "./model.js";
import type {
  ConsoleInspectionBinding,
  FabricConsoleDataset,
} from "./protocol-adapter.js";

export const CONSOLE_WORKFLOW_KINDS = Object.freeze([
  "project-session-create",
  "project-session-transition",
  "intake-draft-create",
  "intake-submit",
  "intake-revise",
  "scoped-gate-resolve",
  "project-session-close",
  "project-session-launch-packet-prepare",
  "operator-action",
] as const);

export type ConsoleWorkflowKind = (typeof CONSOLE_WORKFLOW_KINDS)[number];
export type ConsoleWorkflowStage =
  | "review"
  | "confirm"
  | "pending"
  | "ambiguous"
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
  capabilities: ConsoleWorkflowCapabilities;
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
    reconnectProjectSessionId: ProjectSessionId | null;
  }>>;
  observe(input: Readonly<{
    review: ConsoleWorkflowReview;
    eventId: string;
  }>): Promise<ConsoleWorkflowReview>;
  prepareGuided(input: Readonly<{
    action: GuidedWorkflowAction;
    binding: ConsoleInspectionBinding;
    raw: string;
    dataset: FabricConsoleDataset;
    eventId: string;
    artifactConfirmation?: GuidedArtifactConfirmation;
  }>): Promise<ConsoleWorkflowReview>;
}>;

export type GuidedArtifactConfirmation = Readonly<{
  evidenceId: string;
  evidenceRevision: number;
  sourceDigest: string;
  renderedDigest: string;
  transformation: "terminal-neutralised";
  pageCount: number;
}>;

export type ProductionConsoleWorkflowPlannerOptions = Readonly<{
  client: NegotiatedOperatorClient;
  credential: OperatorCapabilityCredential;
  operatorId: OperatorId;
  clientId: OperatorClientId;
  projectId: ProjectId;
  typedEntryPlanner?: ConsoleTypedEntryPlanner;
  now?: () => number;
}>;

export type ConsoleTypedEntryKind = "launch" | "git" | "promotion";

export type ConsoleTypedEntryPlanner = Readonly<{
  capabilities: Pick<ConsoleWorkflowCapabilities, ConsoleTypedEntryKind>;
  buildIntent(input: Readonly<{
    kind: ConsoleTypedEntryKind;
    fields: Readonly<Record<string, string>>;
    eventId: string;
    binding: ConsoleInspectionBinding;
    dataset: FabricConsoleDataset;
  }>): Promise<Readonly<{
    intent: OperatorActionIntent;
    expectedRevision: number;
    daemonPreview?: OperatorActionPreview;
  }>>;
}>;

type WorkflowEnvelope = Readonly<{
  kind: ConsoleWorkflowKind;
  request: Record<string, unknown>;
}>;

type PreparedWorkflow = Readonly<{
  review: ConsoleWorkflowReview;
  request: Record<string, unknown>;
  daemonPreview?: OperatorActionPreview;
  commitCommandId?: CommandId;
}>;

const MAX_WORKFLOW_BYTES = 65_536;
const MAX_GUIDED_INPUT_BYTES = 16_384;
const DISCUSSION_DEADLINE_MS = 24 * 60 * 60 * 1_000;

export class ConsoleGuidedInputError extends TypeError {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ConsoleGuidedInputError";
    this.code = code;
  }
}

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

function guidedFields(raw: string): Readonly<Record<string, string>> {
  if (Buffer.byteLength(raw) > MAX_GUIDED_INPUT_BYTES) {
    throw new ConsoleGuidedInputError(
      "CONSOLE_GUIDED_INPUT_TOO_LARGE",
      "guided workflow input exceeds 16384 bytes",
    );
  }
  const fields: Record<string, string> = {};
  for (const [index, sourceLine] of raw.split(/\r?\n/u).entries()) {
    const line = sourceLine.trim();
    if (line.length === 0) continue;
    const separator = line.indexOf("=");
    if (separator < 1) {
      throw new ConsoleGuidedInputError(
        "CONSOLE_GUIDED_KEY_VALUE_REQUIRED",
        `guided workflow line ${String(index + 1)} must be key=value`,
      );
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/^[a-z][a-z0-9-]{0,63}$/u.test(key)) {
      throw new ConsoleGuidedInputError(
        "CONSOLE_GUIDED_FIELD_INVALID",
        `guided workflow field ${key} is invalid`,
      );
    }
    if (key in fields) {
      throw new ConsoleGuidedInputError(
        "CONSOLE_GUIDED_FIELD_DUPLICATE",
        `guided workflow field ${key} is duplicated`,
      );
    }
    if (value.length === 0) {
      throw new ConsoleGuidedInputError(
        "CONSOLE_GUIDED_FIELD_EMPTY",
        `guided workflow field ${key} is empty`,
      );
    }
    if (/credential|capability|token|secret/iu.test(key)) {
      throw new ConsoleGuidedInputError(
        "CONSOLE_GUIDED_FIELD_FORBIDDEN",
        `guided workflow field ${key} is forbidden`,
      );
    }
    fields[key] = value;
  }
  return fields;
}

function requiredGuidedField(
  fields: Readonly<Record<string, string>>,
  key: string,
): string {
  const value = fields[key];
  if (value === undefined) {
    throw new ConsoleGuidedInputError(
      `CONSOLE_GUIDED_REQUIRES_${key.toUpperCase()}`,
      `guided workflow requires ${key}`,
    );
  }
  return value;
}

function guidedJsonField(fields: Readonly<Record<string, string>>, key: string): unknown {
  const value = requiredGuidedField(fields, key);
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ConsoleGuidedInputError(
      "CONSOLE_GUIDED_JSON_INVALID",
      `guided workflow field ${key} must contain valid JSON`,
    );
  }
}

function exactArtifactInspection(
  dataset: FabricConsoleDataset,
  binding: ConsoleInspectionBinding,
  confirmation?: GuidedArtifactConfirmation,
) {
  const inspection = dataset.inspection;
  if (
    inspection?.kind !== "artifact" ||
    inspection.state !== "current" ||
    inspection.binding.view !== binding.view ||
    inspection.binding.itemId !== binding.itemId ||
    inspection.binding.itemRevision !== binding.itemRevision ||
    inspection.binding.projectionRevision !== binding.projectionRevision ||
    inspection.result.coverage.complete !== true ||
    inspection.result.coverage.verified !== true ||
    inspection.result.reviewDisposition === "blocked-redacted"
  ) {
    throw new Error("guided evidence decision requires the exact verified artifact view");
  }
  if (inspection.result.reviewDisposition === "confirm-terminal-neutralised") {
    if (
      confirmation === undefined ||
      confirmation.evidenceId !== binding.itemId ||
      confirmation.evidenceRevision !== inspection.result.evidenceRevision ||
      confirmation.sourceDigest !== inspection.result.artifactRef.digest ||
      confirmation.renderedDigest !== inspection.result.renderedArtifactDigest ||
      confirmation.transformation !== inspection.result.transformation ||
      confirmation.pageCount !== inspection.result.coverage.pageCount
    ) {
      throw new Error("guided acceptance requires the exact terminal-neutralised confirmation");
    }
  }
  return inspection;
}

function appendArtifact(
  artifacts: readonly Intake["artifactRefs"][number][],
  artifact: Intake["artifactRefs"][number],
): readonly Intake["artifactRefs"][number][] {
  return artifacts.some(
    (candidate) => candidate.path === artifact.path && candidate.digest === artifact.digest,
  )
    ? artifacts
    : [...artifacts, artifact];
}

function guidedIntakeState(
  action: Extract<GuidedWorkflowAction, "discuss" | "accept" | "request-changes" | "defer">,
): "discussing" | "accepted" | "awaiting-chair" | "deferred" {
  if (action === "discuss") return "discussing";
  if (action === "accept") return "accepted";
  if (action === "request-changes") return "awaiting-chair";
  return "deferred";
}

function assertGuidedIntakeFields(
  fields: Readonly<Record<string, string>>,
  action: Extract<GuidedWorkflowAction, "discuss" | "accept" | "request-changes" | "defer">,
): void {
  const allowed = new Set(["intake", "summary"]);
  const unexpected = Object.keys(fields).filter((field) => !allowed.has(field));
  if (unexpected.length > 0) {
    throw new ConsoleGuidedInputError(
      "CONSOLE_GUIDED_INTAKE_FIELDS_INVALID",
      `guided ${action} does not accept ${unexpected.sort().join(",")}`,
    );
  }
  if (action === "request-changes" && fields.summary === undefined) {
    throw new ConsoleGuidedInputError(
      "CONSOLE_GUIDED_REQUIRES_SUMMARY",
      "guided request-changes requires summary=<requested change>",
    );
  }
}

function exactGuidedRow(
  dataset: FabricConsoleDataset,
  binding: ConsoleInspectionBinding,
) {
  if (dataset.snapshotRevision !== binding.projectionRevision) {
    throw new Error("guided workflow projection revision is stale");
  }
  const row = dataset.pages[binding.view].rows.find(
    (candidate) => candidate.stableId === binding.itemId,
  );
  if (
    row === undefined ||
    row.revision !== binding.itemRevision ||
    row.freshness.state !== "live"
  ) {
    throw new Error("guided workflow row binding is stale");
  }
  return row;
}

function successorChairRequest(input: Readonly<{
  intake: Exclude<Intake, { state: "draft" }>;
  artifactRefs: Intake["artifactRefs"];
  summary: string;
  clientId: OperatorClientId;
  eventId: string;
  nowMs: number;
}>): TaskRequest {
  const seed = input.intake.chairRequestSeed;
  if (seed === undefined) {
    throw new Error("intake-chair-request-seed-unavailable");
  }
  const nextRevision = input.intake.revision + 1;
  const identity = [
    input.clientId,
    input.eventId,
    input.intake.intakeId,
    String(nextRevision),
  ] as const;
  return {
    commandId: parseIdentifier<"CommandId">(
      stableId("intake_request", ...identity),
      "guided.chairRequest.commandId",
    ),
    projectSessionId: input.intake.projectSessionId,
    coordinationRunId: input.intake.coordinationRunId,
    task: {
      taskId: parseIdentifier<"TaskId">(
        stableId("intake_task", ...identity),
        "guided.chairRequest.task.taskId",
      ),
      taskRevision: 1,
      objective: input.summary,
      baseRevision: seed.baseRevision,
      expectedArtifactPaths: [...new Set(input.artifactRefs.map(({ path }) => path))],
    },
    request: {
      requestRevision: 1,
      messageId: parseIdentifier<"MessageId">(
        stableId("intake_message", ...identity),
        "guided.chairRequest.request.messageId",
      ),
      conversationId: seed.conversationId,
      targetAgentId: seed.targetAgentId,
      targetProviderSessionRef: seed.targetProviderSessionRef,
      requiresAck: true,
      dedupeKey: stableId("intake_dedupe", ...identity),
      responseDeadline: parseTimestamp(
        new Date(input.nowMs + DISCUSSION_DEADLINE_MS).toISOString(),
        "guided.chairRequest.request.responseDeadline",
      ),
      callbackId: parseIdentifier<"CallbackId">(
        stableId("intake_callback", ...identity),
        "guided.chairRequest.request.callbackId",
      ),
      callbackGeneration: 1,
      dependentBarrierId: parseIdentifier<"BarrierId">(
        stableId("intake_barrier", ...identity),
        "guided.chairRequest.request.dependentBarrierId",
      ),
      intakeBinding: {
        intakeId: input.intake.intakeId,
        intakeRevision: nextRevision,
        gateIds: input.intake.gateIds,
        artifactDigests: input.artifactRefs.map(({ digest }) => digest),
      },
    },
  };
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
  const session = liveSession(dataset);
  if (
    envelope.kind === "project-session-launch-packet-prepare" &&
    session.state === "awaiting_launch" &&
    isRecord(envelope.request.launchPacketRef) &&
    envelope.request.launchPacketRef.path === session.launchPacketRef.path &&
    envelope.request.launchPacketRef.digest === session.launchPacketRef.digest
  ) {
    if (session.revision <= 1) throw new Error("prepared project session revision is invalid");
    return session.revision - 1;
  }
  return session.revision;
}

function mutationContext(
  options: ProductionConsoleWorkflowPlannerOptions,
  eventId: string,
  phase: "preview" | "commit" | "reconcile",
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
    case "project-session-launch-packet-prepare":
      parseOperation<ProjectSessionLaunchPacketPrepareRequest>(
        FABRIC_OPERATIONS.projectSessionLaunchPacketPrepare,
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

function implementationDetails(request: Record<string, unknown>): readonly Readonly<{ label: string; value: string }>[] {
  const packet = isRecord(request.launchPacket) ? request.launchPacket : {};
  const authority = isRecord(packet.chairAuthority) ? packet.chairAuthority : {};
  const provider = isRecord(packet.provider) ? packet.provider : {};
  return [
    { label: "Accepted evidence", value: canonical(request.acceptedScopeRef) },
    { label: "Launch packet", value: canonical(request.launchPacketRef) },
    { label: "Resource plan", value: canonical(request.resourcePlanRef) },
    { label: "Authority", value: canonical(safeValue(authority)) },
    { label: "Budget", value: canonical(authority.budget) },
    {
      label: "Provider route",
      value: canonical(safeValue({
        adapterId: provider.adapterId,
        actionId: provider.actionId,
        contractDigest: provider.contractDigest,
        inputSchemaId: provider.inputSchemaId,
      })),
    },
    { label: "Provider input", value: canonical(redactLaunchProviderInput(provider.input)) },
    {
      label: "Worktree/write scopes",
      value: canonical({
        projectRunDirectory: packet.projectRunDirectory,
        workspaceRoots: authority.workspaceRoots,
        sourcePaths: authority.sourcePaths,
        artifactPaths: authority.artifactPaths,
      }),
    },
  ];
}

function consequence(kind: ConsoleWorkflowKind): ConsoleWorkflowReview["consequenceClass"] {
  if (kind === "project-session-close") return "destructive";
  if (
    kind === "project-session-create" || kind === "project-session-transition" ||
    kind === "project-session-launch-packet-prepare" || kind === "scoped-gate-resolve"
  ) {
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

function launchSettlementReview(
  review: ConsoleWorkflowReview,
  status: OperatorActionStatus,
): ConsoleWorkflowReview {
  const common = {
    ...review,
    result: `operator-action | ${status.commandId} | ${status.status}`,
  };
  if (status.status === "pending") return { ...common, stage: "pending", failure: null };
  if (status.status === "ambiguous") {
    return { ...common, stage: "ambiguous", failure: "LAUNCH_AMBIGUOUS" };
  }
  if (status.status === "committed") {
    const journal = status.launchProviderActionJournalRef;
    if (
      journal?.journalState === "terminal" &&
      journal.outcomeKind === "terminal-success" &&
      status.seatProvisioning !== undefined
    ) return { ...common, stage: "committed", failure: null };
    if (journal?.journalState === "terminal" && journal.outcomeKind === "terminal-no-effect") {
      return { ...common, stage: "conflict", failure: "LAUNCH_TERMINAL_NO_EFFECT" };
    }
    return { ...common, stage: "conflict", failure: "LAUNCH_SETTLEMENT_INVALID" };
  }
  if (status.status === "rejected") {
    return { ...common, stage: "conflict", failure: status.code };
  }
  return { ...common, stage: "conflict", failure: `LAUNCH_${status.status.toUpperCase()}` };
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
    details: envelope.kind === "project-session-launch-packet-prepare"
      ? implementationDetails(envelope.request)
      : requestDetails(envelope.request),
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
  const typedRevisionOverrides = new Map<string, number>();
  const typedPreviewOverrides = new Map<string, OperatorActionPreview>();
  const gateBindingOverrides = new Map<string, Readonly<{
    revision: number;
    coordinationRunId: string;
  }>>();
  const now = options.now ?? Date.now;
  const capabilities: ConsoleWorkflowCapabilities = {
    intake: options.client.intakes === undefined
      ? { state: "unavailable", reason: "intake-protocol-unavailable" }
      : { state: "available" },
    gate: options.client.gates === undefined || options.client.console?.gates === undefined
      ? { state: "unavailable", reason: "gate-protocol-unavailable" }
      : { state: "available" },
    implement: options.client.intakes === undefined || options.client.projectSessions?.prepareImplementation === undefined
      ? { state: "unavailable", reason: "project-session-implementation-prepare-unavailable" }
      : { state: "available" },
    launch: options.typedEntryPlanner?.capabilities.launch ?? {
      state: "unavailable",
      reason: "typed-planner-unregistered",
    },
    git: options.typedEntryPlanner?.capabilities.git ?? {
      state: "unavailable",
      reason: "typed-planner-unregistered",
    },
    promotion: options.typedEntryPlanner?.capabilities.promotion ?? {
      state: "unavailable",
      reason: "typed-planner-unregistered",
    },
  };

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
    const overrideKey = envelope.kind === "operator-action"
      ? `${input.eventId}\0${sha256(envelope.request.intent)}`
      : null;
    const revision = overrideKey === null
      ? expectedRevision(envelope, input.dataset, options.projectId)
      : typedRevisionOverrides.get(overrideKey) ??
        expectedRevision(envelope, input.dataset, options.projectId);
    validateDirectRequest(envelope, options, revision, input.eventId);
    let review: ConsoleWorkflowReview;
    let daemonPreview: OperatorActionPreview | undefined;
    if (envelope.kind === "scoped-gate-resolve") {
      const gateId = envelope.request.gateId;
      if (typeof gateId !== "string") throw new TypeError("scoped-gate-resolve requires gateId");
      const gateBinding = gateBindingOverrides.get(`${input.eventId}\0${gateId}`);
      const session = liveSession(input.dataset);
      const gateRead = options.client.console?.gates.read;
      if (gateRead === undefined) throw new Error("scoped gate read is unavailable");
      const current = await gateRead({
        credential: options.credential,
        projectId: options.projectId,
        projectSessionId: session.projectSessionId,
        gateId: gateId as never,
        ...(gateBinding === undefined ? {} : { expectedRevision: gateBinding.revision }),
      });
      const gate = current.gate;
      if (gate.projectSessionId !== session.projectSessionId) {
        throw new Error("scoped gate belongs to another project session");
      }
      if (gate.status !== "pending" && gate.status !== "deferred") {
        throw new Error("scoped gate is no longer open");
      }
      if (
        gateBinding !== undefined &&
        (
          current.status !== "current" ||
          gate.revision !== gateBinding.revision ||
          gate.coordinationRunId !== gateBinding.coordinationRunId
        )
      ) {
        throw new Error("guided Attention gate binding is stale");
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
      daemonPreview = typedPreviewOverrides.get(`${input.eventId}\0${sha256(request.intent)}`) ??
        await actions.preview(request);
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

  const prepareGuided = async (input: Readonly<{
    action: GuidedWorkflowAction;
    binding: ConsoleInspectionBinding;
    raw: string;
    dataset: FabricConsoleDataset;
    eventId: string;
    artifactConfirmation?: GuidedArtifactConfirmation;
  }>): Promise<ConsoleWorkflowReview> => {
    if (input.dataset.snapshotRevision !== input.binding.projectionRevision) {
      throw new Error("guided workflow projection revision is stale");
    }
    if (input.binding.view === "attention") {
      const selectedRow = exactGuidedRow(input.dataset, input.binding);
      if (input.action === "discuss") {
        throw new Error("attention-intake-binding-unavailable");
      }
      if (
        input.action !== "accept" &&
        input.action !== "request-changes" &&
        input.action !== "defer"
      ) {
        throw new Error(`${input.action} is unavailable for Attention`);
      }
      if (selectedRow.summary?.kind !== "attention" || selectedRow.summary.gateBinding === undefined) {
        throw new Error("attention-gate-binding-unavailable");
      }
      const fields = guidedFields(input.raw);
      if (Object.keys(fields).length > 0) {
        throw new ConsoleGuidedInputError(
          "CONSOLE_GUIDED_ATTENTION_FIELDS_INVALID",
          "guided Attention decisions use the selected gate and accept no fields",
        );
      }
      const gateBinding = selectedRow.summary.gateBinding;
      const status = input.action === "accept"
        ? "approved"
        : input.action === "defer"
          ? "deferred"
          : "rejected";
      const overrideKey = `${input.eventId}\0${gateBinding.gateId}`;
      gateBindingOverrides.set(overrideKey, {
        revision: gateBinding.gateRevision,
        coordinationRunId: gateBinding.coordinationRunId,
      });
      try {
        return await prepare({
          raw: JSON.stringify({
            kind: "scoped-gate-resolve",
            request: { gateId: gateBinding.gateId, status },
          }),
          dataset: input.dataset,
          eventId: input.eventId,
        });
      } finally {
        gateBindingOverrides.delete(overrideKey);
      }
    }
    if (
      input.action === "implement" || input.action === "launch" ||
      input.action === "git" || input.action === "promotion"
    ) {
      if (input.action === "implement") {
        const capability = capabilities.implement;
        if (capability === undefined || capability.state === "unavailable") {
          throw new Error(capability?.reason ?? "project-session-implementation-prepare-unavailable");
        }
        const fields = guidedFields(input.raw);
        if (Object.keys(fields).sort().join(",") !== "intake,launch-packet-path,packet,resource-plan") {
          throw new ConsoleGuidedInputError(
            "CONSOLE_GUIDED_IMPLEMENT_FIELDS_INVALID",
            "guided Implement requires exactly intake, launch-packet-path, packet and resource-plan",
          );
        }
        const inspection = exactArtifactInspection(
          input.dataset,
          input.binding,
          input.artifactConfirmation,
        );
        const intakes = options.client.intakes;
        if (intakes === undefined) throw new Error("intake protocol is unavailable");
        const intake = await intakes.read({
          credential: options.credential,
          intakeId: requiredGuidedField(fields, "intake") as never,
        });
        const session = liveSession(input.dataset);
        if (
          (session.state !== "draft" && session.state !== "awaiting_launch") || intake.state !== "accepted" ||
          intake.projectId !== options.projectId ||
          intake.acceptedScopeRef?.path !== inspection.result.artifactRef.path ||
          intake.acceptedScopeRef.digest !== inspection.result.artifactRef.digest ||
          (inspection.result.coordinationRunId !== null && inspection.result.coordinationRunId !== intake.coordinationRunId)
        ) {
          throw new Error("guided Implement requires the exact accepted evidence and preparable project session");
        }
        const resourcePlan = parseLaunchResourcePlanV1(
          guidedJsonField(fields, "resource-plan"),
          "guidedImplement.resourcePlan",
        );
        const rawPacket = guidedJsonField(fields, "packet");
        if (!isRecord(rawPacket) || !isRecord(rawPacket.resourcePlanRef) || typeof rawPacket.resourcePlanRef.path !== "string") {
          throw new ConsoleGuidedInputError(
            "CONSOLE_GUIDED_IMPLEMENT_PACKET_INVALID",
            "guided Implement packet requires a resourcePlanRef path",
          );
        }
        const resourcePlanRef = {
          path: rawPacket.resourcePlanRef.path,
          digest: sha256(resourcePlan),
        };
        const launchPacket = parseLaunchPacketV1(
          { ...rawPacket, resourcePlanRef },
          "guidedImplement.launchPacket",
        );
        const launchPacketRef = {
          path: requiredGuidedField(fields, "launch-packet-path"),
          digest: sha256(launchPacket),
        };
        if (
          session.state === "awaiting_launch" &&
          (
            session.launchPacketRef.path !== launchPacketRef.path ||
            session.launchPacketRef.digest !== launchPacketRef.digest
          )
        ) {
          throw new Error("guided Implement recovery requires the session's exact committed launch packet");
        }
        if (
          launchPacket.projectId !== options.projectId ||
          launchPacket.projectSessionId !== session.projectSessionId ||
          launchPacket.topologyMode !== session.mode ||
          launchPacket.budgetRef !== session.budgetRef ||
          resourcePlan.projectId !== options.projectId ||
          resourcePlan.projectSessionId !== session.projectSessionId ||
          resourcePlan.runId !== launchPacket.runId ||
          resourcePlan.budgetRef !== session.budgetRef ||
          launchPacket.chairAuthority.approval.evidenceDigest !== inspection.result.artifactRef.digest ||
          canonical(launchPacket.chairAuthority.budget) !== canonical(resourcePlan.scopes.coordinationRun.limits)
        ) {
          throw new Error("guided Implement packet authority, budget or session binding is inconsistent");
        }
        if (Date.parse(launchPacket.chairAuthority.expiresAt) <= now()) {
          throw new Error("guided Implement packet authority has expired");
        }
        return await prepare({
          raw: JSON.stringify({
            kind: "project-session-launch-packet-prepare",
            request: {
              projectId: options.projectId,
              projectSessionId: session.projectSessionId,
              expectedSessionGeneration: session.generation,
              intakeId: intake.intakeId,
              acceptedScopeRef: inspection.result.artifactRef,
              launchPacketRef,
              resourcePlanRef,
              launchPacket,
              resourcePlan,
            },
          }),
          dataset: input.dataset,
          eventId: input.eventId,
        });
      }
      const kind: ConsoleTypedEntryKind = input.action;
      const capability = capabilities[kind];
      if (capability.state === "unavailable") throw new Error(capability.reason);
      const typedEntryPlanner = options.typedEntryPlanner;
      if (typedEntryPlanner === undefined) {
        throw new Error("typed entry planner is unavailable");
      }
      if (
        (kind === "launch" || kind === "git") && input.binding.view !== "project"
      ) {
        throw new Error(`${kind} must start from the selected Project row`);
      }
      if (kind === "launch") {
        const fields = guidedFields(input.raw);
        if (Object.keys(fields).length !== 0) {
          throw new ConsoleGuidedInputError(
            "CONSOLE_GUIDED_LAUNCH_FIELDS_INVALID",
            "guided Launch uses the reviewed session launch packet and accepts no fields",
          );
        }
        const session = liveSession(input.dataset);
        if (session.state === "launching" || session.state === "launch_ambiguous") {
          exactGuidedRow(input.dataset, input.binding);
          const actions = options.client.console?.actions;
          if (actions === undefined) throw new Error("operator action status is unavailable");
          const commandId = consoleLaunchCommandId({
            phase: "commit",
            operatorId: options.operatorId,
            projectId: options.projectId,
            projectSessionId: session.projectSessionId,
            sessionGeneration: session.generation,
            launchPacketRef: session.launchPacketRef,
          });
          const status = await actions.status({
            credential: options.credential,
            projectId: options.projectId,
            commandId,
          });
          if (status.status === "not-found") {
            throw new Error("launch recovery command was not found for the selected session binding");
          }
          const intentDigest = status.status === "committed"
            ? status.receipt.intentDigest
            : status.intentDigest;
          const recoveryBase: ConsoleWorkflowReview = {
            workflowId: stableId("launch_recovery", commandId),
            kind: "operator-action",
            source: "daemon-preview",
            stage: "pending",
            previewDigest: intentDigest,
            expectedRevision: revisionFromProtocol(session.revision),
            consequenceClass: "consequential",
            confirmationMode: "explicit",
            summary: "project-session-launch recovery",
            details: [
              { label: "projectSessionId", value: session.projectSessionId },
              { label: "commandId", value: commandId },
            ],
            evidence: [],
            openedByEventId: input.eventId,
            armedByEventId: null,
            result: null,
            failure: null,
          };
          const recovered = launchSettlementReview(recoveryBase, status);
          if (recovered.stage === "pending" || recovered.stage === "ambiguous") {
            prepared.set(recovered.workflowId, {
              review: recovered,
              request: {},
              commitCommandId: commandId,
            });
          }
          return recovered;
        }
      }
      const built = await typedEntryPlanner.buildIntent({
        kind,
        fields: guidedFields(input.raw),
        eventId: input.eventId,
        binding: input.binding,
        dataset: input.dataset,
      });
      if (!Number.isSafeInteger(built.expectedRevision) || built.expectedRevision < 1) {
        throw new Error(`typed ${kind} planner returned an invalid expected revision`);
      }
      const intent = built.intent;
      const expectedKind = kind === "launch" ? "project-session-launch" : kind;
      if (intent.kind !== expectedKind) {
        throw new Error(`typed ${kind} planner returned ${intent.kind}`);
      }
      const overrideKey = `${input.eventId}\0${sha256(intent)}`;
      typedRevisionOverrides.set(overrideKey, built.expectedRevision);
      if (built.daemonPreview !== undefined) {
        typedPreviewOverrides.set(overrideKey, built.daemonPreview);
      }
      try {
        return await prepare({
          raw: JSON.stringify({ kind: "operator-action", request: { intent } }),
          dataset: input.dataset,
          eventId: input.eventId,
        });
      } finally {
        typedRevisionOverrides.delete(overrideKey);
        typedPreviewOverrides.delete(overrideKey);
      }
    }
    if (
      input.action !== "discuss" &&
      input.action !== "accept" &&
      input.action !== "request-changes" &&
      input.action !== "defer"
    ) {
      throw new Error(`${input.action} typed planner is unavailable`);
    }
    const intakes = options.client.intakes;
    if (intakes === undefined) throw new Error("intake protocol is unavailable");
    const fields = guidedFields(input.raw);
    assertGuidedIntakeFields(fields, input.action);
    const intakeId = requiredGuidedField(fields, "intake");
    const intake = await intakes.read({
      credential: options.credential,
      intakeId: intakeId as never,
    });
    if (intake.projectId !== options.projectId) {
      throw new Error("guided intake belongs to another project");
    }
    if (intake.state === "draft") {
      throw new Error("guided intake is not bound to a project session");
    }
    const session = liveSession(input.dataset);
    if (intake.projectSessionId !== session.projectSessionId) {
      throw new Error("guided intake belongs to another project session");
    }
    const inspection = input.binding.view === "evidence" && input.action === "accept"
      ? exactArtifactInspection(
          input.dataset,
          input.binding,
          input.artifactConfirmation,
        )
      : input.dataset.inspection?.kind === "artifact" &&
          input.dataset.inspection.state === "current" &&
          input.dataset.inspection.binding.itemId === input.binding.itemId &&
          input.dataset.inspection.binding.itemRevision === input.binding.itemRevision &&
          input.dataset.inspection.binding.projectionRevision === input.binding.projectionRevision
        ? input.dataset.inspection
        : null;
    if (
      inspection !== null &&
      inspection.result.coordinationRunId !== null &&
      inspection.result.coordinationRunId !== intake.coordinationRunId
    ) {
      throw new Error("guided evidence belongs to another coordination run");
    }
    const artifactRefs = inspection === null
      ? intake.artifactRefs
      : appendArtifact(intake.artifactRefs, inspection.result.artifactRef);
    const state = guidedIntakeState(input.action);
    const summary = fields.summary ?? intake.summary;
    const chairRequest = input.action === "discuss" || input.action === "request-changes"
      ? successorChairRequest({
          intake,
          artifactRefs,
          summary,
          clientId: options.clientId,
          eventId: input.eventId,
          nowMs: now(),
        })
      : undefined;
    const request = {
      intakeId: intake.intakeId,
      projectSessionId: intake.projectSessionId,
      coordinationRunId: intake.coordinationRunId,
      expectedRevision: intake.revision,
      state,
      summary,
      artifactRefs,
      gateIds: intake.gateIds,
      ...(chairRequest === undefined ? {} : { chairRequest }),
      ...(state === "accepted"
        ? { acceptedScopeRef: inspection?.result.artifactRef }
        : {}),
    };
    if (state === "accepted" && request.acceptedScopeRef === undefined) {
      throw new Error("guided acceptance requires an exact reviewed artifact");
    }
    return await prepare({
      raw: JSON.stringify({ kind: "intake-revise", request }),
      dataset: input.dataset,
      eventId: input.eventId,
    });
  };

  const commit = async (input: Readonly<{
    review: ConsoleWorkflowReview;
    eventId: string;
    echoText?: string;
  }>): Promise<Readonly<{
    review: ConsoleWorkflowReview;
    reconnectProjectSessionId: ProjectSessionId | null;
  }>> => {
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
    let launchStatus: OperatorActionStatus | undefined;
    let launchCommandId: CommandId | undefined;
    let implementationRequest: ProjectSessionLaunchPacketPrepareRequest | undefined;
    let reconnectProjectSessionId: ProjectSessionId | null = null;
    try {
      switch (stored.review.kind) {
        case "project-session-create": {
          const client = options.client.projectSessions;
          if (client?.create === undefined) throw new Error("project-session creation is unavailable");
          const request = parseOperation<ProjectSessionCreateRequest>(
            FABRIC_OPERATIONS.projectSessionCreate,
            { ...stored.request, command },
          );
          const created = await client.create(request);
          result = created;
          reconnectProjectSessionId = created.projectSessionId;
          break;
        }
        case "project-session-transition": {
          const client = options.client.projectSessions;
          if (client?.transition === undefined) throw new Error("project-session transition is unavailable");
          result = await client.transition(parseOperation<ProjectSessionTransitionRequest>(
            FABRIC_OPERATIONS.projectSessionTransition,
            { ...stored.request, command },
          ));
          break;
        }
        case "project-session-close": {
          const client = options.client.projectSessions;
          if (client?.close === undefined) throw new Error("project-session acceptance is unavailable");
          result = await client.close(parseOperation<ProjectSessionCloseRequest>(
            FABRIC_OPERATIONS.projectSessionClose,
            { ...stored.request, command },
          ));
          break;
        }
        case "project-session-launch-packet-prepare": {
          const client = options.client.projectSessions;
          if (client?.prepareImplementation === undefined) {
            throw new Error("project-session implementation preparation is unavailable");
          }
          const provisional = parseOperation<ProjectSessionLaunchPacketPrepareRequest>(
            FABRIC_OPERATIONS.projectSessionLaunchPacketPrepare,
            { ...stored.request, command },
          );
          const implementationCommandId = consoleImplementationCommandId({
            operatorId: options.operatorId,
            projectId: provisional.projectId,
            projectSessionId: provisional.projectSessionId,
            sessionGeneration: provisional.expectedSessionGeneration,
            acceptedScopeRef: provisional.acceptedScopeRef,
            launchPacketRef: provisional.launchPacketRef,
            resourcePlanRef: provisional.resourcePlanRef,
          });
          implementationRequest = parseOperation<ProjectSessionLaunchPacketPrepareRequest>(
            FABRIC_OPERATIONS.projectSessionLaunchPacketPrepare,
            {
              ...stored.request,
              command: {
                ...command,
                commandId: implementationCommandId,
                provenance: {
                  kind: "console-direct-input",
                  clientId: "console_implementation_custody" as OperatorClientId,
                  inputEventId: implementationCommandId,
                },
              },
            },
          );
          prepared.set(input.review.workflowId, {
            ...stored,
            review: pending,
            commitCommandId: implementationCommandId,
          });
          result = await client.prepareImplementation(implementationRequest);
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
          if (preview.intent.kind === "project-session-launch") {
            launchCommandId = consoleLaunchCommandId({
              phase: "commit",
              operatorId: options.operatorId,
              projectId: preview.intent.projectId,
              projectSessionId: preview.intent.projectSessionId,
              sessionGeneration: preview.intent.expectedSessionGeneration,
              launchPacketRef: preview.intent.launchPacketRef,
            });
            prepared.set(input.review.workflowId, {
              ...stored,
              review: pending,
              commitCommandId: launchCommandId,
            });
          }
          const effectiveCommand = launchCommandId === undefined
            ? command
            : {
                ...command,
                commandId: launchCommandId,
                provenance: {
                  kind: "console-direct-input" as const,
                  clientId: "console_launch_custody" as OperatorClientId,
                  inputEventId: launchCommandId,
                },
              };
          const confirmation = preview.confirmationMode === "echo"
            ? { kind: "echo" as const, echoedPreviewDigest: preview.previewDigest }
            : {
                kind: "explicit" as const,
                confirmationId: stableId(
                  "confirmation",
                  launchCommandId ?? input.eventId,
                  preview.previewDigest,
                ),
              };
          const committed = await actions.commit(parseOperation<OperatorActionCommitRequest>(
            FABRIC_OPERATIONS.operatorActionCommit,
            {
              command: effectiveCommand,
              projectId: options.projectId,
              previewId: preview.previewId,
              expectedPreviewRevision: preview.previewRevision,
              previewDigest: preview.previewDigest,
              expectedIntentDigest: preview.intentDigest,
              confirmation,
            },
          ));
          result = committed;
          if (preview.intent.kind === "project-session-launch") {
            launchStatus = await actions.status({
              credential: options.credential,
              projectId: options.projectId,
              commandId: launchCommandId ?? command.commandId,
            });
          }
          break;
        }
      }
    } catch (error: unknown) {
      if (implementationRequest !== undefined) {
        const firstFailureCode = isRecord(error) && typeof error.code === "string" ? error.code : undefined;
        const client = options.client.projectSessions;
        if (firstFailureCode !== undefined) {
          implementationRequest = undefined;
        } else if (client?.prepareImplementation !== undefined) {
          try {
            result = await client.prepareImplementation(implementationRequest);
          } catch (replayError: unknown) {
            const replayFailureCode = isRecord(replayError) && typeof replayError.code === "string"
              ? replayError.code
              : undefined;
            if (replayFailureCode !== undefined) {
              return {
                review: { ...pending, stage: "conflict", failure: replayFailureCode },
                reconnectProjectSessionId: null,
              };
            }
            const unresolved: ConsoleWorkflowReview = {
              ...pending,
              stage: "ambiguous",
              result: `project-session-launch-packet-prepare | ${implementationRequest.command.commandId} | replay-unavailable`,
              failure: "IMPLEMENT_REPLAY_UNAVAILABLE",
            };
            prepared.set(input.review.workflowId, {
              ...stored,
              review: unresolved,
              commitCommandId: implementationRequest.command.commandId,
            });
            return { review: unresolved, reconnectProjectSessionId: null };
          }
        }
      }
      if (launchCommandId !== undefined) {
        const actions = options.client.console?.actions;
        if (actions !== undefined) {
          try {
            launchStatus = await actions.status({
              credential: options.credential,
              projectId: options.projectId,
              commandId: launchCommandId,
            });
          } catch {
            const unresolved: ConsoleWorkflowReview = {
              ...pending,
              result: `operator-action | ${launchCommandId} | status-unavailable`,
              failure: "LAUNCH_STATUS_UNAVAILABLE",
            };
            prepared.set(input.review.workflowId, {
              ...stored,
              review: unresolved,
              commitCommandId: launchCommandId,
            });
            return { review: unresolved, reconnectProjectSessionId: null };
          }
        }
      }
      if (launchStatus === undefined && implementationRequest === undefined) {
        const failureCode = isRecord(error) && typeof error.code === "string" &&
            /^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(error.code)
          ? error.code
          : "WORKFLOW_COMMIT_FAILED";
        const failed: ConsoleWorkflowReview = {
          ...pending,
          stage: "conflict",
          failure: failureCode,
        };
        return { review: failed, reconnectProjectSessionId: null };
      }
    }
    if (launchStatus !== undefined) {
      const settled = launchSettlementReview(pending, launchStatus);
      if (settled.stage === "pending" || settled.stage === "ambiguous") {
        prepared.set(input.review.workflowId, {
          ...stored,
          review: settled,
          commitCommandId: launchStatus.commandId as CommandId,
        });
      } else {
        prepared.delete(input.review.workflowId);
      }
      return { review: settled, reconnectProjectSessionId: null };
    }
    prepared.delete(input.review.workflowId);
    const completed: ConsoleWorkflowReview = {
      ...pending,
      stage: "committed",
      result: resultSummary(stored.review.kind, result),
    };
    return {
      review: completed,
      reconnectProjectSessionId,
    };
  };

  const observe = async (input: Readonly<{
    review: ConsoleWorkflowReview;
    eventId: string;
  }>): Promise<ConsoleWorkflowReview> => {
    const stored = prepared.get(input.review.workflowId);
    if (
      stored === undefined ||
      canonical(stored.review) !== canonical(input.review) ||
      (input.review.stage !== "pending" && input.review.stage !== "ambiguous") ||
      stored.commitCommandId === undefined
    ) {
      throw new Error("Console workflow settlement is stale or unavailable");
    }
    if (input.review.kind === "project-session-launch-packet-prepare") {
      const client = options.client.projectSessions;
      if (client?.prepareImplementation === undefined) {
        throw new Error("project-session implementation preparation is unavailable");
      }
      const commandId = stored.commitCommandId;
      const command = mutationContext(
        options,
        commandId,
        "commit",
        Number(stored.review.expectedRevision),
        stored.review.previewDigest,
      );
      try {
        const result = await client.prepareImplementation(parseOperation<ProjectSessionLaunchPacketPrepareRequest>(
          FABRIC_OPERATIONS.projectSessionLaunchPacketPrepare,
          {
            ...stored.request,
            command: {
              ...command,
              commandId,
              provenance: {
                kind: "console-direct-input",
                clientId: "console_implementation_custody" as OperatorClientId,
                inputEventId: commandId,
              },
            },
          },
        ));
        prepared.delete(input.review.workflowId);
        return {
          ...input.review,
          stage: "committed",
          result: resultSummary(input.review.kind, result),
          failure: null,
        };
      } catch {
        return input.review;
      }
    }
    const actions = options.client.console?.actions;
    if (actions === undefined) throw new Error("operator action status is unavailable");
    const status = await actions.status({
      credential: options.credential,
      projectId: options.projectId,
      commandId: stored.commitCommandId,
    });
    const settled = launchSettlementReview(input.review, status);
    if (settled.stage === "pending" || settled.stage === "ambiguous") {
      prepared.set(input.review.workflowId, { ...stored, review: settled });
    } else {
      prepared.delete(input.review.workflowId);
    }
    return settled;
  };

  return { capabilities, prepare, prepareGuided, arm, commit, observe };
}
