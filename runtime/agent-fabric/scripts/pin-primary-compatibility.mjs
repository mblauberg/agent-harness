import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDocument } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const packageName = "@anthropic-ai/claude-agent-sdk";
const defaultCompatibilityPath = join(root, "config/adapter-compatibility.yaml");
const defaultPackageRoot = join(root, "node_modules", packageName);

function argumentValue(arguments_, name) {
  const index = arguments_.indexOf(name);
  if (index === -1) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function packageEntrypointPath(packageRoot, entrypoint) {
  const prefix = `node_modules/${packageName}/`;
  const packageRelativePath = entrypoint.startsWith(prefix) ? entrypoint.slice(prefix.length) : entrypoint;
  const resolvedEntrypoint = resolve(packageRoot, packageRelativePath);
  const contained = relative(packageRoot, resolvedEntrypoint);
  if (contained.length === 0 || contained.startsWith("..")) {
    throw new Error(`configured SDK entrypoint escapes its installed package: ${entrypoint}`);
  }
  return resolvedEntrypoint;
}

export async function pinClaudeAgentSdk(options = {}) {
  const compatibilityPath = resolve(options.compatibilityPath ?? defaultCompatibilityPath);
  const packageRoot = resolve(options.packageRoot ?? defaultPackageRoot);
  const source = await readFile(compatibilityPath, "utf8");
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    throw new Error(`compatibility YAML is invalid: ${document.errors[0]?.message ?? "unknown parse error"}`);
  }

  const implementationPackage = document.getIn(["adapters", "claude-agent-sdk", "implementation", "package"]);
  if (implementationPackage !== packageName) {
    throw new Error(`compatibility registry lacks ${packageName} implementation metadata`);
  }
  const entrypoint = document.getIn(["adapters", "claude-agent-sdk", "implementation", "entrypoint"]);
  if (typeof entrypoint !== "string" || entrypoint.length === 0) {
    throw new Error(`${packageName} compatibility entry has no SDK entrypoint`);
  }

  const packageManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  if (!isRecord(packageManifest) || packageManifest.name !== packageName || typeof packageManifest.version !== "string") {
    throw new Error(`installed package manifest is not ${packageName}`);
  }
  const entrypointPath = packageEntrypointPath(packageRoot, entrypoint);
  const entrypointSha256 = sha256(await readFile(entrypointPath));
  document.deleteIn(["adapters", "claude-agent-sdk", "implementation", "lock_integrity_sha512"]);
  document.deleteIn(["adapters", "claude-agent-sdk", "contract", "schema_source"]);
  document.deleteIn(["adapters", "claude-agent-sdk", "contract", "schema_sha256"]);
  document.setIn(["adapters", "claude-agent-sdk", "implementation", "installed_version"], packageManifest.version);
  document.setIn(["adapters", "claude-agent-sdk", "implementation", "entrypoint_sha256"], entrypointSha256);

  const rendered = document.toString({ lineWidth: 0 });
  const changed = rendered !== source;
  if (changed) await writeFile(compatibilityPath, rendered, "utf8");
  return {
    compatibilityPath,
    installedVersion: packageManifest.version,
    entrypointSha256,
    changed,
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await pinClaudeAgentSdk({
    compatibilityPath: argumentValue(process.argv.slice(2), "--compatibility"),
    packageRoot: argumentValue(process.argv.slice(2), "--package-root"),
  });
  process.stdout.write(`${result.changed ? "updated" : "unchanged"} compatibility pin: ${result.installedVersion} ${result.entrypointSha256}\n`);
}
