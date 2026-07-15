-- Lock down cache-table writes (2026-07-14).
-- The permissive insert/update policies let ANYONE with the public anon key forge
-- snapshot and label rows. Our own server code now authenticates with the
-- service-role key (which bypasses RLS), so no write policy is needed at all:
-- dropping them makes the anon key read-only while visitor reads keep working
-- through the untouched "*_read" select policies.

-- token_graphs: drop the permissive write policies, keep public read
drop policy if exists "token_graphs_insert" on public.token_graphs;
drop policy if exists "token_graphs_update" on public.token_graphs;

-- wallet_labels: same
drop policy if exists "wallet_labels_insert" on public.wallet_labels;
drop policy if exists "wallet_labels_update" on public.wallet_labels;

-- Defense in depth: also remove the table-level write grants from the API-facing
-- roles, so a future accidentally-permissive policy can't reopen writes on its own.
revoke insert, update, delete on public.token_graphs from anon, authenticated;
revoke insert, update, delete on public.wallet_labels from anon, authenticated;
