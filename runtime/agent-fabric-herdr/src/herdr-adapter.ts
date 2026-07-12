import { createHash } from "node:crypto";

import { parseJsonValue } from "@local/agent-fabric-protocol";
import type { JsonValue, ProviderActionId, Sha256Digest } from "@local/agent-fabric-protocol";

import type {
  FabricAgentIdentity,
  FabricActionJournalPort,
  HerdrActionRecord,
  HerdrControlPort,
  HerdrEffectReceipt,
  HerdrIntent,
  HerdrPresencePort,
  IdentityReconciliation,
} from "./contracts.js";
import { reconcileIdentity } from "./identity-reconciliation.js";

export type HerdrAdapterDependencies = {
  journal: FabricActionJournalPort;
  control: HerdrControlPort;
  presence: HerdrPresencePort;
};

/** Thin orchestration over Fabric-owned action state and Herdr-owned external effects. */
export class HerdrAdapter {
  readonly #journal: FabricActionJournalPort;
  readonly #control: HerdrControlPort;
  readonly #presence: HerdrPresencePort;

  constructor(dependencies: HerdrAdapterDependencies) {
    this.#journal = dependencies.journal;
    this.#control = dependencies.control;
    this.#presence = dependencies.presence;
  }

  async reconcilePresence(identity: FabricAgentIdentity): Promise<IdentityReconciliation> {
    const observation = await this.#presence.observeAgent(identity.agentId);
    return reconcileIdentity(identity, observation);
  }

  async execute(actionId: ProviderActionId, intent: HerdrIntent): Promise<HerdrActionRecord> {
    const record = await this.#journal.readAction(actionId);
    if (record === null) {
      throw new TypeError(`Herdr action ${actionId} is not committed in Fabric`);
    }
    const intentDigest = digestHerdrIntent(intent);
    if (record.intentDigest !== intentDigest) {
      throw new TypeError(`Herdr action ${actionId} intent does not match its committed digest`);
    }
    assertHerdrIntentBounds(intent);
    return this.#continue(actionId, intent, record);
  }

  async #continue(
    actionId: ProviderActionId,
    intent: HerdrIntent,
    record: HerdrActionRecord,
  ): Promise<HerdrActionRecord> {
    if (record.status === "terminal") return record;

    if (record.status === "dispatched" || record.status === "ambiguous") {
      return this.#reconcileWithoutReplay(actionId, intent, record);
    }

    const dispatched = await this.#journal.markDispatched(actionId, record.revision);
    if (dispatched.status !== "dispatched") {
      return this.#continue(actionId, intent, dispatched);
    }

    let receipt: HerdrEffectReceipt;
    try {
      receipt = await dispatchTypedEffect(this.#control, actionId, intent);
      assertReceiptMatchesIntent(receipt, intent);
    } catch (error: unknown) {
      return this.#reconcileAfterFailure(actionId, intent, dispatched, error);
    }
    return this.#journal.completeAction(actionId, dispatched.revision, receipt);
  }

  async #reconcileAfterFailure(
    actionId: ProviderActionId,
    intent: HerdrIntent,
    dispatched: HerdrActionRecord,
    dispatchError: unknown,
  ): Promise<HerdrActionRecord> {
    let lookup: Awaited<ReturnType<HerdrControlPort["lookupAction"]>>;
    try {
      lookup = await this.#control.lookupAction(actionId);
    } catch (lookupError: unknown) {
      return this.#journal.markAmbiguous(
        actionId,
        dispatched.revision,
        `${describeAmbiguity(dispatchError)}; lookup failed: ${describeFailure(lookupError)}`,
      );
    }
    if (lookup.status === "observed") {
      try {
        assertReceiptMatchesIntent(lookup.receipt, intent);
      } catch (receiptError: unknown) {
        return this.#journal.markAmbiguous(
          actionId,
          dispatched.revision,
          describeFailure(receiptError),
        );
      }
      return this.#journal.completeAction(actionId, dispatched.revision, lookup.receipt);
    }
    const reason = lookup.status === "absent"
      ? "Herdr effect lookup reported absent; automatic replay is forbidden"
      : "Herdr effect outcome is unknown; automatic replay is forbidden";
    return this.#journal.markAmbiguous(actionId, dispatched.revision, reason);
  }

  async #reconcileWithoutReplay(
    actionId: ProviderActionId,
    intent: HerdrIntent,
    record: HerdrActionRecord,
  ): Promise<HerdrActionRecord> {
    const lookup = await this.#control.lookupAction(actionId);
    if (lookup.status === "observed") {
      try {
        assertReceiptMatchesIntent(lookup.receipt, intent);
      } catch (error: unknown) {
        if (record.status === "ambiguous") return record;
        return this.#journal.markAmbiguous(actionId, record.revision, describeFailure(error));
      }
      return this.#journal.completeAction(actionId, record.revision, lookup.receipt);
    }
    if (record.status === "ambiguous") return record;
    const reason = lookup.status === "absent"
      ? "Herdr effect lookup reported absent; automatic replay is forbidden"
      : "Herdr effect outcome is unknown; automatic replay is forbidden";
    return this.#journal.markAmbiguous(actionId, record.revision, reason);
  }
}

