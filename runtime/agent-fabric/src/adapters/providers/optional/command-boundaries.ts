import { spawn } from "node:child_process";

import type { ProviderBoundary } from "../adapter.js";
import { isRecord, ProviderAdapterError, requiredString } from "../types.js";
import { buildAgyInvocation, buildCursorInvocation, type ProviderInvocation } from "./invocations.js";

export type ProviderCommandResult = { stdout: string; stderr: string; exitCode: number };
export type ProviderCommandRunner = (invocation: ProviderInvocation) => Promise<ProviderCommandResult>;

const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_CAPTURE_BYTES = 1_048_576;

function appendBounded(current: string, chunk: Buffer | string, stream: string): string {
  const next = `${current}${chunk.toString()}`;
  if (Buffer.byteLength(next) > MAX_CAPTURE_BYTES) {
    throw new ProviderAdapterError("PROVIDER_OUTPUT_LIMIT", `${stream} exceeded ${String(MAX_CAPTURE_BYTES)} bytes`);
  }
  return next;
}

export const runBoundedProviderCommand: ProviderCommandRunner = async (invocation) => {
  const timeoutMs = invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ProviderAdapterError("INVALID_PARAMS", "provider command timeout must be positive");
  }
  return await new Promise<ProviderCommandResult>((resolve, reject) => {
    const child = spawn(invocation.executable, invocation.args, {
      ...(invocation.cwd === undefined ? {} : { cwd: invocation.cwd }),
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        ...(invocation.environment ?? {}),
      },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error: Error | undefined, result?: ProviderCommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error !== undefined) reject(error);
      else if (result !== undefined) resolve(result);
    };
    const failCapture = (error: unknown): void => {
      child.kill("SIGKILL");
      finish(error instanceof Error ? error : new Error(String(error)));
    };
    child.stdout.on("data", (chunk: Buffer) => {
      try {
        stdout = appendBounded(stdout, chunk, "provider stdout");
      } catch (error: unknown) {
        failCapture(error);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      try {
        stderr = appendBounded(stderr, chunk, "provider stderr");
      } catch (error: unknown) {
        failCapture(error);
      }
    });
    child.once("error", (cause) => {
      finish(new ProviderAdapterError("PROVIDER_SPAWN_FAILED", `provider CLI failed to start: ${cause.message}`, {}, { cause }));
    });
    child.once("close", (code) => {
      const exitCode = code ?? -1;
      if (exitCode !== 0) {
        finish(
          new ProviderAdapterError("PROVIDER_EXIT_NONZERO", `provider CLI exited ${String(exitCode)}`, {
            exitCode,
            stderr: stderr.slice(-4096),
          }),
        );
        return;
      }
      finish(undefined, { stdout, stderr, exitCode });
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new ProviderAdapterError("PROVIDER_TIMEOUT", `provider CLI exceeded ${String(timeoutMs)}ms`, { timeoutMs }));
    }, timeoutMs);
    if (invocation.stdin === undefined) child.stdin.end();
    else child.stdin.end(invocation.stdin);
  });
};

function outputRecords(stdout: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  for (const line of stdout.split(/\r?\n/u).filter((item) => item.trim().length > 0)) {
    try {
      const value: unknown = JSON.parse(line);
      if (isRecord(value)) records.push(value);
    } catch {
      // Agy may produce plain text. Its compatibility pin remains unresolved;
      // callers cannot activate this boundary without a verified output shape.
    }
  }
  return records;
}

function resumeReference(records: Record<string, unknown>[]): string | undefined {
  for (const record of records.toReversed()) {
    for (const key of ["conversationId", "conversation_id", "chatId", "chat_id", "sessionId", "session_id"]) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  return undefined;
}

function commandResult(result: ProviderCommandResult): Record<string, unknown> {
  const records = outputRecords(result.stdout);
  const reference = resumeReference(records);
  if (reference === undefined) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "provider output did not contain a verified resumable session reference",
    );
  }
  const terminal = records.at(-1);
  return {
    resumeReference: reference,
    ...(terminal ?? { result: result.stdout }),
  };
}

type OneShotBoundaryOptions = {
  executable: string;
  cwd: string;
  timeoutMs?: number;
  runner?: ProviderCommandRunner;
};

export function createAgyCliBoundary(options: OneShotBoundaryOptions): ProviderBoundary {
  const runner = options.runner ?? runBoundedProviderCommand;
  const execute = async (payload: Record<string, unknown>, resume?: string): Promise<Record<string, unknown>> => {
    const result = await runner(
      buildAgyInvocation({
        executable: options.executable,
        cwd: options.cwd,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        model: requiredString(payload.model, "model"),
        prompt: requiredString(payload.prompt, "prompt"),
        mode: payload.mode === "accept-edits" ? "accept-edits" : "plan",
        ...(resume === undefined ? {} : { resumeReference: resume }),
      }),
    );
    return commandResult(result);
  };
  return {
    async status() {
      return { configured: true, executable: options.executable, protocolVerified: false };
    },
    async spawn(payload) {
      return await execute(payload);
    },
    async attach({ resumeReference, payload }) {
      return await execute(payload, resumeReference);
    },
    async sendTurn(payload) {
      return await execute(payload, requiredString(payload.resumeReference, "resumeReference"));
    },
    async interrupt() {
      throw new ProviderAdapterError("CAPABILITY_UNAVAILABLE", "Agy headless mode has no verified remote interrupt");
    },
    async release() {
      return { released: true, deleted: false };
    },
  };
}

export function createCursorCliBoundary(options: OneShotBoundaryOptions): ProviderBoundary {
  const runner = options.runner ?? runBoundedProviderCommand;
  const execute = async (payload: Record<string, unknown>, resume?: string): Promise<Record<string, unknown>> => {
    const result = await runner(
      buildCursorInvocation({
        executable: options.executable,
        cwd: options.cwd,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        model: requiredString(payload.model, "model"),
        prompt: requiredString(payload.prompt, "prompt"),
        mode: payload.mode === "ask" ? "ask" : "plan",
        ...(resume === undefined ? {} : { resumeReference: resume }),
      }),
    );
    return commandResult(result);
  };
  return {
    async status() {
      return { configured: true, executable: options.executable, protocolVerified: false };
    },
    async spawn(payload) {
      return await execute(payload);
    },
    async attach({ resumeReference, payload }) {
      return await execute(payload, resumeReference);
    },
    async sendTurn(payload) {
      return await execute(payload, requiredString(payload.resumeReference, "resumeReference"));
    },
    async interrupt() {
      throw new ProviderAdapterError("CAPABILITY_UNAVAILABLE", "Cursor print mode has no verified remote interrupt");
    },
    async release() {
      return { released: true, deleted: false };
    },
  };
}
