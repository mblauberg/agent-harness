import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

const custodyHarness = vi.hoisted(() => ({
  provisionAgent: vi.fn(async (input: Record<string, unknown>) => ({
    actionId: input.actionId,
    adapterId: input.adapterId,
    agentId: input.agentId,
    authorityId: input.authorityId,
    bridgeGeneration: 1,
    bridgeState: "active",
    evidenceDigest: `sha256:${"a".repeat(64)}`,
    providerSessionGeneration: 1,
    providerSessionRef: "session-worker",
  })),
}));

vi.mock("../../../src/project-session/launch-custody.ts", () => ({
  LaunchCustodyService: class {
    readonly provisionAgent = custodyHarness.provisionAgent;
  },
}));

import { AUTHORITY_ACTION_VOCABULARY, openFabric } from "../../../src/index.ts";
import { TEST_AUTHORITY_V2_FIELDS } from "../../support/authority-v2-testkit.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";
import { ManualClock } from "../../support/manual-clock.ts";

const lifecycleAdapter = fileURLToPath(
  new URL("../../support/lifecycle-fake-provider.ts", import.meta.url),
);

function authority() {
  return {
    ...TEST_AUTHORITY_V2_FIELDS,
    workspaceRoots: ["."],
    sourcePaths: ["src"],
    artifactPaths: [".agent-run"],
    actions: [...AUTHORITY_ACTION_VOCABULARY],
    disclosure: { level: "scoped", scopes: ["local", "approved-provider"] } as const,
    expiresAt: "2099-01-01T00:00:00.000Z",
    budget: { turns: 20, provider_calls: 20 },
  };
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "fabric-provider-write-lease-"));
  const workspaceRoot = await realpath(directory);
  await mkdir(join(directory, "src", "allowed"), { recursive: true });
  await mkdir(join(directory, "src", "other"), { recursive: true });
  const clock = new ManualClock();
  const databasePath = join(directory, "fabric.sqlite3");
  const fabric = await openFabric({
    databasePath,
    fabricSocketPath: join(directory, "fabric.sock"),
    workspaceRoots: [workspaceRoot],
    adapters: {
      lifecycle: {
        command: [process.execPath, "--import", "tsx", lifecycleAdapter],
        environment: { LIFECYCLE_FAKE_JOURNAL: join(directory, "lifecycle.json") },
      },
    },
    clock: clock.now,
  });
  const run = await createCurrentSessionRun({
    databasePath,
    workspaceRoot,
    runId: "provider-write-lease",
    chair: { agentId: "chair", authority: authority() },
  });
  const chair = fabric.connect(run.chairCapability);
  const workerAuthority = await chair.delegateAuthority({
    parentAuthorityId: run.chairAuthorityId,
    authority: { ...authority(), sourcePaths: ["src"], budget: { turns: 5, provider_calls: 5 } },
  });
  await chair.registerAgent({
    agentId: "worker",
    authorityId: workerAuthority.authorityId,
    adapterId: "lifecycle",
    providerSessionRef: "session-worker",
  });
  const task = await chair.createTask({
    taskId: "write-task",
    authorityId: workerAuthority.authorityId,
    participantAgentIds: ["chair", "worker"],
    eligibleAgentIds: ["chair", "worker"],
    objective: "run the approved implementation turn",
    baseRevision: "test-base",
    commandId: "write-task:create",
  });
  const activeTask = await chair.claimTask({
    taskId: task.taskId,
    expectedRevision: task.revision,
    commandId: "write-task:claim",
  });
  return { directory: workspaceRoot, databasePath, fabric, chair, clock, workerAuthority, task: activeTask };
}

async function closeFixture(value: Awaited<ReturnType<typeof fixture>>): Promise<void> {
  await value.fabric.close();
  await rm(value.directory, { recursive: true, force: true });
}

async function providerPayload(databasePath: string, actionId: string): Promise<Record<string, unknown>> {
  const database = new Database(databasePath, { readonly: true });
  try {
    const row = database.prepare(
      "SELECT payload_json FROM provider_actions WHERE run_id=? AND adapter_id='lifecycle' AND action_id=?",
    ).get("provider-write-lease", actionId) as { payload_json: string } | undefined;
    if (row === undefined) throw new Error(`provider action missing: ${actionId}`);
    return JSON.parse(row.payload_json) as Record<string, unknown>;
  } finally {
    database.close();
  }
}

