import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProviderBoundary } from "../adapter.js";
import { DEFAULT_PROVIDER_TURN_TIMEOUT_MS } from "../../provider-deadlines.js";
import { isRecord, ProviderAdapterError, requiredString } from "../types.js";
import { buildAgyInvocation, buildCursorInvocation, type ProviderInvocation } from "./invocations.js";

export type ProviderCommandResult = { stdout: string; stderr: string; exitCode: number };
export type ProviderCommandRunner = (invocation: ProviderInvocation) => Promise<ProviderCommandResult>;

const MAX_CAPTURE_BYTES = 1_048_576;

function appendBounded(current: string, chunk: Buffer | string, stream: string): string {
  const next = `${current}${chunk.toString()}`;
  if (Buffer.byteLength(next) > MAX_CAPTURE_BYTES) {
    throw new ProviderAdapterError("PROVIDER_OUTPUT_LIMIT", `${stream} exceeded ${String(MAX_CAPTURE_BYTES)} bytes`);
  }
  return next;
}

export const runBoundedProviderCommand: ProviderCommandRunner = async (invocation) => {
  const timeoutMs = invocation.timeoutMs ?? DEFAULT_PROVIDER_TURN_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ProviderAdapterError("INVALID_PARAMS", "provider command timeout must be positive");
  }
  return await new Promise<ProviderCommandResult>((resolve, reject) => {
    const child = spawn(invocation.executable, invocation.args, {
      ...(invocation.cwd === undefined ? {} : { cwd: invocation.cwd }),
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
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

function agyCommandResult(result: ProviderCommandResult, fallbackReference?: string): Record<string, unknown> {
  const output = result.stdout.trim();
  if (output.length === 0) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "Agy CLI exited successfully without answer output; verify subscription model access and headless print compatibility",
      { exitCode: result.exitCode, stderr: result.stderr.slice(-4096) },
    );
  }
  if (fallbackReference === undefined) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "Agy private invocation log did not contain a verified resumable session reference",
    );
  }
  return {
    resumeReference: fallbackReference,
    result: output,
    providerRecordCount: 0,
  };
}

const CURSOR_RECORD_TYPES = new Set(["system", "user", "thinking", "assistant", "result"]);
const CURSOR_SAFE_RECORD_FIELDS = new Set(["is_error", "message", "result", "session_id", "subtype", "type"]);

function cursorCommandResult(result: ProviderCommandResult): Record<string, unknown> {
  const records: Record<string, unknown>[] = [];
  const lines = result.stdout.split(/\r?\n/u).filter((item) => item.trim().length > 0);
  for (const [recordIndex, line] of lines.entries()) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error: unknown) {
      throw new ProviderAdapterError(
        "PROVIDER_RESPONSE_INVALID",
        "Cursor stream contained malformed JSON",
        {},
        { cause: error },
      );
    }
    if (!isRecord(value) || typeof value.type !== "string" || !CURSOR_RECORD_TYPES.has(value.type)) {
      const recordType = isRecord(value) && typeof value.type === "string" ? value.type : "";
      throw new ProviderAdapterError(
        "PROVIDER_RESPONSE_INVALID",
        "Cursor stream contained an unsupported record type",
        {
          recordIndex,
          recordTypeSha256: createHash("sha256").update(recordType).digest("hex"),
          recordTypeLength: Buffer.byteLength(recordType),
          recordFields: isRecord(value)
            ? Object.keys(value)
              .filter((field) => CURSOR_SAFE_RECORD_FIELDS.has(field))
              .sort()
            : [],
        },
      );
    }
    records.push(value);
  }
  const terminal = records.at(-1);
  if (
    terminal?.type !== "result" ||
    terminal.subtype !== "success" ||
    terminal.is_error !== false ||
    typeof terminal.session_id !== "string" ||
    terminal.session_id.length === 0 ||
    typeof terminal.result !== "string" ||
    terminal.result.length === 0
  ) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "Cursor stream did not end with a validated successful result",
    );
  }
  return {
    resumeReference: terminal.session_id,
    result: terminal.result,
    providerRecordCount: records.length,
  };
}

type OneShotBoundaryOptions = {
  executable: string;
  cwd: string;
  timeoutMs?: number;
  runner?: ProviderCommandRunner;
  verifyExecutable?: () => Promise<unknown>;
};

function assertTaskBoundOneShot(payload: Record<string, unknown>): void {
  if (typeof payload.taskId === "string" && payload.maxTurns !== 1) {
    throw new ProviderAdapterError(
      "INVALID_PARAMS",
      "task-bound answer-bearing spawn requires maxTurns=1",
    );
  }
}

export function createAgyCliBoundary(options: OneShotBoundaryOptions): ProviderBoundary {
  const runner = options.runner ?? runBoundedProviderCommand;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TURN_TIMEOUT_MS;
  const execute = async (payload: Record<string, unknown>, resume?: string): Promise<Record<string, unknown>> => {
    const logDirectory = await mkdtemp(join(tmpdir(), "agent-fabric-agy-"));
    const logFile = join(logDirectory, "provider.log");
    try {
      await options.verifyExecutable?.();
      const result = await runner(
        buildAgyInvocation({
          executable: options.executable,
          cwd: typeof payload.cwd === "string" ? payload.cwd : options.cwd,
          timeoutMs,
          model: requiredString(payload.model, "model"),
          prompt: requiredString(payload.prompt, "prompt"),
          mode: "plan",
          logFile,
          ...(resume === undefined ? {} : { resumeReference: resume }),
        }),
      );
      let loggedReference: string | undefined;
      if (resume === undefined) {
        try {
          const log = await readFile(logFile, "utf8");
          loggedReference = /\bCreated conversation ([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/iu.exec(log)?.[1];
        } catch (error: unknown) {
          if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error;
        }
      }
      return agyCommandResult(result, resume ?? loggedReference);
    } finally {
      await rm(logDirectory, { recursive: true, force: true });
    }
  };
  return {
    async status({ resumeReference }) {
      return resumeReference === undefined
        ? { healthy: true, configured: true, executable: options.executable }
        : { healthy: false, matches: false, resumeReference, reason: "headless conversation cannot be verified after wrapper restart" };
    },
    async spawn(payload) {
      assertTaskBoundOneShot(payload);
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TURN_TIMEOUT_MS;
  const execute = async (payload: Record<string, unknown>, resume?: string): Promise<Record<string, unknown>> => {
    await options.verifyExecutable?.();
    const result = await runner(
      buildCursorInvocation({
        executable: options.executable,
        cwd: typeof payload.cwd === "string" ? payload.cwd : options.cwd,
        timeoutMs,
        model: requiredString(payload.model, "model"),
        prompt: requiredString(payload.prompt, "prompt"),
        mode: "ask",
        ...(resume === undefined ? {} : { resumeReference: resume }),
      }),
    );
    const normalised = cursorCommandResult(result);
    if (resume !== undefined && normalised.resumeReference !== resume) {
      throw new ProviderAdapterError("PROVIDER_RESPONSE_INVALID", "Cursor returned a different resumed session reference");
    }
    return normalised;
  };
  return {
    async status({ resumeReference }) {
      return resumeReference === undefined
        ? { healthy: true, configured: true, executable: options.executable }
        : { healthy: false, matches: false, resumeReference, reason: "headless session cannot be verified after wrapper restart" };
    },
    async spawn(payload) {
      assertTaskBoundOneShot(payload);
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
