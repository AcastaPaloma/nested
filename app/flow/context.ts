import { getCreatedAt, getParentId, type MessageLike } from "./types";

export const DEFAULT_CONTEXT_BUDGET = 12_000;

export type ContextSource = "path" | "pin";

export type ContextEntry<T extends MessageLike> = {
  message: T;
  source: ContextSource;
};

export type ContextPlan<T extends MessageLike> = {
  included: ContextEntry<T>[];
  omitted: T[];
  estimatedTokens: number;
  budget: number;
};

export function estimateTokens(content: string) {
  return Math.max(1, Math.ceil(content.length / 4) + 4);
}

function getPath<T extends MessageLike>(
  messagesById: Map<string, T>,
  nodeId: string | null
) {
  const path: T[] = [];
  const visited = new Set<string>();
  let current = nodeId ? messagesById.get(nodeId) : undefined;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.push(current);
    const parentId = getParentId(current);
    current = parentId ? messagesById.get(parentId) : undefined;
  }

  return path.reverse();
}

/** Build a bounded prompt without silently importing entire sibling branches. */
export function buildContextPlan<T extends MessageLike>({
  messages,
  activeNodeId,
  pinnedNodeIds,
  draft = "",
  budget = DEFAULT_CONTEXT_BUDGET,
}: {
  messages: T[];
  activeNodeId: string | null;
  pinnedNodeIds: string[];
  draft?: string;
  budget?: number;
}): ContextPlan<T> {
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const activePath = getPath(messagesById, activeNodeId);
  const activeIds = new Set(activePath.map((message) => message.id));
  const pinnedPaths = pinnedNodeIds.flatMap((id) => getPath(messagesById, id));

  const candidates = new Map<string, ContextEntry<T>>();
  for (const message of pinnedPaths) {
    candidates.set(message.id, { message, source: "pin" });
  }
  for (const message of activePath) {
    candidates.set(message.id, { message, source: "path" });
  }

  let remaining = Math.max(0, budget - estimateTokens(draft));
  const selected = new Set<string>();
  const priority = [
    ...activePath.slice().reverse(),
    ...pinnedNodeIds.flatMap((id) => getPath(messagesById, id).slice().reverse()),
  ];

  for (const message of priority) {
    if (selected.has(message.id)) continue;
    const cost = estimateTokens(message.content);
    if (cost <= remaining || selected.size === 0) {
      selected.add(message.id);
      remaining = Math.max(0, remaining - cost);
    }
  }

  const included = [...candidates.values()]
    .filter(({ message }) => selected.has(message.id))
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === "pin" ? -1 : 1;
      return getCreatedAt(a.message) - getCreatedAt(b.message);
    });

  for (const entry of included) {
    if (activeIds.has(entry.message.id)) entry.source = "path";
  }

  const omitted = [...candidates.values()]
    .map(({ message }) => message)
    .filter((message) => !selected.has(message.id));
  const estimatedTokens =
    estimateTokens(draft) +
    included.reduce((total, entry) => total + estimateTokens(entry.message.content), 0);

  return { included, omitted, estimatedTokens, budget };
}
