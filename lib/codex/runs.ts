export type ClaimedRun = {
  run_id: string;
  parent_run_id: string | null;
  parent_thread_id: string | null;
  parent_turn_id: string | null;
  should_fork: boolean;
};

export function chooseThreadAction(run: ClaimedRun) {
  if (!run.parent_thread_id || !run.parent_turn_id) return { type: "start" as const };
  if (run.should_fork) {
    return {
      type: "fork" as const,
      threadId: run.parent_thread_id,
      turnId: run.parent_turn_id,
    };
  }
  return { type: "resume" as const, threadId: run.parent_thread_id };
}

export function threadsToArchive(runs: Array<{ thread_id: string | null }>) {
  return [...new Set(runs.map((run) => run.thread_id).filter((id): id is string => Boolean(id)))];
}
