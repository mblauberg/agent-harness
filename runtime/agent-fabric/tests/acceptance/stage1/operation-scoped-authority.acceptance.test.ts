import Database from "better-sqlite3";
import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { FABRIC_OPERATIONS, expandAuthorityActions } from "../../../src/domain/operations.js";
import { openFabric } from "../../../src/index.ts";
import { ROOT_AUTHORITY, createStage1Fixture } from "../../support/stage1-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("operation-scoped authority", () => {
  it("stores only versioned operations after expanding legacy authority bundles", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });

    const database = new Database(fixture.databasePath, { readonly: true, fileMustExist: true });
    try {
      const rows = database.prepare("SELECT authority_json FROM authorities ORDER BY authority_id").all();
      const actions = rows.flatMap((row) => {
        if (typeof row !== "object" || row === null || !("authority_json" in row) || typeof row.authority_json !== "string") {
          throw new TypeError("stored authority row is invalid");
        }
        const authority: unknown = JSON.parse(row.authority_json);
        if (typeof authority !== "object" || authority === null || !("actions" in authority) || !Array.isArray(authority.actions)) {
          throw new TypeError("stored authority document is invalid");
        }
        return authority.actions;
      });
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.every((action) => typeof action === "string" && action.startsWith("fabric.v1."))).toBe(true);
      expect(actions).not.toContain("read");
      expect(actions).not.toContain("write");
      expect(actions).not.toContain("delegate");
      expect(actions).not.toContain("message");
    } finally {
      database.close();
    }
  });

  it("authorises one exact operation without granting its former legacy bundle", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });

    const authority = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.authorities.chair,
      commandId: "authority:message-send-only",
      authority: {
        ...ROOT_AUTHORITY,
        sourcePaths: ["src/message-only"],
        artifactPaths: [".agent-run/message-only"],
        actions: [FABRIC_OPERATIONS.sendMessage],
        budget: { turns: 1 },
      },
    });
    const registration = await fixture.chair.registerAgent({ agentId: "message-only", authorityId: authority.authorityId });
    await fixture.chair.createDiscussionGroup({
      groupId: "message-only-group",
      memberAgentIds: ["chair", "message-only"],
      commandId: "group:message-only",
    });
    const client = fixture.fabric.connect(registration.capability);

    await expect(client.sendMessage({
      audience: { kind: "agents", agentIds: ["chair"] },
      context: { kind: "discussion-group", groupId: "message-only-group" },
      kind: "request",
      body: "bounded message",
      requiresAck: false,
      dedupeKey: "message-only:1",
    })).resolves.toMatchObject({ messageId: expect.any(String) });
    await expect(client.receiveMessages({ limit: 1, visibilityTimeoutMs: 1_000 })).rejects.toMatchObject({
      code: "CAPABILITY_FORBIDDEN",
    });
    await expect(client.getMailboxState()).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
  });

  it("upgrades trusted legacy actions already stored in an existing database", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    await fixture.fabric.close();

    const database = new Database(fixture.databasePath);
    const row = database.prepare("SELECT authority_json FROM authorities WHERE authority_id = ?").get(fixture.authorities.alice);
    if (typeof row !== "object" || row === null || !("authority_json" in row) || typeof row.authority_json !== "string") {
      throw new TypeError("stored authority row is invalid");
    }
    const authority: unknown = JSON.parse(row.authority_json);
    if (typeof authority !== "object" || authority === null) throw new TypeError("stored authority document is invalid");
    database.prepare("UPDATE authorities SET authority_json = ?, authority_hash = ? WHERE authority_id = ?").run(
      JSON.stringify({ ...authority, actions: ["read", "message"] }),
      "legacy-authority-hash",
      fixture.authorities.alice,
    );
    database.close();

    const reopened = await openFabric({ databasePath: fixture.databasePath, workspaceRoots: [fixture.directory] });
    await reopened.close();
    const inspection = new Database(fixture.databasePath, { readonly: true, fileMustExist: true });
    try {
      const upgraded = inspection.prepare("SELECT authority_json FROM authorities WHERE authority_id = ?").get(fixture.authorities.alice);
      if (typeof upgraded !== "object" || upgraded === null || !("authority_json" in upgraded) || typeof upgraded.authority_json !== "string") {
        throw new TypeError("upgraded authority row is invalid");
      }
      const document: unknown = JSON.parse(upgraded.authority_json);
      if (typeof document !== "object" || document === null || !("actions" in document)) {
        throw new TypeError("upgraded authority document is invalid");
      }
      const expected = expandAuthorityActions(["read", "message"]);
      if (!expected.ok) throw new TypeError("legacy authority expansion failed");
      expect(document.actions).toEqual(expected.operations);
    } finally {
      inspection.close();
    }
  });
});
