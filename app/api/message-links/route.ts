import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isLocalMode } from "@/lib/local/mode";
import { localStore } from "@/lib/local/store";

type LinkBody = {
  source_message_id?: string;
  target_message_id?: string;
};

function validLink(body: LinkBody) {
  return Boolean(
    body.source_message_id &&
    body.target_message_id &&
    body.source_message_id !== body.target_message_id,
  );
}

export async function POST(request: NextRequest) {
  if (isLocalMode()) {
    const body = await request.json().catch(() => null) as LinkBody | null;
    if (!body || !validLink(body)) return NextResponse.json({ error: "Choose two different messages to link" }, { status: 400 });
    const link = await localStore.putLink(body.source_message_id!, body.target_message_id!);
    return link
      ? NextResponse.json(link, { status: 201 })
      : NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as LinkBody | null;
  if (!body || !validLink(body)) {
    return NextResponse.json({ error: "Choose two different messages to link" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("message_links")
    .upsert({
      source_message_id: body.source_message_id!,
      target_message_id: body.target_message_id!,
    }, { onConflict: "source_message_id,target_message_id" })
    .select("source_message_id, target_message_id")
    .single();

  if (error) {
    const status = error.code === "23514" ? 400 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (isLocalMode()) {
    const body = await request.json().catch(() => null) as LinkBody | null;
    if (!body || !validLink(body)) return NextResponse.json({ error: "Choose two different messages to unlink" }, { status: 400 });
    await localStore.deleteLink(body.source_message_id!, body.target_message_id!);
    return NextResponse.json({ success: true });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as LinkBody | null;
  if (!body || !validLink(body)) {
    return NextResponse.json({ error: "Choose two different messages to unlink" }, { status: 400 });
  }

  const { error } = await supabase
    .from("message_links")
    .delete()
    .eq("source_message_id", body.source_message_id!)
    .eq("target_message_id", body.target_message_id!);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
