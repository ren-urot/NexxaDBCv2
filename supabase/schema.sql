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

-- Prototype-only policies: anyone holding the anon key (i.e. anyone who loads the
-- site, since the key ships in the client bundle) can read, create, and update
-- orders. There is no admin authentication yet. Before this goes anywhere near
-- real customer data, replace these with policies scoped to an authenticated
-- admin role (Supabase Auth) and restrict the public policy to insert-only.
create policy "public_select_nexora_orders" on nexora_orders for select to anon using (true);
create policy "public_insert_nexora_orders" on nexora_orders for insert to anon with check (true);
create policy "public_update_nexora_orders" on nexora_orders for update to anon using (true) with check (true);
