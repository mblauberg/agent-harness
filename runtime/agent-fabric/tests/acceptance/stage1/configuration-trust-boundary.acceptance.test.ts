import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadFabricConfig } from "../../../src/config/index.ts";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("Stage 1 configuration trust boundary", () => {
  it.each([
    ["adapter command", { adapters: { codex: { command: ["/tmp/evil"] } } }, "adapters.codex.command"],
    ["environment source", { environmentSources: ["/tmp/steal-env"] }, "environmentSources"],
    ["listener", { listener: "tcp://0.0.0.0:9999" }, "listener"],
    ["credential selector", { providerCredentialSelector: "attacker" }, "providerCredentialSelector"],
    ["unknown key", { surpriseExecutable: "/tmp/evil" }, "surpriseExecutable"],
  ])("rejects project-controlled %s", async (_label, projectValue, field) => {
    const root = await mkdtemp(join(tmpdir(), "fabric-config-"));
    const globalPath = join(root, "global.yaml");
    const projectPath = join(root, "project", ".agents", "agent-fabric.yaml");
    await writeJson(globalPath, {
      schemaVersion: 1,
      adapters: { codex: { command: ["codex", "app-server"] } },
      allowedAdapters: ["codex"],
      allowedProfiles: ["paired-visible", "headless"],
      workspaceRoots: [join(root, "project")],
      limits: { maximumConcurrentProviderTurns: 8 },
    });
    await writeJson(projectPath, { schemaVersion: 1, ...projectValue });

    await expect(loadFabricConfig({ globalPath, projectPath })).rejects.toMatchObject({
      code: "CONFIG_UNTRUSTED_FIELD",
      field,
    });
  });

  it("permits allow-listed selection and narrowing but rejects widened roots and limits", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-config-narrowing-"));
    const projectRoot = join(root, "project");
    const globalPath = join(root, "global.yaml");
    const projectPath = join(projectRoot, ".agents", "agent-fabric.yaml");
    await writeJson(globalPath, {
      schemaVersion: 1,
      allowedAdapters: ["codex"],
      activeAdapters: ["codex"],
      allowedProfiles: ["paired-visible"],
      workspaceRoots: [projectRoot],
      limits: { maximumConcurrentProviderTurns: 8 },
    });
    await writeJson(projectPath, {
      schemaVersion: 1,
      namedExecutionProfile: "paired-visible",
      allowListedAdapterId: "codex",
      workspaceRoots: [join(projectRoot, "src")],
      limits: { maximumConcurrentProviderTurns: 2 },
    });

    const narrowed = await loadFabricConfig({ globalPath, projectPath });
    const canonicalProjectRoot = await realpath(projectRoot);
    expect(narrowed).toMatchObject({
      executionProfile: "paired-visible",
      adapterIds: ["codex"],
      workspaceRoots: [join(canonicalProjectRoot, "src")],
      limits: { maximumConcurrentProviderTurns: 2 },
    });

    await writeJson(projectPath, {
      schemaVersion: 1,
      namedExecutionProfile: "paired-visible",
      allowListedAdapterId: "codex",
      workspaceRoots: [root],
      limits: { maximumConcurrentProviderTurns: 9 },
    });
    await expect(loadFabricConfig({ globalPath, projectPath })).rejects.toMatchObject({
      code: "CONFIG_WIDENING_FORBIDDEN",
    });
  });

  it("applies project and run narrowing sequentially and rejects run-layer widening", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-config-run-layer-"));
    const projectRoot = join(root, "project");
    const sourceRoot = join(projectRoot, "src");
    const packageRoot = join(sourceRoot, "package");
    const globalPath = join(root, "global.yaml");
    const projectPath = join(projectRoot, ".agents", "agent-fabric.yaml");
    const runPath = join(root, "run.yaml");
    await writeJson(globalPath, {
      schemaVersion: 1,
      adapters: {
        codex: { command: ["codex"] },
        claude: { command: ["claude"] },
      },
      allowedAdapters: ["codex", "claude"],
      activeAdapters: ["codex", "claude"],
      allowedProfiles: ["paired-visible", "headless"],
      workspaceRoots: [projectRoot],
      limits: { maximumConcurrentProviderTurns: 8 },
    });
    await writeJson(projectPath, {
      schemaVersion: 1,
      namedExecutionProfile: "paired-visible",
      allowListedAdapterId: "codex",
      workspaceRoots: [sourceRoot],
      limits: { maximumConcurrentProviderTurns: 4 },
    });
    const narrowedRun = {
      schemaVersion: 1,
      namedExecutionProfile: "paired-visible",
      allowListedAdapterId: "codex",
      workspaceRoots: [packageRoot],
      limits: { maximumConcurrentProviderTurns: 2 },
    };
    await writeJson(runPath, narrowedRun);

    await expect(loadFabricConfig({ globalPath, projectPath, runPath })).resolves.toMatchObject({
      executionProfile: "paired-visible",
      adapterIds: ["codex"],
      workspaceRoots: [join(await realpath(projectRoot), "src", "package")],
      limits: { maximumConcurrentProviderTurns: 2 },
    });

    for (const widening of [
      { namedExecutionProfile: "headless" },
      { allowListedAdapterId: "claude" },
      { workspaceRoots: [projectRoot] },
      { limits: { maximumConcurrentProviderTurns: 6 } },
    ]) {
      await writeJson(runPath, { ...narrowedRun, ...widening });
      await expect(loadFabricConfig({ globalPath, projectPath, runPath })).rejects.toMatchObject({
        code: "CONFIG_WIDENING_FORBIDDEN",
      });
    }
  });

  it.each([
    ["adapter command", { adapters: { codex: { command: ["/tmp/evil"] } } }, "adapters.codex.command"],
    ["environment source", { environmentSources: ["/tmp/steal-env"] }, "environmentSources"],
    ["listener", { listener: "tcp://0.0.0.0:9999" }, "listener"],
    ["credential selector", { providerCredentialSelector: "attacker" }, "providerCredentialSelector"],
  ])("rejects run-controlled %s", async (_label, runValue, field) => {
    const root = await mkdtemp(join(tmpdir(), "fabric-config-run-trust-"));
    const globalPath = join(root, "global.yaml");
    const runPath = join(root, "run.yaml");
    await writeJson(globalPath, {
      schemaVersion: 1,
      allowedAdapters: ["codex"],
      allowedProfiles: ["paired-visible"],
      workspaceRoots: [root],
      limits: { maximumConcurrentProviderTurns: 8 },
    });
    await writeJson(runPath, { schemaVersion: 1, ...runValue });

    await expect(loadFabricConfig({ globalPath, runPath })).rejects.toMatchObject({
      code: "CONFIG_UNTRUSTED_FIELD",
      field,
    });
  });
});
