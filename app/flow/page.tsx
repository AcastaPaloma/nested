"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  SelectionMode,
  PanOnScrollMode,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { MarkdownContent, nodeTypes } from "./components/Nodes";
import { edgeTypes } from "./components/Edges";
import { InputBar } from "./components/InputBar";
import { ConversationSidebar } from "./components/ConversationSidebar";
import { SearchThoughts } from "./components/SearchThoughts";
import { getLayoutedElements } from "./dagre-layout";
import {
  type FlowNodeData,
  type FlowEdgeData,
  generateShortLabels,
  isLastInBranch,
  wouldCreateCircle,
  generateTreeSummary,
  TREE_PALETTES,
  AGENT_PALETTE,
} from "./types";
import { useConversation, useConversations } from "@/hooks/useConversation";
import { useAuth } from "@/hooks/useAuth";
import type { Message } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronDown, Clipboard, Database, Map as MapIcon, PanelLeft, Plus, RefreshCw, Search, Sparkles, Square, Terminal, X } from "lucide-react";
import type { CodexStatus } from "@/lib/codex/types";

type PairingStatus = {
  paired: boolean;
  online: boolean;
  companion?: {
    name: string;
    authenticated: boolean;
    email: string | null;
    planType: string | null;
    error: string | null;
    lastSeenAt: string | null;
  };
};

// LLM API call with streaming
async function callLLM(
  payload: {
    endpoint: string;
    body: unknown;
  },
  onChunk: (delta: string, fullText: string) => void
): Promise<string> {
  const res = await fetch(payload.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload.body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const line = event.split("\n").find((candidate) => candidate.startsWith("data: "));
      if (!line) continue;
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as { text?: string; error?: string } | string;
          if (typeof parsed === "object" && parsed.error) throw new Error(parsed.error);
          if (typeof parsed === "object" && parsed.text) {
            fullText += parsed.text;
            onChunk(parsed.text, fullText);
          }
        } catch (error) {
          if (error instanceof SyntaxError) continue;
          throw error;
        }
      }
    }
  }

  return fullText;
}

// Convert database Message to display format with streaming support
type DisplayMessage = Message & {
  isStreaming?: boolean;
  isCollapsed?: boolean;
  branchReferences: string[]; // For UI compatibility
};

