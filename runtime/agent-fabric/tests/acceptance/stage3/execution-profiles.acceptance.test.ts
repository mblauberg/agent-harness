import { describe, expect, it } from "vitest";

import { resolveExecutionProfile } from "../../../src/index.ts";
import { INTERACTIVE_CAPABILITIES, MANAGED_CAPABILITIES } from "../../support/visibility-fixture.ts";

describe("FR-007/NFR-009 Stage 3 named execution profiles", () => {
  it("resolves headless, paired-observed and paired-visible without provider-specific code", () => {
    const capabilities = {
      chair: INTERACTIVE_CAPABILITIES,
      pairedPrimary: MANAGED_CAPABILITIES,
      worker: MANAGED_CAPABILITIES,
    };

    expect(resolveExecutionProfile({ name: "headless", chairInHerdr: false, capabilities })).toMatchObject({
      name: "headless",
      default: {
        controlMode: "managed",
        visibilityMode: "none",
        inboxDeliveryMode: "structured-push",
      },
    });
    expect(resolveExecutionProfile({
      name: "observed",
      chairInHerdr: false,
      capabilities: {
        chair: MANAGED_CAPABILITIES,
        pairedPrimary: MANAGED_CAPABILITIES,
        worker: MANAGED_CAPABILITIES,
      },
    })).toMatchObject({ roles: { worker: { visibilityMode: "event-mirror" } } });
    expect(resolveExecutionProfile({ name: "interactive", chairInHerdr: true, capabilities })).toMatchObject({
      roles: { chair: { controlMode: "attached-interactive" }, worker: { controlMode: "managed" } },
    });
    expect(resolveExecutionProfile({ name: "hybrid", chairInHerdr: true, capabilities })).toMatchObject({
      roles: { chair: { controlMode: "attached-interactive" }, pairedPrimary: { visibilityMode: "event-mirror" } },
    });
    expect(resolveExecutionProfile({ name: "paired-observed", chairInHerdr: true, capabilities })).toMatchObject({
      name: "paired-observed",
      roles: {
        chair: {
          controlMode: "attached-interactive",
          visibilityMode: "provider-tui",
          inboxDeliveryMode: "cooperative-pull",
        },
        pairedPrimary: {
          controlMode: "managed",
          visibilityMode: "event-mirror",
          inboxDeliveryMode: "structured-push",
        },
      },
      herdr: { layout: "side-by-side" },
      degradations: [],
    });

    const visible = resolveExecutionProfile({
      name: "paired-visible",
      chairInHerdr: false,
      capabilities: {
        ...capabilities,
        pairedPrimary: INTERACTIVE_CAPABILITIES,
      },
    });
    expect(visible).toMatchObject({
      roles: {
        chair: { controlMode: "attached-interactive", inboxDeliveryMode: "cooperative-pull" },
        pairedPrimary: { controlMode: "attached-interactive", inboxDeliveryMode: "cooperative-pull" },
        worker: { controlMode: "managed", visibilityMode: "none" },
      },
      degradations: ["visibility-degraded"],
    });
  });

  it("rejects a named profile when an adapter lacks its required control capability", () => {
    expect(() =>
      resolveExecutionProfile({
        name: "paired-observed",
        chairInHerdr: true,
        capabilities: {
          chair: INTERACTIVE_CAPABILITIES,
          pairedPrimary: MANAGED_CAPABILITIES.filter((capability) => capability !== "send_turn"),
          worker: MANAGED_CAPABILITIES,
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "PROFILE_CAPABILITY_UNAVAILABLE", capability: "send_turn" }));
  });
});
