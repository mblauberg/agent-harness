import type { Readable, Writable } from "node:stream";

import { BoundedNdjsonReader, BoundedNdjsonWriter, FABRIC_PROTOCOL_LIMITS } from "../../transport/bounded-ndjson.js";
import { isRecord, ProviderAdapterError, type AdapterRequestHandler } from "./types.js";
import { FabricError } from "../../errors.js";

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
  if (error instanceof FabricError) return { code: error.code, message: error.message };
  return {
    code: "ADAPTER_INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "adapter operation failed",
  };
}

export async function serveAdapter(
  adapter: AdapterRequestHandler,
  streams: { input: Readable; output: Writable },
): Promise<void> {
  const writer = new BoundedNdjsonWriter(streams.output, {
    maximumFrameBytes: FABRIC_PROTOCOL_LIMITS.maximumFrameBytes,
    maximumPendingWrites: FABRIC_PROTOCOL_LIMITS.maximumAdapterInFlight,
  });
  const pending = new Set<Promise<void>>();
  let inFlight = 0;
  const track = (work: Promise<void>): void => {
    pending.add(work);
    void work.then(
      () => pending.delete(work),
      () => pending.delete(work),
    );
  };
  const reader = new BoundedNdjsonReader(streams.input, {
    maximumFrameBytes: FABRIC_PROTOCOL_LIMITS.maximumFrameBytes,
    onError: (error) => {
      track(writer.write({
        id: "invalid",
        error: errorEnvelope(new ProviderAdapterError(
          "PROTOCOL_INVALID",
          error.message,
          { protocolCode: error.code },
        )),
      }));
    },
    onFrame: (line) => {
      let request: AdapterRequest;
      try {
        const parsed: unknown = JSON.parse(line);
        request = requestEnvelope(parsed);
      } catch (error: unknown) {
        track(writer.write({ id: "invalid", error: errorEnvelope(error) }));
        return;
      }
      if (inFlight >= FABRIC_PROTOCOL_LIMITS.maximumAdapterInFlight) {
        track(writer.write({
          id: request.id,
          error: {
            code: "ADAPTER_OVERLOADED",
            message: `adapter permits ${String(FABRIC_PROTOCOL_LIMITS.maximumAdapterInFlight)} in-flight requests`,
          },
        }));
        return;
      }
      inFlight += 1;
      const work = (async (): Promise<void> => {
        try {
          const result = await adapter.request(request.method, request.params);
          await writer.write({ id: request.id, result });
        } catch (error: unknown) {
          await writer.write({ id: request.id, error: errorEnvelope(error) });
        } finally {
          inFlight -= 1;
        }
      })();
      track(work);
    },
  });
  await reader.closed;
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
