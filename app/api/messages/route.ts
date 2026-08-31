import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isLocalMode } from "@/lib/local/mode";
import { localStore } from "@/lib/local/store";

// POST /api/messages - Create a new message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      conversation_id,
      parent_id,
      role,
      content,
      model,
      provider,
      branch_references = [], // Array of target message IDs to reference
    } = body;

    // Validate required fields
    if (!conversation_id || !role || content === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: conversation_id, role, content" },
        { status: 400 }
      );
    }

    if (isLocalMode()) {
      if (role !== "user" && role !== "assistant") {
        return NextResponse.json({ error: "role must be user or assistant" }, { status: 400 });
      }
      const message = await localStore.createMessage({
        conversation_id,
        parent_id: parent_id || null,
        role,
        content,
        model: model || null,
        provider: provider || null,
      }, branch_references);
      return message
        ? NextResponse.json(message, { status: 201 })
        : NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify conversation belongs to user
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversation_id)
      .single();

    if (!conv) {
      return NextResponse.json(
        { error: "Conversation not found or not authorized" },
        { status: 404 }
      );
    }

    // Create message
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id,
        parent_id: parent_id || null,
        role,
        content,
        model: model || null,
        provider: provider || null,
      })
      .select()
      .single();

    if (msgError) {
      console.error("Error creating message:", msgError);
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    // Create branch references if provided
    if (branch_references.length > 0) {
      const referenceInserts = branch_references.map((targetId: string) => ({
        source_message_id: message.id,
        target_message_id: targetId,
      }));

      const { error: refError } = await supabase
        .from("message_references")
        .insert(referenceInserts);

      if (refError) {
        console.error("Error creating references:", refError);
        // Don't fail the whole request, just log the error
      }
    }

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/messages:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/messages - Update a message (mainly for streaming content updates)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, content } = body;

    if (!id || content === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: id, content" },
        { status: 400 }
      );
    }

    if (isLocalMode()) {
      const message = await localStore.updateMessage(id, content);
      return message
        ? NextResponse.json(message)
        : NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: message, error } = await supabase
      .from("messages")
      .update({ content })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(message);
  } catch (error) {
    console.error("Error in PATCH /api/messages:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
