import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  runWorkspaceTrust,
  trustedWorkspaceIdentity,
  trustedWorkspaceRoots,
} from "../../src/cli/workspace-trust.ts";

const temporaryDirectories: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "fabric-workspace-trust-"));
  temporaryDirectories.push(root);
  const stateDirectory = join(root, "state");
  const runtimeDirectory = join(stateDirectory, "runtime");
  const workspace = join(root, "workspace");
  await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
  await mkdir(workspace, { mode: 0o700 });
  await chmod(stateDirectory, 0o700);
  return {
    root,
    workspace,
    paths: {
      stateDirectory,
      runtimeDirectory,
      databasePath: join(stateDirectory, "fabric-v1.sqlite3"),
      socketPath: join(runtimeDirectory, "fabric-v1.sock"),
    },
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
});

describe("machine-local workspace trust", () => {
  it("exports the exact live normalized entry with a deterministic sha256 binding", async () => {
    const value = await fixture();
    const now = new Date("2026-07-11T04:00:00.000Z");
    await runWorkspaceTrust([
      "trust", value.workspace, "--profiles", "observed,headless", "--expires-at", "2026-07-12T04:00:00.000Z",
    ], value.paths, now);

    const identity = await trustedWorkspaceIdentity({
      stateDirectory: value.paths.stateDirectory,
      canonicalRoot: value.workspace,
      now,
    });
    const canonicalEntry = JSON.stringify({
      allowedProfiles: ["headless", "observed"],
      approvedAt: now.toISOString(),
      approvedBy: "local-operator",
      canonicalPath: await realpath(value.workspace),
      device: identity.entry.device,
      expiresAt: "2026-07-12T04:00:00.000Z",
      inode: identity.entry.inode,
    });
    expect(identity).toEqual({
      canonicalRoot: await realpath(value.workspace),
      trustRecordDigest: `sha256:${createHash("sha256").update(canonicalEntry).digest("hex")}`,
      entry: {
        canonicalPath: await realpath(value.workspace),
        approvedAt: now.toISOString(),
        approvedBy: "local-operator",
        device: identity.entry.device,
        inode: identity.entry.inode,
        expiresAt: "2026-07-12T04:00:00.000Z",
        allowedProfiles: ["headless", "observed"],
      },
    });
    await expect(trustedWorkspaceIdentity({
      stateDirectory: value.paths.stateDirectory,
      canonicalRoot: value.workspace,
      executionProfile: "paired-visible",
      now,
    })).rejects.toThrow(/profile/u);
  });

  it("atomically records exact roots and filters them by profile and expiry", async () => {
    const value = await fixture();
    const now = new Date("2026-07-11T04:00:00.000Z");
    await expect(runWorkspaceTrust([
      "trust", value.workspace, "--profiles", "headless,observed", "--expires-at", "2026-07-12T04:00:00.000Z",
    ], value.paths, now)).resolves.toMatchObject({ trusted: true });

    await expect(trustedWorkspaceRoots({ stateDirectory: value.paths.stateDirectory, executionProfile: "headless", now }))
      .resolves.toEqual([await realpath(value.workspace)]);
    await expect(trustedWorkspaceRoots({ stateDirectory: value.paths.stateDirectory, executionProfile: "paired-visible", now }))
      .resolves.toEqual([]);
    await expect(trustedWorkspaceRoots({ stateDirectory: value.paths.stateDirectory, executionProfile: "headless", now: new Date("2026-07-13T00:00:00.000Z") }))
      .resolves.toEqual([]);
    await expect(runWorkspaceTrust(["inspect", value.workspace], value.paths, new Date("2026-07-13T00:00:00.000Z")))
      .resolves.toMatchObject({ trusted: false, expired: true, entry: expect.objectContaining({ canonicalPath: await realpath(value.workspace) }) });

    const registryPath = join(value.paths.stateDirectory, "trusted-workspaces.json");
    expect((await lstat(registryPath)).mode & 0o077).toBe(0);
    expect(JSON.parse(await readFile(registryPath, "utf8"))).toMatchObject({ schemaVersion: 1 });
  });

  it("rejects symbolic-link roots and supports inspect/revoke without widening", async () => {
    const value = await fixture();
    const linked = join(value.root, "linked");
    await symlink(value.workspace, linked);
    await expect(runWorkspaceTrust(["trust", linked], value.paths)).rejects.toThrow(/symbolic-link/u);

    await runWorkspaceTrust(["trust", value.workspace], value.paths, new Date("2026-07-11T04:00:00.000Z"));
    await expect(runWorkspaceTrust(["inspect", value.workspace], value.paths)).resolves.toMatchObject({ trusted: true });
    await expect(runWorkspaceTrust(["revoke", value.workspace], value.paths)).resolves.toMatchObject({ revoked: true });
    await expect(runWorkspaceTrust(["list"], value.paths)).resolves.toMatchObject({ entries: [] });
  });

  it("fails closed for a non-private or symlinked registry", async () => {
    const value = await fixture();
    const registryPath = join(value.paths.stateDirectory, "trusted-workspaces.json");
    await symlink(join(value.root, "missing"), registryPath);
    await expect(runWorkspaceTrust(["list"], value.paths)).rejects.toThrow(/private regular file/u);
  });

  it("serialises concurrent grants and a following revoke without lost updates", async () => {
    const value = await fixture();
    const second = join(value.root, "workspace-two");
    await mkdir(second, { mode: 0o700 });
    await Promise.all([
      runWorkspaceTrust(["trust", value.workspace], value.paths),
      runWorkspaceTrust(["trust", second], value.paths),
    ]);
    await expect(runWorkspaceTrust(["list"], value.paths)).resolves.toMatchObject({
      entries: expect.arrayContaining([
        expect.objectContaining({ canonicalPath: await realpath(value.workspace) }),
        expect.objectContaining({ canonicalPath: await realpath(second) }),
      ]),
    });
    await Promise.all([
      runWorkspaceTrust(["trust", value.workspace], value.paths),
      runWorkspaceTrust(["revoke", value.workspace], value.paths),
    ]);
    await expect(runWorkspaceTrust(["list"], value.paths)).resolves.toMatchObject({
      entries: expect.arrayContaining([expect.objectContaining({ canonicalPath: await realpath(second) })]),
    });
    expect((await lstat(join(value.paths.stateDirectory, "trusted-workspaces.lock.sqlite3"))).mode & 0o077).toBe(0);
  });

  it("rejects lexical and registered-root ancestor broadening", async () => {
    const value = await fixture();
    await expect(runWorkspaceTrust(["trust", `${value.workspace}/..`], value.paths)).rejects.toThrow(/ancestor broadening/u);
    const nested = join(value.workspace, "nested");
    await mkdir(nested);
    await runWorkspaceTrust(["trust", nested], value.paths);
    await expect(runWorkspaceTrust(["trust", value.workspace], value.paths)).rejects.toThrow(/ancestor broadening/u);
  });

  it("does not transfer trust when the path identity is replaced or becomes a symlink", async () => {
    const value = await fixture();
    await runWorkspaceTrust(["trust", value.workspace], value.paths);
    const original = join(value.root, "workspace-original");
    await rename(value.workspace, original);
    await mkdir(value.workspace);
    await expect(trustedWorkspaceRoots({ stateDirectory: value.paths.stateDirectory, executionProfile: "headless" })).resolves.toEqual([]);
    await expect(runWorkspaceTrust(["inspect", value.workspace], value.paths)).resolves.toMatchObject({ trusted: false });
    await rm(value.workspace, { recursive: true });
    await symlink(original, value.workspace);
    await expect(trustedWorkspaceRoots({ stateDirectory: value.paths.stateDirectory, executionProfile: "headless" })).resolves.toEqual([]);
  });
});
