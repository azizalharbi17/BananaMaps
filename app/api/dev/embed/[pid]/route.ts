// PATCH /api/dev/embed/{pid} { name?, domains?, accent?, badge? } → { partner }
//   402 plan_required when a Partner-plan feature (badge off, accent) is set on the free plan.
// DELETE /api/dev/embed/{pid} → { ok: true }
import type { NextRequest } from 'next/server';
import { getAccount, revokePartner, updatePartner } from '@/lib/dev/accounts';
import { PID_RE, effectiveEmbedPlan, fail, fromError, json, readJsonObject, shapePartner, withUser } from '../../_http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ pid: string }> };

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await withUser(req);
  if ('response' in auth) return auth.response;
  const { pid } = await ctx.params;
  if (!PID_RE.test(pid)) return fail('not_found', 'Embed site not found.', 404);
  const parsed = await readJsonObject(req);
  if ('response' in parsed) return parsed.response;
  const { name, domains, accent, badge } = parsed.body;

  if (name !== undefined && typeof name !== 'string') return fail('bad_request', 'name must be a string.', 400);
  if (domains !== undefined && (!Array.isArray(domains) || domains.some(d => typeof d !== 'string'))) return fail('bad_request', 'domains must be an array of hostnames.', 400);
  if (accent !== undefined && accent !== null && (typeof accent !== 'string' || (accent !== '' && !HEX_RE.test(accent)))) return fail('bad_request', 'accent must be a 6-digit hex color like #F5C842, or null to clear it.', 400);
  if (badge !== undefined && typeof badge !== 'boolean') return fail('bad_request', 'badge must be true or false.', 400);
  if (name === undefined && domains === undefined && accent === undefined && badge === undefined) return fail('bad_request', 'Nothing to update: send name, domains, accent or badge.', 400);

  try {
    const account = await getAccount(auth.user.id);
    if (!account) return fail('no_account', 'Open the developer dashboard first to set up your account.', 404);
    const partner = await updatePartner(
      account.user_id,
      pid,
      { name: name as string | undefined, domains, accent: accent as string | null | undefined, badge: badge as boolean | undefined },
      effectiveEmbedPlan(account),
    );
    return json({ partner: shapePartner(partner) });
  } catch (e) {
    return fromError(e, 'dev/embed/update');
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await withUser(req);
  if ('response' in auth) return auth.response;
  const { pid } = await ctx.params;
  if (!PID_RE.test(pid)) return fail('not_found', 'Embed site not found.', 404);
  try {
    await revokePartner(auth.user.id, pid);
    return json({ ok: true });
  } catch (e) {
    return fromError(e, 'dev/embed/revoke');
  }
}
