import { NextResponse } from "next/server";
import { authenticateCompanion } from "@/lib/companion/auth";
import type { CompanionJobAction } from "@/lib/companion/types";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validAction(value: unknown): value is CompanionJobAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Partial<CompanionJobAction>;
  if (action.type === "start") return true;
  if (action.type === "resume") return typeof action.threadId === "string";
  if (action.type === "archive") return typeof action.threadId === "string";
  return action.type === "fork" && typeof action.threadId === "string" && typeof action.turnId === "string";
}

export async function POST(request: Request) {
  const companion = await authenticateCompanion(request);
  if (!companion) return NextResponse.json({ error: "Invalid companion token" }, { status: 401 });
  const admin = createAdminClient();
  const { data: pending, error: readError } = await admin
    .from("codex_jobs")
    .select("id, kind, model, prompt, action, thread_id, assistant_message_id, user_message_id")
    .eq("user_id", companion.user_id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!pending) return new NextResponse(null, { status: 204 });
  const action = pending.kind === "archive" && pending.thread_id
    ? { type: "archive" as const, threadId: pending.thread_id }
    : pending.action;
  if (!validAction(action)) return NextResponse.json({ error: "Invalid queued action" }, { status: 500 });

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("codex_jobs")
    .update({ status: "claimed", companion_id: companion.id, claimed_at: now, heartbeat_at: now })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed) return new NextResponse(null, { status: 204 });

  if (pending.kind === "archive") {
    return NextResponse.json({ id: pending.id, kind: "archive", action });
  }
  if (!pending.model || !pending.prompt || !pending.assistant_message_id || !pending.user_message_id || action.type === "archive") {
    return NextResponse.json({ error: "Invalid queued turn" }, { status: 500 });
  }
  return NextResponse.json({
    id: pending.id,
    kind: "turn",
    model: pending.model,
    prompt: pending.prompt,
    action,
    assistantMessageId: pending.assistant_message_id,
    clientUserMessageId: pending.user_message_id,
  });
}
