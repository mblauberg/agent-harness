import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

import { composeDaemonAdapters, composeDaemonConfiguration } from "../../src/daemon/composition.ts";
import { createPrimaryCompatibilityFixture } from "../support/primary-adapter-testkit.ts";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

describe("daemon trusted adapter composition", () => {
  it("composes a core-only daemon while every allow-listed real adapter remains disabled", async () => {
    await expect(composeDaemonAdapters({
      globalConfigPath: `${repositoryRoot}/config/agent-fabric.yaml`,
      compatibilityPath: `${repositoryRoot}/config/adapter-compatibility.yaml`,
      compatibilitySchemaPath: `${repositoryRoot}/runtime/agent-fabric/schemas/adapter-compatibility.schema.json`,
      agentsHome: repositoryRoot,
    })).resolves.toEqual({});
  });

  it("expands the trusted AGENTS_HOME workspace root without binding config to one user", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-portable-config-"));
    const agentsHome = join(directory, "agents-home");
    const literalRoot = join(directory, "literal-root");
    const globalConfigPath = join(directory, "agent-fabric.yaml");
    await Promise.all([mkdir(agentsHome), mkdir(literalRoot)]);
    const source = await readFile(`${repositoryRoot}/config/agent-fabric.yaml`, "utf8");
    await writeFile(
      globalConfigPath,
      source.replace('  - "${AGENTS_HOME}"', `  - "\${AGENTS_HOME}"\n  - ${JSON.stringify(literalRoot)}`),
    );
    try {
      const expectedRoots = [await realpath(agentsHome), await realpath(literalRoot)];
      await expect(composeDaemonConfiguration({
        globalConfigPath,
        compatibilityPath: `${repositoryRoot}/config/adapter-compatibility.yaml`,
        compatibilitySchemaPath: `${repositoryRoot}/runtime/agent-fabric/schemas/adapter-compatibility.schema.json`,
        agentsHome,
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
    codex.implementation.wrapper_entrypoint_sha256 = executableHash;
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
      });
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});
