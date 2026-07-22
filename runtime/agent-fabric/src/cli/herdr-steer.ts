import { readFile } from "node:fs/promises";

import {
  HERDR_STEER_DISPATCH_REQUEST_CODEC,
  type HerdrSteerDispatchRequest,
} from "@local/agent-fabric-protocol";

export const HERDR_STEER_USAGE = "usage: agent-fabric herdr steer --check | agent-fabric herdr steer TARGET --fire-and-forget --action-id ID --pane-ref PANE --task-ref TASK --expected-revision N [--message-ref MESSAGE] [--prompt TEXT | --prompt-file PATH]";

type HerdrSteerCheckDependencies = Readonly<{
  resolveCapability(): Promise<string>;
  checkIntegration(capability: string): Promise<void>;
}>;

type HerdrSteerCheckResult =
  | Readonly<{ status: "ready"; integration: "herdr-control-v1" }>
  | Readonly<{ status: "unavailable"; integration: "herdr-control-v1"; reason: string }>;

const registryVariables = [
  "AGENT_FABRIC_STATE_DIRECTORY",
  "AGENT_FABRIC_SEAT",
  "AGENT_FABRIC_CLIENT_LABEL",
] as const;
const registryClientLabels = new Set(["agy", "claude", "codex", "cursor", "kiro", "opencode"]);

function checkFailureReason(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return error instanceof Error ? error.message : "unknown failure";
}

export function herdrUnavailableReason(error: unknown): string {
  return `daemon connection check failed: ${checkFailureReason(error)}`;
}

export async function checkHerdrSteer(
  environment: NodeJS.ProcessEnv,
  dependencies: HerdrSteerCheckDependencies,
): Promise<HerdrSteerCheckResult> {
  for (const variable of registryVariables) {
    if (environment[variable] === undefined || environment[variable] === "") {
      return { status: "unavailable", integration: "herdr-control-v1", reason: `missing environment variable ${variable}` };
    }
  }
  if (!registryClientLabels.has(environment.AGENT_FABRIC_CLIENT_LABEL ?? "")) {
    return { status: "unavailable", integration: "herdr-control-v1", reason: "invalid AGENT_FABRIC_CLIENT_LABEL" };
  }
  let capability: string;
  try {
    capability = await dependencies.resolveCapability();
  } catch (error: unknown) {
    return {
      status: "unavailable",
      integration: "herdr-control-v1",
      reason: `capability check failed: ${checkFailureReason(error)}`,
    };
  }
  try {
    await dependencies.checkIntegration(capability);
  } catch (error: unknown) {
    return {
      status: "unavailable",
      integration: "herdr-control-v1",
      reason: `integration check failed: ${checkFailureReason(error)}`,
    };
  }
  return { status: "ready", integration: "herdr-control-v1" };
}

type ParseDependencies = Readonly<{
  readPromptFile(path: string): Promise<string>;
  readStdin(): Promise<string>;
}>;

const defaults: ParseDependencies = {
  readPromptFile: async (path) => await readFile(path, "utf8"),
  readStdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  },
};

export async function parseHerdrSteerArguments(
  arguments_: readonly string[],
  dependencies: ParseDependencies = defaults,
): Promise<HerdrSteerDispatchRequest> {
  const targetAgentId = arguments_[0];
  if (targetAgentId === undefined || targetAgentId.startsWith("--")) throw new Error(HERDR_STEER_USAGE);
  let fireAndForget = false;
  let actionId: string | undefined;
  let paneRef: string | undefined;
  let taskId: string | undefined;
  let messageId: string | undefined;
  let expectedRevision: number | undefined;
  let prompt: string | undefined;
  let promptFile: string | undefined;

  for (let index = 1; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--fire-and-forget") {
      fireAndForget = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    index += 1;
    switch (argument) {
      case "--action-id": actionId = once(actionId, value, argument); break;
      case "--pane-ref": paneRef = once(paneRef, value, argument); break;
      case "--task-ref": taskId = once(taskId, value, argument); break;
      case "--message-ref": messageId = once(messageId, value, argument); break;
      case "--expected-revision": {
        if (expectedRevision !== undefined || !/^[1-9][0-9]*$/u.test(value)) {
          throw new Error("--expected-revision requires one positive integer");
        }
        expectedRevision = Number(value);
        break;
      }
      case "--prompt": prompt = once(prompt, value, argument); break;
      case "--prompt-file": promptFile = once(promptFile, value, argument); break;
      default: throw new Error(`unknown argument: ${argument}`);
    }
  }

  if (!fireAndForget) throw new Error("Herdr steering requires --fire-and-forget; use Fabric request/reply for answer-bearing work");
  if (actionId === undefined) throw new Error("Herdr steering requires --action-id for exact replay");
  if (paneRef === undefined) throw new Error("Herdr steering requires --pane-ref bound to the target Fabric agent");
  if (taskId === undefined || expectedRevision === undefined) {
    throw new Error("Herdr steering requires --task-ref and --expected-revision");
  }
  if (prompt !== undefined && promptFile !== undefined) throw new Error("choose exactly one of --prompt or --prompt-file");
  const promptText = prompt ?? (promptFile === undefined
    ? await dependencies.readStdin()
    : await dependencies.readPromptFile(promptFile));
  return HERDR_STEER_DISPATCH_REQUEST_CODEC.parse({
    actionId,
    fireAndForget: true,
    targetAgentId,
    paneRef,
    reference: messageId === undefined
      ? { kind: "task", taskId, expectedRevision }
      : { kind: "message", taskId, messageId, expectedRevision },
    prompt: promptText,
  }, "herdrSteer");
}

function once(current: string | undefined, value: string, option: string): string {
  if (current !== undefined) throw new Error(`${option} may be provided only once`);
  return value;
}
