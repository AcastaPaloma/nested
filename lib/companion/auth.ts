import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";

const TOKEN_PREFIX = "nested_companion_";

export function createCompanionToken() {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashCompanionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function readCompanionToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 160) return null;
  return token;
}

export function companionIsOnline(lastSeenAt: string | null, now = Date.now()) {
  return Boolean(lastSeenAt && now - new Date(lastSeenAt).getTime() < 30_000);
}

export async function authenticateCompanion(request: Request) {
  const token = readCompanionToken(request);
  if (!token) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("codex_companions")
    .select("id, user_id, name, authenticated, last_seen_at")
    .eq("token_hash", hashCompanionToken(token))
    .maybeSingle();
  if (error) throw error;
  return data;
}
