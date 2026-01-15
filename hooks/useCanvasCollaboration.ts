"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Node, Edge } from "@xyflow/react";
import type { BuilderNodeData } from "@/app/builder/components/BuilderNode";

// Types for collaboration
export interface CollaboratorPresence {
  user_id: string;
  email: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  selectedNodeId: string | null;
  lastSeen: number;
}

export interface CanvasUpdate {
  type: "node_add" | "node_update" | "node_delete" | "edge_add" | "edge_delete" | "bulk_update";
  payload: unknown;
  userId: string;
  timestamp: number;
}

interface UseCanvasCollaborationOptions {
  canvasId: string | null;
  userId: string | null;
  userEmail: string | null;
  userName?: string;
  onRemoteUpdate?: (update: CanvasUpdate) => void;
  getCurrentState?: () => { nodes: Node<BuilderNodeData>[]; edges: Edge[] } | null;
}

// Generate consistent color from user ID
function getUserColor(userId: string): string {
  const colors = [
    "#ef4444", // red
    "#f97316", // orange
    "#eab308", // yellow
    "#22c55e", // green
    "#14b8a6", // teal
    "#3b82f6", // blue
    "#8b5cf6", // violet
    "#ec4899", // pink
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

// Singleton supabase client for collaboration
let supabaseInstance: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabaseInstance) {
    supabaseInstance = createClient();
  }
  return supabaseInstance;
}

