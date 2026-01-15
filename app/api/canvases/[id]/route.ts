import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/canvases/[id] - Get a specific canvas
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: canvas, error } = await supabase
    .from("builder_canvases")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
    }
    console.error("Failed to fetch canvas:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Check if user has access (owner or collaborator)
  const isOwner = canvas.user_id === user.id;
  const isCollaborator = canvas.collaborators?.includes(user.id);

  if (!isOwner && !isCollaborator) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return NextResponse.json(canvas);
}

// PUT /api/canvases/[id] - Update a canvas
export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
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
    const { name, description, nodes, edges } = body;

    // First check access
    const { data: existingCanvas, error: fetchError } = await supabase
      .from("builder_canvases")
      .select("user_id, collaborators")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const isOwner = existingCanvas.user_id === user.id;
    const isCollaborator = existingCanvas.collaborators?.includes(user.id);

    if (!isOwner && !isCollaborator) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (nodes !== undefined) updateData.nodes = nodes;
    if (edges !== undefined) updateData.edges = edges;

    const { data: canvas, error } = await supabase
      .from("builder_canvases")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update canvas:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(canvas);
  } catch (err) {
    console.error("Invalid request body:", err);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

// DELETE /api/canvases/[id] - Delete a canvas
export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only owner can delete
  const { data: existingCanvas, error: fetchError } = await supabase
    .from("builder_canvases")
    .select("user_id")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (existingCanvas.user_id !== user.id) {
    return NextResponse.json({ error: "Only the owner can delete a canvas" }, { status: 403 });
  }

  const { error } = await supabase
    .from("builder_canvases")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete canvas:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// PATCH /api/canvases/[id] - Add/remove collaborators
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
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
    const { action, collaboratorId, collaboratorEmail } = body;

    // Only owner can manage collaborators
    const { data: existingCanvas, error: fetchError } = await supabase
      .from("builder_canvases")
      .select("user_id, collaborators")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (existingCanvas.user_id !== user.id) {
      return NextResponse.json({ error: "Only the owner can manage collaborators" }, { status: 403 });
    }

    let collaborators = existingCanvas.collaborators || [];
    let targetUserId = collaboratorId;

    // If email provided, look up user ID
    if (!targetUserId && collaboratorEmail) {
      // Look up user by email in auth.users (via admin API or profiles table)
      const { data: targetUser, error: userError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", collaboratorEmail)
        .single();

      if (userError || !targetUser) {
        // Try to find by auth user email (fallback)
        const { data: authUsers } = await supabase.rpc("get_user_by_email", {
          email_input: collaboratorEmail
        });

        if (authUsers && authUsers.length > 0) {
          targetUserId = authUsers[0].id;
        } else {
          return NextResponse.json({
            error: "User not found. They must have an account first."
          }, { status: 404 });
        }
      } else {
        targetUserId = targetUser.id;
      }
    }

    if (action === "add" && targetUserId) {
      if (!collaborators.includes(targetUserId)) {
        collaborators = [...collaborators, targetUserId];
      }
    } else if (action === "remove" && targetUserId) {
      collaborators = collaborators.filter((c: string) => c !== targetUserId);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { data: canvas, error } = await supabase
      .from("builder_canvases")
      .update({
        collaborators,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update collaborators:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(canvas);
  } catch (err) {
    console.error("Invalid request body:", err);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
