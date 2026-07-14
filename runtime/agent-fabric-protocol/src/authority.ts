import {
  arrayOf,
  boundedString,
  defineCodec,
  integer,
  literal,
  objectCodec,
  parserBacked,
  recordOf,
  timestamp,
  unionOf,
} from "./codec.js";
import { FABRIC_OPERATIONS, OPERATION_REGISTRY, type FabricOperation } from "./operations.js";
import { relativePath } from "./codec.js";
import { budgetUnitKey } from "./resource-unit-keys.js";
import { sha256 } from "./codec.js";

export type DisclosureTarget = "local" | "approved-provider" | "external";

export type DisclosurePolicy =
  | Readonly<{ level: "allowed" }>
  | Readonly<{ level: "scoped"; scopes: readonly DisclosureTarget[] }>
  | Readonly<{ level: "forbidden" }>;

export type AuthorityEnvelopeV2 = Readonly<{
  schemaVersion: 2;
  approval: Readonly<{
    approvedBy: string;
    evidenceId: string;
    evidenceDigest: `sha256:${string}`;
  }>;
  workspaceRoots: readonly string[];
  sourcePaths: readonly string[];
  artifactPaths: readonly string[];
  actions: readonly FabricOperation[];
  deniedPaths: readonly string[];
  deniedActions: readonly FabricOperation[];
  prohibitedActions: readonly string[];
  disclosure: DisclosurePolicy;
  secrets:
    | Readonly<{ access: "none" }>
    | Readonly<{ access: "use-without-disclosure"; references: readonly string[] }>;
  deployment:
    | Readonly<{ allowed: false }>
    | Readonly<{ allowed: true; targets: readonly string[] }>;
  irreversibleActions:
    | Readonly<{ allowed: false }>
    | Readonly<{ allowed: true; actionIds: readonly string[] }>;
  network:
    | Readonly<{ toolEgress: "none" }>
    | Readonly<{ toolEgress: "allowlist"; allowedHosts: readonly string[] }>;
  expiresAt: string;
  budget: Readonly<Record<string, number>>;
}>;

const operationValues = Object.keys(OPERATION_REGISTRY) as FabricOperation[];
const firstOperation = operationValues[0];
if (firstOperation === undefined) throw new Error("AuthorityEnvelopeV2 requires at least one Fabric operation");

