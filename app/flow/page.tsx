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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nodeTypes } from "./components/Nodes";
import { edgeTypes } from "./components/Edges";
import { InputBar } from "./components/InputBar";
import { ConversationSidebar } from "./components/ConversationSidebar";
import { getLayoutedElements, getZoomPosition, getNodeDimensions } from "./dagre-layout";
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

  const {
    conversation,
    messages: dbMessages,
    references,
    isLoading: isLoadingConversation,
    addMessage,
    updateMessage,
    deleteMessage,
  } = useConversation(currentConversationId);

  // Local streaming state (for messages being streamed)
  const [streamingMessages, setStreamingMessages] = useState<Map<string, { content: string; isStreaming: boolean }>>(new Map());

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<FlowEdgeData>>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [circularWarning, setCircularWarning] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>("gemini");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.5-flash-lite");
  const { setCenter, zoomIn, zoomOut, fitView } = useReactFlow();
  const lastNodeIdRef = useRef<string | null>(null);
  const hasInitialLayoutRef = useRef(false);
  const prevMessageCountRef = useRef(0);

  // Canvas control state - track shift key for horizontal scroll
  const [panScrollMode, setPanScrollMode] = useState<PanOnScrollMode>(PanOnScrollMode.Vertical);
  // Invert horizontal scroll only
  const [panScrollSpeed, setPanScrollSpeed] = useState<number>(1);
  // Track if space is held for panning
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  // Track shift for constrained movement
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  // Track drag start position for constrained movement
  const dragStartRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragAxisRef = useRef<"x" | "y" | null>(null);

  // Undo/Redo history for node positions and sizes
  type HistoryState = { nodes: Array<{ id: string; position: { x: number; y: number }; width?: number; height?: number }> };
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoRef = useRef(false);
  const nodesRef = useRef(nodes);
  const historyIndexRef = useRef(historyIndex);

  // Keep refs in sync
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  // Save current state to history (stable function using refs)
  const saveToHistory = useCallback(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    const currentState: HistoryState = {
      nodes: nodesRef.current.map((n) => ({
        id: n.id,
        position: { ...n.position },
        width: n.width,
        height: n.height,
      })),
    };
    setHistory((prev) => {
      // Remove any future states if we're not at the end
      const newHistory = prev.slice(0, historyIndexRef.current + 1);
      newHistory.push(currentState);
      // Limit history size
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 49));
  }, []); // No dependencies - uses refs

  // Undo function
  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    isUndoRedoRef.current = true;
    const prevState = history[historyIndex - 1];
    if (prevState) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const saved = prevState.nodes.find((n) => n.id === node.id);
          if (saved) {
            return {
              ...node,
              position: saved.position,
              width: saved.width,
              height: saved.height,
            };
          }
          return node;
        })
      );
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex, setNodes]);

  // Redo function
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    isUndoRedoRef.current = true;
    const nextState = history[historyIndex + 1];
    if (nextState) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const saved = nextState.nodes.find((n) => n.id === node.id);
          if (saved) {
            return {
              ...node,
              position: saved.position,
              width: saved.width,
              height: saved.height,
            };
          }
          return node;
        })
      );
      setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex, setNodes]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Track modifier keys
      if (e.key === "Shift") {
        setPanScrollMode(PanOnScrollMode.Horizontal);
        setPanScrollSpeed(-1);
        setIsShiftPressed(true);
      }
      if (e.key === " " || e.code === "Space") {
        // Prevent space from scrolling the page
        if (e.target === document.body || (e.target as HTMLElement)?.closest?.(".react-flow")) {
          e.preventDefault();
          setIsSpacePressed(true);
        }
      }

      // Don't handle shortcuts if typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd + Z = Undo
      if (isMod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl/Cmd + Shift + Z = Redo
      if (isMod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl/Cmd + 0 = Fit view
      if (isMod && (e.key === "0" || e.code === "Digit0")) {
        e.preventDefault();
        fitView({ duration: 300 });
        return;
      }

      // Ctrl/Cmd + = or + = Zoom in
      if (isMod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomIn({ duration: 200 });
        return;
      }

      // Ctrl/Cmd + - = Zoom out
      if (isMod && e.key === "-") {
        e.preventDefault();
        zoomOut({ duration: 200 });
        return;
      }

      // Ctrl/Cmd + A = Select all
      if (isMod && e.key === "a") {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        return;
      }

      // Escape = Clear selection / cancel reply
      if (e.key === "Escape") {
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
        setReplyingTo(null);
        return;
      }

      // Delete / Backspace = Delete selected nodes
      if (e.key === "Delete" || e.key === "Backspace") {
        const selectedNodes = nodes.filter((n) => n.selected);
        if (selectedNodes.length > 0) {
          e.preventDefault();
          // Delete each selected message
          for (const node of selectedNodes) {
            deleteMessage(node.id).catch(console.error);
          }
        }
        return;
      }

      // Arrow keys = Nudge selected nodes
      const arrowKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (arrowKeys.includes(e.key)) {
        const selectedNodes = nodes.filter((n) => n.selected);
        if (selectedNodes.length > 0) {
          e.preventDefault();
          const nudgeAmount = e.shiftKey ? 20 : 5; // Shift = faster nudge
          const delta = { x: 0, y: 0 };
          
          switch (e.key) {
            case "ArrowUp": delta.y = -nudgeAmount; break;
            case "ArrowDown": delta.y = nudgeAmount; break;
            case "ArrowLeft": delta.x = -nudgeAmount; break;
            case "ArrowRight": delta.x = nudgeAmount; break;
          }

          setNodes((nds) =>
            nds.map((n) =>
              n.selected
                ? { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } }
                : n
            )
          );
        }
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setPanScrollMode(PanOnScrollMode.Vertical);
        setPanScrollSpeed(1);
        setIsShiftPressed(false);
        // Clear constrained axis when shift is released
        dragAxisRef.current = null;
      }
      if (e.key === " " || e.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [nodes, undo, redo, fitView, zoomIn, zoomOut, setNodes, deleteMessage]);

  // Custom node change handler for constrained movement and history
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      // Check if any change is a position change (drag)
      const positionChanges = changes.filter(
        (c) => c.type === "position" && c.dragging !== undefined
      );

      // Handle constrained movement with Shift
      if (isShiftPressed && positionChanges.length > 0) {
        const modifiedChanges = changes.map((change) => {
          if (change.type === "position" && change.position) {
            const nodeId = change.id;
            
            // On drag start, save initial position
            if (change.dragging && !dragStartRef.current.has(nodeId)) {
              const node = nodes.find((n) => n.id === nodeId);
              if (node) {
                dragStartRef.current.set(nodeId, { ...node.position });
              }
            }

            const startPos = dragStartRef.current.get(nodeId);
            if (startPos && change.position) {
              const dx = Math.abs(change.position.x - startPos.x);
              const dy = Math.abs(change.position.y - startPos.y);

              // Determine axis on first significant movement
              if (!dragAxisRef.current && (dx > 5 || dy > 5)) {
                dragAxisRef.current = dx > dy ? "x" : "y";
              }

              // Constrain to axis
              if (dragAxisRef.current === "x") {
                change.position.y = startPos.y;
              } else if (dragAxisRef.current === "y") {
                change.position.x = startPos.x;
              }
            }

            // On drag end, clear start position
            if (!change.dragging) {
              dragStartRef.current.delete(nodeId);
              dragAxisRef.current = null;
            }
          }
          return change;
        });
        onNodesChange(modifiedChanges);
      } else {
        // Clear drag refs if shift not pressed
        if (positionChanges.some((c) => c.type === "position" && !("dragging" in c && c.dragging))) {
          dragStartRef.current.clear();
          dragAxisRef.current = null;
        }
        onNodesChange(changes);
      }

      // Save to history on drag end or resize end
      const hasEnded = changes.some(
        (c) =>
          (c.type === "position" && "dragging" in c && c.dragging === false) ||
          (c.type === "dimensions" && "resizing" in c && c.resizing === false)
      );
      if (hasEnded) {
        // Delay slightly to ensure state is updated
        setTimeout(saveToHistory, 0);
      }
    },
    [onNodesChange, isShiftPressed, nodes, saveToHistory]
  );

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
        branchReferences: branchRefs,
      };
    });
  }, [dbMessages, streamingMessages, references]);

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

  // Handle reset node to default size
  const handleResetSize = useCallback((nodeId: string) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id === nodeId) {
          const dims = getNodeDimensions(node);
          return {
            ...node,
            width: dims.width,
            height: dims.height,
          };
        }
        return node;
      })
    );
    // Save to history after reset
    setTimeout(saveToHistory, 0);
  }, [setNodes, saveToHistory]);

  // Convert messages to ReactFlow nodes and edges
  useEffect(() => {
    if (!currentConversationId) {
      setNodes([]);
      setEdges([]);
      hasInitialLayoutRef.current = false;
      return;
    }

    const messageCountChanged = messages.length !== prevMessageCountRef.current;
    const needsLayout = messageCountChanged || !hasInitialLayoutRef.current;
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

      return {
        id: msg.id,
        type: msg.role === "user" ? "user" : "agent",
        position: { x: 0, y: 0 },
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
          onResetSize: handleResetSize,
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
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        newNodes,
        newEdges
      );

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      hasInitialLayoutRef.current = true;

      if (lastNodeIdRef.current && messageCountChanged) {
        const pos = getZoomPosition(layoutedNodes, lastNodeIdRef.current);
        if (pos) {
          setTimeout(() => {
            setCenter(pos.x, pos.y, { zoom: pos.zoom, duration: 300 });
          }, 50);
        }
        lastNodeIdRef.current = null;
      }
    } else {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const newNode = newNodes.find((n) => n.id === node.id);
          if (newNode) {
            return { ...node, data: newNode.data };
          }
          return node;
        })
      );
      setEdges(newEdges);
    }
  }, [
    currentConversationId,
    messages,
    references,
    shortLabels,
    treeLabels,
    treeIndices,
    messagesById,
    setNodes,
    setEdges,
    setCenter,
    handleResetSize,
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
            // Left drag on empty space = pan, OR space+drag = pan, OR middle mouse = pan
            panOnDrag={isSpacePressed ? true : [1, 2]}
            panActivationKeyCode="Space"
            // Ctrl + left drag = selection
            selectionOnDrag={false}
            selectionKeyCode="Control"
            selectionMode={SelectionMode.Partial}
            // Disable zoom on double click
            zoomOnDoubleClick={false}
            // Don't delete nodes on backspace (we handle it ourselves)
            deleteKeyCode={null}
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
