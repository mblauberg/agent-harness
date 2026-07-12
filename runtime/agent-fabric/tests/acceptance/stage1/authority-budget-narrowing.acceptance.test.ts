import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { ROOT_AUTHORITY, createStage1Fixture } from "../../support/stage1-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("Stage 1 authority and budget delegation narrowing", () => {
  it.each([
    ["workspace root", { workspaceRoots: ["/"] }],
    ["source path", { sourcePaths: ["./other"] }],
    ["artifact path", { artifactPaths: ["/tmp"] }],
    ["action", { actions: [...ROOT_AUTHORITY.actions, "deploy"] }],
    ["disclosure", { disclosure: { level: "scoped", scopes: ["external"] } as const }],
    ["expiry", { expiresAt: "2100-01-01T00:00:00.000Z" }],
    ["budget dimension", { budget: { turns: 20, "cost:USD": 10, tokens: 1 } }],
    ["turn budget", { budget: { turns: 21, "cost:USD": 10 } }],
  ])("rejects a child authority that widens its parent %s", async (_label, widened) => {
    const fixture = await createStage1Fixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });

    await expect(
      fixture.chair.delegateAuthority({
        parentAuthorityId: fixture.authorities.chair,
        authority: { ...ROOT_AUTHORITY, ...widened },
      }),
    ).rejects.toMatchObject({ code: "AUTHORITY_WIDENING" });
  });

  it("reserves sibling budgets atomically instead of validating each child against the original parent grant", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });

    // The fixture has already reserved two sibling grants of 5 turns and $2.
    // Only 10 turns and $6 remain in the chair's 20-turn/$10 grant.
    await expect(
      fixture.chair.delegateAuthority({
        parentAuthorityId: fixture.authorities.chair,
        commandId: "authority:over-reserve",
        authority: {
          ...ROOT_AUTHORITY,
          sourcePaths: ["src/third"],
          artifactPaths: [".agent-run/third"],
          actions: [...ROOT_AUTHORITY.actions],
          budget: { turns: 11, "cost:USD": 6 },
        },
      }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  it("returns the same child grant when a delegation command is retried", async () => {
    const fixture = await createStage1Fixture();
    cleanup.push(async () => {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    });
    const command = {
      parentAuthorityId: fixture.authorities.chair,
      commandId: "authority:bounded-third",
      authority: {
        ...ROOT_AUTHORITY,
        sourcePaths: ["src/third"],
        artifactPaths: [".agent-run/third"],
        actions: [...ROOT_AUTHORITY.actions],
        budget: { turns: 10, "cost:USD": 6 },
      },
    };

    const first = await fixture.chair.delegateAuthority(command);
    const retry = await fixture.chair.delegateAuthority(command);
    expect(retry).toEqual(first);
  });
});
