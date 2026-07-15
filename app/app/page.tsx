import type { Metadata } from 'next';
import AppClient from './AppClient';
import { lookupCachedGraphForToken } from '@/lib/tokenLookup';

// Per-token titles + OG cards for shared links. Kept cheap: cache-only lookups
// (crawler bots block on this), generic fallback otherwise.
export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ token?: string; chain?: string }> },
): Promise<Metadata> {
  const { token, chain } = await searchParams;
  if (!token) {
    return {
      title: 'Token Holder Maps — BananaMaps',
      description: 'Interactive holder maps for any token on Ethereum, BSC, Base and Solana. See whale clusters, exchange wallets and transfer flows.',
    };
  }

  let title = `${token} holder map — BananaMaps`;
  let description = `Top holders, wallet clusters and transfer flows for ${token}.`;
  try {
    const g = await lookupCachedGraphForToken(token, chain);
    if (g?.name) {
      title = `${g.name} (${g.symbol}) holder map — BananaMaps`;
      const top10 = g.nodes.filter(n => n.kind === 'holder' && (n.rank || 999) <= 10).reduce((s, n) => s + n.pct, 0);
      description = `${g.name}: ${g.clusters.length} wallet clusters, top 10 holders control ${Math.round(top10)}% of supply. Explore the full holder map.`;
    }
  } catch { /* generic fallback is fine */ }

  const qs = `token=${encodeURIComponent(token)}${chain ? `&chain=${encodeURIComponent(chain)}` : ''}`;
  const og = `/api/og?${qs}`;
  return {
    title,
    description,
    // page-level openGraph replaces the layout's wholesale, so restate the site fields
    openGraph: {
      type: 'website',
      siteName: 'BananaMaps',
      url: `/app?${qs}`,
      title,
      description,
      images: [{ url: og, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [og] },
  };
}

export default function Page() {
  return <AppClient />;
}
