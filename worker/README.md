# BananaMaps indexing worker

A standalone, long-running Node service that keeps token holder maps fresh in the
background so `/api/graph` serves straight from Supabase instead of building on
demand. Plain Node/TypeScript, no Next.js; runs 24/7 under pm2 on a VPS.

```
  GeckoTerminal trending ─┐                         ┌─ Moralis  (EVM: token-wide transfers since block N)
  token_graphs (seed)     ├─▶ indexed_tokens ─▶ sync ├─ Helius   (SOL: signatures after cursor, per holder account)
  /api/graph on-demand ───┘    (registry)       loop ├─ Robinhood RPC (eth_getLogs since block N → ledger)
                                                     └─ Vybe / DexScreener (holders, prices)
                                                          │
                                        token_sync_state ◀┴▶ token_graphs  ◀── /api/graph (DB-first)
```

## How it works

**Registry** (`indexed_tokens`). Seeded at boot from every row in `token_graphs`,
topped up every 6 h with GeckoTerminal trending tokens per chain, and extended
automatically whenever `/api/graph` builds a never-seen token on demand
(`lib/buildRunner.ts` → `lib/registry.ts`). Each row carries `tier`, the
human-readable `last_synced_cursor`, `last_full_build`, schedule and backoff
fields. `tier_override` pins a tier by hand; `enabled=false` parks a token.

**Tiers** by liquidity + 24 h volume (DexScreener, thresholds in `.env`):
hot every 10 min, warm hourly, cold daily. A token a user requested in the last
24 h is at least warm.

**Incremental sync** — per token, only what changed since the cursor:

| chain | delta source | cost per sync (steady state) |
|---|---|---|
| eth / bsc / base | Moralis `GET /erc20/{token}/transfers?from_block=N&order=ASC` (token-wide, oldest first, contiguous: a backlog larger than `MAX_DELTA_PAGES` drains over several syncs, nothing is skipped) | 1–3 calls |
| sol | Helius `getSignaturesForAddress(tokenAccount, until=lastSig)` per holder account, idle accounts polled every 2^n syncs; new signatures parsed 100/call via `POST /v0/transactions`. Balances follow every movement of the mint (swaps included); edges keep the wallet-to-wallet (TRANSFER) filter | ~15–40 RPC requests + 0–few parse calls |
| robinhood | RPC `eth_getLogs(Transfer topic, fromBlock=N)` applied to a per-token **ledger** (every address's raw balance) → exact top 150 with no holder call | 2–3 calls |

Deltas update **per-holder edge counts** (`cp[counterparty] = [out, in]`) and
**holder balances** (transfer values, re-ranked and re-percented from supply).
The authoritative top-150 list is re-fetched on a slower cadence
(`HOLDERS_REFRESH_*_MS`): hourly for hot tokens. Holders that enter the top set
get one page of history (same lib fetchers as a full build); holders that leave
drop out of the edge state.

**Graph assembly** reuses `lib/graphCore.buildGraph` — identical node cap, hub
heuristic and connected-component clustering as an on-demand build — so
clusters are recomputed from the updated edges on every sync (a 500-node
union-find, sub-millisecond; no provider cost). CEX/burn/contract labels come
from `lib/labelResolver` but only for node addresses the state hasn't seen,
with results cached in the state; a full build re-resolves everything.

**Full builds** only when there's no state and no cached graph (brand-new
token), on `STATE_VERSION` bumps, or on the scheduled drift reset
(`FULL_REBUILD_EVERY_MS`, default 30 d), and then only with ≥30% of the day's
provider cap still free and under `MAX_FULL_BUILDS_PER_HOUR`. Tokens seeded
from `token_graphs` are *bootstrapped* from the cached graph (holders +
surviving edges → state) at near-zero cost; the bootstrap counts as their
build for scheduling, and the first holder refresh (immediately, since the
snapshot is older than the refresh cadence) brings balances up to date. If a
scheduled rebuild fails because a provider is down, the token keeps syncing
incrementally and the rebuild is retried an interval later.

**Budgets.** Hard daily request caps per provider (`BUDGET_*_PER_DAY`, UTC day,
persisted through restarts via the heartbeat row and shared with the one-shot
CLI commands). Helius counts every element of a JSON-RPC batch as a request and
so does the budget. When a cap is reached, tokens needing that provider are
deferred 15 minutes at a time (not failed) and an alert row is written.
Per-provider circuit breaker: 5 errors in 5 min pauses the provider for 5 min.
Per-token exponential backoff (`10 min × 2^n`, max 24 h) on errors; a token
"not found" three times in a row is disabled.

**Ops.** `GET http://localhost:8787/health` (503 when stalled) and `/tokens`,
bound to loopback (`HEALTH_HOST`) — reach them over SSH, never expose them.
For alerting use a push monitor instead of an inbound check: set
`HEARTBEAT_URL` to an UptimeRobot Heartbeat or Healthchecks.io ping URL and the
worker GETs it once a minute, only after a loop completed and the Supabase
heartbeat write succeeded, so the monitor's silence covers a dead process, a
down host, a stalled loop and an unreachable database alike (give the monitor
a ~5 min grace period for restarts and reboots).
Heartbeat row `worker_heartbeat.id='indexer'` every minute (the app uses it to
decide whether to trust the worker with a first build). JSON logs on stdout.
`worker_alerts` rows for `loop_stalled` (>30 min without a completed loop),
`provider_budget_exhausted`; stall alerts auto-resolve when the loop resumes.

