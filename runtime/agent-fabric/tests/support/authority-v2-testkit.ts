import type { AuthorityInput } from "../../src/domain/types.ts";

type ClosedAuthorityFields = Pick<
  AuthorityInput,
  | "schemaVersion"
  | "approval"
  | "deniedPaths"
  | "deniedActions"
  | "prohibitedActions"
  | "secrets"
  | "deployment"
  | "irreversibleActions"
  | "network"
>;

/** Repeated closed fields for test authorities. Production parsers never default them. */
export const TEST_AUTHORITY_V2_FIELDS = {
  schemaVersion: 2,
  approval: {
    approvedBy: "test-maintainer",
    evidenceId: "test-authority-approval",
    evidenceDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  deniedPaths: [],
  deniedActions: [],
  prohibitedActions: [],
  secrets: { access: "none" },
  deployment: { allowed: false },
  irreversibleActions: { allowed: false },
  network: { toolEgress: "none" },
} as const satisfies ClosedAuthorityFields;
