// GET /v1/labels/{chain}/{wallet} — CEX / DEX / burn / contract label for one wallet.
// The second segment is a wallet address (not a token); validated like any address.
// No snapshot is needed: labels come from the curated list, the resolved cache or a pattern.
import type { NextRequest } from 'next/server';
import { apiError, apiOk, apiOptions } from '@/lib/api/respond';
import { authorizeApiRequest } from '@/lib/api/auth';
import { labelOf, normalizeAddress } from '@/lib/api/data';
import { serverError, type TokenRouteContext } from '../../../_lib/handlers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: TokenRouteContext) {
  try {
    const { chain, address } = await ctx.params;
    const norm = normalizeAddress(chain, address);
    if (!norm.ok) return apiError('bad_request', norm.message);

    const authed = await authorizeApiRequest(req);
    if ('response' in authed) return authed.response;

    const label = await labelOf(chain, norm.address);
    return apiOk(label, { chain, address: norm.address }, authed.headers);
  } catch (err) {
    return serverError('labels', err);
  }
}

export async function OPTIONS() {
  return apiOptions();
}
