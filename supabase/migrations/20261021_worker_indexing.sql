-- Background indexing worker (worker/): token registry, incremental sync state,
-- liveness heartbeat and alerts. 2026-10-21.
--
-- Writes come exclusively from the service role (the worker and the Next.js
-- server routes), which bypasses RLS, so no write policies exist. Public reads
-- are allowed only where a status page could use them (registry + heartbeat);
-- the sync state is service-only.

create table if not exists public.indexed_tokens (
  chain               text not null,
  address             text not null,
  symbol              text,
  name                text,
  tier                text not null default 'warm' check (tier in ('hot', 'warm', 'cold')),
  tier_override       text check (tier_override in ('hot', 'warm', 'cold')),
  enabled             boolean not null default true,
  enrolled_from       text not null default 'seed',
  enrolled_at         timestamptz not null default now(),
  liquidity_usd       double precision,
  volume_24h_usd      double precision,
  -- Human-readable cursor summary (EVM/RPC: block number; SOL: per-holder signatures).
  last_synced_cursor  text,
  last_synced_at      timestamptz,
  last_full_build     timestamptz,
  next_sync_at        timestamptz not null default now(),
  -- Set by /api/graph (refresh click, stale serve) — the worker syncs these first.
  sync_requested_at   timestamptz,
  last_requested_at   timestamptz,
  -- Claim lease so two worker processes can never sync the same token at once.
  sync_started_at     timestamptz,
  lock_owner          text,
  sync_count          integer not null default 0,
  consecutive_errors  integer not null default 0,
  backoff_until       timestamptz,
  last_error          text,
  last_error_at       timestamptz,
  needs_full_build    boolean not null default true,
  updated_at          timestamptz not null default now(),
  primary key (chain, address)
);
create index if not exists indexed_tokens_due_idx on public.indexed_tokens (next_sync_at) where enabled;
create index if not exists indexed_tokens_requested_idx on public.indexed_tokens (sync_requested_at) where sync_requested_at is not null;

create table if not exists public.token_sync_state (
  chain       text not null,
  address     text not null,
  version     integer not null,
  state       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (chain, address)
);

create table if not exists public.worker_heartbeat (
  id            text primary key,
  started_at    timestamptz,
  last_loop_at  timestamptz,
  stats         jsonb,
  updated_at    timestamptz not null default now()
);

create table if not exists public.worker_alerts (
  id           bigserial primary key,
  kind         text not null,
  message      text not null,
  details      jsonb,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index if not exists worker_alerts_open_idx on public.worker_alerts (kind) where resolved_at is null;

alter table public.indexed_tokens    enable row level security;
alter table public.token_sync_state  enable row level security;
alter table public.worker_heartbeat  enable row level security;
alter table public.worker_alerts     enable row level security;

-- Idempotent read policies (no DROP statements, so the dashboard runner doesn't
-- flag the migration as destructive).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'indexed_tokens' and policyname = 'indexed_tokens_read') then
    create policy "indexed_tokens_read" on public.indexed_tokens for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'worker_heartbeat' and policyname = 'worker_heartbeat_read') then
    create policy "worker_heartbeat_read" on public.worker_heartbeat for select using (true);
  end if;
end $$;

-- Defense in depth: API-facing roles get no write grants at all.
revoke insert, update, delete on public.indexed_tokens   from anon, authenticated;
revoke all on public.token_sync_state                    from anon, authenticated;
revoke insert, update, delete on public.worker_heartbeat from anon, authenticated;
revoke all on public.worker_alerts                       from anon, authenticated;
