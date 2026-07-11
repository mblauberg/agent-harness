import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("package boundary", () => {
  it("imports only the public protocol, Node crypto and package-local modules", () => {
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    const files = readdirSync(sourceDirectory).filter((name) => name.endsWith(".ts"));
    const disallowed: string[] = [];

    for (const file of files) {
      const source = readFileSync(`${sourceDirectory}/${file}`, "utf8");
      for (const match of source.matchAll(/from\s+["']([^"']+)["']/gu)) {
        const specifier = match[1];
        if (
          specifier !== undefined &&
          specifier !== "@local/agent-fabric-protocol" &&
          specifier !== "node:crypto" &&
          !specifier.startsWith("./")
        ) {
          disallowed.push(`${file}: ${specifier}`);
        }
      }
    }

    expect(disallowed).toEqual([]);
  });

  it("contains no persistence or daemon-internal dependency", () => {
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    const combined = readdirSync(sourceDirectory)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(`${sourceDirectory}/${name}`, "utf8"))
      .join("\n");

    expect(combined).not.toMatch(/better-sqlite3|agent-fabric\/src\/(?:core|daemon|persistence)/u);
  });
});
