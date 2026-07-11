import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveMcpCapability } from "../../src/mcp/credentials.ts";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("MCP capability loading", () => {
  it("loads a capability from a private regular file without placing it in client configuration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-mcp-credential-"));
    cleanup.push(directory);
    const path = join(directory, "codex.cap");
    const capability = `afc_${"a".repeat(43)}`;
    await writeFile(path, `${capability}\n`, { mode: 0o600 });

    await expect(resolveMcpCapability({ AGENT_FABRIC_CAPABILITY_FILE: path })).resolves.toBe(capability);
  });

  it("rejects ambiguous, broadly readable and symlinked credential sources", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-mcp-credential-invalid-"));
    cleanup.push(directory);
    const path = join(directory, "peer.cap");
    const link = join(directory, "peer-link.cap");
    const capability = `afc_${"b".repeat(43)}`;
    await writeFile(path, `${capability}\n`, { mode: 0o600 });
    await symlink(path, link);

    await expect(resolveMcpCapability({
      AGENT_FABRIC_CAPABILITY: capability,
      AGENT_FABRIC_CAPABILITY_FILE: path,
    })).rejects.toThrow(/exactly one/u);
    await expect(resolveMcpCapability({ AGENT_FABRIC_CAPABILITY_FILE: link })).rejects.toThrow(/regular file/u);
    await chmod(path, 0o640);
    await expect(resolveMcpCapability({ AGENT_FABRIC_CAPABILITY_FILE: path })).rejects.toThrow(/private/u);
  });

  it("selects the nearest provisioned project seat and fails closed in another project", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-mcp-project-seat-"));
    cleanup.push(directory);
    const stateDirectory = join(directory, "state");
    const project = join(directory, "project-a");
    const nested = join(project, "nested");
    const otherProject = join(directory, "project-b");
    await Promise.all([
      mkdir(nested, { recursive: true }),
      mkdir(otherProject, { recursive: true }),
      mkdir(stateDirectory, { recursive: true, mode: 0o700 }),
    ]);
    const projectPath = await realpath(project);
    const key = createHash("sha256").update(projectPath).digest("hex").slice(0, 24);
    const seatDirectory = join(stateDirectory, "seats", key);
    await mkdir(seatDirectory, { recursive: true, mode: 0o700 });
    const credentialPath = join(seatDirectory, "codex.cap");
    const capability = `afc_${"c".repeat(43)}`;
    await writeFile(credentialPath, `${capability}\n`, { mode: 0o600 });
    await writeFile(join(seatDirectory, "codex.json"), `${JSON.stringify({
      schemaVersion: 1,
      projectKey: key,
      projectPath,
      runId: "run-project-a",
      seat: "codex",
      agentId: "codex",
      role: "chair",
      credentialPath,
      expiresAt: "2026-08-01T00:00:00.000Z",
    })}\n`, { mode: 0o600 });
    const environment = {
      AGENT_FABRIC_SEAT: "codex",
      AGENT_FABRIC_STATE_DIRECTORY: stateDirectory,
    };

    await expect(resolveMcpCapability(environment, nested)).resolves.toBe(capability);
    await expect(resolveMcpCapability(environment, otherProject)).rejects.toThrow(/not provisioned/u);
  });

  it("warns before project-seat expiry and fails closed after expiry", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-mcp-project-seat-expiry-"));
    cleanup.push(directory);
    const stateDirectory = join(directory, "state");
    const project = join(directory, "project");
    await Promise.all([mkdir(project), mkdir(stateDirectory, { mode: 0o700 })]);
    const projectPath = await realpath(project);
    const key = createHash("sha256").update(projectPath).digest("hex").slice(0, 24);
    const seatDirectory = join(stateDirectory, "seats", key);
    await mkdir(seatDirectory, { recursive: true, mode: 0o700 });
    const credentialPath = join(seatDirectory, "codex.cap");
    await writeFile(credentialPath, `afc_${"d".repeat(43)}\n`, { mode: 0o600 });
    const metadataPath = join(seatDirectory, "codex.json");
    const metadata = (expiresAt: string) => ({ schemaVersion: 1, projectKey: key, projectPath, runId: "run", seat: "codex", agentId: "codex", role: "chair", credentialPath, expiresAt });
    const environment = { AGENT_FABRIC_SEAT: "codex", AGENT_FABRIC_STATE_DIRECTORY: stateDirectory };
    const warn = vi.fn();
    await writeFile(metadataPath, `${JSON.stringify(metadata(new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString()))}\n`, { mode: 0o600 });
    await expect(resolveMcpCapability(environment, projectPath, warn)).resolves.toMatch(/^afc_/u);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("coordinate a full-roster renewal"));
    await writeFile(metadataPath, `${JSON.stringify(metadata(new Date(Date.now() - 1_000).toISOString()))}\n`, { mode: 0o600 });
    await expect(resolveMcpCapability(environment, projectPath, warn)).rejects.toThrow(/expired/u);
  });

  it("binds a global registry process to an explicit provisioned project path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-mcp-explicit-project-"));
    cleanup.push(directory);
    const stateDirectory = join(directory, "state");
    const project = join(directory, "project");
    const unrelatedCwd = join(directory, "unrelated");
    await Promise.all([mkdir(project), mkdir(unrelatedCwd), mkdir(stateDirectory, { mode: 0o700 })]);
    const projectPath = await realpath(project);
    const key = createHash("sha256").update(projectPath).digest("hex").slice(0, 24);
    const seatDirectory = join(stateDirectory, "seats", key);
    await mkdir(seatDirectory, { recursive: true, mode: 0o700 });
    const credentialPath = join(seatDirectory, "codex.cap");
    await writeFile(credentialPath, `afc_${"e".repeat(43)}\n`, { mode: 0o600 });
    await writeFile(join(seatDirectory, "codex.json"), `${JSON.stringify({ schemaVersion: 1, projectKey: key, projectPath, runId: "run", seat: "codex", agentId: "codex", role: "chair", credentialPath, expiresAt: "2099-01-01T00:00:00.000Z" })}\n`, { mode: 0o600 });
    await expect(resolveMcpCapability({
      AGENT_FABRIC_SEAT: "codex",
      AGENT_FABRIC_STATE_DIRECTORY: stateDirectory,
      AGENT_FABRIC_PROJECT_PATH: projectPath,
    }, unrelatedCwd)).resolves.toMatch(/^afc_/u);
  });
});
