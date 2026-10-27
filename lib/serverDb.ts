// Service-role Supabase client for the monetization paths (public API metering,
// developer dashboard, billing webhooks). Separate from lib/graphCache's client
// on purpose: that one carries a shared 60-second failure cooldown tripped by
// any cache hiccup, which must not black out paying API customers. Only the
// service-role key is accepted — the anon key has no grants on these tables.
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;

export const hasServiceKey = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export function serviceDb(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key
    ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) },
      })
    : null;
  return client;
}
