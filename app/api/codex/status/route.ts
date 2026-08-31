import { NextResponse } from "next/server";
import { companionIsOnline } from "@/lib/companion/auth";
import type { CodexModel, CodexStatus, RateLimitSnapshot } from "@/lib/codex/types";
import { createClient } from "@/utils/supabase/server";
import { getCodexAppServer } from "@/lib/codex/app-server";
import { isLocalMode } from "@/lib/local/mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (isLocalMode()) return NextResponse.json(await getCodexAppServer().getStatus());
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase
    .from("codex_companions")
    .select("authenticated, account_type, email, plan_type, models, rate_limits, last_error, last_seen_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const connected = companionIsOnline(data?.last_seen_at ?? null);
  const status: CodexStatus = {
    connected,
    authenticated: connected && Boolean(data?.authenticated),
    accountType: connected ? (data?.account_type as CodexStatus["accountType"] ?? null) : null,
    email: connected ? data?.email ?? null : null,
    planType: connected ? data?.plan_type ?? null : null,
    models: connected && Array.isArray(data?.models) ? data.models as unknown as CodexModel[] : [],
    rateLimits: connected && Array.isArray(data?.rate_limits) ? data.rate_limits as unknown as RateLimitSnapshot[] : [],
    error: data?.last_error ?? (data ? "Codex companion is offline" : "Pair your Codex companion"),
  };
  return NextResponse.json(status);
}
