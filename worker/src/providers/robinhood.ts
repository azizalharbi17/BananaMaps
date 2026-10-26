// Robinhood Chain (Arbitrum Orbit, chain id 4663). Blockscout (holders, per-wallet
// histories) sits behind a Cloudflare managed challenge as of 2026-09, so the
// delta stream comes straight from the public RPC: eth_getLogs on the token's
// Transfer topic over the block window since the cursor (~0.1 s blocks; a
// 10-minute window is a few thousand blocks and one call). Verified live 2026-10-21.
import { BROWSER_UA } from '../../../lib/graphBuilder';
import type { RawTransfer } from '../../../lib/graphCore';
import { rpcPost, TRANSFER_TOPIC, topicToAddr, addrToTopic, formatUnits } from './common';

const RPC: Record<string, string> = { robinhood: 'https://rpc.mainnet.chain.robinhood.com' };
const HEADERS = { 'User-Agent': BROWSER_UA }; // the RPC 403s non-browser UAs
const MAX_RANGE = 50_000;    // blocks per eth_getLogs call (shrinks on range errors)
const MIN_RANGE = 2_000;

export interface RpcDelta { from: string; to: string; value: number; block: number; id: string }

async function call(chain: string, method: string, params: unknown[]): Promise<any> {
  const res = await rpcPost(RPC[chain], { jsonrpc: '2.0', id: 1, method, params }, HEADERS);
  if (res?.error) throw new Error(`${method}: ${res.error.message || JSON.stringify(res.error)}`);
  return res?.result;
}

export const hasRpc = (chain: string) => chain in RPC;

export async function rpcHead(chain: string): Promise<number> {
  return parseInt(await call(chain, 'eth_blockNumber', []), 16);
}

export async function rpcDecimals(chain: string, token: string): Promise<number> {
  const r = await call(chain, 'eth_call', [{ to: token, data: '0x313ce567' }, 'latest']);
  const n = typeof r === 'string' && r !== '0x' ? parseInt(r, 16) : NaN;
  return Number.isFinite(n) && n <= 36 ? n : 18;
}

function decodeLog(l: any, decimals: number): RpcDelta | null {
  if (!l?.topics || l.topics.length < 3) return null;
  return {
    from: topicToAddr(l.topics[1]),
    to: topicToAddr(l.topics[2]),
    value: formatUnits(BigInt(l.data === '0x' ? '0' : l.data), decimals),
    block: parseInt(l.blockNumber, 16),
    id: `${l.transactionHash}:${parseInt(l.logIndex, 16)}`,
  };
}

async function getLogsRange(chain: string, filter: Record<string, unknown>, from: number, to: number, decimals: number, out: RpcDelta[]) {
  let range = MAX_RANGE;
  let cur = from;
  let calls = 0;
  while (cur <= to) {
    const end = Math.min(to, cur + range - 1);
    try {
      const logs = await call(chain, 'eth_getLogs', [{ ...filter, fromBlock: '0x' + cur.toString(16), toBlock: '0x' + end.toString(16) }]);
      calls++;
      for (const l of logs || []) { const d = decodeLog(l, decimals); if (d) out.push(d); }
      cur = end + 1;
    } catch (e) {
      // Range too large / too many results → halve and retry; give up below the floor.
      if (range > MIN_RANGE) { range = Math.max(MIN_RANGE, Math.floor(range / 2)); continue; }
      throw e;
    }
  }
  return calls;
}

export interface RpcDeltaResult { deltas: RpcDelta[]; head: number; calls: number }

/** All Transfer logs for the token in [fromBlock, head]. */
export async function rpcFetchDeltas(chain: string, token: string, fromBlock: number, decimals: number): Promise<RpcDeltaResult> {
  const head = await rpcHead(chain);
  const deltas: RpcDelta[] = [];
  let calls = 1;
  if (head >= fromBlock) calls += await getLogsRange(chain, { address: token, topics: [TRANSFER_TOPIC] }, fromBlock, head, decimals, deltas);
  return { deltas, head, calls };
}

/** A holder's recent token history (both directions) when Blockscout can't serve it. */
export async function rpcHolderHistory(chain: string, token: string, holder: string, fromBlock: number, toBlock: number, decimals: number): Promise<RawTransfer[]> {
  const out: RpcDelta[] = [];
  const t = addrToTopic(holder);
  await getLogsRange(chain, { address: token, topics: [TRANSFER_TOPIC, t] }, fromBlock, toBlock, decimals, out);
  await getLogsRange(chain, { address: token, topics: [TRANSFER_TOPIC, null, t] }, fromBlock, toBlock, decimals, out);
  return out.map(d => ({ from: d.from, to: d.to, id: d.id }));
}

export function rpcDeltaEstimate(fromBlock: number, head: number): number {
  return 1 + Math.ceil(Math.max(0, head - fromBlock) / MAX_RANGE);
}
