import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type {
  ArtifactContentReadRequest,
  ArtifactContentReadResult,
  OperatorCapabilityCredential,
  OperatorDetailReadResult,
  OperatorProjectionSnapshot,
  OperatorViewPageResult,
  ProjectId,
  ProjectionEventsResult,
  Sha256Digest,
  Timestamp,
} from "@local/agent-fabric-protocol";
import {
  ConsoleProtocolAdapter,
  bindConsoleProtocolClient,
  type ConsoleProtocolBinding,
  type ConsoleProtocolPort,
} from "../src/protocol-adapter.js";
import { FABRIC_VIEWS, revisionFromProtocol } from "../src/model.js";

const projectId = "project-1" as ProjectId;
const credential = {
  capabilityId: "capability-1",
  token: "secret-never-render",
} as OperatorCapabilityCredential;
const observedAt = "2026-07-11T12:00:00.000Z" as Timestamp;
const digest = (`sha256:${"a".repeat(64)}`) as Sha256Digest;

function snapshot(revision: number, cursor = revision): OperatorProjectionSnapshot {
  return {
    schemaVersion: 1,
    snapshotRevision: revision,
    readTransactionId: `read-${String(revision)}`,
    project: {
      freshness: "live",
      source: "fabric",
      revision,
      observedAt,
      value: { projectId, canonicalRoot: "/repo" },
    },
    session: {
      freshness: "unavailable",
      source: "fabric",
      revision,
      observedAt,
      reason: "no session selected",
    },
    runs: {
      freshness: "live",
      source: "fabric",
      revision,
      observedAt,
      value: [],
    },
    attention: {
      freshness: "live",
      source: "fabric",
      revision,
      observedAt,
      value: [],
    },
    capacity: {
      freshness: "unavailable",
      source: "fabric",
      revision,
      observedAt,
      reason: "not declared",
    },
    cursor,
    stateDigest: digest,
  };
}

function emptyPage(
  view: (typeof FABRIC_VIEWS)[number],
  revision: number,
  cursor = 0,
  hasMore = false,
): OperatorViewPageResult {
  return {
    status: "page",
    view,
    rows: [],
    nextCursor: cursor,
    hasMore,
    snapshotRevision: revision,
    readTransactionId: `page-${view}-${String(cursor)}`,
  } as OperatorViewPageResult;
}

function fakePort(
  overrides: Partial<ConsoleProtocolPort> = {},
): ConsoleProtocolPort {
  return {
    snapshot: vi.fn(async () => snapshot(1)),
    events: vi.fn(async (): Promise<ProjectionEventsResult> => ({
      status: "continuation",
      events: [],
      nextCursor: 1,
      hasMore: false,
      snapshotRevision: 1,
      readTransactionId: "events-1",
    })),
    viewPage: vi.fn(async (request) =>
      emptyPage(request.view, request.snapshotRevision),
    ),
    readDetail: vi.fn(async (): Promise<OperatorDetailReadResult> => ({
      status: "resnapshot-required",
      reason: "snapshot-mismatch",
      currentSnapshotRevision: 2,
    })),
    readGate: vi.fn(async () => {
      throw new Error("unused gate read");
    }),
    readMessageBody: null,
    readRepository: null,
    readArtifactContent: null,
    ...overrides,
  };
}

function binding(port: ConsoleProtocolPort): ConsoleProtocolBinding {
  return {
    ok: true,
    port,
    readOnly: true,
    actions: null,
    nativeNotificationProjection: "daemon-journal",
    compatibility: { mode: "current" },
  };
}

