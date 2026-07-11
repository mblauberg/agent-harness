#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

function canonicalise(value) {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalise(value[key])]),
  );
}

export async function canonicaliseSchemaDirectory(inputDirectory, outputPath) {
  const pending = [inputDirectory];
  const entries = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) continue;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      if (entry.isFile() && entry.name.endsWith(".json")) {
        entries.push(relative(inputDirectory, path).split(sep).join("/"));
      }
    }
  }
  entries.sort();
  if (entries.length === 0) throw new Error(`no JSON schemas found in ${inputDirectory}`);

  const files = {};
  for (const name of entries) {
    files[name] = canonicalise(JSON.parse(await readFile(resolve(inputDirectory, ...name.split("/")), "utf8")));
  }
  const bytes = `${JSON.stringify({ schema_version: 1, files })}\n`;
  await writeFile(outputPath, bytes);
  return {
    outputPath,
    fileCount: entries.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [inputDirectory, outputPath] = process.argv.slice(2);
  if (inputDirectory === undefined || outputPath === undefined) {
    throw new Error(`usage: ${basename(process.argv[1])} INPUT_DIRECTORY OUTPUT_FILE`);
  }
  process.stdout.write(`${JSON.stringify(await canonicaliseSchemaDirectory(inputDirectory, outputPath))}\n`);
}
