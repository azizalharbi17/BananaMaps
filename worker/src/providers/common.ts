import { recordProviderCall } from '../../../lib/providerMeter';
import { UpstreamError } from '../../../lib/graphBuilder';

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Run `fn` over items with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * JSON-RPC POST (single request or batch) with timeout + retry on 429/5xx/network.
 * Throws UpstreamError when the endpoint stays unavailable; JSON-RPC-level errors
 * are returned to the caller inside the response objects.
 */
export async function rpcPost(url: string, body: unknown, headers: Record<string, string> = {}, retries = 4, timeoutMs = 20_000): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      recordProviderCall(url);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= retries) throw new UpstreamError(`HTTP ${res.status} ${url.split('?')[0]}`);
        // Rate limited: honour Retry-After when given, otherwise back off progressively.
        const ra = Number(res.headers.get('retry-after'));
        await sleep(res.status === 429 ? (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500 * (attempt + 1)) : 800 * (attempt + 1));
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new UpstreamError(`HTTP ${res.status} ${url.split('?')[0]}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new UpstreamError(`HTTP ${res.status} ${url.split('?')[0]} ${txt.slice(0, 120)}`);
      }
      return await res.json();
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
      if (attempt >= retries) throw new UpstreamError(String(e));
      await sleep(500 * (attempt + 1));
    }
  }
}

export const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const topicToAddr = (t: string) => ('0x' + t.slice(26)).toLowerCase();
export const addrToTopic = (a: string) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

/** BigInt-safe raw → formatted conversion (double precision is plenty for graph balances). */
export function formatUnits(raw: string | bigint, decimals: number): number {
  try {
    const b = typeof raw === 'bigint' ? raw : BigInt(raw);
    if (decimals <= 0) return Number(b);
    const s = b.toString().padStart(decimals + 1, '0');
    return Number(`${s.slice(0, -decimals)}.${s.slice(-decimals)}`);
  } catch {
    return Number(raw) / Math.pow(10, decimals) || 0;
  }
}
