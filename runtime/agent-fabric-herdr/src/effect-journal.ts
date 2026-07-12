import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, link, mkdir, open, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { parseIdentifier, parseJsonValue } from "@local/agent-fabric-protocol";
import type { JsonValue, ProviderActionId } from "@local/agent-fabric-protocol";

import type { HerdrEffectLookup, HerdrEffectReceipt } from "./contracts.js";

export type HerdrEffectEvidenceJournalOptions = Readonly<{
  stateDirectory: string;
}>;

const MAXIMUM_EVIDENCE_BYTES = 64 * 1024;
const SECRET_PATTERN = /\b(?:afb|afc|afop)_[A-Za-z0-9_-]{8,}|\bghp_[A-Za-z0-9_]{8,}|\bgithub_pat_[A-Za-z0-9_]{8,}/u;

/** Adapter-local reconciliation evidence; Fabric remains the canonical action journal. */
export class HerdrEffectEvidenceJournal {
  readonly #stateDirectory: string;

  constructor(options: HerdrEffectEvidenceJournalOptions) {
    if (!isAbsolute(options.stateDirectory) || options.stateDirectory.includes("\0")) {
      throw new TypeError("Herdr effect evidence directory must be an absolute canonical path");
    }
    this.#stateDirectory = options.stateDirectory;
  }

  async record(actionId: ProviderActionId, receipt: HerdrEffectReceipt): Promise<void> {
    const parsedActionId = parseIdentifier<"ProviderActionId">(actionId, "herdrEffect.actionId");
    if (SECRET_PATTERN.test(parsedActionId)) throw new TypeError("Herdr effect evidence action identity resembles a credential");
    const parsedReceipt = parseReceipt(receipt);
    const effectsDirectory = await this.#effectsDirectory();
    const target = effectPath(effectsDirectory, parsedActionId);
    const stored = storedEvidence(parsedActionId, parsedReceipt);
    const bytes = Buffer.from(JSON.stringify(stored), "utf8");
    if (bytes.length > MAXIMUM_EVIDENCE_BYTES) throw new TypeError("Herdr effect evidence exceeds its byte bound");

    const existing = await readEvidence(target).catch((error: unknown) => {
      if (isErrno(error, "ENOENT")) return null;
      throw error;
    });
    if (existing !== null) {
      assertSameEvidence(existing, stored);
      return;
    }

    const temporary = join(effectsDirectory, `.${target.slice(target.lastIndexOf("/") + 1)}.${randomBytes(8).toString("hex")}.tmp`);
    const handle = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.chmod(0o600);
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, target);
    } catch (error: unknown) {
      if (!isErrno(error, "EEXIST")) throw error;
      const raced = await readEvidence(target);
      assertSameEvidence(raced, stored);
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if (!isErrno(error, "ENOENT")) throw error;
      });
    }
    await chmod(target, 0o600);
  }

  async lookupAction(actionId: ProviderActionId): Promise<HerdrEffectLookup> {
    const parsedActionId = parseIdentifier<"ProviderActionId">(actionId, "herdrEffect.actionId");
    if (SECRET_PATTERN.test(parsedActionId)) throw new TypeError("Herdr effect evidence action identity resembles a credential");
    const target = effectPath(await this.#effectsDirectory(), parsedActionId);
    const evidence = await readEvidence(target).catch((error: unknown) => {
      if (isErrno(error, "ENOENT")) return null;
      throw error;
    });
    if (evidence === null) return { status: "unknown" };
    if (evidence.actionId !== parsedActionId) throw new TypeError("Herdr effect evidence identity conflicts with its path");
    return { status: "observed", receipt: evidence.receipt };
  }

  async #effectsDirectory(): Promise<string> {
    const root = await realpath(this.#stateDirectory).catch(() => null);
    if (root === null || root !== this.#stateDirectory) {
      throw new TypeError("Herdr effect evidence directory is missing or non-canonical");
    }
    await chmod(root, 0o700);
    const effects = join(root, "effects");
    await mkdir(effects, { recursive: true, mode: 0o700 });
    const canonicalEffects = await realpath(effects);
    if (canonicalEffects !== effects) throw new TypeError("Herdr effect evidence path resolves through a symlink");
    await chmod(effects, 0o700);
    return effects;
  }
}

