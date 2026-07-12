import { readFile } from "node:fs/promises";
import { join } from "node:path";

const GENERATION_PATTERN = /^[0-9a-f]{64}$/u;

export async function currentSeatDirectory(stateDirectory, projectKey) {
  const seatRoot = join(stateDirectory, "seats", projectKey);
  const pointerPath = join(seatRoot, "current.json");
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  if (
    typeof pointer !== "object" || pointer === null || Array.isArray(pointer) ||
    Object.keys(pointer).sort().join(",") !== "generation,previousGeneration,projectKey,schemaVersion" ||
    pointer.schemaVersion !== 1 || pointer.projectKey !== projectKey ||
    (pointer.previousGeneration !== null &&
      (typeof pointer.previousGeneration !== "string" || !GENERATION_PATTERN.test(pointer.previousGeneration))) ||
    typeof pointer.generation !== "string" || !GENERATION_PATTERN.test(pointer.generation) ||
    pointer.previousGeneration === pointer.generation
  ) {
    throw new Error(`registered MCP seat generation pointer is invalid: ${pointerPath}`);
  }
  return join(seatRoot, "generations", pointer.generation);
}
