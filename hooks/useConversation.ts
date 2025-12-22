"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Message, Conversation, MessageReference } from "@/lib/database.types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ConversationWithMessages = {
  conversation: Conversation;
  messages: Message[];
  references: { source_message_id: string; target_message_id: string }[];
};

export function useConversation(conversationId: string | null) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [references, setReferences] = useState<{ source_message_id: string; target_message_id: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Load conversation data
  const loadConversation = useCallback(async () => {
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      setReferences([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}`);
      if (!response.ok) {
        throw new Error("Failed to load conversation");
      }

      const data = await response.json();
      setConversation(data.conversation);
      setMessages(data.messages);
      setReferences(data.references);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
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

  return {
    conversation,
    messages,
    references,
    isLoading,
    error,
    addMessage,
    updateMessage,
    deleteMessage,
    getContext,
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
