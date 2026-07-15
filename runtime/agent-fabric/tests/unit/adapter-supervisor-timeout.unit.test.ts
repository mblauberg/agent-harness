import { describe, expect, it, vi } from "vitest";

const transportFixture = vi.hoisted(() => ({
  closes: 0,
  requestedTimeouts: [] as number[],
}));

vi.mock("../../src/adapters/process.ts", () => {
  class AdapterTransportError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = "AdapterTransportError";
      this.code = code;
    }
  }

  class AdapterProcessTransport {
    closed = false;

    async request(
      method: string,
      params: Record<string, unknown>,
      options: { timeoutMs?: number } = {},
    ): Promise<unknown> {
      const timeoutMs = options.timeoutMs;
      const fixtureDurationMs = params.fixtureDurationMs;
      if (timeoutMs === undefined || typeof fixtureDurationMs !== "number") {
        throw new TypeError("timeout fixture requires numeric duration and deadline");
      }
      transportFixture.requestedTimeouts.push(timeoutMs);
      if (fixtureDurationMs > timeoutMs) {
        throw new AdapterTransportError(
          "ADAPTER_RESPONSE_TIMEOUT",
          `adapter ${method} response exceeded ${String(timeoutMs)}ms`,
        );
      }
      return { method };
    }

    async close(): Promise<void> {
      if (this.closed) return;
      this.closed = true;
      transportFixture.closes += 1;
    }
  }

  return { AdapterProcessTransport, AdapterTransportError };
});

import { AdapterSupervisor } from "../../src/adapters/supervisor.ts";

describe("adapter supervisor timeout selection", () => {
  it("keeps provider turns beyond the control deadline but enforces their own deadline", async () => {
    const supervisor = new AdapterSupervisor(
      { fake: { command: ["unused-by-timeout-fixture"], environment: {} } },
      { controlTimeoutMs: 5, providerTurnTimeoutMs: 20 },
    );

    try {
      await expect(supervisor.request("fake", "dispatch", {
        operation: "send_turn",
        fixtureDurationMs: 6,
      })).resolves.toEqual({ method: "dispatch" });

      await expect(supervisor.request("fake", "dispatch", {
        operation: "send_turn",
        fixtureDurationMs: 21,
      })).rejects.toMatchObject({ code: "ADAPTER_RESPONSE_TIMEOUT" });
    } finally {
      await supervisor.close();
    }

    expect(transportFixture.requestedTimeouts).toEqual([20, 20]);
    expect(transportFixture.closes).toBe(1);
  });
});
