import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

import { composeDaemonAdapters, composeDaemonConfiguration } from "../../src/daemon/composition.ts";
import { runWorkspaceTrust } from "../../src/cli/workspace-trust.ts";
import { commitFixtureRepository, writeWrapperPackageScaffold } from "../support/fixture-repository.ts";
import {
  createPortableActivatedPrimaryFixture,
  createPrimaryCompatibilityFixture,
} from "../support/primary-adapter-testkit.ts";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

describe("daemon trusted adapter composition", () => {
  it("composes only the explicitly activated and pinned adapters", async () => {
    const fixture = process.env.AGENT_FABRIC_PORTABLE_TESTS === "1"
      ? await createPortableActivatedPrimaryFixture()
      : undefined;
    try {
      const adapters = await composeDaemonAdapters({
        globalConfigPath: fixture?.configPath ?? `${repositoryRoot}/config/agent-fabric.yaml`,
        compatibilityPath: fixture?.compatibilityPath
          ?? `${repositoryRoot}/config/adapter-compatibility.yaml`,
        compatibilitySchemaPath: fixture?.schemaPath
          ?? `${repositoryRoot}/runtime/agent-fabric/schemas/adapter-compatibility.schema.json`,
        agentsHome: fixture?.directory ?? repositoryRoot,
        ...(fixture === undefined
          ? { stateDirectory: join(repositoryRoot, ".agent-run", "adapter-composition-test") }
          : {}),
      });
      expect(Object.keys(adapters).sort()).toEqual(
        ["claude-agent-sdk", "codex-app-server"],
      );
    } finally {
      if (fixture !== undefined) await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("expands the trusted AGENTS_HOME workspace root without binding config to one user", async () => {
    const fixture = await createPortableActivatedPrimaryFixture();
    const directory = fixture.directory;
    const agentsHome = join(directory, "agents-home");
    const literalRoot = join(directory, "literal-root");
    await Promise.all([mkdir(agentsHome), mkdir(literalRoot)]);
    const config = parse(await readFile(fixture.configPath, "utf8")) as Record<string, unknown>;
    config.workspaceRoots = ["${AGENTS_HOME}", literalRoot];
    await writeFile(fixture.configPath, stringify(config));
    try {
      const expectedRoots = [await realpath(agentsHome), await realpath(literalRoot)];
      await expect(composeDaemonConfiguration({
        globalConfigPath: fixture.configPath,
        compatibilityPath: fixture.compatibilityPath,
        compatibilitySchemaPath: fixture.schemaPath,
        agentsHome,
        stateDirectory: join(directory, "state"),
      })).resolves.toMatchObject({ workspaceRoots: expectedRoots });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("composes Codex with its pinned provider executable and trusted model policy", async () => {
    const fixture = await createPrimaryCompatibilityFixture();
    const configPath = join(fixture.directory, "agent-fabric.yaml");
    const compatibility = parse(await readFile(fixture.compatibilityPath, "utf8")) as {
      adapters: Record<string, {
        enabled: boolean;
        implementation: Record<string, string>;
        model_family_constraints: Record<string, unknown>;
      }>;
    };
    const codex = compatibility.adapters["codex-app-server"];
    if (codex === undefined) throw new TypeError("Codex compatibility fixture is missing");
    const executable = codex.implementation.executable;
    const executableHash = codex.implementation.executable_sha256;
    if (executable === undefined || executableHash === undefined) throw new TypeError("Codex fixture executable is unpinned");
    codex.enabled = true;
    codex.implementation.wrapper_entrypoint = executable;
    await writeWrapperPackageScaffold(fixture.directory);
    const fixtureCommit = await commitFixtureRepository(fixture.directory);
    codex.model_family_constraints = {
      allowed: ["openai"],
      requires_explicit_model: true,
    };
    await writeFile(fixture.compatibilityPath, stringify(compatibility));
    await writeFile(configPath, stringify({
      schemaVersion: 1,
      allowedAdapters: ["codex-app-server"],
      activeAdapters: ["codex-app-server"],
      allowedProfiles: ["headless"],
      adapters: { "codex-app-server": { command: [process.execPath, "/unverified/codex-wrapper.js", "--provider-executable", "/unverified/first", "--provider-executable", "/unverified/second"] } },
      workspaceRoots: [fixture.directory],
    }));
    try {
      const composed = await composeDaemonAdapters({
        globalConfigPath: configPath,
        compatibilityPath: fixture.compatibilityPath,
        compatibilitySchemaPath: fixture.schemaPath,
        agentsHome: fixture.directory,
      });
      expect(composed["codex-app-server"]).toMatchObject({
        command: [process.execPath, fixture.artifactPaths[0], "--provider-executable", fixture.artifactPaths[0]],
        modelPolicy: { allowedFamilies: ["openai"], requiresExplicitModel: true },
        wrapperProvenance: {
          repositoryCommit: fixtureCommit,
          wrapperPath: "fixture-adapter",
        },
      });
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("admits a machine-only root before project profile and path narrowing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-machine-composition-"));
    const portableRoot = join(directory, "portable");
    const machineRoot = join(directory, "machine");
    const projectRoot = join(machineRoot, "project");
    const stateDirectory = join(directory, "state");
    const runtimeDirectory = join(stateDirectory, "runtime");
    await Promise.all([
      mkdir(portableRoot, { recursive: true }), mkdir(projectRoot, { recursive: true }),
      mkdir(runtimeDirectory, { recursive: true, mode: 0o700 }),
    ]);
    const globalConfigPath = join(directory, "global.yaml");
    const projectConfigPath = join(directory, "project.yaml");
    await writeFile(globalConfigPath, stringify({
      schemaVersion: 1, allowedAdapters: [], activeAdapters: [], adapters: {},
      allowedProfiles: ["paired-visible"], workspaceRoots: [portableRoot],
      limits: { maximumConcurrentProviderTurns: 8 },
    }));
    await writeFile(projectConfigPath, stringify({
      schemaVersion: 1, namedExecutionProfile: "paired-visible", workspaceRoots: [projectRoot],
    }));
    const paths = {
      stateDirectory, runtimeDirectory,
      databasePath: join(stateDirectory, "fabric.sqlite3"), socketPath: join(runtimeDirectory, "fabric.sock"),
    };
    try {
      await runWorkspaceTrust(["trust", machineRoot, "--profiles", "paired-visible"], paths);
      await expect(composeDaemonConfiguration({
        globalConfigPath, projectConfigPath,
        compatibilityPath: `${repositoryRoot}/config/adapter-compatibility.yaml`,
        compatibilitySchemaPath: `${repositoryRoot}/runtime/agent-fabric/schemas/adapter-compatibility.schema.json`,
        agentsHome: directory, stateDirectory,
      })).resolves.toMatchObject({ executionProfile: "paired-visible", workspaceRoots: [await realpath(projectRoot)] });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
