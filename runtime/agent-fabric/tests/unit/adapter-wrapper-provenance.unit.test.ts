import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { verifyAdapterCompatibility } from "../../src/adapters/compatibility.ts";
import { commitFixtureRepository } from "../support/fixture-repository.ts";
import { repositoryPath } from "../support/primary-adapter-testkit.ts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

type ProvenanceFixture = {
  directory: string;
  compatibilityPath: string;
  schemaPath: string;
  wrapperPath: string;
  executablePath: string;
  repositoryCommit: string;
};

async function writeCompatibility(
  fixture: Omit<ProvenanceFixture, "repositoryCommit">,
  wrapperEntrypoint: string,
): Promise<void> {
  await writeFile(
    fixture.compatibilityPath,
    stringify({
      schema_version: 1,
      verification_date: "2026-07-16",
      adapter_contract_version: 1,
      capability_fixture_version: 1,
      activation_policy: { real_adapters_require_separate_gate: true, default_enabled: false },
      adapters: {
        fixture: {
          enabled: true,
          delivery_stage: 4,
          implementation: {
            kind: "fixture",
            installed_version: "1",
            executable: fixture.executablePath,
            executable_sha256: sha256("provider executable\n"),
            wrapper_entrypoint: wrapperEntrypoint,
          },
          contract: {
            adapter_version: 1,
            protocol: "fixture",
            protocol_version: "1",
            schema_source: join(fixture.directory, "protocol.json"),
            schema_sha256: sha256('{"schema_version":1}\n'),
            capability_fixture_version: 1,
          },
          runtime_range: { platforms: [process.platform] },
          model_family_constraints: { allowed: ["fixture"] },
          official_source_url: "https://example.invalid",
          unresolved_pins: [],
        },
      },
    }),
  );
}

async function createProvenanceFixture(): Promise<ProvenanceFixture> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-wrapper-provenance-"));
  const wrapperPath = join(directory, "wrapper.js");
  const schemaPath = join(directory, "protocol.json");
  const executablePath = join(directory, "provider");
  await Promise.all([
    writeFile(wrapperPath, 'export const execute = () => "safe";\n'),
    writeFile(schemaPath, '{"schema_version":1}\n'),
    writeFile(executablePath, "provider executable\n"),
  ]);
  const repositoryCommit = await commitFixtureRepository(directory);
  const fixture = {
    directory,
    compatibilityPath: join(directory, "adapter-compatibility.yaml"),
    schemaPath: repositoryPath("runtime/agent-fabric/schemas/adapter-compatibility.schema.json"),
    wrapperPath,
    executablePath,
  };
  await writeCompatibility(fixture, wrapperPath);
  return { ...fixture, repositoryCommit };
}

function verify(fixture: Pick<ProvenanceFixture, "compatibilityPath" | "schemaPath">) {
  return verifyAdapterCompatibility({
    compatibilityPath: fixture.compatibilityPath,
    schemaPath: fixture.schemaPath,
    adapterIds: ["fixture"],
    requireEnabled: true,
  });
}

