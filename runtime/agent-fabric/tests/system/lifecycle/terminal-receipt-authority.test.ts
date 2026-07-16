import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { LifecycleAdmittedRunScope, LifecycleDigest } from "../../../src/lifecycle/receipt-authority.ts";
import { recoverTerminalAuthorityReceipt } from "../../../src/lifecycle/terminal-receipt-authority.ts";
import { canonicalJson } from "../../../src/project-session/store-support.ts";
import { TestLifecycleReceiptAuthority } from "../../support/lifecycle-receipt-authority-fake.ts";

function digest(domain: string, value: unknown): LifecycleDigest {
  return `sha256:${createHash("sha256")
    .update(`agent-fabric.lifecycle.v1\0${domain}\0${canonicalJson(value)}`)
    .digest("hex")}`;
}

describe("terminal receipt authority recovery", () => {
  it("recovers a lost generation-loss append response without duplicate application on restart retry", async () => {
    const authority = new TestLifecycleReceiptAuthority();
    const scope: LifecycleAdmittedRunScope = {
      schemaVersion: 1,
      projectId: "project-generation-loss-terminal",
      projectSessionId: "session-generation-loss-terminal",
      runId: "run-generation-loss-terminal",
      authorityId: authority.authorityId,
      admissionDigest: digest("admission", { runId: "run-generation-loss-terminal" }),
      admittedAt: 10,
    };
    await authority.admitScope(scope);
    const retirementOwnerRef = {
      kind: "recovery-retirement",
      retirementRef: {
        schemaVersion: 1,
        runId: scope.runId,
        agentId: "agent-generation-loss-terminal",
        retirementId: "retirement-before-generation-loss",
        revisionDec: "1",
      },
      sourceRefDigest: digest("recovery-retirement-source", { runId: scope.runId }),
    };
    const retirementSubject = {
      schemaVersion: 1,
      kind: "custody-recovery-retirement",
      projectSessionId: scope.projectSessionId,
      runId: scope.runId,
      agentId: "agent-generation-loss-terminal",
      ownerRef: retirementOwnerRef,
    };
    await authority.appendReceipt(
      digest("receipt-intent", retirementSubject),
      retirementSubject,
    );
    const generationLossRef = {
      schemaVersion: 1,
      runId: scope.runId,
      agentId: "agent-generation-loss-terminal",
      generationLossId: "loss-generation-loss-terminal",
      generationLossRevision: 2,
    };
    const ownerRef = {
      kind: "generation-loss",
      generationLossRef,
      sourceRefDigest: digest("generation-loss-semantic", { generationLossRef }),
    };
    const subject = {
      schemaVersion: 1,
      kind: "generation-loss-terminal",
      projectSessionId: scope.projectSessionId,
      runId: scope.runId,
      agentId: "agent-generation-loss-terminal",
      ownerRef,
      fromState: "open",
      terminalState: "abandoned",
      abandonKind: "direct-open",
      recoveryActionRef: null,
    };
    const subjectDigest = digest("receipt-subject", subject);
    const intent = {
      schemaVersion: 1,
      batchId: "batch-generation-loss-terminal",
      ordinalDec: "1",
      kind: "generation-loss-terminal",
      subjectDigest,
      transitionReplayDigest: digest("transition-replay", subject),
    };
    const prepared = {
      projectSessionId: scope.projectSessionId,
      runId: scope.runId,
      agentId: subject.agentId,
      finalRevision: 2,
      ownerRefDigest: digest("receipt-owner-ref", ownerRef),
      subject,
      subjectJson: canonicalJson(subject),
      subjectDigest,
      intentDigest: digest("receipt-intent", intent),
      review: null,
    };

    authority.appendSuccessThenThrowOnce = true;
    const recovered = await recoverTerminalAuthorityReceipt(authority, prepared);
    expect(recovered.record.subject).toEqual(subject);
    expect(recovered.checkpoint.receiptCount).toBe(2);
    expect(authority).toMatchObject({ appendCalls: 2, appendThrowCount: 1 });

    const afterRestart = await recoverTerminalAuthorityReceipt(authority, prepared);
    expect(afterRestart.record.receipt.receiptDigest).toBe(recovered.record.receipt.receiptDigest);
    expect(afterRestart.checkpoint.checkpointDigest).toBe(recovered.checkpoint.checkpointDigest);
    expect(authority.appendCalls).toBe(2);
  });
});
