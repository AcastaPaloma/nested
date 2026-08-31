import { NextResponse } from "next/server";
import { companionIsOnline, createCompanionToken, hashCompanionToken } from "@/lib/companion/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await authenticatedClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("codex_companions")
    .select("id, name, authenticated, account_type, email, plan_type, last_error, last_seen_at, created_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ paired: false, online: false });
  return NextResponse.json({
    paired: true,
    online: companionIsOnline(data.last_seen_at),
    companion: {
      id: data.id,
      name: data.name,
      authenticated: data.authenticated,
      accountType: data.account_type,
      email: data.email,
      planType: data.plan_type,
      error: data.last_error,
      lastSeenAt: data.last_seen_at,
      pairedAt: data.created_at,
    },
  });
}

export async function POST() {
  const { user } = await authenticatedClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = createCompanionToken();
  const { error } = await createAdminClient().from("codex_companions").upsert({
    user_id: user.id,
    token_hash: hashCompanionToken(token),
    name: "Local Codex",
    authenticated: false,
    account_type: null,
    email: null,
    plan_type: null,
    models: [],
    rate_limits: [],
    last_error: null,
    last_seen_at: null,
  }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    paired: true,
    token,
    productionUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://nested-kuan-yis-projects.vercel.app",
  });
}

export async function DELETE() {
  const { user } = await authenticatedClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { error } = await createAdminClient().from("codex_companions").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
