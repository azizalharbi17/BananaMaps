// Developer-portal auth: the browser sends its Supabase session access token as
// "Authorization: Bearer <jwt>"; the route verifies it against the auth server
// (never trusts the payload alone) and acts through the service role afterwards.
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

export interface DevUser {
  id: string;
  email: string;
  emailConfirmed: boolean;
  /** From user metadata set at signup (ISO) — the legal agreement timestamp. */
  acceptedTermsAt: string | null;
}

export async function requireDevUser(req: NextRequest): Promise<{ user: DevUser } | { error: string; status: number }> {
  const header = req.headers.get('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  if (!token) return { error: 'Sign in to continue.', status: 401 };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { error: 'Auth is not configured.', status: 500 };
  try {
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return { error: 'Your session expired. Sign in again.', status: 401 };
    const u = data.user;
    return {
      user: {
        id: u.id,
        email: u.email || '',
        emailConfirmed: !!u.email_confirmed_at,
        acceptedTermsAt: typeof u.user_metadata?.accepted_terms_at === 'string' ? u.user_metadata.accepted_terms_at : null,
      },
    };
  } catch {
    return { error: 'Could not verify your session.', status: 401 };
  }
}

/** Client IP (Vercel-set headers first; the raw forwarded-for hop can be spoofed). */
export function requestIp(req: NextRequest): string {
  const v = req.headers.get('x-vercel-forwarded-for');
  if (v) return v.split(',')[0].trim();
  const r = req.headers.get('x-real-ip');
  if (r) return r;
  const f = req.headers.get('x-forwarded-for');
  return f ? f.split(',')[0].trim() : '0.0.0.0';
}
