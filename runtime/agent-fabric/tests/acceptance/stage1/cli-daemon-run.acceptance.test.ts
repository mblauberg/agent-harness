import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runSourceCli } from "../../support/cli-process.ts";

const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const sourceCli = fileURLToPath(new URL("../../../src/cli/main.ts", import.meta.url));

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error(`timed out waiting for ${path}`);
}

describe("foreground daemon CLI", () => {
  it("runs core-only from resolved paths and publishes a private discovery receipt", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-cli-daemon-"));
    const stateDirectory = join(root, "state");
    const runtimeDirectory = join(root, "runtime");
    const discoveryPath = join(runtimeDirectory, "fabric-v1.discovery.json");
    const child = spawn(process.execPath, ["--import", "tsx", sourceCli, "daemon", "run", "--no-adapters"], {
      cwd: packageRoot,
      env: {
        ...process.env,
        AGENT_FABRIC_STATE_DIRECTORY: stateDirectory,
        AGENT_FABRIC_RUNTIME_DIRECTORY: runtimeDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    try {
      await waitForFile(discoveryPath);
      const receipt: unknown = JSON.parse(await readFile(discoveryPath, "utf8"));
      expect(receipt).toMatchObject({
        schemaVersion: 1,
        socketPath: join(runtimeDirectory, "fabric-v1.sock"),
        pid: expect.any(Number),
        bootstrapCapability: expect.stringMatching(/^afb_[A-Za-z0-9_-]{43}$/u),
      });
      expect((await stat(discoveryPath)).mode & 0o777).toBe(0o600);
      expect((await stat(join(runtimeDirectory, "fabric-v1.sock"))).isSocket()).toBe(true);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      const exit = await exitPromise;
      await rm(root, { recursive: true, force: true });
      expect(exit).toEqual({ code: 0, signal: null });
      expect(Buffer.concat(stderr).toString("utf8")).toBe("");
    }
  });

  it("fails closed when explicit trusted configuration selects disabled adapters", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-cli-disabled-adapters-"));
    try {
      const trustedConfigPath = join(root, "agent-fabric.yaml");
      const trustedConfig = (await readFile(join(repositoryRoot, "config", "agent-fabric.yaml"), "utf8"))
        .replace("activeAdapters: []", "activeAdapters:\n  - claude-agent-sdk")
        .replace("workspaceRoots: []", `workspaceRoots:\n  - ${JSON.stringify(root)}`);
      await writeFile(trustedConfigPath, trustedConfig, "utf8");
      const result = await runSourceCli(
        [
          "daemon",
          "run",
          "--trusted-config",
          trustedConfigPath,
          "--compatibility",
          join(repositoryRoot, "config", "adapter-compatibility.yaml"),
          "--compatibility-schema",
          join(repositoryRoot, "runtime", "agent-fabric", "schemas", "adapter-compatibility.schema.json"),
          "--agents-home",
          repositoryRoot,
        ],
        {
          environment: {
            AGENT_FABRIC_STATE_DIRECTORY: join(root, "state"),
            AGENT_FABRIC_RUNTIME_DIRECTORY: join(root, "runtime"),
          },
        },
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/not activated|disabled/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
