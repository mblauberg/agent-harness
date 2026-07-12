import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assertWriterAdmissionCurrent, parseResourceReservationRequest } from "../src/index.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const container = realpathSync(mkdtempSync(join(tmpdir(), "writer-admission-")));
  temporaryRoots.push(container);
  const repositoryRoot = join(container, "repository");
  const worktreePath = join(repositoryRoot, ".worktrees", "writer");
  const outside = join(container, "outside");
  mkdirSync(worktreePath, { recursive: true });
  mkdirSync(outside);
  return {
    outside,
    request: {
      commandId: "command_reserve_01",
      reservationId: "reservation_01",
      projectSessionId: "ps_01",
      path: [
        { kind: "project", scopeId: "scope_project_01", projectId: "project_01" },
        {
          kind: "project-session",
          scopeId: "scope_session_01",
          projectId: "project_01",
          projectSessionId: "ps_01",
        },
      ],
      amounts: { concurrent_turns: 1 },
      writerAdmission: {
        repositoryRoot,
        worktreePath,
        sourcePrefixes: ["future/output"],
        writerGeneration: 1,
      },
    },
    worktreePath,
  } as const;
}

describe("writer admission source-prefix containment", () => {
  it("rejects a source prefix whose nearest existing ancestor is a symlink escape", () => {
    const { outside, request, worktreePath } = fixture();
    expect(() => parseResourceReservationRequest(request)).not.toThrow();
    symlinkSync(outside, join(worktreePath, "future"), "dir");

    expect(() => parseResourceReservationRequest(request)).toThrowError(/sourcePrefixes.*symlink escape/iu);
  });

  it("rechecks containment at writer admission after filesystem state changes", () => {
    const { outside, request, worktreePath } = fixture();
    const parsed = parseResourceReservationRequest(request);
    if (parsed.writerAdmission === undefined) throw new Error("writer admission fixture is required");
    const admission = parsed.writerAdmission;
    symlinkSync(outside, join(worktreePath, "future"), "dir");

    expect(() => assertWriterAdmissionCurrent(admission)).toThrowError(/sourcePrefixes.*symlink escape/iu);
  });
});
