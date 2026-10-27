'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import TokenLogo from './TokenLogo';
import { useTrending } from './useTrending';
import { CHAIN_BY_ID, DOWN, UP, fmtPct, interleave, mapHref, type TrendingToken } from './chains';

const MAX_ITEMS = 40;
/** Seconds per item — keeps the scroll speed constant regardless of list length. */
const SECONDS_PER_ITEM = 2;

function TickerItem({ t }: { t: TrendingToken }) {
  const chain = CHAIN_BY_ID[t.chain];
  const up = t.change24h >= 0;
  return (
    <Link
      href={mapHref(t)}
      prefetch={false}
      className="bm-ticker-item"
      title={`${t.name || t.symbol} · ${chain?.label ?? t.chain}`}
    >
      <TokenLogo src={t.logo} symbol={t.symbol} size={16} />
      <span className="bm-ticker-sym">{t.symbol || t.name}</span>
      <span className="bm-ticker-chg" style={{ color: up ? UP : DOWN }}>{fmtPct(t.change24h)}</span>
      <span className="bm-ticker-dot" style={{ background: chain?.color ?? '#888' }} aria-hidden />
    </Link>
  );
}

/**
 * Site-wide trending marquee shown above the nav. Pure CSS translateX over a
 * duplicated list for a seamless loop; pauses on hover; with
 * prefers-reduced-motion the list is rendered once and simply scrolls.
 * Height is fixed at 34px so data arriving never shifts the layout.
 */
export default function Ticker() {
  const { data, loading } = useTrending();
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const items = useMemo(() => (data ? interleave(data.byChain, MAX_ITEMS) : []), [data]);
  const duration = Math.max(30, items.length * SECONDS_PER_ITEM);

  let body: React.ReactNode;
  if (items.length === 0 && loading) {
    body = (
      <div className="bm-ticker-track bm-ticker-static" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => <span key={i} className="bm-ticker-skel" />)}
      </div>
    );
  } else if (items.length === 0) {
    body = <div className="bm-ticker-track bm-ticker-static bm-ticker-empty">Trending data is warming up — check back in a few minutes.</div>;
  } else {
    body = (
      <div
        className={`bm-ticker-track${reduced ? ' bm-ticker-static' : ''}`}
        style={{ '--bm-ticker-dur': `${duration}s` } as React.CSSProperties}
      >
        <div className="bm-ticker-seq">
          {items.map(t => <TickerItem key={`${t.chain}:${t.address}`} t={t} />)}
        </div>
        {!reduced && (
          <div className="bm-ticker-seq" aria-hidden>
            {items.map(t => <TickerItem key={`${t.chain}:${t.address}`} t={t} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bm-ticker" role="region" aria-label="Trending tokens">
      <div className="bm-ticker-label">
        <span className="bm-ticker-live" aria-hidden />
        Trending
      </div>
      <div className="bm-ticker-viewport">{body}</div>
    </div>
  );
}