type StoredEvidence = {
  schemaVersion: 1;
  actionId: ProviderActionId;
  receipt: HerdrEffectReceipt;
  receiptDigest: string;
};

function storedEvidence(actionId: ProviderActionId, receipt: HerdrEffectReceipt): StoredEvidence {
  return {
    schemaVersion: 1,
    actionId,
    receipt,
    receiptDigest: digestJson(receipt),
  };
}

function effectPath(directory: string, actionId: ProviderActionId): string {
  const digest = createHash("sha256").update(actionId).digest("hex");
  return join(directory, `${digest}.json`);
}

async function readEvidence(path: string): Promise<StoredEvidence> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > MAXIMUM_EVIDENCE_BYTES) {
      throw new TypeError("Herdr effect evidence is not a bounded regular file");
    }
    const value: unknown = JSON.parse((await handle.readFile()).toString("utf8"));
    if (!isRecord(value) || !exactKeys(value, ["actionId", "receipt", "receiptDigest", "schemaVersion"]) || value.schemaVersion !== 1) {
      throw new TypeError("Herdr effect evidence has an invalid closed shape");
    }
    const actionId = parseIdentifier<"ProviderActionId">(value.actionId, "herdrEffect.actionId");
    const receipt = parseReceipt(value.receipt);
    const receiptDigest = digestJson(receipt);
    if (value.receiptDigest !== receiptDigest) throw new TypeError("Herdr effect evidence digest is invalid");
    return { schemaVersion: 1, actionId, receipt, receiptDigest };
  } finally {
    await handle.close();
  }
}

function parseReceipt(value: unknown): HerdrEffectReceipt {
  if (!isRecord(value)) throw new TypeError("Herdr effect receipt must be an object");
  if (value.status === "dispatched-unconfirmed") {
    if (!exactKeys(value, ["canCloseBarrier", "canSatisfyExpectedResult", "deliveryEvidence", "operation", "referenceValidation", "status"]) ||
        value.operation !== "steer.inject-fire-and-forget" ||
        value.referenceValidation !== "verified" || value.deliveryEvidence !== "none" ||
        value.canSatisfyExpectedResult !== false || value.canCloseBarrier !== false) {
      throw new TypeError("Herdr direct-steer receipt is invalid");
    }
    return value as HerdrEffectReceipt;
  }
  const allowed = new Set(["console.ensure-pane", "agent.ensure-pane", "panes.arrange", "agent.project-metadata", "attention.project", "target.focus", "agent.wake", "notification.show"]);
  const keys = ["operation", "status"];
  if (value.detail !== undefined) keys.push("detail");
  if (value.paneRef !== undefined) keys.push("paneRef");
  if (!exactKeys(value, keys) || value.status !== "applied" || typeof value.operation !== "string" || !allowed.has(value.operation)) {
    throw new TypeError("Herdr applied receipt is invalid");
  }
  if (
    value.paneRef !== undefined &&
    (typeof value.paneRef !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u.test(value.paneRef) || SECRET_PATTERN.test(value.paneRef))
  ) {
    throw new TypeError("Herdr applied receipt pane reference is invalid");
  }
  const base = {
    status: "applied" as const,
    operation: value.operation as HerdrEffectReceipt["operation"],
    ...(value.paneRef === undefined ? {} : { paneRef: value.paneRef as never }),
  };
  if (value.detail !== undefined) {
    const detail = parseJsonValue(value.detail, "herdrEffect.receipt.detail");
    if (SECRET_PATTERN.test(JSON.stringify(detail))) throw new TypeError("Herdr effect evidence cannot persist credential-like data");
    return { ...base, detail };
  }
  return base;
}

function assertSameEvidence(actual: StoredEvidence, expected: StoredEvidence): void {
  if (actual.actionId !== expected.actionId || actual.receiptDigest !== expected.receiptDigest) {
    throw new TypeError(`Herdr effect evidence for ${expected.actionId} conflicts with the existing receipt`);
  }
}

function digestJson(value: JsonValue | HerdrEffectReceipt): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalise(value as JsonValue))).digest("hex")}`;
}

function canonicalise(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, entry]) => [key, canonicalise(entry)]));
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function isErrno(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
