import type {
  MessageBodyClient,
  MessageBodyReadRequest,
  MessageBodyReadResult,
} from "@local/agent-fabric-protocol";

export type ConsoleMessageBody = MessageBodyReadResult;

export async function readConsoleMessageBody(
  client: MessageBodyClient,
  request: MessageBodyReadRequest,
): Promise<ConsoleMessageBody> {
  const result = await client.read(request);
  if (
    result.messageId !== request.messageId ||
    result.revision !== request.expectedRevision
  ) {
    throw new Error("message body contract identity or revision changed");
  }
  if (
    result.available &&
    (result.terminalNeutralised !== true ||
      result.capabilityValuesRedacted !== true)
  ) {
    throw new Error("message body contract did not neutralise and redact content");
  }
  return result;
}

export type MessageDisplayDependencies = Readonly<{
  sanitizeDisplayText(
    input: string,
    options?: Readonly<{ lineBreaks?: "preserve" | "visible" }>,
  ): string;
  graphemes(text: string): IterableIterator<string>;
  cellWidth(text: string): number;
}>;

export type MessageBodyWindow = Readonly<{
  offset: number;
  totalLines: number;
  lines: readonly string[];
  hasPrevious: boolean;
  hasNext: boolean;
}>;

function splitLongToken(
  token: string,
  columns: number,
  dependencies: MessageDisplayDependencies,
): readonly string[] {
  const output: string[] = [];
  let line = "";
  let width = 0;
  for (const cluster of dependencies.graphemes(token)) {
    const clusterWidth = dependencies.cellWidth(cluster);
    if (clusterWidth > columns) {
      if (line.length > 0) output.push(line);
      output.push("?");
      line = "";
      width = 0;
      continue;
    }
    if (width + clusterWidth > columns && line.length > 0) {
      output.push(line);
      line = "";
      width = 0;
    }
    line += cluster;
    width += clusterWidth;
  }
  if (line.length > 0 || output.length === 0) output.push(line);
  return output;
}

function wrapLine(
  line: string,
  columns: number,
  dependencies: MessageDisplayDependencies,
): readonly string[] {
  return splitLongToken(line, columns, dependencies);
}

export function presentMessageBodyWindow(
  message: Extract<ConsoleMessageBody, { available: true }>,
  viewport: Readonly<{ columns: number; rows: number; offset: number }>,
  dependencies: MessageDisplayDependencies,
): MessageBodyWindow {
  if (
    !Number.isSafeInteger(viewport.columns) ||
    !Number.isSafeInteger(viewport.rows) ||
    !Number.isSafeInteger(viewport.offset) ||
    viewport.columns < 1 ||
    viewport.rows < 1 ||
    viewport.offset < 0 ||
    viewport.columns * viewport.rows > 250_000
  ) {
    throw new TypeError("message viewport is outside the bounded display range");
  }
  const safe = dependencies.sanitizeDisplayText(message.body, {
    lineBreaks: "preserve",
  });
  const allLines = safe
    .split("\n")
    .flatMap((line) => wrapLine(line, viewport.columns, dependencies));
  const maximumOffset = Math.max(0, allLines.length - 1);
  const offset = Math.min(viewport.offset, maximumOffset);
  return {
    offset,
    totalLines: allLines.length,
    lines: allLines.slice(offset, offset + viewport.rows),
    hasPrevious: offset > 0,
    hasNext: offset + viewport.rows < allLines.length,
  };
}
