import type { FabricClient } from "../core/fabric.js";
import { FabricError } from "../errors.js";

type AgentId = "chair" | "peer" | string;
type ProviderSession = {
  agentId: string;
  sessionRef: string;
  mode: "managed" | "interactive";
  state: "idle" | "busy" | "lost";
  activeTools: number;
};

type ProviderBoundary = {
  spawnManaged(input: { agentId: string; sessionRef: string }): Promise<ProviderSession>;
  attachInteractive(input: { agentId: string; sessionRef: string }): Promise<ProviderSession>;
  status(agentId: string): ProviderSession;
};

type HerdrBoundary = {
  placeSideBySide(input: Record<string, unknown>): Promise<void>;
  startObserver(input: Record<string, unknown>): Promise<{ paneId: string }>;
  renderActivity(input: Record<string, unknown>): Promise<void>;
  closePane(input: Record<string, unknown>): Promise<void>;
  wakeup(input: Record<string, unknown>): Promise<{ status: "dispatched-unconfirmed" }>;
};

type ClientMap = Record<string, Pick<FabricClient, "receiveMessages" | "acknowledgeDelivery">>;
type VisibilityEvidenceSink = Pick<FabricClient, "recordVisibilityFailure">;
type ActivityEnvelope = {
  envelopeVersion: 1;
  cursor: number;
  agentId: string;
  event: { kind: string; summary: string };
};

type DeliveryRecord = {
  messageId: string;
  agentId: string;
  status: "delivery-pending" | "acknowledged";
  deadline: number;
  deliveryId?: string;
};

export class VisibilityCoordinator {
  readonly #profileName: "paired-observed" | "paired-visible";
  readonly #chairInHerdr: boolean;
  readonly #clients: ClientMap;
  readonly #herdr: HerdrBoundary;
  readonly #provider: ProviderBoundary;
  readonly #clock: () => number;
  readonly #evidenceSink: VisibilityEvidenceSink;
  readonly #panes = new Map<string, string>();
  readonly #events = new Map<string, ActivityEnvelope[]>();
  readonly #renderedCursors = new Map<string, number>();
  readonly #deliveries = new Map<string, DeliveryRecord>();

  constructor(input: {
    profileName: "paired-observed" | "paired-visible";
    chairInHerdr: boolean;
    clients: ClientMap;
    herdr: HerdrBoundary;
    provider: ProviderBoundary;
    clock: () => number;
    evidenceSink: VisibilityEvidenceSink;
  }) {
    this.#profileName = input.profileName;
    this.#chairInHerdr = input.chairInHerdr;
    this.#clients = input.clients;
    this.#herdr = input.herdr;
    this.#provider = input.provider;
    this.#clock = input.clock;
    this.#evidenceSink = input.evidenceSink;
  }

