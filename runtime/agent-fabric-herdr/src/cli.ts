#!/usr/bin/env node

import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  FabricActionJournalPort,
  FabricDirectSteerPort,
} from "./contracts.js";
import {
  createProductionHerdrIntegration,
  type ProductionHerdrIntegrationOptions,
} from "./production.js";

export type HerdrCliIo = Readonly<{
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}>;

const USAGE = "usage: agent-fabric-herdr doctor --config PATH\n" +
  "       agent-fabric-herdr steer --config PATH --pane ID --fire-and-forget (--task-ref ID | --message-ref ID) [--prompt TEXT]\n";
const CREDENTIAL_PATTERN = /\b(?:afb|afc|afop)_[A-Za-z0-9_-]{8,}|\bghp_[A-Za-z0-9_]{8,}|\bgithub_pat_[A-Za-z0-9_]{8,}/u;

type HerdrCliConfig = Omit<ProductionHerdrIntegrationOptions, "fabricJournal" | "fabricDirectSteer" | "clock"> & {
  schemaVersion: 1;
};

export async function runHerdrCli(arguments_: readonly string[], io: HerdrCliIo): Promise<number> {
  if (arguments_.length === 0 || arguments_[0] === "--help" || arguments_[0] === "-h") {
    io.stdout.write(USAGE);
    return 0;
  }
  const command = arguments_[0];
  if (command !== "doctor" && command !== "steer") {
    io.stderr.write(USAGE);
    return 2;
  }
  let parsed: ParsedArguments;
  try {
    parsed = parseArguments(arguments_.slice(1));
  } catch (error: unknown) {
    io.stderr.write(`${error instanceof Error ? error.message : "invalid arguments"}\n`);
    return 2;
  }
  if (command === "steer" && !parsed.fireAndForget) {
    io.stderr.write("degraded Herdr steering requires explicit --fire-and-forget and cannot carry an expected answer\n");
    return 2;
  }
  if (
    command === "steer" &&
    (
      (parsed.taskRef === undefined) === (parsed.messageRef === undefined) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(parsed.taskRef ?? parsed.messageRef ?? "") ||
      CREDENTIAL_PATTERN.test(parsed.taskRef ?? parsed.messageRef ?? "")
    )
  ) {
    io.stderr.write("degraded Herdr steering requires exactly one bounded --task-ref or --message-ref; the reference remains unverified\n");
    return 2;
  }
  if (command === "steer" && (parsed.pane === undefined || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u.test(parsed.pane))) {
    io.stderr.write("degraded Herdr steering requires a bounded --pane\n");
    return 2;
  }
  try {
    const config = await readConfig(parsed.config);
    const integration = await createProductionHerdrIntegration({
      ...config,
      fabricJournal: inactiveJournal(),
      fabricDirectSteer: inactiveDirectSteer(),
    });
    if (command === "doctor") {
      io.stdout.write(`${JSON.stringify({
        status: "available",
        version: config.expectedVersion,
        protocol: config.expectedProtocol,
        projectId: config.projectId,
        projectSessionId: config.projectSessionId,
        authority: "fabric",
        paneTruth: false,
      })}\n`);
      return 0;
    }
    const prompt = parsed.prompt ?? await readBoundedStdin(io.stdin, 4_096);
    const result = await integration.boundary.dispatchUnverifiedFireAndForget(parsed.pane as string, prompt);
    io.stdout.write(`${JSON.stringify({
      ...result,
      ...(parsed.taskRef === undefined ? { messageRef: parsed.messageRef } : { taskRef: parsed.taskRef }),
    })}\n`);
    return 0;
  } catch {
    io.stderr.write("Herdr configuration or bounded operation failed safely\n");
    return 1;
  }
}

type ParsedArguments = {
  config: string;
  fireAndForget: boolean;
  pane?: string;
  taskRef?: string;
  messageRef?: string;
  prompt?: string;
};

