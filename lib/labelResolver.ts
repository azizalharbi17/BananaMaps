// Multi-source wallet label resolver. Priority:
//   1. static curated list (lib/data/knownWallets.json via exchanges.ts)
//   2. wallet_labels cache (Supabase, cached forever; in-memory fallback)
//   3. API labels — EVM: Moralis entity/label data harvested from holder/transfer
//      responses; Solana: Solscan account metadata when SOLSCAN_API_KEY is set
//   4. heuristic — EVM: Moralis wallet stats (token_transfers > 10k or txs > 100k
//      → "Exchange-like (unverified)"); Solana has no cheap tx-count source, so the
//      hub-neighbor heuristic in graphCore covers it within fetched-history limits
//   5. contract/AMM detection — EVM: batched eth_getCode on keyless public RPCs;
//      Solana: Helius getMultipleAccounts owner check (note: authority-style PDAs
//      are system-owned and undetectable this way — those come from sources 1-3)
// Results from sources 3-5 are written through to wallet_labels.
import { AddrLabel } from './graphCore';
import { getExchangeInfo } from './exchanges';
import { getWalletLabels, setWalletLabels, WalletLabelRow } from './graphCache';

const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const MORALIS_KEY = process.env.MORALIS_API_KEY!;
// Solana label APIs: Solscan's metadata endpoint requires their Level-2 ($199/mo)
// plan; Vybe Network exposes the same entity labels with a free API key. Either
// key enables source 3 on Solana — Vybe is tried first.
const SOLSCAN_KEY = process.env.SOLSCAN_API_KEY || '';
const VYBE_KEY = process.env.VYBE_API_KEY || '';

// Keyless public RPCs verified to accept ≥100-element eth_getCode batches.
const EVM_RPC: Record<string, string> = {
  eth: 'https://ethereum-rpc.publicnode.com',
  bsc: 'https://bsc-rpc.publicnode.com',
  base: 'https://base-rpc.publicnode.com',
};

const SYSTEM_PROGRAM = '11111111111111111111111111111111';
// Program owners we can name when a graph node turns out to be a program-owned account.
const SOL_PROGRAM_OWNERS: Record<string, { name: string; type: WalletLabelRow['type'] }> = {
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': { name: 'Token Account', type: 'contract' },
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': { name: 'Token Account', type: 'contract' },
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': { name: 'Raydium Pool', type: 'amm' },
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': { name: 'Raydium Pool', type: 'amm' },
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': { name: 'Orca Pool', type: 'amm' },
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': { name: 'Meteora Pool', type: 'amm' },
};

// Per-build API budgets so labeling never dominates a graph build.
const SOLSCAN_MAX = 40;
const STATS_MAX = 15; // ×50 CU = ≤750 CU per build

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function postJson(url: string, body: unknown, timeoutMs = 12_000): Promise<any> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getJson(url: string, headers: Record<string, string> = {}, timeoutMs = 12_000): Promise<any> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** amm/dex are rendered identically; graph labelType has no 'amm'. */
function rowToLabel(row: WalletLabelRow): AddrLabel {
  return { label: row.name, labelType: row.type === 'amm' ? 'dex' : row.type };
}

const CEX_NAME_RE = /binance|coinbase|kraken|okx|bybit|upbit|kucoin|gate\.?io|huobi|htx|bitget|mexc|crypto\.com|bitfinex|gemini|robinhood|bithumb|exchange/i;

// ---------- Solana account labels (source 3): Vybe (free key) / Solscan (paid) ----------

/** "Bybit Wallet 13" → "Bybit" for display grouping. */
function shortEntityName(name: string): string {
  return name.replace(/\s*(hot\s*|cold\s*)?wallet\s*\d*$/i, '').replace(/\s*\d+$/, '').trim() || name;
}

