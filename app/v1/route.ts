// GET /v1 — public index of the BananaMaps API. No key required.
import { apiOk, apiOptions } from '@/lib/api/respond';
import { API_VERSION, indexPayload } from './_lib/handlers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return apiOk(indexPayload(), { version: API_VERSION });
}

export async function OPTIONS() {
  return apiOptions();
}
