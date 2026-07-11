import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FABRIC_OPERATIONS,
  NATIVE_NOTIFICATION_PROJECTION_FEATURE,
  operationsForPrincipal,
  parseOperatorCapabilityGrant,
} from "@local/agent-fabric-protocol";
import { describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { operatorOperationsForActions } from "../../../src/daemon/protocol-credentials.ts";
import type { PublicProtocolContext } from "../../../src/daemon/public-protocol.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import { ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";

describe("public protocol credential routing", () => {
  it("derives an agent principal and exact stored authority operations from its bearer token", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-agent-protocol-credential-"));
    const databasePath = join(directory, "fabric.sqlite3");
    try {
      const fabric = await openFabric({ databasePath, workspaceRoots: [directory] });
      try {
        const run = await fabric.createRun({
          runId: "run_protocol_credential",
          chair: {
            agentId: "chair",
            authority: {
              ...ROOT_AUTHORITY,
              actions: [...ROOT_AUTHORITY.actions, FABRIC_OPERATIONS.scopedGateCheck],
            },
          },
        });
        const verified = fabric.verifyProtocolCredential(run.chairCapability);
        expect(verified.principal).toMatchObject({
          kind: "agent",
          agentId: "chair",
          runId: "run_protocol_credential",
          principalGeneration: 1,
        });
        expect(verified.grantedOperations).toEqual(expect.arrayContaining([
          FABRIC_OPERATIONS.createTask,
          FABRIC_OPERATIONS.observeEvents,
          FABRIC_OPERATIONS.scopedGateCheck,
        ]));
        expect(verified.grantedOperations).not.toContain(FABRIC_OPERATIONS.projectSessionCreate);
        const principal = verified.principal;
        if (principal.kind !== "agent") throw new Error("expected agent principal");
        const context: PublicProtocolContext = {
          principal,
          allowedOperations: new Set(verified.grantedOperations),
          features: ["fabric-core.v1"],
          connectionNonce: "connection_agent_01",
          credentialHash: createHash("sha256").update(run.chairCapability).digest("hex"),
          daemonInstanceGeneration: 1,
        };
        await expect(fabric.dispatchPublicProtocol(
          context,
          FABRIC_OPERATIONS.getRunStatus,
          { runId: "run_protocol_credential" },
        )).resolves.toMatchObject({
          runId: "run_protocol_credential",
          chairAgentId: "chair",
        });
        await expect(fabric.dispatchPublicProtocol(
          { ...context, allowedOperations: new Set() },
          FABRIC_OPERATIONS.getRunStatus,
          { runId: "run_protocol_credential" },
        )).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
        await expect(fabric.dispatchPublicProtocol(
          context,
          FABRIC_OPERATIONS.scopedGateCheck,
          {
            projectSessionId: principal.projectSessionId,
            coordinationRunId: principal.runId as never,
            dependencyRevision: 1,
            enforcementPoint: "task-readiness",
            taskId: "unknown_task" as never,
          },
        )).resolves.toEqual({ allowed: true, checkedGateRevisions: {} });
      } finally {
        await fabric.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("maps abstract operator grants only to legal, action-relevant operator operations", () => {
    const read = operatorOperationsForActions(["read"]);
    expect(read).toEqual(expect.arrayContaining([
      FABRIC_OPERATIONS.projectSessionGet,
      FABRIC_OPERATIONS.projectionViewPage,
      FABRIC_OPERATIONS.operatorActionStatus,
      FABRIC_OPERATIONS.operatorRepositoryRead,
    ]));
    expect(read).not.toContain(FABRIC_OPERATIONS.projectSessionCreate);
    expect(read).not.toContain(FABRIC_OPERATIONS.operatorActionCommit);

    const launch = operatorOperationsForActions(["launch"]);
    expect(launch).toEqual(expect.arrayContaining([
      FABRIC_OPERATIONS.projectSessionCreate,
      FABRIC_OPERATIONS.intakeDraftCreate,
    ]));
    expect(launch).not.toContain(FABRIC_OPERATIONS.chairTakeover);

    const consequential = operatorOperationsForActions(["pause", "git", "external-effect"]);
    expect(consequential).toEqual(expect.arrayContaining([
      FABRIC_OPERATIONS.operatorActionPreview,
      FABRIC_OPERATIONS.operatorActionCommit,
      FABRIC_OPERATIONS.operatorActionReconcile,
    ]));
    expect(consequential).not.toContain(FABRIC_OPERATIONS.operatorRepositoryRead);
    expect(consequential.every((operation) => operationsForPrincipal("operator").has(operation as never))).toBe(true);

    const lifecycle = operatorOperationsForActions(["drain", "stop"]);
    expect(lifecycle).toEqual(expect.arrayContaining([
      FABRIC_OPERATIONS.operatorActionPreview,
      FABRIC_OPERATIONS.operatorActionCommit,
      FABRIC_OPERATIONS.operatorActionStatus,
      FABRIC_OPERATIONS.operatorActionReconcile,
    ]));
    expect(lifecycle).not.toContain(FABRIC_OPERATIONS.projectSessionDrain);
    expect(lifecycle).not.toContain(FABRIC_OPERATIONS.projectSessionStop);
    expect(lifecycle).not.toContain(FABRIC_OPERATIONS.daemonDrain);
    expect(lifecycle).not.toContain(FABRIC_OPERATIONS.daemonStop);
  });

  it("resolves a current operator token through the same public verifier", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-operator-protocol-credential-"));
    const databasePath = join(directory, "fabric.sqlite3");
    try {
      const initial = await openFabric({ databasePath, workspaceRoots: [directory] });
      await initial.createRun({
        runId: "run_operator_protocol",
        chair: { agentId: "chair", authority: ROOT_AUTHORITY },
      });
      await initial.close();

      let projectSessionId = "";
      const database = new Database(databasePath);
      try {
        database.pragma("foreign_keys = ON");
        const identity = database.prepare(`
          SELECT p.project_id, p.authority_generation, s.project_session_id, s.generation
            FROM projects p JOIN project_sessions s ON s.project_id=p.project_id
        `).get() as {
          project_id: string;
          authority_generation: number;
          project_session_id: string;
          generation: number;
        };
        projectSessionId = identity.project_session_id;
        const store = new OperatorStore({ database, clock: () => Date.parse("2027-01-01T00:00:00Z") });
        store.registerPrincipal({
          operatorId: "operator_protocol",
          projectId: identity.project_id,
          authenticatedSubjectHash: "local-subject-hash",
          projectAuthorityGeneration: identity.authority_generation,
        });
        store.issueCapability(parseOperatorCapabilityGrant({
          capabilityId: "cap_operator_protocol",
          operatorId: "operator_protocol",
          projectId: identity.project_id,
          projectAuthorityGeneration: identity.authority_generation,
          principalGeneration: 1,
          issuedAt: "2026-01-01T00:00:00Z",
          expiresAt: "2099-01-01T00:00:00Z",
          status: "active",
          kind: "session",
          projectSessionId: identity.project_session_id,
          sessionGeneration: identity.generation,
          actions: ["read", "decide", "pause"],
        }), "operator-protocol-secret");
        database.prepare(`
          INSERT INTO attention_items(
            item_id, project_session_id, coordination_run_id, kind, severity,
            revision, state, dedupe_key, payload_json, created_at, updated_at
          ) VALUES (?, ?, ?, 'approval', 'critical', 1, 'open', ?, ?, ?, ?)
        `).run(
          "attention_protocol_01",
          identity.project_session_id,
          "run_operator_protocol",
          "attention:protocol:01",
          JSON.stringify({ title: "Protocol attention" }),
          Date.parse("2027-01-01T00:00:00Z"),
          Date.parse("2027-01-01T00:00:00Z"),
        );
      } finally {
        database.close();
      }

      const reopened = await openFabric({
        databasePath,
        workspaceRoots: [directory],
        clock: () => Date.parse("2027-01-01T00:00:00Z"),
      });
      try {
        const verified = reopened.verifyProtocolCredential("operator-protocol-secret");
        expect(verified.principal).toMatchObject({
          kind: "operator",
          operatorId: "operator_protocol",
          projectAuthorityGeneration: 1,
          principalGeneration: 1,
        });
        expect(verified.grantedOperations).toEqual(expect.arrayContaining([
          FABRIC_OPERATIONS.projectSessionGet,
          FABRIC_OPERATIONS.scopedGateResolve,
        ]));
        expect(verified.grantedOperations).not.toContain(FABRIC_OPERATIONS.projectSessionCreate);
        const principal = verified.principal;
        if (principal.kind !== "operator") throw new Error("expected operator principal");
        const context: PublicProtocolContext = {
          principal,
          allowedOperations: new Set(verified.grantedOperations),
          features: ["project-sessions.v1"],
          connectionNonce: "connection_01",
          credentialHash: createHash("sha256").update("operator-protocol-secret").digest("hex"),
          daemonInstanceGeneration: 7,
        };
        const session = await reopened.dispatchPublicProtocol(
          context,
          FABRIC_OPERATIONS.projectSessionGet,
          {
            projectId: principal.projectId,
            projectSessionId: projectSessionId as never,
            expectedGeneration: 1,
          },
        );
        expect(session).toMatchObject({ projectId: principal.projectId, state: "recovery_required" });
        await expect(reopened.dispatchPublicProtocol(
          context,
          FABRIC_OPERATIONS.projectionSnapshot,
          {
            credential: { capabilityId: "cap_operator_protocol", token: "operator-protocol-secret" },
            projectId: principal.projectId,
            projectSessionId: projectSessionId as never,
          },
        )).resolves.toMatchObject({
          schemaVersion: 1,
          project: { value: { projectId: principal.projectId } },
          session: { value: { projectSessionId } },
        });
        const legacyPage = await reopened.dispatchPublicProtocol(
          { ...context, features: ["project-sessions.v1", "operator-projection.v1"] },
          FABRIC_OPERATIONS.projectionPage,
          {
            credential: { capabilityId: "cap_operator_protocol", token: "operator-protocol-secret" },
            projectId: principal.projectId,
            projectSessionId: projectSessionId as never,
            view: "attention",
            after: 0,
            limit: 10,
          },
        );
        expect(legacyPage).toMatchObject({
          view: "attention",
          page: { value: { items: [{ itemId: "attention_protocol_01" }] } },
        });
        expect(legacyPage).not.toHaveProperty("page.value.items.0.nativeNotification");
        await expect(reopened.dispatchPublicProtocol(
          {
            ...context,
            features: [
              "project-sessions.v1",
              "operator-projection.v1",
              NATIVE_NOTIFICATION_PROJECTION_FEATURE,
            ],
          },
          FABRIC_OPERATIONS.projectionPage,
          {
            credential: { capabilityId: "cap_operator_protocol", token: "operator-protocol-secret" },
            projectId: principal.projectId,
            projectSessionId: projectSessionId as never,
            view: "attention",
            after: 0,
            limit: 10,
          },
        )).resolves.toHaveProperty("page.value.items.0.nativeNotification");
        const preview = await reopened.dispatchPublicProtocol(
          context,
          FABRIC_OPERATIONS.operatorActionPreview,
          {
            command: {
              credential: { capabilityId: "cap_operator_protocol", token: "operator-protocol-secret" },
              commandId: "command_operator_preview_01",
              expectedRevision: 1,
              actor: "operator_protocol",
              provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: "input_01" },
              evidenceRefs: [],
            },
            projectId: principal.projectId,
            intent: {
              kind: "control",
              action: "pause",
              target: {
                kind: "run",
                projectSessionId,
                coordinationRunId: "run_operator_protocol",
                expectedRevision: 1,
              },
            },
          } as never,
        );
        expect(preview).toMatchObject({ consequenceClass: "routine", confirmationMode: "explicit" });
        if (typeof preview !== "object" || preview === null || !("previewId" in preview)) {
          throw new Error("expected a production operator preview");
        }
        const productionPreview = preview as {
          previewId: string;
          previewRevision: number;
          previewDigest: string;
          intentDigest: string;
        };
        await expect(reopened.dispatchPublicProtocol(
          context,
          FABRIC_OPERATIONS.operatorActionCommit,
          {
            command: {
              credential: { capabilityId: "cap_operator_protocol", token: "operator-protocol-secret" },
              commandId: "command_operator_commit_01",
              expectedRevision: 1,
              actor: "operator_protocol",
              provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: "input_02" },
              evidenceRefs: [],
            },
            projectId: principal.projectId,
            previewId: productionPreview.previewId,
            expectedPreviewRevision: productionPreview.previewRevision,
            previewDigest: productionPreview.previewDigest,
            expectedIntentDigest: productionPreview.intentDigest,
            confirmation: { kind: "explicit", confirmationId: "confirm_pause_01" },
          } as never,
        )).resolves.toMatchObject({ commandId: "command_operator_commit_01" });
      } finally {
        await reopened.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
