// GET /api/dev/account — the developer dashboard's single load. The first visit
// of a verified user creates the account and issues the first key (returned in
// clear exactly once as `firstKey`); abuse rules live in ensureAccount.
import type { NextRequest } from 'next/server';
import { ensureAccount, listKeys, listPartners, usageThisMonth } from '@/lib/dev/accounts';
import { requestIp } from '@/lib/dev/session';
import { billingConfigured } from '@/lib/billing/stripe';
import { fromError, json, shapeAccount, shapeKey, shapePartner, withUser } from '../_http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await withUser(req);
  if ('response' in auth) return auth.response;
  try {
    const { account, firstKey } = await ensureAccount(auth.user, requestIp(req));
    const uid = account.user_id;
    const [keys, usage, partners] = await Promise.all([
      listKeys(uid),
      usageThisMonth(uid, account.api_tier),
      listPartners(uid),
    ]);
    return json({
      account: shapeAccount(account),
      keys: keys.map(k => shapeKey(k, usage.byKey[k.id] || 0)),
      usage: { period: usage.period, used: usage.used, quota: usage.quota, perMinute: usage.perMinute, resetsAt: usage.resetsAt },
      partners: partners.map(shapePartner),
      firstKey,
      billingConfigured: billingConfigured(),
    });
  } catch (e) {
    return fromError(e, 'dev/account');
  }
}
