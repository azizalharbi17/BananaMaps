// POST /api/dev/embed { name, domains } → 201 { partner } — registers a
// BananaMaps Embed site and returns its public partner id (`pid`, used as ?pid=).
import type { NextRequest } from 'next/server';
import { createPartner, getAccount } from '@/lib/dev/accounts';
import { fail, fromError, json, readJsonObject, shapePartner, withUser } from '../_http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await withUser(req);
  if ('response' in auth) return auth.response;
  const parsed = await readJsonObject(req);
  if ('response' in parsed) return parsed.response;
  const { name, domains } = parsed.body;
  if (name !== undefined && typeof name !== 'string') return fail('bad_request', 'name must be a string.', 400);
  if (domains !== undefined && (!Array.isArray(domains) || domains.some(d => typeof d !== 'string'))) return fail('bad_request', 'domains must be an array of hostnames.', 400);
  try {
    const account = await getAccount(auth.user.id);
    if (!account) return fail('no_account', 'Open the developer dashboard first to set up your account.', 404);
    const partner = await createPartner(account.user_id, { name: name as string | undefined, domains });
    return json({ partner: shapePartner(partner) }, 201);
  } catch (e) {
    return fromError(e, 'dev/embed');
  }
}
