import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// POST /api/seed - Create sample conversation data for new users
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user already has conversations
  const { data: existingConversations, error: checkError } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (checkError) {
    return NextResponse.json({ error: checkError.message }, { status: 500 });
  }

  // If user already has conversations, don't seed
  if (existingConversations && existingConversations.length > 0) {
    return NextResponse.json({ message: "User already has conversations", seeded: false });
  }

  // Create a sample conversation with branching structure
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      user_id: user.id,
      title: "Welcome to Nested! 👋",
    })
    .select()
    .single();

  if (convError || !conversation) {
    return NextResponse.json(
      { error: convError?.message || "Failed to create conversation" },
      { status: 500 }
    );
  }

  // Insert first message
  const { data: firstMessage, error: firstMsgError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      role: "user" as const,
      content: "Hi! Can you explain how this conversation graph works?",
      parent_id: null,
    })
    .select()
    .single();

  if (firstMsgError || !firstMessage) {
    return NextResponse.json(
      { error: firstMsgError?.message || "Failed to create message" },
      { status: 500 }
    );
  }

  // Insert second message with parent
  const { data: secondMessage, error: secondMsgError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      role: "assistant" as const,
      content:
        "Welcome to Nested! 🎉\n\nThis conversation graph visualizes your chat as a tree structure. Each node is a message, and branches show different conversation paths.\n\n**Key features:**\n- **Click a node** to select it as context\n- **Branch from any point** to explore alternatives\n- **Context Lens** shows exactly what the AI sees\n\nTry clicking the 'New Branch' button to start a parallel conversation!",
      parent_id: firstMessage.id,
    })
    .select()
    .single();

  if (secondMsgError || !secondMessage) {
    return NextResponse.json(
      { error: secondMsgError?.message || "Failed to create message" },
      { status: 500 }
    );
  }

  // Create a branch showing the branching feature
  const { data: branchMsg1 } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      role: "user" as const,
      content: "What about the Context Lens feature?",
      parent_id: secondMessage.id,
    })
    .select()
    .single();

  if (branchMsg1) {
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant" as const,
      content:
        "Great question! The **Context Lens** is our transparency panel. 🔍\n\nOpen it by clicking the eye icon in the toolbar. It shows:\n\n1. **Token count** - How much context is being sent\n2. **Included nodes** - Which messages are in context\n3. **Toggle controls** - Include/exclude specific messages\n\nThis gives you complete control over what information the AI uses to generate responses!",
      parent_id: branchMsg1.id,
    });
  }

  // Create another branch from the same parent (demonstrating branching)
  const { data: altBranchMsg1 } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      role: "user" as const,
      content: "How does the cost control work?",
      parent_id: secondMessage.id,
    })
    .select()
    .single();

  if (altBranchMsg1) {
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant" as const,
      content:
        "Smart question! 💰 Nested uses **intelligent model routing**:\n\n1. **Small model first** - Quick queries go to efficient local models\n2. **Automatic escalation** - Complex tasks route to powerful models\n3. **You're in control** - See costs before they happen\n\nThis means you get the best model for each task without overspending!",
      parent_id: altBranchMsg1.id,
    });
  }

  return NextResponse.json({
    message: "Sample conversation created",
    seeded: true,
    conversationId: conversation.id,
  });
}
