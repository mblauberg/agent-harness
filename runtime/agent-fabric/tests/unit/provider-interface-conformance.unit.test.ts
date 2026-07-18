import { describe, expect, it, vi } from "vitest";

import { probeProviderInterface } from "../../src/adapters/provider-interface.ts";

describe("provider non-answer interface conformance", () => {
  it.each([
    ["claude-agent-sdk", "--print --output-format stream-json"],
    ["agy", "--print --model --mode --log-file"],
    ["cursor-agent", "--print --output-format --model"],
  ] as const)("accepts the required %s headless flags", async (adapterId, stdout) => {
    const run = vi.fn(async () => ({ stdout, stderr: "", exitCode: 0 }));
    await expect(probeProviderInterface({ adapterId, executable: "/provider" }, run))
      .resolves.toMatchObject({ adapterId, conformant: true });
  });

  it("proves the Codex app-server initialize handshake", async () => {
    const run = vi.fn(async () => ({ stdout: '{"id":1,"result":{"userAgent":"probe"}}\n', stderr: "", exitCode: 0 }));
    await expect(probeProviderInterface({ adapterId: "codex-app-server", executable: "/codex" }, run))
      .resolves.toMatchObject({ adapterId: "codex-app-server", conformant: true, probe: "app-server-initialize" });
  });

  it("proves the Kiro ACP v1 initialize handshake", async () => {
    const run = vi.fn(async () => ({ stdout: '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}\n', stderr: "", exitCode: 0 }));
    await expect(probeProviderInterface({ adapterId: "kiro-acp", executable: "/kiro" }, run))
      .resolves.toMatchObject({ adapterId: "kiro-acp", conformant: true, probe: "acp-v1-initialize" });
  });

  it("fails closed when a required interface disappears", async () => {
    const run = vi.fn(async () => ({ stdout: "--print --model", stderr: "", exitCode: 0 }));
    await expect(probeProviderInterface({ adapterId: "agy", executable: "/agy" }, run))
      .rejects.toMatchObject({ code: "ADAPTER_INTERFACE_MISMATCH" });
  });
});
