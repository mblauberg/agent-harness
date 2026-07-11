import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { verifyAdapterCompatibility } from "../../src/adapters/compatibility.ts";
import { repositoryPath } from "../support/primary-adapter-testkit.ts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function createClosureFixture(): Promise<{
  compatibilityPath: string;
  dependencyPath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-closure-"));
  const wrapperPath = join(directory, "wrapper.js");
  const dependencyPath = join(directory, "dependency.js");
  const schemaPath = join(directory, "protocol.json");
  const manifestPath = join(directory, "wrapper-manifest.json");
  const executablePath = join(directory, "provider");
  const wrapper = 'export { execute } from "./dependency.js";\n';
  const dependency = 'export const execute = () => "safe";\n';
  const protocol = '{"schema_version":1}\n';
  const executable = "provider executable\n";
  await Promise.all([
    writeFile(wrapperPath, wrapper),
    writeFile(dependencyPath, dependency),
    writeFile(schemaPath, protocol),
    writeFile(executablePath, executable),
  ]);
  const manifest = `${JSON.stringify(
    {
      schema_version: 1,
      entrypoint: wrapperPath,
      files: [
        { path: dependencyPath, sha256: sha256(dependency) },
        { path: wrapperPath, sha256: sha256(wrapper) },
      ],
    },
    undefined,
    2,
  )}\n`;
  await writeFile(manifestPath, manifest);
  const compatibilityPath = join(directory, "adapter-compatibility.yaml");
  await writeFile(
    compatibilityPath,
    stringify({
      schema_version: 1,
      verification_date: "2026-07-11",
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
            wrapper_entrypoint_sha256: sha256(wrapper),
            wrapper_manifest: manifestPath,
            wrapper_manifest_sha256: sha256(manifest),
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
  return { compatibilityPath, dependencyPath };
}

describe("adapter wrapper transitive-closure pins", () => {
  it("pins a bare workspace package and its complete runtime closure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-workspace-closure-"));
    const wrapperPath = join(directory, "wrapper.js");
    const protocolDirectory = join(directory, "protocol");
    const protocolEntrypoint = join(protocolDirectory, "dist", "index.js");
    const protocolDependency = join(protocolDirectory, "dist", "codec.js");
    const packageLinkParent = join(directory, "node_modules", "@local");
    const schemaPath = join(directory, "provider-schema.json");
    const executablePath = join(directory, "provider");
    const manifestPath = join(directory, "wrapper-manifest.json");
    const compatibilityPath = join(directory, "adapter-compatibility.yaml");
    const wrapper = 'export { parse } from "@local/fixture-protocol";\n';
    const protocol = 'export { parse } from "./codec.js";\n';
    const codec = 'export const parse = () => "safe";\n';
    const protocolPackage = JSON.stringify({
      name: "@local/fixture-protocol",
      type: "module",
      exports: { ".": { import: "./dist/index.js" } },
    });
    const providerSchema = '{"schema_version":1}\n';
    const executable = "provider executable\n";
    await mkdir(join(protocolDirectory, "dist"), { recursive: true });
    await mkdir(packageLinkParent, { recursive: true });
    await Promise.all([
      writeFile(wrapperPath, wrapper),
      writeFile(protocolEntrypoint, protocol),
      writeFile(protocolDependency, codec),
      writeFile(join(protocolDirectory, "package.json"), protocolPackage),
      writeFile(schemaPath, providerSchema),
      writeFile(executablePath, executable),
    ]);
    await symlink(protocolDirectory, join(packageLinkParent, "fixture-protocol"), "dir");
    const manifest = `${JSON.stringify({
      schema_version: 1,
      entrypoint: wrapperPath,
      files: [
        { path: wrapperPath, sha256: sha256(wrapper) },
        { path: join(protocolDirectory, "package.json"), sha256: sha256(protocolPackage) },
        { path: protocolEntrypoint, sha256: sha256(protocol) },
        { path: protocolDependency, sha256: sha256(codec) },
      ],
    }, undefined, 2)}\n`;
    await writeFile(manifestPath, manifest);
    await writeFile(compatibilityPath, stringify({
      schema_version: 1,
      verification_date: "2026-07-12",
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
            wrapper_entrypoint_sha256: sha256(wrapper),
            wrapper_manifest: manifestPath,
            wrapper_manifest_sha256: sha256(manifest),
          },
          contract: {
            adapter_version: 1,
            protocol: "fixture",
            protocol_version: "1",
            schema_source: schemaPath,
            schema_sha256: sha256(providerSchema),
            capability_fixture_version: 1,
          },
          runtime_range: { platforms: [process.platform] },
          model_family_constraints: { allowed: ["fixture"] },
          official_source_url: "https://example.invalid",
          unresolved_pins: [],
        },
      },
    }));

    await expect(verifyAdapterCompatibility({
      compatibilityPath,
      schemaPath: repositoryPath("runtime/agent-fabric/schemas/adapter-compatibility.schema.json"),
      adapterIds: ["fixture"],
      requireEnabled: true,
    })).resolves.toMatchObject({ valid: true });

    await writeFile(protocolDependency, 'export const parse = () => "tampered";\n');
    await expect(verifyAdapterCompatibility({
      compatibilityPath,
      schemaPath: repositoryPath("runtime/agent-fabric/schemas/adapter-compatibility.schema.json"),
      adapterIds: ["fixture"],
      requireEnabled: true,
    })).rejects.toMatchObject({ code: "ADAPTER_HASH_MISMATCH" });
  });

  it("fails closed when a transitive wrapper dependency changes", async () => {
    const fixture = await createClosureFixture();
    await writeFile(fixture.dependencyPath, 'export const execute = () => "tampered";\n');

    await expect(
      verifyAdapterCompatibility({
        compatibilityPath: fixture.compatibilityPath,
        schemaPath: repositoryPath("runtime/agent-fabric/schemas/adapter-compatibility.schema.json"),
        adapterIds: ["fixture"],
        requireEnabled: true,
      }),
    ).rejects.toMatchObject({ code: "ADAPTER_HASH_MISMATCH" });
  });

  it("rejects a manifest that omits an imported local module", async () => {
    const fixture = await createClosureFixture();
    const document = JSON.parse(await readFile(join(fixture.dependencyPath, "..", "wrapper-manifest.json"), "utf8")) as {
      files: unknown[];
    };
    document.files = document.files.slice(1);
    const manifest = `${JSON.stringify(document, undefined, 2)}\n`;
    const manifestPath = join(fixture.dependencyPath, "..", "wrapper-manifest.json");
    await writeFile(manifestPath, manifest);
    const compatibility = await readFile(fixture.compatibilityPath, "utf8");
    await writeFile(
      fixture.compatibilityPath,
      compatibility.replace(/wrapper_manifest_sha256: [0-9a-f]{64}/u, `wrapper_manifest_sha256: ${sha256(manifest)}`),
    );

    await expect(
      verifyAdapterCompatibility({
        compatibilityPath: fixture.compatibilityPath,
        schemaPath: repositoryPath("runtime/agent-fabric/schemas/adapter-compatibility.schema.json"),
        adapterIds: ["fixture"],
        requireEnabled: true,
      }),
    ).rejects.toMatchObject({ code: "ADAPTER_COMPATIBILITY_INVALID" });
  });
});