describe("public protocol adapter", () => {
  it("maps a valid legacy Attention page to the Console-only unavailable branch", async () => {
    const port = fakePort({
      viewPage: vi.fn(async (request): Promise<OperatorViewPageResult> => {
        if (request.view !== "attention") {
          return emptyPage(request.view, request.snapshotRevision);
        }
        return {
          status: "page",
          view: "attention",
          rows: [{
            itemId: "attention-legacy",
            itemRevision: 1,
            fact: {
              freshness: "live",
              source: "fabric",
              revision: 1,
              observedAt,
              value: {
                summary: {
                  kind: "attention",
                  label: "FYI",
                  priority: "advisory",
                  title: "Legacy notification state",
                },
                detailRef: { kind: "system", componentId: "native", expectedRevision: 1 },
                actionAvailability: { state: "read-only", reason: "state-ineligible" },
              },
            },
          }],
          nextCursor: 1,
          hasMore: false,
          snapshotRevision: request.snapshotRevision,
          readTransactionId: "legacy-page",
        };
      }),
    });
    const adapter = new ConsoleProtocolAdapter({
      binding: {
        ok: true,
        port,
        readOnly: true,
        actions: null,
        nativeNotificationProjection: "legacy-fallback",
        compatibility: { mode: "legacy-compatibility", profile: "strict-v1" },
      },
      credential,
      projectId,
    });

    const loaded = await adapter.open();
    expect(loaded.connection).toStrictEqual({
      state: "live",
      compatibility: { mode: "legacy-compatibility", profile: "strict-v1" },
    });
    expect(loaded.pages.attention.rows[0]?.summary).toMatchObject({
      nativeNotification: {
        kind: "legacy-fallback",
        status: "unavailable",
        reason: "feature-not-negotiated",
      },
    });
  });

  it("loads one canonical snapshot and all eight cursor-paged views", async () => {
    const calls: Array<{ view: string; cursor: number; revision: number }> = [];
    const port = fakePort({
      viewPage: vi.fn(async (request) => {
        calls.push({
          view: request.view,
          cursor: request.cursor,
          revision: request.snapshotRevision,
        });
        if (request.view === "attention" && request.cursor === 0) {
          return {
            status: "page",
            view: "attention",
            rows: [
              {
                itemId: "gate:safety",
                itemRevision: 7,
                fact: {
                  freshness: "live",
                  source: "fabric",
                  revision: 7,
                  observedAt,
                  value: {
                    summary: {
                      kind: "attention",
                      label: "Approval",
                      priority: "safety-integrity",
                      title: "Approve quarantine recovery",
                      nativeNotification: {
                        targetIntegration: "native-desktop",
                        status: "available",
                        journalState: "sent",
                        deliveryItemRevision: 7,
                        claimGeneration: null,
                        integrationState: "available",
                        observedAt,
                      },
                    },
                    detailRef: {
                      kind: "system",
                      componentId: "quarantine",
                      expectedRevision: 7,
                    },
                    actionAvailability: {
                      state: "available",
                      actions: ["resume"],
                      requiresPreview: true,
                    },
                  },
                },
              },
            ],
            nextCursor: 1,
            hasMore: true,
            snapshotRevision: request.snapshotRevision,
            readTransactionId: "attention-page-1",
          } as OperatorViewPageResult;
        }
        return emptyPage(
          request.view,
          request.snapshotRevision,
          request.cursor,
        );
      }),
    });
    const adapter = new ConsoleProtocolAdapter({
      binding: binding(port),
      credential,
      projectId,
      now: () => Date.parse(observedAt) + 1_000,
      pageLimit: 25,
    });

    const result = await adapter.open();

    expect(result.connection).toStrictEqual({
      state: "live",
      compatibility: { mode: "current" },
    });
    expect(result.snapshot?.snapshotRevision).toBe(1);
    expect(result.snapshotRevision).toBe("1");
    expect(result.cursor).toBe(1);
    expect(Object.keys(result.pages)).toStrictEqual(FABRIC_VIEWS);
    expect(result.pages.attention.rows[0]).toMatchObject({
      stableId: "gate:safety",
      revision: "7",
      urgency: "safety-integrity",
    });
    expect(calls).toHaveLength(9);
    expect(calls).toContainEqual({ view: "attention", cursor: 1, revision: 1 });
    expect(calls.every(({ revision }) => revision === 1)).toBe(true);
  });

  it("discards a mixed projection and resnapshots as one revision", async () => {
    const snapshots = [snapshot(1), snapshot(2)];
    const port = fakePort({
      snapshot: vi.fn(async () => snapshots.shift() ?? snapshot(2)),
      viewPage: vi.fn(async (request) => {
        if (request.snapshotRevision === 1 && request.view === "work") {
          return {
            status: "resnapshot-required",
            view: "work",
            reason: "snapshot-mismatch",
            currentSnapshotRevision: 2,
            snapshotCursor: 2,
          } as OperatorViewPageResult;
        }
        return emptyPage(request.view, request.snapshotRevision);
      }),
    });
    const adapter = new ConsoleProtocolAdapter({
      binding: binding(port),
      credential,
      projectId,
    });

    const result = await adapter.open();

    expect(result.connection).toStrictEqual({
      state: "live",
      compatibility: { mode: "current" },
    });
    expect(result.snapshotRevision).toBe("2");
    expect(port.snapshot).toHaveBeenCalledTimes(2);
    expect(
      Object.values(result.pages).every(
        ({ snapshotRevision }) => snapshotRevision === "2",
      ),
    ).toBe(true);
  });

  it("preserves last-good state and disables mutation truth after an outage", async () => {
    let fail = false;
    const port = fakePort({
      snapshot: vi.fn(async () => {
        if (fail) {
          throw new Error("socket unavailable\nsecret-never-render");
        }
        return snapshot(11);
      }),
    });
    const adapter = new ConsoleProtocolAdapter({
      binding: {
        ok: true,
        port,
        readOnly: false,
        actions: {} as never,
        nativeNotificationProjection: "daemon-journal",
        compatibility: { mode: "current" },
      },
      credential,
      projectId,
    });
    const good = await adapter.open();
    fail = true;

    const degraded = await adapter.refresh();

    expect(good.canMutate).toBe(true);
    expect(degraded.snapshot).toBe(good.snapshot);
    expect(degraded.pages).toBe(good.pages);
    expect(degraded.canMutate).toBe(false);
    expect(degraded.connection).toMatchObject({
      state: "degraded",
      reason: "transport-failure",
    });
    expect(JSON.stringify(degraded)).not.toContain("secret-never-render");
  });

  it("turns result-shape incompatibility into a connection failure without cached rows", async () => {
    const port = fakePort();
    const adapter = new ConsoleProtocolAdapter({
      binding: binding(port),
      credential,
      projectId,
    });
    const current = await adapter.open();
    expect(current.snapshot).not.toBeNull();
    vi.mocked(port.events).mockRejectedValueOnce(Object.assign(
      new Error("incompatible projection"),
      {
        code: "PROTOCOL_INCOMPATIBLE",
        cause: {
          operation: "fabric.v1.operator-projection.snapshot",
          reason: "missing-negotiated-field",
        },
      },
    ));

    const rejected = await adapter.poll();

    expect(rejected.connection).toStrictEqual({
      state: "protocol-incompatible",
      code: "PROTOCOL_INCOMPATIBLE",
      message: "incompatible projection",
      operation: "fabric.v1.operator-projection.snapshot",
      closedReason: "missing-negotiated-field",
      primary: {
        code: "PROTOCOL_INCOMPATIBLE",
        message: "incompatible projection",
      },
    });
    expect(rejected.snapshot).toBeNull();
    expect(rejected.pages.attention.rows).toStrictEqual([]);
    expect(rejected.canMutate).toBe(false);
    expect(adapter.actionClient).toBeNull();
  });

  it("resumes from the durable cursor and reloads on opaque committed events", async () => {
    const snapshots = [snapshot(3, 30), snapshot(4, 41)];
    const port = fakePort({
      snapshot: vi.fn(async () => snapshots.shift() ?? snapshot(4, 41)),
      events: vi.fn(async (request): Promise<ProjectionEventsResult> => ({
        status: "continuation",
        events: [
          {
            cursor: 41,
            projectSessionId: "session-1" as never,
            kind: "task.changed",
            revision: 4,
            occurredAt: observedAt,
            payload: { taskId: "task-1" },
          },
        ],
        nextCursor: 41,
        hasMore: false,
        snapshotRevision: 4,
        readTransactionId: `events-after-${String(request.after)}`,
      })),
    });
    const adapter = new ConsoleProtocolAdapter({
      binding: binding(port),
      credential,
      projectId,
      eventLimit: 20,
    });
    await adapter.open();

    const refreshed = await adapter.poll();

    expect(port.events).toHaveBeenCalledWith(
      expect.objectContaining({ after: 30, limit: 20 }),
    );
    expect(refreshed.snapshotRevision).toBe("4");
    expect(refreshed.cursor).toBe(41);
    expect(port.snapshot).toHaveBeenCalledTimes(2);
  });

  it("resnapshots an eventless revision change and observes the notification transition", async () => {
    const snapshots = [snapshot(7, 70), snapshot(8, 70)];
    const pageRevision = { value: 7 };
    const port = fakePort({
      snapshot: vi.fn(async () => {
        const next = snapshots.shift() ?? snapshot(8, 70);
        pageRevision.value = next.snapshotRevision;
        return next;
      }),
      events: vi.fn(async (): Promise<ProjectionEventsResult> => ({
        status: "continuation",
        events: [],
        nextCursor: 70,
        hasMore: false,
        snapshotRevision: 8,
        readTransactionId: "events-eventless-8",
      })),
      viewPage: vi.fn(async (request): Promise<OperatorViewPageResult> => {
        if (request.view !== "attention") return emptyPage(request.view, request.snapshotRevision);
        const terminal = pageRevision.value === 8;
        return {
          status: "page",
          view: "attention",
          rows: [{
            itemId: "attention-eventless",
            itemRevision: 2,
            fact: {
              freshness: "live",
              source: "fabric",
              revision: 2,
              observedAt,
              value: {
                summary: {
                  kind: "attention",
                  label: "FYI",
                  priority: "advisory",
                  title: "Delivery transition",
                  nativeNotification: {
                    targetIntegration: "native-desktop",
                    status: "available",
                    journalState: terminal ? "sent" : "pending",
                    deliveryItemRevision: 2,
                    claimGeneration: terminal ? 2 : 1,
                    integrationState: "available",
                    observedAt,
                  },
                },
                detailRef: { kind: "system", componentId: "native", expectedRevision: 2 },
                actionAvailability: { state: "read-only", reason: "state-ineligible" },
              },
            },
          }],
          nextCursor: 1,
          hasMore: false,
          snapshotRevision: request.snapshotRevision,
          readTransactionId: `attention-${String(request.snapshotRevision)}`,
        };
      }),
    });
    const adapter = new ConsoleProtocolAdapter({
      binding: binding(port),
      credential,
      projectId,
    });

    const initial = await adapter.open();
    const refreshed = await adapter.poll();
    const initialNotification = initial.pages.attention.rows[0]?.summary?.kind === "attention"
      ? initial.pages.attention.rows[0].summary.nativeNotification
      : null;
    const refreshedNotification = refreshed.pages.attention.rows[0]?.summary?.kind === "attention"
      ? refreshed.pages.attention.rows[0].summary.nativeNotification
      : null;

    expect(initialNotification).toMatchObject({ kind: "daemon-journal", journalState: "pending" });
    expect(refreshedNotification).toMatchObject({ kind: "daemon-journal", journalState: "sent" });
    expect(port.events).toHaveBeenCalledTimes(1);
    expect(port.snapshot).toHaveBeenCalledTimes(2);
    expect(refreshed.cursor).toBe(70);
  });

  it("fails closed when the negotiated client lacks the Console feature surface", async () => {
    const negotiated = {
      kind: "operator",
      features: ["operator-projection.v1"],
      projection: {},
    } as never;
    const result = bindConsoleProtocolClient(negotiated);
    expect(result).toStrictEqual({
      ok: false,
      missingFeatures: [
        "operator-projection.v2",
        "scoped-gate-read.v1",
      ],
    });

    const adapter = new ConsoleProtocolAdapter({
      binding: result,
      credential,
      projectId,
    });
    const unavailable = await adapter.open();
    expect(unavailable).toMatchObject({
      connection: {
        state: "unsupported",
        missingFeatures: [
          "operator-projection.v2",
          "scoped-gate-read.v1",
        ],
      },
      snapshot: null,
      canMutate: false,
    });
  });

  it("binds negotiated message and repository reads through the Console protocol port", () => {
    const messageRead = vi.fn();
    const repositoryRead = vi.fn();
    const negotiated = {
      kind: "operator",
      features: [
        "operator-projection.v1",
        "operator-projection.v2",
        "scoped-gate-read.v1",
        "message-body-read.v1",
        "operator-repository-read.v1",
      ],
      projection: {},
      console: {
        readOnly: true,
        gates: { read: vi.fn() },
        projection: { viewPage: vi.fn(), readDetail: vi.fn() },
      },
      messages: { read: messageRead },
      repository: { read: repositoryRead },
    } as never;

    const bound = bindConsoleProtocolClient(negotiated);

    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(Reflect.get(bound.port, "readMessageBody")).toBe(messageRead);
    expect(Reflect.get(bound.port, "readRepository")).toBe(repositoryRead);
    expect(bound.port.readArtifactContent).toBeNull();

    const withoutOptionalReads = bindConsoleProtocolClient({
      kind: "operator",
      features: [
        "operator-projection.v1",
        "operator-projection.v2",
        "scoped-gate-read.v1",
      ],
      projection: {},
      console: {
        readOnly: true,
        gates: { read: vi.fn() },
        projection: { viewPage: vi.fn(), readDetail: vi.fn() },
      },
    } as never);
    expect(withoutOptionalReads.ok).toBe(true);
    if (!withoutOptionalReads.ok) return;
    expect(withoutOptionalReads.port.readMessageBody).toBeNull();
    expect(withoutOptionalReads.port.readRepository).toBeNull();
    expect(withoutOptionalReads.port.readArtifactContent).toBeNull();
  });

  it("fetches exact bounded artifact and diff content through the public read port", async () => {
    const pageContent = ["# Reviewed spec\n", "safe body"] as const;
    const renderedContent = pageContent.join("");
    const artifactDigest = `sha256:${"b".repeat(64)}` as Sha256Digest;
    const renderedDigest = `sha256:${createHash("sha256").update(renderedContent).digest("hex")}` as Sha256Digest;
    let tamperPageDigest = false;
    const artifactRead = vi.fn(async (
      request: ArtifactContentReadRequest,
    ): Promise<ArtifactContentReadResult> => {
      const pageIndex = request.cursor === null ? 0 : 1;
      const content = pageContent[pageIndex] ?? "";
      return {
        available: true,
        artifactRef: { path: "docs/spec.md" as never, digest: artifactDigest },
        mediaType: "text/markdown",
        content,
        totalBytes: 43,
        totalLines: 2,
        renderedTotalBytes: Buffer.byteLength(renderedContent),
        renderedTotalLines: 2,
        pageIndex,
        lineFragment: "whole",
        pageContentDigest: (tamperPageDigest
          ? `sha256:${"f".repeat(64)}`
          : `sha256:${createHash("sha256").update(content).digest("hex")}`) as Sha256Digest,
        renderedArtifactDigest: renderedDigest,
        nextCursor: pageIndex === 0 ? "cursor-page-1" : null,
        transformation: "terminal-neutralised",
        terminalNeutralised: true,
        capabilityValuesRedacted: true,
        credentialValuesRedacted: true,
      };
    });
    const port = fakePort({
      viewPage: vi.fn(async (request) => {
        if (request.view !== "evidence") {
          return emptyPage(request.view, request.snapshotRevision);
        }
        return {
          status: "page",
          view: "evidence",
          rows: [{
            itemId: "artifact-spec",
            itemRevision: 7,
            fact: {
              freshness: "live",
              source: "fabric",
              revision: 7,
              observedAt,
              value: {
                summary: {
                  kind: "evidence",
                  evidenceKind: "artifact",
                  status: "informational",
                  provenance: "fabric:chair",
                },
                detailRef: { kind: "evidence", evidenceId: "artifact-spec", expectedRevision: 7 },
                actionAvailability: { state: "read-only", reason: "state-ineligible" },
              },
            },
          }],
          nextCursor: 1,
          hasMore: false,
          snapshotRevision: request.snapshotRevision,
          readTransactionId: "evidence-page",
        } as OperatorViewPageResult;
      }),
      readDetail: vi.fn(async () => ({
        status: "current",
        detailRef: { kind: "evidence", evidenceId: "artifact-spec", expectedRevision: 7 },
        detail: {
          freshness: "live",
          source: "fabric",
          revision: 7,
          observedAt,
          value: {
            kind: "evidence",
            evidenceId: "artifact-spec",
            evidenceKind: "artifact",
            artifactRef: { path: "docs/spec.md", digest: artifactDigest },
            sourceKind: "project-file",
            publisherKind: "agent",
            publisherRef: "chair-1",
            projectSessionId: null,
            coordinationRunId: null,
            taskId: null,
            createdAt: observedAt,
            status: "informational",
          },
        },
        snapshotRevision: 1,
        readTransactionId: "evidence-detail",
      }) as never),
      readArtifactContent: artifactRead,
    });
    const adapter = new ConsoleProtocolAdapter({ binding: binding(port), credential, projectId });
    await adapter.open();

    const inspection = await adapter.inspect({
      view: "evidence",
      itemId: "artifact-spec",
      itemRevision: revisionFromProtocol(7),
      projectionRevision: revisionFromProtocol(1),
    });

    expect(inspection).toMatchObject({
      kind: "artifact",
      state: "current",
      result: {
        artifactRef: { path: "docs/spec.md", digest: artifactDigest },
        content: renderedContent,
        renderedArtifactDigest: renderedDigest,
        transformation: "terminal-neutralised",
        terminalNeutralised: true,
        capabilityValuesRedacted: true,
        credentialValuesRedacted: true,
        coverage: {
          complete: true,
          verified: true,
          pageCount: 2,
        },
        reviewDisposition: "confirm-terminal-neutralised",
      },
    });
    expect(artifactRead).toHaveBeenNthCalledWith(1, expect.objectContaining({
      credential,
      projectId,
      evidenceId: "artifact-spec",
      expectedEvidenceRevision: 7,
      artifactRef: { path: "docs/spec.md", digest: artifactDigest },
      cursor: null,
      maximumBytes: 131_072,
      maximumLines: 2_000,
    }));
    expect(artifactRead).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cursor: "cursor-page-1",
    }));

    tamperPageDigest = true;
    await expect(adapter.inspect({
      view: "evidence",
      itemId: "artifact-spec",
      itemRevision: revisionFromProtocol(7),
      projectionRevision: revisionFromProtocol(1),
    })).resolves.toMatchObject({
      kind: "artifact",
      state: "unavailable",
      reason: "contract-invalid",
    });
  });

  it("discards artifact coverage when a daemon cursor repeats", async () => {
    const content = "abcdefgh";
    const contentDigest = `sha256:${createHash("sha256").update(content).digest("hex")}` as Sha256Digest;
    const pageDigest = (page: string): Sha256Digest =>
      `sha256:${createHash("sha256").update(page).digest("hex")}` as Sha256Digest;
    const artifactRead = vi.fn(async (
      request: ArtifactContentReadRequest,
    ): Promise<ArtifactContentReadResult> => {
      const first = request.cursor === null;
      const page = first ? "abcd" : "efgh";
      return {
        available: true,
        artifactRef: { path: "docs/spec.md" as never, digest: contentDigest },
        mediaType: "text/markdown",
        content: page,
        totalBytes: 8,
        totalLines: 1,
        renderedTotalBytes: 8,
        renderedTotalLines: 1,
        pageIndex: first ? 0 : 1,
        lineFragment: first ? "start" : "end",
        pageContentDigest: pageDigest(page),
        renderedArtifactDigest: contentDigest,
        nextCursor: "repeated-cursor",
        transformation: "none",
        terminalNeutralised: true,
        capabilityValuesRedacted: true,
        credentialValuesRedacted: true,
      };
    });
    const port = fakePort({
      viewPage: vi.fn(async (request) => request.view === "evidence"
        ? {
            status: "page",
            view: "evidence",
            rows: [{
              itemId: "artifact-spec",
              itemRevision: 7,
              fact: {
                freshness: "live",
                source: "fabric",
                revision: 7,
                observedAt,
                value: {
                  summary: {
                    kind: "evidence",
                    evidenceKind: "artifact",
                    status: "informational",
                    provenance: "agent:chair-1",
                  },
                  detailRef: { kind: "evidence", evidenceId: "artifact-spec", expectedRevision: 7 },
                  actionAvailability: { state: "read-only", reason: "state-ineligible" },
                },
              },
            }],
            nextCursor: 1,
            hasMore: false,
            snapshotRevision: request.snapshotRevision,
            readTransactionId: "evidence-page",
          } as OperatorViewPageResult
        : emptyPage(request.view, request.snapshotRevision)),
      readDetail: vi.fn(async () => ({
        status: "current",
        detailRef: { kind: "evidence", evidenceId: "artifact-spec", expectedRevision: 7 },
        detail: {
          freshness: "live",
          source: "fabric",
          revision: 7,
          observedAt,
          value: {
            kind: "evidence",
            evidenceId: "artifact-spec",
            evidenceKind: "artifact",
            artifactRef: { path: "docs/spec.md", digest: contentDigest },
            sourceKind: "project-file",
            publisherKind: "agent",
            publisherRef: "chair-1",
            projectSessionId: null,
            coordinationRunId: null,
            taskId: null,
            createdAt: observedAt,
            status: "informational",
          },
        },
        snapshotRevision: 1,
        readTransactionId: "evidence-detail",
      }) as OperatorDetailReadResult),
      readArtifactContent: artifactRead,
    });
    const adapter = new ConsoleProtocolAdapter({ binding: binding(port), credential, projectId });
    await adapter.open();

    await expect(adapter.inspect({
      view: "evidence",
      itemId: "artifact-spec",
      itemRevision: revisionFromProtocol(7),
      projectionRevision: revisionFromProtocol(1),
    })).resolves.toMatchObject({
      kind: "artifact",
      state: "unavailable",
      reason: "contract-invalid",
    });
    expect(artifactRead).toHaveBeenCalledTimes(2);
  });

  it("does not misrepresent a non-message Activity row as a failed message read", async () => {
    const port = fakePort({
      viewPage: vi.fn(async (request) => {
        if (request.view !== "activity") {
          return emptyPage(request.view, request.snapshotRevision);
        }
        return {
          status: "page",
          view: "activity",
          rows: [{
            itemId: "activity-lifecycle",
            itemRevision: 4,
            fact: {
              freshness: "live",
              source: "fabric",
              revision: 4,
              observedAt,
              value: {
                summary: {
                  kind: "activity",
                  activityKind: "lifecycle",
                  summary: "Run completed",
                  occurredAt: observedAt,
                },
                detailRef: {
                  kind: "activity",
                  eventId: "activity-lifecycle",
                  expectedRevision: 4,
                },
                actionAvailability: {
                  state: "read-only",
                  reason: "state-ineligible",
                },
              },
            },
          }],
          nextCursor: 1,
          hasMore: false,
          snapshotRevision: request.snapshotRevision,
          readTransactionId: "activity-lifecycle-read",
        } as OperatorViewPageResult;
      }),
    });
    const adapter = new ConsoleProtocolAdapter({
      binding: binding(port),
      credential,
      projectId,
    });
    await adapter.open();

    const inspection = await adapter.inspect({
      view: "activity",
      itemId: "activity-lifecycle",
      itemRevision: revisionFromProtocol(4),
      projectionRevision: revisionFromProtocol(1),
    });

    expect(inspection).toBeNull();
  });

  it("imports only the public protocol package across the Console source tree", async () => {
    const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
    const files = (await readdir(sourceRoot, { recursive: true })).filter(
      (file) => file.endsWith(".ts"),
    );
    const source = (
      await Promise.all(files.map((file) => readFile(`${sourceRoot}${file}`, "utf8")))
    ).join("\n");

    expect(source).not.toMatch(
      /(?:from|import\()\s*["'][^"']*(?:agent-fabric\/src|herdr\/|\.\.\/agent-fabric(?!-protocol))/iu,
    );
    expect(source).not.toMatch(/@local\/agent-fabric-(?!protocol)/);
  });
});