async function vybeLookup(addresses: string[]): Promise<WalletLabelRow[]> {
  const rows: WalletLabelRow[] = [];
  for (const address of addresses) {
    const data = await getJson(
      `https://api.vybenetwork.xyz/v4/wallets/labeled-accounts?accountAddress=${address}`,
      { 'X-API-KEY': VYBE_KEY },
    );
    const acct = data?.accounts?.[0]; // empty array = unlabeled, not an error
    if (acct?.name) {
      const labels: string[] = (acct.labels || []).map((l: any) => String(l).toLowerCase());
      const name = shortEntityName(String(acct.name));
      if (labels.some(l => l.includes('cex') || l.includes('exchange')) || CEX_NAME_RE.test(name)) {
        rows.push({ address, name, type: 'cex', source: 'vybe' });
      } else if (labels.some(l => l.includes('dex') || l.includes('amm') || l.includes('pool'))) {
        rows.push({ address, name, type: 'amm', source: 'vybe' });
      }
    }
    await sleep(150);
  }
  return rows;
}

async function solscanLookup(addresses: string[]): Promise<WalletLabelRow[]> {
  const rows: WalletLabelRow[] = [];
  for (const address of addresses) {
    const data = await getJson(
      `https://pro-api.solscan.io/v2.0/account/metadata?address=${address}`,
      { token: SOLSCAN_KEY },
    );
    const meta = data?.data;
    if (meta) {
      const name: string | undefined = meta.account_label || meta.account_name;
      const tags: string[] = (meta.account_tags || meta.tags || []).map((t: any) => String(t?.name ?? t).toLowerCase());
      const isExchange = tags.some(t => t.includes('exchange')) || (name ? CEX_NAME_RE.test(name) : false);
      const isPool = tags.some(t => t.includes('pool') || t.includes('amm'));
      if (name && isExchange) {
        rows.push({ address, name: shortEntityName(name), type: 'cex', source: 'solscan' });
      } else if (name && isPool) {
        rows.push({ address, name, type: 'amm', source: 'solscan' });
      }
    }
    await sleep(150); // stay well under Solscan rate limits
  }
  return rows;
}

async function solLabelLookup(addresses: string[]): Promise<WalletLabelRow[]> {
  if (!addresses.length) return [];
  if (VYBE_KEY) {
    const rows = await vybeLookup(addresses);
    if (rows.length || !SOLSCAN_KEY) return rows;
  }
  if (SOLSCAN_KEY) return solscanLookup(addresses);
  return [];
}

// ---------- Moralis wallet stats heuristic (source 4, EVM) ----------

const MORALIS_CHAIN: Record<string, string> = { eth: '0x1', bsc: '0x38', base: '0x2105' };

