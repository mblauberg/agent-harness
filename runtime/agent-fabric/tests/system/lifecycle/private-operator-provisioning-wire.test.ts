import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";

import {
  FABRIC_OPERATIONS,
  NdjsonRpcTransport,
  type ProtocolInitializeRequest,
} from "@local/agent-fabric-protocol";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { runWorkspaceTrust, trustedWorkspaceIdentity } from "../../../src/cli/workspace-trust.ts";
import { FabricDaemonClient, startFabricDaemon, type FabricDaemonHandle } from "../../../src/daemon/client.ts";
import type { FabricPaths } from "../../../src/cli/paths.ts";

const handles: FabricDaemonHandle[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.allSettled(handles.splice(0).reverse().map(async (handle) => handle.stop()));
  await Promise.allSettled(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe("private local-operator provisioning wire", () => {
  it("rechecks live trust, derives the local subject and returns plaintext only once", async () => {
    const root = await mkdtemp(join(tmpdir(), "afp-"));
    roots.push(root);
    const stateDirectory = join(root, "s");
    const runtimeDirectory = join(root, "r");
    await Promise.all([
      mkdir(stateDirectory, { recursive: true, mode: 0o700 }),
      mkdir(runtimeDirectory, { recursive: true, mode: 0o700 }),
    ]);
    const paths: FabricPaths = {
      stateDirectory,
      runtimeDirectory,
      databasePath: join(stateDirectory, "f.sqlite3"),
      socketPath: join(runtimeDirectory, "f.sock"),
    };
    await runWorkspaceTrust(["trust", root], paths);
    const trusted = await trustedWorkspaceIdentity({
      stateDirectory,
      canonicalRoot: root,
      executionProfile: "headless",
    });
    const daemon = await startFabricDaemon({
      ...paths,
      workspaceRoots: [trusted.canonicalRoot],
      executionProfile: "headless",
    });
    handles.push(daemon);
    const client = await FabricDaemonClient.connect(paths.socketPath, daemon.bootstrapCapability);
    try {
      const request = {
        canonicalRoot: trusted.canonicalRoot,
        trustRecordDigest: trusted.trustRecordDigest,
        projectAuthorityGeneration: 1,
        principalGeneration: 1,
        actions: ["launch", "read"] as const,
        expiresAt: "2099-01-01T00:00:00.000Z",
      };

      await expect(client.provisionLocalOperator({
        ...request,
        trustRecordDigest: `sha256:${"0".repeat(64)}`,
      })).rejects.toMatchObject({ code: "TRUST_RECORD_CHANGED" });

      const first = await client.provisionLocalOperator(request);
      if (!first.issued) throw new Error("local operator credential was not issued");
      expect(first).toMatchObject({
        issued: true,
        kind: "project-launch",
        actions: ["read", "launch"],
        projectAuthorityGeneration: 1,
        principalGeneration: 1,
        credential: {
          capabilityId: first.capabilityId,
          token: expect.stringMatching(/^afop_[A-Za-z0-9_-]+$/u),
        },
      });
      expect(first.projectId).toMatch(/^project:local:[a-f0-9]{64}$/u);
      expect(first.operatorId).toMatch(/^operator:local:[a-f0-9]{64}$/u);

      const replay = await client.provisionLocalOperator(request);
      expect(replay).toEqual({ ...first, issued: false, credential: undefined });

      await expect(client.provisionLocalOperator({
        ...request,
        authenticatedSubjectHash: `sha256:${"f".repeat(64)}`,
      } as never)).rejects.toMatchObject({ code: "DAEMON_REQUEST_FAILED" });

      const initialize: ProtocolInitializeRequest = {
        protocolVersion: 1,
        client: { name: "private-provisioning-wire-test", version: "1.0.0" },
        authentication: {
          scheme: "capability",
          credential: first.credential.token,
          clientNonce: "local_operator_provisioning_nonce_01",
        },
        expectedPrincipalKind: "operator",
        requiredFeatures: ["project-sessions.v1"],
        optionalFeatures: [],
      };
      const operator = await NdjsonRpcTransport.connect(createConnection(paths.socketPath), initialize);
      try {
        await operator.call(FABRIC_OPERATIONS.projectSessionCreate, {
          command: {
            credential: first.credential,
            commandId: "command_local_session_create_01",
            expectedRevision: 1,
            actor: first.operatorId,
            provenance: {
              kind: "console-direct-input",
              clientId: "console_local_01",
              inputEventId: "input_local_01",
            },
            evidenceRefs: [],
          },
          projectSessionId: "session_local_01",
          projectId: first.projectId,
          mode: "coordinated",
          generation: 1,
          authorityRef: `sha256:${"a".repeat(64)}`,
          budgetRef: "budget_local_01",
          launchPacketRef: {
            path: "docs/launch-packet.json",
            digest: `sha256:${"b".repeat(64)}`,
          },
        } as never);
      } finally {
        await operator.close();
      }

      const sessionRequest = {
        projectId: first.projectId,
        canonicalRoot: trusted.canonicalRoot,
        trustRecordDigest: trusted.trustRecordDigest,
        projectCapability: first.credential,
        projectSessionId: "session_local_01",
        sessionGeneration: 1,
        actions: ["launch", "read", "decide"] as const,
        expiresAt: "2098-01-01T00:00:00.000Z",
        launchEnvelopeExpiresAt: "2098-06-01T00:00:00.000Z",
      };
      const session = await client.issueLocalOperatorSessionCapability(sessionRequest);
      if (!session.issued) throw new Error("local session credential was not issued");
      expect(session).toMatchObject({
        issued: true,
        projectId: first.projectId,
        operatorId: first.operatorId,
        projectSessionId: "session_local_01",
        sessionGeneration: 1,
        actions: ["read", "decide", "launch"],
        credential: {
          capabilityId: session.capabilityId,
          token: expect.stringMatching(/^afop_[A-Za-z0-9_-]+$/u),
        },
      });
      await expect(client.issueLocalOperatorSessionCapability(sessionRequest)).resolves.toEqual({
        ...session,
        issued: false,
        credential: undefined,
      });

      await expect(client.rotateLocalOperatorPrincipal({
        projectId: first.projectId,
        operatorId: first.operatorId,
        canonicalRoot: trusted.canonicalRoot,
        trustRecordDigest: trusted.trustRecordDigest,
        projectAuthorityGeneration: 1,
        expectedPrincipalGeneration: 1,
      })).resolves.toEqual({
        projectId: first.projectId,
        operatorId: first.operatorId,
        principalGeneration: 2,
        revokedCapabilityCount: 2,
      });
      await expect(client.issueLocalOperatorSessionCapability(sessionRequest))
        .rejects.toMatchObject({ code: "CAPABILITY_REVOKED" });

      const database = new Database(paths.databasePath, { readonly: true, fileMustExist: true });
      try {
        expect(database.prepare("SELECT COUNT(*) AS count FROM projects").get()).toEqual({ count: 1 });
        expect(database.prepare(`
          SELECT authenticated_subject_hash FROM operator_principals WHERE operator_id=?
        `).get(first.operatorId)).toEqual({
          authenticated_subject_hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        });
        expect(JSON.stringify(database.prepare("SELECT * FROM operator_capabilities").all()))
          .not.toContain(first.credential.token);
        expect(JSON.stringify(database.prepare("SELECT * FROM operator_capabilities").all()))
          .not.toContain(session.credential.token);
      } finally {
        database.close();
      }
    } finally {
      await client.close();
    }
  });
});
