// Server-side, cache-only token lookup for metadata/OG cards. Never triggers a
// build — crawler bots block on these paths, so cost is bounded at a few PK reads.
import { TokenGraph } from './graphTypes';
import { getCachedGraph } from './graphCache';
import { KNOWN_TOKENS } from './constants';

const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CHAINS = new Set(['eth', 'bsc', 'base', 'sol', 'robinhood']);

export async function lookupCachedGraphForToken(token: string, chainParam?: string | null): Promise<TokenGraph | null> {
  const known = KNOWN_TOKENS[token.toUpperCase().trim()];
  const address = known?.address || token.trim();
  let chains: string[];
  if (known) chains = [known.chain];
  else if (chainParam && CHAINS.has(chainParam)) chains = [chainParam];
  else if (BASE58_RE.test(address)) chains = ['sol'];
  // An EVM address alone doesn't identify the chain — try them all, cache-only.
  else if (EVM_ADDR_RE.test(address)) chains = ['eth', 'base', 'bsc', 'robinhood'];
  else return null;

  for (const chain of chains) {
    const cached = await getCachedGraph(chain, chain === 'sol' ? address : address.toLowerCase());
    if (cached) return cached.graph;
  }
  return null;
}
