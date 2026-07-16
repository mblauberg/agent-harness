import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { verifyAdapterCompatibility } from "../../src/adapters/compatibility.ts";
import { AdapterSupervisor } from "../../src/adapters/supervisor.ts";
import { commitFixtureRepository, writeWrapperPackageScaffold } from "../support/fixture-repository.ts";
import { repositoryPath } from "../support/primary-adapter-testkit.ts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const execFileAsync = promisify(execFile);

async function fixtureGit(directory: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", [
    "-C",
    directory,
    "-c",
    "user.name=fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    ...args,
  ]);
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
          model_family_constraints: { allowed: ["fixture"], requires_explicit_model: true },
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

  it("binds the consulted tsconfig chain and fails closed on a dirty tsconfig", async () => {
    const fixture = await createProvenanceFixture();
    const tsconfigPath = join(fixture.directory, "tsconfig.json");
    await writeFile(tsconfigPath, `${JSON.stringify({ compilerOptions: { strict: true } })}\n`);
    await commitFixtureRepository(fixture.directory, "add tsconfig");

    // The tsconfig is now part of the tracked-and-clean verification set.
    await expect(verify(fixture)).resolves.toMatchObject({ valid: true });

    // tsx would read this tsconfig at runtime; a byte change without a commit
    // could redirect module resolution, so it must fail closed naming the file.
    await writeFile(tsconfigPath, `${JSON.stringify({ compilerOptions: { strict: false } })}\n`);
    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("differs from its committed content: fixture (tsconfig.json)"),
    });
  });

  it("fails closed when a consulted tsconfig is present but untracked", async () => {
    const fixture = await createProvenanceFixture();
    // Present on disk (tsx would read it) but never committed: it cannot be
    // verified against HEAD, so span discovery fails closed naming it.
    await writeFile(join(fixture.directory, "tsconfig.json"), `${JSON.stringify({ compilerOptions: { strict: true } })}\n`);

    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("TypeScript configuration is present but not tracked at the repository HEAD: tsconfig.json"),
    });
  });

  it("fails closed when a node_modules dependency symlink is redirected to another in-repo package", async () => {
    const fixture = await createProvenanceFixture();
    const packageRoot = join(fixture.directory, "wrapper-package");
    const trackedTarget = join(fixture.directory, "fixture-protocol");
    const decoyTarget = join(fixture.directory, "decoy-protocol");
    await mkdir(join(packageRoot, "src"), { recursive: true });
    await mkdir(join(trackedTarget, "src"), { recursive: true });
    await mkdir(join(decoyTarget, "src"), { recursive: true });
    await mkdir(join(packageRoot, "node_modules", "@local"), { recursive: true });
    const packagedWrapper = join(packageRoot, "src", "wrapper.js");
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({
      name: "@local/fixture-wrapper",
      type: "module",
      dependencies: { "@local/fixture-protocol": "file:../fixture-protocol" },
    }));
    await writeFile(packagedWrapper, 'export { parse } from "@local/fixture-protocol";\n');
    await writeFile(join(trackedTarget, "package.json"), JSON.stringify({ name: "@local/fixture-protocol", type: "module" }));
    await writeFile(join(trackedTarget, "src", "index.js"), 'export const parse = () => "safe";\n');
    await writeFile(join(decoyTarget, "package.json"), JSON.stringify({ name: "@local/fixture-protocol", type: "module" }));
    await writeFile(join(decoyTarget, "src", "index.js"), 'export const parse = () => "attacker";\n');
    // The symlink points at the decoy package, not the tracked file: target.
    await symlink(decoyTarget, join(packageRoot, "node_modules", "@local", "fixture-protocol"), "dir");
    await commitFixtureRepository(fixture.directory, "redirected dependency symlink");
    await writeCompatibility(fixture, packagedWrapper);

    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("resolves outside its tracked location"),
    });
  });

  it("fails closed on byte drift hidden with git update-index --assume-unchanged", async () => {
    const fixture = await createProvenanceFixture();
    const source = join(fixture.directory, "src", "index.js");
    await writeFile(source, 'export const fixtureFirstPartySource = "tampered";\n');
    // assume-unchanged makes `git diff --quiet HEAD` skip the file entirely; the
    // index-free hash comparison reads the worktree bytes and still fails closed.
    await fixtureGit(fixture.directory, "update-index", "--assume-unchanged", "src/index.js");

    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("first-party source differs from its committed content: fixture (src/index.js)"),
    });
  });

  it("fails closed against a git replace ref shadowing HEAD's tree", async () => {
    const fixture = await createProvenanceFixture();
    const source = join(fixture.directory, "src", "index.js");
    // Build a tampered commit, then rewind HEAD to the clean commit and use a
    // replace ref so the clean commit resolves to the tampered tree. A verifier
    // that honored replacement objects would see the tampered worktree as clean;
    // rev-parse HEAD still records the original clean commit.
    await writeFile(source, 'export const fixtureFirstPartySource = "tampered";\n');
    const tamperedCommit = await commitFixtureRepository(fixture.directory, "tampered tree");
    await fixtureGit(fixture.directory, "reset", "--hard", fixture.repositoryCommit);
    await fixtureGit(fixture.directory, "replace", fixture.repositoryCommit, tamperedCommit);
    // The compatibility registry was committed into the tampered commit and
    // removed by the rewind; restore it (it is not part of the provenance span).
    await writeCompatibility(fixture, fixture.wrapperPath);
    await writeFile(source, 'export const fixtureFirstPartySource = "tampered";\n');

    // --no-replace-objects makes ls-tree resolve the genuine clean tree, so the
    // tampered worktree byte drift is detected and fails closed.
    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("first-party source differs from its committed content: fixture (src/index.js)"),
    });
  });

  it("fails closed on an untracked file shadowing a first-party source span", async () => {
    const fixture = await createProvenanceFixture();
    // A new file physically present in the src span but absent from HEAD would
    // be executed by tsx outside the verified set, so it fails closed naming it.
    await writeFile(join(fixture.directory, "src", "shadow.js"), 'export const shadow = () => "untracked";\n');

    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("untracked file shadowing HEAD: src/shadow.js"),
    });
  });

  it("fails closed when a clean filter normalises tampered bytes to the committed blob SHA", async () => {
    const fixture = await createProvenanceFixture();
    const source = join(fixture.directory, "src", "index.js");
    // Committed content is `export const fixtureFirstPartySource = true;\n`.
    await writeFile(source, 'export const fixtureFirstPartySource = "tampered";\n');
    // A repo-local clean filter rewrites the tampered worktree bytes back to the
    // committed content, so an attribute-aware `git hash-object` would report the
    // committed blob SHA over malicious bytes the runtime actually executes.
    await writeFile(join(fixture.directory, ".git", "info", "attributes"), "src/index.js filter=neutralise\n");
    await fixtureGit(fixture.directory, "config", "filter.neutralise.clean", "sed 's/\"tampered\"/true/'");

    // --no-filters hashes the raw worktree bytes, so the drift is still caught.
    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("first-party source differs from its committed content: fixture (src/index.js)"),
    });
  });

  it("fails closed when a tracked package tsconfig is deleted to expose an ancestor fallback", async () => {
    const fixture = await createProvenanceFixture();
    const packageRoot = join(fixture.directory, "pkg");
    await mkdir(join(packageRoot, "src"), { recursive: true });
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "@local/nested", type: "module" }));
    const wrapper = join(packageRoot, "src", "wrapper.js");
    await writeFile(wrapper, 'export const execute = () => "safe";\n');
    const packageTsconfig = join(packageRoot, "tsconfig.json");
    await writeFile(packageTsconfig, `${JSON.stringify({ compilerOptions: { strict: true } })}\n`);
    await commitFixtureRepository(fixture.directory, "nested package with tsconfig");
    await writeCompatibility(fixture, wrapper);

    await expect(verify(fixture)).resolves.toMatchObject({ valid: true });

    // Deleting the tracked package tsconfig would let tsx fall back to a dirtier
    // ancestor config; the upward chain treats the deletion as tampering.
    await rm(packageTsconfig);
    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("tracked at HEAD but missing from the working tree: pkg/tsconfig.json"),
    });
  });

  it("binds a tsconfig ancestor above the package and fails closed when it is dirtied", async () => {
    const fixture = await createProvenanceFixture();
    const packageRoot = join(fixture.directory, "pkg");
    await mkdir(join(packageRoot, "src"), { recursive: true });
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "@local/nested", type: "module" }));
    const wrapper = join(packageRoot, "src", "wrapper.js");
    await writeFile(wrapper, 'export const execute = () => "safe";\n');
    // An ancestor tsconfig ABOVE the package root: tsx's upward discovery from
    // the package directory reads it when the package has none of its own.
    const ancestorTsconfig = join(fixture.directory, "tsconfig.json");
    await writeFile(ancestorTsconfig, `${JSON.stringify({ compilerOptions: { strict: true } })}\n`);
    await commitFixtureRepository(fixture.directory, "nested package under ancestor tsconfig");
    await writeCompatibility(fixture, wrapper);

    await expect(verify(fixture)).resolves.toMatchObject({ valid: true });

    // Dirtying the ancestor config (never the package's own) must fail closed;
    // downward-only chain discovery would have missed it entirely.
    await writeFile(ancestorTsconfig, `${JSON.stringify({ compilerOptions: { strict: false } })}\n`);
    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("first-party source differs from its committed content: fixture (tsconfig.json)"),
    });
  });

  it("fails closed when a tsconfig extends a path outside the repository", async () => {
    const fixture = await createProvenanceFixture();
    const tsconfigPath = join(fixture.directory, "tsconfig.json");
    await writeFile(tsconfigPath, `${JSON.stringify({ extends: "../outside/tsconfig.json", compilerOptions: {} })}\n`);
    await commitFixtureRepository(fixture.directory, "tsconfig extends outside repo");
    await writeCompatibility(fixture, fixture.wrapperPath);

    // tsx would resolve and read the out-of-repo extends target, leaving mutable
    // configuration unbound, so an escaping extends fails closed rather than being
    // silently ignored.
    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("extends a path outside the repository"),
    });
  });

  it("fails closed when a workspace dependency's tracked location is a symlink onto another package", async () => {
    const fixture = await createProvenanceFixture();
    const packageRoot = join(fixture.directory, "wrapper-package");
    const realTarget = join(fixture.directory, "other-package");
    await mkdir(join(packageRoot, "src"), { recursive: true });
    await mkdir(join(realTarget, "src"), { recursive: true });
    await mkdir(join(packageRoot, "node_modules", "@local"), { recursive: true });
    const packagedWrapper = join(packageRoot, "src", "wrapper.js");
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({
      name: "@local/fixture-wrapper",
      type: "module",
      dependencies: { "@local/fixture-protocol": "file:../fixture-protocol" },
    }));
    await writeFile(packagedWrapper, 'export { parse } from "@local/fixture-protocol";\n');
    await writeFile(join(realTarget, "package.json"), JSON.stringify({ name: "@local/other", type: "module" }));
    await writeFile(join(realTarget, "src", "index.js"), 'export const parse = () => "attacker";\n');
    // The tracked `file:` target `fixture-protocol` is itself a symlink onto a
    // different real package, and node_modules honours it, so realpath collapses
    // both sides onto one directory while the committed dependency tree is
    // shadowed. Binding the lexical target rejects the redirection.
    await symlink(realTarget, join(fixture.directory, "fixture-protocol"), "dir");
    await symlink(
      join(fixture.directory, "fixture-protocol"),
      join(packageRoot, "node_modules", "@local", "fixture-protocol"),
      "dir",
    );
    await commitFixtureRepository(fixture.directory, "symlinked workspace package");
    await writeCompatibility(fixture, packagedWrapper);

    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("symlink redirecting outside its committed directory"),
    });
  });

  it("fails closed on a symlink inside a first-party source span", async () => {
    const fixture = await createProvenanceFixture();
    // A symlink physically present in the src span: tsx could follow it outside
    // the verified set and it is never a tracked regular blob, so the exhaustive
    // physical walk must reject it rather than skip it.
    await symlink(fixture.executablePath, join(fixture.directory, "src", "link.js"), "file");

    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("non-regular entry"),
    });
  });

  const canForceReaddirFailure = typeof process.getuid === "function" && process.getuid() !== 0;
  (canForceReaddirFailure ? it : it.skip)(
    "fails closed when a source-span subdirectory cannot be traversed",
    async () => {
      const fixture = await createProvenanceFixture();
      const unreadable = join(fixture.directory, "src", "sub");
      await mkdir(unreadable);
      // An unreadable subdirectory inside the span: the exhaustive physical walk
      // must propagate the traversal failure instead of silently skipping it.
      await chmod(unreadable, 0o000);
      try {
        await expect(verify(fixture)).rejects.toMatchObject({
          code: "ADAPTER_COMPATIBILITY_INVALID",
          message: expect.stringContaining("could not be traversed"),
        });
      } finally {
        await chmod(unreadable, 0o755);
      }
    },
  );

  it("fails closed when the workspace root manifest is dirty while resolving a non-file: dependency", async () => {
    const fixture = await createProvenanceFixture();
    // A root workspaces layout whose wrapper package depends on a sibling via a
    // non-file: workspace specifier, so resolution consults the root manifest's
    // workspace patterns.
    await writeFile(
      join(fixture.directory, "package.json"),
      `${JSON.stringify({ name: "@local/root", type: "module", workspaces: ["packages/*"] })}\n`,
    );
    const wrapperPkg = join(fixture.directory, "packages", "wrapper");
    const protocolPkg = join(fixture.directory, "packages", "fixture-protocol");
    await mkdir(join(wrapperPkg, "src"), { recursive: true });
    await mkdir(join(protocolPkg, "src"), { recursive: true });
    await mkdir(join(wrapperPkg, "node_modules", "@local"), { recursive: true });
    const packagedWrapper = join(wrapperPkg, "src", "wrapper.js");
    await writeFile(join(wrapperPkg, "package.json"), JSON.stringify({
      name: "@local/fixture-wrapper",
      type: "module",
      dependencies: { "@local/fixture-protocol": "*" },
    }));
    await writeFile(packagedWrapper, 'export { parse } from "@local/fixture-protocol";\n');
    await writeFile(join(protocolPkg, "package.json"), JSON.stringify({ name: "@local/fixture-protocol", type: "module" }));
    await writeFile(join(protocolPkg, "src", "index.js"), 'export const parse = () => "safe";\n');
    await symlink(protocolPkg, join(wrapperPkg, "node_modules", "@local", "fixture-protocol"), "dir");
    await commitFixtureRepository(fixture.directory, "workspace layout with non-file dependency");
    await writeCompatibility(fixture, packagedWrapper);

    await expect(verify(fixture)).resolves.toMatchObject({
      wrapperProvenance: [{ adapterId: "fixture", wrapperPath: "packages/wrapper/src/wrapper.js" }],
    });

    // Modify the tracked root manifest without committing: its workspace patterns
    // steer non-file: resolution, so the dirty manifest must fail closed before
    // its patterns are trusted.
    await writeFile(
      join(fixture.directory, "package.json"),
      `${JSON.stringify({ name: "@local/root", type: "module", workspaces: ["packages/*"], description: "locally modified" })}\n`,
    );
    await expect(verify(fixture)).rejects.toMatchObject({
      code: "ADAPTER_COMPATIBILITY_INVALID",
      message: expect.stringContaining("workspace root manifest differs from its committed content"),
    });
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
