import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import {
  FABRIC_OPERATIONS,
  parseOperationInput,
  type RunPlanDeclareRequest,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { openFabric, type Fabric } from "../../../src/index.ts";
import type { PublicProtocolContext } from "../../../src/daemon/public-protocol.ts";
import { ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";

const now = Date.parse("2027-01-01T00:00:00.000Z");
const digest = (character: string) => `sha256:${character.repeat(64)}` as const;
const cleanups: Array<() => Promise<void>> = [];

type Fixture = Readonly<{
  fabric: Fabric;
  databasePath: string;
  context: PublicProtocolContext;
  nonChairContext: PublicProtocolContext;
}>;

function protocolContext(fabric: Fabric, capability: string): PublicProtocolContext {
  const verified = fabric.verifyProtocolCredential(capability);
  if (verified.principal.kind !== "agent") throw new Error("expected agent principal");
  return {
    principal: verified.principal,
    allowedOperations: new Set(verified.grantedOperations),
    features: ["run-plan-declaration.v1"],
    connectionNonce: "connection_run_plan",
    credentialHash: createHash("sha256").update(capability).digest("hex"),
    daemonInstanceGeneration: 1,
  };
}

async function setup(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "fabric-run-plan-"));
  const databasePath = join(directory, "fabric.sqlite3");
  const initial = await openFabric({ databasePath, workspaceRoots: [directory], clock: () => now });
  const created = await createCurrentSessionRun({
    databasePath,
    workspaceRoot: directory,
    runId: "run_plan_01",
    chair: {
      agentId: "chair_plan_01",
      authority: ROOT_AUTHORITY,
    },
    now,
  });
  await initial.close();
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database.prepare(`
    INSERT INTO artifacts(
      artifact_id, project_id, project_session_id, run_id, task_id,
      publisher_kind, publisher_ref, publisher_agent_id, source_kind, evidence_kind,
      relative_path, sha256, registry_state, quarantine_reason, revision, created_at
    ) VALUES (
      'artifact_scope_01', ?, ?, 'run_plan_01', NULL,
      'agent', 'chair_plan_01', 'chair_plan_01', 'project-file', 'artifact',
      'scope/accepted.md', ?, 'active', NULL, 1, ?
    )
  `).run(created.projectId, created.projectSessionId, digest("a"), now - 20);
  database.prepare(`
    INSERT INTO intakes(
      intake_id, project_id, project_session_id, coordination_run_id, dedupe_key,
      state, revision, chair_request_id, chair_request_revision, summary,
      artifact_refs_json, gate_ids_json, payload_digest, created_at, updated_at,
      accepted_scope_artifact_id, accepted_scope_state
    ) VALUES (
      'intake_plan_01', ?, ?, 'run_plan_01', 'intake:plan:01',
      'accepted', 3, NULL, NULL, 'Accepted scope',
      ?, '[]', ?, ?, ?, 'artifact_scope_01', 'bound'
    )
  `).run(
    created.projectId,
    created.projectSessionId,
    JSON.stringify([{ path: "scope/accepted.md", digest: digest("a") }]),
    digest("c"),
    now - 10,
    now - 10,
  );
  database.close();

  const fabric = await openFabric({ databasePath, workspaceRoots: [directory], clock: () => now });
  const chair = fabric.connect(created.chairCapability);
  const delegated = await chair.delegateAuthority({
    parentAuthorityId: created.chairAuthorityId,
    authority: {
      ...ROOT_AUTHORITY,
      sourcePaths: ["src/non-chair"],
      artifactPaths: [".agent-run/non-chair"],
      actions: [FABRIC_OPERATIONS.runPlanDeclare],
      budget: { turns: 1 },
    },
  });
  const nonChair = await chair.registerAgent({
    agentId: "non_chair_plan_01",
    authorityId: delegated.authorityId,
  });
  const fixture = {
    fabric,
    databasePath,
    context: protocolContext(fabric, created.chairCapability),
    nonChairContext: protocolContext(fabric, nonChair.capability),
  };
  cleanups.unshift(async () => {
    await fixture.fabric.close();
    await rm(directory, { recursive: true, force: true });
  });
  return fixture;
}

function request(path = "plans/plan-1.md", denominator: number | null = 6): RunPlanDeclareRequest {
  return parseOperationInput(FABRIC_OPERATIONS.runPlanDeclare, {
    runId: "run_plan_01",
    planArtifactRef: { path, digest: digest(path.endsWith("1.md") ? "1" : "2") },
    expectedAcceptedScopeRevision: 3,
    ...(denominator === null ? {} : { declaredTaskDenominator: denominator }),
  });
}

afterEach(async () => {
  await Promise.allSettled(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe("run plan declaration acceptance", () => {
  it("appends immutable declarations with monotonic per-run revisions", async () => {
    const fixture = await setup();
    const first = await fixture.fabric.dispatchPublicProtocol(
      fixture.context,
      FABRIC_OPERATIONS.runPlanDeclare,
      request(),
    );
    const second = await fixture.fabric.dispatchPublicProtocol(
      fixture.context,
      FABRIC_OPERATIONS.runPlanDeclare,
      request("plans/plan-2.md", null),
    );
    expect(first).toMatchObject({
      runId: "run_plan_01",
      planRevision: 1,
      acceptedScopeRevision: 3,
      declaredTaskDenominator: 6,
    });
    expect(second).toMatchObject({
      runId: "run_plan_01",
      planRevision: 2,
      declaredTaskDenominator: null,
    });
    const database = new Database(fixture.databasePath);
    expect(database.prepare(`
      SELECT plan_revision,plan_path FROM run_plan_declarations
       WHERE run_id='run_plan_01' ORDER BY plan_revision
    `).all()).toEqual([
      { plan_revision: 1, plan_path: "plans/plan-1.md" },
      { plan_revision: 2, plan_path: "plans/plan-2.md" },
    ]);
    expect(() => database.prepare(`
      UPDATE run_plan_declarations SET plan_path='changed' WHERE run_id='run_plan_01'
    `).run()).toThrow(/INVARIANT_run_plan_declaration_immutable/u);
    expect(() => database.prepare(`
      DELETE FROM run_plan_declarations WHERE run_id='run_plan_01'
    `).run()).toThrow(/INVARIANT_run_plan_declaration_immutable/u);
    expect(() => database.exec(`
      INSERT INTO run_plan_declarations
      SELECT run_id,4,plan_path,plan_digest,accepted_scope_artifact_id,
             accepted_scope_revision,accepted_scope_path,accepted_scope_digest,
             declared_task_denominator,declared_by_agent_id,declared_at
        FROM run_plan_declarations WHERE run_id='run_plan_01' AND plan_revision=2
    `)).toThrow(/INVARIANT_run_plan_revision_contiguous/u);
    database.close();
  });

  it("rejects stale accepted-scope revisions without appending", async () => {
    const fixture = await setup();
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.context,
      FABRIC_OPERATIONS.runPlanDeclare,
      { ...request(), expectedAcceptedScopeRevision: 2 },
    )).rejects.toMatchObject({ code: "STALE_REVISION" });
    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare("SELECT COUNT(*) AS declarations FROM run_plan_declarations").get())
      .toEqual({ declarations: 0 });
    database.close();
  });

  it("rejects a caller that no longer holds current chair custody", async () => {
    const fixture = await setup();
    await expect(fixture.fabric.dispatchPublicProtocol(
      fixture.nonChairContext,
      FABRIC_OPERATIONS.runPlanDeclare,
      request(),
    )).rejects.toMatchObject({ code: "TASK_NOT_OWNER" });
  });
});
