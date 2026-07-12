#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const MODULE_IMPORT = /(?:\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?|\bimport\s*\(\s*)["']([^"']+)["']/gu;

function exportTarget(value) {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  for (const [condition, candidate] of Object.entries(value)) {
    if (condition !== "import" && condition !== "node" && condition !== "default") continue;
    const target = exportTarget(candidate);
    if (target !== undefined) return target;
  }
  return undefined;
}

function workspacePackageName(specifier) {
  return /^(@local\/[^/]+)(?:\/.*)?$/u.exec(specifier)?.[1];
}

async function resolveWorkspaceImport(specifier, sourcePath) {
  const packageName = workspacePackageName(specifier);
  if (packageName === undefined) return [];
  let searchDirectory = dirname(sourcePath);
  let packageJsonPath;
  while (packageJsonPath === undefined) {
    try {
      packageJsonPath = await realpath(resolve(searchDirectory, "node_modules", packageName, "package.json"));
    } catch {
      const parent = dirname(searchDirectory);
      if (parent === searchDirectory) throw new Error(`local workspace package is unavailable: ${specifier}`);
      searchDirectory = parent;
    }
  }
  const document = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const subpath = specifier.slice(packageName.length);
  const exportKey = subpath.length === 0 ? "." : `.${subpath}`;
  const selected = typeof document.exports === "object" && document.exports !== null
    ? document.exports[exportKey]
    : undefined;
  const target = exportTarget(selected ?? (exportKey === "." ? document.exports : undefined))
    ?? (exportKey === "." ? document.module ?? document.main : undefined);
  if (typeof target !== "string" || !target.startsWith("./")) {
    throw new Error(`local workspace package export is invalid: ${specifier}`);
  }
  const entrypoint = await realpath(resolve(dirname(packageJsonPath), target));
  const packageRelativePath = relative(dirname(packageJsonPath), entrypoint);
  if (packageRelativePath.startsWith("..") || isAbsolute(packageRelativePath)) {
    throw new Error(`local workspace package export escapes its package: ${specifier}`);
  }
  return [packageJsonPath, entrypoint];
}

async function localImports(source, sourcePath) {
  const dependencies = [];
  for (const match of source.matchAll(MODULE_IMPORT)) {
    const specifier = match[1] ?? "";
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      dependencies.push(resolve(dirname(sourcePath), specifier));
    } else {
      dependencies.push(...await resolveWorkspaceImport(specifier, sourcePath));
    }
  }
  return dependencies;
}

function portablePath(pathBase, path) {
  return relative(pathBase, path).split(sep).join("/");
}

export async function createWrapperManifest({ entrypoint, outputPath, pathBase }) {
  const absoluteEntrypoint = resolve(entrypoint);
  const absoluteBase = resolve(pathBase);
  const pending = [absoluteEntrypoint];
  const sources = new Map();
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined || sources.has(path)) continue;
    const bytes = await readFile(path);
    sources.set(path, bytes);
    for (const dependency of await localImports(bytes.toString("utf8"), path)) {
      if (!sources.has(dependency)) pending.push(dependency);
    }
  }
  const files = [...sources.entries()]
    .map(([path, bytes]) => ({
      path: portablePath(absoluteBase, path),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const manifest = `${JSON.stringify(
    {
      schema_version: 1,
      entrypoint: portablePath(absoluteBase, absoluteEntrypoint),
      files,
    },
    undefined,
    2,
  )}\n`;
  await writeFile(outputPath, manifest);
  return {
    outputPath,
    fileCount: files.length,
    sha256: createHash("sha256").update(manifest).digest("hex"),
  };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [entrypoint, outputPath, pathBase = process.cwd()] = process.argv.slice(2);
  if (entrypoint === undefined || outputPath === undefined) {
    throw new Error(`usage: ${basename(process.argv[1])} WRAPPER_ENTRYPOINT OUTPUT_FILE [PATH_BASE]`);
  }
  process.stdout.write(`${JSON.stringify(await createWrapperManifest({ entrypoint, outputPath, pathBase }))}\n`);
}
