type ActiveTurn = { threadId: string; turnId: string };

declare global {
  var __nestedLocalActiveTurns: Map<string, ActiveTurn> | undefined;
}

export function localActiveTurns() {
  if (!globalThis.__nestedLocalActiveTurns) globalThis.__nestedLocalActiveTurns = new Map();
  return globalThis.__nestedLocalActiveTurns;
}
