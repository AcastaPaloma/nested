"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  parentId: string | null;
  role: ChatRole;
  content: string;
  createdAt: number;
};

type ThreadNode = {
  message: ChatMessage;
  children: ThreadNode[];
};

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function byCreatedAtAsc(a: ChatMessage, b: ChatMessage) {
  return a.createdAt - b.createdAt;
}

function buildTree(messages: ChatMessage[]): ThreadNode[] {
  const byId = new Map<string, ThreadNode>();
  for (const m of messages) {
    byId.set(m.id, { message: m, children: [] });
  }

  const roots: ThreadNode[] = [];
  for (const m of messages) {
    const node = byId.get(m.id)!;
    if (!m.parentId) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(m.parentId);
    if (!parent) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  const sortRec = (nodes: ThreadNode[]) => {
    nodes.sort((a, b) => a.message.createdAt - b.message.createdAt);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

function getAncestorsIncludingSelf(
  messagesById: Map<string, ChatMessage>,
  leafId: string
): ChatMessage[] {
  const chain: ChatMessage[] = [];
  let cur: ChatMessage | undefined = messagesById.get(leafId);
  const visited = new Set<string>();

  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    chain.push(cur);
    cur = cur.parentId ? messagesById.get(cur.parentId) : undefined;
  }

  chain.reverse();
  return chain;
}

async function callStubbedLLM(payload: {
  messages: Array<{ role: ChatRole; content: string }>;
  selection?: string;
}) {
  console.log('Payload sent to /api/llm:', payload);

  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }

  const data = (await res.json()) as {content?: string };

  return data.content ?? ""
}

function countDescendants(node: ThreadNode): number {
  let count = 0;
  for (const c of node.children) {
    count += 1 + countDescendants(c);
  }
  return count;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const roleLabel = message.role === "assistant" ? "Assistant" : "You";
  return (
    <div
      className={
        "rounded-xl border border-black/8 dark:border-white/12 px-4 py-3 bg-white dark:bg-black"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {roleLabel}
          <span className="mx-2 text-zinc-400 dark:text-zinc-600">•</span>
          <span className="font-normal">{formatTime(message.createdAt)}</span>
        </div>
      </div>
      <div className="mt-2 text-sm leading-6 text-zinc-950 dark:text-zinc-50 prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 prose-code:text-pink-600 dark:prose-code:text-pink-400">
        <ReactMarkdown
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[rehypeKatex]}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function ThreadItem({
  node,
  collapsedById,
  onToggleCollapse,
  onReply,
  loadingUnderUserId,
}: {
  node: ThreadNode;
  collapsedById: Record<string, boolean>;
  onToggleCollapse: (id: string) => void;
  onReply: (parentId: string) => void;
  loadingUnderUserId: string | null;
}) {
  const hasChildren = node.children.length > 0;
  const collapsed = !!collapsedById[node.message.id];
  const descendantCount = hasChildren ? countDescendants(node) : 0;

  return (
    <div className="relative">
      <div className="flex items-start gap-2">
        <div className="mt-1 w-6 shrink-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggleCollapse(node.message.id)}
              className="h-6 w-6 rounded-md text-sm text-zinc-600 hover:bg-black/4 dark:text-zinc-400 dark:hover:bg-white/6"
              aria-label={collapsed ? "Expand replies" : "Collapse replies"}
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? "▶" : "▼"}
            </button>
          ) : (
            <div className="h-6 w-6" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <MessageBubble message={node.message} />

          <div className="flex items-center justify-between gap-3">
            {node.message.role === "assistant" && (
              <button
                type="button"
                onPointerDown={() => onReply(node.message.id)}
                className="h-8 rounded-full border border-black/10 dark:border-white/[.14] px-3 text-xs hover:bg-black/4 dark:hover:bg-white/6"
              >
                Reply
              </button>
            )}

            {hasChildren && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {descendantCount} repl{descendantCount === 1 ? "y" : "ies"}
              </div>
            )}
          </div>

          {collapsed && hasChildren && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {node.children.length} direct repl{node.children.length === 1 ? "y" : "ies"} collapsed
            </div>
          )}

          {loadingUnderUserId === node.message.id && (
            <div className="text-xs text-zinc-600 dark:text-zinc-400">Assistant is typing…</div>
          )}
        </div>
      </div>

      {hasChildren && !collapsed && (
        <div className="mt-4 border-l border-black/8 dark:border-white/12 pl-4 flex flex-col gap-5">
          {node.children.map((child) => (
            <ThreadItem
              key={child.message.id}
              node={child}
              collapsedById={collapsedById}
              onToggleCollapse={onToggleCollapse}
              onReply={onReply}
              loadingUnderUserId={loadingUnderUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ThreadedChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const rootId = createId();
    return [
    ];
  });
  const [draft, setDraft] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [selectionForReply, setSelectionForReply] = useState<string | null>(null);
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>({});
  const [loadingUnderUserId, setLoadingUnderUserId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const roots = useMemo(() => buildTree([...messages].sort(byCreatedAtAsc)), [messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const toggleCollapse = (id: string) => {
    setCollapsedById((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const beginReply = (parentId: string) => {
    const selected = typeof window !== "undefined" ? window.getSelection()?.toString() ?? "" : "";
    const selection = selected.trim();
    setReplyToId(parentId);
    setSelectionForReply(selection ? selection : null);
  };

  const sendReply = async (parentId: string | null, content: string, selection?: string | null) => {
    const now = Date.now();
    const userId = createId();

    const userMsg: ChatMessage = {
      id: userId,
      parentId,
      role: "user",
      content,
      createdAt: now,
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoadingUnderUserId(userId);

    try {
      const path = getAncestorsIncludingSelf(
        new Map([...messagesById.entries(), [userMsg.id, userMsg]]),
        userMsg.id
      );

      const llmText = await callStubbedLLM({
        messages: path.map((m) => ({ role: m.role, content: m.content })),
        selection: selection ?? undefined,
      });

      const assistantMsg: ChatMessage = {
        id: createId(),
        parentId: userId,
        role: "assistant",
        content: llmText || "(empty response)",
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      const err = e instanceof Error ? e.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          parentId: userId,
          role: "assistant",
          content: `Error calling /api/llm: ${err}`,
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setLoadingUnderUserId(null);
    }
  };

  const replyTarget = replyToId ? messagesById.get(replyToId) : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pt-8 pb-28">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Threaded chat (Reddit-style)</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Reply to any message to branch. Collapse/expand child replies. Calls a stubbed HTTP endpoint at <span className="font-medium">/api/llm</span>.
        </p>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 rounded-2xl border border-black/8 dark:border-white/12 bg-zinc-50 dark:bg-black/40 p-4 overflow-auto"
      >
        <div className="flex flex-col gap-6">
          {roots.map((node) => (
            <div key={node.message.id}>
              <ThreadItem
                node={node}
                collapsedById={collapsedById}
                onToggleCollapse={toggleCollapse}
                onReply={beginReply}
                loadingUnderUserId={loadingUnderUserId}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-black/8 dark:border-white/12 bg-white/90 dark:bg-black/80 backdrop-blur">
        <div className="mx-auto w-full max-w-5xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {replyTarget ? "Replying in thread" : "New message"}
              </div>
              {replyTarget && (
                <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  To: {replyTarget.role === "assistant" ? "Assistant" : "You"} • {replyTarget.content}
                </div>
              )}
              {selectionForReply && (
                <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  Including highlighted text in context
                </div>
              )}
            </div>
            {replyTarget && (
              <button
                type="button"
                onClick={() => {
                  setReplyToId(null);
                  setSelectionForReply(null);
                }}
                className="h-8 rounded-full border border-black/10 dark:border-white/[.14] px-3 text-xs hover:bg-black/4 dark:hover:bg-white/6"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="mt-2 flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="flex-1 resize-y rounded-xl border border-black/10 dark:border-white/[.14] bg-transparent px-3 py-2 text-sm outline-none"
              placeholder={replyTarget ? "Write a reply…" : "Ask something…"}
            />
            <button
              type="button"
              onClick={() => {
                const content = draft.trim();
                if (!content) return;
                setDraft("");
                const parentId = replyToId;
                const selection = selectionForReply;
                setReplyToId(null);
                setSelectionForReply(null);
                void sendReply(parentId, content, selection);
              }}
              disabled={!draft.trim()}
              className="h-10 rounded-full bg-foreground px-5 text-sm text-background disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