function FlowCanvas() {
  const localMode = process.env.NEXT_PUBLIC_NESTED_LOCAL_MODE === "1";
  const { user, signOut } = useAuth();
  const {
    conversations,
    createConversation,
    deleteConversation,
    renameConversation,
  } = useConversations();

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  // Auto-load the most recent conversation on initial load
  useEffect(() => {
    if (!currentConversationId && conversations.length > 0) {
      const savedConversationId = user?.id
        ? window.localStorage.getItem(`nested:last-conversation:${user.id}`)
        : null;
      if (savedConversationId && conversations.some((conversation) => conversation.id === savedConversationId)) {
        setCurrentConversationId(savedConversationId);
        return;
      }
      // Sort by updated_at or created_at descending and pick the first one
      const sortedConversations = [...conversations].sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at).getTime();
        const dateB = new Date(b.updated_at || b.created_at).getTime();
        return dateB - dateA;
      });
      setCurrentConversationId(sortedConversations[0].id);
    }
  }, [conversations, currentConversationId, user?.id]);

  useEffect(() => {
    if (user?.id && currentConversationId) {
      window.localStorage.setItem(`nested:last-conversation:${user.id}`, currentConversationId);
    }
  }, [currentConversationId, user?.id]);

  const {
    messages: dbMessages,
    references,
    links,
    nodePositions,
    isLoading: isLoadingConversation,
    addMessage,
    updateMessage,
    deleteMessage,
    saveNodePositions,
    createMessageLink,
    deleteMessageLink,
  } = useConversation(currentConversationId);

  // Local streaming state (for messages being streamed)
  const [streamingMessages, setStreamingMessages] = useState<Map<string, { content: string; isStreaming: boolean }>>(
    new Map<string, { content: string; isStreaming: boolean }>(),
  );
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set());
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<FlowEdgeData>>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [circularWarning, setCircularWarning] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [showCodexSetup, setShowCodexSetup] = useState(false);
  const [pairingStatus, setPairingStatus] = useState<PairingStatus | null>(null);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [pairingUrl, setPairingUrl] = useState("https://nested-kuan-yis-projects.vercel.app");
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingCopied, setPairingCopied] = useState(false);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [failedRetry, setFailedRetry] = useState<{ userMessage: Message; references: string[] } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const lastNodeIdRef = useRef<string | null>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<Node<FlowNodeData>, Edge<FlowEdgeData>> | null>(null);
  const pendingFocusNodeIdRef = useRef<string | null>(null);
  const hasInitialLayoutRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  const prevConversationIdRef = useRef<string | null>(null);

  const refreshCodexStatus = useCallback(async (refresh = false) => {
    setStatusLoading(true);
    try {
      const response = await fetch(`/api/codex/status${refresh ? "?refresh=true" : ""}`);
      if (!response.ok) throw new Error("Unable to read Codex status");
      const nextStatus = (await response.json()) as CodexStatus;
      setCodexStatus(nextStatus);
      setSelectedModel((current) => {
        const available = nextStatus.models.some((model) => model.model === current);
        return available
          ? current
          : nextStatus.models.find((model) => model.isDefault)?.model ?? nextStatus.models[0]?.model ?? "";
      });
    } catch (error) {
      setCodexStatus({
        connected: false, authenticated: false, accountType: null, email: null,
        planType: null, models: [], rateLimits: [],
        error: error instanceof Error ? error.message : "Codex unavailable",
      });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => { void refreshCodexStatus(); }, [refreshCodexStatus]);

  const refreshPairingStatus = useCallback(async () => {
    if (localMode) {
      const next: PairingStatus = {
        paired: true,
        online: Boolean(codexStatus?.connected),
        companion: {
          name: "This computer",
          authenticated: Boolean(codexStatus?.authenticated),
          email: codexStatus?.email ?? null,
          planType: codexStatus?.planType ?? null,
          error: codexStatus?.error ?? null,
          lastSeenAt: new Date().toISOString(),
        },
      };
      setPairingStatus(next);
      return next;
    }
    const response = await fetch("/api/companion/pair", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to read companion status");
    const next = (await response.json()) as PairingStatus;
    setPairingStatus(next);
    return next;
  }, [codexStatus, localMode]);

  const createPairingToken = useCallback(async () => {
    setPairingLoading(true);
    try {
      const response = await fetch("/api/companion/pair", { method: "POST" });
      const result = (await response.json().catch(() => null)) as { token?: string; productionUrl?: string; error?: string } | null;
      if (!response.ok || !result?.token) throw new Error(result?.error ?? "Unable to pair this Mac");
      setPairingToken(result.token);
      if (result.productionUrl) setPairingUrl(result.productionUrl);
      setPairingStatus({ paired: true, online: false });
    } catch (error) {
      setCircularWarning(error instanceof Error ? error.message : "Unable to pair this Mac");
    } finally {
      setPairingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showCodexSetup) return;
    void refreshPairingStatus().catch(() => undefined);
    const timer = window.setInterval(() => {
      void Promise.all([refreshPairingStatus(), refreshCodexStatus(true)]).then(([pairing]) => {
        if (pairing.online && pairing.companion?.authenticated) setPairingToken(null);
      }).catch(() => undefined);
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [refreshCodexStatus, refreshPairingStatus, showCodexSetup]);

  const pairingCommand = pairingToken
    ? `npm run companion -- --pair --url ${pairingUrl}`
    : "";

  // Clear local state when conversation changes
  useEffect(() => {
    if (prevConversationIdRef.current !== currentConversationId) {
      // Conversation changed - clear all local state immediately
      setNodes([]);
      setEdges([]);
      setStreamingMessages(new Map());
      setCollapsedNodes(new Set());
      setCollapsedBranches(new Set());
      setExpandedNodeId(null);
      setReplyingTo(null);
      setPinnedMessageIds([]);
      setFailedRetry(null);
      setCircularWarning(null);
      setLinkNotice(null);
      pendingFocusNodeIdRef.current = null;
      hasInitialLayoutRef.current = false;
      prevMessageCountRef.current = 0;
      prevConversationIdRef.current = currentConversationId;
    }
  }, [currentConversationId, setNodes, setEdges]);

  // Wrapped onNodesChange handler that saves positions when nodes are moved or resized
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<FlowNodeData>>[]) => {
      onNodesChange(changes);

      // Check for position or dimension changes that indicate dragging/resizing ended
      const positionChanges = changes.filter(
        (change): change is NodeChange<Node<FlowNodeData>> & { id: string } =>
          (change.type === "position" && change.dragging === false && !!change.position) ||
          (change.type === "dimensions" && !!change.dimensions)
      );

      if (positionChanges.length > 0) {
        // Get the current nodes after applying changes
        setNodes((currentNodes) => {
          const positionsToSave: Record<string, { x: number; y: number; width?: number; height?: number }> = {};

          for (const change of positionChanges) {
            const node = currentNodes.find((n) => n.id === change.id);
            if (node) {
              positionsToSave[change.id] = {
                x: node.position.x,
                y: node.position.y,
                width: node.width,
                height: node.height,
              };
            }
          }

          if (Object.keys(positionsToSave).length > 0) {
            saveNodePositions(positionsToSave);
          }

          return currentNodes; // Don't modify, just reading
        });
      }
    },
    [onNodesChange, setNodes, saveNodePositions]
  );

  // Reply and historical-reference edges describe saved conversation state and
  // must not disappear because somebody pressed Backspace while inspecting the
  // board. Only deliberate context links are editable.
  const handleEdgesChange = useCallback((changes: EdgeChange<Edge<FlowEdgeData>>[]) => {
    onEdgesChange(changes.filter(
      (change) => change.type !== "remove" || change.id.startsWith("link-"),
    ));
  }, [onEdgesChange]);

  // Merge database messages with streaming state
  const messages: DisplayMessage[] = useMemo(() => {
    return dbMessages.map((msg) => {
      const streaming = streamingMessages.get(msg.id);
      const branchRefs = references
        .filter((r) => r.source_message_id === msg.id)
        .map((r) => r.target_message_id);

      return {
        ...msg,
        content: streaming?.content ?? msg.content,
        isStreaming: streaming?.isStreaming ?? false,
        isCollapsed: collapsedNodes.has(msg.id),
        branchReferences: branchRefs,
      };
    });
  }, [dbMessages, streamingMessages, collapsedNodes, references]);

  // Generate short labels and tree info for all messages
  const { labels: shortLabels, treeLabels, treeIndices } = useMemo(
    () => generateShortLabels(messages),
    [messages]
  );

  // Build messages map
  const messagesById = useMemo(() => {
    const map = new Map<string, DisplayMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Handle toggle collapse
  const handleToggleCollapse = useCallback((nodeId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleToggleBranch = useCallback((nodeId: string) => {
    setCollapsedBranches((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const hiddenDescendantCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of messages) {
      const queue = messages.filter((candidate) => candidate.parent_id === message.id);
      const visited = new Set<string>();
      while (queue.length > 0) {
        const descendant = queue.shift()!;
        if (visited.has(descendant.id)) continue;
        visited.add(descendant.id);
        queue.push(...messages.filter((candidate) => candidate.parent_id === descendant.id));
      }
      counts.set(message.id, visited.size);
    }
    return counts;
  }, [messages]);

  const visibleMessageIds = useMemo(() => {
    const visible = new Set<string>();
    const hidden = new Set<string>();
    const childrenByParent = new Map<string, DisplayMessage[]>();
    for (const message of messages) {
      if (!message.parent_id) continue;
      const children = childrenByParent.get(message.parent_id) ?? [];
      children.push(message);
      childrenByParent.set(message.parent_id, children);
    }
    const hideChildren = (id: string) => {
      for (const child of childrenByParent.get(id) ?? []) {
        if (hidden.has(child.id)) continue;
        hidden.add(child.id);
        hideChildren(child.id);
      }
    };
    for (const id of collapsedBranches) hideChildren(id);
    for (const message of messages) if (!hidden.has(message.id)) visible.add(message.id);
    return visible;
  }, [collapsedBranches, messages]);

  const handleToggleContextPin = useCallback((nodeId: string) => {
    setPinnedMessageIds((current) =>
      current.includes(nodeId)
        ? current.filter((id) => id !== nodeId)
        : [...current, nodeId]
    );
  }, []);

  const linkedMessageIds = useMemo(
    () => replyingTo
      ? links
        .filter((link) => link.source_message_id === replyingTo)
        .map((link) => link.target_message_id)
      : [],
    [links, replyingTo],
  );

  const showLinkNotice = useCallback((message: string) => {
    setLinkNotice(message);
    window.setTimeout(() => setLinkNotice(null), 4200);
  }, []);

  const handleConnect = useCallback((connection: Connection) => {
    const sourceId = connection.source;
    const targetId = connection.target;
    if (!sourceId || !targetId) return;
    if (sourceId === targetId) {
      showLinkNotice("A thought cannot link to itself.");
      return;
    }

    void createMessageLink(sourceId, targetId)
      .then(() => showLinkNotice("Context linked. Continue from the source node to include this path in Codex."))
      .catch((error: unknown) => showLinkNotice(error instanceof Error ? error.message : "Could not save the context link."));
  }, [createMessageLink, showLinkNotice]);

  const handleEdgesDelete = useCallback((deletedEdges: Edge<FlowEdgeData>[]) => {
    for (const edge of deletedEdges) {
      if (edge.data?.edgeType !== "context") continue;
      void deleteMessageLink(edge.source, edge.target)
        .catch((error: unknown) => showLinkNotice(error instanceof Error ? error.message : "Could not remove the context link."));
    }
  }, [deleteMessageLink, showLinkNotice]);

  // Editing a leaf removes its generated subtree and returns the composer to
  // the prior branch point.
  const handleEdit = useCallback(
    async (nodeId: string) => {
      const msg = messagesById.get(nodeId);
      if (!msg) return;

      try {
        await deleteMessage(nodeId);
        if (msg.parent_id) setReplyingTo(msg.parent_id);
      } catch (error) {
        console.error("Failed to delete message:", error);
      }
    },
    [messagesById, deleteMessage]
  );

  // Convert messages to ReactFlow nodes and edges
  useEffect(() => {
    if (!currentConversationId) {
      setNodes([]);
      setEdges([]);
      hasInitialLayoutRef.current = false;
      return;
    }

    // Guard: if messages are from a different conversation, don't render them
    // This can happen during conversation switches due to async timing
    if (dbMessages.length > 0 && dbMessages[0].conversation_id !== currentConversationId) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const messageCountChanged = messages.length !== prevMessageCountRef.current;
    // Check if we have saved positions for existing messages
    const hasSavedPositions = Object.keys(nodePositions).length > 0;
    // Check if any message is missing a saved position
    const hasNewMessagesWithoutPositions = messages.some((m) => !nodePositions[m.id]);
    // Only need layout if new messages without positions OR first load without saved positions
    const needsLayout = (messageCountChanged && hasNewMessagesWithoutPositions) || (!hasInitialLayoutRef.current && !hasSavedPositions);
    prevMessageCountRef.current = messages.length;

    const visibleMessages = messages.filter((message) => visibleMessageIds.has(message.id));
    const newNodes: Node<FlowNodeData>[] = visibleMessages.map((msg) => {
      const treeLabel = treeLabels.get(msg.id) ?? "?";
      const treeIndex = treeIndices.get(msg.id) ?? 0;
      const palette =
        msg.role === "assistant"
          ? AGENT_PALETTE
          : TREE_PALETTES[treeIndex % TREE_PALETTES.length];
      const isRoot = !msg.parent_id;
      const treeSummary = isRoot ? generateTreeSummary(messages, msg.id) : undefined;

      // Use saved position if available
      const savedPos = nodePositions[msg.id];

      return {
        id: msg.id,
        type: msg.role === "user" ? "user" : "agent",
        position: savedPos ? { x: savedPos.x, y: savedPos.y } : { x: 0, y: 0 },
        // Apply saved dimensions if available, otherwise use defaults
        width: savedPos?.width ?? 320,
        height: savedPos?.height ?? 120,
        style: {
          width: savedPos?.width ?? 320,
          height: savedPos?.height ?? 120
        },
        data: {
          message: {
            id: msg.id,
            parentId: msg.parent_id,
            role: msg.role,
            content: msg.content,
            createdAt: new Date(msg.created_at).getTime(),
            branchReferences: msg.branchReferences,
            isStreaming: msg.isStreaming,
            isCollapsed: msg.isCollapsed,
          },
          shortLabel: shortLabels.get(msg.id) ?? "?",
          treeLabel,
          treeIndex,
          isRoot,
          treeSummary,
          palette,
          isLastInBranch: isLastInBranch(messages, msg.id),
          onReply:
            msg.role === "assistant"
              ? (nodeId: string) => setReplyingTo(nodeId)
              : undefined,
          onOpen: setExpandedNodeId,
          onEdit:
            msg.role === "user" && isLastInBranch(messages, msg.id)
              ? handleEdit
              : undefined,
          onToggleCollapse: () => handleToggleCollapse(msg.id),
          onToggleBranch: () => handleToggleBranch(msg.id),
          onToggleContextPin: () => handleToggleContextPin(msg.id),
          isContextPinned: pinnedMessageIds.includes(msg.id),
          childCount: messages.filter((message) => message.parent_id === msg.id).length,
          hiddenDescendantCount: collapsedBranches.has(msg.id)
            ? hiddenDescendantCounts.get(msg.id) ?? 0
            : 0,
        },
      };
    });

    const newEdges: Edge<FlowEdgeData>[] = [];

    // Add reply edges (parent-child connections)
    for (const msg of visibleMessages) {
      if (msg.parent_id && visibleMessageIds.has(msg.parent_id)) {
        newEdges.push({
          id: `reply-${msg.parent_id}-${msg.id}`,
          source: msg.parent_id,
          target: msg.id,
          type: "reply",
          data: { edgeType: "reply" },
        });
      }
    }

    // Add reference edges (cross-branch references)
    for (const ref of references) {
      if (!visibleMessageIds.has(ref.source_message_id) || !visibleMessageIds.has(ref.target_message_id)) continue;
      const isCircular = wouldCreateCircle(messagesById, ref.source_message_id, ref.target_message_id);
      newEdges.push({
        id: `ref-${ref.source_message_id}-${ref.target_message_id}`,
        source: ref.source_message_id,
        target: ref.target_message_id,
        type: "reference",
        data: { edgeType: "reference", isCircular },
      });
    }

    // Context links are intentional, editable connections. They stay distinct
    // from the historical references that were already sent in an older turn.
    for (const link of links) {
      if (!visibleMessageIds.has(link.source_message_id) || !visibleMessageIds.has(link.target_message_id)) continue;
      newEdges.push({
        id: `link-${link.source_message_id}-${link.target_message_id}`,
        source: link.source_message_id,
        target: link.target_message_id,
        type: "context",
        data: { edgeType: "context" },
      });
    }

    if (needsLayout) {
      // Only layout nodes that don't have saved positions
      const nodesNeedingLayout = newNodes.filter((n) => !nodePositions[n.id]);
      const nodesWithSavedPos = newNodes.filter((n) => nodePositions[n.id]);

      if (nodesNeedingLayout.length > 0) {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          nodesNeedingLayout,
          newEdges
        );

        // Merge layouted nodes with nodes that have saved positions
        const allNodes = [...nodesWithSavedPos, ...layoutedNodes];
        setNodes(allNodes);
        setEdges(layoutedEdges);
      } else {
        setNodes(newNodes);
        setEdges(newEdges);
      }

      hasInitialLayoutRef.current = true;

      // Clear the lastNodeIdRef without panning
      lastNodeIdRef.current = null;
    } else if (!hasInitialLayoutRef.current && hasSavedPositions) {
      // First load with saved positions - use them directly
      setNodes(newNodes);
      setEdges(newEdges);
      hasInitialLayoutRef.current = true;
    } else {
      // Check if there are new nodes that need to be added
      setNodes((currentNodes) => {
        const visibleCurrentNodes = currentNodes.filter((node) => visibleMessageIds.has(node.id));
        const currentNodeIds = new Set(visibleCurrentNodes.map((n) => n.id));
        const currentNodesMap = new Map(visibleCurrentNodes.map((n) => [n.id, n]));
        const newNodesToAdd = newNodes.filter((n) => !currentNodeIds.has(n.id));

        if (newNodesToAdd.length > 0) {
          // Position new nodes relative to their parents
          // We need to process them in order and build up a map that includes newly positioned nodes
          const positionedNodesMap = new Map(currentNodesMap);
          const positionedNewNodes: typeof newNodesToAdd = [];

          for (const node of newNodesToAdd) {
              const parentId = visibleMessages.find((m) => m.id === node.id)?.parent_id;
            const parentNode = parentId ? positionedNodesMap.get(parentId) : null;

            let positionedNode;
            if (parentNode) {
              // Position below parent with some offset
              // Count siblings to offset horizontally
              const siblings = visibleMessages.filter((m) => m.parent_id === parentId);
              const siblingIndex = siblings.findIndex((m) => m.id === node.id);
              const horizontalOffset = siblingIndex * 350;

              positionedNode = {
                ...node,
                position: {
                  x: parentNode.position.x + horizontalOffset,
                  y: parentNode.position.y + 200,
                },
              };
            } else {
              // If no parent, place to the right of existing nodes
              let maxX = 0;
              for (const n of positionedNodesMap.values()) {
                maxX = Math.max(maxX, n.position.x + (n.width ?? 320));
              }
              positionedNode = {
                ...node,
                position: { x: maxX + 150, y: 0 },
              };
            }

            // Add to map so subsequent nodes can reference it
            positionedNodesMap.set(positionedNode.id, positionedNode);
            positionedNewNodes.push(positionedNode);
          }

          // Update existing nodes with new data
          const updatedExisting = visibleCurrentNodes.map((node) => {
            const newNode = newNodes.find((n) => n.id === node.id);
            if (newNode) {
              return { ...node, data: newNode.data };
            }
            return node;
          });

          return [...updatedExisting, ...positionedNewNodes];
        }

        // Just update existing nodes' data
        return visibleCurrentNodes.map((node) => {
          const newNode = newNodes.find((n) => n.id === node.id);
          if (newNode) {
            return { ...node, data: newNode.data };
          }
          return node;
        });
      });
      setEdges(newEdges);

      // Clear the lastNodeIdRef without panning
      lastNodeIdRef.current = null;
    }
  }, [
    currentConversationId,
    dbMessages,
    messages,
    references,
    links,
    nodePositions,
    shortLabels,
    treeLabels,
    treeIndices,
    messagesById,
    setNodes,
    setEdges,
    handleToggleCollapse,
    handleToggleBranch,
    handleToggleContextPin,
    handleEdit,
    pinnedMessageIds,
    collapsedBranches,
    hiddenDescendantCounts,
    visibleMessageIds,
  ]);


  const generateForUser = useCallback(async (userMsg: Message, branchReferences: string[]) => {
    const assistantMsg = await addMessage({
      parent_id: userMsg.id,
      role: "assistant",
      content: "",
      model: selectedModel,
      provider: "codex",
    });
    setActiveAssistantId(assistantMsg.id);
    lastNodeIdRef.current = assistantMsg.id;
    setStreamingMessages((prev) => {
      const next = new Map(prev);
      next.set(assistantMsg.id, { content: "", isStreaming: true });
      return next;
    });

    try {
      const generatedText = await callLLM(
        { endpoint: "/api/codex/generate", body: { messageId: assistantMsg.id, model: selectedModel } },
        (_delta: string, streamedText: string) => {
          setStreamingMessages((prev) => {
            const next = new Map(prev);
            next.set(assistantMsg.id, { content: streamedText, isStreaming: true });
            return next;
          });
        },
      );
      await updateMessage(assistantMsg.id, generatedText);
      setStreamingMessages((prev) => {
        const next = new Map(prev);
        next.delete(assistantMsg.id);
        return next;
      });
      setReplyingTo(assistantMsg.id);
      setFailedRetry(null);
    } catch (error) {
      setStreamingMessages((prev) => {
        const next = new Map(prev);
        next.delete(assistantMsg.id);
        return next;
      });
      setFailedRetry({ userMessage: userMsg, references: branchReferences });
      throw error;
    } finally {
      setActiveAssistantId(null);
    }
  }, [addMessage, selectedModel, updateMessage]);

  // Handle sending a message
  const handleSend = useCallback(
    async (content: string, branchReferences: string[]) => {
      if (!currentConversationId) {
        // Create a new conversation first
        try {
          const newConv = await createConversation("New Conversation");
          setCurrentConversationId(newConv.id);
          // Wait for state update then retry
          setTimeout(() => handleSend(content, branchReferences), 100);
          return;
        } catch (error) {
          console.error("Failed to create conversation:", error);
          return;
        }
      }

      // Check for circular references
      for (const refId of branchReferences) {
        if (replyingTo && wouldCreateCircle(messagesById, replyingTo, refId)) {
          setCircularWarning(
            `Warning: Reference to branch ${treeLabels.get(refId)} would create a circular context`
          );
          setTimeout(() => setCircularWarning(null), 5000);
        }
      }

      setIsLoading(true);

      try {
        // Create user message
        const userMsg = await addMessage({
          parent_id: replyingTo,
          role: "user",
          content,
          branch_references: branchReferences,
        });

        setReplyingTo(null);
        await generateForUser(userMsg, branchReferences);
      } catch (error) {
        const err = error instanceof Error ? error.message : "Unknown error";
        console.error("Error sending message:", err);
        setCircularWarning(`Error: ${err}`);
        setTimeout(() => setCircularWarning(null), 5000);
      } finally {
        setIsLoading(false);
      }
    },
    [
      currentConversationId,
      replyingTo,
      messagesById,
      treeLabels,
      addMessage,
      createConversation,
      generateForUser,
    ]
  );

  const handleRetry = useCallback(async () => {
    if (!failedRetry) return;
    setIsLoading(true);
    try {
      await generateForUser(failedRetry.userMessage, failedRetry.references);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Retry failed";
      setCircularWarning(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [failedRetry, generateForUser]);

  const handleCancel = useCallback(async () => {
    if (!activeAssistantId) return;
    try {
      const response = await fetch("/api/codex/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: activeAssistantId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Unable to stop generation");
      }
    } catch (error) {
      setCircularWarning(error instanceof Error ? error.message : "Unable to stop generation");
    }
  }, [activeAssistantId]);

  // Handle creating a new conversation
  const handleNewConversation = useCallback(async () => {
    try {
      const newConv = await createConversation("New Conversation");
      setCurrentConversationId(newConv.id);
      setReplyingTo(null);
      hasInitialLayoutRef.current = false;
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  }, [createConversation]);

  const viewportStorageKey = user?.id && currentConversationId
    ? `nested:viewport:${user.id}:${currentConversationId}`
    : null;
  const expandedMessage = expandedNodeId ? messagesById.get(expandedNodeId) : null;

  const handleFlowInit = useCallback((instance: ReactFlowInstance<Node<FlowNodeData>, Edge<FlowEdgeData>>) => {
    flowInstanceRef.current = instance;
    if (!viewportStorageKey) return;
    const saved = window.localStorage.getItem(viewportStorageKey);
    if (saved) {
      try {
        const viewport = JSON.parse(saved) as Viewport;
        if ([viewport.x, viewport.y, viewport.zoom].every(Number.isFinite)) {
          void instance.setViewport(viewport, { duration: 0 });
          return;
        }
      } catch {
        window.localStorage.removeItem(viewportStorageKey);
      }
    }
    window.requestAnimationFrame(() => void instance.fitView({ padding: 0.2, duration: 250 }));
  }, [viewportStorageKey]);

  const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    if (viewportStorageKey) {
      window.localStorage.setItem(viewportStorageKey, JSON.stringify(viewport));
    }
  }, [viewportStorageKey]);

  const handleOverview = useCallback(() => {
    void flowInstanceRef.current?.fitView({ padding: 0.18, duration: 240, maxZoom: 1.1 });
  }, []);

  const handleSearchSelect = useCallback((result: {
    conversationId: string;
    messageId?: string;
  }) => {
    pendingFocusNodeIdRef.current = result.messageId ?? null;
    setCurrentConversationId(result.conversationId);
    setSearchOpen(false);
  }, []);

  useEffect(() => {
    const nodeId = pendingFocusNodeIdRef.current;
    if (!nodeId || !currentConversationId) return;
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;

    pendingFocusNodeIdRef.current = null;
    setNodes((current) => current.map((candidate) => ({
      ...candidate,
      selected: candidate.id === nodeId,
    })));
    void flowInstanceRef.current?.fitView({ nodes: [node], padding: 0.7, duration: 260, maxZoom: 1.15 });
  }, [currentConversationId, nodes, setNodes]);

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "0") {
        event.preventDefault();
        handleOverview();
      }
    };
    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [handleOverview]);

  const focusComposer = useCallback((parentId: string | null) => {
    setReplyingTo(parentId);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('[data-flow-composer="true"]')?.focus();
    });
  }, []);

  return (
    <div className="w-screen h-screen bg-white flex">
      {/* Sidebar */}
      {showSidebar && (
        <ConversationSidebar
          conversations={conversations}
          currentId={currentConversationId}
          onSelect={setCurrentConversationId}
          onCreate={handleNewConversation}
          onDelete={deleteConversation}
          onRename={renameConversation}
          onClose={() => setShowSidebar(false)}
          user={user}
          onSignOut={signOut}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 relative">
        {/* Toggle Sidebar Button */}
        {!showSidebar && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowSidebar(true)}
            className="fixed top-4 left-4 z-50 shadow-sm"
            aria-label="Open conversations"
          >
            <PanelLeft />
          </Button>
        )}

        {/* Model Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="fixed top-4 right-4 z-50 bg-background/95 shadow-sm backdrop-blur">
              <Sparkles />
              <span>
                {codexStatus?.authenticated
                  ? `Codex · ${
                      codexStatus.accountType === "apiKey"
                        ? "API key"
                        : codexStatus.accountType === "amazonBedrock"
                          ? "Amazon Bedrock"
                          : `ChatGPT ${codexStatus.planType ?? ""}`
                    }`.trim()
                  : "Connect your Codex"}
              </span>
              <Badge variant="secondary" className="hidden font-mono font-normal sm:inline-flex">
                {selectedModel}
              </Badge>
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Model</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={selectedModel} onValueChange={setSelectedModel}>
              {(codexStatus?.models.map((model) => model.model) ?? []).map((model) => (
                <DropdownMenuRadioItem key={model} value={model} className="font-mono text-xs">
                  {model}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <div className="space-y-2 px-2 py-1.5 text-xs text-muted-foreground">
                {codexStatus?.authenticated ? (
                  <>
                    <p>{codexStatus.email ?? "ChatGPT account"} · <span className="capitalize">{codexStatus.planType}</span></p>
                    {codexStatus.rateLimits.flatMap((limit) => [limit.primary, limit.secondary]).filter(Boolean).map((window, index) => (
                      <p key={index}>{Math.round(window!.usedPercent)}% used{window!.resetsAt ? ` · resets ${new Date(window!.resetsAt * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</p>
                    ))}
                  </>
                ) : (
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => setShowCodexSetup(true)}>
                    <Terminal /> Connect your Codex
                  </Button>
                )}
                {codexStatus?.error && <p className="text-destructive">{codexStatus.error}</p>}
                <button className="flex items-center gap-1 hover:text-foreground" onClick={() => void refreshCodexStatus(true)}>
                  <RefreshCw className={statusLoading ? "animate-spin" : ""} /> Refresh
                </button>
            </div>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Esc closes this menu</p>
          </DropdownMenuContent>
        </DropdownMenu>

        {!statusLoading && codexStatus && !codexStatus.authenticated && (
          <Button
            onClick={() => setShowCodexSetup(true)}
            className="fixed right-4 top-16 z-50 shadow-lg"
          >
            <Terminal /> Connect your Codex
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => focusComposer(null)}
          className={`fixed top-4 z-50 bg-background/95 shadow-sm backdrop-blur ${showSidebar ? "left-[19rem]" : "left-16"}`}
        >
          <Plus /> New root
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setSearchOpen(true)}
          className={`fixed top-4 z-50 bg-background/95 shadow-sm backdrop-blur ${showSidebar ? "left-[28rem]" : "left-44"}`}
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search /> Find
          <kbd className="hidden rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground sm:inline">⌘K</kbd>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleOverview}
          className="fixed bottom-4 left-4 z-50 bg-background/95 shadow-sm backdrop-blur"
          aria-keyshortcuts="Control+0 Meta+0"
        >
          <MapIcon /> Overview
        </Button>

        {/* Circular warning */}
        {circularWarning && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm">
            ⚠ {circularWarning}
          </div>
        )}

        {linkNotice && (
          <div className="fixed bottom-5 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-900 shadow-sm">
            {linkNotice}
          </div>
        )}

        {activeAssistantId && (
          <Button variant="outline" size="sm" onClick={handleCancel} className="fixed right-4 top-16 z-50 bg-background/95 shadow-sm">
            <Square className="fill-current" /> Stop
          </Button>
        )}

        {failedRetry && !isLoading && (
          <Button variant="outline" size="sm" onClick={handleRetry} className="fixed left-1/2 top-16 z-50 -translate-x-1/2 bg-background/95 shadow-sm">
            <RefreshCw /> Retry failed response
          </Button>
        )}

        {/* Loading State */}
        {isLoadingConversation && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-40">
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading conversation...
            </div>
          </div>
        )}

        {/* Empty State */}
        {!currentConversationId && !isLoadingConversation && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-lg font-medium mb-2">No conversation selected</p>
            <p className="text-sm text-gray-400 mb-4">Select a conversation from the sidebar or create a new one</p>
            <button
              onClick={handleNewConversation}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              New Conversation
            </button>
          </div>
        )}

        {/* ReactFlow Canvas */}
        {currentConversationId && (
          <ReactFlow
            key={currentConversationId}
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onEdgesDelete={handleEdgesDelete}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={handleFlowInit}
            onMoveEnd={handleMoveEnd}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            className="bg-gray-50"
            // Canvas controls:
            // Ctrl + mousewheel = zoom
            zoomOnScroll={false}
            zoomActivationKeyCode={["Control", "Meta"]}
            // Trackpad and mouse-wheel movement can pan in both directions.
            panOnScroll={true}
            panOnScrollMode={PanOnScrollMode.Free}
            panOnScrollSpeed={1}
            // Left drag = pan canvas
            panOnDrag={true}
            // Ctrl + left drag = selection
            selectionOnDrag={false}
            selectionKeyCode="Control"
            selectionMode={SelectionMode.Partial}
            // Disable zoom on double click
            zoomOnDoubleClick={false}
          >
            <Background color="#e5e7eb" gap={20} />
            <Controls position="bottom-left" className="mb-12 bg-white! border-gray-200! shadow-sm!" />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeColor={(node) => node.type === "agent" ? "#e5e7eb" : "#bfdbfe"}
              className="!bottom-36 !right-4 !rounded-xl !border !border-gray-200 !bg-white/90 !shadow-sm"
              maskColor="rgb(249 250 251 / 0.72)"
            />
          </ReactFlow>
        )}

        {expandedMessage && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" onMouseDown={() => setExpandedNodeId(null)}>
            <section
              role="dialog"
              aria-modal="true"
              aria-label={expandedMessage.role === "assistant" ? "Full agent response" : "Full message"}
              className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header className="flex items-center gap-3 border-b px-5 py-4">
                <Badge variant="secondary" className="font-mono">{shortLabels.get(expandedMessage.id)}</Badge>
                <div>
                  <h2 className="font-semibold">{expandedMessage.role === "assistant" ? "Agent response" : "Your message"}</h2>
                  <p className="text-xs text-muted-foreground">Full message · scroll without resizing the board</p>
                </div>
                <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setExpandedNodeId(null)} aria-label="Close full message">
                  <X />
                </Button>
              </header>
              <div className="overflow-y-auto px-6 py-5 sm:px-8">
                <MarkdownContent content={expandedMessage.content} />
              </div>
              {expandedMessage.role === "assistant" && (
                <footer className="flex justify-end border-t px-5 py-3">
                  <Button onClick={() => { focusComposer(expandedMessage.id); setExpandedNodeId(null); }}>
                    <Plus /> Continue from this response
                  </Button>
                </footer>
              )}
            </section>
          </div>
        )}

        {showCodexSetup && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" onMouseDown={() => setShowCodexSetup(false)}>
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Connect your Codex account"
              className="w-full max-w-xl overflow-hidden rounded-2xl border bg-background shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header className="flex items-start gap-3 border-b px-5 py-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Terminal className="size-5" />
                </div>
                <div>
                  <h2 className="font-semibold">Connect your own Codex</h2>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    The companion securely connects production Nested to the Codex CLI on your Mac. Your ChatGPT credentials never leave Codex&apos;s local credential store.
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="ml-auto shrink-0" onClick={() => setShowCodexSetup(false)} aria-label="Close Codex setup">
                  <X />
                </Button>
              </header>
              <div className="space-y-4 p-5">
                {pairingStatus?.online && pairingStatus.companion?.authenticated ? (
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                    <div>
                      <h3 className="text-sm font-medium">Your Codex is connected</h3>
                      <p className="mt-1 text-xs">{pairingStatus.companion.email ?? "Codex account"} · {pairingStatus.companion.planType ?? "authenticated"}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <Badge variant="secondary">1</Badge>
                        <h3 className="text-sm font-medium">Confirm Codex is signed in</h3>
                      </div>
                      <code className="block rounded-lg bg-muted px-3 py-2 font-mono text-xs">codex login</code>
                      <p className="mt-2 text-xs text-muted-foreground">You can skip this if Codex already says you are logged in.</p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <Badge variant="secondary">2</Badge>
                        <h3 className="text-sm font-medium">Start the Nested companion</h3>
                      </div>
                      {pairingToken ? (
                        <>
                          <p className="mb-2 text-xs text-muted-foreground">First copy this one-time token:</p>
                          <div className="relative rounded-lg bg-muted p-3 pr-11">
                            <code className="block overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">{pairingToken}</code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-1.5 top-1.5"
                              onClick={() => {
                                void navigator.clipboard.writeText(pairingToken);
                                setPairingCopied(true);
                                window.setTimeout(() => setPairingCopied(false), 1500);
                              }}
                              aria-label="Copy pairing token"
                            >
                              {pairingCopied ? <CheckCircle2 /> : <Clipboard />}
                            </Button>
                          </div>
                          <p className="mb-2 mt-3 text-xs text-muted-foreground">Then run this from the Nested project folder and paste the token at the hidden prompt:</p>
                          <code className="block overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 font-mono text-xs">{pairingCommand}</code>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">The token never enters shell history or process arguments. It is saved locally with owner-only permissions; rotating it revokes the old one.</p>
                        </>
                      ) : (
                        <Button onClick={() => void createPairingToken()} disabled={pairingLoading}>
                          {pairingLoading ? <RefreshCw className="animate-spin" /> : <Terminal />}
                          {pairingStatus?.paired ? "Rotate token and show command" : "Create pairing command"}
                        </Button>
                      )}
                    </div>
                    {pairingStatus?.paired && !pairingStatus.online && (
                      <p className="text-xs text-muted-foreground">A Mac is paired but offline. Start the companion, or rotate the token if you no longer have it.</p>
                    )}
                  </>
                )}
              </div>
              <footer className="flex justify-end gap-2 border-t px-5 py-3">
                <Button variant="ghost" onClick={() => setShowCodexSetup(false)}>Close</Button>
                <Button onClick={() => void Promise.all([refreshPairingStatus(), refreshCodexStatus(true)])}>
                  <RefreshCw className={statusLoading ? "animate-spin" : ""} /> Check connection
                </Button>
              </footer>
            </section>
          </div>
        )}

        {/* Input Bar */}
        {currentConversationId && (
          <InputBar
            onSend={handleSend}
            messages={messages}
            shortLabels={shortLabels}
            treeLabels={treeLabels}
            replyingTo={replyingTo}
            pinnedMessageIds={pinnedMessageIds}
            linkedMessageIds={linkedMessageIds}
            onTogglePin={handleToggleContextPin}
            onCancelReply={() => setReplyingTo(null)}
            disabled={isLoading || !codexStatus?.authenticated || !selectedModel}
          />
        )}

        <SearchThoughts
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSelect={handleSearchSelect}
        />
      </div>
    </div>
  );
}

export default function FlowPage() {
  if (
    process.env.NEXT_PUBLIC_NESTED_LOCAL_MODE !== "1" && (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <section className="w-full max-w-xl rounded-2xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
          <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Database className="size-5" />
          </div>
          <Badge variant="secondary" className="mb-3">Local setup</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Connect Nested&apos;s conversation store</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The UI is ready, but this checkout has no Supabase credentials. Add these public values to
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.env.local</code>
            and restart the dev server.
          </p>
          <div className="mt-5 space-y-2 rounded-xl border bg-muted/40 p-4 font-mono text-xs">
            <p>NEXT_PUBLIC_SUPABASE_URL=…</p>
            <p>NEXT_PUBLIC_SUPABASE_ANON_KEY=…</p>
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Generation uses your local Codex session. Conversation persistence uses Supabase.
          </p>
        </section>
      </main>
    );
  }

  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
