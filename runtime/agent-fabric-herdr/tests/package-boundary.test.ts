import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("package boundary", () => {
  it("imports only the public protocol, sealed local-process Node APIs and package-local modules", () => {
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    const files = readdirSync(sourceDirectory).filter((name) => name.endsWith(".ts"));
    const disallowed: string[] = [];

    for (const file of files) {
      const source = readFileSync(`${sourceDirectory}/${file}`, "utf8");
      for (const match of source.matchAll(/from\s+["']([^"']+)["']/gu)) {
        const specifier = match[1];
        const allowedNodeBuiltins = new Set([
          "node:child_process",
          "node:crypto",
          "node:fs",
          "node:fs/promises",
          "node:path",
          "node:timers/promises",
          "node:url",
        ]);
        if (
          specifier !== undefined &&
          specifier !== "@local/agent-fabric-protocol" &&
          !allowedNodeBuiltins.has(specifier) &&
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
    expect(combined).not.toMatch(/node:net|shell:\s*true|exec\s*\(/u);
  });
});
