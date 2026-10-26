// Lightweight provider-call accounting shared by the Next.js app and the worker.
// The fetch helpers in graphBuilder/labelResolver call recordProviderCall(url)
// before every upstream request; whoever registers a listener (the worker's
// budget module) gets one event per call. No listener = zero overhead.

export type Provider =
  | 'moralis' | 'helius' | 'vybe' | 'solscan' | 'blockscout' | 'robinhood-rpc'
  | 'publicnode' | 'dexscreener' | 'geckoterminal' | 'other';

export function providerOf(url: string): Provider {
  let host = '';
  try { host = new URL(url).hostname; } catch { return 'other'; }
  if (host.endsWith('moralis.io')) return 'moralis';
  if (host.endsWith('helius.xyz') || host.endsWith('helius-rpc.com')) return 'helius';
  if (host.endsWith('vybenetwork.xyz')) return 'vybe';
  if (host.endsWith('solscan.io')) return 'solscan';
  if (host.includes('blockscout')) return 'blockscout';
  if (host.endsWith('chain.robinhood.com')) return 'robinhood-rpc';
  if (host.endsWith('publicnode.com')) return 'publicnode';
  if (host.endsWith('dexscreener.com')) return 'dexscreener';
  if (host.endsWith('geckoterminal.com')) return 'geckoterminal';
  return 'other';
}

type Listener = (provider: Provider, url: string) => void;
const state: { listener: Listener | null } =
  ((globalThis as any).__providerMeter ||= { listener: null });

export function setProviderCallListener(fn: Listener | null) {
  state.listener = fn;
}

export function recordProviderCall(url: string) {
  if (state.listener) {
    try { state.listener(providerOf(url), url); } catch { /* never break a fetch over metering */ }
  }
}
