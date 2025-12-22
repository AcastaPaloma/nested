import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/conversations - List all conversations for the current user
export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching conversations:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(conversations);
  } catch (error) {
    console.error("Error in GET /api/conversations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/conversations - Create a new conversation
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = body.name || "Untitled Conversation";

    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        name,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating conversation:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/conversations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
