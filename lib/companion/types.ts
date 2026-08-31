import type { CodexStatus } from "@/lib/codex/types";
import type { ClaimedRun } from "@/lib/codex/runs";

export type CompanionJobAction =
  | { type: "start" }
  | { type: "resume"; threadId: string }
  | { type: "fork"; threadId: string; turnId: string }
  | { type: "archive"; threadId: string };

export type CompanionJob =
  | {
      id: string;
      kind: "turn";
      model: string;
      prompt: string;
      action: Exclude<CompanionJobAction, { type: "archive" }>;
      assistantMessageId: string;
      clientUserMessageId: string;
    }
  | {
      id: string;
      kind: "archive";
      action: Extract<CompanionJobAction, { type: "archive" }>;
    };

export type CompanionHeartbeat = Pick<
  CodexStatus,
  "authenticated" | "accountType" | "email" | "planType" | "models" | "rateLimits" | "error"
> & { name?: string };

export type CompanionJobUpdate = {
  phase: "started" | "progress" | "completed" | "failed" | "interrupted";
  outputText?: string;
  threadId?: string;
  turnId?: string;
  error?: unknown;
};

export type CompanionClaim = ClaimedRun & {
  assistant_message_id: string;
  user_message_id: string;
};
