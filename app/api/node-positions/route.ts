import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/node-positions?conversation_id=xxx - Load node positions for a conversation
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conversationId = request.nextUrl.searchParams.get("conversation_id");
    if (!conversationId) {
      return NextResponse.json(
        { error: "Missing conversation_id parameter" },
        { status: 400 }
      );
    }

    // Verify conversation belongs to user
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (!conv) {
      return NextResponse.json(
        { error: "Conversation not found or not authorized" },
        { status: 404 }
      );
    }

    // Load node positions
    const { data: positions, error } = await supabase
      .from("node_positions")
      .select("message_id, x, y, width, height")
      .eq("conversation_id", conversationId);

    if (error) {
      console.error("Error loading node positions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Convert array to object keyed by message_id for easy lookup
    const positionsMap: Record<string, { x: number; y: number; width?: number; height?: number }> = {};
    for (const pos of positions || []) {
      positionsMap[pos.message_id] = {
        x: pos.x,
        y: pos.y,
        width: pos.width ?? undefined,
        height: pos.height ?? undefined,
      };
    }

    return NextResponse.json(positionsMap);
  } catch (error) {
    console.error("Error in GET /api/node-positions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/node-positions - Save/update node positions
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { conversation_id, positions } = body;

    if (!conversation_id) {
      return NextResponse.json(
        { error: "Missing conversation_id" },
        { status: 400 }
      );
    }

    if (!positions || !Array.isArray(positions)) {
      return NextResponse.json(
        { error: "Missing or invalid positions array" },
        { status: 400 }
      );
    }

    // Verify conversation belongs to user
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversation_id)
      .eq("user_id", user.id)
      .single();

    if (!conv) {
      return NextResponse.json(
        { error: "Conversation not found or not authorized" },
        { status: 404 }
      );
    }

    // Upsert each position (insert or update)
    const upsertData = positions.map((pos: { message_id: string; x: number; y: number; width?: number; height?: number }) => ({
      conversation_id,
      message_id: pos.message_id,
      x: pos.x,
      y: pos.y,
      width: pos.width ?? null,
      height: pos.height ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("node_positions")
      .upsert(upsertData, {
        onConflict: "conversation_id,message_id",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error("Error saving node positions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/node-positions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
