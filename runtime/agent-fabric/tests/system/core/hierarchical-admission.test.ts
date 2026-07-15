import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type Database from "better-sqlite3";
import type {
  ResourceReconcileRequest,
  ResourceReleaseRequest,
  ResourceReservationRequest,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import {
  HierarchicalAdmissionStore,
  type EnsureRunHierarchyContext,
  type EnsureRunHierarchyRequest,
} from "../../../src/resources/store.ts";
import { chairContext, openSystemDatabase } from "./restart-recovery-fixtures.ts";

const databases: Database.Database[] = [];
const temporary: string[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function open(): Database.Database {
  const database = openSystemDatabase();
  databases.push(database);
  return database;
}

const hierarchyContext: EnsureRunHierarchyContext = {
  projectId: "project_01",
  projectSessionId: "session_01",
  coordinationRunId: "run_01",
  actor: { kind: "operator-launch", operatorId: "operator_01" },
};

const hierarchy: EnsureRunHierarchyRequest = {
  project: { scopeId: "scope_project", limits: { provider_calls: 10, concurrent_turns: 4 } },
  session: { scopeId: "scope_session", limits: { provider_calls: 8, concurrent_turns: 3 } },
  run: { scopeId: "scope_run", limits: { provider_calls: 8, concurrent_turns: 2 } },
};

function reserve(
  store: HierarchicalAdmissionStore,
  input: unknown,
) {
  return store.reserve(chairContext, input as ResourceReservationRequest);
}

describe("hierarchical resource admission", () => {
  it("creates exact root scopes atomically inside an outer transaction, replays exactly, and rejects widening", () => {
    const database = open();
    const store = new HierarchicalAdmissionStore({ database, clock: () => 1_000 });
    const outer = database.transaction(() => store.ensureRunHierarchy(hierarchyContext, hierarchy));

    const created = outer();
    expect(created.map(({ scopeId, kind }) => [scopeId, kind])).toEqual([
      ["scope_project", "project"],
      ["scope_session", "project-session"],
      ["scope_run", "coordination-run"],
    ]);
    expect(store.ensureRunHierarchy(hierarchyContext, hierarchy)).toEqual(created);
    expect(database.prepare("SELECT count(*) AS count FROM resource_scopes").get()).toEqual({ count: 3 });

    expect(() => store.ensureRunHierarchy(hierarchyContext, {
      ...hierarchy,
      session: { ...hierarchy.session, limits: { provider_calls: 9, concurrent_turns: 3 } },
    })).toThrowError(/widen|conflict/iu);
    expect(database.prepare(`
      SELECT limit_value FROM resource_dimensions
       WHERE scope_id='scope_session' AND unit_key='provider_calls'
    `).get()).toEqual({ limit_value: 8 });

    expect(() => store.ensureRunHierarchy(
      hierarchyContext,
      {
        project: { scopeId: "scope_project_empty", limits: {} },
        session: { scopeId: "scope_session_empty", limits: {} },
        run: { scopeId: "scope_run_empty", limits: {} },
      },
    )).toThrowError(/limits are empty/iu);
  });

  it("reserves every ancestor without overbooking, releases unused capacity, and freezes unknown usage", () => {
    const database = open();
    const store = new HierarchicalAdmissionStore({ database, clock: () => 2_000 });
    store.ensureRunHierarchy(hierarchyContext, hierarchy);
    const path = [
      { kind: "project", scopeId: "scope_project", projectId: "project_01" },
      { kind: "project-session", scopeId: "scope_session", projectId: "project_01", projectSessionId: "session_01" },
      { kind: "coordination-run", scopeId: "scope_run", projectSessionId: "session_01", coordinationRunId: "run_01" },
    ];

    const first = reserve(store, {
      commandId: "reserve_1",
      reservationId: "reservation_1",
      projectSessionId: "session_01",
      path,
      amounts: { provider_calls: 6 },
    });
    expect(first).toMatchObject({ reservationId: "reservation_1", state: "active", revision: 1 });
    expect(reserve(store, {
      commandId: "reserve_1",
      reservationId: "reservation_1",
      projectSessionId: "session_01",
      path,
      amounts: { provider_calls: 6 },
    })).toEqual(first);
    expect(() => reserve(store, {
      commandId: "reserve_overbook",
      reservationId: "reservation_overbook",
      projectSessionId: "session_01",
      path,
      amounts: { provider_calls: 3 },
    })).toThrowError(/exhaust/iu);

    const released = store.release(chairContext, {
      commandId: "release_1",
      reservationId: "reservation_1",
      expectedRevision: 1,
      consumed: { provider_calls: 2 },
    } as unknown as ResourceReleaseRequest);
    expect(released).toMatchObject({ state: "released", revision: 2 });
    expect(database.prepare(`
      SELECT used, reserved, usage_unknown FROM resource_dimensions
       WHERE scope_id='scope_run' AND unit_key='provider_calls'
    `).get()).toEqual({ used: 2, reserved: 0, usage_unknown: 0 });

    const ambiguous = reserve(store, {
      commandId: "reserve_ambiguous",
      reservationId: "reservation_ambiguous",
      projectSessionId: "session_01",
      path,
      amounts: { provider_calls: 2 },
    });
    store.markAmbiguous(chairContext, {
      commandId: "ambiguous_1",
      reservationId: ambiguous.reservationId,
      expectedRevision: 1,
      evidence: "provider outcome unknown",
    });
    const reconciled = store.reconcile(chairContext, {
      commandId: "reconcile_1",
      reservationId: ambiguous.reservationId,
      expectedRevision: 2,
      observedUsage: { provider_calls: "unknown" },
      evidence: "provider does not report usage",
    } as unknown as ResourceReconcileRequest);
    expect(reconciled).toMatchObject({ state: "reconciled", revision: 3 });
    expect(() => reserve(store, {
      commandId: "reserve_after_unknown",
      reservationId: "reservation_after_unknown",
      projectSessionId: "session_01",
      path,
      amounts: { provider_calls: 1 },
    })).toThrowError(/unknown/iu);
  });

  it("rejects intersecting active writer prefixes and releases the writer lease with its reservation", () => {
    const database = open();
    const store = new HierarchicalAdmissionStore({ database, clock: () => 3_000 });
    store.ensureRunHierarchy(hierarchyContext, hierarchy);
    const root = realpathSync(mkdtempSync(join(tmpdir(), "fabric-writer-")));
    temporary.push(root);
    const firstWorktree = join(root, ".worktrees", "writer-a");
    const secondWorktree = join(root, ".worktrees", "writer-b");
    mkdirSync(join(firstWorktree, "src", "feature"), { recursive: true });
    mkdirSync(join(secondWorktree, "src", "feature"), { recursive: true });
    const path = [
      { kind: "project", scopeId: "scope_project", projectId: "project_01" },
      { kind: "project-session", scopeId: "scope_session", projectId: "project_01", projectSessionId: "session_01" },
      { kind: "coordination-run", scopeId: "scope_run", projectSessionId: "session_01", coordinationRunId: "run_01" },
    ];
    const first = reserve(store, {
      commandId: "writer_reserve_1",
      reservationId: "writer_reservation_1",
      projectSessionId: "session_01",
      path,
      amounts: { concurrent_turns: 1 },
      writerAdmission: {
        repositoryRoot: root,
        worktreePath: firstWorktree,
        sourcePrefixes: ["src"],
        writerGeneration: 1,
      },
    });
    expect(() => reserve(store, {
      commandId: "writer_reserve_2",
      reservationId: "writer_reservation_2",
      projectSessionId: "session_01",
      path,
      amounts: { concurrent_turns: 1 },
      writerAdmission: {
        repositoryRoot: root,
        worktreePath: secondWorktree,
        sourcePrefixes: ["src/feature"],
        writerGeneration: 1,
      },
    })).toThrowError(/write scope|overlap/iu);

    store.release(chairContext, {
      commandId: "writer_release_1",
      reservationId: first.reservationId,
      expectedRevision: 1,
      consumed: { concurrent_turns: 0 },
    } as unknown as ResourceReleaseRequest);
    expect(database.prepare("SELECT state FROM writer_admissions WHERE reservation_id=?").get(first.reservationId))
      .toEqual({ state: "released" });
    expect(() => reserve(store, {
      commandId: "writer_reserve_2",
      reservationId: "writer_reservation_2",
      projectSessionId: "session_01",
      path,
      amounts: { concurrent_turns: 1 },
      writerAdmission: {
        repositoryRoot: root,
        worktreePath: secondWorktree,
        sourcePrefixes: ["src/feature"],
        writerGeneration: 1,
      },
    })).not.toThrow();
  });
});