async function evmStatsHeuristic(chain: string, addresses: string[]): Promise<WalletLabelRow[]> {
  const chainId = MORALIS_CHAIN[chain];
  if (!chainId || !addresses.length) return [];
  const rows: WalletLabelRow[] = [];
  for (const address of addresses) {
    const data = await getJson(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/stats?chain=${chainId}`,
      { 'X-API-Key': MORALIS_KEY },
    );
    if (!data) continue;
    // All values are strings. transactions.total alone misses cold wallets
    // (Binance 8 has only ~21k signed txs but ~93k token transfers).
    const tokenTransfers = Number(data.token_transfers?.total) || 0;
    const txs = Number(data.transactions?.total) || 0;
    if (tokenTransfers > 10_000 || txs > 100_000) {
      rows.push({ address, name: 'Exchange-like (unverified)', type: 'cex', source: 'heuristic-stats' });
    }
    await sleep(120);
  }
  return rows;
}

// ---------- Contract detection (source 5) ----------

async function evmContractCheck(chain: string, addresses: string[]): Promise<WalletLabelRow[]> {
  const rpc = EVM_RPC[chain];
  if (!rpc || !addresses.length) return [];
  const rows: WalletLabelRow[] = [];
  for (let i = 0; i < addresses.length; i += 100) {
    const chunk = addresses.slice(i, i + 100);
    const batch = chunk.map((a, j) => ({ jsonrpc: '2.0', id: j, method: 'eth_getCode', params: [a, 'latest'] }));
    const resp = await postJson(rpc, batch);
    if (!Array.isArray(resp)) continue; // batch-level failure comes back as one object
    for (const item of resp) {
      const addr = chunk[item?.id];
      if (addr && typeof item?.result === 'string' && item.result !== '0x') {
        rows.push({ address: addr, name: 'Contract', type: 'contract', source: 'getcode' });
      }
    }
  }
  return rows;
}

async function solAccountCheck(addresses: string[]): Promise<WalletLabelRow[]> {
  if (!addresses.length) return [];
  const rows: WalletLabelRow[] = [];
  for (let i = 0; i < addresses.length; i += 100) {
    const chunk = addresses.slice(i, i + 100);
    const resp = await postJson(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts',
      params: [chunk, { encoding: 'base64' }],
    });
    const values = resp?.result?.value;
    if (!Array.isArray(values)) continue;
    values.forEach((v: any, j: number) => {
      // null (never funded) and system-owned accounts are wallet-shaped. Anything
      // program-owned is not a wallet. Authority PDAs (system-owned, data-less)
      // are indistinguishable from wallets here — sources 1-3 must cover those.
      if (!v || v.owner === SYSTEM_PROGRAM) return;
      const known = SOL_PROGRAM_OWNERS[v.owner];
      rows.push({
        address: chunk[j],
        name: known?.name || (v.executable ? 'Program' : 'Program Account'),
        type: known?.type || 'contract',
        source: 'account-owner',
      });
    });
  }
  return rows;
}

// ---------- Entry point ----------

export interface ResolveInput {
  /** Graph node addresses (normalized), the full ≤500-node set. */
  addresses: string[];
  /** Labels already harvested from API responses during the fetch (EVM Moralis). */
  apiLabels: Map<string, AddrLabel>;
  /** Wallets worth spending per-address API budget on, in priority order. */
  suspects: string[];
}

export async function resolveWalletLabels(chain: string, input: ResolveInput): Promise<Map<string, AddrLabel>> {
  const out = new Map<string, AddrLabel>();
  const isSol = chain === 'sol';

  // 1. static curated list + vanity burn-address patterns
  const BURN_RE = isSol ? /^1nc1nerator/ : /^0x(dead|0{12,})/i;
  let rest: string[] = [];
  for (const addr of input.addresses) {
    const known = getExchangeInfo(addr, chain);
    if (known) out.set(addr, { label: known.name, labelType: known.type });
    else if (BURN_RE.test(addr)) out.set(addr, { label: 'Burn Address', labelType: 'burn' });
    else rest.push(addr);
  }

  // 2. wallet_labels cache
  const cached = await getWalletLabels(chain, rest);
  for (const [addr, row] of cached) out.set(addr, rowToLabel(row));
  rest = rest.filter(a => !cached.has(a));

  // 3a. API labels already harvested during the fetch (EVM: Moralis entities)
  const newRows: WalletLabelRow[] = [];
  for (const addr of [...rest]) {
    const lb = input.apiLabels.get(addr);
    if (lb?.labelType) {
      out.set(addr, lb);
      newRows.push({ address: addr, name: lb.label || lb.labelType, type: lb.labelType, source: 'moralis' });
    }
  }
  rest = rest.filter(a => !out.has(a));

  const suspectSet = input.suspects.filter(a => rest.includes(a));

  // 3b. Solana account labels (Vybe / Solscan), targeted at suspects
  if (isSol && (VYBE_KEY || SOLSCAN_KEY)) {
    const rows = await solLabelLookup(suspectSet.slice(0, SOLSCAN_MAX));
    for (const r of rows) out.set(r.address, rowToLabel(r));
    newRows.push(...rows);
    rest = rest.filter(a => !out.has(a));
  }

  // 4. Exchange-likeness heuristic (EVM: Moralis wallet stats)
  if (!isSol) {
    const targets = suspectSet.filter(a => !out.has(a)).slice(0, STATS_MAX);
    const rows = await evmStatsHeuristic(chain, targets);
    for (const r of rows) out.set(r.address, rowToLabel(r));
    newRows.push(...rows);
    rest = rest.filter(a => !out.has(a));
  }

  // 5. Contract / AMM detection on everything still unlabeled
  const contractRows = isSol ? await solAccountCheck(rest) : await evmContractCheck(chain, rest);
  for (const r of contractRows) out.set(r.address, rowToLabel(r));
  newRows.push(...contractRows);

  // Cache every non-static resolution forever
  await setWalletLabels(chain, newRows);

  console.log(`[labels] ${chain}: ${input.addresses.length} nodes → static+cache ${out.size - newRows.length}, new ${newRows.length} (solscan/${isSol ? 'on' : 'n/a'}=${SOLSCAN_KEY ? 'key' : 'no-key'})`);
  return out;
}
