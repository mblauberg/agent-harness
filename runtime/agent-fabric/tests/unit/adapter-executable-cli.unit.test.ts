import { join } from "node:path";
import { readFile, rm, unlink, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { runSourceCli } from "../support/cli-process.ts";
import { createResolvedStage4Compatibility } from "../support/stage4-pi-agy-testkit.ts";

type Fixture = Awaited<ReturnType<typeof createResolvedStage4Compatibility>>;

const fixtures: Fixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => rm(fixture.directory, { recursive: true, force: true })));
});

async function fixtureExecutable(fixture: Fixture): Promise<string> {
  const document: unknown = parse(await readFile(fixture.compatibilityPath, "utf8"));
  if (
    typeof document !== "object" || document === null || !("adapters" in document) ||
    typeof document.adapters !== "object" || document.adapters === null || !("agy" in document.adapters) ||
    typeof document.adapters.agy !== "object" || document.adapters.agy === null || !("implementation" in document.adapters.agy) ||
    typeof document.adapters.agy.implementation !== "object" || document.adapters.agy.implementation === null ||
    !("executable" in document.adapters.agy.implementation) ||
    typeof document.adapters.agy.implementation.executable !== "string"
  ) {
    throw new TypeError("fixture has no Agy executable");
  }
  return document.adapters.agy.implementation.executable;
}

async function resolveFixtureExecutable(fixture: Fixture) {
  const configPath = join(fixture.directory, "agent-fabric.yaml");
  await writeFile(configPath, "schemaVersion: 1\nallowedAdapters: [agy]\nactiveAdapters: [agy]\n");
  return runSourceCli([
    "adapter", "executable", "--adapter", "agy",
    "--config", configPath,
    "--compatibility", fixture.compatibilityPath,
    "--compatibility-schema", fixture.schemaPath,
  ]);
}

describe("adapter executable resolver CLI", () => {
  it("prints the activated compatibility-pinned executable after validation", async () => {
    const fixture = await createResolvedStage4Compatibility("agy");
    fixtures.push(fixture);
    const executable = await fixtureExecutable(fixture);

    const result = await resolveFixtureExecutable(fixture);

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout).toBe(`${executable}\n`);
  });

  it("fails closed when the pinned executable hash drifts", async () => {
    const fixture = await createResolvedStage4Compatibility("agy");
    fixtures.push(fixture);
    await writeFile(await fixtureExecutable(fixture), "tampered executable\n");

    const result = await resolveFixtureExecutable(fixture);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("adapter artifact digest changed");
  });

  it("fails closed when the pinned executable is missing", async () => {
    const fixture = await createResolvedStage4Compatibility("agy");
    fixtures.push(fixture);
    await unlink(await fixtureExecutable(fixture));

    const result = await resolveFixtureExecutable(fixture);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("adapter artifact is unavailable");
  });

  it("fails closed when the adapter is not active", async () => {
    const fixture = await createResolvedStage4Compatibility("agy");
    fixtures.push(fixture);
    const configPath = join(fixture.directory, "agent-fabric.yaml");
    await writeFile(configPath, "schemaVersion: 1\nallowedAdapters: [agy]\nactiveAdapters: []\n");

    const result = await runSourceCli([
      "adapter", "executable", "--adapter", "agy",
      "--config", configPath,
      "--compatibility", fixture.compatibilityPath,
      "--compatibility-schema", fixture.schemaPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("adapter is not active in trusted Fabric configuration");
  });
});
