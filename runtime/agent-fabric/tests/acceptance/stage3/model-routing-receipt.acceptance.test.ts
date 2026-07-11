import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  readJsonObject,
  repositoryPath,
  requirePublicFunction,
} from "../../support/primary-adapter-testkit.ts";

describe("FR-015 controlled model routing receipt", () => {
  it("retains the complete rejection receipt and fails closed for a disabled adapter", async () => {
    const resolveRoute = requirePublicFunction("resolveModelRouteReceipt");
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-route-receipt-"));
    const receiptPath = join(directory, "model-route.json");
    const routerPath = repositoryPath("scripts/model-route");

    const resolution = resolveRoute({
      routerPath,
      receiptPath,
      request: {
        adapter: "claude",
        alias: "workhorse",
        role: "worker",
        leadFamily: "openai",
        requireDistinct: true,
      },
    });
    await expect(resolution).rejects.toMatchObject({
      code: "MODEL_ROUTE_REJECTED",
      receipt: { status: "adapter_disabled", adapter: "claude" },
    });
    const retained = await readJsonObject(receiptPath);

    expect(retained).toMatchObject({
      schema_version: 1,
      status: "adapter_disabled",
      adapter: "claude",
      alias: "workhorse",
      role: "worker",
      lead_family: "openai",
      model_family: "anthropic",
      endpoint_provider: "anthropic",
      requested_effort: "medium",
      effort: "medium",
      adapter_enabled: false,
    });
    expect(JSON.parse(await readFile(receiptPath, "utf8"))).toEqual(retained);
  });
});