export function useCanvasCollaboration({
  canvasId,
  userId,
  userEmail,
  userName,
  onRemoteUpdate,
  getCurrentState,
}: UseCanvasCollaborationOptions) {
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const onRemoteUpdateRef = useRef(onRemoteUpdate);
  const getCurrentStateRef = useRef(getCurrentState);
  const isSubscribingRef = useRef(false);

  // Keep callback ref updated without causing reconnection
  useEffect(() => {
    onRemoteUpdateRef.current = onRemoteUpdate;
  }, [onRemoteUpdate]);

  // Keep getCurrentState ref updated
  useEffect(() => {
    getCurrentStateRef.current = getCurrentState;
  }, [getCurrentState]);

  // Throttle cursor updates
  const lastCursorUpdateRef = useRef<number>(0);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const cursorThrottleMs = 50; // 20 FPS for cursor updates

  // Stable user info for connection
  const userInfo = useMemo(() => {
    if (!userId || !userEmail) return null;
    return {
      userId,
      userEmail,
      userName: userName || userEmail.split("@")[0],
      userColor: getUserColor(userId),
    };
  }, [userId, userEmail, userName]);

  // Connect to collaboration channel
  useEffect(() => {
    if (!canvasId || !userInfo) {
      setIsConnected(false);
      return;
    }

    // Prevent double subscription in strict mode
    if (isSubscribingRef.current) return;
    if (channelRef.current) return;

    isSubscribingRef.current = true;
    const supabase = getSupabase();
    const channelName = `canvas:${canvasId}`;

    // Create presence channel
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: userInfo.userId,
        },
        broadcast: {
          self: false, // Don't receive own broadcasts
        },
      },
    });

    // Handle presence sync
    channel.on("presence", { event: "sync" }, () => {
      const presenceState = channel.presenceState<CollaboratorPresence>();
      const users: CollaboratorPresence[] = [];

      Object.entries(presenceState).forEach(([key, presences]) => {
        if (key !== userInfo.userId && presences.length > 0) {
          users.push(presences[0]);
        }
      });

      setCollaborators(users);
    });

    // Handle presence join
    channel.on("presence", { event: "join" }, ({ key, newPresences }) => {
      if (key !== userInfo.userId && newPresences.length > 0) {
        console.log(`[Collab] User joined: ${newPresences[0].name}`);
      }
    });

    // Handle presence leave
    channel.on("presence", { event: "leave" }, ({ key, leftPresences }) => {
      if (key !== userInfo.userId && leftPresences.length > 0) {
        console.log(`[Collab] User left: ${leftPresences[0].name}`);
      }
    });

    // Handle canvas updates broadcast
    channel.on("broadcast", { event: "canvas_update" }, ({ payload }) => {
      if (payload && payload.userId !== userInfo.userId) {
        onRemoteUpdateRef.current?.(payload as CanvasUpdate);
      }
    });

    // Handle sync requests from new joiners
    channel.on("broadcast", { event: "sync_request" }, ({ payload }) => {
      if (payload && payload.requesterId !== userInfo.userId) {
        // Someone is requesting sync - send our current state
        const currentState = getCurrentStateRef.current?.();
        if (currentState && (currentState.nodes.length > 0 || currentState.edges.length > 0)) {
          console.log(`[Collab] Sending sync response to ${payload.requesterId}`);
          channel.send({
            type: "broadcast",
            event: "sync_response",
            payload: {
              responderId: userInfo.userId,
              targetId: payload.requesterId,
              nodes: currentState.nodes,
              edges: currentState.edges,
              timestamp: Date.now(),
            },
          });
        }
      }
    });

    // Handle sync responses
    channel.on("broadcast", { event: "sync_response" }, ({ payload }) => {
      // Only process if this sync is for us and we haven't already synced
      if (payload && payload.targetId === userInfo.userId) {
        console.log(`[Collab] Received sync from ${payload.responderId}`);
        if (payload.nodes?.length > 0 || payload.edges?.length > 0) {
          onRemoteUpdateRef.current?.({
            type: "bulk_update",
            payload: { nodes: payload.nodes, edges: payload.edges },
            userId: payload.responderId,
            timestamp: payload.timestamp,
          });
        }
      }
    });

    // Subscribe and track presence
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        // Track our presence
        await channel.track({
          user_id: userInfo.userId,
          email: userInfo.userEmail,
          name: userInfo.userName,
          color: userInfo.userColor,
          cursor: null,
          selectedNodeId: null,
          lastSeen: Date.now(),
        });

        setIsConnected(true);
        setConnectionError(null);
        console.log(`[Collab] Connected to ${channelName}`);

        // Request sync from other users after a short delay
        // This gives time for the DB load to happen first
        setTimeout(() => {
          console.log(`[Collab] Requesting sync from collaborators`);
          channel.send({
            type: "broadcast",
            event: "sync_request",
            payload: {
              requesterId: userInfo.userId,
              timestamp: Date.now(),
            },
          });
        }, 500);
      } else if (status === "CHANNEL_ERROR") {
        setConnectionError("Failed to connect to collaboration channel");
        setIsConnected(false);
      } else if (status === "CLOSED") {
        setIsConnected(false);
      }
    });

    channelRef.current = channel;

    // Cleanup
    return () => {
      isSubscribingRef.current = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [canvasId, userInfo]);

  // Update cursor position (throttled)
  const updateCursor = useCallback(
    (cursor: { x: number; y: number } | null) => {
      if (!channelRef.current || !userInfo) return;

      const now = Date.now();
      if (now - lastCursorUpdateRef.current < cursorThrottleMs) {
        pendingCursorRef.current = cursor;
        return;
      }

      lastCursorUpdateRef.current = now;
      pendingCursorRef.current = null;

      channelRef.current.track({
        user_id: userInfo.userId,
        email: userInfo.userEmail,
        name: userInfo.userName,
        color: userInfo.userColor,
        cursor,
        selectedNodeId: null,
        lastSeen: now,
      });
    },
    [userInfo]
  );

  // Flush pending cursor updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingCursorRef.current && channelRef.current) {
        const cursor = pendingCursorRef.current;
        pendingCursorRef.current = null;
        updateCursor(cursor);
      }
    }, cursorThrottleMs);

    return () => clearInterval(interval);
  }, [updateCursor]);

  // Update selected node
  const updateSelectedNode = useCallback(
    (nodeId: string | null) => {
      if (!channelRef.current || !userInfo) return;

      channelRef.current.track({
        user_id: userInfo.userId,
        email: userInfo.userEmail,
        name: userInfo.userName,
        color: userInfo.userColor,
        cursor: null,
        selectedNodeId: nodeId,
        lastSeen: Date.now(),
      });
    },
    [userInfo]
  );

  // Broadcast canvas update
  const broadcastUpdate = useCallback(
    (update: Omit<CanvasUpdate, "userId" | "timestamp">) => {
      if (!channelRef.current || !userInfo) return;

      const fullUpdate: CanvasUpdate = {
        ...update,
        userId: userInfo.userId,
        timestamp: Date.now(),
      };

      channelRef.current.send({
        type: "broadcast",
        event: "canvas_update",
        payload: fullUpdate,
      });
    },
    [userInfo]
  );

  // Broadcast node addition
  const broadcastNodeAdd = useCallback(
    (node: Node<BuilderNodeData>) => {
      broadcastUpdate({
        type: "node_add",
        payload: node,
      });
    },
    [broadcastUpdate]
  );

  // Broadcast node update
  const broadcastNodeUpdate = useCallback(
    (nodeId: string, changes: Partial<Node<BuilderNodeData>>) => {
      broadcastUpdate({
        type: "node_update",
        payload: { nodeId, changes },
      });
    },
    [broadcastUpdate]
  );

  // Broadcast node deletion
  const broadcastNodeDelete = useCallback(
    (nodeId: string) => {
      broadcastUpdate({
        type: "node_delete",
        payload: { nodeId },
      });
    },
    [broadcastUpdate]
  );

  // Broadcast edge addition
  const broadcastEdgeAdd = useCallback(
    (edge: Edge) => {
      broadcastUpdate({
        type: "edge_add",
        payload: edge,
      });
    },
    [broadcastUpdate]
  );

  // Broadcast edge deletion
  const broadcastEdgeDelete = useCallback(
    (edgeId: string) => {
      broadcastUpdate({
        type: "edge_delete",
        payload: { edgeId },
      });
    },
    [broadcastUpdate]
  );

  // Broadcast bulk update (for imports, etc.)
  const broadcastBulkUpdate = useCallback(
    (nodes: Node<BuilderNodeData>[], edges: Edge[]) => {
      broadcastUpdate({
        type: "bulk_update",
        payload: { nodes, edges },
      });
    },
    [broadcastUpdate]
  );

  return {
    collaborators,
    isConnected,
    connectionError,
    updateCursor,
    updateSelectedNode,
    broadcastNodeAdd,
    broadcastNodeUpdate,
    broadcastNodeDelete,
    broadcastEdgeAdd,
    broadcastEdgeDelete,
    broadcastBulkUpdate,
  };
}

