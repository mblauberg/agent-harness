import type { DeclaredRunProgress, RunIdentity } from "@local/agent-fabric-protocol";

import type { ConsoleRunSummary } from "./model.js";

export type RunDetailLine = Readonly<{ label: string; value: string }>;

/**
 * Declared progress renders only Fabric-declared facts: an open plan shows
 * known counts without a denominator and an unknown plan shows its reason.
 * No arm is ever rendered as a percentage, completion ratio or ETA. A finite
 * `n/N` arm arrives only with the deferred plan-declaration cutover.
 */
export function declaredProgressCompactLabel(progress: DeclaredRunProgress): string {
  if (progress.plan === "unknown") return "progress unknown";
  return `progress open | ${String(progress.counts.complete)} complete`;
}

export function declaredProgressDetailLabel(progress: DeclaredRunProgress): string {
  if (progress.plan === "unknown") return `unknown | ${progress.reason}`;
  const counts = progress.counts;
  const states = [
    `active ${String(counts.active)}`,
    `ready ${String(counts.ready)}`,
    `blocked ${String(counts.blocked)}`,
    `degraded ${String(counts.degraded)}`,
    `cancelled ${String(counts.cancelled)}`,
  ].join(" | ");
  return `open plan | ${String(counts.complete)} complete | ${states} | no declared total`;
}

/**
 * Run identity renders only Fabric-declared identity facts: the run kind,
 * the chair as coordination lead and the explicit delivery-workstream
 * parent/child group. Nothing is inferred from panes, processes or prose,
 * and workstreams stay grouped under their parent run, never flattened.
 */
export function runIdentityCompactLabel(identity: RunIdentity): string {
  const workstreams = identity.workstreams.length;
  return workstreams === 0
    ? identity.runKind
    : `${identity.runKind} | ${String(workstreams)} workstream${workstreams === 1 ? "" : "s"}`;
}

export function runDetailLines(summary: ConsoleRunSummary): readonly RunDetailLine[] {
  if (summary.projectSessionId === undefined) {
    throw new TypeError("exact run projection has no project-session identity");
  }
  const identity = summary.identity;
  return [
    { label: "Project session", value: summary.projectSessionId },
    { label: "Progress", value: declaredProgressDetailLabel(summary.declaredProgress) },
    { label: "Run kind", value: identity.runKind },
    { label: "Lead", value: identity.chairAgentId },
    { label: "Last event", value: identity.lastEventAt },
    ...(identity.workstreams.length === 0
      ? [{ label: "Workstreams", value: "none recorded" }]
      : identity.workstreams.map((workstream) => ({
          label: `Workstream ${workstream.workstreamId}`,
          value: `delivery ${workstream.deliveryRunId} | lead ${workstream.leadAgentId} | ${
            workstream.state
          } | last event ${workstream.lastEventAt}`,
        }))),
  ];
}
