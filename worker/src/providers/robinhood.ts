// Robinhood Chain (Arbitrum Orbit, chain id 4663): thin layer over the shared
// lib/robinhoodRpc.ts (endpoint list, pacing, adaptive eth_getLogs scanning).
// Blockscout is Cloudflare-blocked since 2026-09, so everything — holders,
// histories, deltas — comes from Transfer logs over JSON-RPC: own node first
// (ROBINHOOD_RPC_URLS), public RPC as fallback. Verified live 2026-10-27.
import { isLogChain } from '../../../lib/graphBuilder';
import { getHead, tokenInfo, fetchDeltas, holderHistory, formatUnits } from '../../../lib/robinhoodRpc';
import type { RawTransfer } from '../../../lib/graphCore';

export interface RpcDelta { from: string; to: string; value: number; raw: bigint; block: number; id: string }

export const hasRpc = (chain: string) => isLogChain(chain);

export async function rpcHead(_chain: string): Promise<number> {
  return getHead();
}

export async function rpcDecimals(_chain: string, token: string): Promise<number> {
  return (await tokenInfo(token)).decimals;
}

export interface RpcDeltaResult { deltas: RpcDelta[]; head: number; calls: number }

/** All Transfer logs for the token in [fromBlock, head], in block order. */
export async function rpcFetchDeltas(_chain: string, token: string, fromBlock: number, decimals: number): Promise<RpcDeltaResult> {
  const r = await fetchDeltas(token, fromBlock);
  return { deltas: r.deltas.map(d => ({ ...d, value: formatUnits(d.raw, decimals) })), head: r.head, calls: r.calls };
}

/** A holder's most recent transfers of the token (both directions), scanned back from toBlock. */
export async function rpcHolderHistory(_chain: string, token: string, holder: string, fromBlock: number, toBlock: number, maxLogs: number): Promise<RawTransfer[]> {
  return (await holderHistory(token, holder, fromBlock, toBlock, { maxLogs })).transfers;
}

/** eth_blockNumber + a handful of getLogs chunks per sync. */
export const rpcDeltaEstimate = () => 3;
