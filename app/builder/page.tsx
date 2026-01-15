"use client";

import { useState, useCallback, useRef, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  addEdge,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { builderNodeTypes, type BuilderNodeData } from "./components/BuilderNode";
import { BuilderToolbar } from "./components/BuilderToolbar";
import { WhiteboardUpload } from "./components/WhiteboardUpload";
import { ReadinessPanel } from "./components/ReadinessPanel";
import { BuildStatusPanel } from "./components/BuildStatusPanel";
import {
  CursorsLayer,
  ConnectionStatus,
  CollaboratorsBar,
  RemoteSelections,
} from "./components/CollaborationUI";
import { type BlockType, type CanvasReadiness, BLOCK_CONFIGS } from "./types";
import {
  useCanvasCollaboration,
  useCanvasStorage,
  type CanvasUpdate,
} from "@/hooks/useCanvasCollaboration";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, Cloud, CloudOff, Share2, Users } from "lucide-react";
import Link from "next/link";

function generateId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function BuilderCanvas() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const canvasId = searchParams.get("id");
  const { user, isLoading: isAuthLoading } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<BuilderNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showWhiteboardUpload, setShowWhiteboardUpload] = useState(false);
  const [showReadinessPanel, setShowReadinessPanel] = useState(false);
  const [showBuildPanel, setShowBuildPanel] = useState(false);
  const [readiness, setReadiness] = useState<CanvasReadiness | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "analyzing" | "complete" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [canvasName, setCanvasName] = useState("Untitled Canvas");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [viewportTransform, setViewportTransform] = useState({ x: 0, y: 0, zoom: 1 });

  // Block editor state
  const [editingBlock, setEditingBlock] = useState<Node<BuilderNodeData> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editType, setEditType] = useState<BlockType>("feature");

  // Add block dialog state
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [newBlockType, setNewBlockType] = useState<BlockType>("feature");
  const [newBlockTitle, setNewBlockTitle] = useState("");
  const [newBlockDescription, setNewBlockDescription] = useState("");

  const { fitView, getViewport } = useReactFlow();
  const lastPositionRef = useRef({ x: 100, y: 100 });
  const flowContainerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);

  // Keep nodesRef updated
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Edit handlers (using refs for stability)
  const handleEditBlock = useCallback((nodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (node) {
      setEditingBlock(node);
      setEditTitle(node.data.title);
      setEditDescription(node.data.description);
      setEditType(node.data.type);
    }
  }, []); // No dependencies - uses ref

  const handleDeleteBlock = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  // Handle remote updates from collaborators (stable callback)
  const handleRemoteUpdate = useCallback((update: CanvasUpdate) => {
    const payload = update.payload as Record<string, unknown>;

    switch (update.type) {
      case "node_add": {
        const nodePayload = payload as Node<BuilderNodeData>;
        setNodes((nds) => {
          if (nds.some((n) => n.id === nodePayload.id)) return nds;
          return [...nds, {
            ...nodePayload,
            data: {
              ...nodePayload.data,
              onEdit: handleEditBlock,
              onDelete: handleDeleteBlock,
            },
          }];
        });
        break;
      }
      case "node_update": {
        const { nodeId, changes } = payload as { nodeId: string; changes: Partial<Node<BuilderNodeData>> };
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId ? { ...n, ...changes } : n
          )
        );
        break;
      }
      case "node_delete": {
        const { nodeId } = payload as { nodeId: string };
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) =>
          eds.filter(
            (e) => e.source !== nodeId && e.target !== nodeId
          )
        );
        break;
      }
      case "edge_add": {
        const edgePayload = payload as Edge;
        setEdges((eds) => {
          if (eds.some((e) => e.id === edgePayload.id)) return eds;
          return [...eds, edgePayload];
        });
        break;
      }
      case "edge_delete": {
        const { edgeId } = payload as { edgeId: string };
        setEdges((eds) => eds.filter((e) => e.id !== edgeId));
        break;
      }
      case "bulk_update": {
        const bulkPayload = payload as { nodes?: Node<BuilderNodeData>[]; edges?: Edge[] };
        if (bulkPayload.nodes && bulkPayload.nodes.length > 0) {
          setNodes((currentNodes) => {
            // If we have no nodes, use the incoming nodes
            if (currentNodes.length === 0) {
              return bulkPayload.nodes!.map((n) => ({
                ...n,
                data: {
                  ...n.data,
                  onEdit: handleEditBlock,
                  onDelete: handleDeleteBlock,
                },
              }));
            }
            // Otherwise merge - add nodes we don't have
            const existingIds = new Set(currentNodes.map((n) => n.id));
            const newNodes = bulkPayload.nodes!.filter((n) => !existingIds.has(n.id));
            if (newNodes.length === 0) return currentNodes;
            return [
              ...currentNodes,
              ...newNodes.map((n) => ({
                ...n,
                data: {
                  ...n.data,
                  onEdit: handleEditBlock,
                  onDelete: handleDeleteBlock,
                },
              })),
            ];
          });
        }
        if (bulkPayload.edges && bulkPayload.edges.length > 0) {
          setEdges((currentEdges) => {
            if (currentEdges.length === 0) return bulkPayload.edges!;
            // Merge edges
            const existingIds = new Set(currentEdges.map((e) => e.id));
            const newEdges = bulkPayload.edges!.filter((e) => !existingIds.has(e.id));
            if (newEdges.length === 0) return currentEdges;
            return [...currentEdges, ...newEdges];
          });
        }
        break;
      }
    }
  }, [setNodes, setEdges, handleEditBlock, handleDeleteBlock]);

  // Canvas storage hook
  const {
    loadCanvas,
    saveCanvas,
    createCanvas,
    isLoading: isStorageLoading,
    isSaving,
    lastSaved,
  } = useCanvasStorage(canvasId);

  // Get current canvas state (for sync)
  const getCurrentState = useCallback(() => {
    return { nodes: nodesRef.current, edges };
  }, [edges]);

  // Collaboration hook
  const {
    collaborators,
    isConnected,
    updateCursor,
    updateSelectedNode,
    broadcastNodeAdd,
    broadcastNodeUpdate,
    broadcastNodeDelete,
    broadcastEdgeAdd,
    broadcastEdgeDelete,
  } = useCanvasCollaboration({
    canvasId,
    userId: user?.id || null,
    userEmail: user?.email || null,
    userName: user?.email?.split("@")[0] || "Anonymous",
    onRemoteUpdate: handleRemoteUpdate,
    getCurrentState,
  });

  // Load canvas on mount
  useEffect(() => {
    async function loadCanvasData() {
      if (!canvasId || !user) return;

      const canvas = await loadCanvas();
      if (canvas) {
        setCanvasName(canvas.name);
        if (canvas.nodes?.length > 0) {
          const loadedNodes = canvas.nodes.map((n: Node<BuilderNodeData>) => ({
            ...n,
            data: {
              ...n.data,
              onEdit: handleEditBlock,
              onDelete: handleDeleteBlock,
            },
          }));
          setNodes(loadedNodes);
        }
        if (canvas.edges?.length > 0) {
          setEdges(canvas.edges);
        }
        setTimeout(() => fitView({ padding: 0.2 }), 100);
      }
    }
    loadCanvasData();
  }, [canvasId, user, loadCanvas, fitView, handleEditBlock, handleDeleteBlock, setNodes, setEdges]);

  // Auto-save canvas
  useEffect(() => {
    if (!canvasId || nodes.length === 0) return;

    const timer = setTimeout(() => {
      saveCanvas(nodes, edges);
    }, 2000);

    return () => clearTimeout(timer);
  }, [canvasId, nodes, edges, saveCanvas]);

  // Update viewport transform for cursor layer
  useEffect(() => {
    const viewport = getViewport();
    setViewportTransform({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
  }, [getViewport]);

  // Track mouse for cursor collaboration
  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!flowContainerRef.current) return;

      const rect = flowContainerRef.current.getBoundingClientRect();
      const viewport = getViewport();
      setViewportTransform({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });

      // Convert screen coordinates to flow coordinates
      const x = (event.clientX - rect.left - viewport.x) / viewport.zoom;
      const y = (event.clientY - rect.top - viewport.y) / viewport.zoom;

      updateCursor({ x, y });
    },
    [getViewport, updateCursor]
  );

  const handleMouseLeave = useCallback(() => {
    updateCursor(null); // Move cursor off-screen
  }, [updateCursor]);

  // Share canvas handler
  const handleShareCanvas = useCallback(async () => {
    if (!canvasId || !shareEmail) return;

    try {
      const response = await fetch(`/api/canvases/${canvasId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", collaboratorEmail: shareEmail }),
      });

      if (response.ok) {
        toast.success(`Shared canvas with ${shareEmail}`);
        setShareEmail("");
        setShowShareDialog(false);
      } else {
        toast.error("Failed to share canvas");
      }
    } catch (error) {
      toast.error("Failed to share canvas");
    }
  }, [canvasId, shareEmail]);

  // Create new canvas if none exists
  const handleCreateCanvas = useCallback(async () => {
    if (!user) return;

    const newCanvasId = await createCanvas("Untitled Canvas");
    if (newCanvasId) {
      router.push(`/builder?id=${newCanvasId}`);
      toast.success("Created new canvas");
    }
  }, [user, createCanvas, router]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        id: `edge-${Date.now()}`,
        source: connection.source!,
        target: connection.target!,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      };
      setEdges((eds) => addEdge(newEdge, eds));
      broadcastEdgeAdd(newEdge);
    },
    [setEdges, broadcastEdgeAdd]
  );

  // Calculate readiness score based on blocks
  const readinessScore = useMemo(() => {
    if (nodes.length === 0) return 0;

    const hasPage = nodes.some((n) => n.data.type === "page");
    const hasFeature = nodes.some((n) => n.data.type === "feature");
    const hasConnections = edges.length > 0;
    const allHaveDescriptions = nodes.every((n) => n.data.description?.length > 10);
    const allHaveTitles = nodes.every((n) => n.data.title?.length > 2);

    let score = 0;
    if (hasPage) score += 25;
    if (hasFeature) score += 20;
    if (hasConnections) score += 15;
    if (allHaveTitles) score += 20;
    if (allHaveDescriptions) score += 20;

    return Math.min(score, 100);
  }, [nodes, edges]);

  // Add a new block
  const handleAddBlock = useCallback((type: BlockType) => {
    setNewBlockType(type);
    setNewBlockTitle("");
    setNewBlockDescription("");
    setShowAddBlock(true);
  }, []);

  const confirmAddBlock = useCallback(() => {
    const config = BLOCK_CONFIGS[newBlockType];
    const id = generateId();

    // Calculate position
    const x = lastPositionRef.current.x;
    const y = lastPositionRef.current.y;
    lastPositionRef.current = { x: x + 50, y: y + 50 };
    if (lastPositionRef.current.x > 600) {
      lastPositionRef.current = { x: 100, y: lastPositionRef.current.y + 100 };
    }

    const newNode: Node<BuilderNodeData> = {
      id,
      type: "builder",
      position: { x, y },
      data: {
        id,
        type: newBlockType,
        title: newBlockTitle || `New ${config.label}`,
        description: newBlockDescription || "",
        status: "draft",
        onEdit: handleEditBlock,
        onDelete: (nodeId: string) => {
          handleDeleteBlock(nodeId);
          broadcastNodeDelete(nodeId);
        },
      },
    };

    setNodes((nds) => [...nds, newNode]);
    broadcastNodeAdd(newNode);
    setShowAddBlock(false);
  }, [newBlockType, newBlockTitle, newBlockDescription, setNodes, broadcastNodeAdd, broadcastNodeDelete, handleEditBlock, handleDeleteBlock]);

  const saveBlockEdit = useCallback(() => {
    if (!editingBlock) return;

    const updatedNode = {
      ...editingBlock,
      data: {
        ...editingBlock.data,
        title: editTitle,
        description: editDescription,
        type: editType,
        onEdit: handleEditBlock,
        onDelete: (nodeId: string) => {
          handleDeleteBlock(nodeId);
          broadcastNodeDelete(nodeId);
        },
      },
    };

    setNodes((nds) =>
      nds.map((n) => (n.id === editingBlock.id ? updatedNode : n))
    );
    broadcastNodeUpdate(editingBlock.id, { data: updatedNode.data });
    setEditingBlock(null);
  }, [editingBlock, editTitle, editDescription, editType, setNodes, handleEditBlock, handleDeleteBlock, broadcastNodeUpdate, broadcastNodeDelete]);

  // Whiteboard upload handler
  const handleWhiteboardUpload = useCallback(async (file: File) => {
    setUploadStatus("uploading");
    setUploadProgress(20);

    try {
      // Create form data
      const formData = new FormData();
      formData.append("file", file);

      setUploadProgress(40);
      setUploadStatus("analyzing");

      // Call the vision API
      const response = await fetch("/api/analyze-whiteboard", {
        method: "POST",
        body: formData,
      });

      setUploadProgress(70);

      if (!response.ok) {
        throw new Error("Failed to analyze whiteboard");
      }

      const analysis = await response.json();
      setUploadProgress(90);

      // Convert detected blocks to canvas nodes
      const newBlocks: Node<BuilderNodeData>[] = analysis.detectedBlocks.map(
        (block: { text: string; type: BlockType; position: { x: number; y: number }; confidence: number }, index: number) => {
          const id = generateId();
          return {
            id,
            type: "builder",
            position: { x: block.position.x + 50, y: block.position.y + 50 },
            data: {
              id,
              type: block.type,
              title: block.text,
              description: `Detected from whiteboard (${Math.round(block.confidence * 100)}% confidence)`,
              status: "draft" as const,
              onEdit: handleEditBlock,
              onDelete: handleDeleteBlock,
            },
          };
        }
      );

      // Add connections
      const newEdges: Edge[] = analysis.detectedConnections.map(
        (conn: { from: number; to: number; label?: string }, index: number) => ({
          id: `edge-${Date.now()}-${index}`,
          source: newBlocks[conn.from]?.id,
          target: newBlocks[conn.to]?.id,
          label: conn.label,
        })
      ).filter((edge: Edge) => edge.source && edge.target);

      setNodes((nds) => [...nds, ...newBlocks]);
      setEdges((eds) => [...eds, ...newEdges]);

      setUploadProgress(100);
      setUploadStatus("complete");

      // Auto fit view after adding blocks
      setTimeout(() => fitView({ padding: 0.2 }), 100);
    } catch (error) {
      console.error("Whiteboard upload error:", error);
      setUploadError(error instanceof Error ? error.message : "Unknown error");
      setUploadStatus("error");
    }
  }, [setNodes, setEdges, fitView, handleEditBlock, handleDeleteBlock]);

  // Analyze canvas
  const handleAnalyzeCanvas = useCallback(async () => {
    setIsAnalyzing(true);
    setShowReadinessPanel(true);

    try {
      // Prepare blocks for API
      const blocksData = nodes.map((n) => ({
        id: n.id,
        type: n.data.type,
        title: n.data.title,
        description: n.data.description,
      }));

      const edgesData = edges.map((e) => ({
        source: e.source,
        target: e.target,
      }));

      // Call the analysis API (uses small model by default for cost control)
      const response = await fetch("/api/analyze-canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks: blocksData,
          edges: edgesData,
          useSmallModel: true, // Use Gemma for cost control
        }),
      });

      const analysis = await response.json();
      setReadiness(analysis);
    } catch (error) {
      console.error("Canvas analysis error:", error);
      // Fallback to local heuristic analysis
      const hasPage = nodes.some((n) => n.data.type === "page");
      const hasFeature = nodes.some((n) => n.data.type === "feature");
      const emptyDescriptions = nodes.filter((n) => !n.data.description || n.data.description.length < 10);

      const missing: string[] = [];
      const suggestions: string[] = [];

      if (!hasPage) {
        missing.push("No page block defined");
        suggestions.push("Add at least one Page block to define your app's routes");
      }
      if (!hasFeature) {
        missing.push("No feature blocks defined");
        suggestions.push("Add Feature blocks to describe your app's functionality");
      }
      if (edges.length === 0 && nodes.length > 1) {
        missing.push("No connections between blocks");
        suggestions.push("Connect blocks to show relationships and data flow");
      }

      const blockAnalysis = emptyDescriptions.map((n) => ({
        blockId: n.id,
        issues: ["Missing or short description"],
        suggestions: ["Add a detailed description to help the AI understand this block"],
      }));

      setReadiness({
        isReady: missing.length === 0 && readinessScore >= 70,
        score: readinessScore,
        missingItems: missing,
        suggestions,
        blockAnalysis,
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [nodes, edges, readinessScore]);

  // Build MVP - Now calls the real Backboard.io API
  const handleBuildMVP = useCallback(async () => {
    if (!canvasId) {
      toast.error("Please save the canvas first");
      return;
    }

    setIsBuilding(true);
    setShowBuildPanel(true);

    try {
      // Call the build API which orchestrates with Backboard.io
      const response = await fetch("/api/build-mvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvas_id: canvasId,
          config: {
            model: "gpt-4o",
            provider: "openai",
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Build failed to start");
      }

      const { job_id } = await response.json();
      toast.success("Build started! Check the build panel for progress.");

      // Update all blocks to "building" status
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            status: "building" as const,
          },
        }))
      );

    } catch (error) {
      console.error("Build error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to start build");
    } finally {
      setIsBuilding(false);
    }
  }, [canvasId, setNodes]);

  return (
    <div className="w-screen h-screen bg-white flex flex-col">
      {/* Top Navigation Bar */}
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-white">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back</span>
          </Link>
          <div className="h-6 w-px bg-gray-200" />
          <input
            type="text"
            value={canvasName}
            onChange={(e) => setCanvasName(e.target.value)}
            className="font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded px-2 py-1"
            placeholder="Canvas name..."
          />
          {isSaving && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Cloud className="h-3 w-3 animate-pulse" />
              Saving...
            </span>
          )}
          {!isSaving && lastSaved && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Cloud className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Collaboration Status */}
          <ConnectionStatus isConnected={isConnected} collaboratorCount={collaborators.length} />
          <CollaboratorsBar collaborators={collaborators} isConnected={isConnected} />

          {/* Share Button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowShareDialog(true)}
          >
            <Share2 className="h-4 w-4" />
            Share
          </Button>

          <div className="h-6 w-px bg-gray-200" />

          <Link href="/flow">
            <Button variant="outline" size="sm" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              Conversation Canvas
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative flex">
        <div
          className="flex-1 relative"
          ref={flowContainerRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Toolbar */}
          <BuilderToolbar
            onAddBlock={handleAddBlock}
            onUploadWhiteboard={() => {
              setShowWhiteboardUpload(true);
              setUploadStatus("idle");
              setUploadProgress(0);
            }}
            onAnalyzeCanvas={handleAnalyzeCanvas}
            onBuildMVP={handleBuildMVP}
            blockCount={nodes.length}
            readinessScore={readinessScore}
            isAnalyzing={isAnalyzing}
            isBuilding={isBuilding}
          />

          {/* Empty State */}
          {nodes.length === 0 && !canvasId && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 z-10 pointer-events-none">
              <div className="text-6xl mb-4">📋</div>
              <p className="text-lg font-medium mb-2">Start Planning Your MVP</p>
              <p className="text-sm text-gray-400 mb-6 text-center max-w-md">
                Add blocks to define pages, features, and APIs. Connect them to show
                relationships. When ready, click "Build MVP" to generate code.
              </p>
              <div className="flex gap-3 pointer-events-auto">
                <Button onClick={() => handleAddBlock("page")} variant="outline">
                  Add a Page
                </Button>
                <Button
                  onClick={() => {
                    setShowWhiteboardUpload(true);
                    setUploadStatus("idle");
                  }}
                  variant="outline"
                >
                  Import Whiteboard
                </Button>
                {user && (
                  <Button onClick={handleCreateCanvas} variant="default">
                    Create New Canvas
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ReactFlow Canvas */}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={(changes) => {
              onNodesChange(changes);
              // Broadcast position changes (throttled internally)
              changes.forEach((change) => {
                if (change.type === "position" && change.position && change.id) {
                  broadcastNodeUpdate(change.id, { position: change.position });
                }
              });
            }}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => updateSelectedNode(node.id)}
            onMove={() => {
              const vp = getViewport();
              setViewportTransform({ x: vp.x, y: vp.y, zoom: vp.zoom });
            }}
            nodeTypes={builderNodeTypes}
            fitView
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            className="bg-gray-50"
          >
            <Background color="#e5e7eb" gap={20} />
            <Controls />
          </ReactFlow>

          {/* Remote Cursors Layer (outside ReactFlow to use fixed positioning) */}
          <CursorsLayer collaborators={collaborators} viewportTransform={viewportTransform} />

          {/* Remote Selections */}
          <RemoteSelections
            collaborators={collaborators}
            getNodePosition={(nodeId) => {
              const node = nodes.find((n) => n.id === nodeId);
              if (!node) return null;
              return {
                x: node.position.x,
                y: node.position.y,
                width: node.measured?.width || 200,
                height: node.measured?.height || 100
              };
            }}
            viewportTransform={viewportTransform}
          />
        </div>

        {/* Readiness Panel */}
        {showReadinessPanel && (
          <ReadinessPanel
            readiness={readiness}
            onClose={() => setShowReadinessPanel(false)}
            isLoading={isAnalyzing}
            onFocusBlock={(blockId) => {
              const node = nodes.find((n) => n.id === blockId);
              if (node) {
                // Focus on the node
                setNodes((nds) =>
                  nds.map((n) => ({
                    ...n,
                    selected: n.id === blockId,
                  }))
                );
              }
            }}
          />
        )}

        {/* Build Status Panel */}
        {showBuildPanel && (
          <BuildStatusPanel
            canvasId={canvasId}
            onClose={() => setShowBuildPanel(false)}
            onStartBuild={handleBuildMVP}
            isReadyToBuild={readinessScore >= 50}
          />
        )}
      </div>

      {/* Whiteboard Upload Dialog */}
      <WhiteboardUpload
        open={showWhiteboardUpload}
        onClose={() => setShowWhiteboardUpload(false)}
        onUpload={handleWhiteboardUpload}
        isProcessing={uploadStatus !== "idle" && uploadStatus !== "complete" && uploadStatus !== "error"}
        progress={uploadProgress}
        status={uploadStatus}
        error={uploadError}
      />

      {/* Add Block Dialog */}
      <Dialog open={showAddBlock} onOpenChange={setShowAddBlock}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Block</DialogTitle>
            <DialogDescription>
              Define a new block for your MVP canvas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Block Type</Label>
              <Select value={newBlockType} onValueChange={(v) => setNewBlockType(v as BlockType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BLOCK_CONFIGS) as BlockType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {BLOCK_CONFIGS[type].icon} {BLOCK_CONFIGS[type].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={newBlockTitle}
                onChange={(e) => setNewBlockTitle(e.target.value)}
                placeholder={`New ${BLOCK_CONFIGS[newBlockType].label}`}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newBlockDescription}
                onChange={(e) => setNewBlockDescription(e.target.value)}
                placeholder="Describe what this block does..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBlock(false)}>
              Cancel
            </Button>
            <Button onClick={confirmAddBlock}>Add Block</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Block Dialog */}
      <Dialog open={!!editingBlock} onOpenChange={() => setEditingBlock(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Block</DialogTitle>
            <DialogDescription>Update this block's details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Block Type</Label>
              <Select value={editType} onValueChange={(v) => setEditType(v as BlockType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BLOCK_CONFIGS) as BlockType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {BLOCK_CONFIGS[type].icon} {BLOCK_CONFIGS[type].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Block title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Describe what this block does..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBlock(null)}>
              Cancel
            </Button>
            <Button onClick={saveBlockEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Canvas Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Share Canvas
            </DialogTitle>
            <DialogDescription>
              Invite collaborators to edit this canvas in real-time
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Collaborator Email</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="flex-1"
                />
                <Button onClick={handleShareCanvas} disabled={!shareEmail}>
                  Invite
                </Button>
              </div>
            </div>

            {collaborators.length > 0 && (
              <div className="space-y-2">
                <Label>Current Collaborators ({collaborators.length})</Label>
                <div className="space-y-2">
                  {collaborators.map((c) => (
                    <div
                      key={c.user_id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        <span className="text-sm font-medium">{c.name}</span>
                      </div>
                      <span className="text-xs text-green-600">Online</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {canvasId && (
              <div className="space-y-2">
                <Label>Canvas Link</Label>
                <div className="flex gap-2">
                  <Input
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/builder?id=${canvasId}`}
                    readOnly
                    className="flex-1 text-xs"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/builder?id=${canvasId}`
                      );
                      toast.success("Link copied to clipboard");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareDialog(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function BuilderPage() {
  return (
    <ReactFlowProvider>
      <Suspense fallback={<div className="w-screen h-screen flex items-center justify-center">Loading...</div>}>
        <BuilderCanvas />
      </Suspense>
    </ReactFlowProvider>
  );
}
