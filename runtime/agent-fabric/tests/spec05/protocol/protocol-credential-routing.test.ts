import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FABRIC_OPERATIONS,
  operationsForPrincipal,
  parseOperatorCapabilityGrant,
} from "@local/agent-fabric-protocol";
import { describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { operatorOperationsForActions } from "../../../src/daemon/protocol-credentials.ts";
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
          chair: { agentId: "chair", authority: ROOT_AUTHORITY },
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
        ]));
        expect(verified.grantedOperations).not.toContain(FABRIC_OPERATIONS.projectSessionCreate);
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
    expect(consequential.every((operation) => operationsForPrincipal("operator").has(operation as never))).toBe(true);
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
          actions: ["read", "decide"],
        }), "operator-protocol-secret");
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
      } finally {
        await reopened.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