  async startPair(input: {
    chair: { agentId: string; provider: string; sessionRef: string; paneId?: string };
    peer: { agentId: string; provider: string; sessionRef: string; paneId?: string };
  }): Promise<void> {
    await this.#provider.attachInteractive({ agentId: input.chair.agentId, sessionRef: input.chair.sessionRef });
    if (input.chair.paneId !== undefined) this.#panes.set(input.chair.agentId, input.chair.paneId);

    if (this.#profileName === "paired-observed") {
      await this.#provider.spawnManaged({ agentId: input.peer.agentId, sessionRef: input.peer.sessionRef });
      const observer = await this.#herdr.startObserver({
        agentId: input.peer.agentId,
        sessionRef: input.peer.sessionRef,
        afterCursor: 0,
      });
      this.#panes.set(input.peer.agentId, observer.paneId);
    } else {
      await this.#provider.attachInteractive({ agentId: input.peer.agentId, sessionRef: input.peer.sessionRef });
      if (input.peer.paneId !== undefined) this.#panes.set(input.peer.agentId, input.peer.paneId);
    }
    await this.#herdr.placeSideBySide({
      chairPaneId: this.#chairInHerdr ? input.chair.paneId ?? null : null,
      peerPaneId: this.#panes.get(input.peer.agentId) ?? null,
    });
  }

  async publishActivity(input: {
    agentId: string;
    event: { kind: string; summary: string; sensitive?: string };
  }): Promise<number> {
    const events = this.#events.get(input.agentId) ?? [];
    const cursor = (events.at(-1)?.cursor ?? 0) + 1;
    events.push({
      envelopeVersion: 1,
      cursor,
      agentId: input.agentId,
      event: { kind: input.event.kind, summary: input.event.summary },
    });
    this.#events.set(input.agentId, events);
    return cursor;
  }

  async flushObserver(input: { agentId: string }): Promise<void> {
    const afterCursor = this.#renderedCursors.get(input.agentId) ?? 0;
    for (const envelope of this.#events.get(input.agentId) ?? []) {
      if (envelope.cursor > afterCursor) {
        await this.#herdr.renderActivity(envelope);
        this.#renderedCursors.set(input.agentId, envelope.cursor);
      }
    }
  }

  async closeObserver(input: { agentId: string }): Promise<void> {
    const paneId = this.#panes.get(input.agentId);
    if (paneId !== undefined) {
      await this.#herdr.closePane({ paneId, agentId: input.agentId });
      this.#panes.delete(input.agentId);
    }
  }

  async restartObserver(input: { agentId: string }): Promise<void> {
    const afterCursor = this.#renderedCursors.get(input.agentId) ?? 0;
    const session = this.#provider.status(input.agentId);
    const observer = await this.#herdr.startObserver({
      agentId: input.agentId,
      sessionRef: session.sessionRef,
      afterCursor,
    });
    this.#panes.set(input.agentId, observer.paneId);
    await this.flushObserver(input);
  }

  async notifyUnread(input: { agentId: string; messageId: string; deadlineMs: number }): Promise<{
    status: "dispatched-unconfirmed";
    delivery: "pending";
  }> {
    this.#deliveries.set(this.#deliveryKey(input.messageId, input.agentId), {
      messageId: input.messageId,
      agentId: input.agentId,
      status: "delivery-pending",
      deadline: this.#clock() + input.deadlineMs,
    });
    await this.#herdr.wakeup({
      agentId: input.agentId,
      paneId: this.#panes.get(input.agentId) ?? null,
      unreadMessageId: input.messageId,
    });
    return { status: "dispatched-unconfirmed", delivery: "pending" };
  }

  async safeTurnBoundary(input: { agentId: string }): Promise<{
    eventVersion: 1;
    agentId: string;
    deliveries: Awaited<ReturnType<FabricClient["receiveMessages"]>>;
  }> {
    const status = this.#provider.status(input.agentId);
    if (status.state !== "idle" || status.activeTools !== 0) {
      throw new FabricError("PROVIDER_TURN_ACTIVE", "provider is not at a safe turn boundary");
    }
    const client = this.#client(input.agentId);
    const deliveries = await client.receiveMessages({ limit: 100, visibilityTimeoutMs: 60_000 });
    for (const delivery of deliveries) {
      const key = this.#deliveryKey(delivery.messageId, input.agentId);
      const existing = this.#deliveries.get(key);
      this.#deliveries.set(key, {
        messageId: delivery.messageId,
        agentId: input.agentId,
        status: "delivery-pending",
        deadline: existing?.deadline ?? Number.POSITIVE_INFINITY,
        deliveryId: delivery.deliveryId,
      });
    }
    return { eventVersion: 1, agentId: input.agentId, deliveries };
  }

  async acknowledgeInteractiveDelivery(input: { agentId: string; deliveryId: string }): Promise<void> {
    await this.#client(input.agentId).acknowledgeDelivery({ deliveryId: input.deliveryId });
    for (const delivery of this.#deliveries.values()) {
      if (delivery.agentId === input.agentId && delivery.deliveryId === input.deliveryId) {
        delivery.status = "acknowledged";
      }
    }
  }

  async deliveryStatus(input: { messageId: string; agentId: string }): Promise<"delivery-pending" | "acknowledged"> {
    return this.#deliveries.get(this.#deliveryKey(input.messageId, input.agentId))?.status ?? "delivery-pending";
  }

  async reconcileDeliveryDeadlines(): Promise<Array<{
    agentId: string;
    messageId: string;
    state: "delivery-pending";
    escalation: "operator";
  }>> {
    const result: Array<{
      agentId: string;
      messageId: string;
      state: "delivery-pending";
      escalation: "operator";
    }> = [];
    for (const delivery of this.#deliveries.values()) {
      if (delivery.status === "delivery-pending" && delivery.deadline < this.#clock()) {
        result.push({
          agentId: delivery.agentId,
          messageId: delivery.messageId,
          state: "delivery-pending",
          escalation: "operator",
        });
      }
    }
    return result;
  }

  async handleVisibilityFailure(input: {
    kind: "herdr-telemetry" | "observer-pane" | "interactive-tui";
    agentId: string;
  }): Promise<Record<string, string>> {
    return await this.#evidenceSink.recordVisibilityFailure({
      ...input,
      commandId: `visibility:${input.kind}:${input.agentId}:${String(this.#clock())}`,
    });
  }

  #client(agentId: AgentId): ClientMap[string] {
    const client = this.#clients[agentId];
    if (client === undefined) throw new FabricError("NOT_FOUND", `fabric client is unavailable for ${agentId}`);
    return client;
  }

  #deliveryKey(messageId: string, agentId: string): string {
    return `${agentId}\u0000${messageId}`;
  }
}

export async function createVisibilityCoordinator(input: {
  runId: string;
  profileName: "paired-observed" | "paired-visible";
  chairInHerdr: boolean;
  clients: ClientMap;
  herdr: HerdrBoundary;
  provider: ProviderBoundary;
  clock: () => number;
  evidenceSink: VisibilityEvidenceSink;
}): Promise<VisibilityCoordinator> {
  void input.runId;
  return new VisibilityCoordinator(input);
}
