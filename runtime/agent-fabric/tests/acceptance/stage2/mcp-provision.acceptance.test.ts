import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { startFabricDaemon, type FabricDaemonHandle } from "../../../src/daemon/client.ts";
import Database from "better-sqlite3";
import { parseCliJson, runSourceCli } from "../../support/cli-process.ts";

const roots: string[] = [];
const daemons: FabricDaemonHandle[] = [];

afterEach(async () => {
  await Promise.allSettled(daemons.splice(0).map(async (daemon) => daemon.stop()));
  await Promise.allSettled(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{
  environment: Record<string, string>;
  projectPath: string;
  stateDirectory: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "fabric-mcp-provision-"));
  roots.push(root);
  const stateDirectory = join(root, "state");
  const runtimeDirectory = join(root, "runtime");
  const requestedProjectPath = join(root, "project");
  await mkdir(requestedProjectPath, { recursive: true });
  const projectPath = await realpath(requestedProjectPath);
  const daemon = await startFabricDaemon({
    databasePath: join(stateDirectory, "fabric-v1.sqlite3"),
    stateDirectory,
    runtimeDirectory,
    socketPath: join(runtimeDirectory, "fabric-v1.sock"),
    workspaceRoots: [projectPath],
  });
  daemons.push(daemon);
  const discoveryPath = join(runtimeDirectory, "fabric-v1.discovery.json");
  await writeFile(
    discoveryPath,
    `${JSON.stringify({
      schemaVersion: 1,
      socketPath: join(runtimeDirectory, "fabric-v1.sock"),
      pid: daemon.pid,
      bootstrapCapability: daemon.bootstrapCapability,
    })}\n`,
    { mode: 0o600 },
  );
  await chmod(discoveryPath, 0o600);
  return {
    environment: {
      AGENT_FABRIC_STATE_DIRECTORY: stateDirectory,
      AGENT_FABRIC_RUNTIME_DIRECTORY: runtimeDirectory,
    },
    projectPath,
    stateDirectory,
  };
}

type ProvisionOutput = {
  schemaVersion: 1;
  projectKey: string;
  projectPath: string;
  runId: string;
  chairSeat: string;
  expiresAt: string;
  seats: Array<{
    seat: string;
    role: "chair" | "peer";
    agentId: string;
    credentialPath: string;
    metadataPath: string;
  }>;
};

describe("MCP project seat provisioning", () => {
  it("idempotently provisions distinct private seat credentials without printing capabilities", async () => {
    const { environment, projectPath, stateDirectory } = await fixture();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();
    const arguments_ = [
      "mcp",
      "provision",
      "--project",
      projectPath,
      "--chair",
      "codex",
      "--seats",
      "agy,claude,codex,cursor,kiro",
      "--expires-at",
      expiresAt,
    ];

    const firstResult = await runSourceCli(arguments_, { environment });
    const first = parseCliJson(firstResult) as ProvisionOutput;
    expect(first).toMatchObject({
      schemaVersion: 1,
      projectPath,
      chairSeat: "codex",
      expiresAt,
      seats: [
        { seat: "agy", role: "peer" },
        { seat: "claude", role: "peer" },
        { seat: "codex", role: "chair" },
        { seat: "cursor", role: "peer" },
        { seat: "kiro", role: "peer" },
      ],
    });
    expect(first.runId).toMatch(new RegExp(`^project-${first.projectKey}-[0-9a-f]{16}$`, "u"));
    expect(firstResult.stdout).not.toMatch(/af[bc]_[A-Za-z0-9_-]+/u);
    expect(firstResult.stdout).not.toContain("capability");

    const credentials = await Promise.all(
      first.seats.map(async (seat) => {
        expect(seat.credentialPath).toMatch(new RegExp(`/seats/${first.projectKey}/generations/[0-9a-f]{16}/${seat.seat}\\.cap$`, "u"));
        expect(seat.metadataPath).toMatch(new RegExp(`/seats/${first.projectKey}/generations/[0-9a-f]{16}/${seat.seat}\\.json$`, "u"));
        const [credentialStat, metadataStat, credential, metadataText] = await Promise.all([
          lstat(seat.credentialPath),
          lstat(seat.metadataPath),
          readFile(seat.credentialPath, "utf8"),
          readFile(seat.metadataPath, "utf8"),
        ]);
        expect(credentialStat.isFile()).toBe(true);
        expect(credentialStat.isSymbolicLink()).toBe(false);
        expect(credentialStat.mode & 0o777).toBe(0o600);
        expect(metadataStat.isFile()).toBe(true);
        expect(metadataStat.isSymbolicLink()).toBe(false);
        expect(metadataStat.mode & 0o777).toBe(0o600);
        expect(credential).toMatch(/^afc_[A-Za-z0-9_-]{43}$/u);
        expect(metadataText).not.toMatch(/afc_[A-Za-z0-9_-]+/u);
        expect(JSON.parse(metadataText)).toMatchObject({
          schemaVersion: 1,
          projectKey: first.projectKey,
          projectPath,
          runId: first.runId,
          seat: seat.seat,
          agentId: seat.agentId,
          role: seat.role,
          credentialPath: seat.credentialPath,
          expiresAt,
        });
        return credential;
      }),
    );
    expect(new Set(credentials).size).toBe(5);
    expect((await lstat(join(stateDirectory, "seats"))).mode & 0o777).toBe(0o700);
    expect((await lstat(join(stateDirectory, "seats", first.projectKey))).mode & 0o777).toBe(0o700);

    const secondResult = await runSourceCli(arguments_, { environment });
    const second = parseCliJson(secondResult) as ProvisionOutput;
    expect(second).toEqual(first);
    await expect(Promise.all(second.seats.map(async (seat) => readFile(seat.credentialPath, "utf8")))).resolves.toEqual(
      credentials,
    );

    const seatPathResult = await runSourceCli(
      ["mcp", "seat-path", "--project", projectPath, "--seat", "claude"],
      { environment },
    );
    expect(parseCliJson(seatPathResult)).toEqual({
      schemaVersion: 1,
      projectKey: first.projectKey,
      seat: "claude",
      credentialPath: first.seats[1]?.credentialPath,
      metadataPath: first.seats[1]?.metadataPath,
    });
    expect(seatPathResult.stdout).not.toMatch(/afc_[A-Za-z0-9_-]+/u);
  });

  it("refuses to replace a symlinked credential", async () => {
    const { environment, projectPath } = await fixture();
    const arguments_ = [
      "mcp", "provision", "--project", projectPath, "--chair", "codex", "--seats", "claude,codex",
      "--expires-at", new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
    ];
    const provisioned = parseCliJson(await runSourceCli(arguments_, { environment })) as ProvisionOutput;
    const target = join(projectPath, "must-not-change");
    await writeFile(target, "safe");
    const credentialPath = provisioned.seats[0]?.credentialPath;
    if (credentialPath === undefined) throw new Error("test fixture did not return the claude credential path");
    await unlink(credentialPath);
    await symlink(target, credentialPath);

    const result = await runSourceCli(arguments_, { environment });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/private regular file|symbolic link/u);
    expect(result.stderr).not.toMatch(/afc_[A-Za-z0-9_-]+/u);
    await expect(readFile(target, "utf8")).resolves.toBe("safe");
  });

  it("uses a new durable run generation for renewal and rejects a one-seat roster", async () => {
    const { environment, projectPath } = await fixture();
    const firstExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000).toISOString();
    const secondExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();
    const base = ["mcp", "provision", "--project", projectPath, "--chair", "codex", "--seats", "claude,codex"];

    const first = parseCliJson(await runSourceCli([...base, "--expires-at", firstExpiry], { environment })) as ProvisionOutput;
    const second = parseCliJson(await runSourceCli([...base, "--expires-at", secondExpiry], { environment })) as ProvisionOutput;
    expect(second.runId).not.toBe(first.runId);
    expect(second.seats.map((seat) => seat.credentialPath)).not.toEqual(first.seats.map((seat) => seat.credentialPath));

    const invalid = await runSourceCli([
      "mcp", "provision", "--project", projectPath, "--chair", "codex", "--seats", "codex", "--expires-at", secondExpiry,
    ], { environment });
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toMatch(/at least two distinct seats/u);
  });

  it("binds a provisioned run to the requested project under a broader trusted root", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-mcp-project-root-"));
    roots.push(root);
    const stateDirectory = join(root, "state");
    const runtimeDirectory = join(root, "runtime");
    const projectPath = join(root, "projects", "one");
    await mkdir(projectPath, { recursive: true });
    const databasePath = join(stateDirectory, "fabric-v1.sqlite3");
    const daemon = await startFabricDaemon({
      databasePath,
      stateDirectory,
      runtimeDirectory,
      socketPath: join(runtimeDirectory, "fabric-v1.sock"),
      workspaceRoots: [root],
    });
    daemons.push(daemon);
    await writeFile(join(runtimeDirectory, "fabric-v1.discovery.json"), `${JSON.stringify({
      schemaVersion: 1,
      socketPath: join(runtimeDirectory, "fabric-v1.sock"),
      pid: daemon.pid,
      bootstrapCapability: daemon.bootstrapCapability,
    })}\n`, { mode: 0o600 });
    const result = parseCliJson(await runSourceCli([
      "mcp", "provision", "--project", projectPath, "--chair", "codex", "--seats", "claude,codex",
      "--expires-at", new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000).toISOString(),
    ], { environment: { AGENT_FABRIC_STATE_DIRECTORY: stateDirectory, AGENT_FABRIC_RUNTIME_DIRECTORY: runtimeDirectory } })) as ProvisionOutput;

    const database = new Database(databasePath, { readonly: true });
    try {
      expect(database.prepare("SELECT workspace_root FROM runs WHERE run_id = ?").pluck().get(result.runId)).toBe(await realpath(projectPath));
    } finally {
      database.close();
    }
  });
});
