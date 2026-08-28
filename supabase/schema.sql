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

-- Links an add-on card (Business plan: "Add New Cards") back to the order
-- that owns the Card Holder it belongs to. Null on every normal, standalone
-- order and on the first ("root") card of a family. A family is always
-- exactly one level deep: a root order plus its direct children — nothing
-- ever points at a non-root row, so callers only ever need to resolve
-- coalesce(parent_order_id, id) to find the root.
alter table nexora_orders add column if not exists parent_order_id bigint references nexora_orders(id);

-- A payment reference is proof of one specific real-world transaction, so
-- reusing one (whether by accident or to fraudulently claim a payment that
-- was never made for this order) must be impossible, not just discouraged
-- in the UI. Partial index so it never blocks on '', the column's default
-- before a real reference is submitted.
create unique index if not exists nexora_orders_payment_ref_unique
  on nexora_orders (payment_ref)
  where payment_ref <> '';

alter table nexora_orders enable row level security;

drop policy if exists "public_select_nexora_orders" on nexora_orders;
drop policy if exists "public_insert_nexora_orders" on nexora_orders;
drop policy if exists "public_update_nexora_orders" on nexora_orders;
drop policy if exists "authenticated_select_nexora_orders" on nexora_orders;
drop policy if exists "authenticated_update_nexora_orders" on nexora_orders;
drop policy if exists "authenticated_delete_nexora_orders" on nexora_orders;

-- Customers submitting a card order usually have no login, so anon must be
-- able to insert. authenticated is included too: if the same browser is
-- signed into /admin, supabase-js sends every request (including from the
-- public Builder page) using that logged-in session instead of the anon
-- key, and without this the insert would be rejected for admins testing
-- the flow themselves. This is still the ONLY thing either role can do via
-- this policy: create new rows, nothing else.
create policy "public_insert_nexora_orders" on nexora_orders for insert to anon, authenticated with check (true);

-- Reading, updating, and deleting orders (the whole Admin dashboard)
-- requires a signed-in Supabase Auth user.
create policy "authenticated_select_nexora_orders" on nexora_orders for select to authenticated using (true);
create policy "authenticated_update_nexora_orders" on nexora_orders for update to authenticated using (true) with check (true);
create policy "authenticated_delete_nexora_orders" on nexora_orders for delete to authenticated using (true);

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

-- Postgres identifies a function by name + argument TYPE list, not by name
-- alone — so adding a parameter below changes the signature, and
-- `create or replace` would leave the old 10-arg version around as a
-- second overload instead of truly replacing it. Two overloads that could
-- both match a same-shaped call is exactly the kind of ambiguity that
-- caused repeated payment failures earlier (see the RLS comments above);
-- drop the old shape explicitly so there's only ever one submit_order.
drop function if exists submit_order(text, text, text, integer, numeric, numeric, text, text, text, jsonb);

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
  p_card jsonb,
  p_parent_order_code text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_code text;
  v_parent_id bigint;
begin
  -- Resolved server-side from the order_code the client already has (never
  -- a raw numeric id — the client never sees or handles those), and always
  -- re-pointed at the true root so a family stays exactly one level deep
  -- even if the caller passed a child's own order_code by mistake.
  if p_parent_order_code is not null then
    select coalesce(o.parent_order_id, o.id) into v_parent_id
    from nexora_orders o
    where o.order_code = p_parent_order_code;

    if v_parent_id is null then
      raise exception 'Unknown parent order code: %', p_parent_order_code;
    end if;

    if (select count(*) from nexora_orders where id = v_parent_id or parent_order_id = v_parent_id) >= 5 then
      raise exception 'This Card Holder already has the maximum of 5 cards.';
    end if;
  end if;

  -- Checked up front for a clean error message; the unique index above is
  -- still the real guarantee (catches the race between two submissions of
  -- the same reference landing at nearly the same time).
  if p_payment_ref <> '' and exists (select 1 from nexora_orders where payment_ref = p_payment_ref) then
    raise exception 'This payment reference number has already been submitted. Each reference can only be used once.';
  end if;

  begin
    insert into nexora_orders (
      customer, email, template, amount, amount_usd, exchange_rate,
      method, payment_ref, notes, status, card, parent_order_id
    )
    values (
      p_customer, p_email, p_template, p_amount, p_amount_usd, p_exchange_rate,
      p_method, p_payment_ref, p_notes, 'submitted', p_card, v_parent_id
    )
    returning order_code into v_order_code;
  exception when unique_violation then
    raise exception 'This payment reference number has already been submitted. Each reference can only be used once.';
  end;

  return v_order_code;
end;
$$;

grant execute on function submit_order(text, text, text, integer, numeric, numeric, text, text, text, jsonb, text)
  to anon, authenticated;

-- Powers the Card Holder's "Add New Cards" list: given any order_code that
-- belongs to a family (root or an add-on child), returns every card in
-- that family. SECURITY DEFINER avoids needing a general SELECT policy —
-- same trust model as get_public_card: knowing an order_code within the
-- family is the only credential this app has, root or child.
create or replace function get_business_cards(p_order_code text)
returns table (order_code text, card jsonb, status text, is_root boolean)
language sql
security definer
set search_path = public
as $$
  with target as (
    select coalesce(o.parent_order_id, o.id) as root_id
    from nexora_orders o
    where o.order_code = p_order_code
    limit 1
  )
  select o.order_code, o.card, o.status, (o.parent_order_id is null) as is_root
  from nexora_orders o, target t
  where o.id = t.root_id or o.parent_order_id = t.root_id
  order by o.id asc;
$$;

grant execute on function get_business_cards(text) to anon, authenticated;

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
