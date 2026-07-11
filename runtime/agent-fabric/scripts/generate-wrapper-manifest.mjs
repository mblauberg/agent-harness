#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const LOCAL_IMPORT = /(?:\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?|\bimport\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/gu;

function localImports(source, sourcePath) {
  return [...source.matchAll(LOCAL_IMPORT)].map((match) => resolve(dirname(sourcePath), match[1] ?? ""));
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
    for (const dependency of localImports(bytes.toString("utf8"), path)) {
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
