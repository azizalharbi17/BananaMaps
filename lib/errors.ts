// Error classes shared by the fetchers, the API route and the worker. They live
// in their own module so provider modules can throw them without importing the
// (much larger) graph builder, which would create import cycles.

/** Upstream is broken (rate-limited, 5xx, network) — distinct from "no such token". */
export class UpstreamError extends Error {}

/** The token exists (DexScreener knows it) but holder data isn't indexed yet. */
export class NotIndexedError extends Error {}

/**
 * The token's history is too large to replay inside an on-demand request
 * (serverless time/rate budget). The background worker builds it instead.
 */
export class HeavyTokenError extends Error {
  /** Set by the build runner: the token was enrolled + flagged so the worker will build it. */
  handedOff = false;
  constructor(message: string, public readonly calls: number) { super(message); }
}
