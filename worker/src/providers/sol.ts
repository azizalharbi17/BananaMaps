// Solana deltas via Helius: each tracked holder's TOKEN ACCOUNT for the mint is
// polled with getSignaturesForAddress(until = last processed signature) — an
// idle account answers [] for one cheap RPC credit — and only new signatures are
// parsed, 100 at a time, through POST /v0/transactions (same tokenTransfers
// shape the full build consumes). Verified live 2026-10-21.
import { fetchJson } from '../../../lib/graphBuilder';
import { recordProviderCall } from '../../../lib/providerMeter';
import { rpcPost, chunk, mapLimit, sleep } from './common';

const HELIUS_KEY = process.env.HELIUS_API_KEY || '';
const RPC = () => `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const PARSE = () => `https://api.helius.xyz/v0/transactions?api-key=${HELIUS_KEY}`;
const MAX_ACCOUNTS_PER_OWNER = 5;
// JSON-RPC requests per HTTP call and the pause between batches. Helius counts
// every element of a batch against the per-second rate limit (free plan: 10/s),
// so the defaults keep one sync near ~8 req/s. Raise on bigger plans.
const BATCH = Math.max(1, Number(process.env.HELIUS_BATCH) || 5);
const BATCH_PAUSE_MS = Number(process.env.HELIUS_BATCH_PAUSE_MS) || 600;

interface RpcReq { id: number; method: string; params: unknown[] }

/** Batched JSON-RPC: one HTTP round trip per BATCH requests (each still bills a credit). */
async function rpcBatch(reqs: RpcReq[]): Promise<Map<number, any>> {
  const out = new Map<number, any>();
  for (const group of chunk(reqs, BATCH)) {
    const body = group.map(r => ({ jsonrpc: '2.0', ...r }));
    let res = await rpcPost(RPC(), body);
    // Helius bills/rate-limits every element of a batch; rpcPost counted the HTTP post once.
    for (let i = 1; i < group.length; i++) recordProviderCall(RPC());
    if (!Array.isArray(res)) {
      // Batch not accepted → fall back to one request per call.
      res = [];
      for (const r of group) res.push(await rpcPost(RPC(), { jsonrpc: '2.0', ...r }));
    }
    for (const item of res) if (item && typeof item.id === 'number') out.set(item.id, item);
    if (reqs.length > BATCH) await sleep(BATCH_PAUSE_MS);
  }
  return out;
}

/** Token accounts (pubkeys) a holder owns for the mint. */
export async function solTokenAccounts(owners: string[], mint: string): Promise<Map<string, string[]>> {
  const reqs: RpcReq[] = owners.map((owner, i) => ({ id: i, method: 'getTokenAccountsByOwner', params: [owner, { mint }, { encoding: 'jsonParsed' }] }));
  const res = await rpcBatch(reqs);
  const out = new Map<string, string[]>();
  owners.forEach((owner, i) => {
    const vals: any[] = res.get(i)?.result?.value || [];
    out.set(owner, vals.map(v => String(v.pubkey)).slice(0, MAX_ACCOUNTS_PER_OWNER));
  });
  return out;
}

/** Newest signature per account (null = account has no history yet). */
export async function solNewestSignatures(accounts: string[]): Promise<Map<string, string | null>> {
  const reqs: RpcReq[] = accounts.map((a, i) => ({ id: i, method: 'getSignaturesForAddress', params: [a, { limit: 1 }] }));
  const res = await rpcBatch(reqs);
  const out = new Map<string, string | null>();
  accounts.forEach((a, i) => {
    const list: any[] = res.get(i)?.result || [];
    out.set(a, list[0]?.signature || null);
  });
  return out;
}

export interface SigPollResult { account: string; signatures: string[]; truncated: boolean; error?: string }

/**
 * New signatures since `until` for each account (newest first), paging with
 * `before` up to maxPages × 100. Accounts with null cursors get seeded with their
 * newest signature and report nothing (their history was loaded by the full build).
 */
export async function solPollSignatures(items: { account: string; until: string | null }[], maxPages: number): Promise<SigPollResult[]> {
  const first = await rpcBatch(items.map((it, i) => ({
    id: i, method: 'getSignaturesForAddress',
    params: [it.account, it.until ? { until: it.until, limit: 100 } : { limit: 1 }],
  })));
  const results: SigPollResult[] = [];
  const needMore: number[] = [];
  items.forEach((it, i) => {
    const r = first.get(i);
    if (!r || r.error) { results[i] = { account: it.account, signatures: [], truncated: false, error: r?.error?.message || 'no response' }; return; }
    const sigs: string[] = (r.result || []).filter((s: any) => !s.err).map((s: any) => String(s.signature));
    results[i] = { account: it.account, signatures: it.until ? sigs : (sigs.length ? [sigs[0]] : []), truncated: false };
    if (it.until && (r.result || []).length >= 100 && maxPages > 1) needMore.push(i);
  });
  // Hyperactive accounts: page further (sequentially — rare).
  for (const i of needMore) {
    const it = items[i];
    let before = results[i].signatures[results[i].signatures.length - 1];
    for (let page = 1; page < maxPages; page++) {
      await sleep(BATCH_PAUSE_MS);
      const r = await rpcPost(RPC(), { jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [it.account, { until: it.until, before, limit: 100 }] });
      const list: any[] = r?.result || [];
      results[i].signatures.push(...list.filter(s => !s.err).map(s => String(s.signature)));
      if (list.length < 100) break;
      before = list[list.length - 1].signature;
      if (page === maxPages - 1) results[i].truncated = true;
    }
  }
  return results;
}

export interface ParsedTransfer { signature: string; mint: string; from: string; to: string; amount: number; type: string }

/** Enhanced-parse signatures (100 per call) → token transfers of the mint. */
export async function solParseTransfers(signatures: string[], mint: string): Promise<{ transfers: ParsedTransfer[]; calls: number }> {
  const transfers: ParsedTransfer[] = [];
  const groups = chunk([...new Set(signatures)], 100);
  await mapLimit(groups, 2, async (group) => {
    const data = await fetchJson(PARSE(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions: group }) });
    for (const tx of Array.isArray(data) ? data : []) {
      for (const tt of tx.tokenTransfers || []) {
        if (tt.mint !== mint || !tt.fromUserAccount || !tt.toUserAccount) continue;
        transfers.push({ signature: tx.signature, mint, from: tt.fromUserAccount, to: tt.toUserAccount, amount: Number(tt.tokenAmount) || 0, type: String(tx.type || '') });
      }
    }
  });
  return { transfers, calls: groups.length };
}
