import { pathToFileURL } from "node:url";

import { verifyProviderConformance } from "../../provider-conformance.js";
import { SqliteAdapterActionJournal } from "../journal.js";
import { journalPathFromArguments, serveAdapter } from "../server.js";
import { type AdapterRequestHandler } from "../types.js";
import { KiroAcpStdioClient } from "./kiro-acp-client.js";
import { createManagedAcpBoundary, type KiroAcpBoundary } from "./kiro-acp.js";
import {
  createOptionalProviderAdapter,
  optionalCapabilities,
} from "./shared.js";

export type OpenCodeAcpBoundary = KiroAcpBoundary;

export function createOpenCodeAcpAdapter(options: {
  boundary: OpenCodeAcpBoundary;
  journal: SqliteAdapterActionJournal;
}): AdapterRequestHandler {
  return createOptionalProviderAdapter({
    capabilities: optionalCapabilities({
      adapterId: "opencode-acp",
      operations: ["spawn", "send_turn", "release"],
      modelFamilies: ["generic-open"],
      compactInPlace: false,
      persistentSession: false,
      recoveryOperations: ["lookup_action"],
    }),
    boundary: options.boundary,
    journal: options.journal,
    modelPolicy: { allowedModelPatterns: ["opencode/*"] },
  });
}

export async function runOpenCodeAcpAdapter(
  arguments_: string[] = process.argv.slice(2),
  dependencies: { verifyProvider?: typeof verifyProviderConformance } = {},
): Promise<void> {
  const journal = new SqliteAdapterActionJournal(journalPathFromArguments("opencode-acp", arguments_));
  const providerExecutable = requiredArgument(arguments_, "--provider-executable");
  const providerInstallRoot = requiredArgument(arguments_, "--provider-install-root");
  const requestTimeoutMs = positiveIntegerArgument(arguments_, "--request-timeout-ms");
  const closeTimeoutMs = positiveIntegerArgument(arguments_, "--close-timeout-ms");
  const maximumLineBytes = positiveIntegerArgument(arguments_, "--maximum-line-bytes");
  const maximumOutputBytes = positiveIntegerArgument(arguments_, "--maximum-output-bytes");
  const boundary = createManagedAcpBoundary({
    providerName: "OpenCode ACP",
    verifyExecutable: async () => await (dependencies.verifyProvider ?? verifyProviderConformance)({
      adapterId: "opencode-acp",
      executable: providerExecutable,
      providerInstallRoot,
    }),
    clientFactory({ model, cwd }) {
      return new KiroAcpStdioClient({
        executable: providerExecutable,
        args: ["acp", "--pure", "--cwd", cwd],
        cwd,
        model,
        configureModelOnSessionStart: true,
        ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
        ...(closeTimeoutMs === undefined ? {} : { closeTimeoutMs }),
        ...(maximumLineBytes === undefined ? {} : { maximumLineBytes }),
        ...(maximumOutputBytes === undefined ? {} : { maximumOutputBytes }),
      });
    },
  });
  try {
    await serveAdapter(createOpenCodeAcpAdapter({ boundary, journal }), { input: process.stdin, output: process.stdout });
  } finally {
    await boundary.shutdown();
    journal.close();
  }
}

function argument(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
}

function requiredArgument(arguments_: string[], name: string): string {
  const value = argument(arguments_, name);
  if (value === undefined || value.length === 0) throw new Error(`opencode-acp adapter requires ${name}`);
  return value;
}

function positiveIntegerArgument(arguments_: string[], name: string): number | undefined {
  const value = argument(arguments_, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`opencode-acp adapter requires positive ${name}`);
  return parsed;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  await runOpenCodeAcpAdapter();
}
