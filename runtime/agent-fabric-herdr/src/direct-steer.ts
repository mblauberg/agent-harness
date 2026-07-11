import type {
  DirectSteerIntent,
  DirectSteerRequest,
  FabricDirectSteerPort,
  HerdrActionRecord,
} from "./contracts.js";
import type { HerdrAdapter } from "./herdr-adapter.js";
import { digestHerdrIntent } from "./herdr-adapter.js";

export type DirectSteerRejectionCode =
  | "explicit-fire-and-forget-required"
  | "invalid-prompt"
  | "unknown-reference"
  | "stale-reference"
  | "scope-mismatch"
  | "target-mismatch"
  | "answer-bearing-reference"
  | "acknowledgement-required"
  | "completion-barrier-bound"
  | "fabric-action-mismatch";

export class DirectSteerRejectedError extends TypeError {
  readonly code: DirectSteerRejectionCode;

  constructor(code: DirectSteerRejectionCode, message: string) {
    super(message);
    this.name = "DirectSteerRejectedError";
    this.code = code;
  }
}

export type DirectSteerDependencies = {
  fabric: FabricDirectSteerPort;
  adapter: HerdrAdapter;
};

/** Fabric-validates and commits a one-way steering action before any pane injection. */
export class DirectSteerService {
  readonly #fabric: FabricDirectSteerPort;
  readonly #adapter: HerdrAdapter;

  constructor(dependencies: DirectSteerDependencies) {
    this.#fabric = dependencies.fabric;
    this.#adapter = dependencies.adapter;
  }

  async dispatch(request: DirectSteerRequest): Promise<HerdrActionRecord> {
    assertDirectSteerRequest(request);
    const validation = await this.#fabric.validateSteerReference(request.reference);
    if (validation.status === "rejected") {
      throw new DirectSteerRejectedError(validation.code, validation.reason);
    }
    if (validation.targetAgentId !== request.targetAgentId) {
      throw new DirectSteerRejectedError(
        "target-mismatch",
        "the validated Fabric reference is bound to a different target agent",
      );
    }
    if (validation.purpose !== "steer" || validation.expectsResult) {
      throw new DirectSteerRejectedError(
        "answer-bearing-reference",
        "direct Herdr injection is reserved for steering with no expected answer",
      );
    }
    if (validation.requiresAck) {
      throw new DirectSteerRejectedError(
        "acknowledgement-required",
        "direct Herdr injection cannot satisfy an acknowledgement obligation",
      );
    }
    if (validation.dependentBarrierId !== null) {
      throw new DirectSteerRejectedError(
        "completion-barrier-bound",
        "direct Herdr injection cannot satisfy or close a completion barrier",
      );
    }

    const intent: DirectSteerIntent = {
      kind: "steer.inject-fire-and-forget",
      targetAgentId: request.targetAgentId,
      paneRef: request.paneRef,
      reference: request.reference,
      validatedReferenceDigest: validation.referenceDigest,
      prompt: request.prompt,
    };
    const prepared = await this.#fabric.prepareDirectSteerAction(request.actionId, intent);
    if (
      prepared.actionId !== request.actionId ||
      prepared.intentDigest !== digestHerdrIntent(intent)
    ) {
      throw new DirectSteerRejectedError(
        "fabric-action-mismatch",
        "Fabric returned an action record that does not match the validated steering intent",
      );
    }
    return this.#adapter.execute(request.actionId, intent);
  }
}

function assertDirectSteerRequest(request: DirectSteerRequest): void {
  if (!request.fireAndForget) {
    throw new DirectSteerRejectedError(
      "explicit-fire-and-forget-required",
      "direct Herdr steering requires explicit fire-and-forget acknowledgement",
    );
  }
  if (
    request.prompt.length === 0 ||
    Buffer.byteLength(request.prompt, "utf8") > 4_096 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u009b]/u.test(request.prompt)
  ) {
    throw new DirectSteerRejectedError(
      "invalid-prompt",
      "direct Herdr steering requires 1-4096 bytes of terminal-neutral text",
    );
  }
}
