"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
  PanOnScrollMode,
  type Node,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nodeTypes } from "./components/Nodes";
import { edgeTypes } from "./components/Edges";
import { InputBar } from "./components/InputBar";
import { ConversationSidebar } from "./components/ConversationSidebar";
import { getLayoutedElements, getZoomPosition } from "./dagre-layout";
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

// Model provider type
type ModelProvider = "gemini" | "ollama";

// Available models configuration
const MODEL_OPTIONS: Record<ModelProvider, string[]> = {
  gemini: ["gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-pro"],
  ollama: ["gemma3:270m", "mario"],
};

// LLM API call with streaming
async function callLLM(
  payload: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    provider?: ModelProvider;
    model?: string;
  },
  onChunk: (text: string) => void
): Promise<string> {
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as { text?: string };
          if (parsed.text) {
            fullText += parsed.text;
            onChunk(fullText);
          }
        } catch {
          // Ignore parse errors
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
      // Sort by updated_at or created_at descending and pick the first one
      const sortedConversations = [...conversations].sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at).getTime();
        const dateB = new Date(b.updated_at || b.created_at).getTime();
        return dateB - dateA;
      });
      setCurrentConversationId(sortedConversations[0].id);
    }
  }, [conversations, currentConversationId]);

  const {
    conversation,
    messages: dbMessages,
    references,
    nodePositions,
    isLoading: isLoadingConversation,
    addMessage,
    updateMessage,
    deleteMessage,
    saveNodePositions,
  } = useConversation(currentConversationId);

  // Local streaming state (for messages being streamed)
  const [streamingMessages, setStreamingMessages] = useState<Map<string, { content: string; isStreaming: boolean }>>(new Map());
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<FlowEdgeData>>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [circularWarning, setCircularWarning] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>("gemini");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.5-flash-lite");
  const { setCenter } = useReactFlow();
  const lastNodeIdRef = useRef<string | null>(null);
  const hasInitialLayoutRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  const prevConversationIdRef = useRef<string | null>(null);

  // Clear local state when conversation changes
  useEffect(() => {
    if (prevConversationIdRef.current !== currentConversationId) {
      // Conversation changed - clear all local state immediately
      setNodes([]);
      setEdges([]);
      setStreamingMessages(new Map());
      setCollapsedNodes(new Set());
      setReplyingTo(null);
      setCircularWarning(null);
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

  // Canvas control state - track shift key for horizontal scroll
  const [panScrollMode, setPanScrollMode] = useState<PanOnScrollMode>(PanOnScrollMode.Vertical);
  // Invert horizontal scroll only
  const [panScrollSpeed, setPanScrollSpeed] = useState<number>(1);

  // Handle shift key for horizontal scrolling (with inverted direction)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setPanScrollMode(PanOnScrollMode.Horizontal);
        setPanScrollSpeed(-1); // Invert for horizontal
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setPanScrollMode(PanOnScrollMode.Vertical);
        setPanScrollSpeed(1); // Normal for vertical
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

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

    const newNodes: Node<FlowNodeData>[] = messages.map((msg) => {
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
          onEdit:
            msg.role === "user" && isLastInBranch(messages, msg.id)
              ? handleEdit
              : undefined,
          onToggleCollapse: () => handleToggleCollapse(msg.id),
        },
      };
    });

    const newEdges: Edge<FlowEdgeData>[] = [];

    // Add reply edges (parent-child connections)
    for (const msg of messages) {
      if (msg.parent_id) {
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
      const isCircular = wouldCreateCircle(messagesById, ref.source_message_id, ref.target_message_id);
      newEdges.push({
        id: `ref-${ref.source_message_id}-${ref.target_message_id}`,
        source: ref.source_message_id,
        target: ref.target_message_id,
        type: "reference",
        data: { edgeType: "reference", isCircular },
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
        const currentNodeIds = new Set(currentNodes.map((n) => n.id));
        const currentNodesMap = new Map(currentNodes.map((n) => [n.id, n]));
        const newNodesToAdd = newNodes.filter((n) => !currentNodeIds.has(n.id));

        if (newNodesToAdd.length > 0) {
          // Position new nodes relative to their parents
          // We need to process them in order and build up a map that includes newly positioned nodes
          const positionedNodesMap = new Map(currentNodesMap);
          const positionedNewNodes: typeof newNodesToAdd = [];

          for (const node of newNodesToAdd) {
            const parentId = messages.find((m) => m.id === node.id)?.parent_id;
            const parentNode = parentId ? positionedNodesMap.get(parentId) : null;

            let positionedNode;
            if (parentNode) {
              // Position below parent with some offset
              // Count siblings to offset horizontally
              const siblings = messages.filter((m) => m.parent_id === parentId);
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
          const updatedExisting = currentNodes.map((node) => {
            const newNode = newNodes.find((n) => n.id === node.id);
            if (newNode) {
              return { ...node, data: newNode.data };
            }
            return node;
          });

          return [...updatedExisting, ...positionedNewNodes];
        }

        // Just update existing nodes' data
        return currentNodes.map((node) => {
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
    messages,
    references,
    nodePositions,
    shortLabels,
    treeLabels,
    treeIndices,
    messagesById,
    setNodes,
    setEdges,
    handleToggleCollapse,
  ]);

  // Handle edit (delete subtree and prepare for re-entry)
  const handleEdit = useCallback(
    async (nodeId: string) => {
      const msg = messagesById.get(nodeId);
      if (!msg) return;

      try {
        await deleteMessage(nodeId);
        if (msg.parent_id) {
          setReplyingTo(msg.parent_id);
        }
      } catch (error) {
        console.error("Failed to delete message:", error);
      }
    },
    [messagesById, deleteMessage]
  );

  // Get context for LLM - aggregate ancestry and references
  const getContextMessages = useCallback(
    (nodeId: string, branchRefs: string[]) => {
      const visited = new Set<string>();
      const contextMessages: DisplayMessage[] = [];

      // Get ancestry
      const getAncestry = (id: string): DisplayMessage[] => {
        const chain: DisplayMessage[] = [];
        let current = messagesById.get(id);
        while (current && !visited.has(current.id)) {
          visited.add(current.id);
          chain.push(current);
          current = current.parent_id ? messagesById.get(current.parent_id) : undefined;
        }
        chain.reverse();
        return chain;
      };

      // Add main ancestry
      contextMessages.push(...getAncestry(nodeId));

      // Add referenced branches (entire trees)
      for (const refId of branchRefs) {
        // Get root of referenced message
        let root = messagesById.get(refId);
        while (root?.parent_id) {
          root = messagesById.get(root.parent_id);
        }
        if (root) {
          // Get all nodes in that tree
          const queue = [root.id];
          while (queue.length > 0) {
            const id = queue.shift()!;
            if (visited.has(id)) continue;
            visited.add(id);
            const msg = messagesById.get(id);
            if (msg) {
              contextMessages.push(msg);
              messages
                .filter((m) => m.parent_id === id)
                .forEach((m) => queue.push(m.id));
            }
          }
        }
      }

      // Sort by creation time
      return contextMessages.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    },
    [messagesById, messages]
  );

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

        // Create placeholder assistant message
        const assistantMsg = await addMessage({
          parent_id: userMsg.id,
          role: "assistant",
          content: "",
          model: selectedModel,
          provider: selectedProvider,
        });

        setReplyingTo(null);
        lastNodeIdRef.current = assistantMsg.id;

        // Set streaming state
        setStreamingMessages((prev) => {
          const next = new Map(prev);
          next.set(assistantMsg.id, { content: "", isStreaming: true });
          return next;
        });

        // Build context - include the new user message which may not be in state yet
        const userDisplayMsg: DisplayMessage = {
          ...userMsg,
          isStreaming: false,
          isCollapsed: false,
          branchReferences,
        };

        // Get ancestry for the parent (if any) and add the new user message
        const contextMessages: DisplayMessage[] = [];
        const visited = new Set<string>();

        if (replyingTo) {
          // Get ancestry from parent
          let current = messagesById.get(replyingTo);
          const ancestry: DisplayMessage[] = [];
          while (current && !visited.has(current.id)) {
            visited.add(current.id);
            ancestry.push(current);
            current = current.parent_id ? messagesById.get(current.parent_id) : undefined;
          }
          ancestry.reverse();
          contextMessages.push(...ancestry);
        }
        contextMessages.push(userDisplayMsg);
        visited.add(userDisplayMsg.id);

        // Add referenced branches
        for (const refId of branchReferences) {
          // Get root of referenced message
          let root = messagesById.get(refId);
          while (root?.parent_id) {
            root = messagesById.get(root.parent_id);
          }
          if (root && !visited.has(root.id)) {
            // Get all nodes in that tree
            const queue = [root.id];
            while (queue.length > 0) {
              const id = queue.shift()!;
              if (visited.has(id)) continue;
              visited.add(id);
              const msg = messagesById.get(id);
              if (msg) {
                contextMessages.push(msg);
                messages
                  .filter((m) => m.parent_id === id)
                  .forEach((m) => queue.push(m.id));
              }
            }
          }
        }

        // Sort by creation time
        contextMessages.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        // Call LLM
        const llmText = await callLLM(
          {
            messages: contextMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            provider: selectedProvider,
            model: selectedModel,
          },
          (streamedText: string) => {
            setStreamingMessages((prev) => {
              const next = new Map(prev);
              next.set(assistantMsg.id, { content: streamedText, isStreaming: true });
              return next;
            });
          }
        );

        // Update the message in the database
        await updateMessage(assistantMsg.id, llmText || "(empty response)");

        // Clear streaming state
        setStreamingMessages((prev) => {
          const next = new Map(prev);
          next.delete(assistantMsg.id);
          return next;
        });

        // Auto-set reply to the new assistant message
        setReplyingTo(assistantMsg.id);
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
      selectedProvider,
      selectedModel,
      addMessage,
      updateMessage,
      getContextMessages,
      createConversation,
    ]
  );

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
          <button
            onClick={() => setShowSidebar(true)}
            className="fixed top-4 left-4 z-50 p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* Model Selector */}
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
          <select
            value={selectedProvider}
            onChange={(e) => {
              const provider = e.target.value as ModelProvider;
              setSelectedProvider(provider);
              setSelectedModel(MODEL_OPTIONS[provider][0]);
            }}
            className="text-sm bg-transparent border-none outline-none cursor-pointer text-gray-700"
          >
            <option value="gemini">Gemini</option>
            <option value="ollama">Ollama</option>
          </select>
          <span className="text-gray-300">|</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="text-sm bg-transparent border-none outline-none cursor-pointer text-gray-600"
          >
            {MODEL_OPTIONS[selectedProvider].map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        {/* Circular warning */}
        {circularWarning && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm">
            ⚠ {circularWarning}
          </div>
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
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            className="bg-gray-50"
            // Canvas controls:
            // Ctrl + mousewheel = zoom
            zoomOnScroll={false}
            zoomActivationKeyCode="Control"
            // Mousewheel = vertical pan (up/down), Shift + mousewheel = horizontal pan (left/right)
            panOnScroll={true}
            panOnScrollMode={panScrollMode}
            panOnScrollSpeed={panScrollSpeed}
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
            <Controls className="bg-white! border-gray-200! shadow-sm!" />
          </ReactFlow>
        )}

        {/* Input Bar */}
        {currentConversationId && (
          <InputBar
            onSend={handleSend}
            messages={messages}
            shortLabels={shortLabels}
            treeLabels={treeLabels}
            treeIndices={treeIndices}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            disabled={isLoading}
          />
        )}
      </div>
    </div>
  );
}

export default function FlowPage() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
