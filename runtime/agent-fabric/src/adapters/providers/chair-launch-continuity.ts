import { TimedNdjsonTransport } from "../../transport/ndjson-rpc.js";
import {
  isRecord,
  ProviderAdapterError,
  type ChairLaunchProviderResult,
} from "./types.js";

export type ChairLaunchContinuityProbeInput = {
  capability: string;
  socketPath: string;
  resumeReference: string;
  providerSessionGeneration: number;
  providerContractDigest: string;
};

export type ChairLaunchContinuityProbe = (
  input: ChairLaunchContinuityProbeInput,
) => Promise<ChairLaunchProviderResult>;

export type ChairLaunchContinuityProbeDependencies = {
  connect(input: { socketPath: string; capability: string }): Promise<{
    call(method: string, params: Record<string, unknown>): Promise<unknown>;
    close(): Promise<void>;
  }>;
};

const defaultDependencies: ChairLaunchContinuityProbeDependencies = {
  async connect(input) {
    return await TimedNdjsonTransport.connect({
      ...input,
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 5_000,
    });
  },
};

function continuityResult(input: ChairLaunchContinuityProbeInput): ChairLaunchProviderResult {
  return {
    resumeReference: input.resumeReference,
    providerSessionGeneration: input.providerSessionGeneration,
    fabricContinuity: {
      schemaVersion: 1,
      kind: "authenticated-fabric-continuity",
      providerContractDigest: input.providerContractDigest,
      providerSessionRef: input.resumeReference,
      providerSessionGeneration: input.providerSessionGeneration,
      authenticated: true,
    },
  };
}

function validMailboxState(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    typeof value.contiguousWatermark === "number" &&
    Number.isSafeInteger(value.contiguousWatermark) &&
    value.contiguousWatermark >= 0 &&
    Array.isArray(value.acknowledgedAboveWatermark) &&
    value.acknowledgedAboveWatermark.every(
      (sequence) => typeof sequence === "number" && Number.isSafeInteger(sequence) && sequence > 0,
    )
  );
}

export async function probeChairLaunchFabricContinuity(
  input: ChairLaunchContinuityProbeInput,
  dependencies: ChairLaunchContinuityProbeDependencies = defaultDependencies,
): Promise<ChairLaunchProviderResult> {
  const transport = await dependencies.connect({
    socketPath: input.socketPath,
    capability: input.capability,
  });
  try {
    const mailbox = await transport.call("getMailboxState", {});
    if (!validMailboxState(mailbox)) {
      throw new ProviderAdapterError(
        "CHAIR_CONTINUITY_UNPROVEN",
        "Fabric continuity probe returned an invalid mailbox state",
      );
    }
    return continuityResult(input);
  } finally {
    await transport.close();
  }
}

export function chairLaunchContinuityUnproven(
  input: Omit<ChairLaunchContinuityProbeInput, "capability" | "socketPath">,
): ProviderAdapterError {
  return new ProviderAdapterError(
    "CHAIR_CONTINUITY_UNPROVEN",
    "chair bootstrap did not prove authenticated Fabric continuity",
    {
      kind: "continuity-unproven",
      providerContractDigest: input.providerContractDigest,
      resumeReference: input.resumeReference,
      providerSessionGeneration: input.providerSessionGeneration,
    },
  );
}