export function digestHerdrIntent(intent: HerdrIntent): Sha256Digest {
  const canonical = JSON.stringify(canonicalise(parseJsonValue(intent, "herdrIntent")));
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}` as Sha256Digest;
}

export const HERDR_INTENT_LIMITS = Object.freeze({
  paneReferenceBytes: 128,
  identityLabelBytes: 128,
  taskLabelBytes: 512,
  attentionTitleBytes: 512,
  notificationTitleBytes: 256,
  notificationBodyBytes: 1_024,
  maximumArrangedPanes: 16,
  directSteerPromptBytes: 4_096,
});

export function assertHerdrIntentBounds(intent: HerdrIntent): void {
  switch (intent.kind) {
    case "console.ensure-pane":
      return;
    case "agent.ensure-pane":
      boundedText(intent.identity.provider, "agent.ensure-pane.identity.provider", HERDR_INTENT_LIMITS.identityLabelBytes);
      boundedText(intent.identity.modelFamily, "agent.ensure-pane.identity.modelFamily", HERDR_INTENT_LIMITS.identityLabelBytes);
      positiveGeneration(
        intent.identity.providerSessionGeneration,
        "agent.ensure-pane.identity.providerSessionGeneration",
      );
      return;
    case "panes.arrange":
      if (intent.paneRefs.length > HERDR_INTENT_LIMITS.maximumArrangedPanes) {
        throw new TypeError(`panes.arrange.paneRefs must contain at most ${HERDR_INTENT_LIMITS.maximumArrangedPanes} panes`);
      }
      for (const [index, paneRef] of intent.paneRefs.entries()) {
        boundedText(paneRef, `panes.arrange.paneRefs[${index}]`, HERDR_INTENT_LIMITS.paneReferenceBytes);
      }
      return;
    case "agent.project-metadata":
      boundedText(intent.paneRef, "agent.project-metadata.paneRef", HERDR_INTENT_LIMITS.paneReferenceBytes);
      boundedText(intent.metadata.provider, "agent.project-metadata.provider", HERDR_INTENT_LIMITS.identityLabelBytes);
      boundedText(intent.metadata.modelFamily, "agent.project-metadata.modelFamily", HERDR_INTENT_LIMITS.identityLabelBytes);
      boundedText(intent.metadata.taskLabel, "agent.project-metadata.taskLabel", HERDR_INTENT_LIMITS.taskLabelBytes, true);
      boundedText(intent.metadata.lifecycle, "agent.project-metadata.lifecycle", HERDR_INTENT_LIMITS.identityLabelBytes);
      return;
    case "attention.project":
      boundedText(intent.itemId, "attention.project.itemId", HERDR_INTENT_LIMITS.identityLabelBytes);
      revision(intent.revision, "attention.project.revision");
      boundedText(intent.title, "attention.project.title", HERDR_INTENT_LIMITS.attentionTitleBytes);
      return;
    case "target.focus":
      if (intent.target.kind === "agent-pane") {
        boundedText(intent.target.paneRef, "target.focus.paneRef", HERDR_INTENT_LIMITS.paneReferenceBytes);
      } else {
        boundedText(intent.target.itemId, "target.focus.itemId", HERDR_INTENT_LIMITS.identityLabelBytes);
        revision(intent.target.revision, "target.focus.revision");
      }
      return;
    case "agent.wake":
      boundedText(intent.paneRef, "agent.wake.paneRef", HERDR_INTENT_LIMITS.paneReferenceBytes);
      return;
    case "notification.show":
      boundedText(intent.attentionItemId, "notification.show.attentionItemId", HERDR_INTENT_LIMITS.identityLabelBytes);
      revision(intent.attentionRevision, "notification.show.attentionRevision");
      boundedText(intent.title, "notification.show.title", HERDR_INTENT_LIMITS.notificationTitleBytes);
      boundedText(intent.body, "notification.show.body", HERDR_INTENT_LIMITS.notificationBodyBytes);
      if (intent.focusTarget !== null) {
        boundedText(intent.focusTarget.itemId, "notification.show.focusTarget.itemId", HERDR_INTENT_LIMITS.identityLabelBytes);
        revision(intent.focusTarget.revision, "notification.show.focusTarget.revision");
      }
      return;
    case "steer.inject-fire-and-forget":
      boundedText(intent.paneRef, "steer.inject-fire-and-forget.paneRef", HERDR_INTENT_LIMITS.paneReferenceBytes);
      boundedText(intent.prompt, "steer.inject-fire-and-forget.prompt", HERDR_INTENT_LIMITS.directSteerPromptBytes);
      revision(intent.reference.expectedRevision, "steer.inject-fire-and-forget.reference.expectedRevision");
  }
}

function canonicalise(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map((entry) => canonicalise(entry));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonicalise(entry)]),
    );
  }
  return value;
}

function boundedText(value: string, path: string, maximumBytes: number, allowEmpty = false): void {
  const bytes = Buffer.byteLength(value, "utf8");
  if ((!allowEmpty && bytes === 0) || bytes > maximumBytes) {
    throw new TypeError(`${path} must contain ${allowEmpty ? "0" : "1"}-${maximumBytes} UTF-8 bytes`);
  }
}

function revision(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${path} must be a non-negative safe integer`);
  }
}

