import { pathToFileURL } from "node:url";

import { ProviderAdapterError, type AdapterRequestHandler } from "../types.js";
import { SqliteAdapterActionJournal } from "../journal.js";
import { journalPathFromArguments, serveAdapter } from "../server.js";
import {
  createOptionalProviderAdapter,
  optionalCapabilities,
  type OptionalProviderBoundary,
} from "./shared.js";

export type KiroAcpBoundary = OptionalProviderBoundary;

export function createKiroAcpAdapter(options: {
  boundary: KiroAcpBoundary;
  journal: SqliteAdapterActionJournal;
}): AdapterRequestHandler {
  return createOptionalProviderAdapter({
    capabilities: optionalCapabilities({
      adapterId: "kiro-acp",
      operations: ["spawn", "attach", "send_turn", "release"],
      modelFamilies: ["open-weight"],
      compactInPlace: false,
    }),
    boundary: options.boundary,
    journal: options.journal,
    modelPolicy: { adapterId: "kiro-acp", allowedFamilies: ["open-weight"] },
  });
}

export function createUnverifiedKiroAcpEntrypoint(): AdapterRequestHandler {
  return {
    async request(): Promise<never> {
      throw new ProviderAdapterError(
        "KIRO_ACP_PROTOCOL_UNVERIFIED",
        "Kiro ACP activation is disabled because the installed CLI exposes no pinned ACP wire version or schema",
      );
    },
  };
}

export async function runKiroAcpAdapter(arguments_: string[] = process.argv.slice(2)): Promise<void> {
  const journal = new SqliteAdapterActionJournal(journalPathFromArguments("kiro-acp", arguments_));
  try {
    await serveAdapter(createUnverifiedKiroAcpEntrypoint(), { input: process.stdin, output: process.stdout });
  } finally {
    journal.close();
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  await runKiroAcpAdapter();
}
