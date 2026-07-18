import { pathToFileURL } from "node:url";

import type { AdapterRequestHandler } from "../types.js";
import { SqliteAdapterActionJournal } from "../journal.js";
import { journalPathFromArguments, serveAdapter } from "../server.js";
import { createAgyCliBoundary } from "./command-boundaries.js";
import { verifyProviderConformance } from "../../provider-conformance.js";
import {
  createOptionalProviderAdapter,
  optionalCapabilities,
  type OptionalProviderBoundary,
} from "./shared.js";

export type AgyBoundary = OptionalProviderBoundary;

export function createAgyAdapter(options: {
  boundary: AgyBoundary;
  journal: SqliteAdapterActionJournal;
}): AdapterRequestHandler {
  return createOptionalProviderAdapter({
    capabilities: optionalCapabilities({
      adapterId: "agy",
      operations: ["spawn", "attach", "send_turn", "release"],
      modelFamilies: ["google", "anthropic"],
      compactInPlace: false,
      answerBearingSpawn: true,
      answerBearingSpawnTurns: "one-shot",
    }),
    boundary: options.boundary,
    journal: options.journal,
  });
}

function argument(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
}

function requiredArgument(arguments_: string[], name: string): string {
  const value = argument(arguments_, name);
  if (value === undefined || value.length === 0) throw new Error(`agy adapter requires ${name}`);
  return value;
}

export async function runAgyAdapter(
  arguments_: string[] = process.argv.slice(2),
  dependencies: { verifyProvider?: typeof verifyProviderConformance } = {},
): Promise<void> {
  const journal = new SqliteAdapterActionJournal(journalPathFromArguments("agy", arguments_));
  const executable = requiredArgument(arguments_, "--provider-executable");
  try {
    await serveAdapter(
      createAgyAdapter({
        boundary: createAgyCliBoundary({
          executable,
          verifyExecutable: async () => await (dependencies.verifyProvider ?? verifyProviderConformance)({ adapterId: "agy", executable }),
          cwd: argument(arguments_, "--cwd") ?? process.cwd(),
        }),
        journal,
      }),
      { input: process.stdin, output: process.stdout },
    );
  } finally {
    journal.close();
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  await runAgyAdapter();
}
