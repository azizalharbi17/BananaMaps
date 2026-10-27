// Catch-all for /v1/<anything else> — a JSON 404 with the valid endpoints,
// so a typo never falls through to the HTML not-found page.
import { apiError, apiOptions } from '@/lib/api/respond';
import { ENDPOINT_LIST } from '../_lib/handlers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ rest: string[] }> }) {
  const { rest } = await ctx.params;
  const path = '/v1/' + (rest || []).map(s => encodeURIComponent(s)).join('/');
  return apiError('not_found', `No endpoint at ${path}. Valid endpoints: ${ENDPOINT_LIST}.`);
}

export async function OPTIONS() {
  return apiOptions();
}
