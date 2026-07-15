import { describe, expect, it } from "vitest";

import {
  HERDR_STEER_DISPATCH_REQUEST_CODEC,
  HERDR_STEER_DISPATCH_RESULT_CODEC,
} from "../src/index.js";

const request = {
  actionId: "herdr-action-01",
  fireAndForget: true,
  targetAgentId: "review-claude",
  paneRef: "w9:p3",
  reference: {
    kind: "task",
    taskId: "task-review-01",
    expectedRevision: 2,
  },
  prompt: "Pause after the current check.",
} as const;

describe("public Herdr steering contract", () => {
  it("accepts only a closed, explicitly one-way request", () => {
    expect(HERDR_STEER_DISPATCH_REQUEST_CODEC.parse(request, "request")).toStrictEqual(request);
    expect(() => HERDR_STEER_DISPATCH_REQUEST_CODEC.parse({
      ...request,
      expectedResult: true,
    }, "request")).toThrow("unknown field");
    expect(() => HERDR_STEER_DISPATCH_REQUEST_CODEC.parse({
      ...request,
      fireAndForget: false,
    }, "request")).toThrow();
  });

  it("cannot decode a terminal receipt that claims delivery or completion authority", () => {
    const terminal = {
      actionId: request.actionId,
      revision: 3,
      status: "terminal",
      receipt: {
        status: "dispatched-unconfirmed",
        operation: "steer.inject-fire-and-forget",
        referenceValidation: "verified",
        deliveryEvidence: "none",
        canSatisfyExpectedResult: false,
        canCloseBarrier: false,
      },
    } as const;
    expect(HERDR_STEER_DISPATCH_RESULT_CODEC.parse(terminal, "result")).toStrictEqual(terminal);
    expect(() => HERDR_STEER_DISPATCH_RESULT_CODEC.parse({
      ...terminal,
      receipt: { ...terminal.receipt, canCloseBarrier: true },
    }, "result")).toThrow();
  });
});
