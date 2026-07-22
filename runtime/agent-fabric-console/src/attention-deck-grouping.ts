export type ProjectedRosterGroup<Session, Run> = Readonly<{
  projectSessionId: string;
  session: Session | null;
  runs: readonly Run[];
}>;

export function compareProjectedIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function groupProjectedRosterFacts<Session, Run>(
  sessions: readonly Session[],
  runs: readonly Run[],
  sessionId: (session: Session) => string,
  runSessionId: (run: Run) => string,
  runId: (run: Run) => string,
): readonly ProjectedRosterGroup<Session, Run>[] {
  const sessionById = new Map(sessions.map((session) => [sessionId(session), session]));
  const runsBySessionId = new Map<string, Run[]>();
  for (const run of runs) {
    const id = runSessionId(run);
    const grouped = runsBySessionId.get(id) ?? [];
    grouped.push(run);
    runsBySessionId.set(id, grouped);
  }
  const groupIds = new Set([...sessionById.keys(), ...runsBySessionId.keys()]);
  return [...groupIds]
    .sort(compareProjectedIds)
    .map((projectSessionId) => ({
      projectSessionId,
      session: sessionById.get(projectSessionId) ?? null,
      runs: [...(runsBySessionId.get(projectSessionId) ?? [])].sort(
        (left, right) => compareProjectedIds(runId(left), runId(right)),
      ),
    }));
}
