import { NextResponse } from "next/server";
import { authenticateCompanion } from "@/lib/companion/auth";
import type { CompanionHeartbeat } from "@/lib/companion/types";
import type { CodexModel, RateLimitSnapshot } from "@/lib/codex/types";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

function validModels(value: unknown): value is CodexModel[] {
  return Array.isArray(value) && value.length <= 100 && value.every((model) =>
    model && typeof model === "object" && typeof (model as CodexModel).model === "string"
  );
}

export async function POST(request: Request) {
  const companion = await authenticateCompanion(request);
  if (!companion) return NextResponse.json({ error: "Invalid companion token" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as CompanionHeartbeat | null;
  if (!body || typeof body.authenticated !== "boolean" || !validModels(body.models) || !Array.isArray(body.rateLimits)) {
    return NextResponse.json({ error: "Invalid heartbeat" }, { status: 400 });
  }

  const rateLimits = body.rateLimits.slice(0, 100) as RateLimitSnapshot[];
  const { error } = await createAdminClient().from("codex_companions").update({
    name: typeof body.name === "string" ? body.name.slice(0, 80) : companion.name,
    authenticated: body.authenticated,
    account_type: body.accountType,
    email: body.email?.slice(0, 320) ?? null,
    plan_type: body.planType?.slice(0, 80) ?? null,
    models: body.models,
    rate_limits: rateLimits,
    last_error: body.error?.slice(0, 1000) ?? null,
    last_seen_at: new Date().toISOString(),
  }).eq("id", companion.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
