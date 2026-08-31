import { getCodexAppServer } from "@/lib/codex/app-server";
import { buildReferencedContext } from "@/lib/codex/prompt";
import { chooseThreadAction } from "@/lib/codex/runs";
import { localActiveTurns } from "@/lib/local/active-turns";
import { localStore } from "@/lib/local/store";

const encoder = new TextEncoder();

function details(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { message: String(error) };
}

export async function generateLocally(request: Request, messageId: string, requestedModel: string) {
  const manager = getCodexAppServer();
  const status = await manager.getStatus();
  if (!status.authenticated) {
    return Response.json({ error: status.error ?? "Run `codex login` before starting Nested." }, { status: 503 });
  }
  const selectedModel = status.models.find((model) => model.model === requestedModel || model.id === requestedModel);
  if (!selectedModel) return Response.json({ error: "The selected Codex model is unavailable" }, { status: 409 });

  const generation = await localStore.generationContext(messageId);
  if (!generation) return Response.json({ error: "Assistant message not found" }, { status: 404 });
  const claim = await localStore.claimRun(messageId, selectedModel.model);
  if (!claim) return Response.json({ error: "This response has already been generated" }, { status: 409 });

  const action = chooseThreadAction(claim);
  const context = buildReferencedContext(generation.messages, generation.referencedIds);
  const prompt = `${generation.userMessage.content}${context}`;

  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      let threadId: string | null = null;
      let turnId: string | null = null;
      let output = "";
      let closed = false;
      const send = (payload: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const interrupt = () => {
        if (threadId && turnId) void manager.interruptTurn(threadId, turnId).catch(() => undefined);
      };
      request.signal.addEventListener("abort", interrupt, { once: true });

      try {
        if (action.type === "fork") threadId = await manager.forkThread(action.threadId, action.turnId, selectedModel.model);
        else if (action.type === "resume") threadId = await manager.resumeThread(action.threadId, selectedModel.model);
        else threadId = await manager.startThread(selectedModel.model);

        await localStore.updateRun(claim.run_id, { thread_id: threadId, status: "in_progress" });
        const turn = await manager.streamTurn({
          threadId,
          text: prompt,
          model: selectedModel.model,
          clientUserMessageId: generation.userMessage.id,
          onDelta(delta) {
            output += delta;
            send({ text: delta });
          },
        });
        turnId = turn.turnId;
        localActiveTurns().set(messageId, { threadId, turnId });
        await localStore.updateRun(claim.run_id, { turn_id: turnId });
        const completion = await turn.completion;
        const runStatus = completion.status === "completed"
          ? "completed"
          : completion.status === "interrupted"
            ? "interrupted"
            : "failed";
        await Promise.all([
          localStore.updateRun(claim.run_id, { status: runStatus, error_details: completion.error }),
          localStore.updateMessage(messageId, output),
        ]);
        if (runStatus === "failed") send({ error: "Codex could not complete this response", details: completion.error, retryable: true });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        await Promise.all([
          localStore.updateRun(claim.run_id, { status: "failed", error_details: details(error) }),
          localStore.updateMessage(messageId, output),
        ]).catch(() => undefined);
        send({ error: error instanceof Error ? error.message : "Codex generation failed", retryable: true });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        request.signal.removeEventListener("abort", interrupt);
        localActiveTurns().delete(messageId);
        closed = true;
        controller.close();
      }
    },
  }), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
