import type { ConsoleUrgency, FabricView } from "./model.js";

export const FABRIC_VIEW_SHORT_LABELS: Readonly<Record<FabricView, string>> = {
  attention: "Attn",
  project: "Proj",
  runs: "Runs",
  work: "Work",
  agents: "Agents",
  evidence: "Evid",
  activity: "Act",
  system: "Sys",
};

export const FABRIC_URGENCY_MARKERS: Readonly<Record<ConsoleUrgency, string>> = {
  "safety-integrity": "!!",
  "critical-path": "!>",
  "expiring-authority": "!",
  "acceptance-ready": "+",
  advisory: ".",
  normal: " ",
};

export const FABRIC_COMPACT_ACTION_LABELS: Readonly<Record<string, string>> = {
  "review:continue": "Continue",
  "review:cancel": "Cancel",
  "review:confirm": "Confirm",
  "review:refresh": "Refresh",
  "review:observe": "Observe",
  "review:close": "Close",
};