function positiveGeneration(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${path} must be a positive safe integer`);
  }
}

function dispatchTypedEffect(
  control: HerdrControlPort,
  actionId: ProviderActionId,
  intent: HerdrIntent,
): Promise<HerdrEffectReceipt> {
  switch (intent.kind) {
    case "console.ensure-pane": return control.ensureConsolePane(actionId, intent);
    case "agent.ensure-pane": return control.ensureAgentPane(actionId, intent);
    case "panes.arrange": return control.arrangePanes(actionId, intent);
    case "agent.project-metadata": return control.projectAgentMetadata(actionId, intent);
    case "attention.project": return control.projectAttention(actionId, intent);
    case "target.focus": return control.focusTarget(actionId, intent);
    case "agent.wake": return control.wakeAgent(actionId, intent);
    case "notification.show": return control.showNotification(actionId, intent);
    case "steer.inject-fire-and-forget": return dispatchDirectSteer(control, actionId, intent);
    default: return rejectUnknownIntent(intent);
  }
}

function assertReceiptMatchesIntent(receipt: HerdrEffectReceipt, intent: HerdrIntent): void {
  if (intent.kind === "steer.inject-fire-and-forget") {
    if (
      receipt.status !== "dispatched-unconfirmed" ||
      receipt.operation !== intent.kind ||
      receipt.deliveryEvidence !== "none" ||
      receipt.canSatisfyExpectedResult ||
      receipt.canCloseBarrier
    ) {
      throw new TypeError("Herdr direct-steer receipt cannot claim delivery, result or barrier completion");
    }
    return;
  }
  if (receipt.status !== "applied" || receipt.operation !== intent.kind) {
    throw new TypeError(`Herdr receipt operation does not match ${intent.kind}`);
  }
}

function rejectUnknownIntent(intent: never): Promise<never> {
  return Promise.reject(new TypeError(`unknown Herdr intent: ${String((intent as { kind?: unknown }).kind)}`));
}

async function dispatchDirectSteer(
  control: HerdrControlPort,
  actionId: ProviderActionId,
  intent: Extract<HerdrIntent, { kind: "steer.inject-fire-and-forget" }>,
): Promise<HerdrEffectReceipt> {
  await control.injectDirectSteer(actionId, intent);
  return {
    status: "dispatched-unconfirmed",
    operation: "steer.inject-fire-and-forget",
    referenceValidation: "verified",
    deliveryEvidence: "none",
    canSatisfyExpectedResult: false,
    canCloseBarrier: false,
  };
}

function describeAmbiguity(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return `Herdr effect may have occurred: ${error.message.slice(0, 512)}`;
  }
  return "Herdr effect may have occurred: unclassified control-port failure";
}

function describeFailure(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message.slice(0, 256);
  return "unclassified failure";
}