async function spawn(
  value: Awaited<ReturnType<typeof fixture>>,
  payload: Record<string, unknown>,
  actionId = "write-spawn",
): Promise<void> {
  await value.chair.spawnAgent({
    agentId: "worker",
    authorityId: value.workerAuthority.authorityId,
    adapterId: "lifecycle",
    actionId,
    payload: { taskId: value.task.taskId, ...payload },
  });
}

describe("provider workspace-write projection", () => {
  beforeEach(() => {
    custodyHarness.provisionAgent.mockClear();
  });

  it("uses one active task-bound lease for fresh spawn and resumed send_turn", async () => {
    const value = await fixture();
    try {
      await value.chair.acquireWriteLease({
        scope: ["src"],
        ttlMs: 10_000,
        taskId: value.task.taskId,
        commandId: "write-lease:active",
      });
      await spawn(value, { cwd: "src", prompt: "fresh" });
      const freshPayload = custodyHarness.provisionAgent.mock.calls[0]?.[0]?.payload as Record<string, unknown>;
      expect(freshPayload).toMatchObject({
        cwd: join(value.directory, "src"),
        executionProfile: "workspace-write-offline",
        writeRoot: join(value.directory, "src"),
        networkAccess: "none",
      });

      await value.chair.dispatchProviderAction({
        certifyingReview: null,
        adapterId: "lifecycle",
        actionId: "write-resume",
        operation: "send_turn",
        payload: { agentId: "worker", taskId: value.task.taskId, cwd: "src", prompt: "resume" },
        commandId: "write-resume:dispatch",
      });
      expect(await providerPayload(value.databasePath, "write-resume")).toMatchObject({
        executionProfile: "workspace-write-offline",
        writeRoot: join(value.directory, "src"),
        networkAccess: "none",
      });

      value.clock.advance(10_001);
      await expect(value.chair.dispatchProviderAction({
        certifyingReview: null,
        adapterId: "lifecycle",
        actionId: "write-resume",
        operation: "send_turn",
        payload: { agentId: "worker", taskId: value.task.taskId, cwd: "src", prompt: "resume" },
        commandId: "write-resume:reconcile",
      })).resolves.toMatchObject({ status: "terminal" });
    } finally {
      await closeFixture(value);
    }
  });

  it.each([
    ["absent", undefined, undefined, "src"],
    ["expired", "src", 1, "src"],
    ["wrong task", "src", undefined, "src"],
    ["outside scope", "src/allowed", undefined, "src/other"],
  ])("keeps %s lease cases read-only", async (label, scope, ttlMs, cwd) => {
    const value = await fixture();
    try {
      if (scope !== undefined) {
        const leaseTask = label === "wrong task"
          ? await value.chair.createTask({
              taskId: "other-task",
              authorityId: value.workerAuthority.authorityId,
              participantAgentIds: ["chair", "worker"],
              eligibleAgentIds: ["chair", "worker"],
              objective: "other task",
              baseRevision: "test-base",
              commandId: "other-task:create",
            })
          : value.task;
        if (label === "wrong task") {
          await value.chair.claimTask({
            taskId: leaseTask.taskId,
            expectedRevision: leaseTask.revision,
            commandId: "other-task:claim",
          });
        }
        await value.chair.acquireWriteLease({
          scope: [scope],
          ttlMs: ttlMs ?? 10_000,
          taskId: leaseTask.taskId,
          commandId: `write-lease:${label}`,
        });
        if (ttlMs === 1) value.clock.advance(2);
      }
      await spawn(value, { cwd }, `read-only-${label}`);
      const captured = custodyHarness.provisionAgent.mock.calls[0]?.[0]?.payload as Record<string, unknown>;
      expect(captured).toMatchObject({ sandbox: "read-only", readOnlyRoot: join(value.directory, cwd) });
      expect(captured.executionProfile).toBeUndefined();
    } finally {
      await closeFixture(value);
    }
  });

  it("rejects caller selection of the trusted projection even with a covering lease", async () => {
    const value = await fixture();
    try {
      await value.chair.acquireWriteLease({
        scope: ["src"],
        ttlMs: 10_000,
        taskId: value.task.taskId,
        commandId: "write-lease:caller-control",
      });
      await expect(spawn(value, { cwd: "src", executionProfile: "workspace-write-offline" }, "caller-control"))
        .rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
      await expect(spawn(value, {
        cwd: "src",
        trustedProjection: { kind: "workspace-write-offline", workspacePath: "src" },
      }, "caller-trusted-projection"))
        .rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
      await expect(spawn(value, { cwd: null }, "caller-invalid-cwd"))
        .rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
      expect(custodyHarness.provisionAgent).not.toHaveBeenCalled();
    } finally {
      await closeFixture(value);
    }
  });
});
