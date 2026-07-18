import { spawn } from "node:child_process";

import { FabricError } from "../errors.js";

type ProbeResult = { stdout: string; stderr: string; exitCode: number };
export type ProviderProbeRunner = (input: {
  executable: string;
  args: string[];
  stdin?: string;
  closeOnFirstLine?: boolean;
  timeoutMs: number;
}) => Promise<ProbeResult>;

const MAX_OUTPUT = 1024 * 1024;
const PROBE_TIMEOUT_MS = 15_000;

const runProbe: ProviderProbeRunner = async (input) => await new Promise((resolve, reject) => {
  const child = spawn(input.executable, input.args, {
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
      ...(process.env.CODEX_HOME === undefined ? {} : { CODEX_HOME: process.env.CODEX_HOME }),
    },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let settled = false;
  const finish = (error?: Error, result?: ProbeResult): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error !== undefined) reject(error);
    else if (result !== undefined) resolve(result);
  };
  const append = (current: string, chunk: Buffer): string => {
    const next = current + chunk.toString();
    if (Buffer.byteLength(next) > MAX_OUTPUT) throw new Error("provider interface probe exceeded output limit");
    return next;
  };
  child.stdout.on("data", (chunk: Buffer) => {
    try {
      stdout = append(stdout, chunk);
      if (input.closeOnFirstLine === true && stdout.includes("\n")) {
        child.kill("SIGTERM");
        finish(undefined, { stdout, stderr, exitCode: 0 });
      }
    } catch (error: unknown) { child.kill("SIGKILL"); finish(error as Error); }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    try { stderr = append(stderr, chunk); } catch (error: unknown) { child.kill("SIGKILL"); finish(error as Error); }
  });
  child.once("error", (error) => finish(error));
  child.once("close", (code) => finish(undefined, { stdout, stderr, exitCode: code ?? -1 }));
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    finish(new Error("provider interface probe timed out"));
  }, input.timeoutMs);
  if (input.closeOnFirstLine === true) child.stdin.write(input.stdin);
  else child.stdin.end(input.stdin);
});

const REQUIRED_FLAGS: Record<string, string[]> = {
  "claude-agent-sdk": ["--print", "--output-format"],
  agy: ["--print", "--model", "--mode", "--log-file"],
  "cursor-agent": ["--print", "--output-format", "--model"],
};

function hasExactOption(helpText: string, option: string): boolean {
  const escaped = option.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[\\s,|])${escaped}(?=$|[\\s,|=])`, "mu").test(helpText);
}

/** Runs only bounded version/help or initialize operations; never a model turn. */
export async function probeProviderInterface(
  input: { adapterId: string; executable: string },
  runner: ProviderProbeRunner = runProbe,
): Promise<{ adapterId: string; conformant: true; probe: string; version: string }> {
  try {
    if (input.adapterId === "codex-app-server") {
      const request = `${JSON.stringify({
        id: 1,
        method: "initialize",
        params: { clientInfo: { name: "agent-fabric-probe", version: "1" }, capabilities: {} },
      })}\n`;
      const result = await runner({ executable: input.executable, args: ["app-server"], stdin: request, closeOnFirstLine: true, timeoutMs: PROBE_TIMEOUT_MS });
      const line = result.stdout.split(/\r?\n/u).find((item) => item.trim().length > 0);
      const response: unknown = line === undefined ? undefined : JSON.parse(line);
      const initialized = typeof response === "object" && response !== null ? Reflect.get(response, "result") : undefined;
      if (result.exitCode !== 0 || typeof response !== "object" || response === null || Reflect.get(response, "id") !== 1 ||
          typeof initialized !== "object" || initialized === null) {
        throw new Error("Codex initialize response is invalid");
      }
      const userAgent = Reflect.get(initialized, "userAgent");
      return { adapterId: input.adapterId, conformant: true, probe: "app-server-initialize", version: typeof userAgent === "string" ? userAgent : "observed-via-initialize" };
    }
    if (input.adapterId === "kiro-acp") {
      const request = `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: 1,
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
          clientInfo: { name: "agent-fabric-probe", version: "1" },
        },
      })}\n`;
      const [result, help] = await Promise.all([
        runner({ executable: input.executable, args: ["acp", "--agent-engine", "v2"], stdin: request, closeOnFirstLine: true, timeoutMs: PROBE_TIMEOUT_MS }),
        runner({ executable: input.executable, args: ["acp", "--help"], timeoutMs: PROBE_TIMEOUT_MS }),
      ]);
      const line = result.stdout.split(/\r?\n/u).find((item) => item.trim().length > 0);
      const response: unknown = line === undefined ? undefined : JSON.parse(line);
      const negotiated = typeof response === "object" && response !== null ? Reflect.get(response, "result") : undefined;
      if (typeof negotiated !== "object" || negotiated === null || Reflect.get(negotiated, "protocolVersion") !== 1 ||
          help.exitCode !== 0 || !hasExactOption(`${help.stdout}\n${help.stderr}`, "--effort")) {
        throw new Error("Kiro ACP v1 initialize response is invalid");
      }
      const agentInfo = Reflect.get(negotiated, "agentInfo");
      const version = typeof agentInfo === "object" && agentInfo !== null && typeof Reflect.get(agentInfo, "version") === "string"
        ? Reflect.get(agentInfo, "version") as string
        : "observed-via-initialize";
      return { adapterId: input.adapterId, conformant: true, probe: "acp-v1-initialize", version };
    }
    const flags = REQUIRED_FLAGS[input.adapterId];
    if (flags === undefined) throw new Error(`no interface probe is defined for ${input.adapterId}`);
    const [help, version] = await Promise.all([
      runner({ executable: input.executable, args: ["--help"], timeoutMs: PROBE_TIMEOUT_MS }),
      runner({ executable: input.executable, args: ["--version"], timeoutMs: PROBE_TIMEOUT_MS }),
    ]);
    const helpText = `${help.stdout}\n${help.stderr}`;
    if (help.exitCode !== 0 || version.exitCode !== 0 || flags.some((flag) => !hasExactOption(helpText, flag))) {
      throw new Error("required headless flags are unavailable");
    }
    return {
      adapterId: input.adapterId,
      conformant: true,
      probe: "bounded-help-version",
      version: `${version.stdout}\n${version.stderr}`.trim(),
    };
  } catch (error: unknown) {
    throw new FabricError("ADAPTER_INTERFACE_MISMATCH", `provider non-answer interface probe failed: ${input.adapterId}`, { cause: error });
  }
}
