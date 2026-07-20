import { rm } from "node:fs/promises";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { createLifecycleFixture } from "../support/lifecycle-testkit.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("provider-action owner boundary wiring", () => {
  it("revalidates persisted ownership before acknowledging dispatch re-entry", async () => {
    const fixture = await createLifecycleFixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const request = {
      certifyingReview: null,
      adapterId: "fake-lifecycle",
      actionId: "provider-owner-structural-reentry",
      operation: "send_turn" as const,
      payload: { scenario: "ambiguous-unproven", taskId: fixture.leaderTask.taskId },
      commandId: "provider-owner-structural-reentry:dispatch",
    };
    await expect(fixture.chair.dispatchProviderAction(request)).resolves.toMatchObject({
      status: "ambiguous",
      executionCount: 1,
    });

    const database = new Database(fixture.databasePath);
    database.pragma("foreign_keys = OFF");
    database.prepare(`
      UPDATE provider_actions SET finding_capacity_reservation_digest=?
       WHERE adapter_id=? AND action_id=?
    `).run(`sha256:${"a".repeat(64)}`, request.adapterId, request.actionId);
    database.close();

    await expect(fixture.chair.dispatchProviderAction(request)).rejects.toMatchObject({
      name: "ProviderActionOwnerError",
      expectedOwner: "generic",
      actualOwner: "integrity_failed",
    });
  });
});
