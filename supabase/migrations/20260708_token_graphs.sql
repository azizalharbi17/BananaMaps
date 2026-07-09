-- Precomputed token holder graphs (BubbleMaps-style snapshot cache).
create table if not exists public.token_graphs (
  chain text not null,
  address text not null,
  graph jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (chain, address)
);

alter table public.token_graphs enable row level security;

-- Anyone can read snapshots; writes go through the anon key from our own API route.
drop policy if exists "token_graphs_read" on public.token_graphs;
create policy "token_graphs_read" on public.token_graphs for select using (true);
drop policy if exists "token_graphs_insert" on public.token_graphs;
create policy "token_graphs_insert" on public.token_graphs for insert with check (true);
drop policy if exists "token_graphs_update" on public.token_graphs;
create policy "token_graphs_update" on public.token_graphs for update using (true);
