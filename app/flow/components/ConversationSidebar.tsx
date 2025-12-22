"use client";

import { useState } from "react";
import type { Conversation } from "@/lib/database.types";
import type { User } from "@supabase/supabase-js";

type ConversationSidebarProps = {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<Conversation>;
  onClose: () => void;
  user: User | null;
  onSignOut: () => void;
};

export function ConversationSidebar({
  conversations,
  currentId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onClose,
  user,
  onSignOut,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleStartRename = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditName(conv.name);
  };

  const handleRename = async (id: string) => {
    if (editName.trim()) {
      try {
        await onRename(id, editName.trim());
      } catch (error) {
        console.error("Failed to rename:", error);
      }
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await onDelete(id);
      if (currentId === id) {
        // Select another conversation or none
        const remaining = conversations.filter((c) => c.id !== id);
        if (remaining.length > 0) {
          onSelect(remaining[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to delete:", error);
    }
    setDeletingId(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return "Today";
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="w-72 h-full bg-gray-50 border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Conversations</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onCreate}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            title="New Conversation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            title="Close Sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No conversations yet</p>
            <button
              onClick={onCreate}
              className="mt-2 text-sm text-gray-700 hover:underline"
            >
              Create your first one
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group relative rounded-lg transition-colors ${
                  currentId === conv.id
                    ? "bg-gray-200"
                    : "hover:bg-gray-100"
                }`}
              >
                {editingId === conv.id ? (
                  <div className="p-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(conv.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => handleRename(conv.id)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-gray-400 outline-none"
                      autoFocus
                    />
                  </div>
                ) : deletingId === conv.id ? (
                  <div className="p-2">
                    <p className="text-sm text-gray-700 mb-2">Delete this conversation?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(conv.id)}
                        className="flex-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="flex-1 px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => onSelect(conv.id)}
                    className="w-full text-left p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-gray-900 truncate flex-1">
                        {conv.name}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(conv);
                          }}
                          className="p-1 hover:bg-gray-300 rounded"
                          title="Rename"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(conv.id);
                          }}
                          className="p-1 hover:bg-red-100 text-red-500 rounded"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatDate(conv.updated_at)}
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User Info */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="text-sm text-gray-700 truncate">
              {user?.email || "Guest"}
            </span>
          </div>
          <button
            onClick={onSignOut}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors text-gray-600"
            title="Sign Out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
