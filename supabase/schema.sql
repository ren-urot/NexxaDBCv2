-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).
-- Safe to re-run any number of times — drops and recreates policies so it
-- always ends in the same correct state, regardless of what's already there.

create table if not exists nexora_orders (
  id bigint generated always as identity primary key,
  order_code text generated always as ('NX-' || lpad(id::text, 4, '0')) stored,
  customer text not null,
  email text not null,
  template text not null,
  amount integer not null,
  amount_usd numeric not null default 0,
  exchange_rate numeric not null default 0,
  method text not null check (method in ('gcash', 'bank', 'wise')),
  payment_ref text not null default '',
  notes text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'under_verification', 'approved', 'rejected', 'provisioned')),
  submitted_at timestamptz not null default now(),
  card jsonb not null,
  created_at timestamptz not null default now()
);

-- The table already exists in production from an earlier version of this
-- script, so the create-table block above is a no-op there. These migrate
-- an existing table forward: add the USD display columns (PHP stays the
-- authoritative amount) and widen method to allow the new Wise option.
alter table nexora_orders add column if not exists amount_usd numeric not null default 0;
alter table nexora_orders add column if not exists exchange_rate numeric not null default 0;
alter table nexora_orders drop constraint if exists nexora_orders_method_check;
alter table nexora_orders add constraint nexora_orders_method_check check (method in ('gcash', 'bank', 'wise'));

alter table nexora_orders enable row level security;

drop policy if exists "public_select_nexora_orders" on nexora_orders;
drop policy if exists "public_insert_nexora_orders" on nexora_orders;
drop policy if exists "public_update_nexora_orders" on nexora_orders;
drop policy if exists "authenticated_select_nexora_orders" on nexora_orders;
drop policy if exists "authenticated_update_nexora_orders" on nexora_orders;

-- Customers submitting a card order have no login — the Builder's payment
-- step must be able to insert a new order anonymously. This is the ONLY
-- thing the public (anon) role can do: create new rows, and nothing else.
create policy "public_insert_nexora_orders" on nexora_orders for insert to anon with check (true);

-- Reading and updating orders (the whole Admin dashboard) requires a signed-in
-- Supabase Auth user.
create policy "authenticated_select_nexora_orders" on nexora_orders for select to authenticated using (true);
create policy "authenticated_update_nexora_orders" on nexora_orders for update to authenticated using (true) with check (true);

-- Lets the Admin dashboard subscribe to live order inserts (for the new-order
-- alert/notification) instead of polling. Safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'nexora_orders'
  ) then
    alter publication supabase_realtime add table nexora_orders;
  end if;
end $$;
