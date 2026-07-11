import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type {
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
import { FABRIC_VIEWS } from "../src/model.js";

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
    ...overrides,
  };
}

function binding(port: ConsoleProtocolPort): ConsoleProtocolBinding {
  return { ok: true, port, readOnly: true, actions: null };
}

describe("public protocol adapter", () => {
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

    expect(result.connection).toStrictEqual({ state: "live" });
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

    expect(result.connection).toStrictEqual({ state: "live" });
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
      binding: { ok: true, port, readOnly: false, actions: {} as never },
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

  it("imports only the public protocol package across the Console source tree", async () => {
    const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
    const files = [
      "index.ts",
      "input.ts",
      "model.ts",
      "protocol-adapter.ts",
      "terminal.ts",
    ];
    const source = (
      await Promise.all(files.map((file) => readFile(`${sourceRoot}${file}`, "utf8")))
    ).join("\n");

    expect(source).not.toMatch(/agent-fabric\/src|herdr|sqlite|\.\.\/agent-fabric(?!-protocol)/i);
    expect(source).not.toMatch(/@local\/agent-fabric-(?!protocol)/);
  });
});
