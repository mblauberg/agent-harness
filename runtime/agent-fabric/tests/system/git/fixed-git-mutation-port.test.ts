import { describe, expect, it, vi } from "vitest";

import { GIT_OPERATION_VARIANTS, type OperatorGitIntent } from "@local/agent-fabric-protocol";

import { FixedGitMutationPort } from "../../../src/operator/fixed-git-mutation-port.ts";

describe("fixed Git mutation port", () => {
  it.each(GIT_OPERATION_VARIANTS)("fails closed for %s before claiming point-of-use authority", async (variant) => {
    const pointOfUse = vi.fn();
    const port = new FixedGitMutationPort({ privateStateRoot: "/unobserved/private-state" });
    const intent = { operation: { variant } } as OperatorGitIntent;

    await expect(port.dispatch(intent, { remoteTarget: null }, pointOfUse)).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
    });
    expect(pointOfUse).not.toHaveBeenCalled();
  });
});
