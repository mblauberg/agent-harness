import { createHash } from "node:crypto";

import {
  NATIVE_NOTIFICATION_PROJECTION_FEATURE,
  type ArtifactContentClient,
  type ArtifactContentReadResult,
  type ArtifactContentTransformation,
  type ArtifactLineFragment,
  type ArtifactMediaType,
  type ArtifactRef,
  type CoordinationRunId,
  type EvidenceKind,
  type EvidenceSourceKind,
  type NegotiatedOperatorClient,
  type GitRepositoryReadClient,
  type GitRepositoryReadRequest,
  type GitRepositoryProjection,
  type MessageBodyClient,
  type MessageBodyReadResult,
  type MessageBodyRef,
  type OperatorActionClient,
  type OperatorCapabilityCredential,
  type OperatorDetailReadRequest,
  type OperatorDetailReadResult,
  type OperatorProjectionSnapshot,
  type OperatorViewPageRequest,
  type OperatorViewPageResult,
  type ProjectId,
  type ProjectSessionDiscovery,
  type ProjectSessionId,
  type ProjectionEventsRequest,
  type ProjectionEventsResult,
  type ProjectionSnapshotRequest,
  type ScopedGateReadRequest,
  type ScopedGateReadResult,
  type Sha256Digest,
  type TaskId,
  type Timestamp,
} from "@local/agent-fabric-protocol";
import { parseArtifactContentReadResult } from "@local/agent-fabric-protocol";

import { readConsoleMessageBody } from "./message.js";

import {
  FABRIC_VIEWS,
  createEmptyViewPages,
  mapProtocolRow,
  rankConsoleRows,
  revisionFromProtocol,
  revisionToProtocol,
  type ConsoleRow,
  type ConsoleViewPage,
  type ConsoleViewPages,
  type FabricView,
  type ConsoleWorkflowCapabilities,
  type Revision,
} from "./model.js";

export type ConsoleProtocolPort = Readonly<{
  snapshot(
    request: ProjectionSnapshotRequest,
  ): Promise<OperatorProjectionSnapshot>;
  events(request: ProjectionEventsRequest): Promise<ProjectionEventsResult>;
  viewPage(
    request: OperatorViewPageRequest,
  ): Promise<OperatorViewPageResult>;
  readDetail(
    request: OperatorDetailReadRequest,
  ): Promise<OperatorDetailReadResult>;
  readGate(request: ScopedGateReadRequest): Promise<ScopedGateReadResult>;
  readMessageBody: MessageBodyClient["read"] | null;
  readRepository: GitRepositoryReadClient["read"] | null;
  readArtifactContent: ArtifactContentClient["readContent"] | null;
}>;

export type ConsoleArtifactContentPage = Readonly<{
  pageIndex: number;
  lineFragment: ArtifactLineFragment;
  pageContentDigest: Sha256Digest;
  bytes: number;
}>;

export type ConsoleArtifactContentResult = Readonly<{
  artifactRef: ArtifactRef;
  evidenceRevision: number;
  evidenceKind: EvidenceKind;
  sourceKind: EvidenceSourceKind;
  publisherKind: "agent" | "operator" | "fabric" | "project" | "migration";
  publisherRef: string;
  projectSessionId: ProjectSessionId | null;
  coordinationRunId: CoordinationRunId | null;
  taskId: TaskId | null;
  createdAt: Timestamp;
  mediaType: ArtifactMediaType;
  content: string;
  totalBytes: number;
  totalLines: number;
  renderedTotalBytes: number;
  renderedTotalLines: number;
  renderedArtifactDigest: Sha256Digest;
  transformation: ArtifactContentTransformation;
  terminalNeutralised: true;
  capabilityValuesRedacted: true;
  credentialValuesRedacted: true;
  pages: readonly ConsoleArtifactContentPage[];
  coverage: Readonly<{
    complete: true;
    verified: true;
    pageCount: number;
  }>;
  reviewDisposition: "eligible" | "confirm-terminal-neutralised" | "blocked-redacted";
}>;

export type ConsoleProtocolBinding =
  | Readonly<{
      ok: true;
      port: ConsoleProtocolPort;
      readOnly: boolean;
      actions: OperatorActionClient | null;
      nativeNotificationProjection: "daemon-journal" | "legacy-fallback";
      runSessionProjection: "exact";
      compatibility: ConsoleProtocolCompatibility;
    }>
  | Readonly<{
      ok: false;
      missingFeatures: readonly string[];
    }>;

export type ConsoleProtocolCompatibility =
  | Readonly<{ mode: "current" }>
  | Readonly<{
      mode: "legacy-compatibility";
      profile: "strict-v1";
      primary?: Readonly<{ code: string; message: string }>;
    }>;

export type ConsoleSessionCompatibility =
  | Readonly<{ mode: "current" }>
  | Readonly<{
      mode: "legacy-compatibility";
      primary: Readonly<{ code: string; message: string }>;
      retry: Readonly<{ status: "succeeded"; profile: "strict-v1" }>;
    }>;

