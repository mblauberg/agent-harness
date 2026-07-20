import { describe, expect, it } from "vitest";

import {
  canonicaliseProviderActionDispatchRequest,
  type ProviderActionDispatchRequest,
} from "../../src/application/provider-action-dispatch-request.ts";

type ProviderSpawnDispatchRequest = Extract<ProviderActionDispatchRequest, { operation: "spawn" }>;

const spawnRequest = (): ProviderSpawnDispatchRequest => ({
  adapterId: "fake-lifecycle",
  actionId: "provider-action:spawn",
  operation: "spawn",
  taskId: "task-1",
  authorityId: "authority-1",
  certifyingReview: null,
  payload: { modelFamily: "fake", prompt: "Review this." },
  commandId: "provider-action:spawn:command",
});

describe("provider action dispatch request canonicalisation", () => {
  it("removes a matching compatibility task identity from a spawn payload", () => {
    const input = spawnRequest();
    input.payload.taskId = input.taskId;

    expect(canonicaliseProviderActionDispatchRequest(input)).toStrictEqual(spawnRequest());
  });

  it("leaves a valid non-spawn request unchanged", () => {
    const input: ProviderActionDispatchRequest = {
      adapterId: "fake-lifecycle",
      actionId: "provider-action:steer",
      operation: "steer",
      certifyingReview: null,
      payload: { message: "Continue." },
      commandId: "provider-action:steer:command",
    };

    expect(canonicaliseProviderActionDispatchRequest(input)).toBe(input);
  });

  it.each([
    [
      "certifying review ownership",
      { ...spawnRequest(), certifyingReview: { reviewId: "review-1" } },
      "certifying review dispatch requires the review evidence daemon owner",
    ],
    [
      "route ownership",
      { ...spawnRequest(), routeRequest: { modelFamily: "fake" } },
      "provider route requests require the review evidence daemon owner",
    ],
    [
      "spawn-only top-level task identity",
      {
        adapterId: "fake-lifecycle",
        actionId: "provider-action:steer",
        operation: "steer",
        taskId: "task-1",
        certifyingReview: null,
        payload: {},
        commandId: "provider-action:steer:command",
      },
      "top-level provider task ID is spawn-only",
    ],
    [
      "non-empty canonical task identity",
      { ...spawnRequest(), taskId: "" },
      "ephemeral provider spawn requires an exact top-level task ID",
    ],
    [
      "conflicting payload task identity",
      { ...spawnRequest(), payload: { taskId: "task-2" } },
      "provider payload task ID conflicts with the canonical top-level task ID",
    ],
  ])("rejects %s", (_case, malformed, message) => {
    expect(() => canonicaliseProviderActionDispatchRequest(
      malformed as ProviderActionDispatchRequest,
    )).toThrow(expect.objectContaining({ code: "PROTOCOL_INVALID", message }));
  });
});
