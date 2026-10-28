-- Monetization (2026-10-27): public API keys + metering, Stripe billing state,
-- BananaMaps Embed partners, signup abuse tracking.
--
-- Apply in the Supabase dashboard SQL editor (there is no DDL path from the app).
-- Everything here is service-role only: the app's server routes act on behalf of
-- the signed-in user after verifying their Supabase JWT, and the public API
-- authorizes keys through api_authorize() (SECURITY DEFINER). The anon and
-- authenticated roles get no grants on any of these tables.

-- ---------- plan limits (editable without a deploy) ----------
create table if not exists public.api_tiers (
  tier           text primary key,                 -- free | starter | pro
  monthly_quota  integer not null,
  per_minute     integer not null,
  updated_at     timestamptz not null default now()
);
insert into public.api_tiers (tier, monthly_quota, per_minute) values
  ('free',    1000,   30),
  ('starter', 50000,  120),
  ('pro',     500000, 600)
on conflict (tier) do update set monthly_quota = excluded.monthly_quota, per_minute = excluded.per_minute, updated_at = now();

-- ---------- accounts (one per auth user) ----------
create table if not exists public.api_accounts (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  email                 text not null,
  api_tier              text not null default 'free' references public.api_tiers (tier),
  api_status            text not null default 'active',          -- active | past_due | canceled
  api_subscription_id   text,
  api_interval          text,                                     -- month | year
  api_period_end        timestamptz,
  api_cancel_at_period_end boolean not null default false,
  embed_plan            text not null default 'free',             -- free | partner
  embed_status          text not null default 'active',
  embed_subscription_id text,
  embed_interval        text,
  embed_period_end      timestamptz,
  embed_cancel_at_period_end boolean not null default false,
  stripe_customer_id    text unique,
  accepted_terms_at     timestamptz,
  signup_ip             text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists api_accounts_customer_idx on public.api_accounts (stripe_customer_id);

-- ---------- API keys (only the SHA-256 of the key is stored) ----------
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.api_accounts (user_id) on delete cascade,
  key_hash      text not null unique,
  prefix        text not null,                     -- first 12 chars, for display only (bm_live_ab12)
  name          text not null default 'Default',
  status        text not null default 'active',    -- active | revoked
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index if not exists api_keys_account_idx on public.api_keys (account_id);

-- ---------- metering ----------
create table if not exists public.api_usage (
  key_id      uuid not null references public.api_keys (id) on delete cascade,
  account_id  uuid not null references public.api_accounts (user_id) on delete cascade,
  period      text not null,                       -- YYYY-MM (UTC)
  calls       bigint not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (key_id, period)
);
create index if not exists api_usage_account_period_idx on public.api_usage (account_id, period);

create table if not exists public.api_rate_buckets (
  account_id  uuid not null references public.api_accounts (user_id) on delete cascade,
  bucket      bigint not null,                     -- epoch minute
  calls       integer not null default 0,
  primary key (account_id, bucket)
);

-- ---------- BananaMaps Embed partners ----------
create table if not exists public.embed_partners (
  pid          text primary key,                   -- public id in the embed URL (bme_…)
  account_id   uuid not null references public.api_accounts (user_id) on delete cascade,
  name         text not null,
  domains      text[] not null default '{}',       -- optional allowlist of parent hostnames; empty = any
  accent       text,                               -- hex color, honoured on the partner plan only
  badge        boolean not null default true,      -- "Powered by BananaMaps" badge; may be false on the partner plan only
  status       text not null default 'active',     -- active | revoked
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists embed_partners_account_idx on public.embed_partners (account_id);

-- ---------- abuse + billing bookkeeping ----------
create table if not exists public.signup_events (
  id          bigserial primary key,
  ip          text not null,
  email       text not null,
  user_id     uuid,
  created_at  timestamptz not null default now()
);
create index if not exists signup_events_ip_idx on public.signup_events (ip, created_at);

create table if not exists public.billing_events (
  stripe_event_id  text primary key,               -- webhook idempotency
  type             text not null,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz                     -- null while a handler is running (or died mid-way)
);

-- ---------- lock everything to the service role ----------
alter table public.api_tiers         enable row level security;
alter table public.api_accounts      enable row level security;
alter table public.api_keys          enable row level security;
alter table public.api_usage         enable row level security;
alter table public.api_rate_buckets  enable row level security;
alter table public.embed_partners    enable row level security;
alter table public.signup_events     enable row level security;
alter table public.billing_events    enable row level security;
revoke all on public.api_tiers, public.api_accounts, public.api_keys, public.api_usage, public.api_rate_buckets,
  public.embed_partners, public.signup_events, public.billing_events from anon, authenticated;

-- ---------- authorize + meter one public API call, atomically ----------
-- Returns one row. ok=false comes with a reason:
--   invalid_key | revoked | account_canceled | quota_exceeded | rate_limited
-- A successful call increments the month's usage and the minute bucket; a denied
-- call changes nothing (so a client hammering at the quota doesn't inflate it).
create or replace function public.api_authorize(p_key_hash text)
returns table (
  ok boolean, reason text, account_id uuid, key_id uuid, tier text,
  monthly_used bigint, monthly_quota integer, minute_used integer, per_minute integer,
  period text, period_end timestamptz
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  k         public.api_keys%rowtype;
  a         public.api_accounts%rowtype;
  t         public.api_tiers%rowtype;
  v_period  text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_bucket  bigint := floor(extract(epoch from now()) / 60);
  v_month   bigint := 0;
  v_minute  integer := 0;
  v_pend    timestamptz := date_trunc('month', now() at time zone 'utc') + interval '1 month';
begin
  -- Row locks serialize concurrent calls on the same key/account so a burst
  -- cannot overshoot the per-minute limit or the monthly quota.
  select * into k from public.api_keys where key_hash = p_key_hash for update;
  if not found then
    return query select false, 'invalid_key', null::uuid, null::uuid, null::text, 0::bigint, 0, 0, 0, v_period, v_pend; return;
  end if;
  if k.status <> 'active' then
    return query select false, 'revoked', k.account_id, k.id, null::text, 0::bigint, 0, 0, 0, v_period, v_pend; return;
  end if;
  select * into a from public.api_accounts where user_id = k.account_id for update;
  if not found or a.api_status = 'canceled' then
    return query select false, 'account_canceled', k.account_id, k.id, null::text, 0::bigint, 0, 0, 0, v_period, v_pend; return;
  end if;
  select * into t from public.api_tiers where tier = a.api_tier;
  if not found then select * into t from public.api_tiers where tier = 'free'; end if;

  select coalesce(sum(calls), 0) into v_month from public.api_usage where account_id = a.user_id and period = v_period;
  if v_month >= t.monthly_quota then
    return query select false, 'quota_exceeded', a.user_id, k.id, a.api_tier, v_month, t.monthly_quota, 0, t.per_minute, v_period, v_pend; return;
  end if;

  select calls into v_minute from public.api_rate_buckets where account_id = a.user_id and bucket = v_bucket;
  v_minute := coalesce(v_minute, 0);
  if v_minute >= t.per_minute then
    return query select false, 'rate_limited', a.user_id, k.id, a.api_tier, v_month, t.monthly_quota, v_minute, t.per_minute, v_period, v_pend; return;
  end if;

  insert into public.api_usage (key_id, account_id, period, calls) values (k.id, a.user_id, v_period, 1)
    on conflict (key_id, period) do update set calls = public.api_usage.calls + 1, updated_at = now();
  insert into public.api_rate_buckets (account_id, bucket, calls) values (a.user_id, v_bucket, 1)
    on conflict (account_id, bucket) do update set calls = public.api_rate_buckets.calls + 1;
  delete from public.api_rate_buckets where account_id = a.user_id and bucket < v_bucket - 2;
  if k.last_used_at is null or k.last_used_at < now() - interval '1 minute' then
    update public.api_keys set last_used_at = now() where id = k.id;
  end if;

  return query select true, null::text, a.user_id, k.id, a.api_tier, v_month + 1, t.monthly_quota, v_minute + 1, t.per_minute, v_period, v_pend;
end $$;
revoke all on function public.api_authorize(text) from public, anon, authenticated;

-- ---------- usage summary for the dashboard ----------
create or replace function public.api_usage_summary(p_account uuid, p_period text)
returns table (key_id uuid, calls bigint)
language sql security definer set search_path = public as $$
  select key_id, calls from public.api_usage where account_id = p_account and period = p_period;
$$;
revoke all on function public.api_usage_summary(uuid, text) from public, anon, authenticated;
