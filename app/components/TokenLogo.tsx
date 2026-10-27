'use client';
import { useState } from 'react';

/**
 * Token logo with the same fallback as TokenTile in app/app/AppClient.tsx:
 * first letter of the symbol in a gold circle. A broken image URL swaps to the
 * fallback instead of leaving a hole.
 */
export default function TokenLogo({ src, symbol, size }: { src: string; symbol: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const letter = ((symbol || '?').trim()[0] || '?').toUpperCase();

  if (!src || failed) {
    return (
      <span
        className="bm-logo-fallback"
        style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.46)) }}
        aria-hidden
      >
        {letter}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="bm-logo-img"
      style={{ width: size, height: size }}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