const operationCodec = defineCodec<FabricOperation>(
  { type: "string", enum: operationValues },
  firstOperation,
  (value, path) => {
    if (typeof value !== "string" || !(value in OPERATION_REGISTRY)) {
      throw new TypeError(`${path} must be a current Fabric operation`);
    }
    return value as FabricOperation;
  },
);
const authorityPath = unionOf([literal("."), relativePath]);
const token = boundedString({ maxBytes: 256, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$" });
const host = boundedString({ maxBytes: 253, pattern: "^[A-Za-z0-9][A-Za-z0-9.:-]{0,252}$" });

const disclosure = unionOf([
  objectCodec({ level: literal("allowed") }),
  objectCodec({
    level: literal("scoped"),
    scopes: arrayOf(
      defineCodec<DisclosureTarget>(
        { type: "string", enum: ["local", "approved-provider", "external"] },
        "local",
        (value, path) => {
          if (value !== "local" && value !== "approved-provider" && value !== "external") {
            throw new TypeError(`${path} must be a disclosure target`);
          }
          return value;
        },
      ),
      { minimum: 1, maximum: 2, unique: true },
    ),
  }),
  objectCodec({ level: literal("forbidden") }),
]);

const baseCodec = objectCodec({
  schemaVersion: literal(2),
  approval: objectCodec({ approvedBy: token, evidenceId: token, evidenceDigest: sha256 }),
  workspaceRoots: arrayOf(authorityPath, { minimum: 1, maximum: 64, unique: true }),
  sourcePaths: arrayOf(authorityPath, { maximum: 256, unique: true }),
  artifactPaths: arrayOf(authorityPath, { maximum: 256, unique: true }),
  actions: arrayOf(operationCodec, { maximum: 256, unique: true }),
  deniedPaths: arrayOf(authorityPath, { maximum: 256, unique: true }),
  deniedActions: arrayOf(operationCodec, { maximum: 256, unique: true }),
  prohibitedActions: arrayOf(token, { maximum: 256, unique: true }),
  disclosure,
  secrets: unionOf([
    objectCodec({ access: literal("none") }),
    objectCodec({
      access: literal("use-without-disclosure"),
      references: arrayOf(token, { minimum: 1, maximum: 256, unique: true }),
    }),
  ]),
  deployment: unionOf([
    objectCodec({ allowed: literal(false) }),
    objectCodec({ allowed: literal(true), targets: arrayOf(token, { minimum: 1, maximum: 256, unique: true }) }),
  ]),
  irreversibleActions: unionOf([
    objectCodec({ allowed: literal(false) }),
    objectCodec({ allowed: literal(true), actionIds: arrayOf(token, { minimum: 1, maximum: 256, unique: true }) }),
  ]),
  network: unionOf([
    objectCodec({ toolEgress: literal("none") }),
    objectCodec({
      toolEgress: literal("allowlist"),
      allowedHosts: arrayOf(host, { minimum: 1, maximum: 256, unique: true }),
    }),
  ]),
  expiresAt: timestamp,
  budget: recordOf(integer(), { maximum: 128, keyCodec: budgetUnitKey }),
}, {}, {
  example: {
    schemaVersion: 2,
    approval: {
      approvedBy: "human-maintainer",
      evidenceId: "authority-approval",
      evidenceDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    workspaceRoots: ["."],
    sourcePaths: ["."],
    artifactPaths: ["."],
    actions: [FABRIC_OPERATIONS.getTask],
    deniedPaths: [],
    deniedActions: [],
    prohibitedActions: [],
    disclosure: { level: "forbidden" },
    secrets: { access: "none" },
    deployment: { allowed: false },
    irreversibleActions: { allowed: false },
    network: { toolEgress: "none" },
    expiresAt: "2026-07-20T00:00:00Z",
    budget: {},
  },
});

function validateAuthorityEnvelopeV2(value: AuthorityEnvelopeV2, path: string): AuthorityEnvelopeV2 {
  if (!allowedPathsContained(value.sourcePaths, value.workspaceRoots)) {
    throw new TypeError(`${path}.sourcePaths must be contained by ${path}.workspaceRoots`);
  }
  if (!allowedPathsContained(value.artifactPaths, value.workspaceRoots)) {
    throw new TypeError(`${path}.artifactPaths must be contained by ${path}.workspaceRoots`);
  }
  return value;
}

export const AUTHORITY_ENVELOPE_V2_CODEC = parserBacked(
  baseCodec,
  (value, path) => validateAuthorityEnvelopeV2(value as unknown as AuthorityEnvelopeV2, path),
  baseCodec.example as unknown as AuthorityEnvelopeV2,
);

export function parseAuthorityEnvelopeV2(value: unknown, path = "authority"): AuthorityEnvelopeV2 {
  return AUTHORITY_ENVELOPE_V2_CODEC.parse(value, path);
}

function pathContained(path: string, root: string): boolean {
  return root === "." || path === root || path.startsWith(`${root}/`);
}

function allowedPathsContained(child: readonly string[], parent: readonly string[]): boolean {
  return child.every((path) => parent.some((root) => pathContained(path, root)));
}

function deniedPathsPreserved(child: readonly string[], parent: readonly string[]): boolean {
  return parent.every((path) => child.some((denial) => pathContained(path, denial)));
}

function subset(child: readonly string[], parent: readonly string[]): boolean {
  return child.every((value) => parent.includes(value));
}

function superset(child: readonly string[], parent: readonly string[]): boolean {
  return parent.every((value) => child.includes(value));
}

function disclosureContained(child: DisclosurePolicy, parent: DisclosurePolicy): boolean {
  const rank = { allowed: 0, scoped: 1, forbidden: 2 } as const;
  if (rank[child.level] < rank[parent.level]) return false;
  return child.level !== "scoped" || parent.level !== "scoped" || subset(child.scopes, parent.scopes);
}

function secretContained(child: AuthorityEnvelopeV2["secrets"], parent: AuthorityEnvelopeV2["secrets"]): boolean {
  if (parent.access === "none") return child.access === "none";
  return child.access === "none" || subset(child.references, parent.references);
}

function deploymentContained(
  child: AuthorityEnvelopeV2["deployment"],
  parent: AuthorityEnvelopeV2["deployment"],
): boolean {
  if (!parent.allowed) return !child.allowed;
  return !child.allowed || subset(child.targets, parent.targets);
}

function irreversibleContained(
  child: AuthorityEnvelopeV2["irreversibleActions"],
  parent: AuthorityEnvelopeV2["irreversibleActions"],
): boolean {
  if (!parent.allowed) return !child.allowed;
  return !child.allowed || subset(child.actionIds, parent.actionIds);
}

function networkContained(child: AuthorityEnvelopeV2["network"], parent: AuthorityEnvelopeV2["network"]): boolean {
  if (parent.toolEgress === "none") return child.toolEgress === "none";
  return child.toolEgress === "none" || subset(child.allowedHosts, parent.allowedHosts);
}

export function authorityEnvelopeV2Contained(child: AuthorityEnvelopeV2, parent: AuthorityEnvelopeV2): boolean {
  const childBudget = Object.keys(child.budget).sort();
  return child.schemaVersion === 2
    && parent.schemaVersion === 2
    && child.approval.approvedBy === parent.approval.approvedBy
    && child.approval.evidenceId === parent.approval.evidenceId
    && child.approval.evidenceDigest === parent.approval.evidenceDigest
    && allowedPathsContained(child.workspaceRoots, parent.workspaceRoots)
    && allowedPathsContained(child.sourcePaths, parent.sourcePaths)
    && allowedPathsContained(child.artifactPaths, parent.artifactPaths)
    && subset(child.actions, parent.actions)
    && deniedPathsPreserved(child.deniedPaths, parent.deniedPaths)
    && superset(child.deniedActions, parent.deniedActions)
    && superset(child.prohibitedActions, parent.prohibitedActions)
    && disclosureContained(child.disclosure, parent.disclosure)
    && secretContained(child.secrets, parent.secrets)
    && deploymentContained(child.deployment, parent.deployment)
    && irreversibleContained(child.irreversibleActions, parent.irreversibleActions)
    && networkContained(child.network, parent.network)
    && Date.parse(child.expiresAt) <= Date.parse(parent.expiresAt)
    && childBudget.every((key) => Object.hasOwn(parent.budget, key) && child.budget[key]! <= parent.budget[key]!);
}
