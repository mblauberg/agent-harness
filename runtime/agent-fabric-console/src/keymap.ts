import { FABRIC_VIEWS, type FabricView } from "./model.js";

const STABLE_REVIEW_SHORTCUTS: Readonly<Record<string, string>> = {
  "review:continue": "1",
  "review:cancel": "2",
  "review:confirm": "3",
};

export function fabricViewKey(view: FabricView): string {
  return String(FABRIC_VIEWS.indexOf(view) + 1);
}

export function nextFabricView(view: FabricView, delta: -1 | 1): FabricView {
  const current = FABRIC_VIEWS.indexOf(view);
  const index = (current + delta + FABRIC_VIEWS.length) % FABRIC_VIEWS.length;
  return FABRIC_VIEWS[index] ?? "attention";
}

export function fabricActionShortcut(actionId: string, index: number): string {
  return STABLE_REVIEW_SHORTCUTS[actionId] ?? String(index + 1);
}

export const FABRIC_BROWSE_HELP =
  "? help | [ ] view | Enter open | s sessions | e edit | Pg scroll";

export const FABRIC_HELP_NOTICE =
  "Help: Alt-1..8 views; [ ] cycle; Enter open; s sessions; e draft; : workflow; PgUp/PgDn; Alt-M mouse; q detach";