## Robinhood Chain: log replay instead of an explorer API (2026-10-27)

Robinhood Chain has no Moralis coverage and its Blockscout API is behind a
Cloudflare challenge, so the chain is indexed from ERC-20 `Transfer` logs alone
(`lib/robinhoodRpc.ts`, shared with the Next.js app):

- **Full build = replay from genesis.** Address-filtered `eth_getLogs` over the
  whole chain in adaptively sized chunks (the public RPC allows 10M blocks per
  call and 10k logs per response; the range grows while responses are sparse and
  shrinks toward ~6k logs/call). The pass yields every address's balance (the
  ledger), the exact top 150, each holder's counterparty counts (graph edges),
  the supply and the true holder count; the top set is then confirmed with
  batched `balanceOf` (fee/rebase tokens), and the cursor lands at replay head + 1.
  Measured 2026-10-27 on the public RPC: a day-old token 456 transfers → 11
  calls / 9 s; ARROW 583k transfers → 186 calls / 5 min; CHUMP 698k → 233 calls /
  2 min; CASHCAT 13.1M transfers, 326k addresses → 4,007 calls / 38 min at a
  192 MB heap peak. On-demand builds therefore cap at `RH_ONDEMAND_MAX_CALLS`
  (80) and hand anything bigger to the worker (`HeavyTokenError` → enrolled +
  flagged → the app answers 202 while the client polls). A multi-hour replay
  holds the Robinhood concurrency slot (`CONCURRENCY_ROBINHOOD=1`) for its
  duration and is lost (and later retried) if the process is restarted mid-way,
  so avoid deploying while `replay progress` lines are being logged.
- **Incremental = the same stream.** Every Transfer since the cursor moves raw
  balances in the ledger (mints/burns move the supply) and counts edges; the top
  150 is re-ranked from the ledger on every sync for free. A wallet entering the
  top set gets its history from two reverse `eth_getLogs` scans (single-value
  topic filters: OR-lists cap the public RPC at 100k blocks); one leaving the set
  is parked for a week (history kept, still receiving deltas) so rank-150
  flapping doesn't refetch. On the tier cadence the top balances are re-read
  with `balanceOf` and the market data refreshed.
- **Ledger bound.** `RH_LEDGER_MAX_ENTRIES` (50k ≈ 3.5 MB of state) caps the per-token state;
  beyond it the smallest balances are evicted (an evicted address that receives
  again restarts from 0 — understated by at most `evictedBelow`, far below the
  top-150 threshold). States without a ledger (bootstrapped from a cached graph,
  or built before 2026-10-27) are scheduled for one replay full build.
- **Endpoints.** `ROBINHOOD_RPC_URLS` is an ordered list: our own Nitro node
  first, the public RPC last (appended automatically). Calls go to the first
  endpoint that is healthy and within `RH_RPC_MAX_LAG_BLOCKS` of the others;
  with a fallback configured, an endpoint that errors is skipped for 2 minutes
  (a lone endpoint is never skipped — requests back off and retry). Public-RPC
  calls are paced (`RH_RPC_MIN_INTERVAL_MS`, 500 ms; it 429s at ~4-5 req/s) and
  batched 25 at a time; our node is unpaced and budgeted separately
  (`robinhood-node`). Scans stop `RH_HEAD_MARGIN_BLOCKS` (20; the lag tolerance
  when several endpoints are configured) below the head because load-balanced
  nodes clamp `toBlock` to their own head silently; `balanceOf` checks are pinned
  to the block the ledger is exact at. The budget gate aborts a replay the moment
  the day's cap is reached. The app side has one extra knob, `RH_ONDEMAND_MAX_CALLS`
  (80) — set it in the Vercel environment if needed.

## Known provider state (2026-10-21)

- **Moralis Solana top-holders was removed on 2026-07-31** (404 everywhere).
  Solana holders now come from Vybe (`/v4/tokens/{mint}/top-holders`, works on
  the free key, 150 holders in one call, includes exchange labels). The Helius
  token-account scan remains the fallback for tokens Vybe hasn't indexed.
- **Blockscout for Robinhood Chain** (`robinhoodchain.blockscout.com`) answers
  every API call with a Cloudflare managed challenge (403, `cf-mitigated:
  challenge`, still the case 2026-10-27). It is no longer used: see "Robinhood
  Chain: log replay" above. The explorer *website* still serves the address
  links in the UI.

## Local development

