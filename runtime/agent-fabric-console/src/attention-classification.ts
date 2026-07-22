import type { ConsoleRow, ConsoleUrgency } from "./model.js";

const ATTENTION_LANE = new WeakMap<ConsoleRow, "needs-you" | "watch">();

export function isNeedsYouUrgency(urgency: ConsoleUrgency): boolean {
  return urgency === "safety-integrity" ||
    urgency === "critical-path" ||
    urgency === "expiring-authority" ||
    urgency === "acceptance-ready";
}

export function recordAttentionLane(row: ConsoleRow, label: string | null): void {
  ATTENTION_LANE.set(
    row,
    label !== "FYI" && isNeedsYouUrgency(row.urgency)
      ? "needs-you"
      : "watch",
  );
}

export function isNeedsYouRow(row: ConsoleRow): boolean {
  const cached = ATTENTION_LANE.get(row);
  if (cached !== undefined) return cached === "needs-you";
  const summary = row.summary;
  recordAttentionLane(
    row,
    row.view === "attention" && summary?.kind === "attention" ? summary.label : null,
  );
  return ATTENTION_LANE.get(row) === "needs-you";
}
