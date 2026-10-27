// Illustrative payloads for the API docs: a PEPE-like token with three holders.
// Numbers are plausible, not live. Built as objects so the rendered JSON is
// always valid and matches the public API contract field for field.

const TOKEN_ADDRESS = '0x6982508145454ce325ddbe47a25d4ec3d2311933';
const COMPUTED_AT = '2026-10-27T09:14:03.000Z';

export const SAMPLE_TOKEN = {
  chain: 'eth',
  address: TOKEN_ADDRESS,
  name: 'Pepe',
  symbol: 'PEPE',
  logo: `https://dd.dexscreener.com/ds-data/tokens/ethereum/${TOKEN_ADDRESS}.png`,
  price: 0.0000112,
  priceChange24h: -3.4,
  marketCap: 4712000000,
  volume24h: 812000000,
  totalHolders: 418223,
  holdersMapped: 150,
  computedAt: COMPUTED_AT,
};

export const SAMPLE_META = { chain: 'eth', address: TOKEN_ADDRESS, computedAt: COMPUTED_AT, snapshotAgeSeconds: 412 };

const H1 = '0xf977814e90da44bfa03b6295a0616a897441acec';
const H2 = '0x3a4d2a7e6c1f0b9d8e5f4a3b2c1d0e9f8a7b6c5d';
const H3 = '0x9e2c7b1a0f3d4e5c6b7a8d9e0f1a2b3c4d5e6f7a';
const C1 = '0x7c1e5b9a2d4f6e8c0b3a5d7f9e1c3b5a7d9f1e3c';

export const SAMPLE_HOLDERS = [
  { rank: 1, address: H1, pct: 6.84, balance: 28775196000000, usdValue: 322282195, label: 'Binance 8', labelType: 'cex', cluster: null },
  { rank: 2, address: H2, pct: 2.41, balance: 10138629000000, usdValue: 113552645, label: null, labelType: null, cluster: 3 },
  { rank: 3, address: H3, pct: 1.97, balance: 8287593000000, usdValue: 92821042, label: null, labelType: null, cluster: 3 },
];

export const SAMPLE_GRAPH = {
  token: SAMPLE_TOKEN,
  nodes: [
    { address: H1, kind: 'holder', rank: 1, pct: 6.84, balance: 28775196000000, usdValue: 322282195, label: 'Binance 8', labelType: 'cex', cluster: null, degree: 1 },
    { address: H2, kind: 'holder', rank: 2, pct: 2.41, balance: 10138629000000, usdValue: 113552645, label: null, labelType: null, cluster: 3, degree: 3 },
    { address: H3, kind: 'holder', rank: 3, pct: 1.97, balance: 8287593000000, usdValue: 92821042, label: null, labelType: null, cluster: 3, degree: 2 },
    { address: C1, kind: 'counterparty', rank: null, pct: 0, balance: null, usdValue: null, label: null, labelType: null, cluster: 3, degree: 2 },
  ],
  edges: [
    { from: 3, to: 1, count: 4 },
    { from: 3, to: 2, count: 2 },
    { from: 1, to: 2, count: 1 },
    { from: 1, to: 0, count: 1 },
  ],
  clusters: [
    { id: 3, members: [1, 2, 3], pct: 4.38 },
  ],
};

export const SAMPLE_HOLDERS_RESPONSE = {
  data: { token: SAMPLE_TOKEN, holders: SAMPLE_HOLDERS },
  meta: SAMPLE_META,
};

export const SAMPLE_GRAPH_RESPONSE = { data: SAMPLE_GRAPH, meta: SAMPLE_META };

export const SAMPLE_LABEL_RESPONSE = {
  data: { address: H1, label: 'Binance 8', labelType: 'cex', source: 'curated' },
  meta: { chain: 'eth', address: H1 },
};

export const SAMPLE_RISK_RESPONSE = {
  data: {
    token: SAMPLE_TOKEN,
    risk: {
      score: 64,
      label: 'Medium Risk',
      factors: [
        { name: 'Top Holder', score: 85, weight: 25, detail: '2.4% held by #1 non-exchange wallet' },
        { name: 'Top 10 Concentration', score: 75, weight: 25, detail: '18.6% held by top 10 (excl. 4 exchanges)' },
        { name: 'Cluster Activity', score: 30, weight: 25, detail: '4 clusters detected' },
        { name: 'Holder Count', score: 75, weight: 15, detail: '146 holders mapped' },
        { name: 'Distribution', score: 50, weight: 10, detail: 'Top 5 hold 13.9%' },
      ],
      top10Pct: 25.42,
      clusterCount: 4,
      clusters: [
        { id: 3, wallets: 3, holders: 2, pct: 4.38, members: [H2, H3, C1] },
      ],
    },
  },
  meta: SAMPLE_META,
};

export const SAMPLE_ERROR_RESPONSE = {
  error: {
    code: 'quota_exceeded',
    message: 'Monthly quota of 1,000 calls reached on the Free plan. Upgrade at https://www.bananamaps.io/developers/dashboard for a higher quota, or wait for the reset on Sun, 01 Nov 2026 00:00:00 GMT.',
    status: 429,
    docs: 'https://www.bananamaps.io/developers/docs',
  },
};

export const SAMPLE_NOT_INDEXED = {
  error: {
    code: 'not_indexed',
    message: `No snapshot for this token yet. Open https://www.bananamaps.io/app?token=${TOKEN_ADDRESS}&chain=eth once to build it, then call again.`,
    status: 404,
    docs: 'https://www.bananamaps.io/developers/docs',
  },
};

export const SAMPLE_PATHS = {
  token: TOKEN_ADDRESS,
  wallet: H1,
};

export const json = (v: unknown) => JSON.stringify(v, null, 2);
