// Lightweight provider-call accounting shared by the Next.js app and the worker.
// The fetch helpers in graphBuilder/labelResolver call recordProviderCall(url)
// before every upstream request; whoever registers a listener (the worker's
// budget module) gets one event per call. No listener = zero overhead.

export type Provider =
  | 'moralis' | 'helius' | 'vybe' | 'solscan' | 'blockscout' | 'robinhood-rpc' | 'robinhood-node'
  | 'publicnode' | 'dexscreener' | 'geckoterminal' | 'other';

type Listener = (provider: Provider, url: string) => void;
const state: { listener: Listener | null; hosts: Map<string, Provider> } =
  ((globalThis as any).__providerMeter ||= { listener: null, hosts: new Map() });

/**
 * Hosts configured at runtime (our own Robinhood Chain node, for example) can't
 * be recognised by pattern — register them so their calls are attributed and
 * budgeted under the right name.
 */
export function registerProviderHost(host: string, provider: Provider) {
  state.hosts.set(host.toLowerCase(), provider);
}

export function providerOf(url: string): Provider {
  let host = '';
  try { host = new URL(url).hostname; } catch { return 'other'; }
  const registered = state.hosts.get(host.toLowerCase());
  if (registered) return registered;
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

export function setProviderCallListener(fn: Listener | null) {
  state.listener = fn;
}

export function recordProviderCall(url: string) {
  if (state.listener) {
    try { state.listener(providerOf(url), url); } catch { /* never break a fetch over metering */ }
  }
}
