// EVM (eth / bsc / base) deltas via Moralis's TOKEN-WIDE transfer stream:
//   GET /erc20/{token}/transfers?chain=&from_block=N   (newest first, cursor-paginated)
// One call covers every holder for the window, versus one call per holder on the
// full-build path — the whole reason incremental syncs are cheap. Verified live
// 2026-10-21: a 10-minute PEPE window is one page (53 rows); USDT pages.
import { MORALIS_CHAIN, fetchJson, moralisHeaders, classifyMoralisLabel } from '../../../lib/graphBuilder';
import { getExchangeInfo } from '../../../lib/exchanges';
import type { AddrLabel } from '../../../lib/graphCore';
import { formatUnits } from './common';

const BASE = 'https://deep-index.moralis.io/api/v2.2';

export interface EvmDelta { from: string; to: string; value: number; block: number; id: string }
export interface EvmCursor { kind: 'evm'; block: number; seenAtBlock: string[] }

function rowToDelta(t: any): EvmDelta {
  return {
    from: String(t.from_address || '').toLowerCase(),
    to: String(t.to_address || '').toLowerCase(),
    value: formatUnits(String(t.value || '0'), Number(t.token_decimals ?? 18)),
    block: Number(t.block_number),
    id: `${t.transaction_hash}:${t.log_index}`,
  };
}

function harvest(t: any, chain: string, labels: Map<string, AddrLabel>) {
  for (const [addr, label, entity] of [
    [t.from_address, t.from_address_label, t.from_address_entity],
    [t.to_address, t.to_address_label, t.to_address_entity],
  ] as [string, string | null, string | null][]) {
    if (!addr || labels.has(addr)) continue;
    const known = getExchangeInfo(addr, chain);
    if (known) { labels.set(addr, { label: known.name, labelType: known.type }); continue; }
    const fromApi = classifyMoralisLabel(label, entity, false);
    if (fromApi) labels.set(addr, fromApi);
  }
}

/** Cursor positioned at the newest transfer (inclusive block + ids already seen there). */
export async function evmHeadCursor(chain: string, token: string): Promise<EvmCursor> {
  const chainId = MORALIS_CHAIN[chain] || '0x1';
  const data = await fetchJson(`${BASE}/erc20/${token}/transfers?chain=${chainId}&limit=100`, moralisHeaders);
  const rows: any[] = data?.result || [];
  if (!rows.length) {
    const d2b = await fetchJson(`${BASE}/dateToBlock?chain=${chainId}&date=${encodeURIComponent(new Date().toISOString())}`, moralisHeaders);
    return { kind: 'evm', block: Number(d2b?.block) || 0, seenAtBlock: [] };
  }
  const block = Number(rows[0].block_number);
  const atHead = rows.filter(r => Number(r.block_number) === block);
  // A head block with more transfers than one page can show would partially
  // replay on the first delta sync; start strictly after it instead.
  if (atHead.length === rows.length && rows.length >= 100) return { kind: 'evm', block: block + 1, seenAtBlock: [] };
  return { kind: 'evm', block, seenAtBlock: atHead.map(r => `${r.transaction_hash}:${r.log_index}`) };
}

export interface EvmDeltaResult { deltas: EvmDelta[]; next: EvmCursor; pages: number; truncated: boolean }

/**
 * Transfers since the cursor, OLDEST FIRST (order=ASC, verified accepted), so a
 * window larger than maxPages × 100 rows is consumed contiguously: the cursor
 * only ever advances to the newest block actually applied, and the next sync
 * resumes exactly there. Nothing is skipped; a backlog just drains over syncs.
 */
export async function evmFetchDeltas(
  chain: string, token: string, cursor: EvmCursor, maxPages: number, labels: Map<string, AddrLabel>,
): Promise<EvmDeltaResult> {
  const chainId = MORALIS_CHAIN[chain] || '0x1';
  const seen = new Set(cursor.seenAtBlock);
  const deltas: EvmDelta[] = [];
  let pageCursor = '';
  let pages = 0;
  let truncated = false;
  while (true) {
    const url = `${BASE}/erc20/${token}/transfers?chain=${chainId}&from_block=${cursor.block}&order=ASC&limit=100${pageCursor ? `&cursor=${pageCursor}` : ''}`;
    const data = await fetchJson(url, moralisHeaders);
    pages++;
    const rows: any[] = data?.result || [];
    for (const r of rows) {
      const d = rowToDelta(r);
      if (d.block === cursor.block && seen.has(d.id)) continue;
      deltas.push(d);
      harvest(r, chain, labels);
    }
    pageCursor = data?.cursor || '';
    if (!pageCursor || !rows.length) break;
    if (pages >= maxPages) { truncated = true; break; }
  }
  let next: EvmCursor = cursor;
  if (deltas.length) {
    const maxBlock = Math.max(...deltas.map(d => d.block));
    const idsAtMax = deltas.filter(d => d.block === maxBlock).map(d => d.id);
    next = maxBlock > cursor.block
      ? { kind: 'evm', block: maxBlock, seenAtBlock: idsAtMax }
      : { kind: 'evm', block: cursor.block, seenAtBlock: [...cursor.seenAtBlock, ...idsAtMax] };
  }
  return { deltas, next, pages, truncated };
}

/** Rough call estimate for admission control. */
export const EVM_DELTA_ESTIMATE = 2;
