'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import TokenLogo from './TokenLogo';
import { useTrending } from './useTrending';
import { CHAIN_BY_ID, fmtPct, interleave, mapHref, type TrendingToken } from './chains';

const MAX_ITEMS = 40;

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
      <span className="bm-ticker-chg" style={{ color: up ? 'var(--up)' : 'var(--down)' }}>{fmtPct(t.change24h)}</span>
      <span className="bm-ticker-dot" style={{ background: chain?.color ?? 'var(--text3)' }} aria-hidden />
    </Link>
  );
}

/**
 * Site-wide trending strip shown above the nav. The list is rendered once
 * inside a horizontally scrollable viewport (hidden scrollbar — see
 * .bm-ticker-viewport in globals.css): no marquee, no duplicated sequence, so
 * keyboard users get one tab stop per token and nothing moves on its own.
 * Height is fixed at 34px so data arriving never shifts the layout.
 */
export default function Ticker() {
  const { data, loading } = useTrending();
  const items = useMemo(() => (data ? interleave(data.byChain, MAX_ITEMS) : []), [data]);
  const viewportRef = useRef<HTMLDivElement>(null);

  // The scrollbar is hidden, so two things stand in for it: edge fades on the
  // side(s) where content continues (--fade-l / --fade-r, see globals.css), and
  // a vertical mouse wheel scrolling the strip sideways while it has somewhere
  // to go — at either end the wheel falls through to the page as usual.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.style.setProperty('--fade-l', el.scrollLeft > 1 ? '24px' : '0px');
      el.style.setProperty('--fade-r', max - el.scrollLeft > 1 ? '24px' : '0px');
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already a horizontal gesture
      const max = el.scrollWidth - el.clientWidth;
      const next = Math.min(max, Math.max(0, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return;
      e.preventDefault();
      el.scrollLeft = next;
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', onWheel);
      ro.disconnect();
    };
  }, [items, loading]);

  let body: React.ReactNode;
  if (items.length === 0 && loading) {
    body = (
      <div className="bm-ticker-track" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => <span key={i} className="bm-ticker-skel" />)}
      </div>
    );
  } else if (items.length === 0) {
    body = <div className="bm-ticker-track bm-ticker-empty">Trending data is warming up — check back in a few minutes.</div>;
  } else {
    body = (
      <div className="bm-ticker-track">
        {items.map(t => <TickerItem key={`${t.chain}:${t.address}`} t={t} />)}
      </div>
    );
  }

  return (
    <div className="bm-ticker" role="region" aria-label="Trending tokens">
      <div className="bm-ticker-label">
        <span className="bm-ticker-live" aria-hidden />
        Trending
      </div>
      <div className="bm-ticker-viewport" ref={viewportRef}>{body}</div>
    </div>
  );
}
