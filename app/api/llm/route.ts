import { Ollama } from "ollama";
import { createClient } from "@/utils/supabase/server";

type ChatRole = "user" | "assistant" | "system";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as {
    messages?: Array<{ role: ChatRole; content: string }>;
    model?: string;
  };
  if (!body.messages?.length) return Response.json({ error: "No messages provided" }, { status: 400 });
  if (!body.model?.trim()) return Response.json({ error: "An Ollama model must be provided explicitly" }, { status: 400 });
  const host = process.env.OLLAMA_HOST?.trim();
  if (!host) return Response.json({ error: "Ollama is not connected" }, { status: 503 });

  try {
    const response = await new Ollama({ host }).chat({
      model: body.model,
      messages: body.messages,
      stream: true,
    });
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            if (chunk.message?.content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.message.content })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    }), { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Ollama generation failed" },
      { status: 503 },
    );
  }
}