describe("adapter wrapper Git provenance", () => {
  it("derives provenance from the repository commit and tracked wrapper path", async () => {
    const fixture = await createProvenanceFixture();

    await expect(verify(fixture)).resolves.toMatchObject({
      valid: true,
      wrapperProvenance: [{
        adapterId: "fixture",
        repositoryCommit: fixture.repositoryCommit,
        wrapperPath: "wrapper.js",
      }],
    });
  });

  it("needs no manual repin when a wrapper change is committed", async () => {
    const fixture = await createProvenanceFixture();
    await writeFile(fixture.wrapperPath, 'export const execute = () => "changed in the same commit";\n');
    const changedCommit = await commitFixtureRepository(fixture.directory, "wrapper change");
    expect(changedCommit).not.toBe(fixture.repositoryCommit);

    // The compatibility registry is untouched: Git supplies the new identity.
    await expect(verify(fixture)).resolves.toMatchObject({
      valid: true,
      wrapperProvenance: [{
        adapterId: "fixture",
        repositoryCommit: changedCommit,
        wrapperPath: "wrapper.js",
      }],
    });
  });

  it("still fails closed when a pinned external artifact changes", async () => {
    const fixture = await createProvenanceFixture();
    await writeFile(fixture.executablePath, "tampered provider executable\n");

    await expect(verify(fixture)).rejects.toMatchObject({ code: "ADAPTER_HASH_MISMATCH" });
  });

  it("fails closed when the wrapper entrypoint is missing", async () => {
    const fixture = await createProvenanceFixture();
    await rm(fixture.wrapperPath);

    await expect(verify(fixture)).rejects.toMatchObject({ code: "ADAPTER_ARTIFACT_MISSING" });
  });

  it("fails closed when the wrapper is untracked at the repository HEAD", async () => {
    const fixture = await createProvenanceFixture();
    const untrackedWrapper = join(fixture.directory, "untracked-wrapper.js");
    await writeFile(untrackedWrapper, 'export const execute = () => "untracked";\n');
    await writeCompatibility(fixture, untrackedWrapper);

    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("not tracked"),
    });
  });

  it("fails closed when the wrapper is gitignored build output", async () => {
    const fixture = await createProvenanceFixture();
    await mkdir(join(fixture.directory, "dist"));
    await writeFile(join(fixture.directory, ".gitignore"), "dist/\n");
    const builtWrapper = join(fixture.directory, "dist", "wrapper.js");
    await writeFile(builtWrapper, 'export const execute = () => "built output";\n');
    await commitFixtureRepository(fixture.directory, "ignore build output");
    await writeCompatibility(fixture, builtWrapper);

    // Models the pre-repair production topology: dist/** is ignored, so
    // commit+path provenance would name content Git does not have.
    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("not tracked"),
    });
  });

  it("fails closed when a tracked wrapper differs from its committed content", async () => {
    const fixture = await createProvenanceFixture();
    await writeFile(fixture.wrapperPath, 'export const execute = () => "tampered without commit";\n');

    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("differs from its committed content"),
    });
  });

  it("grants no provenance from an enclosing repository via upward discovery", async () => {
    const fixture = await createProvenanceFixture();
    const nested = join(fixture.directory, "nested", "deeper");
    await mkdir(nested, { recursive: true });
    const nestedWrapper = join(nested, "wrapper.js");
    await writeFile(nestedWrapper, 'export const execute = () => "nested";\n');
    await writeCompatibility(fixture, nestedWrapper);

    // Upward discovery reaches the fixture repository, but the file is not
    // tracked there, so the enclosing repository grants no false provenance.
    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("not tracked"),
    });
  });

  it("fails closed when the wrapper is outside any Git repository", async () => {
    const fixture = await createProvenanceFixture();
    const outside = await mkdtemp(join(tmpdir(), "agent-fabric-outside-repo-"));
    const outsideWrapper = join(outside, "wrapper.js");
    await writeFile(outsideWrapper, 'export const execute = () => "unowned";\n');
    await writeCompatibility(fixture, outsideWrapper);

    await expect(verify(fixture)).rejects.toMatchObject({ code: "ADAPTER_COMPATIBILITY_INVALID" });
  });

  describe("Git environment injection", () => {
    const injected = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"] as const;
    const saved = new Map<string, string | undefined>();

    afterEach(() => {
      for (const key of injected) {
        const value = saved.get(key);
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      saved.clear();
    });

    it("ignores injected GIT_DIR/GIT_WORK_TREE when deriving provenance", async () => {
      const fixture = await createProvenanceFixture();
      const outside = await mkdtemp(join(tmpdir(), "agent-fabric-injection-"));
      const outsideWrapper = join(outside, "wrapper.js");
      await writeFile(outsideWrapper, 'export const execute = () => "unowned";\n');
      await writeCompatibility(fixture, outsideWrapper);

      for (const key of injected) saved.set(key, process.env[key]);
      // Without sanitization these variables make repository discovery report
      // a worktree of "/", so a non-repository wrapper would pass containment.
      process.env.GIT_DIR = join(fixture.directory, ".git");
      process.env.GIT_WORK_TREE = "/";
      process.env.GIT_INDEX_FILE = join(fixture.directory, ".git", "index");

      await expect(verify(fixture)).rejects.toMatchObject({
        code: "ADAPTER_COMPATIBILITY_INVALID",
        message: expect.stringContaining("no Git repository provenance"),
      });

      // The same injected environment must not corrupt a legitimate
      // derivation either: provenance still names the wrapper's own repo.
      await writeCompatibility(fixture, fixture.wrapperPath);
      await expect(verify(fixture)).resolves.toMatchObject({
        wrapperProvenance: [{
          adapterId: "fixture",
          repositoryCommit: fixture.repositoryCommit,
          wrapperPath: "wrapper.js",
        }],
      });
    });
  });
});
