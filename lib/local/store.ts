import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Conversation, Message } from "@/lib/database.types";
import type { ClaimedRun } from "@/lib/codex/runs";

export type LocalPosition = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type LocalRun = {
  id: string;
  message_id: string;
  conversation_id: string;
  thread_id: string | null;
  turn_id: string | null;
  parent_run_id: string | null;
  model: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "interrupted";
  error_details: unknown | null;
  created_at: string;
  updated_at: string;
};

type LocalData = {
  version: 1;
  conversations: Conversation[];
  messages: Message[];
  references: Array<{ source_message_id: string; target_message_id: string }>;
  links: Array<{ source_message_id: string; target_message_id: string }>;
  positions: Record<string, Record<string, LocalPosition>>;
  runs: LocalRun[];
};

const EMPTY_DATA: LocalData = {
  version: 1,
  conversations: [],
  messages: [],
  references: [],
  links: [],
  positions: {},
  runs: [],
};

declare global {
  var __nestedLocalStoreQueue: Promise<void> | undefined;
}

function dataFile() {
  const configured = process.env.NESTED_DATA_DIR?.trim();
  return join(configured || join(homedir(), ".nested"), "data.json");
}

async function load(): Promise<LocalData> {
  try {
    const parsed = JSON.parse(await readFile(dataFile(), "utf8")) as Partial<LocalData>;
    return {
      ...EMPTY_DATA,
      ...parsed,
      conversations: parsed.conversations ?? [],
      messages: parsed.messages ?? [],
      references: parsed.references ?? [],
      links: parsed.links ?? [],
      positions: parsed.positions ?? {},
      runs: parsed.runs ?? [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_DATA);
    throw error;
  }
}

async function save(data: LocalData) {
  const path = dataFile();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

async function readStore<T>(reader: (data: LocalData) => T | Promise<T>) {
  await (globalThis.__nestedLocalStoreQueue ?? Promise.resolve());
  return reader(await load());
}

async function mutateStore<T>(mutation: (data: LocalData) => T | Promise<T>) {
  let result!: T;
  const previous = globalThis.__nestedLocalStoreQueue ?? Promise.resolve();
  const current = previous.then(async () => {
    const data = await load();
    result = await mutation(data);
    await save(data);
  });
  globalThis.__nestedLocalStoreQueue = current.catch(() => undefined);
  await current;
  return result;
}

const byCreatedAt = <T extends { created_at: string }>(a: T, b: T) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

export const localStore = {
  dataFile,

  listConversations: () => readStore((data) =>
    [...data.conversations].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())),

  createConversation: (name: string) => mutateStore((data) => {
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: randomUUID(), user_id: "local", name, created_at: now, updated_at: now,
    };
    data.conversations.push(conversation);
    return conversation;
  }),

  getConversation: (id: string) => readStore((data) => data.conversations.find((item) => item.id === id) ?? null),

  getConversationBundle: (id: string) => readStore((data) => {
    const conversation = data.conversations.find((item) => item.id === id) ?? null;
    const messages = data.messages.filter((item) => item.conversation_id === id).sort(byCreatedAt);
    const ids = new Set(messages.map((item) => item.id));
    return {
      conversation,
      messages,
      references: data.references.filter((item) => ids.has(item.source_message_id)),
      links: data.links.filter((item) => ids.has(item.source_message_id)),
    };
  }),

  renameConversation: (id: string, name: string) => mutateStore((data) => {
    const conversation = data.conversations.find((item) => item.id === id);
    if (!conversation) return null;
    conversation.name = name;
    conversation.updated_at = new Date().toISOString();
    return conversation;
  }),

  deleteConversation: (id: string) => mutateStore((data) => {
    const messageIds = new Set(data.messages.filter((message) => message.conversation_id === id).map((message) => message.id));
    const threadIds = [...new Set(data.runs.filter((run) => run.conversation_id === id).map((run) => run.thread_id).filter(Boolean))] as string[];
    data.conversations = data.conversations.filter((item) => item.id !== id);
    data.messages = data.messages.filter((item) => item.conversation_id !== id);
    data.references = data.references.filter((item) => !messageIds.has(item.source_message_id) && !messageIds.has(item.target_message_id));
    data.links = data.links.filter((item) => !messageIds.has(item.source_message_id) && !messageIds.has(item.target_message_id));
    data.runs = data.runs.filter((run) => run.conversation_id !== id);
    delete data.positions[id];
    return threadIds;
  }),

  createMessage: (input: Omit<Message, "id" | "created_at">, branchReferences: string[] = []) => mutateStore((data) => {
    if (!data.conversations.some((item) => item.id === input.conversation_id)) return null;
    const message: Message = { ...input, id: randomUUID(), created_at: new Date().toISOString() };
    data.messages.push(message);
    for (const target of branchReferences) {
      if (data.messages.some((item) => item.id === target)) {
        data.references.push({ source_message_id: message.id, target_message_id: target });
      }
    }
    const conversation = data.conversations.find((item) => item.id === input.conversation_id);
    if (conversation) conversation.updated_at = message.created_at;
    return message;
  }),

  getMessage: (id: string) => readStore((data) => data.messages.find((item) => item.id === id) ?? null),

  updateMessage: (id: string, content: string) => mutateStore((data) => {
    const message = data.messages.find((item) => item.id === id);
    if (!message) return null;
    message.content = content;
    const conversation = data.conversations.find((item) => item.id === message.conversation_id);
    if (conversation) conversation.updated_at = new Date().toISOString();
    return message;
  }),

  deleteMessageTree: (id: string) => mutateStore((data) => {
    const deleted = new Set<string>();
    const collect = (messageId: string) => {
      deleted.add(messageId);
      data.messages.filter((item) => item.parent_id === messageId).forEach((item) => collect(item.id));
    };
    collect(id);
    data.messages = data.messages.filter((item) => !deleted.has(item.id));
    data.references = data.references.filter((item) => !deleted.has(item.source_message_id) && !deleted.has(item.target_message_id));
    data.links = data.links.filter((item) => !deleted.has(item.source_message_id) && !deleted.has(item.target_message_id));
    data.runs = data.runs.filter((item) => !deleted.has(item.message_id));
    for (const positions of Object.values(data.positions)) for (const messageId of deleted) delete positions[messageId];
  }),

  getContext: (id: string) => readStore((data) => {
    const byId = new Map(data.messages.map((message) => [message.id, message]));
    const ancestry: Message[] = [];
    let cursor = byId.get(id);
    while (cursor) {
      ancestry.unshift(cursor);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
    }
    if (ancestry.length === 0) return null;
    const referenced = data.references.filter((item) => item.source_message_id === id);
    const referencedMessages: Message[] = [];
    for (const reference of referenced) {
      const path: Message[] = [];
      let item = byId.get(reference.target_message_id);
      while (item) {
        path.unshift(item);
        item = item.parent_id ? byId.get(item.parent_id) : undefined;
      }
      referencedMessages.push(...path);
    }
    const messages = [...new Map([...ancestry, ...referencedMessages].map((item) => [item.id, item])).values()].sort(byCreatedAt);
    return {
      messages,
      context: messages.map((message) => ({ role: message.role, content: message.content })),
      ancestry_length: ancestry.length,
      referenced_count: referencedMessages.length,
    };
  }),

  putLink: (source: string, target: string) => mutateStore((data) => {
    const valid = data.messages.some((item) => item.id === source) && data.messages.some((item) => item.id === target);
    if (!valid) return null;
    const link = { source_message_id: source, target_message_id: target };
    if (!data.links.some((item) => item.source_message_id === source && item.target_message_id === target)) data.links.push(link);
    return link;
  }),

  deleteLink: (source: string, target: string) => mutateStore((data) => {
    data.links = data.links.filter((item) => item.source_message_id !== source || item.target_message_id !== target);
  }),

  getPositions: (conversationId: string) => readStore((data) => data.positions[conversationId] ?? {}),

  savePositions: (conversationId: string, positions: Array<{ message_id: string } & LocalPosition>) => mutateStore((data) => {
    const current = data.positions[conversationId] ?? {};
    for (const { message_id, ...position } of positions) current[message_id] = position;
    data.positions[conversationId] = current;
  }),

  search: (query: string) => readStore((data) => {
    const normalized = query.toLocaleLowerCase();
    const conversationById = new Map(data.conversations.map((conversation) => [conversation.id, conversation]));
    const thoughts = data.messages.filter((message) => message.content.toLocaleLowerCase().includes(normalized)).sort((a, b) => byCreatedAt(b, a)).slice(0, 16).map((message) => ({
      type: "message" as const,
      conversationId: message.conversation_id,
      conversationName: conversationById.get(message.conversation_id)?.name ?? "Untitled Conversation",
      messageId: message.id,
      content: message.content.length > 420 ? `${message.content.slice(0, 420)}…` : message.content,
      updatedAt: message.created_at,
    }));
    const boards = data.conversations.filter((conversation) => conversation.name.toLocaleLowerCase().includes(normalized)).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 8).map((conversation) => ({
      type: "conversation" as const,
      conversationId: conversation.id,
      conversationName: conversation.name,
      updatedAt: conversation.updated_at,
    }));
    return [...thoughts, ...boards];
  }),

  generationContext: (assistantMessageId: string) => readStore((data) => {
    const assistant = data.messages.find((item) => item.id === assistantMessageId && item.role === "assistant");
    const userMessage = assistant?.parent_id ? data.messages.find((item) => item.id === assistant.parent_id && item.role === "user") : null;
    if (!assistant || !userMessage) return null;
    const messages = data.messages.filter((item) => item.conversation_id === assistant.conversation_id);
    const referencedIds = [
      ...data.references.filter((item) => item.source_message_id === userMessage.id).map((item) => item.target_message_id),
      ...data.links.filter((item) => item.source_message_id === userMessage.id).map((item) => item.target_message_id),
    ];
    return { assistant, userMessage, messages, referencedIds: [...new Set(referencedIds)] };
  }),

  claimRun: (assistantMessageId: string, model: string) => mutateStore((data): ClaimedRun | null => {
    if (data.runs.some((run) => run.message_id === assistantMessageId)) return null;
    const assistant = data.messages.find((item) => item.id === assistantMessageId && item.role === "assistant");
    const userMessage = assistant?.parent_id ? data.messages.find((item) => item.id === assistant.parent_id) : null;
    if (!assistant || !userMessage) return null;
    const parentRun = userMessage.parent_id ? data.runs.find((run) => run.message_id === userMessage.parent_id) : undefined;
    const siblings = userMessage.parent_id
      ? data.messages.filter((item) => item.parent_id === userMessage.parent_id && item.role === "user").sort(byCreatedAt)
      : [];
    const now = new Date().toISOString();
    const run: LocalRun = {
      id: randomUUID(), message_id: assistant.id, conversation_id: assistant.conversation_id,
      thread_id: null, turn_id: null, parent_run_id: parentRun?.id ?? null,
      model, status: "pending", error_details: null, created_at: now, updated_at: now,
    };
    data.runs.push(run);
    return {
      run_id: run.id,
      parent_run_id: run.parent_run_id,
      parent_thread_id: parentRun?.thread_id ?? null,
      parent_turn_id: parentRun?.turn_id ?? null,
      should_fork: Boolean(parentRun && siblings.findIndex((item) => item.id === userMessage.id) > 0),
    };
  }),

  updateRun: (id: string, update: Partial<Pick<LocalRun, "thread_id" | "turn_id" | "status" | "error_details">>) => mutateStore((data) => {
    const run = data.runs.find((item) => item.id === id);
    if (!run) return null;
    Object.assign(run, update, { updated_at: new Date().toISOString() });
    return run;
  }),

  getRunForMessage: (messageId: string) => readStore((data) => data.runs.find((run) => run.message_id === messageId) ?? null),
};
