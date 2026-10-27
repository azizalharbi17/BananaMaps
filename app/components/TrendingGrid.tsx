'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import TokenLogo from './TokenLogo';
import { useTrending } from './useTrending';
import { CHAINS, DOWN, UP, fmtAgo, fmtPct, fmtUsd, mapHref, type ChainMeta, type TrendingToken } from './chains';

const PER_CHAIN = 8;

function TokenCard({ t }: { t: TrendingToken }) {
  const up = t.change24h >= 0;
  const vol = fmtUsd(t.volume24h);
  return (
    <Link
      href={mapHref(t)}
      prefetch={false}
      className="bm-tcard"
      title={t.hasMap ? `${t.name} — holder map ready, opens instantly` : `${t.name} — first map takes ~2 minutes to build`}
    >
      <TokenLogo src={t.logo} symbol={t.symbol} size={32} />
      <span className="bm-tcard-main">
        <span className="bm-tcard-sym">
          <span className="bm-tcard-symtxt">{t.symbol || t.name}</span>
          {/* Label collapses to its dot when the card is too narrow (container query). */}
          {t.hasMap && <span className="bm-instant"><span className="bm-instant-txt">instant</span></span>}
        </span>
        <span className="bm-tcard-name">{t.name}</span>
      </span>
      <span className="bm-tcard-side">
        <span className="bm-tcard-chg" style={{ color: up ? UP : DOWN }}>{fmtPct(t.change24h)}</span>
        {vol && <span className="bm-tcard-vol">{vol} vol</span>}
      </span>
    </Link>
  );
}

function ChainRow({ chain, tokens, loading }: { chain: ChainMeta; tokens: TrendingToken[]; loading: boolean }) {
  if (!loading && tokens.length === 0) return null;
  return (
    <section className="bm-chain-row" aria-label={`Trending on ${chain.label}`}>
      <header className="bm-chain-head">
        <span className="bm-chain-dot" style={{ background: chain.color, boxShadow: `0 0 0 3px ${chain.color}26` }} aria-hidden />
        <span>{chain.label}</span>
        {!loading && <span className="bm-chain-count">{tokens.length} tokens</span>}
      </header>
      <div className="bm-trow">
        {loading
          ? Array.from({ length: PER_CHAIN }, (_, i) => <div key={i} className="bm-skel" aria-hidden />)
          : tokens.slice(0, PER_CHAIN).map(t => <TokenCard key={`${t.chain}:${t.address}`} t={t} />)}
      </div>
    </section>
  );
}

/** "Trending now" — the real trending tokens from /api/trending, one row per chain. */
export default function TrendingGrid() {
  const { data, loading } = useTrending();
  const [now, setNow] = useState(0);

  // Re-render the "Updated Xm ago" label every 30s; `now` only matters once data exists.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const byChain = data?.byChain ?? {};
  const total = CHAINS.reduce((n, c) => n + (byChain[c.id]?.length ?? 0), 0);
  const ago = data?.trendingAt && now ? fmtAgo(data.trendingAt, now) : '';

  return (
    <section className="bm-trending" id="trending" aria-labelledby="bm-trending-title">
      <div className="bm-trending-head">
        <div>
          <h2 id="bm-trending-title" className="bm-trending-title">Trending now</h2>
          <p className="bm-trending-sub">
            <span className="bm-instant"><span className="bm-instant-txt">instant</span></span> = holder map already built · others take ~2 min on first open
          </p>
        </div>
        <div className="bm-trending-updated">
          {loading ? 'Loading…' : ago ? `Updated ${ago}` : 'Refreshes every 30 min'}
        </div>
      </div>

      {!loading && total === 0 ? (
        <div className="bm-trending-empty">Trending data is warming up — check back in a few minutes.</div>
      ) : (
        CHAINS.map(c => <ChainRow key={c.id} chain={c} tokens={byChain[c.id] ?? []} loading={loading} />)
      )}
    </section>
  );
}
