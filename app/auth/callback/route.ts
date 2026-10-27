import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeNext as safeNextOn } from "@/lib/safeNext";

/** Only a same-origin relative path may be used as the landing page (see lib/safeNext.ts). */
const safeNext = (raw: string | null, requestUrl: string) => safeNextOn(raw, requestUrl);


/**
 * Only same-origin relative paths may be used as a post-auth destination:
 * must start with "/" and not with "//" (or "/\", which browsers treat alike).
 * Anything else falls back to the default so the callback can't be used as an
 * open redirect.
 */

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type");
  const next = safeNext(requestUrl.searchParams.get("next"), request.url) ?? "/app";

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.exchangeCodeForSession(code);

    // Password recovery always lands on the reset form, whatever `next` says.
    if (type === "recovery") {
      return NextResponse.redirect(new URL("/reset-password", request.url));
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
