import { NextResponse } from "next/server";
import { authenticateCompanion } from "@/lib/companion/auth";
import type { LocalImportSnapshot, LocalRun } from "@/lib/local/store";
import type { CodexRun, Conversation, Database, Message } from "@/lib/database.types";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 1000;
const FILTER_BATCH_SIZE = 100;

type QueryError = { message: string };
type QueryResult<T> = { data: T[] | null; error: QueryError | null };

async function paged<T>(load: (from: number, to: number) => PromiseLike<QueryResult<T>>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await load(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function batches<T>(values: T[]) {
  return Array.from(
    { length: Math.ceil(values.length / FILTER_BATCH_SIZE) },
    (_, index) => values.slice(index * FILTER_BATCH_SIZE, (index + 1) * FILTER_BATCH_SIZE),
  );
}

async function selectInBatches<T>(
  values: string[],
  load: (values: string[], from: number, to: number) => PromiseLike<QueryResult<T>>,
) {
  const rows: T[] = [];
  for (const batch of batches(values)) rows.push(...await paged((from, to) => load(batch, from, to)));
  return rows;
}

export async function GET(request: Request) {
  try {
    const companion = await authenticateCompanion(request);
    if (!companion) return NextResponse.json({ error: "Invalid companion token" }, { status: 401 });
    const admin = createAdminClient();
    const conversations = await paged<Conversation>((from, to) => admin
      .from("conversations")
      .select("*")
      .eq("user_id", companion.user_id)
      .order("created_at", { ascending: true })
      .range(from, to));
    const conversationIds = conversations.map((conversation) => conversation.id);
    const messages = await selectInBatches<Message>(conversationIds, (ids, from, to) => admin
      .from("messages")
      .select("*")
      .in("conversation_id", ids)
      .order("created_at", { ascending: true })
      .range(from, to));
    const messageIds = messages.map((message) => message.id);
    type Pair = { source_message_id: string; target_message_id: string };
    type Position = Database["public"]["Tables"]["node_positions"]["Row"];
    const [references, links, positions, runs] = await Promise.all([
      selectInBatches<Pair>(messageIds, (ids, from, to) => admin
        .from("message_references").select("source_message_id, target_message_id").in("source_message_id", ids).range(from, to)),
      selectInBatches<Pair>(messageIds, (ids, from, to) => admin
        .from("message_links").select("source_message_id, target_message_id").in("source_message_id", ids).range(from, to)),
      selectInBatches<Position>(conversationIds, (ids, from, to) => admin
        .from("node_positions").select("*").in("conversation_id", ids).range(from, to)),
      selectInBatches<CodexRun>(conversationIds, (ids, from, to) => admin
        .from("codex_runs").select("*").in("conversation_id", ids).range(from, to)),
    ]);
    const messageIdSet = new Set(messageIds);
    const snapshot: LocalImportSnapshot = {
      conversations,
      messages,
      references: references.filter((reference) => messageIdSet.has(reference.target_message_id)),
      links: links.filter((link) => messageIdSet.has(link.target_message_id)),
      positions: positions.map((position) => ({
        conversation_id: position.conversation_id,
        message_id: position.message_id,
        x: position.x,
        y: position.y,
        ...(position.width === null ? {} : { width: position.width }),
        ...(position.height === null ? {} : { height: position.height }),
      })),
      runs: runs.filter((run): run is CodexRun & { message_id: string } => Boolean(run.message_id) && messageIdSet.has(run.message_id!)).map((run): LocalRun => ({
        id: run.id,
        message_id: run.message_id,
        conversation_id: run.conversation_id,
        thread_id: run.thread_id,
        turn_id: run.turn_id,
        parent_run_id: run.parent_run_id,
        model: run.model,
        status: run.status,
        error_details: run.error_details,
        created_at: run.created_at,
        updated_at: run.updated_at,
      })),
    };
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Companion export failed:", error);
    return NextResponse.json({ error: "Unable to export hosted conversations" }, { status: 500 });
  }
}
