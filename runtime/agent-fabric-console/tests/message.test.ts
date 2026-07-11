import { describe, expect, it, vi } from "vitest";

import type {
  MessageBodyClient,
  MessageBodyReadRequest,
  MessageBodyReadResult,
  MessageId,
  ProjectSessionId,
} from "@local/agent-fabric-protocol";
import {
  cellWidth,
  graphemes,
  sanitizeDisplayText,
} from "../src/index.js";
import {
  presentMessageBodyWindow,
  readConsoleMessageBody,
} from "../src/message.js";

const request = {
  credential: { capabilityId: "capability-1", token: "secret" },
  projectSessionId: "session-1" as ProjectSessionId,
  messageId: "message-1" as MessageId,
  expectedRevision: 4,
} as MessageBodyReadRequest;

const display = { sanitizeDisplayText, graphemes, cellWidth };

describe("full normal message reads", () => {
  it("retains the full ordinary body and exposes every wrapped line by scrolling", async () => {
    const body = [
      "Normal prose remains readable in full.",
      "Unicode: 你好 👩🏽‍💻 and a deliberately long line that wraps without disappearing.",
      "Final paragraph.",
    ].join("\n");
    const client: MessageBodyClient = {
      read: vi.fn(async (): Promise<MessageBodyReadResult> => ({
        available: true,
        messageId: request.messageId,
        revision: 4,
        body,
        terminalNeutralised: true,
        capabilityValuesRedacted: true,
        artifactRefs: [],
      })),
    };

    const message = await readConsoleMessageBody(client, request);
    expect(message).toMatchObject({ available: true, body });
    if (!message.available) return;
    const first = presentMessageBodyWindow(
      message,
      { columns: 24, rows: 2, offset: 0 },
      display,
    );
    const windows = [first];
    for (let offset = 2; offset < first.totalLines; offset += 2) {
      windows.push(
        presentMessageBodyWindow(
          message,
          { columns: 24, rows: 2, offset },
          display,
        ),
      );
    }
    const allLines = windows.flatMap(({ lines }) => lines);

    expect(first.totalLines).toBeGreaterThan(3);
    expect(allLines.join(" ")).toContain("Normal prose remains readable in full.");
    expect(allLines.join(" ")).toContain("你好 👩🏽‍💻");
    expect(allLines.join(" ")).toContain("Final paragraph.");
    expect(allLines.every((line) => cellWidth(line) <= 24)).toBe(true);
  });

  it("neutralises terminal controls again at the final display boundary", async () => {
    const client: MessageBodyClient = {
      read: async () => ({
        available: true,
        messageId: request.messageId,
        revision: 4,
        body: "ordinary\u001b[31m red?\u0007 text",
        terminalNeutralised: true,
        capabilityValuesRedacted: true,
        artifactRefs: [],
      }),
    };
    const message = await readConsoleMessageBody(client, request);
    if (!message.available) return;
    const window = presentMessageBodyWindow(
      message,
      { columns: 80, rows: 4, offset: 0 },
      display,
    );
    expect(window.lines.join("\n")).toContain("<ESC>[31m");
    expect(window.lines.join("\n")).toContain("<BEL>");
    expect(window.lines.join("\n")).not.toContain("\u001b");
  });

  it("rejects mismatched identity, revision or unredacted capability contracts", async () => {
    const badResults = [
      {
        available: true,
        messageId: "message-other" as MessageId,
        revision: 4,
        body: "body",
        terminalNeutralised: true,
        capabilityValuesRedacted: true,
        artifactRefs: [],
      },
      {
        available: true,
        messageId: request.messageId,
        revision: 5,
        body: "body",
        terminalNeutralised: true,
        capabilityValuesRedacted: true,
        artifactRefs: [],
      },
      {
        available: true,
        messageId: request.messageId,
        revision: 4,
        body: "afb_unredacted",
        terminalNeutralised: true,
        capabilityValuesRedacted: false,
        artifactRefs: [],
      },
    ];
    for (const result of badResults) {
      const client = { read: async () => result } as unknown as MessageBodyClient;
      await expect(readConsoleMessageBody(client, request)).rejects.toThrow(
        /message body contract/,
      );
    }
  });
});
