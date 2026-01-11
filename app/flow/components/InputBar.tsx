"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { MessageLike } from "../types";
import { TREE_PALETTES, getParentId } from "../types";

type InputBarProps = {
  onSend: (content: string, branchReferences: string[]) => void;
  messages: MessageLike[];
  shortLabels: Map<string, string>;
  treeLabels: Map<string, string>;
  treeIndices: Map<string, number>;
  replyingTo: string | null;
  onCancelReply: () => void;
  disabled?: boolean;
};

export function InputBar({
  onSend,
  messages,
  shortLabels,
  treeLabels,
  treeIndices,
  replyingTo,
  onCancelReply,
  disabled = false,
}: InputBarProps) {
  const [value, setValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownFilter, setDropdownFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get root nodes (branches) for referencing
  const rootNodes = useMemo(
    () => messages.filter((m) => !getParentId(m)),
    [messages]
  );

  // Get replyingTo message info
  const replyingToMessage = replyingTo
    ? messages.find((m) => m.id === replyingTo)
    : null;
  const replyingToLabel = replyingTo ? shortLabels.get(replyingTo) : null;

  // Parse @ references from current input - now references BRANCHES (just the letter)
  const parseBranchReferences = useCallback(
    (text: string): string[] => {
      const regex = /@([A-Z])(?:\d+)?/gi; // Match @A, @B, @A1, @B2, etc.
      const matches = [...text.matchAll(regex)];
      const refs: string[] = [];

      for (const match of matches) {
        const letter = match[1].toUpperCase();
        // Find root node ID by tree letter
        for (const root of rootNodes) {
          const rootTreeLabel = treeLabels.get(root.id);
          if (rootTreeLabel === letter) {
            refs.push(root.id);
            break;
          }
        }
      }

      return [...new Set(refs)]; // Deduplicate
    },
    [rootNodes, treeLabels]
  );

  // Filter branches for dropdown
  const filteredBranches = rootNodes.filter((root) => {
    const label = treeLabels.get(root.id) ?? "";
    const matchesFilter =
      !dropdownFilter ||
      label.toLowerCase().includes(dropdownFilter.toLowerCase()) ||
      root.content.toLowerCase().includes(dropdownFilter.toLowerCase());
    return matchesFilter;
  });

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1 && atIndex === cursorPos - 1) {
      setShowDropdown(true);
      setDropdownFilter("");
      setSelectedIndex(0);
    } else if (atIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      if (/^[A-Za-z0-9]*$/.test(textAfterAt) && textAfterAt.length < 10) {
        setShowDropdown(true);
        setDropdownFilter(textAfterAt);
        setSelectedIndex(0);
      } else {
        setShowDropdown(false);
      }
    } else {
      setShowDropdown(false);
    }
  };

  // Handle keyboard navigation in dropdown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredBranches.length - 1)
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (filteredBranches[selectedIndex]) {
          insertBranchReference(filteredBranches[selectedIndex].id);
        }
      } else if (e.key === "Escape") {
        setShowDropdown(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Insert branch reference into input
  const insertBranchReference = (rootId: string) => {
    const label = treeLabels.get(rootId);
    if (!label) return;

    const cursorPos = inputRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      const before = value.slice(0, atIndex);
      const after = value.slice(cursorPos);
      setValue(`${before}@${label} ${after}`);
    }

    setShowDropdown(false);
    inputRef.current?.focus();
  };

  // Handle send
  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    const branchReferences = parseBranchReferences(trimmed);
    onSend(trimmed, branchReferences);
    setValue("");
    setShowDropdown(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(
        inputRef.current.scrollHeight,
        150
      )}px`;
    }
  }, [value]);

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-40">
      <div className="max-w-3xl mx-auto">
        {/* Reply indicator */}
        {replyingToMessage && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-gray-50 rounded-lg">
            <span className="text-xs text-gray-500">Replying to</span>
            <span className="text-xs font-mono bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
              {replyingToLabel}
            </span>
            <span className="text-xs text-gray-600 truncate flex-1">
              {replyingToMessage.content.slice(0, 50)}...
            </span>
            <button
              onClick={onCancelReply}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="relative">
          {/* @ Dropdown - now shows BRANCHES */}
          {showDropdown && filteredBranches.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
            >
              <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-medium text-gray-500">
                  Reference a branch
                </span>
              </div>
              {filteredBranches.slice(0, 10).map((root, index) => {
                const label = treeLabels.get(root.id) ?? "?";
                const treeIndex = treeIndices.get(root.id) ?? 0;
                const palette = TREE_PALETTES[treeIndex % TREE_PALETTES.length];
                const isSelected = index === selectedIndex;
                const nodeCount = messages.filter(
                  (m) => treeLabels.get(m.id) === label
                ).length;

                return (
                  <button
                    key={root.id}
                    onClick={() => insertBranchReference(root.id)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                      isSelected ? `${palette.bg}` : "hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${palette.accent} ${palette.text}`}
                    >
                      @{label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {nodeCount} nodes
                    </span>
                    <span className="text-sm text-gray-600 truncate flex-1">
                      {root.content.slice(0, 40)}
                      {root.content.length > 40 ? "..." : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Textarea */}
          <div className="flex items-end gap-2 bg-gray-50 rounded-xl p-2">
            <textarea
              ref={inputRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={
                replyingTo
                  ? "Type your reply... (@ to reference branches)"
                  : "Start a new conversation... (@ to reference branches)"
              }
              disabled={disabled}
              rows={1}
              className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-800 placeholder:text-gray-400 py-2 px-2"
            />
            <button
              onClick={handleSend}
              disabled={disabled || !value.trim()}
              className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
            >
              Send
            </button>
          </div>

          {/* Hint */}
          <p className="text-xs text-gray-400 mt-2 px-2">
            Press <kbd className="px-1 py-0.5 bg-gray-100 rounded">Enter</kbd>{" "}
            to send,{" "}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded">Shift+Enter</kbd>{" "}
            for new line,{" "}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded">@A</kbd> to
            reference branch A
          </p>
        </div>
      </div>
    </div>
  );
}
