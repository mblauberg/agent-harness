import { readFile } from "node:fs/promises";
import { join } from "node:path";

const GENERATION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;

export async function currentSeatDirectory(stateDirectory, projectKey) {
  const seatRoot = join(stateDirectory, "seats", projectKey);
  const pointerPath = join(seatRoot, "current.json");
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  if (
    typeof pointer !== "object" || pointer === null || Array.isArray(pointer) ||
    pointer.schemaVersion !== 1 || pointer.projectKey !== projectKey ||
    typeof pointer.generation !== "string" || !GENERATION_PATTERN.test(pointer.generation)
  ) {
    throw new Error(`registered MCP seat generation pointer is invalid: ${pointerPath}`);
  }
  return join(seatRoot, "generations", pointer.generation);
}
