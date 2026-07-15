import { FABRIC_OPERATIONS } from "@local/agent-fabric-protocol";
import { describe, expect, it } from "vitest";

import type { FabricClient } from "../../../src/core/client.ts";
import { dispatchAgentProtocol } from "../../../src/daemon/agent-protocol-dispatch.ts";

describe("public provider-action result projection", () => {
  it("projects the canonical non-review action identity and never exposes an answer for a non-spawn", async () => {
    const secret = "afc_secret_provider_output_must_not_escape";
    const client = {
      async dispatchProviderAction() {
        return {
          actionId: "action-1",
          status: "terminal",
          history: ["prepared", "terminal"],
          executionCount: 1,
          effectCount: 1,
          result: { z: 2, credential: secret, nested: { b: true, a: 1 } },
          providerAnswer: "bounded review answer",
        };
      },
    } as unknown as FabricClient;

    const projected = await dispatchAgentProtocol(client, FABRIC_OPERATIONS.dispatchProviderAction, {
      adapterId: "fake",
      actionId: "action-1",
      operation: "steer",
      certifyingReview: null,
      payload: { instruction: "bounded" },
      commandId: "command-1",
    });

    expect(projected).toStrictEqual({
      kind: "non-review",
      actionRef: { adapterId: "fake", actionId: "action-1" },
      status: "terminal",
      history: ["prepared", "terminal"],
      executionCount: 1,
      effectCount: 1,
      resultDigest: "sha256:bbfc12f874f5c4b41578fc1e37fc4dee81888983788d49560593eb5116f332eb",
    });
    expect(JSON.stringify(projected)).not.toContain(secret);
  });
});
