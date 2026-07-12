export type CodexAccount =
  | { type: "chatgpt"; email: string | null; planType: string }
  | { type: "apiKey" }
  | { type: "amazonBedrock"; credentialSource?: unknown };

export type CodexModel = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  isDefault: boolean;
};

export type RateLimitWindow = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
};

export type RateLimitSnapshot = {
  limitId: string | null;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  planType: string | null;
  rateLimitReachedType: string | null;
  credits?: { hasCredits: boolean; unlimited: boolean; balance: string | null } | null;
};

export type CodexStatus = {
  connected: boolean;
  authenticated: boolean;
  accountType: CodexAccount["type"] | null;
  email: string | null;
  planType: string | null;
  models: CodexModel[];
  rateLimits: RateLimitSnapshot[];
  error?: string;
};

export type TurnCompletion = {
  status: "completed" | "interrupted" | "failed";
  error: unknown | null;
};

