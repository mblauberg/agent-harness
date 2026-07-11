import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FABRIC_OPERATIONS,
  operationsForPrincipal,
} from "@local/agent-fabric-protocol";
import { describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { operatorOperationsForActions } from "../../../src/daemon/protocol-credentials.ts";
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
});
