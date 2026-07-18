import { pathToFileURL } from "node:url";

import type { AdapterRequestHandler } from "../types.js";
import { SqliteAdapterActionJournal } from "../journal.js";
import { journalPathFromArguments, serveAdapter } from "../server.js";
import { createCursorCliBoundary } from "./command-boundaries.js";
import { verifyProviderConformance } from "../../provider-conformance.js";
import {
  createOptionalProviderAdapter,
  optionalCapabilities,
  type OptionalProviderBoundary,
} from "./shared.js";

export type CursorAgentBoundary = OptionalProviderBoundary;

export function createCursorAgentAdapter(options: {
  boundary: CursorAgentBoundary;
  journal: SqliteAdapterActionJournal;
}): AdapterRequestHandler {
  return createOptionalProviderAdapter({
    capabilities: optionalCapabilities({
      adapterId: "cursor-agent",
      operations: ["spawn", "attach", "send_turn", "release"],
      modelFamilies: ["cursor-composer", "xai", "anthropic", "openai", "google"],
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
  if (value === undefined || value.length === 0) throw new Error(`cursor-agent adapter requires ${name}`);
  return value;
}

export async function runCursorAgentAdapter(
  arguments_: string[] = process.argv.slice(2),
  dependencies: { verifyProvider?: typeof verifyProviderConformance } = {},
): Promise<void> {
  const journal = new SqliteAdapterActionJournal(journalPathFromArguments("cursor-agent", arguments_));
  const executable = requiredArgument(arguments_, "--provider-executable");
  const cursorInstallRoot = requiredArgument(arguments_, "--provider-install-root");
  try {
    await serveAdapter(
      createCursorAgentAdapter({
        boundary: createCursorCliBoundary({
          executable,
          verifyExecutable: async () => await (dependencies.verifyProvider ?? verifyProviderConformance)({
            adapterId: "cursor-agent",
            executable,
            cursorInstallRoot,
          }),
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
  await runCursorAgentAdapter();
}