export function bindConsoleProtocolClient(
  client: NegotiatedOperatorClient,
  sessionCompatibility?: ConsoleSessionCompatibility,
): ConsoleProtocolBinding {
  if (client.projection === undefined || client.console === undefined) {
    const available = new Set<string>(client.features);
    const missingFeatures = [
      "operator-projection.v2",
      "scoped-gate-read.v1",
      "run-session-projection.v1",
    ].filter((feature) => !available.has(feature));
    return {
      ok: false,
      missingFeatures:
        missingFeatures.length > 0
          ? missingFeatures
          : ["operator-console-operations"],
    };
  }
  const projection = client.projection;
  const consoleClient = client.console;
  const nativeNotificationProjection = client.features.includes(
    NATIVE_NOTIFICATION_PROJECTION_FEATURE,
  ) ? "daemon-journal" : "legacy-fallback";
  if (
    (sessionCompatibility?.mode === "current") !==
      (nativeNotificationProjection === "daemon-journal") &&
    sessionCompatibility !== undefined
  ) {
    throw new TypeError("Console session compatibility contradicts negotiated notification projection");
  }
  const compatibility: ConsoleProtocolCompatibility = sessionCompatibility === undefined
    ? nativeNotificationProjection === "daemon-journal"
      ? { mode: "current" }
      : { mode: "legacy-compatibility", profile: "strict-v1" }
    : sessionCompatibility.mode === "current"
      ? sessionCompatibility
      : {
          mode: "legacy-compatibility",
          profile: sessionCompatibility.retry.profile,
          primary: sessionCompatibility.primary,
        };
  const artifacts = client.artifacts;
  const artifactRead: ArtifactContentClient["readContent"] | null =
    artifacts === undefined
      ? null
      : (request) => artifacts.readContent(request);
  return {
    ok: true,
    readOnly: consoleClient.readOnly,
    actions: consoleClient.readOnly ? null : consoleClient.actions,
    nativeNotificationProjection,
    runSessionProjection: "exact",
    compatibility,
    port: {
      snapshot: (request) => projection.snapshot(request),
      events: (request) => projection.events(request),
      viewPage: (request) => consoleClient.projection.viewPage(request),
      readDetail: (request) => consoleClient.projection.readDetail(request),
      readGate: (request) => consoleClient.gates.read(request),
      readMessageBody: client.messages?.read ?? null,
      readRepository: client.repository?.read ?? null,
      readArtifactContent: artifactRead,
    },
  };
}

export type ConsoleConnection =
  | Readonly<{
      state: "live";
      compatibility: ConsoleProtocolCompatibility;
    }>
  | Readonly<{
      state: "degraded" | "unavailable";
      reason:
        | "transport-failure"
        | "projection-invalid"
        | "resnapshot-exhausted"
        | "bootstrap-unavailable";
    }>
  | Readonly<{
      state: "unsupported";
      missingFeatures: readonly string[];
    }>
  | Readonly<{
      state: "protocol-incompatible";
      code: "PROTOCOL_INCOMPATIBLE" | "CONSOLE_PROTOCOL_INCOMPATIBLE";
      message: string;
      operation: string | null;
      closedReason: string | null;
      primary: Readonly<{ code: string; message: string }>;
      retry?: Readonly<{
        status: "succeeded" | "failed";
        profile: "strict-v1";
        failure?: Readonly<{ code: string; message: string }>;
      }>;
    }>;

export type ConsoleInspectionBinding = Readonly<{
  view: FabricView;
  itemId: string;
  itemRevision: Revision;
  projectionRevision: Revision;
}>;

export type ConsoleReadInspection =
  | Readonly<{
      kind: "message";
      state: "current";
      binding: ConsoleInspectionBinding;
      result: Extract<MessageBodyReadResult, { available: true }>;
    }>
  | Readonly<{
      kind: "message";
      state: "unavailable";
      binding: ConsoleInspectionBinding;
      reason:
        | "feature-unavailable"
        | "message-not-found"
        | "message-forbidden"
        | "message-expired"
        | "projection-changed"
        | "contract-invalid"
        | "transport-failure";
    }>
  | Readonly<{
      kind: "repository";
      state: "current";
      binding: ConsoleInspectionBinding;
      readTransactionId: string;
      repository: GitRepositoryProjection;
    }>
  | Readonly<{
      kind: "repository";
      state: "unavailable";
      binding: ConsoleInspectionBinding;
      reason:
        | "feature-unavailable"
        | "projection-changed"
        | "detail-unavailable"
        | "detail-conflict"
        | "detail-invalid"
        | "repository-resnapshot-required"
        | "contract-invalid"
        | "transport-failure";
    }>
  | Readonly<{
      kind: "artifact";
      state: "current";
      binding: ConsoleInspectionBinding;
      readTransactionId: string;
      result: ConsoleArtifactContentResult;
    }>
  | Readonly<{
      kind: "artifact";
      state: "unavailable";
      binding: ConsoleInspectionBinding;
      reason:
        | "feature-unavailable"
        | "projection-changed"
        | "detail-unavailable"
        | "detail-conflict"
        | "detail-invalid"
        | "artifact-not-found"
        | "artifact-forbidden"
        | "artifact-unsupported-media"
        | "artifact-unsafe-content"
        | "artifact-stale"
        | "artifact-oversized"
        | "contract-invalid"
        | "transport-failure";
    }>;

