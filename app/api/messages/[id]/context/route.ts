import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { Message } from "@/lib/database.types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET /api/messages/[id]/context - Get the full context path for a message
// This traverses from root to the current message, plus any referenced branches
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { id } = await context.params;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the ancestry path using the database function
    const { data: ancestry, error: ancestryError } = await supabase
      .rpc("get_message_ancestry", { message_id: id });

    if (ancestryError) {
      console.error("Error getting ancestry:", ancestryError);
      return NextResponse.json({ error: ancestryError.message }, { status: 500 });
    }

    if (!ancestry || ancestry.length === 0) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Get any branch references for the current message
    const { data: references } = await supabase
      .from("message_references")
      .select("target_message_id")
      .eq("source_message_id", id);

    // Collect all referenced branch messages
    const referencedMessages: Message[] = [];

    if (references && references.length > 0) {
      for (const ref of references) {
        // Get the entire tree from the referenced message's root
        const { data: rootId } = await supabase
          .rpc("get_root_message_id", { message_id: ref.target_message_id });

        if (rootId) {
          const { data: treeMessages } = await supabase
            .rpc("get_tree_messages", { root_id: rootId });

          if (treeMessages) {
            referencedMessages.push(...treeMessages);
          }
        }
      }
    }

    // Merge ancestry with referenced branches
    // Remove duplicates and sort by created_at
    const allMessages = [...ancestry, ...referencedMessages];
    const uniqueMessages = Array.from(
      new Map(allMessages.map((m) => [m.id, m])).values()
    ).sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Format for LLM consumption
    const contextMessages = uniqueMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    return NextResponse.json({
      messages: uniqueMessages,
      context: contextMessages,
      ancestry_length: ancestry.length,
      referenced_count: referencedMessages.length,
    });
  } catch (error) {
    console.error("Error in GET /api/messages/[id]/context:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
