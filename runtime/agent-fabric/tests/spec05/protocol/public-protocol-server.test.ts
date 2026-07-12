import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection, createServer, type Server } from "node:net";

import {
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
  OPERATION_CONTRACT_FIXTURES,
  PROTOCOL_FEATURES,
  PROTOCOL_LIMITS,
  parseProjectSession,
  type ProtocolInitializeRequest,
  type VerifiedProtocolCredential,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { servePublicProtocolConnection } from "../../../src/daemon/public-protocol.ts";
import { ProjectFabricCoreError } from "../../../src/project-session/contracts.ts";

const servers: Server[] = [];
const roots: string[] = [];

const session = parseProjectSession({
  projectSessionId: "session_01",
  projectId: "project_01",
  mode: "coordinated",
  state: "active",
  revision: 3,
  generation: 1,
  authorityRef: `sha256:${"a".repeat(64)}`,
  budgetRef: "budget_01",
  launchPacketRef: { path: "launch/session.json", digest: `sha256:${"b".repeat(64)}` },
  membershipRevision: 2,
  origin: { kind: "operator-launch", operatorId: "operator_01" },
});

const initialize: ProtocolInitializeRequest = {
  protocolVersion: 1,
  client: { name: "daemon-public-protocol-test", version: "1.0.0" },
  authentication: {
    scheme: "capability",
    credential: "operator-secret-0001",
    clientNonce: "client_nonce_01",
  },
  expectedPrincipalKind: "operator",
  requiredFeatures: ["project-sessions.v1"],
  optionalFeatures: [],
};

const credential: VerifiedProtocolCredential = {
  principal: {
    kind: "operator",
    operatorId: "operator_01" as never,
    projectId: "project_01" as never,
    projectAuthorityGeneration: 1,
    principalGeneration: 1,
  },
  grantedOperations: [FABRIC_OPERATIONS.projectSessionGet],
};

async function connectServer(
  dispatch: Parameters<typeof servePublicProtocolConnection>[1]["dispatch"],
  afterResponse?: Parameters<typeof servePublicProtocolConnection>[1]["afterResponse"],
  configuration: Readonly<{
    initialize: ProtocolInitializeRequest;
    credential: VerifiedProtocolCredential;
  }> = { initialize, credential },
): Promise<NdjsonRpcTransport> {
  const root = await mkdtemp(join(tmpdir(), "fabric-public-protocol-"));
  roots.push(root);
  const socketPath = join(root, "fabric.sock");
  const server = createServer((socket) => {
    servePublicProtocolConnection(socket, {
      daemonVersion: "0.1.0",
      daemonInstanceGeneration: 7,
      offeredFeatures: PROTOCOL_FEATURES,
      limits: PROTOCOL_LIMITS,
      verifyCredential: async (value) => {
        if (value !== configuration.initialize.authentication.credential) {
          throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "credential is invalid");
        }
        return configuration.credential;
      },
      dispatch,
      ...(afterResponse === undefined ? {} : { afterResponse }),
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => server.listen(socketPath, resolve).once("error", reject));
  const stream = createConnection(socketPath);
  return await NdjsonRpcTransport.connect(stream, configuration.initialize);
}

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map(async (server) => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }));
  await Promise.allSettled(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("public protocol server", () => {
  it.each([
    FABRIC_OPERATIONS.projectionSnapshot,
    FABRIC_OPERATIONS.projectionPage,
    FABRIC_OPERATIONS.projectionViewPage,
  ] as const)("rejects a negotiated missing notification field for %s before sending", async (operation) => {
    const projectionFeature = operation === FABRIC_OPERATIONS.projectionViewPage
      ? "operator-projection.v2"
      : "operator-projection.v1";
    const projectionInitialize: ProtocolInitializeRequest = {
      protocolVersion: 1,
      client: { name: "extended-console", version: "1.0.0" },
      authentication: {
        scheme: "capability",
        credential: "operator-secret-extended",
        clientNonce: `extended_${operation}`,
      },
      expectedPrincipalKind: "operator",
      requiredFeatures: [projectionFeature],
      optionalFeatures: ["native-notification-projection.v1"],
    };
    const projectionCredential: VerifiedProtocolCredential = {
      principal: credential.principal,
      grantedOperations: [operation],
    };
    const legacyAttention = {
      itemId: "attention_01",
      revision: 1,
      label: "Decision",
      priority: "critical-path",
      title: "Choose",
      sourceFreshness: "live",
      lastEventAt: "2026-07-11T10:00:00Z",
      duplicateCount: 1,
    };
    const result = operation === FABRIC_OPERATIONS.projectionSnapshot
      ? {
          ...(OPERATION_CONTRACT_FIXTURES[FABRIC_OPERATIONS.projectionSnapshot].result as Record<string, unknown>),
          attention: {
            freshness: "live",
            source: "fabric",
            revision: 1,
            observedAt: "2026-07-11T10:00:00Z",
            value: [legacyAttention],
          },
        }
      : operation === FABRIC_OPERATIONS.projectionPage
        ? {
            view: "attention",
            page: {
              freshness: "live",
              source: "fabric",
              revision: 1,
              observedAt: "2026-07-11T10:00:00Z",
              value: { items: [legacyAttention], nextCursor: 1, hasMore: false },
            },
          }
        : {
            status: "page",
            view: "attention",
            rows: [{
              itemId: "attention_01",
              itemRevision: 1,
              fact: {
                freshness: "live",
                source: "fabric",
                revision: 1,
                observedAt: "2026-07-11T10:00:00Z",
                value: {
                  summary: {
                    kind: "attention",
                    label: "Decision",
                    priority: "critical-path",
                    title: "Choose",
                  },
                  detailRef: { kind: "task", taskId: "task_01", expectedRevision: 1 },
                  actionAvailability: { state: "read-only", reason: "feature-unavailable" },
                },
              },
            }],
            nextCursor: 1,
            hasMore: false,
            snapshotRevision: 1,
            readTransactionId: "read_01",
          };
    const input = operation === FABRIC_OPERATIONS.projectionSnapshot
      ? {
          credential: { capabilityId: "capability_01", token: "operator-secret-extended" },
          projectId: "project_01",
        }
      : operation === FABRIC_OPERATIONS.projectionPage
        ? {
            credential: { capabilityId: "capability_01", token: "operator-secret-extended" },
            projectId: "project_01",
            view: "attention",
            after: 0,
            limit: 10,
          }
        : {
            credential: { capabilityId: "capability_01", token: "operator-secret-extended" },
            projectId: "project_01",
            view: "attention",
            snapshotRevision: 1,
            cursor: 0,
            limit: 10,
          };
    const transport = await connectServer(async () => result, undefined, {
      initialize: projectionInitialize,
      credential: projectionCredential,
    });
    try {
      await expect(transport.call(operation, input as never)).rejects.toMatchObject({
        name: "ProtocolTransportError",
        code: "PROTOCOL_INCOMPATIBLE",
      });
    } finally {
      await transport.close();
    }
  });

  it("rejects an unnegotiated notification field at the public response choke point", async () => {
    const projectionInitialize: ProtocolInitializeRequest = {
      protocolVersion: 1,
      client: { name: "legacy-console", version: "1.0.0" },
      authentication: {
        scheme: "capability",
        credential: "operator-secret-legacy",
        clientNonce: "legacy_nonce_01",
      },
      expectedPrincipalKind: "operator",
      requiredFeatures: ["operator-projection.v2"],
      optionalFeatures: [],
    };
    const projectionCredential: VerifiedProtocolCredential = {
      principal: credential.principal,
      grantedOperations: [FABRIC_OPERATIONS.projectionViewPage],
    };
    const transport = await connectServer(async () => ({
      status: "page",
      view: "attention",
      rows: [{
        itemId: "attention_01",
        itemRevision: 1,
        fact: {
          freshness: "live",
          source: "fabric",
          revision: 1,
          observedAt: "2026-07-11T10:00:00Z",
          value: {
            summary: {
              kind: "attention",
              label: "Decision",
              priority: "critical-path",
              title: "Choose",
              nativeNotification: {
                targetIntegration: "native-desktop",
                status: "available",
                journalState: "sent",
                deliveryItemRevision: 1,
                claimGeneration: null,
                integrationState: "available",
                observedAt: "2026-07-11T10:00:00Z",
              },
            },
            detailRef: { kind: "task", taskId: "task_01", expectedRevision: 1 },
            actionAvailability: { state: "read-only", reason: "feature-unavailable" },
          },
        },
      }],
      nextCursor: 1,
      hasMore: false,
      snapshotRevision: 1,
      readTransactionId: "read_01",
    }), undefined, {
      initialize: projectionInitialize,
      credential: projectionCredential,
    });

    try {
      await expect(transport.call(FABRIC_OPERATIONS.projectionViewPage, {
        credential: { capabilityId: "capability_01", token: "operator-secret-legacy" } as never,
        projectId: "project_01" as never,
        view: "attention",
        snapshotRevision: 1,
        cursor: 0,
        limit: 10,
      })).rejects.toMatchObject({
        name: "ProtocolTransportError",
        code: "PROTOCOL_INCOMPATIBLE",
      });
    } finally {
      await transport.close();
    }
  });

  it("binds one credential-derived principal and validates operation results", async () => {
    const dispatch = vi.fn(async () => session);
    const transport = await connectServer(dispatch);
    try {
      expect(transport.principal).toEqual(credential.principal);
      expect([...transport.allowedOperations]).toEqual([FABRIC_OPERATIONS.projectSessionGet]);
      await expect(transport.call(FABRIC_OPERATIONS.projectSessionGet, {
        projectId: "project_01" as never,
        projectSessionId: "session_01" as never,
        expectedGeneration: 1,
      })).resolves.toEqual(session);
      expect(dispatch).toHaveBeenCalledTimes(1);
    } finally {
      await transport.close();
    }
  });

  it("preserves typed daemon failures and their current-state detail", async () => {
    const transport = await connectServer(async () => {
      throw new ProjectFabricCoreError("STALE_REVISION", "session revision changed", {
        expected: 2,
        actual: 3,
        current: session,
      });
    });
    try {
      await expect(transport.call(FABRIC_OPERATIONS.projectSessionGet, {
        projectId: "project_01" as never,
        projectSessionId: "session_01" as never,
        expectedGeneration: 1,
      })).rejects.toMatchObject({
        code: "STALE_REVISION",
        retryable: false,
        details: { expected: 2, actual: 3, current: session },
      });
    } finally {
      await transport.close();
    }
  });

  it("fails closed when a dispatcher returns a schema-invalid success", async () => {
    const transport = await connectServer(async () => ({ state: "invented" }));
    try {
      await expect(transport.call(FABRIC_OPERATIONS.projectSessionGet, {
        projectId: "project_01" as never,
        projectSessionId: "session_01" as never,
        expectedGeneration: 1,
      })).rejects.toMatchObject({ code: "PROTOCOL_INVALID" });
    } finally {
      await transport.close();
    }
  });

  it("runs shutdown handoff only after a valid success is written", async () => {
    const afterResponse = vi.fn();
    const transport = await connectServer(async () => session, afterResponse);
    try {
      await expect(transport.call(FABRIC_OPERATIONS.projectSessionGet, {
        projectId: "project_01" as never,
        projectSessionId: "session_01" as never,
        expectedGeneration: 1,
      })).resolves.toEqual(session);
      await vi.waitFor(() => expect(afterResponse).toHaveBeenCalledTimes(1));
      expect(afterResponse).toHaveBeenCalledWith(expect.objectContaining({
        operation: FABRIC_OPERATIONS.projectSessionGet,
        result: session,
      }));
    } finally {
      await transport.close();
    }
  });
});
