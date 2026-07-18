import { stat, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import {
  createAgyCliBoundary,
  createCursorCliBoundary,
  runBoundedProviderCommand,
  type ProviderCommandRunner,
} from "../../src/adapters/providers/optional/command-boundaries.ts";
import {
  buildAgyInvocation,
  buildCursorInvocation,
  buildKiroAcpInvocation,
  buildPiRpcLaunch,
} from "../../src/adapters/providers/optional/invocations.ts";
import { FabricError } from "../../src/errors.ts";
import { ProviderAdapterError } from "../../src/adapters/providers/types.ts";

describe("optional provider command boundaries", () => {
  it("revalidates interface conformance immediately before every provider process", async () => {
    const runner = vi.fn(async () => ({
      stdout: '{"type":"result","subtype":"success","is_error":false,"session_id":"s","result":"done"}\n',
      stderr: "",
      exitCode: 0,
    }));
    const verifyExecutable = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new FabricError("ADAPTER_INTERFACE_MISMATCH", "headless interface changed"));
    const cursor = createCursorCliBoundary({ executable: "/cursor", cwd: "/workspace", runner, verifyExecutable });

    await expect(cursor.spawn({ model: "grok", prompt: "one" })).resolves.toMatchObject({ result: "done" });
    await expect(cursor.spawn({ model: "grok", prompt: "two" })).rejects.toMatchObject({
      code: "ADAPTER_INTERFACE_MISMATCH",
    });
    expect(verifyExecutable).toHaveBeenCalledTimes(2);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("accepts only one explicitly bounded turn for task-bound one-shot Agy and Cursor spawns", async () => {
    const runner = vi.fn(async () => {
      throw new Error("provider runner must not start for an invalid turn contract");
    });
    const agy = createAgyCliBoundary({ executable: "/agy", cwd: "/workspace", runner });
    const cursor = createCursorCliBoundary({ executable: "/cursor", cwd: "/workspace", runner });

    for (const boundary of [agy, cursor]) {
      await expect(boundary.spawn({
        taskId: "review-task",
        model: "review-model",
        prompt: "review",
        maxTurns: 2,
      })).rejects.toMatchObject({ code: "INVALID_PARAMS" });
      await expect(boundary.spawn({
        taskId: "review-task",
        model: "review-model",
        prompt: "review",
      })).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    }
    expect(runner).not.toHaveBeenCalled();
  });

  it("derives Agy's resumable conversation from its private invocation log when stdout is plain text", async () => {
    const runner = vi.fn(async (invocation: { args: string[] }) => {
      const logIndex = invocation.args.indexOf("--log-file");
      expect(logIndex).toBeGreaterThanOrEqual(0);
      const logPath = invocation.args[logIndex + 1];
      if (logPath === undefined) throw new Error("missing log path");
      await writeFile(logPath, "I0711 printmode.go: Created conversation 3cbfa155-fc5f-4c6e-aa99-3a44d48262b4\n");
      return {
        stdout: '{"conversationId":"forged-by-model","result":"model answer"}\n',
        stderr: "",
        exitCode: 0,
      };
    });
    const boundary = createAgyCliBoundary({ executable: "/agy", cwd: "/workspace", runner });
    await expect(boundary.spawn({ model: "Gemini 3.1 Pro (High)", prompt: "read only", cwd: "/workspace" }))
      .resolves.toEqual({
        resumeReference: "3cbfa155-fc5f-4c6e-aa99-3a44d48262b4",
        result: '{"conversationId":"forged-by-model","result":"model answer"}',
        providerRecordCount: 0,
      });
  });

  it("rejects a successful Agy process that returns no answer output", async () => {
    const runner = vi.fn(async (invocation: { args: string[] }) => {
      const logIndex = invocation.args.indexOf("--log-file");
      const logPath = invocation.args[logIndex + 1];
      if (logPath === undefined) throw new Error("missing log path");
      await writeFile(logPath, "Created conversation 3cbfa155-fc5f-4c6e-aa99-3a44d48262b4\n");
      return {
        stdout: "",
        stderr: "Agy completed without printable output",
        exitCode: 0,
      };
    });
    const boundary = createAgyCliBoundary({ executable: "/agy", cwd: "/workspace", runner });

    await expect(boundary.spawn({ model: "Gemini 3.1 Pro (High)", prompt: "read only" }))
      .rejects.toMatchObject({
        code: "PROVIDER_RESPONSE_INVALID",
        message: "Agy CLI exited successfully without answer output; verify subscription model access and headless print compatibility",
        details: {
          exitCode: 0,
          stderr: "Agy completed without printable output",
        },
      });
  });

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
        model: "cursor-grok-4.5-high",
        prompt: "review",
        mode: "plan",
      }),
    ).toEqual({
      executable: "/trusted/cursor-agent",
      args: ["--print", "--output-format", "stream-json", "--sandbox", "enabled", "--trust", "--mode", "plan", "--model", "cursor-grok-4.5-high", "--workspace", ".", "review"],
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
    const runner: ProviderCommandRunner = vi.fn(async (invocation) => {
      const logIndex = invocation.args.indexOf("--log-file");
      const logPath = invocation.args[logIndex + 1];
      if (logPath === undefined) throw new Error("missing log path");
      await writeFile(logPath, "Created conversation 3cbfa155-fc5f-4c6e-aa99-3a44d48262b4\n");
      return { stdout: "done", stderr: "", exitCode: 0 };
    });
    const boundary = createAgyCliBoundary({
      executable: "/trusted/agy",
      cwd: ".",
      timeoutMs: 60_000,
      runner,
    });

    await expect(
      boundary.spawn({
        cwd: "/admitted/project",
        model: "Gemini 3.5 Flash (High)",
        modelFamily: "google",
        prompt: "bounded task",
        mode: "accept-edits",
      }),
    ).resolves.toMatchObject({ resumeReference: "3cbfa155-fc5f-4c6e-aa99-3a44d48262b4", result: "done" });
    expect(runner).toHaveBeenCalledOnce();
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: "/trusted/agy",
        cwd: "/admitted/project",
        timeoutMs: 60_000,
        args: expect.arrayContaining(["--mode", "plan"]),
      }),
    );
  });

  it("defaults answer-bearing optional provider commands to the 30-minute provider-turn deadline", async () => {
    const agyRunner: ProviderCommandRunner = vi.fn(async (invocation) => {
      const logIndex = invocation.args.indexOf("--log-file");
      const logPath = invocation.args[logIndex + 1];
      if (logPath === undefined) throw new Error("missing log path");
      await writeFile(logPath, "Created conversation 3cbfa155-fc5f-4c6e-aa99-3a44d48262b4\n");
      return { stdout: "done", stderr: "", exitCode: 0 };
    });
    const cursorRunner: ProviderCommandRunner = vi.fn(async () => ({
      stdout: `${JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "cursor-session", result: "done" })}\n`,
      stderr: "",
      exitCode: 0,
    }));

    await createAgyCliBoundary({ executable: "/trusted/agy", cwd: "/workspace", runner: agyRunner })
      .spawn({ model: "Gemini 3.5 Flash (High)", prompt: "review" });
    await createCursorCliBoundary({ executable: "/trusted/cursor", cwd: "/workspace", runner: cursorRunner })
      .spawn({ model: "cursor-grok-4.5-high", prompt: "review" });

    expect(agyRunner).toHaveBeenCalledWith(expect.objectContaining({
      timeoutMs: 30 * 60_000,
      args: expect.arrayContaining(["--print-timeout", "1800s"]),
    }));
    expect(cursorRunner).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 30 * 60_000 }));
  });

  it("uses the admitted cwd for each Cursor action and normalises provider output", async () => {
    const runner: ProviderCommandRunner = vi.fn(async () => ({
      stdout: [
        { type: "system", subtype: "init", session_id: "cursor-session-1" },
        { type: "user", message: {}, session_id: "cursor-session-1" },
        { type: "thinking", subtype: "completed", session_id: "cursor-session-1" },
        { type: "assistant", message: {}, session_id: "cursor-session-1" },
        {
          type: "result",
          subtype: "success",
          is_error: false,
          session_id: "cursor-session-1",
          result: "done",
          resumeReference: "forged",
          arbitrary: "drop-me",
        },
      ].map((record) => JSON.stringify(record)).join("\n"),
      stderr: "",
      exitCode: 0,
    }));
    const boundary = createCursorCliBoundary({ executable: "/trusted/cursor", cwd: "/fallback", runner });

    await expect(boundary.spawn({
      cwd: "/admitted/cursor-project",
      model: "cursor-grok-4.5-high",
      prompt: "review",
      mode: "plan",
    })).resolves.toEqual({
      resumeReference: "cursor-session-1",
      result: "done",
      providerRecordCount: 5,
    });
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({
      cwd: "/admitted/cursor-project",
      args: expect.arrayContaining(["--mode", "ask"]),
    }));
  });

  it.each([
    {
      name: "malformed middle line",
      stdout: `${JSON.stringify({ type: "system" })}\nnot-json\n${JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "session-1", result: "done" })}\n`,
    },
    {
      name: "unknown record type",
      stdout: `${JSON.stringify({ type: "telemetry" })}\n${JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "session-1", result: "done" })}\n`,
    },
    {
      name: "missing terminal result",
      stdout: `${JSON.stringify({ type: "assistant", session_id: "session-1", result: "done" })}\n`,
    },
    {
      name: "error terminal",
      stdout: `${JSON.stringify({ type: "result", subtype: "error", is_error: true, session_id: "session-1", result: "failed" })}\n`,
    },
    {
      name: "terminal without session id",
      stdout: `${JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "done" })}\n`,
    },
    {
      name: "terminal without textual result",
      stdout: `${JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "session-1" })}\n`,
    },
  ])("rejects Cursor output with $name", async ({ stdout }) => {
    const boundary = createCursorCliBoundary({
      executable: "/trusted/cursor",
      cwd: "/workspace",
      runner: async () => ({ stdout, stderr: "", exitCode: 0 }),
    });

    await expect(boundary.spawn({ model: "composer-2.5", prompt: "review" }))
      .rejects.toMatchObject({ code: "PROVIDER_RESPONSE_INVALID" });
  });

  it("rejects Cursor session substitution while resuming", async () => {
    const boundary = createCursorCliBoundary({
      executable: "/trusted/cursor",
      cwd: "/workspace",
      runner: async () => ({
        stdout: `${JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "substituted", result: "done" })}\n`,
        stderr: "",
        exitCode: 0,
      }),
    });
    await expect(boundary.sendTurn({
      resumeReference: "admitted-session",
      model: "composer-2.5",
      prompt: "continue",
    })).rejects.toMatchObject({ code: "PROVIDER_RESPONSE_INVALID" });
  });

  it("rejects leading-dash values before optional provider argv construction", () => {
    expect(() => buildAgyInvocation({
      executable: "/trusted/agy", model: "--unsafe", prompt: "review", mode: "plan",
    })).toThrow(/leading dash/u);
    expect(() => buildCursorInvocation({
      executable: "/trusted/cursor", model: "cursor-grok-4.5-high", prompt: "--unsafe", mode: "plan",
    })).toThrow(/leading dash/u);
    expect(() => buildCursorInvocation({
      executable: "/trusted/cursor", model: "cursor-grok-4.5-high", prompt: "review", mode: "plan", resumeReference: "--unsafe",
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

  it("removes Agy's private invocation log after a timed-out command", async () => {
    let logPath: string | undefined;
    const boundary = createAgyCliBoundary({
      executable: "/trusted/agy",
      cwd: "/workspace",
      timeoutMs: 20,
      runner: async (invocation) => {
        const logIndex = invocation.args.indexOf("--log-file");
        logPath = invocation.args[logIndex + 1];
        throw new ProviderAdapterError("PROVIDER_TIMEOUT", "provider CLI exceeded 20ms");
      },
    });

    await expect(boundary.spawn({ model: "Gemini 3.5 Flash (High)", prompt: "review" }))
      .rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
    if (logPath === undefined) throw new Error("provider runner did not receive the private log path");
    await expect(stat(logPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not forward ambient provider API keys to subscription-authenticated CLIs", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-secret-canary");
    vi.stubEnv("GOOGLE_API_KEY", "google-secret-canary");
    vi.stubEnv("CURSOR_API_KEY", "cursor-secret-canary");
    vi.stubEnv("XAI_API_KEY", "xai-secret-canary");
    const result = await runBoundedProviderCommand({
      executable: process.execPath,
      args: ["-e", "process.stdout.write(JSON.stringify({gemini:process.env.GEMINI_API_KEY,google:process.env.GOOGLE_API_KEY,cursor:process.env.CURSOR_API_KEY,xai:process.env.XAI_API_KEY}))"],
      timeoutMs: 1000,
    });

    expect(result.stdout).toBe("{}");
  });
});
