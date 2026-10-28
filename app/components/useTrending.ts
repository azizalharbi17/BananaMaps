'use client';
import { useEffect, useState } from 'react';
import { dedupeForDisplay, type TrendingPayload, type TrendingToken } from './chains';

// One fetch of /api/trending per page load, shared by every component that
// calls useTrending() (ticker + trending grid). The API itself is served from
// our database — nothing here ever talks to an upstream provider.
const CACHE_MS = 60_000;
let cached: TrendingPayload | null = null;
let cachedAt = 0;
let inflight: Promise<TrendingPayload | null> | null = null;

function load(): Promise<TrendingPayload | null> {
  if (cached && Date.now() - cachedAt < CACHE_MS) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch('/api/trending')
      .then(r => (r.ok ? (r.json() as Promise<TrendingPayload>) : null))
      .catch(() => null)
      .then(d => {
        inflight = null;
        if (d && d.byChain && typeof d.byChain === 'object') {
          // Belt and braces: the API already dedupes, but both the ticker and
          // the grid render byChain, so collapse same-contract repeats and
          // same-name lookalikes here too before the payload is cached and shared.
          const byChain: Record<string, TrendingToken[]> = {};
          for (const [chain, list] of Object.entries(d.byChain)) {
            byChain[chain] = dedupeForDisplay(Array.isArray(list) ? list : []);
          }
          cached = { ...d, byChain };
          cachedAt = Date.now();
          return cached;
        }
        return null;
      });
  }
  return inflight;
}

export interface TrendingState {
  data: TrendingPayload | null;
  loading: boolean;
  error: boolean;
}

export function useTrending(): TrendingState {
  // Server render and first client render both start from "loading" so the
  // markup matches; a warm module cache (client-side navigation) fills in
  // immediately after mount without a skeleton flash worth noticing.
  const [state, setState] = useState<TrendingState>({ data: null, loading: true, error: false });

  useEffect(() => {
    let alive = true;
    load().then(d => {
      if (alive) setState({ data: d, loading: false, error: !d });
    });
    return () => { alive = false; };
  }, []);

  return state;
}
