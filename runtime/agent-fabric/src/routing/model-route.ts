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

export async function resolveModelRouteReceipt(input: {
  routerPath: string;
  receiptPath: string;
  request: {
    adapter: string;
    alias: string;
    role: string;
    leadFamily: string;
    requireDistinct: boolean;
  };
}): Promise<{
  receipt: Record<string, unknown>;
  invocation: { executable: string; arguments: string[] };
}> {
  const argumentsList = [
    "resolve",
    "--adapter",
    input.request.adapter,
    "--alias",
    input.request.alias,
    "--role",
    input.request.role,
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
  if (!isRecord(parsed) || parsed.schema_version !== 1 || typeof parsed.status !== "string") {
    throw new TypeError("model router returned an invalid receipt");
  }
  await writeFile(input.receiptPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  if (parsed.status !== "ok") throw new ModelRouteRejectedError(parsed, invocation);
  return { receipt: parsed, invocation };
}
