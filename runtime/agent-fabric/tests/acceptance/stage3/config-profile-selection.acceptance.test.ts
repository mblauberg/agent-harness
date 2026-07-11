import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadFabricConfig } from "../../../src/config/index.ts";
import { resolveExecutionProfile } from "../../../src/index.ts";
import { INTERACTIVE_CAPABILITIES, MANAGED_CAPABILITIES } from "../../support/visibility-fixture.ts";

describe("NFR-009 configured execution-profile selection", () => {
  it("resolves an allow-listed project profile without adapter-code changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-profile-config-"));
    const globalPath = join(directory, "global.yaml");
    const projectPath = join(directory, "project.yaml");
    await writeFile(globalPath, [
      "schemaVersion: 1",
      "allowedProfiles: [paired-observed]",
      `workspaceRoots: [${JSON.stringify(directory)}]`,
      "",
    ].join("\n"));
    await writeFile(projectPath, "schemaVersion: 1\nnamedExecutionProfile: paired-observed\n");
    const config = await loadFabricConfig({ globalPath, projectPath });
    expect(config.executionProfile).toBe("paired-observed");
    if (config.executionProfile !== "paired-observed") throw new Error("profile was not retained");
    expect(resolveExecutionProfile({
      name: config.executionProfile,
      chairInHerdr: true,
      capabilities: {
        chair: INTERACTIVE_CAPABILITIES,
        pairedPrimary: MANAGED_CAPABILITIES,
        worker: MANAGED_CAPABILITIES,
      },
    }).name).toBe("paired-observed");
  });
});
