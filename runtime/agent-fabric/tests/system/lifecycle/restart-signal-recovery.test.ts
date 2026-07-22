import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GuardedIdleStopController,
  markDaemonRuntimeRunning,
  readGlobalLiveness,
  recoverDaemonRuntimeEpoch,
} from "../../../src/lifecycle/global-liveness.ts";
import { createLivenessDatabase, seedProject } from "./liveness-fixture.ts";

const databases: ReturnType<typeof createLivenessDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("daemon restart and signal control", () => {
  it("fences a crashed epoch without expiring an attachment from process absence alone", () => {
    const database = createLivenessDatabase();
    databases.push(database);
    database.prepare("DELETE FROM daemon_runtime_epochs").run();
    database.prepare(`
      INSERT INTO daemon_runtime_epochs(instance_generation, instance_id, state, started_at, heartbeat_at)
      VALUES(6, 'daemon_06', 'running', 1, 1)
    `).run();
    seedProject(database);
    database.prepare(`
      INSERT INTO operator_client_attachments(
        attachment_id, project_id, project_authority_generation, project_session_id, session_generation,
        daemon_instance_generation, state, expires_at
      ) VALUES('attachment_06', 'project_01', 3, NULL, NULL, 6, 'active', 5_000)
    `).run();

    expect(recoverDaemonRuntimeEpoch(database, {
      instanceGeneration: 7,
      instanceId: "daemon_07",
      now: 1_000,
    })).toEqual({ instanceGeneration: 7, recoveredGenerations: [6], state: "starting" });
    expect(database.prepare("SELECT state, stopped_at FROM daemon_runtime_epochs WHERE instance_generation = 6").get())
      .toEqual({ state: "crashed", stopped_at: 1_000 });
    expect(database.prepare("SELECT state FROM operator_client_attachments WHERE attachment_id = 'attachment_06'").get())
      .toEqual({ state: "active" });
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
      idle: true,
      contributors: { operatorAttachments: 0 },
    });
    expect(markDaemonRuntimeRunning(database, { instanceGeneration: 7, now: 1_001 })).toEqual({
      instanceGeneration: 7,
      state: "running",
    });
  });

  it("coalesces repeated SIGINT and SIGTERM requests onto one guarded stop", async () => {
    let resolveStop: ((value: { state: "stopped"; daemonInstanceGeneration: number; globalStateRevision: number }) => void) | undefined;
    const attempt = vi.fn().mockImplementation(async () => await new Promise((resolve) => { resolveStop = resolve; }));
    const controller = new GuardedIdleStopController(attempt);

    const first = controller.request("SIGINT");
    const second = controller.request("SIGTERM");
    expect(attempt).toHaveBeenCalledTimes(1);
    resolveStop?.({ state: "stopped", daemonInstanceGeneration: 7, globalStateRevision: 9 });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { state: "stopped", daemonInstanceGeneration: 7, globalStateRevision: 9 },
      { state: "stopped", daemonInstanceGeneration: 7, globalStateRevision: 9 },
    ]);
    await expect(controller.request("SIGTERM")).resolves.toMatchObject({ state: "stopped" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
