import { describe, expect, it, vi } from "vitest";

import {
  createAgyCliBoundary,
  runBoundedProviderCommand,
  type ProviderCommandRunner,
} from "../../src/adapters/providers/optional/command-boundaries.ts";
import {
  buildAgyInvocation,
  buildCursorInvocation,
  buildKiroAcpInvocation,
  buildPiRpcLaunch,
} from "../../src/adapters/providers/optional/invocations.ts";

describe("optional provider command boundaries", () => {
  it("builds only the locally documented disabled-provider command forms", () => {
    expect(buildPiRpcLaunch({ executable: "/trusted/pi", cwd: "." })).toEqual({
      executable: "/trusted/pi",
      args: ["--mode", "rpc"],
      cwd: ".",
    });
    expect(
      buildAgyInvocation({
        executable: "/trusted/agy",
        cwd: ".",
        model: "Gemini 3.5 Flash (High)",
        prompt: "review",
        mode: "plan",
        timeoutMs: 90_000,
      }),
    ).toEqual({
      executable: "/trusted/agy",
      args: ["--sandbox", "--mode", "plan", "--model", "Gemini 3.5 Flash (High)", "--print-timeout", "90s", "--print", "review"],
      cwd: ".",
      timeoutMs: 90_000,
    });
    expect(
      buildCursorInvocation({
        executable: "/trusted/cursor-agent",
        cwd: ".",
        model: "grok-4.5",
        prompt: "review",
        mode: "plan",
      }),
    ).toEqual({
      executable: "/trusted/cursor-agent",
      args: ["--print", "--output-format", "stream-json", "--sandbox", "enabled", "--mode", "plan", "--model", "grok-4.5", "--workspace", ".", "review"],
      cwd: ".",
    });
    expect(
      buildKiroAcpInvocation({ executable: "/trusted/kiro-cli", model: "qwen3-coder", agentEngine: "v2" }),
    ).toEqual({
      executable: "/trusted/kiro-cli",
      args: ["acp", "--agent-engine", "v2", "--model", "qwen3-coder"],
    });
  });

  it("uses an injected runner and never shells out while unit tested", async () => {
    const runner: ProviderCommandRunner = vi.fn(async (invocation) => ({
      stdout: JSON.stringify({ conversationId: "agy-session-1", result: "done", invocation }),
      stderr: "",
      exitCode: 0,
    }));
    const boundary = createAgyCliBoundary({
      executable: "/trusted/agy",
      cwd: ".",
      timeoutMs: 60_000,
      runner,
    });

    await expect(
      boundary.spawn({
        model: "Gemini 3.5 Flash (High)",
        modelFamily: "google",
        prompt: "bounded task",
        mode: "plan",
      }),
    ).resolves.toMatchObject({ resumeReference: "agy-session-1", result: "done" });
    expect(runner).toHaveBeenCalledOnce();
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({ executable: "/trusted/agy", timeoutMs: 60_000 }),
    );
  });

  it("rejects leading-dash values before optional provider argv construction", () => {
    expect(() => buildAgyInvocation({
      executable: "/trusted/agy", model: "--unsafe", prompt: "review", mode: "plan",
    })).toThrow(/leading dash/u);
    expect(() => buildCursorInvocation({
      executable: "/trusted/cursor", model: "grok-4", prompt: "--unsafe", mode: "plan",
    })).toThrow(/leading dash/u);
    expect(() => buildCursorInvocation({
      executable: "/trusted/cursor", model: "grok-4", prompt: "review", mode: "plan", resumeReference: "--unsafe",
    })).toThrow(/leading dash/u);
    expect(() => buildKiroAcpInvocation({
      executable: "/trusted/kiro", model: "--unsafe", agentEngine: "v2",
    })).toThrow(/leading dash/u);
  });

  it("bounds provider process duration and converts non-zero exits to typed failures", async () => {
    await expect(
      runBoundedProviderCommand({
        executable: process.execPath,
        args: ["-e", "setInterval(() => undefined, 1000)"],
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
    await expect(
      runBoundedProviderCommand({
        executable: process.execPath,
        args: ["-e", "process.stderr.write('fixture failure'); process.exit(7)"],
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_EXIT_NONZERO", details: { exitCode: 7 } });
  });
});
