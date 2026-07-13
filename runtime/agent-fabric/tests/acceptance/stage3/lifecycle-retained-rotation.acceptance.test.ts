import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";

import { NdjsonRpcTransport, PROTOCOL_FEATURES } from "@local/agent-fabric-protocol";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUTHORITY_ACTION_VOCABULARY,
  connectFabricDaemon,
  FABRIC_OPERATIONS,
  startFabricDaemon,
} from "../../../src/index.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";

const fakeAdapter = fileURLToPath(new URL("../../support/agent-bridge-fake-provider.ts", import.meta.url));
const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(async (close) => await close()));
});

const authority = {
  workspaceRoots: ["."],
  sourcePaths: ["src"],
  artifactPaths: [".agent-run"],
  actions: [...AUTHORITY_ACTION_VOCABULARY],
  disclosure: { level: "scoped", scopes: ["local", "approved-provider"] } as const,
  expiresAt: "2099-01-01T00:00:00.000Z",
  budget: {
    turns: 100,
    provider_calls: 100,
    concurrent_turns: 8,
    wall_clock_milliseconds: 1_000_000,
    descendants: 8,
  },
};

type RetainedFixture = Awaited<ReturnType<typeof createRetainedFixture>>;

async function createRetainedFixture() {
  const directory = await mkdtemp("/tmp/af-lr-");
  const stateDirectory = join(directory, "state");
  const runtimeDirectory = join(directory, "runtime");
  const databasePath = join(stateDirectory, "fabric.sqlite3");
  const socketPath = join(runtimeDirectory, "fabric.sock");
  const journalPath = join(directory, "adapter-journal.json");
  const runDirectory = join(directory, ".agent-run", "retained-lifecycle");
  await mkdir(join(directory, "src", "leader"), { recursive: true });
  await mkdir(join(runDirectory, "checkpoints"), { recursive: true });
  const daemon = await startFabricDaemon({
    databasePath,
    stateDirectory,
    runtimeDirectory,
    socketPath,
    workspaceRoots: [directory],
    adapters: {
      "agent-bridge-fake": {
        command: [process.execPath, "--import", "tsx", fakeAdapter],
        environment: { AGENT_BRIDGE_FAKE_JOURNAL: journalPath },
      },
    },
  });
  const bootstrap = await connectFabricDaemon({ socketPath, capability: daemon.bootstrapCapability });
  const run = await createCurrentSessionRun({
    databasePath,
    workspaceRoot: directory,
    runId: "run-retained-lifecycle",
    projectRunDirectory: runDirectory,
    chair: { agentId: "chair", authority },
  });
  const chair = await connectFabricDaemon({ socketPath, capability: run.chairCapability });
  const chairProtocol = await NdjsonRpcTransport.connect(createConnection(socketPath), {
    protocolVersion: 1,
    client: { name: "retained-lifecycle-test-chair", version: "1.0.0" },
    authentication: {
      scheme: "capability",
      credential: run.chairCapability,
      clientNonce: "retained_lifecycle_chair",
    },
    expectedPrincipalKind: "agent",
    requiredFeatures: ["fabric-core.v1"],
    optionalFeatures: PROTOCOL_FEATURES.filter((feature) => feature !== "fabric-core.v1"),
  });
  const leaderAuthority = await chair.delegateAuthority({
    parentAuthorityId: run.chairAuthorityId,
    commandId: "retained-lifecycle:leader-authority",
    authority: {
      ...authority,
      sourcePaths: ["src/leader"],
      budget: { ...authority.budget, descendants: 0 },
    },
  });
  const spawned = await chairProtocol.call(FABRIC_OPERATIONS.spawnAgent, {
    agentId: "leader",
    authorityId: leaderAuthority.authorityId,
    adapterId: "agent-bridge-fake",
    actionId: "retained-lifecycle:source-spawn",
    payload: { initialPrompt: "establish the lifecycle source bridge" },
  });
  const ready = await chairProtocol.call(FABRIC_OPERATIONS.createTask, {
    taskId: "leader-task",
    authorityId: leaderAuthority.authorityId,
    eligibleAgentIds: ["leader"],
    participantAgentIds: ["chair", "leader"],
    objective: "exercise retained lifecycle rotation",
    baseRevision: "retained-lifecycle-base",
    commandId: "retained-lifecycle:create-task",
  });
  let controlSequence = 0;
  const call = async (operation: string, input: Record<string, unknown>): Promise<unknown> => {
    controlSequence += 1;
    const suffix = String(controlSequence);
    const action = await chair.dispatchProviderAction({
      adapterId: "agent-bridge-fake",
      actionId: `retained-lifecycle:bridge-call:${suffix}`,
      operation: "send_turn",
      payload: {
        agentId: "leader",
        resumeReference: spawned.providerSessionRef,
        providerSessionGeneration: spawned.providerSessionGeneration,
        fabricOperation: operation,
        fabricInput: input,
      },
      commandId: `retained-lifecycle:bridge-call:${suffix}:dispatch`,
    });
    const result = action.result;
    if (typeof result !== "object" || result === null || Array.isArray(result)) {
      throw new Error("retained fake provider returned no Fabric result");
    }
    const error = Reflect.get(result, "fabricError");
    if (typeof error === "object" && error !== null && !Array.isArray(error)) {
      throw Object.assign(
        new Error(String(Reflect.get(error, "message") ?? "retained Fabric call failed")),
        { code: String(Reflect.get(error, "code") ?? "RECOVERY_REQUIRED") },
      );
    }
    return Reflect.get(result, "fabricResult");
  };
  const claimed = await call(FABRIC_OPERATIONS.claimTask, {
    taskId: ready.taskId,
    expectedRevision: ready.revision,
    commandId: "retained-lifecycle:claim-task",
  }) as { taskId: string; revision: number };
  return {
    directory,
    databasePath,
    journalPath,
    runDirectory,
    daemon,
    bootstrap,
    chair,
    chairProtocol,
    run,
    spawned,
    call,
    task: claimed,
  };
}

