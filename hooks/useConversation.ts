"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Message, Conversation, MessageReference } from "@/lib/database.types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type NodePositionData = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type ConversationWithMessages = {
  conversation: Conversation;
  messages: Message[];
  references: { source_message_id: string; target_message_id: string }[];
};

export function useConversation(conversationId: string | null) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [references, setReferences] = useState<{ source_message_id: string; target_message_id: string }[]>([]);
  const [nodePositions, setNodePositions] = useState<Record<string, NodePositionData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track previous conversation ID to detect switches
  const prevConversationIdRef = useRef<string | null>(null);

  // Debounce timer for saving positions
  const savePositionsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPositionsRef = useRef<Record<string, NodePositionData>>({});

  const supabase = createClient();

  // Load conversation data
  const loadConversation = useCallback(async () => {
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      setReferences([]);
      setNodePositions({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Load conversation and messages
      const response = await fetch(`/api/conversations/${conversationId}`);
      if (!response.ok) {
        throw new Error("Failed to load conversation");
      }

      const data = await response.json();
      setConversation(data.conversation);
      setMessages(data.messages);
      setReferences(data.references);

      // Load node positions
      const posResponse = await fetch(`/api/node-positions?conversation_id=${conversationId}`);
      if (posResponse.ok) {
        const positions = await posResponse.json();
        setNodePositions(positions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  // Clear state immediately when conversation ID changes (before loading new data)
  useEffect(() => {
    if (prevConversationIdRef.current !== conversationId) {
      // Conversation changed - clear old state immediately
      setConversation(null);
      setMessages([]);
      setReferences([]);
      setNodePositions({});
      setError(null);
      prevConversationIdRef.current = conversationId;
    }
  }, [conversationId]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!conversationId) return;

    loadConversation();

    // Set up realtime subscription
    const channel: RealtimeChannel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMessage.id)) {
              return prev;
            }
            return [...prev, newMessage].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const deletedMessage = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== deletedMessage.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, loadConversation]);

  // Add a message
  const addMessage = useCallback(
    async (messageData: {
      parent_id: string | null;
      role: "user" | "assistant";
      content: string;
      model?: string;
      provider?: string;
      branch_references?: string[];
    }) => {
      if (!conversationId) throw new Error("No conversation selected");

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          ...messageData,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create message");
      }

      const message = await response.json();

      // Optimistically add to local state (realtime will confirm)
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });

      return message as Message;
    },
    [conversationId]
  );

  // Update a message (for streaming)
  const updateMessage = useCallback(async (id: string, content: string) => {
    const response = await fetch("/api/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, content }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to update message");
    }

    const message = await response.json();

    // Optimistically update local state
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? message : m))
    );

    return message as Message;
  }, []);

  // Delete a message (cascades to children)
  const deleteMessage = useCallback(async (id: string) => {
    const response = await fetch(`/api/messages/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to delete message");
    }

    // Collect all message IDs that will be deleted (the message and all descendants)
    const toDelete = new Set<string>();
    const collectDescendants = (messageId: string) => {
      toDelete.add(messageId);
      messages
        .filter((m) => m.parent_id === messageId)
        .forEach((m) => collectDescendants(m.id));
    };
    collectDescendants(id);

    // Remove from local state
    setMessages((prev) => prev.filter((m) => !toDelete.has(m.id)));
  }, [messages]);

  // Get context for LLM
  const getContext = useCallback(async (messageId: string) => {
    const response = await fetch(`/api/messages/${messageId}/context`);

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to get context");
    }

    return response.json();
  }, []);

  // Save node positions (debounced to avoid too many API calls)
  const saveNodePositions = useCallback(
    (positions: Record<string, NodePositionData>) => {
      if (!conversationId) return;

      // Merge with pending positions
      pendingPositionsRef.current = { ...pendingPositionsRef.current, ...positions };

      // Clear existing timeout
      if (savePositionsTimeoutRef.current) {
        clearTimeout(savePositionsTimeoutRef.current);
      }

      // Debounce save by 500ms
      savePositionsTimeoutRef.current = setTimeout(async () => {
        const positionsToSave = pendingPositionsRef.current;
        pendingPositionsRef.current = {};

        const positionsArray = Object.entries(positionsToSave).map(([message_id, pos]) => ({
          message_id,
          x: pos.x,
          y: pos.y,
          width: pos.width,
          height: pos.height,
        }));

        if (positionsArray.length === 0) return;

        try {
          await fetch("/api/node-positions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversation_id: conversationId,
              positions: positionsArray,
            }),
          });

          // Update local state
          setNodePositions((prev) => ({ ...prev, ...positionsToSave }));
        } catch (error) {
          console.error("Failed to save node positions:", error);
        }
      }, 500);
    },
    [conversationId]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (savePositionsTimeoutRef.current) {
        clearTimeout(savePositionsTimeoutRef.current);
      }
    };
  }, []);

  return {
    conversation,
    messages,
    references,
    nodePositions,
    isLoading,
    error,
    addMessage,
    updateMessage,
    deleteMessage,
    getContext,
    saveNodePositions,
    reload: loadConversation,
  };
}

// Hook to manage conversations list
export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) {
        throw new Error("Failed to load conversations");
      }

      const data = await response.json();
      setConversations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const createConversation = useCallback(async (name?: string) => {
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to create conversation");
    }

    const conversation = await response.json();
    setConversations((prev) => [conversation, ...prev]);
    return conversation as Conversation;
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    const response = await fetch(`/api/conversations/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to delete conversation");
    }

    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const renameConversation = useCallback(async (id: string, name: string) => {
    const response = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to rename conversation");
    }

    const conversation = await response.json();
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? conversation : c))
    );
    return conversation as Conversation;
  }, []);

  return {
    conversations,
    isLoading,
    error,
    createConversation,
    deleteConversation,
    renameConversation,
    reload: loadConversations,
  };
}

// Canvas type for listing
export interface Canvas {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

// Hook to manage canvases list
export function useCanvases() {
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCanvases = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/canvases");
      if (!response.ok) {
        throw new Error("Failed to load canvases");
      }

      const data = await response.json();
      setCanvases(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCanvases();
  }, [loadCanvases]);

  const createCanvas = useCallback(async (name?: string) => {
    const response = await fetch("/api/canvases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "Untitled Canvas" }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to create canvas");
    }

    const canvas = await response.json();
    setCanvases((prev) => [canvas, ...prev]);
    return canvas as Canvas;
  }, []);

  const deleteCanvas = useCallback(async (id: string) => {
    const response = await fetch(`/api/canvases/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to delete canvas");
    }

    setCanvases((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return {
    canvases,
    isLoading,
    error,
    createCanvas,
    deleteCanvas,
    reload: loadCanvases,
  };
}
