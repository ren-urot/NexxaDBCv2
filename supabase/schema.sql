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

-- Customers submitting a card order usually have no login, so anon must be
-- able to insert. authenticated is included too: if the same browser is
-- signed into /admin, supabase-js sends every request (including from the
-- public Builder page) using that logged-in session instead of the anon
-- key, and without this the insert would be rejected for admins testing
-- the flow themselves. This is still the ONLY thing either role can do via
-- this policy: create new rows, nothing else.
create policy "public_insert_nexora_orders" on nexora_orders for insert to anon, authenticated with check (true);

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

-- Lets a customer poll the status of their own order on the Builder's Status
-- step, without granting anon/authenticated a general SELECT policy on the
-- table (which would let anyone list every order's name/email/card data).
-- SECURITY DEFINER bypasses RLS internally, but the function itself only
-- ever returns two columns for the one row matching both the payment
-- reference AND the email the customer themselves provided at submission —
-- there's no way to enumerate other orders through it.
create or replace function get_order_status(p_payment_ref text, p_email text)
returns table (status text, order_code text)
language sql
security definer
set search_path = public
as $$
  select o.status, o.order_code
  from nexora_orders o
  where o.payment_ref = p_payment_ref and o.email = p_email
  limit 1;
$$;

grant execute on function get_order_status(text, text) to anon, authenticated;

-- Creates an order via a SECURITY DEFINER function instead of a raw table
-- insert. This bypasses RLS internally (the function runs as its owner,
-- not the caller), so order creation no longer depends on the anon/
-- authenticated INSERT policy or on Postgres/PostgREST return-preference
-- defaults at all — the exact combination that caused repeated RLS
-- failures when using a plain insert. Returns the generated order_code so
-- the client can build the customer's public card URL and QR right away.
create or replace function submit_order(
  p_customer text,
  p_email text,
  p_template text,
  p_amount integer,
  p_amount_usd numeric,
  p_exchange_rate numeric,
  p_method text,
  p_payment_ref text,
  p_notes text,
  p_card jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_code text;
begin
  insert into nexora_orders (
    customer, email, template, amount, amount_usd, exchange_rate,
    method, payment_ref, notes, status, card
  )
  values (
    p_customer, p_email, p_template, p_amount, p_amount_usd, p_exchange_rate,
    p_method, p_payment_ref, p_notes, 'submitted', p_card
  )
  returning order_code into v_order_code;

  return v_order_code;
end;
$$;

grant execute on function submit_order(text, text, text, integer, numeric, numeric, text, text, text, jsonb)
  to anon, authenticated;

-- Serves the public "scan to view this card" page (/c/:orderCode). Card
-- fields are meant to be shared once a card exists (that's the point of a
-- business card), so this doesn't gate on payment status — the public page
-- itself shows a "not active yet" state for anything other than approved/
-- provisioned. SECURITY DEFINER again avoids needing any general SELECT
-- policy on the table.
create or replace function get_public_card(p_order_code text)
returns table (card jsonb, status text)
language sql
security definer
set search_path = public
as $$
  select o.card, o.status
  from nexora_orders o
  where o.order_code = p_order_code
  limit 1;
$$;

grant execute on function get_public_card(text) to anon, authenticated;
