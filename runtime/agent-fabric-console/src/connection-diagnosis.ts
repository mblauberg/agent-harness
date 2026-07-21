import type { Timestamp } from "@local/agent-fabric-protocol";

import {
  revisionFromProtocol,
  type ConsoleFreshness,
  type Revision,
} from "./model.js";

/**
 * A projection-only account of the bootstrap stages. It is derived from the
 * typed bootstrap outcome and never becomes a retry state machine or source
 * of lifecycle truth.
 */
export const CONSOLE_CONNECTION_STAGE_ORDER = Object.freeze([
  "configuration",
  "compatibility",
  "daemon-readiness",
  "transport",
  "handshake-authentication",
  "feature-negotiation",
  "project-discovery",
  "session-attachment",
] as const);

export type ConsoleConnectionStageId =
  (typeof CONSOLE_CONNECTION_STAGE_ORDER)[number];

export type ConsoleConnectionStageState =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "blocked"
  | "unavailable"
  | "not-applicable";

/**
 * Distinguishes a stage whose state comes directly from the reported
 * bootstrap reason ("observed") from a stage whose state is only a
 * console-authored inference from stage order ("inferred"). Two simultaneous
 * faults can surface a single reason, so an "inferred" passed/blocked stage
 * is not proof that stage actually ran or was blocked — only the causal
 * failed stage may claim "observed" status.
 */
export type ConsoleConnectionStageProvenance = "observed" | "inferred";

export type BootstrapUnavailableReason =
  | "feature-unavailable"
  | "configuration-missing"
  | "schema-cutover-required"
  | "authority-unavailable"
  | "daemon-unreachable"
  | "daemon-incompatible"
  | "socket-unavailable"
  | "daemon-election-conflict"
  | "daemon-spawn-failed"
  | "bootstrap-receipt-invalid"
  | "start-failed";

export type ConsoleConnectionStage = Readonly<{
  id: ConsoleConnectionStageId;
  label: string;
  state: ConsoleConnectionStageState;
  provenance: ConsoleConnectionStageProvenance;
  code: string | null;
  summary: string;
  remediation: string;
  source: "fabric";
  revision: Revision;
  observedAt: Timestamp;
  freshness: ConsoleFreshness;
  references: readonly string[];
}>;

export type ConsoleConnectionDiagnosis = Readonly<{
  schemaVersion: 1;
  causalStage: ConsoleConnectionStageId | null;
  firstFailureCode: string | null;
  stages: readonly ConsoleConnectionStage[];
}>;

type FailureDetail = Readonly<{
  causalStage: ConsoleConnectionStageId | null;
  code: string | null;
  summary: string;
  remediation: string;
}>;

/**
 * Single source of per-reason narrative text. protocol-adapter.ts's
 * daemon-row detail strings derive from this map rather than maintaining a
 * second, independently hand-written enumeration of the same 11 reasons.
 */
export const BOOTSTRAP_FAILURE_DETAILS: Readonly<Record<BootstrapUnavailableReason, FailureDetail>> = {
  "feature-unavailable": {
    causalStage: "feature-negotiation",
    code: "CONSOLE_FEATURE_UNAVAILABLE",
    summary: "the required Console feature was not negotiated",
    remediation: "Adopt the current Fabric build, then retry bootstrap.",
  },
  "configuration-missing": {
    causalStage: "configuration",
    code: "CONSOLE_CONFIGURATION_UNAVAILABLE",
    summary: "workspace trust configuration was unavailable",
    remediation: "Run fabric doctor to repair project configuration, then retry.",
  },
  "schema-cutover-required": {
    causalStage: "compatibility",
    code: "SCHEMA_CUTOVER_REQUIRED",
    summary: "the current protocol or database schema requires cutover",
    remediation: "Adopt the current schema; the existing database remains preserved.",
  },
  "authority-unavailable": {
    causalStage: "session-attachment",
    code: "CONSOLE_AUTHORITY_UNAVAILABLE",
    summary: "the requested project session was not attachable under this authority",
    remediation: "Select an attachable session or obtain the exact scoped operator authority.",
  },
  "daemon-unreachable": {
    causalStage: "daemon-readiness",
    code: "CONSOLE_DAEMON_UNREACHABLE",
    summary: "daemon election or process readiness did not produce a reachable daemon",
    remediation: "Inspect fabric doctor for daemon readiness, then retry bootstrap.",
  },
  "daemon-incompatible": {
    causalStage: "compatibility",
    code: "CONSOLE_DAEMON_INCOMPATIBLE",
    summary: "the running Fabric daemon was protocol-incompatible",
    remediation: "Stop the incompatible daemon and retry with the current build.",
  },
  "socket-unavailable": {
    causalStage: "transport",
    code: "CONSOLE_SOCKET_UNAVAILABLE",
    summary: "the trusted Fabric daemon socket was unavailable",
    remediation: "Reconcile the trusted daemon socket, then retry bootstrap.",
  },
  "daemon-election-conflict": {
    causalStage: "daemon-readiness",
    code: "CONSOLE_DAEMON_ELECTION_CONFLICT",
    summary: "a concurrent Fabric daemon bootstrap prevented election from settling",
    remediation: "Wait for the competing bootstrap to settle, then retry.",
  },
  "daemon-spawn-failed": {
    causalStage: "daemon-readiness",
    code: "CONSOLE_DAEMON_SPAWN_FAILED",
    summary: "the Fabric daemon failed to launch",
    remediation: "Inspect fabric doctor for the failed bootstrap stage, then retry.",
  },
  "bootstrap-receipt-invalid": {
    causalStage: "daemon-readiness",
    code: "CONSOLE_BOOTSTRAP_RECEIPT_INVALID",
    summary: "the Fabric bootstrap receipt was invalid",
    remediation: "Reconcile the daemon bootstrap receipt, then retry.",
  },
  "start-failed": {
    causalStage: null,
    code: null,
    summary: "bootstrap did not identify a causal stage",
    remediation: "Run fabric doctor for staged diagnostics before retrying.",
  },
};

