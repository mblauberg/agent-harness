import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { compileProviderPayload } from "../../src/authority/authority-compiler.ts";
import { ROOT_AUTHORITY } from "../support/stage1-fixture.ts";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "authority-compiler-"));
  cleanup.push(directory);
  const root = await realpath(directory);
  await Promise.all([
    mkdir(join(root, "src", "private"), { recursive: true }),
    mkdir(join(root, "src", "public"), { recursive: true }),
  ]);
  return {
    root,
    authority: {
      ...ROOT_AUTHORITY,
      sourcePaths: ["src"],
      deniedPaths: ["src/private"],
      disclosure: { level: "scoped", scopes: ["approved-provider"] } as const,
    },
  };
}

describe("AuthorityCompiler", () => {
  it("compiles the exact current read-only provider projection", async () => {
    const { root, authority } = await fixture();
    expect(compileProviderPayload({
      authority,
      workspaceRoot: () => root,
      payload: { cwd: "src/public", prompt: "Review this." },
      now: Date.parse("2026-01-01T00:00:00Z"),
      validateCurrent: true,
    })).toEqual({
      cwd: join(root, "src", "public"),
      prompt: "Review this.",
      readOnlyRoot: join(root, "src", "public"),
      allowedTools: ["Read", "Glob", "Grep"],
      approvalPolicy: "never",
      sandbox: "read-only",
    });
  });

  it.each(["allowedTools", "disallowedTools", "permissions", "sandbox", "readOnlyRoot"])(
    "rejects caller control override %s",
    async (field) => {
      const { root, authority } = await fixture();
      expect(() => compileProviderPayload({
        authority,
        workspaceRoot: () => root,
        payload: { [field]: "override" },
        now: Date.parse("2026-01-01T00:00:00Z"),
        validateCurrent: true,
      })).toThrow(`provider payload cannot override trusted control ${field}`);
    },
  );

  it("rejects expiry before resolving the run workspace", async () => {
    const { authority } = await fixture();
    let workspaceRequested = false;
    expect(() => compileProviderPayload({
      authority: { ...authority, expiresAt: "2025-01-01T00:00:00Z" },
      workspaceRoot: () => {
        workspaceRequested = true;
        throw new Error("workspace must not be read");
      },
      payload: {},
      now: Date.parse("2026-01-01T00:00:00Z"),
      validateCurrent: true,
    })).toThrow("provider authority has expired");
    expect(workspaceRequested).toBe(false);
  });

  it.each([".", "src/private"])("rejects cwd outside effective source authority: %s", async (cwd) => {
    const { root, authority } = await fixture();
    expect(() => compileProviderPayload({
      authority,
      workspaceRoot: () => root,
      payload: { cwd },
      now: Date.parse("2026-01-01T00:00:00Z"),
      validateCurrent: true,
    })).toThrow("provider cwd is outside delegated authority");
  });

  it("preserves replay admission without rechecking expiry or disclosure", async () => {
    const { root, authority } = await fixture();
    expect(compileProviderPayload({
      authority: {
        ...authority,
        disclosure: { level: "forbidden" },
        expiresAt: "2025-01-01T00:00:00Z",
      },
      workspaceRoot: () => root,
      payload: { cwd: "src/public" },
      now: null,
      validateCurrent: false,
    })).toMatchObject({ cwd: join(root, "src", "public"), sandbox: "read-only" });
  });
});
