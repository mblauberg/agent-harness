import { DEFAULT_PROVIDER_TURN_TIMEOUT_MS } from "../../provider-deadlines.js";

export type ProviderInvocation = {
  executable: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  environment?: Record<string, string>;
  stdin?: string;
};

function optionalFields(input: { cwd?: string; timeoutMs?: number }): Pick<ProviderInvocation, "cwd" | "timeoutMs"> {
  return {
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  };
}

function safeCliValue(value: string, field: string): string {
  if (value.startsWith("-")) throw new TypeError(`${field} must not begin with a leading dash`);
  return value;
}

export function buildPiRpcLaunch(input: {
  executable: string;
  cwd?: string;
  timeoutMs?: number;
}): ProviderInvocation {
  return { executable: input.executable, args: ["--mode", "rpc"], ...optionalFields(input) };
}

export function buildAgyInvocation(input: {
  executable: string;
  cwd?: string;
  timeoutMs?: number;
  model: string;
  prompt: string;
  mode: "plan" | "accept-edits";
  resumeReference?: string;
  logFile?: string;
}): ProviderInvocation {
  const model = safeCliValue(input.model, "model");
  const prompt = safeCliValue(input.prompt, "prompt");
  const resumeReference = input.resumeReference === undefined
    ? undefined
    : safeCliValue(input.resumeReference, "resumeReference");
  const seconds = Math.max(1, Math.ceil((input.timeoutMs ?? DEFAULT_PROVIDER_TURN_TIMEOUT_MS) / 1000));
  return {
    executable: input.executable,
    args: [
      "--sandbox",
      ...(input.logFile === undefined ? [] : ["--log-file", input.logFile]),
      "--mode",
      input.mode,
      "--model",
      model,
      ...(resumeReference === undefined ? [] : ["--conversation", resumeReference]),
      "--print-timeout",
      `${String(seconds)}s`,
      "--print",
      prompt,
    ],
    ...optionalFields(input),
  };
}

export function buildCursorInvocation(input: {
  executable: string;
  cwd?: string;
  timeoutMs?: number;
  model: string;
  prompt: string;
  mode: "plan" | "ask";
  resumeReference?: string;
}): ProviderInvocation {
  const model = safeCliValue(input.model, "model");
  const prompt = safeCliValue(input.prompt, "prompt");
  const resumeReference = input.resumeReference === undefined
    ? undefined
    : safeCliValue(input.resumeReference, "resumeReference");
  return {
    executable: input.executable,
    args: [
      "--print",
      "--output-format",
      "stream-json",
      "--sandbox",
      "enabled",
      "--trust",
      "--mode",
      input.mode,
      "--model",
      model,
      ...(input.cwd === undefined ? [] : ["--workspace", input.cwd]),
      ...(resumeReference === undefined ? [] : ["--resume", resumeReference]),
      prompt,
    ],
    ...optionalFields(input),
  };
}

export function buildKiroAcpInvocation(input: {
  executable: string;
  model: string;
  agentEngine: "v2";
  cwd?: string;
  timeoutMs?: number;
}): ProviderInvocation {
  const model = safeCliValue(input.model, "model");
  return {
    executable: input.executable,
    args: ["acp", "--agent-engine", input.agentEngine, "--model", model],
    ...optionalFields(input),
  };
}
