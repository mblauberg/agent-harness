import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection, createServer, type Server } from "node:net";

import {
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
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
        if (value !== initialize.authentication.credential) {
          throw new ProjectFabricCoreError("AUTHENTICATION_FAILED", "credential is invalid");
        }
        return credential;
      },
      dispatch,
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => server.listen(socketPath, resolve).once("error", reject));
  const stream = createConnection(socketPath);
  return await NdjsonRpcTransport.connect(stream, initialize);
}

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map(async (server) => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }));
  await Promise.allSettled(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("public protocol server", () => {
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
});
