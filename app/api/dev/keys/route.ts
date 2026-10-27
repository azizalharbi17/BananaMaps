// POST /api/dev/keys { name } → 201 { key, row }. The clear-text key is in the
// response once and nowhere else (only its hash is stored, nothing is logged).
import type { NextRequest } from 'next/server';
import { createKey, getAccount } from '@/lib/dev/accounts';
import { fail, fromError, json, readJsonObject, shapeKey, withUser } from '../_http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await withUser(req);
  if ('response' in auth) return auth.response;
  const parsed = await readJsonObject(req);
  if ('response' in parsed) return parsed.response;
  const { name } = parsed.body;
  if (name !== undefined && typeof name !== 'string') return fail('bad_request', 'name must be a string.', 400);
  try {
    const account = await getAccount(auth.user.id);
    if (!account) return fail('no_account', 'Open the developer dashboard first to set up your account.', 404);
    const { key, row } = await createKey(account.user_id, typeof name === 'string' ? name : 'Default');
    return json({ key, row: shapeKey(row) }, 201);
  } catch (e) {
    return fromError(e, 'dev/keys');
  }
}
