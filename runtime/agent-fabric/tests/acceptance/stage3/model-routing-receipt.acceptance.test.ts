import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  readJsonObject,
  repositoryPath,
  requirePublicFunction,
} from "../../support/primary-adapter-testkit.ts";

describe("FR-015 controlled model routing receipt", () => {
  it("binds a task class to the router invocation and retained receipt", async () => {
    const resolveRoute = requirePublicFunction("resolveModelRouteReceipt");
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-task-route-receipt-"));
    const receiptPath = join(directory, "model-route.json");
    const routerPath = repositoryPath("scripts/model-route");
    const capabilitiesFile = join(directory, "capabilities.json");
    await writeFile(capabilitiesFile, `${JSON.stringify({
      schema_version: 1,
      source: "codex debug models",
      observed_at: new Date().toISOString(),
      models: {
        "gpt-5.6-luna": {
          resolved_model: "gpt-5.6-luna",
          supported_efforts: ["low"],
        },
      },
    })}\n`);

    const resolution = await resolveRoute({
      routerPath,
      receiptPath,
      request: {
        adapter: "codex",
        taskClass: "mechanical",
        capabilitiesFile,
        role: "worker",
        leadFamily: "anthropic",
        requireDistinct: true,
      },
    }) as {
      invocation: { arguments: string[] };
      receipt: Record<string, unknown>;
    };

    expect(resolution.invocation.arguments).toEqual(expect.arrayContaining([
      "--task-class", "mechanical",
      "--capabilities-file", capabilitiesFile,
    ]));
    expect(resolution.invocation.arguments).not.toContain("--alias");
    expect(resolution.receipt).toMatchObject({
      status: "ok",
      task_class: "mechanical",
      route_source: "task-class",
      alias: "scout",
      requested_effort: "low",
      effort: "low",
      resolved_model: "",
      catalog_model: "gpt-5.6-luna",
      model_selection: "account-default",
      identity_source: "account-default",
    });
    expect(JSON.parse(await readFile(receiptPath, "utf8"))).toEqual(resolution.receipt);
  });

  it("persists a typed unknown-task rejection before failing closed", async () => {
    const resolveRoute = requirePublicFunction("resolveModelRouteReceipt");
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-unknown-task-receipt-"));
    const receiptPath = join(directory, "model-route.json");
    const resolution = resolveRoute({
      routerPath: repositoryPath("scripts/model-route"),
      receiptPath,
      request: {
        adapter: "claude",
        taskClass: "renamed-review",
        capabilitiesFile: join(directory, "not-needed-for-invalid-input.json"),
        role: "critical-review",
        leadFamily: "openai",
        requireDistinct: true,
      },
    });

    await expect(resolution).rejects.toMatchObject({
      code: "MODEL_ROUTE_REJECTED",
      receipt: {
        status: "unknown_task_class",
        adapter: "claude",
        role: "critical-review",
        task_class: "renamed-review",
        route_source: "task-class",
      },
    });
    expect(await readJsonObject(receiptPath)).toMatchObject({
      status: "unknown_task_class",
      task_class: "renamed-review",
    });
  });

  it("rejects and does not persist a mismatched ok receipt", async () => {
    const resolveRoute = requirePublicFunction("resolveModelRouteReceipt");
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-bad-route-receipt-"));
    const receiptPath = join(directory, "model-route.json");
    const routerPath = join(directory, "fake-router");
    await writeFile(routerPath, `#!/usr/bin/env node
console.log(JSON.stringify({
  schema_version: 1, status: "ok", adapter: "claude", role: "worker",
  alias: "scout", requested_effort: "low", effort: "low",
  effort_capability_source: "runtime-model-catalog", endpoint_provider: "anthropic",
  model_family: "anthropic", resolved_model: "haiku", identity_source: "runtime-capability+catalog"
}));
`, { mode: 0o700 });

    await expect(resolveRoute({
      routerPath,
      receiptPath,
      request: {
        adapter: "codex",
        alias: "scout",
        role: "worker",
        leadFamily: "anthropic",
        requireDistinct: true,
      },
    })).rejects.toThrow(/invalid receipt/u);
    await expect(readFile(receiptPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects and does not persist a malformed status-ok receipt", async () => {
    const resolveRoute = requirePublicFunction("resolveModelRouteReceipt");
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-malformed-route-receipt-"));
    const receiptPath = join(directory, "model-route.json");
    const routerPath = join(directory, "fake-router");
    await writeFile(routerPath, `#!/usr/bin/env node
console.log(JSON.stringify({ schema_version: 1, status: "ok", adapter: "codex", role: "worker", alias: "scout" }));
`, { mode: 0o700 });

    await expect(resolveRoute({
      routerPath,
      receiptPath,
      request: {
        adapter: "codex",
        alias: "scout",
        role: "worker",
        leadFamily: "anthropic",
        requireDistinct: true,
      },
    })).rejects.toThrow(/invalid receipt/u);
    await expect(readFile(receiptPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("retains the complete rejection receipt and fails closed for a disabled adapter", async () => {
    const resolveRoute = requirePublicFunction("resolveModelRouteReceipt");
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-route-receipt-"));
    const receiptPath = join(directory, "model-route.json");
    const routerPath = repositoryPath("scripts/model-route");

    const resolution = resolveRoute({
      routerPath,
      receiptPath,
      request: {
        adapter: "pi",
        alias: "workhorse",
        role: "worker",
        model: "qwen3-coder",
        leadFamily: "anthropic",
        requireDistinct: true,
      },
    });
    await expect(resolution).rejects.toMatchObject({
      code: "MODEL_ROUTE_REJECTED",
      receipt: { status: "adapter_disabled", adapter: "pi" },
    });
    const retained = await readJsonObject(receiptPath);

    expect(retained).toMatchObject({
      schema_version: 1,
      status: "adapter_disabled",
      adapter: "pi",
      alias: "workhorse",
      role: "worker",
      lead_family: "anthropic",
      model_family: "alibaba",
      endpoint_provider: "configured",
      requested_effort: "medium",
      effort: "medium",
      adapter_enabled: false,
    });
    expect(JSON.parse(await readFile(receiptPath, "utf8"))).toEqual(retained);
  });
});
