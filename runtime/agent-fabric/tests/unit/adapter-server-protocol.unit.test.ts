import { PassThrough, Writable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { serveAdapter } from "../../src/adapters/providers/server.ts";
import { FABRIC_PROTOCOL_LIMITS } from "../../src/transport/bounded-ndjson.ts";

describe("adapter server protocol bounds", () => {
  it("returns a typed overload without starting a ninth operation", async () => {
    const input = new PassThrough();
    let output = "";
    const releases: Array<() => void> = [];
    const request = vi.fn(async () => await new Promise<unknown>((resolve) => releases.push(() => resolve({ ok: true }))));
    const serving = serveAdapter({ request }, {
      input,
      output: new Writable({
        write(chunk, _encoding, callback) {
          output += chunk.toString();
          callback();
        },
      }),
    });

    for (let index = 0; index <= FABRIC_PROTOCOL_LIMITS.maximumAdapterInFlight; index += 1) {
      input.write(`${JSON.stringify({ id: `request-${String(index)}`, method: "hold", params: {} })}\n`);
    }
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(request).toHaveBeenCalledTimes(FABRIC_PROTOCOL_LIMITS.maximumAdapterInFlight);
    expect(output).toContain('"code":"ADAPTER_OVERLOADED"');
    for (const release of releases) release();
    input.end();
    await serving;
  });
});
