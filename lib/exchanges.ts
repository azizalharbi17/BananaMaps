// Static curated wallet labels (CEX hot/cold wallets, burn addresses, AMM routers…).
// The address data lives in lib/data/knownWallets.json so new addresses can be
// appended over time without touching code. EVM entries are keyed lowercase and
// shared across eth/bsc/base; "bsc"/"base" hold chain-specific extras; Solana
// base58 keys are case-sensitive.
import knownWallets from './data/knownWallets.json';

export interface ExchangeInfo {
  name: string;
  type?: 'cex' | 'dex' | 'burn' | 'contract';
}

type RawEntry = { name: string; type?: string };

// 'amm' in the JSON maps to 'dex' internally (same rendering + clustering rules).
function normType(t?: string): ExchangeInfo['type'] {
  if (t === 'amm') return 'dex';
  if (t === 'cex' || t === 'dex' || t === 'burn' || t === 'contract') return t;
  return undefined;
}

function toInfoMap(raw: Record<string, RawEntry>): Record<string, ExchangeInfo> {
  const out: Record<string, ExchangeInfo> = {};
  for (const [addr, e] of Object.entries(raw)) out[addr] = { name: e.name, type: normType(e.type) };
  return out;
}

const wallets = knownWallets as Record<string, Record<string, RawEntry>>;
const EVM = toInfoMap(wallets.evm || {});
const CHAIN_MAP: Record<string, Record<string, ExchangeInfo>> = {
  eth: EVM,
  bsc: { ...EVM, ...toInfoMap(wallets.bsc || {}) },
  base: { ...EVM, ...toInfoMap(wallets.base || {}) },
  sol: toInfoMap(wallets.sol || {}),
};

export function getExchangeInfo(address: string, chain: string): ExchangeInfo | null {
  const exchanges = CHAIN_MAP[chain] || EVM;
  // EVM addresses are case-insensitive, Solana addresses are case-sensitive
  if (chain === 'sol') {
    return exchanges[address] || null;
  }
  return exchanges[address.toLowerCase()] || null;
}

export function isExchange(address: string, chain: string): boolean {
  return getExchangeInfo(address, chain) !== null;
}