function parseArguments(arguments_: readonly string[]): ParsedArguments {
  let config: string | undefined;
  let fireAndForget = false;
  let pane: string | undefined;
  let taskRef: string | undefined;
  let messageRef: string | undefined;
  let prompt: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const name = arguments_[index];
    if (name === "--fire-and-forget") {
      if (seen.has(name)) throw new TypeError("duplicate --fire-and-forget");
      seen.add(name);
      fireAndForget = true;
      continue;
    }
    if (name !== "--config" && name !== "--pane" && name !== "--task-ref" && name !== "--message-ref" && name !== "--prompt") {
      throw new TypeError("unknown argument");
    }
    if (seen.has(name)) throw new TypeError(`duplicate ${name}`);
    seen.add(name);
    const value = arguments_[index + 1];
    if (value === undefined) throw new TypeError(`${name} requires a value`);
    index += 1;
    if (name === "--config") config = value;
    else if (name === "--pane") pane = value;
    else if (name === "--task-ref") taskRef = value;
    else if (name === "--message-ref") messageRef = value;
    else prompt = value;
  }
  if (config === undefined || !isAbsolute(config) || config.includes("\0")) {
    throw new TypeError("--config must name an absolute file");
  }
  return {
    config,
    fireAndForget,
    ...(pane === undefined ? {} : { pane }),
    ...(taskRef === undefined ? {} : { taskRef }),
    ...(messageRef === undefined ? {} : { messageRef }),
    ...(prompt === undefined ? {} : { prompt }),
  };
}

async function readConfig(path: string): Promise<HerdrCliConfig> {
  const canonical = await realpath(path).catch(() => null);
  if (canonical === null || canonical !== path) throw new TypeError("Herdr config is missing or non-canonical");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > 64 * 1024) throw new TypeError("Herdr config is not a bounded regular file");
    const value: unknown = JSON.parse((await handle.readFile()).toString("utf8"));
    if (!isRecord(value)) throw new TypeError("Herdr config must be an object");
    const observerFields = [
      "observerExecutable",
      "observerExecutableDigest",
      "observerSocketPath",
      "observerCapabilityFile",
      "observerCursorDirectory",
    ] as const;
    const optional = observerFields.every((field) => value[field] === undefined) ? [] : observerFields;
    const keys = [
      "canonicalProjectRoot", "consoleExecutable", "consoleExecutableDigest", "executable",
      "executableDigest", "expectedProtocol", "expectedVersion", "projectId", "projectSessionId",
      "schemaVersion", "stateDirectory", ...optional,
    ];
    if (!exactKeys(value, keys) || value.schemaVersion !== 1 ||
        typeof value.executable !== "string" || typeof value.executableDigest !== "string" ||
        typeof value.expectedVersion !== "string" || !Number.isSafeInteger(value.expectedProtocol) ||
        typeof value.stateDirectory !== "string" || typeof value.projectId !== "string" ||
        typeof value.projectSessionId !== "string" || typeof value.canonicalProjectRoot !== "string" ||
        typeof value.consoleExecutable !== "string" || typeof value.consoleExecutableDigest !== "string" ||
        (value.observerExecutable !== undefined && typeof value.observerExecutable !== "string") ||
        (value.observerExecutableDigest !== undefined && typeof value.observerExecutableDigest !== "string") ||
        (value.observerSocketPath !== undefined && typeof value.observerSocketPath !== "string") ||
        (value.observerCapabilityFile !== undefined && typeof value.observerCapabilityFile !== "string") ||
        (value.observerCursorDirectory !== undefined && typeof value.observerCursorDirectory !== "string")) {
      throw new TypeError("Herdr config has an invalid closed shape");
    }
    return value as HerdrCliConfig;
  } finally {
    await handle.close();
  }
}

async function readBoundedStdin(stream: NodeJS.ReadableStream, maximumBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += bytes.length;
    if (total > maximumBytes) throw new TypeError("Herdr steering prompt exceeds its byte bound");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function inactiveJournal(): FabricActionJournalPort {
  return {
    readAction: async () => null,
    markDispatched: async () => { throw new TypeError("standalone degraded steering has no Fabric journal mutation"); },
    completeAction: async () => { throw new TypeError("standalone degraded steering has no Fabric journal mutation"); },
    markAmbiguous: async () => { throw new TypeError("standalone degraded steering has no Fabric journal mutation"); },
  };
}

function inactiveDirectSteer(): FabricDirectSteerPort {
  return {
    validateSteerReference: async () => ({ status: "rejected", code: "unknown-reference", reason: "standalone reference is unverified" }),
    prepareDirectSteerAction: async () => { throw new TypeError("standalone degraded steering cannot prepare a Fabric action"); },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runHerdrCli(process.argv.slice(2), {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
