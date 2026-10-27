// Response shapes for the public API (v1). Every response is JSON:
//   success: { data: ..., meta: { chain, address, computedAt?, ... } }
//   error:   { error: { code, message, status, docs } }
import { NextResponse } from 'next/server';

export const DOCS_URL = 'https://www.bananamaps.io/developers/docs';

export type ApiErrorCode =
  | 'unauthorized' | 'invalid_key' | 'revoked_key' | 'account_canceled'
  | 'quota_exceeded' | 'rate_limited' | 'bad_request' | 'not_found' | 'not_indexed' | 'server_error';

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401, invalid_key: 401, revoked_key: 401, account_canceled: 403,
  quota_exceeded: 429, rate_limited: 429, bad_request: 400, not_found: 404, not_indexed: 404, server_error: 500,
};

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Quota-Limit, X-Quota-Used, X-Quota-Reset, Retry-After',
};

export function apiError(code: ApiErrorCode, message: string, extraHeaders: Record<string, string> = {}) {
  const status = STATUS[code];
  return NextResponse.json(
    { error: { code, message, status, docs: DOCS_URL } },
    { status, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store', ...extraHeaders } },
  );
}

export function apiOk<T>(data: T, meta: Record<string, unknown>, headers: Record<string, string> = {}) {
  return NextResponse.json(
    { data, meta },
    { status: 200, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store', ...headers } },
  );
}

export function apiOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
