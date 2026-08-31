import { NextRequest } from "next/server";
import { companionIsOnline } from "@/lib/companion/auth";
import { buildReferencedContext } from "@/lib/codex/prompt";
import { chooseThreadAction, type ClaimedRun } from "@/lib/codex/runs";
import type { CodexModel } from "@/lib/codex/types";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { isLocalMode } from "@/lib/local/mode";
import { generateLocally } from "@/lib/local/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function errorDetails(error: unknown): Json {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (typeof error === "object" && error !== null) return error as Json;
  return { message: String(error) };
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { messageId?: string; model?: string } | null;
  if (!body?.messageId || !body.model) {
    return Response.json({ error: "messageId and model are required" }, { status: 400 });
  }
  if (isLocalMode()) return generateLocally(request, body.messageId, body.model);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: assistantMessage } = await supabase
    .from("messages")
    .select("id, parent_id, conversation_id, role")
    .eq("id", body.messageId)
    .eq("role", "assistant")
    .maybeSingle();
  if (!assistantMessage?.parent_id) {
    return Response.json({ error: "Assistant message not found or not authorized" }, { status: 404 });
  }

  const [{ data: conversation }, { data: userMessage }, { data: companion }] = await Promise.all([
    supabase.from("conversations").select("id").eq("id", assistantMessage.conversation_id).eq("user_id", user.id).maybeSingle(),
    supabase.from("messages").select("id, content, role").eq("id", assistantMessage.parent_id).eq("role", "user").maybeSingle(),
    supabase.from("codex_companions").select("id, authenticated, models, last_seen_at, last_error").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });
  if (!userMessage) return Response.json({ error: "Parent user message not found" }, { status: 400 });
  if (!companion || !companionIsOnline(companion.last_seen_at)) {
    return Response.json({ error: "Your Codex companion is offline. Start `npm run companion` on your Mac." }, { status: 503 });
  }
  if (!companion.authenticated) {
    return Response.json({ error: companion.last_error ?? "Codex is not signed in on your Mac." }, { status: 503 });
  }

  const models = Array.isArray(companion.models) ? companion.models as unknown as CodexModel[] : [];
  const selectedModel = models.find((model) => model.model === body.model || model.id === body.model);
  if (!selectedModel) return Response.json({ error: "The selected Codex model is unavailable" }, { status: 409 });

  const [{ data: allMessages }, { data: references }, { data: linkedContext }] = await Promise.all([
    supabase.from("messages").select("id, parent_id, role, content").eq("conversation_id", conversation.id),
    supabase.from("message_references").select("target_message_id").eq("source_message_id", userMessage.id),
    supabase.from("message_links").select("target_message_id").eq("source_message_id", userMessage.id),
  ]);
  const referencedIds = [
    ...(references ?? []).map((reference) => reference.target_message_id),
    ...(linkedContext ?? []).map((link) => link.target_message_id),
  ];
  const context = buildReferencedContext(
    (allMessages ?? []) as Array<{ id: string; parent_id: string | null; role: "user" | "assistant"; content: string }>,
    [...new Set(referencedIds)],
  );

  const { data: claimRows, error: claimError } = await supabase.rpc("claim_codex_run", {
    assistant_message_id: assistantMessage.id,
    selected_model: selectedModel.model,
  });
  const claim = claimRows?.[0] as ClaimedRun | undefined;
  if (claimError || !claim) {
    return Response.json({ error: claimError?.message ?? "Unable to claim Codex generation" }, { status: 409 });
  }

  const admin = createAdminClient();
  const action = chooseThreadAction(claim);
  const { data: job, error: jobError } = await admin.from("codex_jobs").insert({
    run_id: claim.run_id,
    user_id: user.id,
    assistant_message_id: assistantMessage.id,
    user_message_id: userMessage.id,
    model: selectedModel.model,
    prompt: `${userMessage.content}${context}`,
    action,
  }).select("id").single();
  if (jobError || !job) {
    await admin.from("codex_runs").update({ status: "failed", error_details: errorDetails(jobError), updated_at: new Date().toISOString() }).eq("id", claim.run_id);
    return Response.json({ error: jobError?.message ?? "Unable to queue Codex generation" }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sentLength = 0;
      let closed = false;
      const send = (value: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      };
      try {
        for (let attempt = 0; attempt < 590 && !request.signal.aborted; attempt += 1) {
          const { data: current, error } = await admin
            .from("codex_jobs")
            .select("status, output_text, error_details")
            .eq("id", job.id)
            .single();
          if (error) throw error;
          if (current.output_text.length > sentLength) {
            send({ text: current.output_text.slice(sentLength) });
            sentLength = current.output_text.length;
          }
          if (current.status === "completed" || current.status === "interrupted") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            return;
          }
          if (current.status === "failed") {
            send({ error: "Codex could not complete this response", details: current.error_details, retryable: true });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            return;
          }
          await delay(500);
        }
        if (!request.signal.aborted) send({ error: "The Codex response timed out", retryable: true });
      } catch (error) {
        send({ error: error instanceof Error ? error.message : "Codex generation failed", retryable: true });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
