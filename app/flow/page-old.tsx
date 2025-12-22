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
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nodeTypes } from "./components/Nodes";
import { edgeTypes } from "./components/Edges";
import { InputBar } from "./components/InputBar";
import { getLayoutedElements, getZoomPosition } from "./dagre-layout";
import {
  type ChatMessage,
  type FlowNodeData,
  type FlowEdgeData,
  createId,
  generateShortLabels,
  aggregateContext,
  isLastInBranch,
  deleteSubtree,
  wouldCreateCircle,
  generateTreeSummary,
  TREE_PALETTES,
  AGENT_PALETTE,
} from "./types";

// Model provider type
type ModelProvider = 'gemini' | 'ollama';

// Available models configuration
const MODEL_OPTIONS: Record<ModelProvider, string[]> = {
  gemini: ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  ollama: ['gemma3:270m', 'mario'],
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

function FlowCanvas() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<FlowEdgeData>>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [circularWarning, setCircularWarning] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash-lite');
  const { setCenter } = useReactFlow();
  const lastNodeIdRef = useRef<string | null>(null);
  const hasInitialLayoutRef = useRef(false);
  const prevMessageCountRef = useRef(0);

  // Generate short labels and tree info for all messages
  const { labels: shortLabels, treeLabels, treeIndices } = useMemo(
    () => generateShortLabels(messages),
    [messages]
  );

  // Build messages map
  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Handle toggle collapse
  const handleToggleCollapse = useCallback((nodeId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === nodeId ? { ...m, isCollapsed: !m.isCollapsed } : m
      )
    );
  }, []);

  // Convert messages to ReactFlow nodes and edges
  // Only re-layout when messages are added/removed, not when collapse state changes
  useEffect(() => {
    const messageCountChanged = messages.length !== prevMessageCountRef.current;
    const needsLayout = messageCountChanged || !hasInitialLayoutRef.current;
    prevMessageCountRef.current = messages.length;

    const newNodes: Node<FlowNodeData>[] = messages.map((msg) => {
      const treeLabel = treeLabels.get(msg.id) ?? "?";
      const treeIndex = treeIndices.get(msg.id) ?? 0;
      // Agent nodes always gray, User nodes get tree palette
      const palette = msg.role === "assistant"
        ? AGENT_PALETTE
        : TREE_PALETTES[treeIndex % TREE_PALETTES.length];
      const isRoot = !msg.parentId;
      const treeSummary = isRoot ? generateTreeSummary(messages, msg.id) : undefined;

      return {
        id: msg.id,
        type: msg.role === "user" ? "user" : "agent",
        position: { x: 0, y: 0 }, // Will be layouted only if needed
        data: {
          message: msg,
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
      if (msg.parentId) {
        newEdges.push({
          id: `reply-${msg.parentId}-${msg.id}`,
          source: msg.parentId,
          target: msg.id,
          type: "reply",
          data: { edgeType: "reply" },
        });
      }
    }

    // Add reference edges (branch references - connect to root nodes)
    for (const msg of messages) {
      for (const refRootId of msg.branchReferences) {
        const isCircular = wouldCreateCircle(messagesById, msg.id, refRootId);
        newEdges.push({
          id: `ref-${msg.id}-${refRootId}`,
          source: msg.id,
          target: refRootId,
          type: "reference",
          data: { edgeType: "reference", isCircular },
        });
      }
    }

    // Apply layout only when messages are added/removed (not on collapse toggle)
    if (needsLayout) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        newNodes,
        newEdges
      );

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      hasInitialLayoutRef.current = true;

      // Zoom to last added node (only when new message added)
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
      // Just update the node data without re-layouting (preserves positions)
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
  }, [messages, shortLabels, treeLabels, treeIndices, messagesById, setNodes, setEdges, setCenter, handleToggleCollapse]);

  // Handle edit (delete subtree and prepare for re-entry)
  const handleEdit = useCallback(
    (nodeId: string) => {
      const msg = messagesById.get(nodeId);
      if (!msg) return;

      // Delete this node and all descendants
      setMessages((prev) => deleteSubtree(prev, nodeId));

      // Set up reply to parent (if any)
      if (msg.parentId) {
        setReplyingTo(msg.parentId);
      }
    },
    [messagesById]
  );

  // Handle sending a message
  const handleSend = useCallback(
    async (content: string, branchReferences: string[]) => {
      const now = Date.now();
      const userId = createId();
      const assistantId = createId();

      // Check for circular references
      for (const refId of branchReferences) {
        if (replyingTo && wouldCreateCircle(messagesById, replyingTo, refId)) {
          setCircularWarning(
            `Warning: Reference to branch ${treeLabels.get(refId)} would create a circular context`
          );
          setTimeout(() => setCircularWarning(null), 5000);
        }
      }

      // Create user message
      const userMsg: ChatMessage = {
        id: userId,
        parentId: replyingTo,
        role: "user",
        content,
        createdAt: now,
        branchReferences,
      };

      // Create placeholder assistant message
      const assistantMsg: ChatMessage = {
        id: assistantId,
        parentId: userId,
        role: "assistant",
        content: "",
        createdAt: now + 1,
        branchReferences: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setReplyingTo(null);
      setIsLoading(true);
      lastNodeIdRef.current = assistantId;

      try {
        // Build context with all messages for branch aggregation
        const updatedMessages = [...messages, userMsg];
        const updatedMessagesById = new Map(messagesById);
        updatedMessagesById.set(userId, userMsg);

        const { messages: contextMessages, circularWarning: ctxWarning } =
          aggregateContext(updatedMessages, updatedMessagesById, userId, branchReferences);

        if (ctxWarning) {
          setCircularWarning(ctxWarning);
          setTimeout(() => setCircularWarning(null), 5000);
        }

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
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: streamedText, isStreaming: true }
                  : m
              )
            );
          }
        );

        // Final update
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: llmText || "(empty response)",
                  isStreaming: false,
                }
              : m
          )
        );

        // Auto-set reply to the new assistant message
        setReplyingTo(assistantId);
      } catch (e) {
        const err = e instanceof Error ? e.message : "Unknown error";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Error: ${err}`,
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [replyingTo, messagesById, messages, treeLabels, selectedProvider, selectedModel]
  );

  return (
    <div className="w-screen h-screen bg-white">
      {/* Model Selector - Top Right */}
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

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-gray-50"
      >
        <Background color="#e5e7eb" gap={20} />
        <Controls className="bg-white! border-gray-200! shadow-sm!" />
      </ReactFlow>

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