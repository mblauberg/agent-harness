import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { verifyAdapterCompatibility } from "../../src/adapters/compatibility.ts";
import { AdapterSupervisor } from "../../src/adapters/supervisor.ts";
import { commitFixtureRepository, writeWrapperPackageScaffold } from "../support/fixture-repository.ts";
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
  await writeWrapperPackageScaffold(directory);
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

  it("fails closed when an executed first-party sibling differs while the entrypoint stays clean", async () => {
    const fixture = await createProvenanceFixture();
    await writeFile(join(fixture.directory, "package.json"), JSON.stringify({ name: "@local/fixture-wrapper", type: "module" }));
    await mkdir(join(fixture.directory, "src"), { recursive: true });
    const packagedWrapper = join(fixture.directory, "src", "wrapper.js");
    const sibling = join(fixture.directory, "src", "sibling.js");
    await writeFile(packagedWrapper, 'export { execute } from "./sibling.js";\n');
    await writeFile(sibling, 'export const execute = () => "safe";\n');
    await commitFixtureRepository(fixture.directory, "packaged wrapper");
    await writeCompatibility(fixture, packagedWrapper);

    await expect(verify(fixture)).resolves.toMatchObject({
      wrapperProvenance: [{ adapterId: "fixture", wrapperPath: "src/wrapper.js" }],
    });

    await writeFile(sibling, 'export const execute = () => "tampered sibling";\n');
    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("first-party source differs"),
    });
  });

  it("fails closed when a local workspace dependency source differs", async () => {
    const fixture = await createProvenanceFixture();
    const packageRoot = join(fixture.directory, "wrapper-package");
    const dependencyRoot = join(fixture.directory, "fixture-protocol");
    await mkdir(join(packageRoot, "src"), { recursive: true });
    await mkdir(join(dependencyRoot, "src"), { recursive: true });
    await mkdir(join(packageRoot, "node_modules", "@local"), { recursive: true });
    const packagedWrapper = join(packageRoot, "src", "wrapper.js");
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({
      name: "@local/fixture-wrapper",
      type: "module",
      dependencies: { "@local/fixture-protocol": "file:../fixture-protocol" },
    }));
    await writeFile(packagedWrapper, 'export { parse } from "@local/fixture-protocol";\n');
    await writeFile(join(dependencyRoot, "package.json"), JSON.stringify({
      name: "@local/fixture-protocol",
      type: "module",
      exports: { ".": { source: "./src/index.js", import: "./src/index.js" } },
    }));
    await writeFile(join(dependencyRoot, "src", "index.js"), 'export const parse = () => "safe";\n');
    await symlink(dependencyRoot, join(packageRoot, "node_modules", "@local", "fixture-protocol"), "dir");
    await commitFixtureRepository(fixture.directory, "workspace dependency");
    await writeCompatibility(fixture, packagedWrapper);

    await expect(verify(fixture)).resolves.toMatchObject({
      wrapperProvenance: [{ adapterId: "fixture", wrapperPath: "wrapper-package/src/wrapper.js" }],
    });

    await writeFile(join(dependencyRoot, "src", "index.js"), 'export const parse = () => "tampered dependency";\n');
    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("first-party source differs"),
    });
  });

  it("fails closed when an untracked package manifest truncates span discovery", async () => {
    const fixture = await createProvenanceFixture();
    const packageRoot = join(fixture.directory, "wrapper-package");
    await mkdir(join(packageRoot, "src"), { recursive: true });
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "@local/hijack-target", type: "module" }));
    const packagedWrapper = join(packageRoot, "src", "wrapper.js");
    await writeFile(packagedWrapper, 'export const execute = () => "safe";\n');
    await commitFixtureRepository(fixture.directory, "packaged wrapper");
    await writeCompatibility(fixture, packagedWrapper);

    await expect(verify(fixture)).resolves.toMatchObject({
      wrapperProvenance: [{ adapterId: "fixture", wrapperPath: "wrapper-package/src/wrapper.js" }],
    });

    // An untracked manifest closer to the wrapper hijacks owning-package
    // discovery and empties the span; before the repair this skipped the
    // first-party diff entirely. It must fail closed naming the manifest.
    await writeFile(join(packageRoot, "src", "package.json"), JSON.stringify({ name: "@local/hijacked", type: "module" }));
    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("not tracked at the repository HEAD: wrapper-package/src/package.json"),
    });
  });

  it("fails closed when a deleted tracked manifest truncates span discovery over tampered source", async () => {
    const fixture = await createProvenanceFixture();
    // Tamper first-party source, then delete the tracked manifest that
    // anchors span discovery: before the repair the walk found no owning
    // package, derived an empty span and verification silently passed.
    await writeFile(join(fixture.directory, "src", "index.js"), 'export const fixtureFirstPartySource = "tampered";\n');
    await rm(join(fixture.directory, "package.json"));

    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("tracked at HEAD but missing from the working tree: package.json"),
    });
  });

  it("fails closed when the wrapper has no owning workspace package", async () => {
    const fixture = await createProvenanceFixture();
    const bare = await mkdtemp(join(tmpdir(), "agent-fabric-bare-wrapper-"));
    const bareWrapper = join(bare, "wrapper.js");
    await writeFile(bareWrapper, 'export const execute = () => "bare";\n');
    await commitFixtureRepository(bare);
    await writeCompatibility(fixture, bareWrapper);

    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("no owning workspace package"),
    });
  });

  it("fails closed when the owning workspace package has no src span", async () => {
    const fixture = await createProvenanceFixture();
    const packageRoot = join(fixture.directory, "no-src-package");
    await mkdir(packageRoot);
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "@local/no-src", type: "module" }));
    const wrapper = join(packageRoot, "wrapper.js");
    await writeFile(wrapper, 'export const execute = () => "no span";\n');
    await commitFixtureRepository(fixture.directory, "no-src package");
    await writeCompatibility(fixture, wrapper);

    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("first-party source span is empty"),
    });
  });

  it("fails closed when a consulted package manifest is modified without commit", async () => {
    const fixture = await createProvenanceFixture();
    await writeFile(
      join(fixture.directory, "package.json"),
      JSON.stringify({ name: "@local/fixture-wrapper", type: "module", description: "locally modified" }),
    );

    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("first-party source differs"),
    });
  });

  it("re-verifies provenance at spawn time and fails closed on a wrapper mutated after composition", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-spawn-provenance-"));
    const wrapperPath = join(directory, "wrapper.mjs");
    const responder = [
      'import { createInterface } from "node:readline";',
      "const input = createInterface({ input: process.stdin });",
      'input.on("line", (line) => {',
      "  const request = JSON.parse(line);",
      "  process.stdout.write(`${JSON.stringify({ id: request.id, result: { protocolVersion: 1, adapterId: \"fixture\", operations: [\"spawn\"] } })}\\n`);",
      "});",
      "",
    ].join("\n");
    await writeFile(wrapperPath, responder);
    await writeWrapperPackageScaffold(directory);
    const repositoryCommit = await commitFixtureRepository(directory);
    const definition = {
      command: [process.execPath, wrapperPath],
      environment: {},
      wrapperProvenance: { repositoryCommit, wrapperPath: "wrapper.mjs" },
    };

    const healthy = new AdapterSupervisor({ fixture: definition });
    try {
      await expect(healthy.request("fixture", "capabilities", {})).resolves.toMatchObject({ adapterId: "fixture" });
    } finally {
      await healthy.close();
    }

    // Mutate the wrapper after composition: the spawn-time re-derivation must
    // fail closed before any process starts.
    await writeFile(wrapperPath, `${responder}// tampered after composition\n`);
    const tampered = new AdapterSupervisor({ fixture: definition });
    try {
      await expect(tampered.request("fixture", "capabilities", {})).rejects.toMatchObject({
        code: "ADAPTER_COMPATIBILITY_INVALID",
        message: expect.stringContaining("differs from its committed content"),
      });
    } finally {
      await tampered.close();
    }

    // A committed mutation is still a provenance change relative to the
    // composed evidence and must also fail closed until recomposition.
    const changedCommit = await commitFixtureRepository(directory, "tampered wrapper");
    expect(changedCommit).not.toBe(repositoryCommit);
    const recommitted = new AdapterSupervisor({ fixture: definition });
    try {
      await expect(recommitted.request("fixture", "capabilities", {})).rejects.toMatchObject({
        code: "ADAPTER_COMPATIBILITY_INVALID",
        message: expect.stringContaining("changed since activation composition"),
      });
    } finally {
      await recommitted.close();
    }
  });

  it("fails closed at spawn when a deleted tracked manifest truncates span discovery", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-spawn-span-"));
    const wrapperPath = join(directory, "wrapper.mjs");
    await writeFile(wrapperPath, "export const fixtureWrapper = true;\n");
    await writeWrapperPackageScaffold(directory);
    const repositoryCommit = await commitFixtureRepository(directory);
    const definition = {
      command: [process.execPath, wrapperPath],
      environment: {},
      wrapperProvenance: { repositoryCommit, wrapperPath: "wrapper.mjs" },
    };

    // The same truncation that must fail at composition must also fail at
    // the spawn-time re-derivation, before any adapter process starts.
    await rm(join(directory, "package.json"));
    const supervisor = new AdapterSupervisor({ fixture: definition });
    try {
      await expect(supervisor.request("fixture", "capabilities", {})).rejects.toMatchObject({
        code: "ADAPTER_COMPATIBILITY_INVALID",
        message: expect.stringContaining("tracked at HEAD but missing from the working tree: package.json"),
      });
    } finally {
      await supervisor.close();
    }
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
