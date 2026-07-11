import { afterEach, describe, expect, it } from "vitest";

import { readGlobalLiveness } from "../../../src/daemon/global-liveness.ts";
import { createLivenessDatabase, seedProject } from "./liveness-fixture.ts";

const databases: ReturnType<typeof createLivenessDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("global daemon liveness", () => {
  it("counts exactly the specified session states and fails busy for unknown state", () => {
    const database = createLivenessDatabase();
    databases.push(database);
    seedProject(database);
    const update = database.prepare("UPDATE project_sessions SET state = ? WHERE project_session_id = 'session_01'");
    const contributing = [
      "awaiting_launch", "launching", "active", "quiescing", "awaiting_acceptance", "launch_ambiguous",
      "reconciling", "visibility_degraded", "recovery_required", "quarantined",
    ];
    const terminal = ["draft", "closed", "cancelled", "launch_failed"];

    for (const state of contributing) {
      update.run(state);
      expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
        idle: false,
        failClosed: false,
        contributors: { projectSessions: 1 },
      });
    }
    for (const state of terminal) {
      update.run(state);
      expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
        idle: true,
        failClosed: false,
        contributors: { projectSessions: 0 },
      });
    }
    update.run("invented-state");
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
      idle: false,
      failClosed: true,
      failure: "unknown-state",
    });
  });

  it("counts run, lease, provider and required-result obligations but excludes notifications", () => {
    const database = createLivenessDatabase();
    databases.push(database);
    seedProject(database);
    database.prepare("INSERT INTO runs(run_id, project_session_id, lifecycle_state) VALUES('run_01', 'session_01', 'closed')").run();
    database.prepare("INSERT INTO notification_deliveries(notification_id, state) VALUES('notification_01', 'pending')").run();
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
      idle: true,
      contributors: { total: 0 },
    });

    database.prepare("UPDATE runs SET lifecycle_state = 'active'").run();
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
      idle: false,
      contributors: { coordinationRuns: 1 },
    });
    database.prepare("UPDATE runs SET lifecycle_state = 'closed'").run();

    database.prepare("INSERT INTO leases(lease_id, run_id, status, generation) VALUES('lease_01', 'run_01', 'active', 2)").run();
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
      contributors: { leases: 1 },
    });
    database.prepare("UPDATE leases SET status = 'released'").run();

    for (const state of ["prepared", "dispatched", "accepted", "ambiguous", "quarantined"]) {
      database.prepare("INSERT OR REPLACE INTO provider_actions(run_id, action_id, status) VALUES('run_01', 'action_01', ?)").run(state);
      expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
        contributors: { providerActions: 1 },
      });
    }
    database.prepare("UPDATE provider_actions SET status = 'terminal'").run();

    for (const state of ["pending", "claimed", "provider-accepted", "overdue"]) {
      database.prepare("INSERT OR REPLACE INTO result_deliveries(result_delivery_id, project_session_id, state, required) VALUES('result_01', 'session_01', ?, 1)").run(state);
      expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
        contributors: { requiredResults: 1 },
      });
    }
    database.prepare("UPDATE result_deliveries SET state = 'consumed'").run();
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({ idle: true });
  });

  it("returns busy rather than throwing when authoritative liveness cannot be queried", () => {
    const database = createLivenessDatabase();
    databases.push(database);
    database.exec("DROP TABLE project_sessions");
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toEqual({
      idle: false,
      failClosed: true,
      failure: "query-failed",
      globalStateRevision: null,
      contributors: {
        projectSessions: 0,
        coordinationRuns: 0,
        leases: 0,
        providerActions: 0,
        operatorAttachments: 0,
        requiredResults: 0,
        total: 0,
      },
    });
  });

  it("fails busy for corrupt generation and required-result values", () => {
    const database = createLivenessDatabase();
    databases.push(database);
    seedProject(database);
    database.prepare("UPDATE projects SET authority_generation = 0").run();
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
      idle: false,
      failClosed: true,
      failure: "unknown-state",
    });
    database.prepare("UPDATE projects SET authority_generation = 3").run();
    database.prepare("UPDATE project_sessions SET generation = 0").run();
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({ failClosed: true });
    database.prepare("UPDATE project_sessions SET generation = 5").run();
    database.prepare("INSERT INTO result_deliveries(result_delivery_id, project_session_id, state, required) VALUES('bad', 'session_01', 'pending', 2)").run();
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({ failClosed: true });
  });
});
