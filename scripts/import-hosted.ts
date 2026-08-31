import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Database, Conversation, Message, CodexRun } from "@/lib/database.types";
import { localStore, type LocalImportSnapshot, type LocalRun } from "@/lib/local/store";

const PAGE_SIZE = 1000;
const FILTER_BATCH_SIZE = 100;

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. Pull the hosted server environment before importing.`);
  return value;
}

function assertResult<T>(result: { data: T | null; error: PostgrestError | null }) {
  if (result.error) throw result.error;
  return result.data ?? ([] as unknown as T);
}

async function paged<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = assertResult(await load(from, from + PAGE_SIZE - 1));
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function batches<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

async function selectInBatches<T>(
  values: string[],
  load: (values: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
) {
  const rows: T[] = [];
  for (const batch of batches(values, FILTER_BATCH_SIZE)) rows.push(...await paged((from, to) => load(batch, from, to)));
  return rows;
}

async function resolveUserId(supabase: SupabaseClient<Database>) {
  const explicitId = argument("--user-id") ?? process.env.NESTED_IMPORT_USER_ID?.trim();
  if (explicitId) return explicitId;

  const email = argument("--email") ?? process.env.NESTED_IMPORT_EMAIL?.trim();
  if (email) {
    for (let page = 1; ; page += 1) {
      const result = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      if (result.error) throw result.error;
      const match = result.data.users.find((user) => user.email?.toLocaleLowerCase() === email.toLocaleLowerCase());
      if (match) return match.id;
      if (result.data.users.length < PAGE_SIZE) break;
    }
    throw new Error("No hosted account matched that email address.");
  }

  const owners = await paged<{ user_id: string }>((from, to) => supabase
    .from("conversations")
    .select("user_id")
    .range(from, to));
  const uniqueOwners = [...new Set(owners.map((row) => row.user_id))];
  if (uniqueOwners.length === 0) throw new Error("The hosted database has no conversations to import.");
  if (uniqueOwners.length > 1) {
    throw new Error(`The hosted database has ${uniqueOwners.length} conversation owners. Re-run with --email you@example.com or --user-id UUID.`);
  }
  return uniqueOwners[0];
}

async function snapshotFromSupabase(): Promise<LocalImportSnapshot> {
  const supabase = createClient<Database>(
    requireEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const userId = await resolveUserId(supabase);

  const conversations = await paged<Conversation>((from, to) => supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .range(from, to));
  if (conversations.length === 0) throw new Error("That hosted account has no conversations to import.");

  const conversationIds = conversations.map((conversation) => conversation.id);
  const messages = await selectInBatches<Message>(conversationIds, (ids, from, to) => supabase
    .from("messages")
    .select("*")
    .in("conversation_id", ids)
    .order("created_at", { ascending: true })
    .range(from, to));
  const messageIds = messages.map((message) => message.id);

  type Pair = { source_message_id: string; target_message_id: string };
  type Position = Database["public"]["Tables"]["node_positions"]["Row"];
  const [references, links, positions, runs] = await Promise.all([
    selectInBatches<Pair>(messageIds, (ids, from, to) => supabase
      .from("message_references").select("source_message_id, target_message_id").in("source_message_id", ids).range(from, to)),
    selectInBatches<Pair>(messageIds, (ids, from, to) => supabase
      .from("message_links").select("source_message_id, target_message_id").in("source_message_id", ids).range(from, to)),
    selectInBatches<Position>(conversationIds, (ids, from, to) => supabase
      .from("node_positions").select("*").in("conversation_id", ids).range(from, to)),
    selectInBatches<CodexRun>(conversationIds, (ids, from, to) => supabase
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

  return snapshot;
}

async function snapshotFromCompanion(): Promise<LocalImportSnapshot> {
  const configPath = argument("--companion-config") ?? join(homedir(), ".config", "nested", "companion.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as { token?: string; url?: string };
  if (!config.token?.startsWith("nested_companion_") || !config.url) {
    throw new Error(`No valid paired companion config was found at ${configPath}.`);
  }
  const response = await fetch(`${config.url.replace(/\/$/, "")}/api/companion/export`, {
    headers: { Authorization: `Bearer ${config.token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Hosted export failed (${response.status}).`);
  }
  return response.json() as Promise<LocalImportSnapshot>;
}

async function main() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const snapshot = serviceKey && serviceKey !== "[SENSITIVE]"
    ? await snapshotFromSupabase()
    : await snapshotFromCompanion();

  const result = await localStore.importSnapshot(snapshot);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
