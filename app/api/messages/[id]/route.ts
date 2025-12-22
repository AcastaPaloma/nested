import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// DELETE /api/messages/[id] - Delete a message (cascades to children)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { id } = await context.params;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The database will cascade delete all children due to ON DELETE CASCADE
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/messages/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/messages/[id] - Get a single message
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { id } = await context.params;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: message, error } = await supabase
      .from("messages")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(message);
  } catch (error) {
    console.error("Error in GET /api/messages/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
