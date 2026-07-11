import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FABRIC_OPERATIONS } from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("published protocol schema", () => {
  it("enumerates the exact public operation vocabulary", () => {
    const schema = JSON.parse(readFileSync(join(root, "schemas/protocol.schema.json"), "utf8"));

    expect(schema.$defs.fabricOperation.enum).toStrictEqual(Object.values(FABRIC_OPERATIONS));
  });

  it("closes every published object schema against unknown fields", () => {
    const schema = JSON.parse(readFileSync(join(root, "schemas/protocol.schema.json"), "utf8"));
    const objectDefinitions = Object.values(schema.$defs).filter(
      (definition): definition is Record<string, unknown> =>
        typeof definition === "object" && definition !== null && Reflect.get(definition, "type") === "object",
    );

    expect(objectDefinitions.length).toBeGreaterThan(8);
    expect(objectDefinitions.every((definition) => definition.additionalProperties === false)).toBe(true);
  });
});

describe("standalone package boundary", () => {
  it("never imports daemon or legacy runtime internals", () => {
    const sources = readdirSync(join(root, "src"), { recursive: true })
      .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".ts"))
      .map((entry) => readFileSync(join(root, "src", entry), "utf8"));

    expect(sources.join("\n")).not.toMatch(/agent-fabric\/src|\.\.\/agent-fabric|\/daemon\//u);
  });
});