```bash
cd worker
npm install
cp .env.example .env            # or rely on ../.env.local (picked up automatically)

# Sync specific tokens against a local JSON store, reading/writing real graphs:
STORE=file GRAPH_SINK=supabase DRY_RUN=1 LOG_FORMAT=pretty \
  npm run sync -- eth:0x6982508145454ce325ddbe47a25d4ec3d2311933 sol:EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm --passes 2
#   --full        force a full build on pass 1
#   --passes N    repeat; pass 2+ must show tiny call counts (deltas only)
#   DRY_RUN=1     never write token_graphs
#   STORE=file    registry/state in worker/.data instead of Supabase

npm run dev            # full loop with tsx (hot code, no build step)
npm run build && npm start
```

Commands: `run` (loop), `once` (drain the due queue, exit), `sync`, `seed`,
`trending`, `enroll chain:addr [--tier hot]`, `status`.

## VPS deployment (Ubuntu, pm2)

0. **Apply the migration** in the Supabase dashboard SQL editor:
   `supabase/migrations/20261021_worker_indexing.sql` (creates
   `indexed_tokens`, `token_sync_state`, `worker_heartbeat`, `worker_alerts`;
   no DROP statements). Deploy the Next.js app (git push) so `/api/graph` is
   registry-aware.

1. **Node 20+ and pm2** on the VPS:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   sudo npm install -g pm2
   ```

2. **Clone and build** (the worker compiles the shared `lib/` files from the
   repo root, so clone the whole repo):
   ```bash
   sudo mkdir -p /opt/bananamaps && sudo chown $USER /opt/bananamaps
   git clone https://github.com/azizalharbi17/bananamaps-next.git /opt/bananamaps
   cd /opt/bananamaps/worker
   npm ci
   npm run build          # → worker/dist
   ```

3. **Configure** — `worker/.env` (never committed):
   ```bash
   cp .env.example .env
   nano .env               # Supabase URL + SERVICE ROLE key, MORALIS/HELIUS/VYBE keys, budgets
   chmod 600 .env
   ```
   Keep `STORE=supabase` (default). The caps in `.env.example` assume the
   2M CU/month Moralis plan and a free Helius plan — tune to yours.

4. **Start under pm2** and survive reboots:
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup            # prints a sudo command — run it once
   ```

5. **Verify**:
   ```bash
   curl -s localhost:8787/health | head -60     # ok:true, lastLoopAgeSec small, providers.* counters moving
   pm2 logs bananamaps-worker --lines 50
   ```
   In Supabase: `select count(*), tier from indexed_tokens group by tier;`,
   `select * from worker_heartbeat;`, `select * from worker_alerts where resolved_at is null;`.
   In the app, a registered token answers `/api/graph` with `"indexed": true`.

6. **Update.** The repo is private, so either register the server's deploy key
   (`cat /root/.ssh/bananamaps_deploy.pub` → GitHub repo Settings → Deploy keys,
   read-only) and pull on the server:
   ```bash
   cd /opt/bananamaps && git pull && cd worker && npm ci && npm run build && pm2 restart bananamaps-worker   # ecosystem.config.cjs changed? use: pm2 delete bananamaps-worker && pm2 start ecosystem.config.cjs && pm2 save
   ```
   or push straight from your machine into the server checkout (it is configured
   with `receive.denyCurrentBranch=updateInstead`; add the remote once with
   `git remote add hetzner ssh://bananamaps-hetzner/opt/bananamaps`):
   ```bash
   git push hetzner main && ssh bananamaps-hetzner 'cd /opt/bananamaps/worker && npm ci && npm run build && pm2 restart bananamaps-worker   # ecosystem.config.cjs changed? use: pm2 delete bananamaps-worker && pm2 start ecosystem.config.cjs && pm2 save'
   ```

Optional hardening: `ufw` so port 8787 is only reachable locally (`pm2` logs and
`curl localhost` are enough), `pm2 install pm2-logrotate`, and a cron that
curls `/health` and alerts on non-200 (the worker already writes
`worker_alerts` rows for stalls, but it can't write one if the process itself
is dead — pm2's restart covers that).

## Tuning notes

- Steady-state spend is dominated by hot-tier tokens. A hot EVM token costs
  ~3 Moralis calls per 10 min (~430/day); a hot Solana token costs one RPC
  credit per *active* holder account per poll (dormant accounts back off to
  every 12th sync). Raise `INTERVAL_MULT_SOL` if Helius credits run short.
- `SKIP_LABELED_HISTORY=1` (default) doesn't poll the streams of exchange /
  pool / contract holders — their edges to tracked wallets are captured from
  the wallet side, and they are excluded from clustering anyway.
- State size is ~100–400 KB per token (`token_sync_state.state`), bounded by
  `MAX_CP_PER_HOLDER`.
- Bump `STATE_VERSION` in `src/state.ts` after a state-shape change and set
  `update indexed_tokens set needs_full_build = true;` — tokens then get a real
  full rebuild as budget allows (bootstrapping from the worker's own capped graph
  is only used when a rebuild is unaffordable at that moment).
- The cursor is captured right after the holder snapshot and before the history
  pages, so balances and the delta stream line up exactly; the first delta
  window may overlap the history pages by a few edge counts (bounded by the
  fetch duration), which is preferred over a permanent hole.
