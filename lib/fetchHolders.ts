import { Holder } from './bubbleEngine';
import { KNOWN_TOKENS } from './constants';

export async function resolveToken(input: string): Promise<{ address: string; chain: string; name: string }> {
  const upper = input.toUpperCase().trim();
  if (KNOWN_TOKENS[upper]) return KNOWN_TOKENS[upper];
  if (input.startsWith('0x') && input.length === 42) return { address: input, chain: 'eth', name: input.slice(0,6)+'...' };
  if (input.length > 32 && !input.startsWith('0x')) return { address: input, chain: 'sol', name: input.slice(0,6)+'...' };
  return { address: input, chain: 'eth', name: input };
}

export async function fetchHolders(input: string): Promise<{ holders: Holder[]; chain: string; name: string; address: string }> {
  const { address, chain, name } = await resolveToken(input);
  const res = await fetch(`/api/holders?address=${encodeURIComponent(address)}&chain=${chain}`);
  const data = await res.json();
  return { holders: data.holders || [], chain, name, address };
}
