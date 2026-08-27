-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).
--
-- Uses a dedicated "nexora_orders" table (not "orders") because this Supabase
-- project already has a different, live "orders" table belonging to another
-- app (draft_id/session_id/payment_method schema) — this keeps Nexora fully
-- separate from it.

create table if not exists nexora_orders (
  id bigint generated always as identity primary key,
  order_code text generated always as ('NX-' || lpad(id::text, 4, '0')) stored,
  customer text not null,
  email text not null,
  template text not null,
  amount integer not null,
  method text not null check (method in ('gcash', 'bank')),
  payment_ref text not null default '',
  notes text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'under_verification', 'approved', 'rejected', 'provisioned')),
  submitted_at timestamptz not null default now(),
  card jsonb not null,
  created_at timestamptz not null default now()
);

alter table nexora_orders enable row level security;

-- Customers submitting a card order have no login — the Builder's payment
-- step must be able to insert a new order anonymously. This is the ONLY
-- thing the public (anon) role can do: create new rows, and nothing else.
create policy "public_insert_nexora_orders" on nexora_orders for insert to anon with check (true);

-- Reading and updating orders (the whole Admin dashboard) requires a signed-in
-- Supabase Auth user. Create that admin account yourself in the Supabase
-- Dashboard: Authentication > Users > Add user (email + password), since
-- creating auth users requires the service_role key, which never belongs in
-- this client-side app.
create policy "authenticated_select_nexora_orders" on nexora_orders for select to authenticated using (true);
create policy "authenticated_update_nexora_orders" on nexora_orders for update to authenticated using (true) with check (true);
