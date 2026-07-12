import { NextRequest, NextResponse } from "next/server";
import { getCodexAppServer } from "@/lib/codex/app-server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { messageId?: string } | null;
  if (!body?.messageId) return NextResponse.json({ error: "messageId is required" }, { status: 400 });

  const { data: run } = await supabase
    .from("codex_runs")
    .select("id, thread_id, turn_id, status")
    .eq("message_id", body.messageId)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "Active generation not found" }, { status: 404 });
  if (!run.thread_id || !run.turn_id || run.status !== "in_progress") {
    return NextResponse.json({ error: "Generation is not interruptible" }, { status: 409 });
  }

  await getCodexAppServer().interruptTurn(run.thread_id, run.turn_id);
  await supabase
    .from("codex_runs")
    .update({ status: "interrupted", updated_at: new Date().toISOString() })
    .eq("id", run.id);
  return NextResponse.json({ success: true });
}

