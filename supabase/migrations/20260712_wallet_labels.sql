-- Resolved wallet labels (CEX/burn/contract/AMM), cached forever.
-- Sources: curated list, API labels (Moralis / Solscan), heuristics, bytecode checks.
create table if not exists public.wallet_labels (
  chain text not null,
  address text not null,
  name text not null,
  type text not null check (type in ('cex', 'burn', 'contract', 'amm', 'dex')),
  source text not null,
  created_at timestamptz not null default now(),
  primary key (chain, address)
);

alter table public.wallet_labels enable row level security;

drop policy if exists "wallet_labels_read" on public.wallet_labels;
create policy "wallet_labels_read" on public.wallet_labels for select using (true);
drop policy if exists "wallet_labels_insert" on public.wallet_labels;
create policy "wallet_labels_insert" on public.wallet_labels for insert with check (true);
drop policy if exists "wallet_labels_update" on public.wallet_labels;
create policy "wallet_labels_update" on public.wallet_labels for update using (true);