async function writeCheckpoint(fixture: RetainedFixture) {
  const relativePath = join("checkpoints", "leader.json");
  const document = {
    schemaVersion: 1,
    agentId: "leader",
    mailboxWatermark: 0,
    acknowledgedAboveWatermark: [],
    inFlightChildren: [],
    openWork: [fixture.task.taskId],
    nextAction: "continue only after successor checkpoint acknowledgement",
    providerResumeReference: fixture.spawned.providerSessionRef,
  };
  const bytes = `${JSON.stringify(document, null, 2)}\n`;
  await writeFile(join(fixture.runDirectory, relativePath), bytes);
  return {
    relativePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mailboxWatermark: document.mailboxWatermark,
    acknowledgedAboveWatermark: document.acknowledgedAboveWatermark,
    inFlightChildren: document.inFlightChildren,
    openWork: document.openWork,
    nextAction: document.nextAction,
    providerResumeReference: document.providerResumeReference,
  };
}

describe("FR-013 retained lifecycle replacement", () => {
  it("returns suspended inside the predecessor turn, then swaps one retained bridge after that turn releases", async () => {
    const fixture = await createRetainedFixture();
    cleanup.push(async () => {
      await Promise.allSettled([
        fixture.chairProtocol.close(),
        fixture.chair.close(),
        fixture.bootstrap.close(),
      ]);
      await fixture.daemon.stop();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const checkpoint = await writeCheckpoint(fixture);

    const accepted = await fixture.call(FABRIC_OPERATIONS.requestLifecycle, {
      action: "rotate",
      agentId: "leader",
      taskId: fixture.task.taskId,
      taskRevision: fixture.task.revision,
      checkpoint,
      commandId: "retained-lifecycle:rotate",
    });
    expect(accepted).toMatchObject({
      agentId: "leader",
      lifecycle: "suspended",
      providerSessionGeneration: 1,
    });

    await vi.waitFor(async () => {
      await expect(fixture.chairProtocol.call(FABRIC_OPERATIONS.getAgentLifecycle, {
        agentId: "leader",
      })).resolves.toMatchObject({
        lifecycle: "ready",
        providerSessionGeneration: 2,
      });
    }, { timeout: 5_000 });

    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare(`
      SELECT bridge_state,provider_session_generation,bridge_generation,
             capability_hash,activation_evidence_digest
        FROM agent_bridge_state WHERE run_id=? AND agent_id='leader'
    `).get(fixture.run.runId)).toMatchObject({
      bridge_state: "active",
      provider_session_generation: 2,
      bridge_generation: 2,
      capability_hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      activation_evidence_digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
    expect(database.prepare(`
      SELECT principal_generation,revoked_at IS NOT NULL AS revoked
        FROM capabilities WHERE run_id=? AND agent_id='leader'
       ORDER BY principal_generation
    `).all(fixture.run.runId)).toEqual([
      { principal_generation: 1, revoked: 1 },
      { principal_generation: 2, revoked: 0 },
    ]);
    database.close();
  });
});