// Hook for loading/saving canvas data
export function useCanvasStorage(canvasId: string | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Auto-save debounce
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDataRef = useRef<{ nodes: Node<BuilderNodeData>[]; edges: Edge[] } | null>(null);

  // Load canvas data
  const loadCanvas = useCallback(async (): Promise<{
    nodes: Node<BuilderNodeData>[];
    edges: Edge[];
    name: string;
  } | null> => {
    if (!canvasId) return null;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/canvases/${canvasId}`);
      if (!response.ok) {
        if (response.status === 404) {
          return null; // Canvas doesn't exist yet
        }
        throw new Error("Failed to load canvas");
      }

      const data = await response.json();
      return {
        nodes: data.nodes || [],
        edges: data.edges || [],
        name: data.name || "Untitled Canvas",
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [canvasId]);

  // Save canvas data (debounced)
  const saveCanvas = useCallback(
    async (nodes: Node<BuilderNodeData>[], edges: Edge[], immediate = false) => {
      if (!canvasId) return;

      // Store pending data
      pendingDataRef.current = { nodes, edges };

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Immediate save or debounced
      const doSave = async () => {
        const data = pendingDataRef.current;
        if (!data) return;

        setIsSaving(true);
        setError(null);

        try {
          const response = await fetch(`/api/canvases/${canvasId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nodes: data.nodes,
              edges: data.edges,
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to save canvas");
          }

          setLastSaved(new Date());
          pendingDataRef.current = null;
        } catch (err) {
          setError(err instanceof Error ? err.message : "Save failed");
        } finally {
          setIsSaving(false);
        }
      };

      if (immediate) {
        await doSave();
      } else {
        saveTimeoutRef.current = setTimeout(doSave, 1000); // 1 second debounce
      }
    },
    [canvasId]
  );

  // Create new canvas
  const createCanvas = useCallback(async (name: string): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/canvases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error("Failed to create canvas");
      }

      const data = await response.json();
      return data.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    isLoading,
    isSaving,
    error,
    lastSaved,
    loadCanvas,
    saveCanvas,
    createCanvas,
  };
}
