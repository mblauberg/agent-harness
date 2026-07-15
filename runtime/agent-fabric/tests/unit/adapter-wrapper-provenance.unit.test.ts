import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { verifyAdapterCompatibility } from "../../src/adapters/compatibility.ts";
import { commitFixtureRepository } from "../support/fixture-repository.ts";
import { repositoryPath } from "../support/primary-adapter-testkit.ts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function createProvenanceFixture(): Promise<{
  directory: string;
  compatibilityPath: string;
  schemaPath: string;
  wrapperPath: string;
  executablePath: string;
  repositoryCommit: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-wrapper-provenance-"));
  const wrapperPath = join(directory, "wrapper.js");
  const schemaPath = join(directory, "protocol.json");
  const executablePath = join(directory, "provider");
  const wrapper = 'export const execute = () => "safe";\n';
  const protocol = '{"schema_version":1}\n';
  const executable = "provider executable\n";
  await Promise.all([
    writeFile(wrapperPath, wrapper),
    writeFile(schemaPath, protocol),
    writeFile(executablePath, executable),
  ]);
  const repositoryCommit = await commitFixtureRepository(directory);
  const compatibilityPath = join(directory, "adapter-compatibility.yaml");
  await writeFile(
    compatibilityPath,
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
            executable: executablePath,
            executable_sha256: sha256(executable),
            wrapper_entrypoint: wrapperPath,
          },
          contract: {
            adapter_version: 1,
            protocol: "fixture",
            protocol_version: "1",
            schema_source: schemaPath,
            schema_sha256: sha256(protocol),
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
  return {
    directory,
    compatibilityPath,
    schemaPath: repositoryPath("runtime/agent-fabric/schemas/adapter-compatibility.schema.json"),
    wrapperPath,
    executablePath,
    repositoryCommit,
  };
}

describe("adapter wrapper Git provenance", () => {
  it("derives provenance from the repository commit and wrapper path", async () => {
    const fixture = await createProvenanceFixture();

    await expect(verifyAdapterCompatibility({
      compatibilityPath: fixture.compatibilityPath,
      schemaPath: fixture.schemaPath,
      adapterIds: ["fixture"],
      requireEnabled: true,
    })).resolves.toMatchObject({
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
    await expect(verifyAdapterCompatibility({
      compatibilityPath: fixture.compatibilityPath,
      schemaPath: fixture.schemaPath,
      adapterIds: ["fixture"],
      requireEnabled: true,
    })).resolves.toMatchObject({
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

    await expect(verifyAdapterCompatibility({
      compatibilityPath: fixture.compatibilityPath,
      schemaPath: fixture.schemaPath,
      adapterIds: ["fixture"],
      requireEnabled: true,
    })).rejects.toMatchObject({ code: "ADAPTER_HASH_MISMATCH" });
  });

  it("fails closed when the wrapper entrypoint is missing", async () => {
    const fixture = await createProvenanceFixture();
    await rm(fixture.wrapperPath);

    await expect(verifyAdapterCompatibility({
      compatibilityPath: fixture.compatibilityPath,
      schemaPath: fixture.schemaPath,
      adapterIds: ["fixture"],
      requireEnabled: true,
    })).rejects.toMatchObject({ code: "ADAPTER_ARTIFACT_MISSING" });
  });

  it("fails closed when the wrapper is outside any Git repository", async () => {
    const fixture = await createProvenanceFixture();
    const outside = await mkdtemp(join(tmpdir(), "agent-fabric-outside-repo-"));
    const outsideWrapper = join(outside, "wrapper.js");
    await writeFile(outsideWrapper, 'export const execute = () => "unowned";\n');
    const compatibility = stringify({
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
            wrapper_entrypoint: outsideWrapper,
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
    });
    const compatibilityPath = join(outside, "adapter-compatibility.yaml");
    await writeFile(compatibilityPath, compatibility);

    await expect(verifyAdapterCompatibility({
      compatibilityPath,
      schemaPath: fixture.schemaPath,
      adapterIds: ["fixture"],
      requireEnabled: true,
    })).rejects.toMatchObject({ code: "ADAPTER_COMPATIBILITY_INVALID" });
  });
});
