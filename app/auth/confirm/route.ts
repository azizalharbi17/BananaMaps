import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (token_hash && type) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    await supabase.auth.verifyOtp({
      token_hash,
      type: type as "recovery" | "signup" | "email",
    });

    if (type === "recovery") {
      return NextResponse.redirect(new URL("/reset-password", request.url));
    }

    return NextResponse.redirect(new URL("/app", request.url));
  }

  return NextResponse.redirect(new URL("/", request.url));
}
