import { timingSafeEqual } from "node:crypto";

import { TimedNdjsonTransport } from "../../transport/ndjson-rpc.js";
import {
  CHAIR_ATTESTATION_METHOD,
  CHAIR_BRIDGE_CONTRACT,
  chairLaunchAttestationDigest,
  chairLaunchChallengeDigest,
  isRecord,
  ProviderAdapterError,
  type ChairLaunchAttestationBinding,
  type ChairLaunchProviderResult,
} from "./types.js";

export type ChairLaunchFabricBridgeInput = ChairLaunchAttestationBinding & {
  capability: string;
  socketPath: string;
  attestationChallenge: string;
};

export type ChairLaunchFabricBridgeDependencies = {
  connect(input: { socketPath: string; capability: string }): Promise<{
    call(method: string, params: Record<string, unknown>): Promise<unknown>;
    close(): Promise<void>;
  }>;
};

const defaultDependencies: ChairLaunchFabricBridgeDependencies = {
  async connect(input) {
    return await TimedNdjsonTransport.connect({
      ...input,
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 5_000,
    });
  },
};

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

function boundedNativeRef(value: string): boolean {
  return value.length > 0 && Buffer.byteLength(value, "utf8") <= 512;
}

export type ChairLaunchProviderInvocation = {
  providerSessionRef: string;
  providerSessionGeneration: number;
  providerTurnRef: string;
  providerInvocationRef: string;
  challengeResponse: string;
};

export class ChairLaunchFabricBridge {
  readonly challengeToolName: string;
  readonly challengeDigest: string;
  readonly #challenge: Buffer;
  readonly #binding: ChairLaunchAttestationBinding;
  readonly #transport: Awaited<ReturnType<ChairLaunchFabricBridgeDependencies["connect"]>>;
  #session: { providerSessionRef: string; providerSessionGeneration: number } | undefined;
  #providerTurnRef: string | undefined;
  #invocationRef: string | undefined;
  #invoked = false;
  #closed = false;

  constructor(
    input: ChairLaunchFabricBridgeInput,
    transport: Awaited<ReturnType<ChairLaunchFabricBridgeDependencies["connect"]>>,
  ) {
    if (!/^[0-9a-f]{64}$/u.test(input.attestationChallenge)) {
      throw new ProviderAdapterError("CHAIR_CONTINUITY_UNPROVEN", "chair attestation challenge must contain 32 random bytes");
    }
    if (chairLaunchChallengeDigest(input.attestationChallenge) !== input.challengeDigest) {
      throw new ProviderAdapterError("CHAIR_CONTINUITY_UNPROVEN", "chair attestation challenge does not match launch custody");
    }
    this.#binding = {
      providerAdapterId: input.providerAdapterId,
      providerActionId: input.providerActionId,
      providerContractDigest: input.providerContractDigest,
      challengeDigest: input.challengeDigest,
    };
    this.#transport = transport;
    this.#challenge = Buffer.from(input.attestationChallenge, "hex");
    this.challengeToolName = "fabric_attest_continuity";
    this.challengeDigest = input.challengeDigest;
  }

  get challengeResponse(): string {
    return this.#challenge.toString("hex");
  }

  get closed(): boolean {
    return this.#closed;
  }

  bindProviderSession(providerSessionRef: string, providerSessionGeneration: number): void {
    if (!boundedNativeRef(providerSessionRef) || !Number.isSafeInteger(providerSessionGeneration) || providerSessionGeneration <= 0) {
      throw new ProviderAdapterError("CHAIR_CONTINUITY_UNPROVEN", "chair provider session binding is invalid");
    }
    if (
      this.#session !== undefined &&
      (this.#session.providerSessionRef !== providerSessionRef ||
        this.#session.providerSessionGeneration !== providerSessionGeneration)
    ) {
      throw new ProviderAdapterError("CHAIR_CONTINUITY_UNPROVEN", "chair bridge cannot be rebound to another provider session");
    }
    this.#session = { providerSessionRef, providerSessionGeneration };
  }

  async attest(invocation: ChairLaunchProviderInvocation): Promise<void> {
    if (this.#closed) throw continuityError("chair bridge is closed");
    if (this.#invoked) {
      throw new ProviderAdapterError("CHAIR_ATTESTATION_REPLAY", "chair attestation challenge was already invoked");
    }
    if (
      this.#session === undefined ||
      invocation.providerSessionRef !== this.#session.providerSessionRef ||
      invocation.providerSessionGeneration !== this.#session.providerSessionGeneration ||
      !boundedNativeRef(invocation.providerTurnRef) ||
      !boundedNativeRef(invocation.providerInvocationRef) ||
      typeof invocation.challengeResponse !== "string"
    ) {
      throw continuityError("chair attestation invocation is not attributable to the bound provider session");
    }
    let response: Buffer;
    try {
      response = Buffer.from(invocation.challengeResponse, "hex");
    } catch {
      throw continuityError("chair attestation challenge response is invalid");
    }
    if (response.byteLength !== this.#challenge.byteLength || !timingSafeEqual(response, this.#challenge)) {
      throw continuityError("chair attestation challenge response does not match");
    }
    this.#invoked = true;
    const mailbox = await this.#transport.call("getMailboxState", {});
    if (!validMailboxState(mailbox)) throw continuityError("Fabric bridge returned an invalid mailbox state");
    this.#providerTurnRef = invocation.providerTurnRef;
    this.#invocationRef = invocation.providerInvocationRef;
  }

  async call(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.#closed) throw continuityError("chair bridge is closed");
    return await this.#transport.call(method, params);
  }

  async result(): Promise<ChairLaunchProviderResult> {
    if (
      this.#closed ||
      this.#session === undefined ||
      this.#providerTurnRef === undefined ||
      this.#invocationRef === undefined
    ) {
      throw continuityError("provider session did not originate the Fabric attestation");
    }
    const unsigned = {
      schemaVersion: 1 as const,
      kind: "provider-session-fabric-attestation" as const,
      method: CHAIR_ATTESTATION_METHOD,
      bridgeContract: CHAIR_BRIDGE_CONTRACT,
      ...this.#binding,
      ...this.#session,
      providerTurnRef: this.#providerTurnRef,
      challengeResponse: this.challengeResponse,
      providerInvocationRef: this.#invocationRef,
    };
    return {
      resumeReference: this.#session.providerSessionRef,
      providerSessionGeneration: this.#session.providerSessionGeneration,
      fabricContinuity: {
        ...unsigned,
        attestationDigest: chairLaunchAttestationDigest(unsigned),
      },
    };
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#transport.close();
  }
}

function continuityError(message: string): ProviderAdapterError {
  return new ProviderAdapterError("CHAIR_CONTINUITY_UNPROVEN", message);
}

export async function createChairLaunchFabricBridge(
  input: ChairLaunchFabricBridgeInput,
  dependencies: ChairLaunchFabricBridgeDependencies = defaultDependencies,
): Promise<ChairLaunchFabricBridge> {
  const transport = await dependencies.connect({
    socketPath: input.socketPath,
    capability: input.capability,
  });
  try {
    return new ChairLaunchFabricBridge(input, transport);
  } catch (error: unknown) {
    await transport.close();
    throw error;
  }
}

export function chairLaunchContinuityUnproven(
  input: {
    providerContractDigest: string;
    resumeReference: string;
    providerSessionGeneration: number;
  },
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
