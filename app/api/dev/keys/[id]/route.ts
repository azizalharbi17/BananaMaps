// PATCH /api/dev/keys/{id} { name } → { ok: true };  DELETE → revoke → { ok: true }.
// Revoked keys are kept (status 'revoked') so usage history survives.
import type { NextRequest } from 'next/server';
import { renameKey, revokeKey } from '@/lib/dev/accounts';
import { UUID_RE, fail, fromError, json, readJsonObject, withUser } from '../../_http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await withUser(req);
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail('not_found', 'Key not found.', 404);
  const parsed = await readJsonObject(req);
  if ('response' in parsed) return parsed.response;
  const { name } = parsed.body;
  if (typeof name !== 'string') return fail('bad_request', 'Send { name: string }.', 400);
  try {
    await renameKey(auth.user.id, id, name);
    return json({ ok: true });
  } catch (e) {
    return fromError(e, 'dev/keys/rename');
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await withUser(req);
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail('not_found', 'Key not found.', 404);
  try {
    await revokeKey(auth.user.id, id);
    return json({ ok: true });
  } catch (e) {
    return fromError(e, 'dev/keys/revoke');
  }
}