const STAGE_LABELS: Readonly<Record<ConsoleConnectionStageId, string>> = {
  configuration: "configuration discovery",
  compatibility: "compatibility and pins",
  "daemon-readiness": "daemon election and process readiness",
  transport: "socket or transport connection",
  "handshake-authentication": "protocol handshake and authentication",
  "feature-negotiation": "feature negotiation",
  "project-discovery": "project discovery",
  "session-attachment": "project-session attachment",
};

function stageFreshness(
  provenance: ConsoleConnectionStageProvenance,
  reason: BootstrapUnavailableReason,
  revision: Revision,
  observedAt: Timestamp,
): ConsoleFreshness {
  // Only the causal failed stage carries an actual Fabric-reported fact (the
  // bootstrap reason). Every other stage's state is a console-authored
  // inference from stage order, never independently observed — it must not
  // be stamped with the same freshness a genuinely observed fact would get.
  return {
    state: "unavailable",
    source: "fabric",
    revision,
    observedAt,
    ageMs: 0,
    reason: provenance === "observed" ? reason : `inferred-from-causal-stage:${reason}`,
  };
}

export function createConnectionDiagnosis(
  reason: BootstrapUnavailableReason,
  nowMs: number,
): ConsoleConnectionDiagnosis {
  if (!Number.isFinite(nowMs)) {
    throw new TypeError("bootstrap diagnosis time must be finite");
  }
  const detail = BOOTSTRAP_FAILURE_DETAILS[reason];
  const observedAt = new Date(nowMs).toISOString() as Timestamp;
  const revision = revisionFromProtocol(0);
  const causalIndex = detail.causalStage === null
    ? -1
    : CONSOLE_CONNECTION_STAGE_ORDER.indexOf(detail.causalStage);
  const stages = CONSOLE_CONNECTION_STAGE_ORDER.map((id, index): ConsoleConnectionStage => {
    const state: ConsoleConnectionStageState = causalIndex < 0
      ? "unavailable"
      : index < causalIndex
        ? "passed"
        : index === causalIndex
          ? "failed"
          : "blocked";
    const isFailed = state === "failed";
    // Only the causal failed stage is Fabric-observed: it is the one stage
    // whose state comes directly from the reported bootstrap reason. Every
    // other stage's state (passed/blocked/unavailable) is inferred purely
    // from stage order and must say so, since a single reported reason can
    // mask a second, simultaneous fault in an "inferred" stage.
    const provenance: ConsoleConnectionStageProvenance = isFailed ? "observed" : "inferred";
    const summary = isFailed
      ? detail.summary
      : state === "passed"
        ? "inferred as completed before the causal bootstrap failure; not independently observed"
        : state === "blocked"
          ? `inferred as not executed because ${detail.causalStage} failed; not independently observed`
          : "stage evidence unavailable; no causal stage was identified";
    return {
      id,
      label: STAGE_LABELS[id],
      state,
      provenance,
      code: isFailed ? detail.code : null,
      summary,
      remediation: isFailed
        ? detail.remediation
        : state === "blocked"
          ? `Resolve ${detail.causalStage} before retrying this stage.`
          : state === "passed"
            ? "No remediation required for this inferred stage."
            : detail.remediation,
      source: "fabric",
      revision,
      observedAt,
      freshness: stageFreshness(provenance, reason, revision, observedAt),
      references: [],
    };
  });
  return {
    schemaVersion: 1,
    causalStage: detail.causalStage,
    firstFailureCode: detail.code,
    stages,
  };
}

export function connectionDiagnosisRows(
  diagnosis: ConsoleConnectionDiagnosis,
  nowMs: number,
): readonly Readonly<{
  stableId: string;
  revision: Revision;
  urgency: "safety-integrity" | "normal";
  freshness: ConsoleFreshness;
  summary: Readonly<{
    kind: "system";
    systemKind: "daemon";
    state: "healthy" | "unavailable";
    detail: string;
  }>;
}>[] {
  return diagnosis.stages.map((stage) => ({
    stableId: `bootstrap:stage:${stage.id}`,
    revision: stage.revision,
    urgency: stage.state === "failed" ? "safety-integrity" : "normal",
    freshness: {
      ...stage.freshness,
      ageMs: Math.max(0, Math.trunc(nowMs - Date.parse(stage.observedAt))),
    },
    summary: {
      kind: "system",
      systemKind: "daemon",
      state: stage.state === "passed" ? "healthy" : "unavailable",
      detail: `${stage.id} | ${stage.state} (${stage.provenance}) | code: ${stage.code ?? "none"} | ${stage.summary} | remediation: ${stage.remediation}`,
    },
  }));
}

export function connectionDiagnosisDetailLines(
  diagnosis: ConsoleConnectionDiagnosis,
): readonly Readonly<{ label: string; value: string }>[] {
  return [
    {
      label: "Connection diagnosis",
      value: diagnosis.causalStage === null
        ? "causal stage unavailable"
        : `failed at ${diagnosis.causalStage}`,
    },
    ...(diagnosis.firstFailureCode === null
      ? []
      : [{ label: "Bootstrap failure code", value: diagnosis.firstFailureCode }]),
    ...diagnosis.stages.map((stage) => ({
      label: `Bootstrap ${stage.id}`,
      value: `${stage.state} (${stage.provenance}) | ${stage.summary} | remediation: ${stage.remediation}`,
    })),
  ];
}