function unavailableMessage(
  binding: ConsoleInspectionBinding,
  reason: Extract<ConsoleReadInspection, { kind: "message"; state: "unavailable" }>["reason"],
): ConsoleReadInspection {
  return { kind: "message", state: "unavailable", binding, reason };
}

function unavailableRepository(
  binding: ConsoleInspectionBinding,
  reason: Extract<ConsoleReadInspection, { kind: "repository"; state: "unavailable" }>["reason"],
): ConsoleReadInspection {
  return { kind: "repository", state: "unavailable", binding, reason };
}

function unavailableArtifact(
  binding: ConsoleInspectionBinding,
  reason: Extract<ConsoleReadInspection, { kind: "artifact"; state: "unavailable" }>["reason"],
): ConsoleReadInspection {
  return { kind: "artifact", state: "unavailable", binding, reason };
}

function failureCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MAX_ARTIFACT_PAGES = 2_048;
const MAX_ARTIFACT_RENDERED_BYTES = 2_097_152;

function contentDigest(value: string): Sha256Digest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}` as Sha256Digest;
}

function artifactLineCount(value: string): number {
  if (value.length === 0) return 0;
  let lines = 1;
  for (const byte of Buffer.from(value, "utf8")) {
    if (byte === 0x0a) lines += 1;
  }
  return lines;
}

function returnedPageLineCount(value: string): number {
  if (value.length === 0) return 0;
  const lines = artifactLineCount(value);
  return value.endsWith("\n") ? lines - 1 : lines;
}

function sameArtifactRef(left: ArtifactRef, right: ArtifactRef): boolean {
  return left.path === right.path && left.digest === right.digest;
}

function expectedLineFragment(input: {
  startsAtLineBoundary: boolean;
  endsAtLineBoundary: boolean;
}): ArtifactLineFragment {
  return input.startsAtLineBoundary
    ? input.endsAtLineBoundary ? "whole" : "start"
    : input.endsAtLineBoundary ? "end" : "middle";
}

function reviewDisposition(
  transformation: ArtifactContentTransformation,
): ConsoleArtifactContentResult["reviewDisposition"] {
  if (transformation === "none") return "eligible";
  if (transformation === "terminal-neutralised") {
    return "confirm-terminal-neutralised";
  }
  return "blocked-redacted";
}

export type FabricConsoleDataset = Readonly<{
  connection: ConsoleConnection;
  snapshot: OperatorProjectionSnapshot | null;
  snapshotRevision: Revision | null;
  cursor: number;
  pages: ConsoleViewPages;
  loadedAtMs: number;
  canMutate: boolean;
  projectSessions?: Readonly<{
    choices: readonly ProjectSessionDiscovery[];
    selectedProjectSessionId: ProjectSessionId | null;
  }>;
  workflowCapabilities?: ConsoleWorkflowCapabilities;
  productionActionPlanning?: true;
  inspection?: ConsoleReadInspection;
}>;

export type ConsoleProtocolAdapterOptions = Readonly<{
  binding: ConsoleProtocolBinding;
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  projectSessionId?: ProjectSessionId;
  now?: () => number;
  pageLimit?: number;
  eventLimit?: number;
  maxPagesPerView?: number;
  maxResnapshotAttempts?: number;
}>;

export type BootstrapUnavailableReason =
  | "feature-unavailable"
  | "configuration-missing"
  | "start-failed"
  | "authority-unavailable";

export function createBootstrapUnavailableDataset(
  reason: BootstrapUnavailableReason,
  nowMs = Date.now(),
): FabricConsoleDataset {
  const pages = createEmptyViewPages();
  const revision = revisionFromProtocol(0);
  return {
    connection: { state: "unavailable", reason: "bootstrap-unavailable" },
    snapshot: null,
    snapshotRevision: null,
    cursor: 0,
    pages: {
      ...pages,
      system: {
        view: "system",
        rows: [
          {
            view: "system",
            stableId: "bootstrap",
            revision,
            urgency: "safety-integrity",
            freshness: {
              state: "unavailable",
              source: "fabric",
              revision,
              observedAt: new Date(nowMs).toISOString() as never,
              ageMs: 0,
              reason,
            },
            summary: null,
            detailRef: null,
            actionAvailability: {
              state: "read-only",
              reason: "fact-unavailable",
            },
          },
        ],
        nextCursor: 0,
        hasMore: false,
        snapshotRevision: null,
        readTransactionId: null,
      },
    },
    loadedAtMs: nowMs,
    canMutate: false,
  };
}

export function createProtocolIncompatibleDataset(
  input: Readonly<{
    primary: Readonly<{ code: string; message: string }>;
    retry?: Readonly<{
      status: "succeeded" | "failed";
      profile: "strict-v1";
      failure?: Readonly<{ code: string; message: string }>;
    }>;
    result?: Readonly<{
      operation?: string;
      closedReason?: string;
      message?: string;
    }>;
  }>,
  nowMs = Date.now(),
): FabricConsoleDataset {
  return {
    connection: {
      state: "protocol-incompatible",
      code: "CONSOLE_PROTOCOL_INCOMPATIBLE",
      message: input.result?.message ?? input.primary.message,
      operation: input.result?.operation ?? null,
      closedReason: input.result?.closedReason ?? null,
      primary: input.primary,
      ...(input.retry === undefined ? {} : { retry: input.retry }),
    },
    snapshot: null,
    snapshotRevision: null,
    cursor: 0,
    pages: createEmptyViewPages(),
    loadedAtMs: nowMs,
    canMutate: false,
  };
}

class ResnapshotRequiredError extends Error {
  constructor() {
    super("projection resnapshot required");
  }
}

class ProjectionInvalidError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function boundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`limit must be an integer from 1 to ${String(maximum)}`);
  }
  return value;
}

export class ConsoleProtocolAdapter {
  readonly #binding: ConsoleProtocolBinding;
  readonly #credential: OperatorCapabilityCredential;
  readonly #projectId: ProjectId;
  readonly #projectSessionId: ProjectSessionId | undefined;
  readonly #now: () => number;
  readonly #pageLimit: number;
  readonly #eventLimit: number;
  readonly #maxPagesPerView: number;
  readonly #maxResnapshotAttempts: number;
  #lastGood: FabricConsoleDataset | null = null;

  constructor(options: ConsoleProtocolAdapterOptions) {
    this.#binding = options.binding;
    this.#credential = options.credential;
    this.#projectId = options.projectId;
    this.#projectSessionId = options.projectSessionId;
    this.#now = options.now ?? Date.now;
    this.#pageLimit = boundedPositiveInteger(options.pageLimit, 100, 1_000);
    this.#eventLimit = boundedPositiveInteger(options.eventLimit, 100, 1_000);
    this.#maxPagesPerView = boundedPositiveInteger(
      options.maxPagesPerView,
      100,
      1_000,
    );
    this.#maxResnapshotAttempts = boundedPositiveInteger(
      options.maxResnapshotAttempts,
      3,
      10,
    );
  }

  get actionClient(): OperatorActionClient | null {
    if (
      this.#binding.ok === false ||
      this.#binding.readOnly ||
      this.#lastGood?.connection.state !== "live"
    ) {
      return null;
    }
    return this.#binding.actions;
  }

  get port(): ConsoleProtocolPort | null {
    return this.#binding.ok ? this.#binding.port : null;
  }

  async open(): Promise<FabricConsoleDataset> {
    if (!this.#binding.ok) {
      return this.#unsupported();
    }
    return this.#loadWithFallback();
  }

  async refresh(): Promise<FabricConsoleDataset> {
    return this.open();
  }

  async poll(): Promise<FabricConsoleDataset> {
    if (!this.#binding.ok) {
      return this.#unsupported();
    }
    if (this.#lastGood?.snapshotRevision === null || this.#lastGood === null) {
      return this.#loadWithFallback();
    }
    try {
      const result = await this.#binding.port.events({
        ...this.#readScope(),
        after: this.#lastGood.cursor,
        limit: this.#eventLimit,
      });
      if (result.status === "resnapshot-required") {
        return this.#loadWithFallback();
      }
      if (
        result.events.length > 0 ||
        result.snapshotRevision !==
          revisionToProtocol(this.#lastGood.snapshotRevision)
      ) {
        return this.#loadWithFallback();
      }
      const current: FabricConsoleDataset = {
        ...this.#lastGood,
        cursor: result.nextCursor,
        connection: {
          state: "live",
          compatibility: this.#binding.compatibility,
        },
        loadedAtMs: this.#now(),
        canMutate: !this.#binding.readOnly && this.#binding.actions !== null,
      };
      this.#lastGood = current;
      return current;
    } catch (error) {
      return this.#fallbackFor(error);
    }
  }

  async inspect(binding: ConsoleInspectionBinding): Promise<ConsoleReadInspection | null> {
    const dataset = this.#lastGood;
    if (binding.view === "evidence") {
      const row = dataset?.pages.evidence.rows.find(
        (candidate) => candidate.stableId === binding.itemId,
      );
      if (
        dataset === null ||
        dataset?.snapshotRevision !== binding.projectionRevision ||
        row?.revision !== binding.itemRevision ||
        row.detailRef === null
      ) {
        return unavailableArtifact(binding, "projection-changed");
      }
      if (!this.#binding.ok) return unavailableArtifact(binding, "feature-unavailable");
      try {
        const detail = await this.#binding.port.readDetail({
          ...this.#readScope(),
          snapshotRevision: revisionToProtocol(binding.projectionRevision),
          detailRef: row.detailRef,
        });
        if (detail.status === "resnapshot-required") {
          return unavailableArtifact(binding, "projection-changed");
        }
        if (
          detail.snapshotRevision !== revisionToProtocol(binding.projectionRevision) ||
          detail.detailRef.kind !== "evidence" ||
          detail.detailRef.evidenceId !== row.detailRef.evidenceId ||
          detail.detailRef.expectedRevision !== row.detailRef.expectedRevision ||
          detail.detail.revision !== row.detailRef.expectedRevision
        ) {
          return unavailableArtifact(binding, "contract-invalid");
        }
        if (detail.detail.freshness === "unavailable") {
          return unavailableArtifact(binding, "detail-unavailable");
        }
        if (detail.detail.freshness === "conflict") {
          return unavailableArtifact(binding, "detail-conflict");
        }
        const evidence = detail.detail.value;
        if (
          evidence.kind !== "evidence" ||
          evidence.evidenceId !== binding.itemId
        ) {
          return unavailableArtifact(binding, "detail-invalid");
        }
        const read = this.#binding.port.readArtifactContent;
        if (read === null) return unavailableArtifact(binding, "feature-unavailable");
        const maximumBytes = 131_072;
        const maximumLines = 2_000;
        const unavailableReasons = {
          "not-found": "artifact-not-found",
          forbidden: "artifact-forbidden",
          "unsupported-media": "artifact-unsupported-media",
          "unsafe-content": "artifact-unsafe-content",
          stale: "artifact-stale",
          oversized: "artifact-oversized",
        } as const;
        const pages: ConsoleArtifactContentPage[] = [];
        const renderedParts: string[] = [];
        const seenCursors = new Set<string>();
        let cursor: string | null = null;
        let expectedPageIndex = 0;
        let previousEndedAtLineBoundary = true;
        let firstPage: Extract<ArtifactContentReadResult, { available: true }> | null = null;
        for (; expectedPageIndex < MAX_ARTIFACT_PAGES; expectedPageIndex += 1) {
          const rawResult: unknown = await read({
            ...this.#readScope(),
            evidenceId: evidence.evidenceId,
            expectedEvidenceRevision: revisionToProtocol(binding.itemRevision),
            artifactRef: evidence.artifactRef,
            cursor,
            maximumBytes,
            maximumLines,
          });
          let result: ArtifactContentReadResult;
          try {
            result = parseArtifactContentReadResult(rawResult);
          } catch {
            return unavailableArtifact(binding, "contract-invalid");
          }
          if (!sameArtifactRef(result.artifactRef, evidence.artifactRef)) {
            return unavailableArtifact(binding, "contract-invalid");
          }
          if (!result.available) {
            return unavailableArtifact(binding, unavailableReasons[result.reason]);
          }
          const pageBytes = Buffer.byteLength(result.content, "utf8");
          const finalPage = result.nextCursor === null;
          if (
            result.pageIndex !== expectedPageIndex ||
            contentDigest(result.content) !== result.pageContentDigest ||
            pageBytes > maximumBytes ||
            returnedPageLineCount(result.content) > maximumLines ||
            (result.content.length === 0 && !finalPage) ||
            result.lineFragment !== expectedLineFragment({
              startsAtLineBoundary: previousEndedAtLineBoundary,
              endsAtLineBoundary: finalPage || result.content.endsWith("\n"),
            })
          ) {
            return unavailableArtifact(binding, "contract-invalid");
          }
          if (firstPage === null) {
            firstPage = result;
            if (
              result.renderedTotalBytes > MAX_ARTIFACT_RENDERED_BYTES ||
              (result.transformation === "none" &&
                result.renderedArtifactDigest !== result.artifactRef.digest)
            ) {
              return unavailableArtifact(binding, "contract-invalid");
            }
          } else if (
            result.mediaType !== firstPage.mediaType ||
            result.totalBytes !== firstPage.totalBytes ||
            result.totalLines !== firstPage.totalLines ||
            result.renderedTotalBytes !== firstPage.renderedTotalBytes ||
            result.renderedTotalLines !== firstPage.renderedTotalLines ||
            result.renderedArtifactDigest !== firstPage.renderedArtifactDigest ||
            result.transformation !== firstPage.transformation ||
            result.terminalNeutralised !== firstPage.terminalNeutralised ||
            result.capabilityValuesRedacted !== firstPage.capabilityValuesRedacted ||
            result.credentialValuesRedacted !== firstPage.credentialValuesRedacted
          ) {
            return unavailableArtifact(binding, "contract-invalid");
          }
          pages.push({
            pageIndex: result.pageIndex,
            lineFragment: result.lineFragment,
            pageContentDigest: result.pageContentDigest,
            bytes: pageBytes,
          });
          renderedParts.push(result.content);
          previousEndedAtLineBoundary = result.content.endsWith("\n");
          const nextCursor = result.nextCursor;
          if (nextCursor === null) break;
          if (
            nextCursor === cursor ||
            seenCursors.has(nextCursor)
          ) {
            return unavailableArtifact(binding, "contract-invalid");
          }
          seenCursors.add(nextCursor);
          cursor = nextCursor;
        }
        const lastPage = pages.at(-1);
        if (firstPage === null || lastPage === undefined || expectedPageIndex >= MAX_ARTIFACT_PAGES) {
          return unavailableArtifact(binding, "contract-invalid");
        }
        const content = renderedParts.join("");
        if (
          Buffer.byteLength(content, "utf8") !== firstPage.renderedTotalBytes ||
          artifactLineCount(content) !== firstPage.renderedTotalLines ||
          contentDigest(content) !== firstPage.renderedArtifactDigest
        ) {
          return unavailableArtifact(binding, "contract-invalid");
        }
        const result: ConsoleArtifactContentResult = {
          artifactRef: firstPage.artifactRef,
          evidenceRevision: revisionToProtocol(binding.itemRevision),
          evidenceKind: evidence.evidenceKind,
          sourceKind: evidence.sourceKind,
          publisherKind: evidence.publisherKind,
          publisherRef: evidence.publisherRef,
          projectSessionId: evidence.projectSessionId,
          coordinationRunId: evidence.coordinationRunId,
          taskId: evidence.taskId,
          createdAt: evidence.createdAt,
          mediaType: firstPage.mediaType,
          content,
          totalBytes: firstPage.totalBytes,
          totalLines: firstPage.totalLines,
          renderedTotalBytes: firstPage.renderedTotalBytes,
          renderedTotalLines: firstPage.renderedTotalLines,
          renderedArtifactDigest: firstPage.renderedArtifactDigest,
          transformation: firstPage.transformation,
          terminalNeutralised: true,
          capabilityValuesRedacted: true,
          credentialValuesRedacted: true,
          pages,
          coverage: {
            complete: true,
            verified: true,
            pageCount: pages.length,
          },
          reviewDisposition: reviewDisposition(firstPage.transformation),
        };
        return {
          kind: "artifact",
          state: "current",
          binding,
          readTransactionId: detail.readTransactionId,
          result,
        };
      } catch (error: unknown) {
        const code = failureCode(error);
        return unavailableArtifact(
          binding,
          code === "STALE_REVISION" || code === "PROJECTION_RESNAPSHOT_REQUIRED"
            ? "projection-changed"
            : "transport-failure",
        );
      }
    }
    if (binding.view === "project") {
      const row = dataset?.pages.project.rows.find(
        (candidate) => candidate.stableId === binding.itemId,
      );
      if (
        dataset === null ||
        dataset?.snapshotRevision !== binding.projectionRevision ||
        row?.revision !== binding.itemRevision ||
        row.detailRef === null
      ) {
        return unavailableRepository(binding, "projection-changed");
      }
      if (!this.#binding.ok) return unavailableRepository(binding, "feature-unavailable");
      try {
        const detail = await this.#binding.port.readDetail({
          ...this.#readScope(),
          snapshotRevision: revisionToProtocol(binding.projectionRevision),
          detailRef: row.detailRef,
        });
        if (detail.status === "resnapshot-required") {
          return unavailableRepository(binding, "projection-changed");
        }
        if (
          detail.snapshotRevision !==
            revisionToProtocol(binding.projectionRevision) ||
          detail.detailRef.kind !== "project" ||
          detail.detailRef.projectId !== row.detailRef.projectId ||
          detail.detailRef.expectedRevision !== row.detailRef.expectedRevision ||
          detail.detail.revision !== row.detailRef.expectedRevision
        ) {
          return unavailableRepository(binding, "contract-invalid");
        }
        if (detail.detail.freshness === "unavailable") {
          return unavailableRepository(binding, "detail-unavailable");
        }
        if (detail.detail.freshness === "conflict") {
          return unavailableRepository(binding, "detail-conflict");
        }
        const project = detail.detail.value;
        if (project.kind !== "project" || project.projectId !== this.#projectId) {
          return unavailableRepository(binding, "detail-invalid");
        }
        const read = this.#binding.port.readRepository;
        if (read === null) return unavailableRepository(binding, "feature-unavailable");
        const selectedWorktree =
          project.repository !== undefined &&
          project.repository.canonicalWorktreePath !== project.canonicalRoot
            ? project.repository.canonicalWorktreePath
            : null;
        if (selectedWorktree !== null && this.#projectSessionId === undefined) {
          return unavailableRepository(binding, "detail-invalid");
        }
        const requestBase = {
          credential: this.#credential,
          projectId: this.#projectId,
          snapshotRevision: revisionToProtocol(binding.projectionRevision),
          diff: { kind: "working-tree" },
          log: { limit: 32 },
        } as const;
        let request: GitRepositoryReadRequest;
        if (selectedWorktree === null) {
          request = {
            ...requestBase,
            ...(this.#projectSessionId === undefined
              ? {}
              : { projectSessionId: this.#projectSessionId }),
            target: { kind: "project-root" },
          };
        } else {
          const projectSessionId = this.#projectSessionId;
          if (projectSessionId === undefined) {
            return unavailableRepository(binding, "detail-invalid");
          }
          request = {
            ...requestBase,
            projectSessionId,
            target: {
              kind: "session-worktree",
              canonicalWorktreePath: selectedWorktree,
            },
          };
        }
        const result = await read(request);
        if (result.status === "resnapshot-required") {
          return unavailableRepository(binding, "repository-resnapshot-required");
        }
        if (
          result.projectId !== this.#projectId ||
          result.projectSessionId !== (this.#projectSessionId ?? null) ||
          result.snapshotRevision !== revisionToProtocol(binding.projectionRevision) ||
          result.repository.canonicalRepositoryRoot !== project.canonicalRoot ||
          result.repository.canonicalWorktreePath !==
            (selectedWorktree ?? project.canonicalRoot)
        ) {
          return unavailableRepository(binding, "contract-invalid");
        }
        return {
          kind: "repository",
          state: "current",
          binding,
          readTransactionId: result.readTransactionId,
          repository: result.repository,
        };
      } catch (error: unknown) {
        const code = failureCode(error);
        return unavailableRepository(
          binding,
          code === "STALE_REVISION"
            ? "projection-changed"
            : code === "PROJECTION_RESNAPSHOT_REQUIRED"
              ? "repository-resnapshot-required"
              : "transport-failure",
        );
      }
    }
    if (binding.view !== "activity") return null;
    const row = dataset?.pages.activity.rows.find(
      (candidate) => candidate.stableId === binding.itemId,
    );
    if (
      dataset === null ||
      dataset?.snapshotRevision !== binding.projectionRevision ||
      row?.revision !== binding.itemRevision
    ) {
      return unavailableMessage(binding, "projection-changed");
    }
    if (
      row.summary?.kind !== "activity" ||
      row.summary.activityKind !== "message"
    ) {
      return null;
    }
    const reference: MessageBodyRef = row.summary.messageBodyRef;
    const read = this.#binding.ok ? this.#binding.port.readMessageBody : null;
    if (read === null) return unavailableMessage(binding, "feature-unavailable");
    try {
      const result = await readConsoleMessageBody(
        { read },
        { credential: this.#credential, ...reference },
      );
      if (!result.available) {
        const reason = {
          "not-found": "message-not-found",
          forbidden: "message-forbidden",
          expired: "message-expired",
        } as const;
        return unavailableMessage(binding, reason[result.reason]);
      }
      return { kind: "message", state: "current", binding, result };
    } catch (error: unknown) {
      const code = failureCode(error);
      return unavailableMessage(
        binding,
        error instanceof Error && error.message.startsWith("message body contract")
          ? "contract-invalid"
          : code === "STALE_REVISION" ||
              code === "PROJECTION_RESNAPSHOT_REQUIRED"
            ? "projection-changed"
          : "transport-failure",
      );
    }
  }

  #readScope(): ProjectionSnapshotRequest {
    return {
      credential: this.#credential,
      projectId: this.#projectId,
      ...(this.#projectSessionId === undefined
        ? {}
        : { projectSessionId: this.#projectSessionId }),
    };
  }

  async #loadWithFallback(): Promise<FabricConsoleDataset> {
    try {
      const loaded = await this.#loadFresh();
      this.#lastGood = loaded;
      return loaded;
    } catch (error) {
      return this.#fallbackFor(error);
    }
  }

  async #loadFresh(): Promise<FabricConsoleDataset> {
    if (!this.#binding.ok) {
      return this.#unsupported();
    }
    for (let attempt = 0; attempt < this.#maxResnapshotAttempts; attempt += 1) {
      const snapshot = await this.#binding.port.snapshot(this.#readScope());
      const snapshotRevision = revisionFromProtocol(snapshot.snapshotRevision);
      try {
        const pages = await this.#loadPages(snapshot.snapshotRevision);
        return {
          connection: {
            state: "live",
            compatibility: this.#binding.compatibility,
          },
          snapshot,
          snapshotRevision,
          cursor: snapshot.cursor,
          pages,
          loadedAtMs: this.#now(),
          canMutate:
            !this.#binding.readOnly && this.#binding.actions !== null,
        };
      } catch (error) {
        if (error instanceof ResnapshotRequiredError) {
          continue;
        }
        throw error;
      }
    }
    throw new ProjectionInvalidError("resnapshot attempts exhausted");
  }

  async #loadPages(snapshotRevision: number): Promise<ConsoleViewPages> {
    const loaded = new Map<FabricView, ConsoleViewPage>();
    for (const view of FABRIC_VIEWS) {
      loaded.set(view, await this.#loadView(view, snapshotRevision));
    }
    return Object.fromEntries(loaded) as unknown as ConsoleViewPages;
  }

  async #loadView(
    view: FabricView,
    snapshotRevision: number,
  ): Promise<ConsoleViewPage> {
    if (!this.#binding.ok) {
      throw new ProjectionInvalidError("Console protocol is unavailable");
    }
    let cursor = 0;
    let readTransactionId: string | null = null;
    const rows: ConsoleRow[] = [];
    for (let pageNumber = 0; pageNumber < this.#maxPagesPerView; pageNumber += 1) {
      const result = await this.#binding.port.viewPage({
        ...this.#readScope(),
        view,
        snapshotRevision,
        cursor,
        limit: this.#pageLimit,
      });
      if (result.status === "resnapshot-required") {
        throw new ResnapshotRequiredError();
      }
      if (result.view !== view || result.snapshotRevision !== snapshotRevision) {
        throw new ProjectionInvalidError("projection page identity changed");
      }
      readTransactionId = result.readTransactionId;
      for (const row of result.rows) {
        rows.push(mapProtocolRow(
          view,
          row,
          this.#now(),
          this.#binding.nativeNotificationProjection,
        ));
      }
      if (!result.hasMore) {
        return {
          view,
          rows: rankConsoleRows(rows),
          nextCursor: result.nextCursor,
          hasMore: false,
          snapshotRevision: revisionFromProtocol(snapshotRevision),
          readTransactionId,
        };
      }
      if (result.nextCursor <= cursor) {
        throw new ProjectionInvalidError("projection cursor did not advance");
      }
      cursor = result.nextCursor;
    }
    throw new ProjectionInvalidError("projection page limit exceeded");
  }

  #unsupported(): FabricConsoleDataset {
    const missingFeatures = this.#binding.ok
      ? []
      : this.#binding.missingFeatures;
    return {
      connection: { state: "unsupported", missingFeatures },
      snapshot: null,
      snapshotRevision: null,
      cursor: 0,
      pages: createEmptyViewPages(),
      loadedAtMs: this.#now(),
      canMutate: false,
    };
  }

  #fallbackFor(error: unknown): FabricConsoleDataset {
    const code = failureCode(error);
    if (code === "PROTOCOL_INCOMPATIBLE" || code === "CONSOLE_PROTOCOL_INCOMPATIBLE") {
      const cause = isRecord(error) && isRecord(error.cause) ? error.cause : null;
      const result = isRecord(error) && isRecord(error.result) ? error.result : null;
      const operation = result?.operation ?? cause?.operation;
      const closedReason = result?.closedReason ?? cause?.reason;
      const primaryValue = isRecord(error) && isRecord(error.primary) ? error.primary : null;
      const primary = primaryValue !== null &&
          typeof primaryValue.code === "string" &&
          typeof primaryValue.message === "string"
        ? { code: primaryValue.code, message: primaryValue.message }
        : {
            code,
            message: error instanceof Error ? error.message : "protocol result is incompatible",
          };
      const retryValue = isRecord(error) && isRecord(error.retry) ? error.retry : null;
      const retry = retryValue !== null &&
          (retryValue.status === "succeeded" || retryValue.status === "failed") &&
          retryValue.profile === "strict-v1"
        ? {
            status: retryValue.status as "succeeded" | "failed",
            profile: "strict-v1" as const,
            ...(isRecord(retryValue.failure) &&
              typeof retryValue.failure.code === "string" &&
              typeof retryValue.failure.message === "string"
              ? {
                  failure: {
                    code: retryValue.failure.code,
                    message: retryValue.failure.message,
                  },
                }
              : {}),
          }
        : undefined;
      return {
        connection: {
          state: "protocol-incompatible",
          code,
          message: error instanceof Error ? error.message : "protocol result is incompatible",
          operation: typeof operation === "string" ? operation : null,
          closedReason: typeof closedReason === "string" ? closedReason : null,
          primary,
          ...(retry === undefined ? {} : { retry }),
        },
        snapshot: null,
        snapshotRevision: null,
        cursor: 0,
        pages: createEmptyViewPages(),
        loadedAtMs: this.#now(),
        canMutate: false,
      };
    }
    const reason =
      error instanceof ProjectionInvalidError
        ? error.message === "resnapshot attempts exhausted"
          ? "resnapshot-exhausted"
          : "projection-invalid"
        : "transport-failure";
    if (this.#lastGood === null) {
      return {
        connection: { state: "unavailable", reason },
        snapshot: null,
        snapshotRevision: null,
        cursor: 0,
        pages: createEmptyViewPages(),
        loadedAtMs: this.#now(),
        canMutate: false,
      };
    }
    return {
      ...this.#lastGood,
      connection: { state: "degraded", reason },
      loadedAtMs: this.#now(),
      canMutate: false,
    };
  }
}
