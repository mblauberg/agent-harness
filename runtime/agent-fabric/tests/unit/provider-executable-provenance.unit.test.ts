import { describe, expect, it, vi } from "vitest";

import {
  verifyProviderExecutableIdentity,
  type ProviderIdentityPort,
} from "../../src/adapters/provider-identity.ts";

function port(overrides: Partial<ProviderIdentityPort> = {}): ProviderIdentityPort {
  return {
    inspectPath: vi.fn(async (path: string) => ({
      canonicalPath: path,
      regularFile: true,
      ownerUid: 501,
      mode: 0o755,
      sha256: "a".repeat(64),
    })),
    inspectDirectory: vi.fn(async (path: string) => ({
      canonicalPath: path,
      directory: true,
      ownerUid: 501,
      mode: 0o755,
    })),
    verifySignature: vi.fn(async () => undefined),
    signingIdentity: vi.fn(async () => ({ teamId: "Q6L2SF6YDW", identifier: "com.anthropic.claude-code" })),
    currentUid: vi.fn(() => 501),
    ...overrides,
  };
}

describe("provider executable identity", () => {
  it("accepts changed bytes when vendor identity and safe path still conform", async () => {
    const first = await verifyProviderExecutableIdentity({
      adapterId: "claude-agent-sdk",
      executable: "/opt/homebrew/bin/claude",
    }, port());
    const second = await verifyProviderExecutableIdentity({
      adapterId: "claude-agent-sdk",
      executable: "/opt/homebrew/bin/claude",
    }, port({
      inspectPath: vi.fn(async (path: string) => ({
        canonicalPath: path,
        regularFile: true,
        ownerUid: 501,
        mode: 0o755,
        sha256: "b".repeat(64),
      })),
    }));

    expect(first.sha256).not.toBe(second.sha256);
    expect(second.assurance).toBe("full-vendor-identity");
  });

  it("fails closed on the wrong vendor identity", async () => {
    await expect(verifyProviderExecutableIdentity({
      adapterId: "claude-agent-sdk",
      executable: "/opt/homebrew/bin/claude",
    }, port({ signingIdentity: vi.fn(async () => ({ teamId: "ATTACKER", identifier: "claude" })) })))
      .rejects.toMatchObject({ code: "ADAPTER_IDENTITY_MISMATCH" });
  });

  it("fails closed before identity extraction when strict signature verification fails", async () => {
    const signingIdentity = vi.fn(async () => ({ teamId: "94KV3E626L", identifier: "kiro-cli" }));
    await expect(verifyProviderExecutableIdentity({
      adapterId: "kiro-acp",
      executable: "/fixture/example/.local/bin/kiro-cli",
    }, port({
      verifySignature: vi.fn(async () => { throw new Error("invalid signature"); }),
      signingIdentity,
    }))).rejects.toMatchObject({ code: "ADAPTER_IDENTITY_MISMATCH" });
    expect(signingIdentity).not.toHaveBeenCalled();
  });

  it("fails closed on an unsafe Agy executable", async () => {
    await expect(verifyProviderExecutableIdentity({
      adapterId: "agy",
      executable: "/fixture/example/.local/bin/agy",
    }, port({
      inspectPath: vi.fn(async (path: string) => ({
        canonicalPath: path,
        regularFile: true,
        ownerUid: 501,
        mode: 0o777,
        sha256: "c".repeat(64),
      })),
      signingIdentity: vi.fn(async () => ({ teamId: "EQHXZ8M8AV", identifier: "cli" })),
    }))).rejects.toMatchObject({ code: "ADAPTER_PATH_UNSAFE" });
  });

  it("admits the stable Kiro shim by Amazon signing identity", async () => {
    const verifySignature = vi.fn(async () => undefined);
    const signingIdentity = vi.fn(async () => ({ teamId: "94KV3E626L", identifier: "kiro-cli" }));
    await expect(verifyProviderExecutableIdentity({
      adapterId: "kiro-acp",
      executable: "/fixture/example/.local/bin/kiro-cli",
    }, port({ verifySignature, signingIdentity })))
      .resolves.toMatchObject({ assurance: "full-vendor-identity" });
    expect(verifySignature).toHaveBeenCalledWith("/fixture/example/.local/bin/kiro-cli");
    expect(verifySignature.mock.invocationCallOrder[0]).toBeLessThan(signingIdentity.mock.invocationCallOrder[0] ?? 0);
  });

  it("labels Cursor partial identity and checks its signed helper and Node", async () => {
    const signingIdentity = vi.fn(async (path: string) => path.endsWith("spawn-helper")
      ? { teamId: "DCNK4UB866", identifier: "com.todesktop.230313mzl4w4u92.spawn-helper" }
      : { teamId: "HX7739G8FX", identifier: "node" });
    const result = await verifyProviderExecutableIdentity({
      adapterId: "cursor-agent",
      executable: "/fixture/example/.local/share/cursor-agent/versions/current/cursor-agent",
      cursorInstallRoot: "/fixture/example/.local/share/cursor-agent",
    }, port({ signingIdentity }));

    expect(result.assurance).toBe("partial-signed-helpers");
    expect(signingIdentity).toHaveBeenCalledTimes(2);
  });
});
