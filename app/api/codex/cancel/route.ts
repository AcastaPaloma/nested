import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getCodexAppServer } from "@/lib/codex/app-server";
import { localActiveTurns } from "@/lib/local/active-turns";
import { isLocalMode } from "@/lib/local/mode";
import { localStore } from "@/lib/local/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { messageId?: string } | null;
  if (!body?.messageId) return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  if (isLocalMode()) {
    const active = localActiveTurns().get(body.messageId);
    const run = await localStore.getRunForMessage(body.messageId);
    if (!active || !run) return NextResponse.json({ error: "Active generation not found" }, { status: 404 });
    await getCodexAppServer().interruptTurn(active.threadId, active.turnId);
    await localStore.updateRun(run.id, { status: "interrupted" });
    return NextResponse.json({ success: true });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: run } = await supabase
    .from("codex_runs")
    .select("id, status")
    .eq("message_id", body.messageId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "Active generation not found" }, { status: 404 });
  if (!["pending", "in_progress"].includes(run.status)) {
    return NextResponse.json({ error: "Generation is not interruptible" }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data: job } = await admin.from("codex_jobs").select("id, status").eq("run_id", run.id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Companion job not found" }, { status: 404 });
  if (job.status === "pending") {
    await Promise.all([
      admin.from("codex_jobs").update({ status: "interrupted", cancel_requested: true }).eq("id", job.id),
      admin.from("codex_runs").update({ status: "interrupted", updated_at: new Date().toISOString() }).eq("id", run.id),
    ]);
  } else {
    await admin.from("codex_jobs").update({ cancel_requested: true }).eq("id", job.id);
  }
  return NextResponse.json({ success: true });
}
