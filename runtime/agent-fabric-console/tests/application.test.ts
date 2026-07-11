import { describe, expect, it, vi } from "vitest";

import type {
  OperatorCapabilityCredential,
  OperatorDetailReadResult,
  OperatorProjectionSnapshot,
  ProjectId,
  Sha256Digest,
  Timestamp,
  ProjectionEventsResult,
} from "@local/agent-fabric-protocol";
import {
  startFabricConsoleApplication,
  type ConsoleBootstrapResult,
  type ConsoleBootstrapPort,
} from "../src/application.js";
import {
  reduceFabricPointer,
  renderFabricConsoleFrame,
} from "../src/index.js";
import type { ConsoleProtocolPort } from "../src/protocol-adapter.js";
import { FABRIC_VIEWS } from "../src/model.js";

const timestamp = "2026-07-11T12:00:00.000Z" as Timestamp;
const digest = (`sha256:${"f".repeat(64)}`) as Sha256Digest;
const projectId = "project-application" as ProjectId;
const credential = {
  capabilityId: "capability-application",
  token: "token-never-render",
} as OperatorCapabilityCredential;

function snapshot(): OperatorProjectionSnapshot {
  return {
    schemaVersion: 1,
    snapshotRevision: 1,
    readTransactionId: "application-snapshot",
    project: {
      freshness: "live",
      source: "fabric",
      revision: 1,
      observedAt: timestamp,
      value: { projectId, canonicalRoot: "/repo" },
    },
    session: {
      freshness: "unavailable",
      source: "fabric",
      revision: 1,
      observedAt: timestamp,
      reason: "no session selected",
    },
    runs: {
      freshness: "live",
      source: "fabric",
      revision: 1,
      observedAt: timestamp,
      value: [],
    },
    attention: {
      freshness: "live",
      source: "fabric",
      revision: 1,
      observedAt: timestamp,
      value: [],
    },
    capacity: {
      freshness: "unavailable",
      source: "fabric",
      revision: 1,
      observedAt: timestamp,
      reason: "unknown",
    },
    cursor: 1,
    stateDigest: digest,
  };
}

function protocolPort(): ConsoleProtocolPort {
  return {
    snapshot: vi.fn(async () => snapshot()),
    events: vi.fn(async (): Promise<ProjectionEventsResult> => ({
      status: "continuation",
      events: [],
      nextCursor: 1,
      hasMore: false,
      snapshotRevision: 1,
      readTransactionId: "events",
    })),
    viewPage: vi.fn(async (request) => ({
      status: "page",
      view: request.view,
      rows: [],
      nextCursor: 0,
      hasMore: false,
      snapshotRevision: request.snapshotRevision,
      readTransactionId: `page-${request.view}`,
    }) as never),
    readDetail: vi.fn(async (): Promise<OperatorDetailReadResult> => ({
      status: "resnapshot-required",
      reason: "snapshot-mismatch",
      currentSnapshotRevision: 1,
    })),
    readGate: vi.fn(async () => {
      throw new Error("unused");
    }),
  };
}

const runtimeDependencies = {
  render: renderFabricConsoleFrame,
  reducePointer: reduceFabricPointer,
};

describe("typed Console application bootstrap boundary", () => {
  it("renders an honest non-mutating System state when bootstrap is unavailable", async () => {
    const bootstrap: ConsoleBootstrapPort = {
      startOrAttach: vi.fn(async (): Promise<ConsoleBootstrapResult> => ({
        status: "unavailable",
        reason: "feature-unavailable",
      })),
    };
    const draw = vi.fn();

    const application = await startFabricConsoleApplication({
      bootstrap,
      projectRoot: "/repo",
      surface: "standalone",
      viewport: { columns: 80, rows: 24 },
      draw,
      eventId: () => "event-1",
      confirmationId: () => "confirmation-1",
      ...runtimeDependencies,
    });

    expect(application.dataset).toMatchObject({
      connection: { state: "unavailable", reason: "bootstrap-unavailable" },
      canMutate: false,
    });
    expect(application.controller.state.activeView).toBe("system");
    expect(application.dataset.pages.system.rows[0]).toMatchObject({
      stableId: "bootstrap",
      freshness: {
        state: "unavailable",
        reason: "feature-unavailable",
      },
    });
    expect(application.frame.rows.join("\n")).toContain("feature-unavailable");
    expect(JSON.stringify(application.dataset)).not.toContain("token-never-render");
    await application.close("operator");
  });

  it.each(["standalone", "herdr"] as const)(
    "uses the same public projection protocol on the %s surface and never replays commands",
    async (surface) => {
      const port = protocolPort();
      const detach = vi.fn(async () => {});
      const close = vi.fn(async () => {});
      const bootstrap: ConsoleBootstrapPort = {
        startOrAttach: vi.fn(async (): Promise<ConsoleBootstrapResult> => ({
          status: "connected",
          binding: { ok: true, port, readOnly: true, actions: null },
          credential,
          projectId,
          detach,
          close,
        })),
      };
      const application = await startFabricConsoleApplication({
        bootstrap,
        projectRoot: "/repo",
        surface,
        viewport: { columns: 80, rows: 24 },
        draw: () => {},
        eventId: () => "event-1",
        confirmationId: () => "confirmation-1",
        ...runtimeDependencies,
      });

      expect(application.dataset.connection).toStrictEqual({ state: "live" });
      expect(application.dataset.canMutate).toBe(false);
      expect(Object.keys(application.dataset.pages)).toStrictEqual(FABRIC_VIEWS);
      await application.refresh();
      await Promise.all([
        application.close("operator"),
        application.close("operator"),
      ]);

      expect(bootstrap.startOrAttach).toHaveBeenCalledWith({
        projectRoot: "/repo",
        surface,
      });
      expect(port.snapshot).toHaveBeenCalledTimes(1);
      expect(port.events).toHaveBeenCalledTimes(1);
      expect(detach).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
    },
  );
});
