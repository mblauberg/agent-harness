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
}>;

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

function failureCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : null;
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
