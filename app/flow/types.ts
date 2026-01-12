// Flow canvas types and utilities

export type ChatRole = "user" | "assistant";

// UI-facing message type (used by ReactFlow nodes)
export type ChatMessage = {
  id: string;
  parentId: string | null; // Reply-to connection (forms the main tree)
  role: ChatRole;
  content: string;
  createdAt: number;
  branchReferences: string[]; // @ mentioned BRANCH IDs (root node IDs)
  isStreaming?: boolean;
  isCollapsed?: boolean; // Whether the node content is collapsed
};

// Generic message interface that works with both ChatMessage and database messages
export interface MessageLike {
  id: string;
  parent_id?: string | null;
  parentId?: string | null;
  role: ChatRole;
  content: string;
  created_at?: string;
  createdAt?: number;
  branchReferences?: string[];
  isStreaming?: boolean;
  isCollapsed?: boolean;
}

// Helper to get parent ID from any message type
export function getParentId(msg: MessageLike): string | null {
  return msg.parent_id ?? msg.parentId ?? null;
}

// Helper to get creation timestamp from any message type
export function getCreatedAt(msg: MessageLike): number {
  if (msg.createdAt !== undefined) return msg.createdAt;
  if (msg.created_at) return new Date(msg.created_at).getTime();
  return 0;
}

export type NodePosition = {
  x: number;
  y: number;
};

// Tree color palettes - 5 distinct palettes for different branches (USER nodes only)
export const TREE_PALETTES = [
  { bg: "bg-blue-50", border: "border-blue-200", accent: "bg-blue-100", text: "text-blue-600", ring: "ring-blue-400", handle: "#60a5fa", hex: "#dbeafe" },
  { bg: "bg-emerald-50", border: "border-emerald-200", accent: "bg-emerald-100", text: "text-emerald-600", ring: "ring-emerald-400", handle: "#34d399", hex: "#d1fae5" },
  { bg: "bg-amber-50", border: "border-amber-200", accent: "bg-amber-100", text: "text-amber-600", ring: "ring-amber-400", handle: "#fbbf24", hex: "#fef3c7" },
  { bg: "bg-purple-50", border: "border-purple-200", accent: "bg-purple-100", text: "text-purple-600", ring: "ring-purple-400", handle: "#a855f7", hex: "#f3e8ff" },
  { bg: "bg-rose-50", border: "border-rose-200", accent: "bg-rose-100", text: "text-rose-600", ring: "ring-rose-400", handle: "#fb7185", hex: "#ffe4e6" },
] as const;

// Gray palette for AGENT nodes (always gray)
export const AGENT_PALETTE = {
  bg: "bg-gray-50", border: "border-gray-200", accent: "bg-gray-100", text: "text-gray-600", ring: "ring-gray-400", handle: "#9ca3af", hex: "#f9fafb"
} as const;

export type TreePalette = typeof TREE_PALETTES[number] | typeof AGENT_PALETTE;

// For ReactFlow node data
export type FlowNodeData = {
  message: ChatMessage;
  onReply?: (nodeId: string) => void;
  onEdit?: (nodeId: string) => void;
  onResetSize?: (nodeId: string) => void;
  isLastInBranch?: boolean;
  shortLabel: string; // e.g., "A1", "B3" for @ referencing
  treeLabel: string; // e.g., "A", "B" for branch referencing
  treeIndex: number; // Index of the tree for color palette
  isRoot: boolean; // Whether this is a root node
  treeSummary?: string; // Summary of the entire tree (for root nodes)
  palette: TreePalette;
};

// Edge types
export type EdgeType = "reply" | "reference";

export type FlowEdgeData = {
  edgeType: EdgeType;
  isCircular?: boolean; // For warning display
};

// Canvas state for backend persistence
export type CanvasState = {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

// Get all nodes in a tree (internal helper)
function getTreeNodes<T extends MessageLike>(
  messages: T[],
  rootId: string
): T[] {
  const nodes: T[] = [];
  const visited = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = messages.find((m) => m.id === id);
    if (node) {
      nodes.push(node);
      const children = messages.filter((m) => getParentId(m) === id);
      queue.push(...children.map((c) => c.id));
    }
  }

  return nodes;
}

// Generate a summary for a tree based on first user message
export function generateTreeSummary<T extends MessageLike>(
  messages: T[],
  rootId: string
): string {
  const treeNodes = getTreeNodes(messages, rootId);
  const firstUserMsg = treeNodes.find((m) => m.role === "user");
  if (!firstUserMsg) return "Empty conversation";

  const content = firstUserMsg.content;
  if (content.length <= 50) return content;
  return content.slice(0, 50) + "...";
}

// Generate short labels like A1, A2, B1, B2...
// Each root tree gets a letter, nodes within get numbers
export function generateShortLabels<T extends MessageLike>(
  messages: T[]
): { labels: Map<string, string>; treeLabels: Map<string, string>; treeIndices: Map<string, number> } {
  const labels = new Map<string, string>();
  const treeLabels = new Map<string, string>(); // Maps node ID to tree letter
  const treeIndices = new Map<string, number>(); // Maps node ID to tree index
  const roots = messages.filter((m) => !getParentId(m));

  roots.forEach((root, treeIndex) => {
    const letter = String.fromCharCode(65 + (treeIndex % 26)); // A, B, C...
    let nodeIndex = 1;

    // BFS through the tree
    const queue: string[] = [root.id];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      labels.set(nodeId, `${letter}${nodeIndex++}`);
      treeLabels.set(nodeId, letter);
      treeIndices.set(nodeId, treeIndex);

      // Find children
      const children = messages.filter((m) => getParentId(m) === nodeId);
      children.sort((a, b) => getCreatedAt(a) - getCreatedAt(b));
      queue.push(...children.map((c) => c.id));
    }
  });

  return { labels, treeLabels, treeIndices };
}

// Get all ancestors of a message (internal helper)
function getAncestry<T extends MessageLike>(
  messagesById: Map<string, T>,
  nodeId: string
): T[] {
  const chain: T[] = [];
  const visited = new Set<string>();
  let current = messagesById.get(nodeId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    const parentId = getParentId(current);
    current = parentId ? messagesById.get(parentId) : undefined;
  }

  chain.reverse();
  return chain;
}

// Detect if adding an edge would create a circular reference
export function wouldCreateCircle<T extends MessageLike>(
  messagesById: Map<string, T>,
  fromId: string,
  toId: string
): boolean {
  // Check if toId is an ancestor of fromId
  const ancestry = getAncestry(messagesById, fromId);
  return ancestry.some((m) => m.id === toId);
}

// Get the last message in a branch (leaf node)
export function isLastInBranch<T extends MessageLike>(
  messages: T[],
  nodeId: string
): boolean {
  return !messages.some((m) => getParentId(m) === nodeId);
}

