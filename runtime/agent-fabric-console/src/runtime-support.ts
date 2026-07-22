import stringWidth from "string-width";
import { splitGraphemes } from "unicode-segmenter/grapheme";

import type { TerminalInputEvent } from "./input.js";
import type {
  FabricConsoleFrame,
  FabricHitRegion,
  FabricPointerIntent,
} from "./index.js";

export type CapturedActionTarget =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "shortcut";
      actionContext: boolean;
      region: FabricHitRegion | null;
    }>
  | Readonly<{ kind: "focused-region"; region: FabricHitRegion | null }>;

export type CapturedPointerIntent = Readonly<{
  intent: FabricPointerIntent;
  region: FabricHitRegion | null;
}>;

export type CapturedInput = Readonly<{
  event: TerminalInputEvent;
  frame: FabricConsoleFrame;
  reviewEpoch: string | null;
  actionTarget: CapturedActionTarget;
  pointerIntents: readonly CapturedPointerIntent[];
}>;

export function maxDraftBytes(value: number | undefined): number {
  if (value === undefined) return 16_384;
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_048_576) {
    throw new TypeError("maxDraftBytes must be an integer from 1 to 1048576");
  }
  return value;
}

export function boundedUtf8(value: string, maximumBytes: number): string {
  const encoded = Buffer.from(value);
  if (encoded.byteLength <= maximumBytes) return value;
  let end = maximumBytes;
  while (end > 0 && (encoded[end] ?? 0) >= 0x80 && (encoded[end] ?? 0) < 0xc0) {
    end -= 1;
  }
  return encoded.subarray(0, end).toString("utf8");
}

export function cellSlice(value: string, start: number, end: number): string {
  let column = 0;
  let output = "";
  for (const grapheme of splitGraphemes(value)) {
    const nextColumn = column + stringWidth(grapheme);
    if (nextColumn > start && column < end) output += grapheme;
    column = nextColumn;
    if (column >= end) break;
  }
  return output;
}

export function reviewEpoch(frame: FabricConsoleFrame): string | null {
  const review = frame.presentation.review;
  return review === null
    ? null
    : JSON.stringify([
        review.stage,
        review.workflowId,
        review.itemId,
        review.itemRevision,
        review.projectionRevision,
        review.previewRevision,
        review.previewDigest,
        review.confirmationMode,
      ]);
}
