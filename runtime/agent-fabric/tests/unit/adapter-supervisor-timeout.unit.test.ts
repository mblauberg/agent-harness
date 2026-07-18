import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    transportFixture.closes = 0;
    transportFixture.requestedTimeouts.length = 0;
  });

  it("uses the canonical 30-minute default for answer-bearing provider turns", async () => {
    const supervisor = new AdapterSupervisor({
      fake: { command: ["unused-by-timeout-fixture"], environment: {} },
    });

    try {
      await expect(supervisor.request("fake", "dispatch", {
        operation: "send_turn",
        fixtureDurationMs: 300_001,
      })).resolves.toEqual({ method: "dispatch" });
    } finally {
      await supervisor.close();
    }

    expect(transportFixture.requestedTimeouts).toEqual([(30 * 60_000) + 5_000]);
  });

  it("keeps the outer response envelope beyond the provider deadline but still bounds adapter settlement", async () => {
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
      })).resolves.toEqual({ method: "dispatch" });

      await expect(supervisor.request("fake", "dispatch", {
        operation: "send_turn",
        fixtureDurationMs: 5_021,
      })).rejects.toMatchObject({ code: "ADAPTER_RESPONSE_TIMEOUT" });
    } finally {
      await supervisor.close();
    }

    expect(transportFixture.requestedTimeouts).toEqual([5_020, 5_020, 5_020]);
    expect(transportFixture.closes).toBe(1);
  });
});
