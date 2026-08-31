import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isLocalMode } from "@/lib/local/mode";
import { localStore } from "@/lib/local/store";

type PositionInput = {
  message_id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get("conversation_id");
  if (!conversationId) return NextResponse.json({ error: "conversation_id is required" }, { status: 400 });
  if (isLocalMode()) return NextResponse.json(await localStore.getPositions(conversationId));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("node_positions")
    .select("message_id, x, y, width, height")
    .eq("conversation_id", conversationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const positions = Object.fromEntries(
    (data ?? []).map((position) => [
      position.message_id,
      {
        x: position.x,
        y: position.y,
        ...(position.width === null ? {} : { width: position.width }),
        ...(position.height === null ? {} : { height: position.height }),
      },
    ])
  );

  return NextResponse.json(positions);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    conversation_id?: string;
    positions?: PositionInput[];
  };

  if (!body.conversation_id || !Array.isArray(body.positions)) {
    return NextResponse.json(
      { error: "conversation_id and positions are required" },
      { status: 400 }
    );
  }

  const invalidPosition = body.positions.some(
    (position) =>
      !position?.message_id ||
      !isFiniteNumber(position.x) ||
      !isFiniteNumber(position.y) ||
      (position.width !== undefined && !isFiniteNumber(position.width)) ||
      (position.height !== undefined && !isFiniteNumber(position.height))
  );

  if (invalidPosition) {
    return NextResponse.json({ error: "Invalid node position" }, { status: 400 });
  }

  if (body.positions.length === 0) {
    return NextResponse.json({ success: true });
  }

  if (isLocalMode()) {
    await localStore.savePositions(body.conversation_id, body.positions);
    return NextResponse.json({ success: true });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = body.positions.map((position) => ({
    conversation_id: body.conversation_id!,
    message_id: position.message_id,
    x: position.x,
    y: position.y,
    width: position.width ?? null,
    height: position.height ?? null,
  }));

  const { error } = await supabase
    .from("node_positions")
    .upsert(rows, { onConflict: "conversation_id,message_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
