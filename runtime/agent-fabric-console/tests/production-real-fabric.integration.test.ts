import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { startFabricDaemon, type FabricDaemonHandle } from "@local/agent-fabric";

import {
  startFabricConsoleApplication,
  type ConsoleBootstrapPort,
  type ConsoleBootstrapRequest,
} from "../src/application.js";
import { reduceFabricPointer, renderFabricConsoleFrame } from "../src/index.js";
import { createProductionConsoleBootstrap } from "../src/production-composition.js";

type FabricTestPaths = Readonly<{
  stateDirectory: string;
  runtimeDirectory: string;
  databasePath: string;
  socketPath: string;
}>;

const roots: string[] = [];
const daemons: FabricDaemonHandle[] = [];
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.allSettled(closers.splice(0).map(async (close) => close()));
  await Promise.allSettled(daemons.splice(0).map(async (daemon) => daemon.stop()));
  await Promise.allSettled(
    roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })),
  );
});

async function realFabricFixture(): Promise<{ paths: FabricTestPaths; project: string }> {
  const root = await mkdtemp(join(tmpdir(), "console-real-fabric-"));
  roots.push(root);
  const stateDirectory = join(root, "state");
  const runtimeDirectory = join(root, "runtime");
  const project = join(root, "project");
  await Promise.all([
    mkdir(stateDirectory, { recursive: true, mode: 0o700 }),
    mkdir(runtimeDirectory, { recursive: true, mode: 0o700 }),
    mkdir(project),
  ]);
  const paths: FabricTestPaths = {
    stateDirectory,
    runtimeDirectory,
    databasePath: join(stateDirectory, "fabric.sqlite3"),
    socketPath: join(runtimeDirectory, "fabric.sock"),
  };
  const { runWorkspaceTrust } = await import(
    new URL("../../agent-fabric/dist/cli/workspace-trust.js", import.meta.url).href
  ) as {
    runWorkspaceTrust(
      args: readonly string[],
      paths: FabricTestPaths,
    ): Promise<unknown>;
  };
  await runWorkspaceTrust(["trust", project], paths);
  const daemon = await startFabricDaemon({
    ...paths,
    workspaceRoots: [project],
    executionProfile: "headless",
  });
  daemons.push(daemon);
  return { paths, project };
}

async function seedRunWithTasks(databasePath: string, projectId: string): Promise<void> {
  const { default: Database } = await import("better-sqlite3") as unknown as {
    default: new (
      path: string,
      options?: Readonly<{ fileMustExist?: boolean }>,
    ) => {
      exec(sql: string): void;
      close(): void;
    };
  };
  const digest = `sha256:${"d".repeat(64)}`;
  const now = Date.parse("2026-07-16T00:00:00Z");
  const database = new Database(databasePath, { fileMustExist: true });
  try {
    database.exec(`
      INSERT INTO project_sessions(
        project_session_id, project_id, mode, state, revision, generation, authority_ref,
        budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
        origin_kind, origin_operator_id, created_at, updated_at
      ) VALUES (
        'session_real_01', '${projectId}', 'coordinated', 'active', 2, 1, '${digest}',
        'budget_real_01', 'docs/spec.md', '${digest}', 1,
        'operator-launch', 'operator_real_01', ${now - 9_000}, ${now - 900}
      );
      INSERT INTO runs(
        run_id, chair_agent_id, workspace_root, project_run_directory, created_at,
        project_session_id, lifecycle_state, revision, chair_generation, chair_lease_id,
        authority_ref, budget_ref, dependency_revision, topology_slot, project_run_directory_basis
      ) VALUES (
        'run_real_01', 'chair_real_01', '/project/real', '.agent-run/real', ${now - 8_000},
        'session_real_01', 'active', 4, 1, 'chair:run_real_01:1',
        '${digest}', 'budget_real_01', 1, 1, 'project-relative'
      );
      INSERT INTO authorities(authority_id, run_id, authority_json, authority_hash, created_at)
      VALUES ('authority_real_01', 'run_real_01', '{}', '${"b".repeat(64)}', ${now - 8_000});
      INSERT INTO agents(run_id, agent_id, authority_id, provider_session_ref, lifecycle)
      VALUES ('run_real_01', 'chair_real_01', 'authority_real_01', 'provider_real_01', 'ready');
      INSERT INTO tasks(
        run_id, task_id, authority_id, objective, base_revision, state,
        owner_agent_id, revision, owner_lease_generation, created_by
      ) VALUES
        ('run_real_01', 'task_real_01', 'authority_real_01', 'Implement slice', 'base_01', 'active',
         'chair_real_01', 1, 1, 'chair_real_01'),
        ('run_real_01', 'task_real_02', 'authority_real_01', 'Review slice', 'base_01', 'ready',
         NULL, 1, 0, 'chair_real_01'),
        ('run_real_01', 'task_real_03', 'authority_real_01', 'Land protocol cut', 'base_01', 'complete',
         'chair_real_01', 2, 1, 'chair_real_01');
    `);
  } finally {
    database.close();
  }
}

