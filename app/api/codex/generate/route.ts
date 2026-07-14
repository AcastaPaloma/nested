import { NextRequest } from "next/server";
import { getCodexAppServer } from "@/lib/codex/app-server";
import { buildReferencedContext } from "@/lib/codex/prompt";
import { chooseThreadAction, type ClaimedRun } from "@/lib/codex/runs";
import { createClient } from "@/utils/supabase/server";
import type { Json } from "@/lib/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorDetails(error: unknown): Json {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (typeof error === "object" && error !== null) return error as Json;
  return { message: String(error) };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { messageId?: string; model?: string }
    | null;
  if (!body?.messageId || !body.model) {
    return Response.json({ error: "messageId and model are required" }, { status: 400 });
  }

  const { data: assistantMessage } = await supabase
    .from("messages")
    .select("id, parent_id, conversation_id, role, content")
    .eq("id", body.messageId)
    .eq("role", "assistant")
    .maybeSingle();
  if (!assistantMessage?.parent_id) {
    return Response.json({ error: "Assistant message not found or not authorized" }, { status: 404 });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", assistantMessage.conversation_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

  const { data: userMessage } = await supabase
    .from("messages")
    .select("id, content, role")
    .eq("id", assistantMessage.parent_id)
    .eq("conversation_id", conversation.id)
    .eq("role", "user")
    .maybeSingle();
  if (!userMessage) return Response.json({ error: "Parent user message not found" }, { status: 400 });

  const manager = getCodexAppServer();
  const status = await manager.getStatus();
  if (!status.authenticated) {
    return Response.json(
      { error: status.error ?? "Codex is signed out. Run codex login, then refresh." },
      { status: 503 },
    );
  }
  const selectedModel = status.models.find(
    (model) => model.model === body.model || model.id === body.model,
  );
  if (!selectedModel) {
    return Response.json({ error: "The selected Codex model is unavailable" }, { status: 409 });
  }

  const { data: claimRows, error: claimError } = await supabase.rpc("claim_codex_run", {
    assistant_message_id: assistantMessage.id,
    selected_model: selectedModel.model,
  });
  const claim = claimRows?.[0] as ClaimedRun | undefined;
  if (claimError || !claim) {
    const message = claimError?.message.includes("claim_codex_run")
      ? "The Codex database migration has not been applied"
      : claimError?.message ?? "Unable to claim Codex generation";
    return Response.json({ error: message }, { status: 409 });
  }

  let threadId: string;
  try {
    const action = chooseThreadAction(claim);
    if (action.type === "fork") {
      threadId = await manager.forkThread(action.threadId, action.turnId, selectedModel.model);
    } else if (action.type === "resume") {
      threadId = await manager.resumeThread(action.threadId, selectedModel.model);
    } else {
      threadId = await manager.startThread(selectedModel.model);
    }
    await supabase
      .from("codex_runs")
      .update({ thread_id: threadId, status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", claim.run_id);
  } catch (error) {
    await supabase
      .from("codex_runs")
      .update({ status: "failed", error_details: errorDetails(error), updated_at: new Date().toISOString() })
      .eq("id", claim.run_id);
    await supabase.from("messages").delete().eq("id", assistantMessage.id).eq("content", "");
    return Response.json({ error: error instanceof Error ? error.message : "Codex failed to start" }, { status: 503 });
  }

  const [{ data: allMessages }, { data: references }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, parent_id, role, content")
      .eq("conversation_id", conversation.id),
    supabase
      .from("message_references")
      .select("target_message_id")
      .eq("source_message_id", userMessage.id),
  ]);
  const context = buildReferencedContext(
    (allMessages ?? []) as Array<{
      id: string; parent_id: string | null; role: "user" | "assistant"; content: string;
    }>,
    (references ?? []).map((reference) => reference.target_message_id),
  );
  const prompt = `${userMessage.content}${context}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";
      let persistTimer: NodeJS.Timeout | null = null;
      let closed = false;
      const send = (value: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      };
      const persist = async () => {
        persistTimer = null;
        if (fullText) {
          await supabase.from("messages").update({ content: fullText }).eq("id", assistantMessage.id);
        }
      };
      const schedulePersist = () => {
        if (!persistTimer) persistTimer = setTimeout(() => void persist(), 500);
      };

      try {
        const turn = await manager.streamTurn({
          threadId,
          text: prompt,
          model: selectedModel.model,
          clientUserMessageId: userMessage.id,
          onDelta(delta) {
            fullText += delta;
            send({ text: delta });
            schedulePersist();
          },
        });
        await supabase
          .from("codex_runs")
          .update({ turn_id: turn.turnId, updated_at: new Date().toISOString() })
          .eq("id", claim.run_id);
        const completion = await turn.completion;
        if (persistTimer) clearTimeout(persistTimer);
        await persist();
        await supabase
          .from("codex_runs")
          .update({
            status: completion.status,
            error_details: completion.error ? errorDetails(completion.error) : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", claim.run_id);

        if (completion.status === "failed") {
          if (!fullText) await supabase.from("messages").delete().eq("id", assistantMessage.id);
          send({ error: "Codex could not complete this response", retryable: true });
        }
        if (!closed) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        if (persistTimer) clearTimeout(persistTimer);
        await persist();
        await supabase
          .from("codex_runs")
          .update({ status: "failed", error_details: errorDetails(error), updated_at: new Date().toISOString() })
          .eq("id", claim.run_id);
        if (!fullText) await supabase.from("messages").delete().eq("id", assistantMessage.id);
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
