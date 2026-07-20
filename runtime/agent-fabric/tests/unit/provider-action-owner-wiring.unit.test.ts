import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../src/${relative}`, import.meta.url)), "utf8");
}

describe("provider-action owner boundary wiring", () => {
  const core = source("core/fabric.ts");

  it.each([
    ["deferred enqueue", /#enqueueDeferredProviderAction[\s\S]{0,700}assertProviderActionOwner/],
    ["deferred claim", /#claimDeferredProviderAction[\s\S]{0,500}assertProviderActionOwner/],
    ["deferred completion", /#completeAdapterOperation[\s\S]{0,700}assertProviderActionOwner/],
    ["dispatch re-entry", /#dispatchProviderAction[\s\S]{0,900}assertProviderActionOwner/],
    ["reconciliation", /#reconcileProviderAction[\s\S]{0,700}assertProviderActionOwner/],
    ["terminal persistence", /#persistProviderAction[\s\S]{0,450}assertProviderActionOwner/],
  ] as const)("routes %s through the canonical assertion", (_boundary, pattern) => {
    expect(core).toMatch(pattern);
  });

  it("classifies startup rows and admits only generic rows to generic recovery", () => {
    expect(core).toMatch(/const owner = classifyProviderActionOwner[\s\S]{0,300}return owner === "generic"/);
    expect(core).toMatch(/#recoverCertifyingReviewProviderActions[\s\S]{0,1800}"certifying_review"/);
  });

  it.each([
    ["launch", source("project-session/launch-custody.ts"), '}, "launch");'],
    ["provider_agent", source("project-session/launch-custody.ts"), '}, "provider_agent");'],
    ["lifecycle", core, '}, "lifecycle");'],
    ["herdr", source("integrations/herdr-fabric-ports.ts"), '}, "herdr");'],
    ["chair_recovery", source("project-session/launch-custody.ts"), '}, "chair_recovery");'],
    ["chair_live_handoff", source("project-session/launch-custody.ts"), '}, "chair_live_handoff");'],
    ["operator_control", source("operator/production-action-ports.ts"), '}, "operator_control");'],
    ["certifying_review", core, '"certifying_review",'],
  ] as const)("routes %s recovery through the canonical assertion", (_owner, contents, assertion) => {
    expect(contents).toContain(assertion);
  });
});
