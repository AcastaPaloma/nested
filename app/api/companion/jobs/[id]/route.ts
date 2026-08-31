import { NextResponse } from "next/server";
import { authenticateCompanion } from "@/lib/companion/auth";
import type { CompanionJobUpdate } from "@/lib/companion/types";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function errorDetails(error: unknown): Json {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (typeof error === "object" && error !== null) return error as Json;
  return { message: String(error) };
}

async function ownedJob(request: Request, id: string) {
  const companion = await authenticateCompanion(request);
  if (!companion) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("codex_jobs")
    .select("id, run_id, assistant_message_id, status, cancel_requested")
    .eq("id", id)
    .eq("user_id", companion.user_id)
    .eq("companion_id", companion.id)
    .maybeSingle();
  if (error) throw error;
  return data ? { companion, admin, job: data } : null;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const owned = await ownedJob(request, id);
  if (!owned) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({ cancelRequested: owned.job.cancel_requested, status: owned.job.status });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const owned = await ownedJob(request, id);
  if (!owned) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as CompanionJobUpdate | null;
  if (!body || !["started", "progress", "completed", "failed", "interrupted"].includes(body.phase)) {
    return NextResponse.json({ error: "Invalid job update" }, { status: 400 });
  }
  if (body.outputText !== undefined && (typeof body.outputText !== "string" || body.outputText.length > 2_000_000)) {
    return NextResponse.json({ error: "Invalid output" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const status: "in_progress" | "completed" | "failed" | "interrupted" =
    body.phase === "started" || body.phase === "progress" ? "in_progress" : body.phase;
  const jobUpdate = {
    status,
    output_text: body.outputText,
    thread_id: body.threadId,
    turn_id: body.turnId,
    heartbeat_at: now,
    error_details: body.error === undefined ? undefined : errorDetails(body.error),
  };
  const { error: jobError } = await owned.admin.from("codex_jobs").update(jobUpdate).eq("id", id);
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });

  if (body.outputText !== undefined && owned.job.assistant_message_id) {
    const { error } = await owned.admin.from("messages").update({ content: body.outputText }).eq("id", owned.job.assistant_message_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (owned.job.run_id) {
    const { error: runError } = await owned.admin.from("codex_runs").update({
      status,
      thread_id: body.threadId,
      turn_id: body.turnId,
      error_details: body.error === undefined ? undefined : errorDetails(body.error),
      updated_at: now,
    }).eq("id", owned.job.run_id);
    if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
