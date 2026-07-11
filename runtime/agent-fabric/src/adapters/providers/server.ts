import type { Readable, Writable } from "node:stream";
import { createInterface } from "node:readline";

import { isRecord, ProviderAdapterError, type AdapterRequestHandler } from "./types.js";

type AdapterRequest = {
  id: string;
  method: string;
  params: Record<string, unknown>;
};

function requestEnvelope(value: unknown): AdapterRequest {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.method !== "string" ||
    !isRecord(value.params)
  ) {
    throw new ProviderAdapterError("PROTOCOL_INVALID", "adapter request envelope is invalid");
  }
  return { id: value.id, method: value.method, params: value.params };
}

function errorEnvelope(error: unknown): { code: string; message: string; details?: Record<string, unknown> } {
  if (error instanceof ProviderAdapterError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  return {
    code: "ADAPTER_INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "adapter operation failed",
  };
}

function write(output: Writable, value: unknown): void {
  output.write(`${JSON.stringify(value)}\n`);
}

export async function serveAdapter(
  adapter: AdapterRequestHandler,
  streams: { input: Readable; output: Writable },
): Promise<void> {
  const lines = createInterface({ input: streams.input, crlfDelay: Infinity });
  const pending = new Set<Promise<void>>();
  lines.on("line", (line) => {
    const work = (async (): Promise<void> => {
      let request: AdapterRequest;
      try {
        const parsed: unknown = JSON.parse(line);
        request = requestEnvelope(parsed);
      } catch (error: unknown) {
        write(streams.output, { id: "invalid", error: errorEnvelope(error) });
        return;
      }
      try {
        const result = await adapter.request(request.method, request.params);
        write(streams.output, { id: request.id, result });
      } catch (error: unknown) {
        write(streams.output, { id: request.id, error: errorEnvelope(error) });
      }
    })();
    pending.add(work);
    void work.finally(() => pending.delete(work));
  });
  await new Promise<void>((resolve) => lines.once("close", resolve));
  await Promise.all(pending);
}

export function journalPathFromArguments(adapterId: string, arguments_: string[]): string {
  const index = arguments_.indexOf("--journal");
  const fromArgument = index === -1 ? undefined : arguments_[index + 1];
  const path = fromArgument ?? process.env.AGENT_FABRIC_ADAPTER_JOURNAL;
  if (path === undefined || path.length === 0) {
    throw new ProviderAdapterError(
      "JOURNAL_PATH_REQUIRED",
      `${adapterId} requires --journal or AGENT_FABRIC_ADAPTER_JOURNAL`,
    );
  }
  return path;
}