describe("real local-session to production-binding path", () => {
  it(
    "keeps an eventless production Console live after its first refresh",
    { timeout: 120_000 },
    async () => {
      const { paths, project } = await realFabricFixture();
      const production = createProductionConsoleBootstrap();
      const bootstrap: ConsoleBootstrapPort = {
        startOrAttach: async (request) => await production.startOrAttach({
          ...request,
          paths,
          daemon: { executionProfile: "headless", workspaceRoots: [project] },
          clientId: "console_real_refresh_01",
        } as unknown as ConsoleBootstrapRequest),
      };
      const application = await startFabricConsoleApplication({
        bootstrap,
        projectRoot: project,
        surface: "standalone",
        viewport: { columns: 80, rows: 24 },
        draw: () => {},
        eventId: () => "console-real-refresh",
        confirmationId: () => "console-real-refresh-confirmation",
        render: renderFabricConsoleFrame,
        reducePointer: reduceFabricPointer,
      });
      closers.push(async () => await application.close("operator"));

      expect(application.dataset.connection).toMatchObject({ state: "live" });
      await application.refresh();
      expect(application.dataset.connection).toMatchObject({ state: "live" });
    },
  );

  it(
    "negotiates declared run progress end-to-end and serves the fact through the production binding",
    { timeout: 120_000 },
    async () => {
      const { paths, project } = await realFabricFixture();
      const bootstrap = createProductionConsoleBootstrap();
      const request = {
        projectRoot: project,
        surface: "standalone",
        paths,
        daemon: { executionProfile: "headless", workspaceRoots: [project] },
        clientId: "console_real_path_01",
      } as unknown as ConsoleBootstrapRequest;

      const result = await bootstrap.startOrAttach(request);
      expect(result.status).toBe("connected");
      if (result.status !== "connected") throw new Error("expected a connected production bootstrap");
      closers.push(() => result.close());

      // The production binding hard-requires declared-run-progress.v2; before the
      // local-session initializer requested it, this binding failed as unsupported.
      expect(result.binding).toMatchObject({ ok: true });
      if (!result.binding.ok) throw new Error("expected a supported production binding");
      const port = result.binding.port;

      await seedRunWithTasks(paths.databasePath, result.projectId);

      const snapshot = await port.snapshot({
        credential: result.credential,
        projectId: result.projectId,
      });
      const page = await port.viewPage({
        credential: result.credential,
        projectId: result.projectId,
        view: "runs",
        snapshotRevision: snapshot.snapshotRevision,
        cursor: 0,
        limit: 5,
      });
      const declaredCounts = {
        blocked: 0,
        ready: 1,
        active: 1,
        complete: 1,
        cancelled: 0,
        degraded: 0,
      };
      expect(page).toMatchObject({
        status: "page",
        view: "runs",
        rows: [{
          itemId: "run_real_01",
          fact: {
            freshness: "live",
            value: {
              summary: {
                kind: "run",
                projectSessionId: "session_real_01",
                declaredProgress: { plan: "open", counts: declaredCounts },
                identity: {
                  runKind: "coordination",
                  chairAgentId: "chair_real_01",
                  workstreams: [],
                },
              },
            },
          },
        }],
      });
      if (page.status !== "page" || page.view !== "runs") throw new Error("expected a runs page");
      const row = page.rows[0]?.fact;
      if (row?.freshness !== "live") throw new Error("expected a live run row");

      const detail = await port.readDetail({
        credential: result.credential,
        projectId: result.projectId,
        snapshotRevision: snapshot.snapshotRevision,
        detailRef: row.value.detailRef,
      });
      expect(detail).toMatchObject({
        status: "current",
        detail: {
          freshness: "live",
          value: {
            kind: "run",
            coordinationRunId: "run_real_01",
            declaredProgress: { plan: "open", counts: declaredCounts },
            identity: {
              runKind: "coordination",
              chairAgentId: "chair_real_01",
              workstreams: [],
            },
          },
        },
      });
    },
  );
});
