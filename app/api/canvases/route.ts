import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// GET /api/canvases - List all canvases for the current user
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: canvases, error } = await supabase
    .from("builder_canvases")
    .select("id, name, description, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch canvases:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(canvases || []);
}

// POST /api/canvases - Create a new canvas
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name = "Untitled Canvas", description = "" } = body;

    const { data: canvas, error } = await supabase
      .from("builder_canvases")
      .insert({
        user_id: user.id,
        name,
        description,
        nodes: [],
        edges: [],
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create canvas:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(canvas, { status: 201 });
  } catch (err) {
    console.error("Invalid request body:", err);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
