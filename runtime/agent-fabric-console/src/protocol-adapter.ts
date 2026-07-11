import { createHash } from "node:crypto";

import type {
  NegotiatedOperatorClient,
  GitRepositoryReadClient,
  GitRepositoryReadRequest,
  GitRepositoryProjection,
  MessageBodyClient,
  MessageBodyReadResult,
  MessageBodyRef,
  OperatorActionClient,
  OperatorCapabilityCredential,
  OperatorDetailReadRequest,
  OperatorDetailReadResult,
  OperatorProjectionSnapshot,
  OperatorViewPageRequest,
  OperatorViewPageResult,
  ProjectId,
  ProjectSessionId,
  ProjectionEventsRequest,
  ProjectionEventsResult,
  ProjectionSnapshotRequest,
  ScopedGateReadRequest,
  ScopedGateReadResult,
} from "@local/agent-fabric-protocol";

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
  readArtifactContent: ConsoleArtifactContentRead | null;
}>;

export type ConsoleArtifactContentRequest = Readonly<{
  credential: OperatorCapabilityCredential;
  projectId: ProjectId;
  projectSessionId?: ProjectSessionId;
  snapshotRevision: number;
  evidenceId: string;
  expectedEvidenceRevision: number;
  artifactRef: Readonly<{ path: string; digest: string }>;
  maximumBytes: number;
  maximumLines: number;
}>;

export type ConsoleArtifactContentResult =
  | Readonly<{
      available: true;
      artifactRef: Readonly<{ path: string; digest: string }>;
      mediaType: "text/markdown" | "application/json" | "text/x-diff" | "text/plain";
      content: string;
      totalBytes: number;
      truncated: boolean;
      terminalNeutralised: true;
      capabilityValuesRedacted: true;
    }>
  | Readonly<{
      available: false;
      artifactRef: Readonly<{ path: string; digest: string }>;
      reason: "not-found" | "forbidden" | "unsupported-media" | "stale" | "oversized";
    }>;

export type ConsoleArtifactContentRead = (
  request: ConsoleArtifactContentRequest,
) => Promise<ConsoleArtifactContentResult>;

export type ConsoleProtocolBinding =
  | Readonly<{
      ok: true;
      port: ConsoleProtocolPort;
      readOnly: boolean;
      actions: OperatorActionClient | null;
    }>
  | Readonly<{
      ok: false;
      missingFeatures: readonly string[];
    }>;

export function bindConsoleProtocolClient(
  client: NegotiatedOperatorClient,
): ConsoleProtocolBinding {
  if (client.projection === undefined || client.console === undefined) {
    const available = new Set<string>(client.features);
    const missingFeatures = [
      "operator-projection.v2",
      "scoped-gate-read.v1",
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
  const artifactSurface = Reflect.get(client, "artifacts");
  const artifactReadMethod =
    typeof artifactSurface === "object" &&
    artifactSurface !== null &&
    typeof Reflect.get(artifactSurface, "readContent") === "function"
      ? Reflect.get(artifactSurface, "readContent") as ConsoleArtifactContentRead
      : null;
  const artifactRead: ConsoleArtifactContentRead | null =
    artifactReadMethod === null
      ? null
      : async (request) => await Reflect.apply(
          artifactReadMethod,
          artifactSurface,
          [request],
        ) as ConsoleArtifactContentResult;
  return {
    ok: true,
    readOnly: consoleClient.readOnly,
    actions: consoleClient.readOnly ? null : consoleClient.actions,
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
  | Readonly<{ state: "live" }>
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
      result: Extract<ConsoleArtifactContentResult, { available: true }>;
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

export type FabricConsoleDataset = Readonly<{
  connection: ConsoleConnection;
  snapshot: OperatorProjectionSnapshot | null;
  snapshotRevision: Revision | null;
  cursor: number;
  pages: ConsoleViewPages;
  loadedAtMs: number;
  canMutate: boolean;
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
        connection: { state: "live" },
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
        const rawResult: unknown = await read({
          ...this.#readScope(),
          snapshotRevision: revisionToProtocol(binding.projectionRevision),
          evidenceId: evidence.evidenceId,
          expectedEvidenceRevision: revisionToProtocol(binding.itemRevision),
          artifactRef: evidence.artifactRef,
          maximumBytes,
          maximumLines,
        });
        if (
          !isRecord(rawResult) ||
          (rawResult.available !== true && rawResult.available !== false) ||
          !isRecord(rawResult.artifactRef) ||
          typeof rawResult.artifactRef.path !== "string" ||
          typeof rawResult.artifactRef.digest !== "string"
        ) {
          return unavailableArtifact(binding, "contract-invalid");
        }
        const result = rawResult as ConsoleArtifactContentResult;
        if (
          result.artifactRef.path !== evidence.artifactRef.path ||
          result.artifactRef.digest !== evidence.artifactRef.digest
        ) {
          return unavailableArtifact(binding, "contract-invalid");
        }
        if (!result.available) {
          const reasons = {
            "not-found": "artifact-not-found",
            forbidden: "artifact-forbidden",
            "unsupported-media": "artifact-unsupported-media",
            stale: "artifact-stale",
            oversized: "artifact-oversized",
          } as const;
          if (
            typeof result.reason !== "string" ||
            !(result.reason in reasons)
          ) {
            return unavailableArtifact(binding, "contract-invalid");
          }
          return unavailableArtifact(binding, reasons[result.reason]);
        }
        const contentBytes = typeof result.content === "string"
          ? Buffer.byteLength(result.content)
          : maximumBytes + 1;
        const lineCount = typeof result.content === "string"
          ? result.content.split("\n").length
          : maximumLines + 1;
        const mediaTypes = new Set([
          "text/markdown",
          "application/json",
          "text/x-diff",
          "text/plain",
        ]);
        const contentDigest = typeof result.content === "string"
          ? `sha256:${createHash("sha256").update(result.content).digest("hex")}`
          : null;
        if (
          !mediaTypes.has(result.mediaType) ||
          typeof result.content !== "string" ||
          result.terminalNeutralised !== true ||
          result.capabilityValuesRedacted !== true ||
          !Number.isSafeInteger(result.totalBytes) ||
          result.totalBytes < contentBytes ||
          contentBytes > maximumBytes ||
          lineCount > maximumLines ||
          typeof result.truncated !== "boolean" ||
          (!result.truncated && result.totalBytes !== contentBytes) ||
          (!result.truncated && contentDigest !== result.artifactRef.digest)
        ) {
          return unavailableArtifact(binding, "contract-invalid");
        }
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
          connection: { state: "live" },
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
        rows.push(mapProtocolRow(view, row, this.#now()));
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
