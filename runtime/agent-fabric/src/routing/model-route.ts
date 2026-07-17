import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

class ModelRouteRejectedError extends Error {
  readonly code = "MODEL_ROUTE_REJECTED";

  constructor(
    readonly receipt: Record<string, unknown>,
    readonly invocation: { executable: string; arguments: string[] },
  ) {
    super(`model route rejected: ${String(receipt.status)}`);
    this.name = "ModelRouteRejectedError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ModelRouteRequest = {
  adapter: string;
  role: string;
  model?: string;
  capabilitiesFile?: string;
  leadFamily: string;
  requireDistinct: boolean;
} & (
  | { alias: string; taskClass?: never; effort?: string }
  | { taskClass: string; alias?: never; effort?: never; capabilitiesFile: string }
);

function nonEmptyString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string" && record[key].length > 0;
}

function isValidReceipt(receipt: Record<string, unknown>, request: ModelRouteRequest): boolean {
  if (
    receipt.schema_version !== 1 || typeof receipt.status !== "string" ||
    receipt.adapter !== request.adapter || receipt.role !== request.role
  ) return false;
  if (request.taskClass !== undefined) {
    if (
      receipt.task_class !== request.taskClass || receipt.route_source !== "task-class" ||
      (receipt.status === "ok" && !nonEmptyString(receipt, "alias"))
    ) {
      return false;
    }
  } else if (receipt.alias !== request.alias || receipt.task_class !== undefined || receipt.route_source !== undefined) {
    return false;
  }
  if (request.effort !== undefined && receipt.requested_effort !== request.effort) return false;
  if (request.model !== undefined && receipt.requested_model !== request.model && receipt.resolved_model !== request.model) {
    return false;
  }
  if (receipt.status !== "ok") return true;
  if (
    !nonEmptyString(receipt, "requested_effort") || typeof receipt.effort !== "string" ||
    !nonEmptyString(receipt, "effort_capability_source") || !nonEmptyString(receipt, "endpoint_provider") ||
    !nonEmptyString(receipt, "model_family") || typeof receipt.resolved_model !== "string" ||
    !nonEmptyString(receipt, "identity_source")
  ) return false;
  if (receipt.model_selection === "account-default") {
    return receipt.resolved_model === "" && nonEmptyString(receipt, "catalog_model");
  }
  return nonEmptyString(receipt, "resolved_model");
}

export async function resolveModelRouteReceipt(input: {
  routerPath: string;
  receiptPath: string;
  request: ModelRouteRequest;
}): Promise<{
  receipt: Record<string, unknown>;
  invocation: { executable: string; arguments: string[] };
}> {
  if ((input.request.alias === undefined) === (input.request.taskClass === undefined)) {
    throw new TypeError("model route requires exactly one of alias or taskClass");
  }
  const argumentsList = [
    "resolve",
    "--adapter",
    input.request.adapter,
    ...(input.request.taskClass === undefined
      ? ["--alias", input.request.alias]
      : ["--task-class", input.request.taskClass]),
    "--role",
    input.request.role,
    ...(input.request.effort === undefined ? [] : ["--effort", input.request.effort]),
    ...(input.request.capabilitiesFile === undefined ? [] : ["--capabilities-file", input.request.capabilitiesFile]),
    ...(input.request.model === undefined ? [] : ["--model", input.request.model]),
    "--lead-family",
    input.request.leadFamily,
    ...(input.request.requireDistinct ? ["--require-distinct"] : []),
  ];
  const invocation = { executable: input.routerPath, arguments: argumentsList };
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(input.routerPath, argumentsList, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }));
  } catch (error: unknown) {
    if (!isRecord(error) || typeof error.stdout !== "string") throw error;
    stdout = error.stdout;
  }
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed) || !isValidReceipt(parsed, input.request)) {
    throw new TypeError("model router returned an invalid receipt");
  }
  await writeFile(input.receiptPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  if (parsed.status !== "ok") throw new ModelRouteRejectedError(parsed, invocation);
  return { receipt: parsed, invocation };
}
