"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AtSign, BrainCircuit, CornerDownLeft, Pin, Send, X } from "lucide-react";
import type { MessageLike } from "../types";
import { buildContextPlan, estimateTokens } from "../context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type InputBarProps = {
  onSend: (content: string, references: string[]) => void;
  messages: MessageLike[];
  shortLabels: Map<string, string>;
  treeLabels: Map<string, string>;
  replyingTo: string | null;
  pinnedMessageIds: string[];
  onTogglePin: (id: string) => void;
  onCancelReply: () => void;
  disabled?: boolean;
};

export function InputBar({
  onSend,
  messages,
  shortLabels,
  treeLabels,
  replyingTo,
  pinnedMessageIds,
  onTogglePin,
  onCancelReply,
  disabled = false,
}: InputBarProps) {
  const [value, setValue] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionsRef = useRef<HTMLDivElement>(null);

  const replyingToMessage = replyingTo
    ? messages.find((message) => message.id === replyingTo)
    : null;

  const parseReferences = useCallback(
    (text: string) => {
      const refs: string[] = [];
      for (const match of text.matchAll(/@([A-Z](?:\d+)?)/gi)) {
        const label = match[1].toUpperCase();
        const exactNode = messages.find(
          (message) => shortLabels.get(message.id)?.toUpperCase() === label
        );
        const branchRoot = messages.find(
          (message) =>
            treeLabels.get(message.id)?.toUpperCase() === label &&
            !message.parent_id &&
            !message.parentId
        );
        const matchId = exactNode?.id ?? branchRoot?.id;
        if (matchId) refs.push(matchId);
      }
      return [...new Set(refs)];
    },
    [messages, shortLabels, treeLabels]
  );

  const typedReferences = useMemo(
    () => parseReferences(value),
    [parseReferences, value]
  );
  const allReferences = useMemo(
    () => [...new Set([...pinnedMessageIds, ...typedReferences])],
    [pinnedMessageIds, typedReferences]
  );
  const contextPlan = useMemo(
    () =>
      buildContextPlan({
        messages,
        activeNodeId: replyingTo,
        pinnedNodeIds: allReferences,
        draft: value,
      }),
    [allReferences, messages, replyingTo, value]
  );

  const filteredMessages = useMemo(() => {
    const filter = mentionFilter.toLowerCase();
    return messages
      .filter((message) => {
        const label = shortLabels.get(message.id)?.toLowerCase() ?? "";
        return !filter || label.includes(filter) || message.content.toLowerCase().includes(filter);
      })
      .slice(0, 8);
  }, [mentionFilter, messages, shortLabels]);

  const insertReference = (messageId: string) => {
    const label = shortLabels.get(messageId);
    if (!label) return;
    const cursor = inputRef.current?.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    const atIndex = beforeCursor.lastIndexOf("@");
    if (atIndex >= 0) {
      setValue(`${value.slice(0, atIndex)}@${label} ${value.slice(cursor)}`);
    }
    setShowMentions(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setValue(nextValue);
    const beforeCursor = nextValue.slice(0, event.target.selectionStart);
    const mention = beforeCursor.match(/@([A-Za-z0-9]*)$/);
    setShowMentions(Boolean(mention));
    setMentionFilter(mention?.[1] ?? "");
    setSelectedIndex(0);
  };

  const handleSend = () => {
    const content = value.trim();
    if (!content || disabled) return;
    onSend(content, allReferences);
    setValue("");
    setShowMentions(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, filteredMessages.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter" && !event.shiftKey && filteredMessages[selectedIndex]) {
        event.preventDefault();
        insertReference(filteredMessages[selectedIndex].id);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setShowMentions(false);
      }
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    const closeMentions = (event: MouseEvent) => {
      if (!mentionsRef.current?.contains(event.target as Node)) setShowMentions(false);
    };
    document.addEventListener("mousedown", closeMentions);
    return () => document.removeEventListener("mousedown", closeMentions);
  }, []);

  useEffect(() => {
    if (replyingTo) inputRef.current?.focus();
  }, [replyingTo]);

  const usage = Math.min(100, (contextPlan.estimatedTokens / contextPlan.budget) * 100);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 p-4 sm:p-6">
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border bg-background/95 shadow-2xl shadow-black/10 backdrop-blur-xl">
        {replyingToMessage && (
          <div className="flex items-center gap-2 px-3 pt-3 sm:px-4">
            <CornerDownLeft className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Continuing from</span>
            <Badge variant="secondary" className="font-mono">
              {shortLabels.get(replyingToMessage.id)}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {replyingToMessage.content}
            </span>
            <Button variant="ghost" size="icon-sm" onClick={onCancelReply} aria-label="Stop replying">
              <X />
            </Button>
          </div>
        )}

        <div className="relative p-2 sm:p-3">
          {showMentions && filteredMessages.length > 0 && (
            <div
              ref={mentionsRef}
              role="listbox"
              className="absolute inset-x-3 bottom-full mb-2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
            >
              <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                <span className="text-xs font-medium">Add a precise context path</span>
                <span className="text-[11px] text-muted-foreground">↑↓ choose · Enter add · Esc close</span>
              </div>
              {filteredMessages.map((message, index) => (
                <button
                  key={message.id}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => insertReference(message.id)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                    index === selectedIndex ? "bg-accent" : "hover:bg-accent/60"
                  }`}
                >
                  <Badge variant="outline" className="font-mono">@{shortLabels.get(message.id)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {message.role === "assistant" ? "Assistant" : "You"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{message.content}</span>
                </button>
              ))}
            </div>
          )}

          <Textarea
            ref={inputRef}
            data-flow-composer="true"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={disabled}
            placeholder={replyingTo ? "Take this thought in a new direction…" : "Start a thought…"}
            className="max-h-40 min-h-20 resize-none border-0 bg-transparent px-2 py-2 text-[15px] shadow-none focus-visible:ring-0"
          />

          <div className="flex flex-wrap items-center gap-1.5 px-1 pt-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full">
                  <BrainCircuit />
                  Context
                  <Badge variant="secondary" className="ml-0.5 tabular-nums">
                    ~{contextPlan.estimatedTokens.toLocaleString()}
                  </Badge>
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full gap-0 sm:max-w-md">
                <SheetHeader className="border-b">
                  <SheetTitle>Context for the next response</SheetTitle>
                  <SheetDescription>
                    Only this material is sent. Press Esc or click outside to close.
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-3 px-4 py-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Estimated context</span>
                    <span className="font-mono tabular-nums">
                      {contextPlan.estimatedTokens.toLocaleString()} / {contextPlan.budget.toLocaleString()} tokens
                    </span>
                  </div>
                  <Progress value={usage} />
                  <p className="text-xs leading-5 text-muted-foreground">
                    The active path is automatic. Pins and @mentions add only the ancestry needed to understand that exact node—not its sibling branches.
                  </p>
                </div>
                <Separator />
                <ScrollArea className="h-[calc(100vh-270px)]">
                  <div className="space-y-2 p-4">
                    {contextPlan.included.length === 0 && (
                      <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                        Start from a node or pin a useful message to add context.
                      </div>
                    )}
                    {contextPlan.included.map(({ message, source }) => (
                      <div key={message.id} className="rounded-xl border bg-card p-3 text-card-foreground">
                        <div className="mb-2 flex items-center gap-2">
                          <Badge variant={source === "path" ? "secondary" : "outline"}>
                            {source === "path" ? "Active path" : "Pinned path"}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">
                            {shortLabels.get(message.id)}
                          </span>
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            ~{estimateTokens(message.content)} tok
                          </span>
                        </div>
                        <p className="line-clamp-4 text-sm leading-5">{message.content}</p>
                        {pinnedMessageIds.includes(message.id) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 -ml-2 h-7 text-xs"
                            onClick={() => onTogglePin(message.id)}
                          >
                            <Pin className="fill-current" /> Unpin
                          </Button>
                        )}
                      </div>
                    ))}
                    {contextPlan.omitted.length > 0 && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {contextPlan.omitted.length} older message(s) omitted to stay inside the budget.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground">
                  <AtSign /> Reference
                </Button>
              </TooltipTrigger>
              <TooltipContent>Type @ to include a specific node path</TooltipContent>
            </Tooltip>

            {pinnedMessageIds.length > 0 && (
              <Badge variant="outline" className="gap-1 rounded-full">
                <Pin className="size-3 fill-current" /> {pinnedMessageIds.length} persistent
              </Badge>
            )}

            <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
              Enter send · Shift+Enter newline
            </span>
            <Button
              size="icon"
              className="ml-auto rounded-full sm:ml-1"
              onClick={handleSend}
              disabled={disabled || !value.trim()}
              aria-label="Send message"
            >
              <Send />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
