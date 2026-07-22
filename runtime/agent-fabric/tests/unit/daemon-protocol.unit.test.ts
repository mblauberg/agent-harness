import { describe, expect, it, vi } from "vitest";

import type { FabricClient } from "../../src/core/fabric.ts";
import { dispatchClientMethod } from "../../src/daemon/protocol.ts";

describe("daemon provider action protocol", () => {
  it.each([
    ["adapter", { adapterId: "fake\0lifecycle", actionId: "provider-action:spawn", operation: "spawn", taskId: "task-1", authorityId: "authority-1" }],
    ["action", { adapterId: "fake-lifecycle", actionId: "provider-action\0steer", operation: "steer" }],
  ])("rejects a NUL-containing %s identity before client dispatch", async (_case, identity) => {
    const dispatchProviderAction = vi.fn();
    const client = { dispatchProviderAction } as unknown as FabricClient;

    await expect(dispatchClientMethod(client, "dispatchProviderAction", {
      ...identity,
      certifyingReview: null,
      payload: {},
      commandId: "provider-action:command",
    })).rejects.toMatchObject({
      code: "PROTOCOL_INVALID",
      message: "provider adapter ID and action ID must not contain NUL",
    });
    expect(dispatchProviderAction).not.toHaveBeenCalled();
  });
});
