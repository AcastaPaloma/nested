import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next") ?? "/flow";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type: type as "email" | "signup" | "recovery" | "invite" | "email_change",
      token_hash,
    });

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Return the user to an error page with some instructions
  return NextResponse.redirect(new URL("/login?error=auth_error", request.url));
}
