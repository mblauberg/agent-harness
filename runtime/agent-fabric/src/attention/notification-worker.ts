import {
  NotificationOutbox,
  type IntegrationAvailability,
  type NotificationWorkerContext,
  type PendingNotificationWork,
} from "./outbox.js";

const NOTIFIABLE_KINDS = new Set([
  "consequential-gate",
  "critical-path-block",
  "quarantine",
  "expiring-authority",
  "integrity-failure",
  "completion-ready",
  "acceptance-ready",
  "blocked",
]);

export type NativeNotification = Readonly<{
  notificationId: string;
  itemId: string;
  itemRevision: number;
  title: string;
  body: string;
}>;

export type NativeNotificationDiscovery = Readonly<{
  state: IntegrationAvailability;
  contract: unknown;
}>;

export type NativeNotificationAdapter = Readonly<{
  discover(): Promise<NativeNotificationDiscovery>;
  send(notification: NativeNotification): Promise<unknown>;
}>;

export class NativeNotificationEffectError extends Error {
  readonly outcome: "failed" | "ambiguous";

  constructor(outcome: "failed" | "ambiguous", message: string, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "NativeNotificationEffectError";
    this.outcome = outcome;
  }
}

export type NotificationWorkerPassResult = Readonly<{
  examined: number;
  sent: number;
  failed: number;
  deduplicated: number;
}>;

type NotificationWorkerOptions = Readonly<{
  outbox: NotificationOutbox;
  adapter: NativeNotificationAdapter;
  workerInstanceId: string;
  integrationId: string;
  clock?: () => number;
  pageSize?: number;
  claimLifetimeMs?: number;
}>;

function boundedTerminalText(value: unknown, maximumBytes: number): string {
  const source = typeof value === "string" ? value : "";
  const clean = source
    .replace(/\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/gu, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (Buffer.byteLength(clean, "utf8") <= maximumBytes) return clean;
  let result = "";
  for (const character of clean) {
    if (Buffer.byteLength(`${result}${character}…`, "utf8") > maximumBytes) break;
    result += character;
  }
  return `${result}…`;
}

function notification(work: PendingNotificationWork): NativeNotification {
  const payload = typeof work.attention.payload === "object" && work.attention.payload !== null && !Array.isArray(work.attention.payload)
    ? work.attention.payload as Record<string, unknown>
    : {};
  const fallbackTitle = work.attention.kind.replaceAll("-", " ");
  return {
    notificationId: work.delivery.notificationId,
    itemId: work.attention.itemId,
    itemRevision: work.attention.revision,
    title: boundedTerminalText(payload.title, 128) || boundedTerminalText(fallbackTitle, 128) || "Agent Fabric attention",
    body: boundedTerminalText(payload.summary ?? payload.message ?? work.attention.severity, 512),
  };
}

export class NativeNotificationWorker {
  readonly #outbox: NotificationOutbox;
  readonly #adapter: NativeNotificationAdapter;
  readonly #context: NotificationWorkerContext;
  readonly #clock: () => number;
  readonly #pageSize: number;
  readonly #claimLifetimeMs: number;
  #running: Promise<NotificationWorkerPassResult> | undefined;

  constructor(options: NotificationWorkerOptions) {
    this.#outbox = options.outbox;
    this.#adapter = options.adapter;
    this.#context = {
      workerInstanceId: options.workerInstanceId,
      integrationId: options.integrationId,
    };
    this.#clock = options.clock ?? Date.now;
    this.#pageSize = options.pageSize ?? 16;
    this.#claimLifetimeMs = options.claimLifetimeMs ?? 30_000;
    if (!Number.isSafeInteger(this.#pageSize) || this.#pageSize < 1 || this.#pageSize > 100) {
      throw new TypeError("notification worker pageSize must be between 1 and 100");
    }
    if (!Number.isSafeInteger(this.#claimLifetimeMs) || this.#claimLifetimeMs < 1) {
      throw new TypeError("notification worker claimLifetimeMs must be positive");
    }
  }

  async runOnce(): Promise<NotificationWorkerPassResult> {
    this.#running ??= this.#run().finally(() => { this.#running = undefined; });
    return await this.#running;
  }

  async #run(): Promise<NotificationWorkerPassResult> {
    this.#outbox.recover();
    let discovery: NativeNotificationDiscovery;
    try {
      discovery = await this.#adapter.discover();
    } catch (error: unknown) {
      discovery = { state: "stale", contract: { schemaVersion: 1, discoveryError: error instanceof Error ? error.name : "Error" } };
    }
    this.#outbox.setIntegrationAvailability(this.#context, {
      state: discovery.state,
      discoveredContract: discovery.contract,
    });
    if (discovery.state !== "available") {
      return { examined: 0, sent: 0, failed: 0, deduplicated: 0 };
    }

    const result = { examined: 0, sent: 0, failed: 0, deduplicated: 0 };
    for (const work of this.#outbox.pendingPage(this.#context, { limit: this.#pageSize })) {
      result.examined += 1;
      const claimed = this.#outbox.claim(this.#context, {
        notificationId: work.delivery.notificationId,
        expectedItemRevision: work.delivery.itemRevision,
        expectedClaimGeneration: work.delivery.claimGeneration,
        claimDeadline: new Date(this.#clock() + this.#claimLifetimeMs).toISOString(),
      });
      if (!NOTIFIABLE_KINDS.has(work.attention.kind)) {
        this.#outbox.recordOutcome(this.#context, {
          notificationId: claimed.notificationId,
          claimGeneration: claimed.claimGeneration,
          outcome: "deduplicated",
          effectIdentityHash: claimed.effectIdentityHash,
          detail: { reason: "category-not-notifiable", kind: work.attention.kind },
        });
        result.deduplicated += 1;
        continue;
      }
      try {
        const receipt = await this.#adapter.send(notification(work));
        this.#outbox.recordOutcome(this.#context, {
          notificationId: claimed.notificationId,
          claimGeneration: claimed.claimGeneration,
          outcome: "sent",
          effectIdentityHash: claimed.effectIdentityHash,
          detail: { receipt },
        });
        result.sent += 1;
      } catch (error: unknown) {
        const outcome = error instanceof NativeNotificationEffectError ? error.outcome : "failed";
        this.#outbox.recordOutcome(this.#context, {
          notificationId: claimed.notificationId,
          claimGeneration: claimed.claimGeneration,
          outcome,
          effectIdentityHash: claimed.effectIdentityHash,
          detail: { error: error instanceof Error ? error.name : "Error" },
        });
        result.failed += 1;
      }
    }
    return result;
  }
}
