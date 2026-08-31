import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isLocalMode } from "@/lib/local/mode";
import { localStore } from "@/lib/local/store";

type ConversationRow = {
  id: string;
  name: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  content: string;
  created_at: string;
  conversations: { name: string } | { name: string }[] | null;
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });
  if (query.length > 120) return NextResponse.json({ error: "Search is limited to 120 characters" }, { status: 400 });
  if (isLocalMode()) return NextResponse.json({ results: await localStore.search(query) });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pattern = `%${query}%`;
  const [{ data: conversations, error: conversationError }, { data: messages, error: messageError }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, name, updated_at")
      .ilike("name", pattern)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("messages")
      .select("id, conversation_id, content, created_at, conversations!inner(name)")
      .ilike("content", pattern)
      .order("created_at", { ascending: false })
      .limit(16),
  ]);

  if (conversationError || messageError) {
    return NextResponse.json({ error: conversationError?.message ?? messageError?.message }, { status: 500 });
  }

  const boardResults = ((conversations ?? []) as ConversationRow[]).map((conversation) => ({
    type: "conversation" as const,
    conversationId: conversation.id,
    conversationName: conversation.name,
    updatedAt: conversation.updated_at,
  }));
  const thoughtResults = ((messages ?? []) as unknown as MessageRow[]).map((message) => {
    const relation = Array.isArray(message.conversations) ? message.conversations[0] : message.conversations;
    return {
      type: "message" as const,
      conversationId: message.conversation_id,
      conversationName: relation?.name ?? "Untitled Conversation",
      messageId: message.id,
      content: message.content.length > 420 ? `${message.content.slice(0, 420)}…` : message.content,
      updatedAt: message.created_at,
    };
  });

  return NextResponse.json({ results: [...thoughtResults, ...boardResults] });
}
