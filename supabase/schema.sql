-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).
-- Safe to re-run any number of times: drops and recreates policies so it
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
-- 'none' added for auto-provisioned lead chat accounts (see submit_lead),
-- which have no real payment method.
alter table nexora_orders drop constraint if exists nexora_orders_method_check;
alter table nexora_orders add constraint nexora_orders_method_check check (method in ('gcash', 'bank', 'wise', 'none'));

-- Links an add-on card (Business plan: "Add New Cards") back to the order
-- that owns the Card Holder it belongs to. Null on every normal, standalone
-- order and on the first ("root") card of a family. A family is always
-- exactly one level deep: a root order plus its direct children, nothing
-- ever points at a non-root row, so callers only ever need to resolve
-- coalesce(parent_order_id, id) to find the root.
alter table nexora_orders add column if not exists parent_order_id bigint references nexora_orders(id);

-- Business plan "Lead Generation": an order can require anyone who scans
-- the card to leave contact info before it unlocks. Off by default. Added
-- here (not further down near the RPCs that use it) because it has to
-- exist before get_public_card's body below can reference it.
alter table nexora_orders add column if not exists lead_gen_enabled boolean not null default false;

-- Free Trial: a marketing-only entry point (Landing.tsx's 4th plan card),
-- not a real paid tier. trial_expires_at is set once at signup
-- (submit_order) and never touched again by a cron/background job (this
-- app has none); every status check just compares it to now() at query
-- time. is_trial flips to false the moment the customer upgrades
-- (upgrade_trial_order), permanently, same as any other paid order from
-- then on. Both null/false for every normal (non-trial) order.
alter table nexora_orders add column if not exists is_trial boolean not null default false;
alter table nexora_orders add column if not exists trial_expires_at timestamptz;

-- Which plan this ROOT order actually paid for. Business-only Card Holder
-- features (Add New Cards, Lead Generation, QR Transfer) were previously
-- gated only on is_root, which is true for every standalone order
-- regardless of tier, meaning a Basic or Pro purchaser (or a free trial
-- signup) could already reach them for free. get_public_card/
-- get_business_cards now return this so the client can gate on
-- is_root AND plan_id = 'business' instead. Existing rows default to
-- 'business' (not 'basic') specifically to avoid retroactively hiding
-- these features from real Business customers already relying on
-- them; every NEW order from here on gets its real plan_id explicitly
-- from submit_order/upgrade_trial_order.
alter table nexora_orders add column if not exists plan_id text not null default 'business';

-- 'lead' added for auto-provisioned chat-only accounts (see submit_lead):
-- a check constraint can't be altered in place, so the old one has to be
-- dropped and recreated even on a fresh install (this is a no-op there,
-- since drop if exists finds nothing yet).
alter table nexora_orders drop constraint if exists nexora_orders_plan_id_check;
alter table nexora_orders add constraint nexora_orders_plan_id_check
  check (plan_id in ('trial', 'basic', 'pro', 'business', 'lead'));

-- A payment reference is proof of one specific real-world transaction, so
-- reusing one (whether by accident or to fraudulently claim a payment that
-- was never made for this order) must be impossible, not just discouraged
-- in the UI. Partial index so it never blocks on '', the column's default
-- before a real reference is submitted.
create unique index if not exists nexora_orders_payment_ref_unique
  on nexora_orders (payment_ref)
  where payment_ref <> '';

-- Supabase's own public self-signup (Auth -> Settings) has been on since
-- this project started, on the unstated assumption that "authenticated"
-- effectively meant "the one admin". It never did: any freshly signed-up
-- account is just as "authenticated" as the real admin, and every policy
-- below that checked `to authenticated using (true)` treated the two as
-- equivalent -- a public pentest confirmed this is exploitable as-is
-- (2026-08-31): sign up for free, read/edit/delete every order (PII,
-- payment refs) or approve your own order for free. is_admin() is the
-- real check that was always missing; every "authenticated-only" policy
-- and function below now goes through it instead of a bare role check.
-- Disabling public signup in the dashboard closes new attackers out
-- immediately, but doesn't fix the policies themselves, so this is still
-- required regardless of that setting.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'email') = 'ren.ensombl@gmail.com', false);
$$;

alter table nexora_orders enable row level security;

drop policy if exists "public_select_nexora_orders" on nexora_orders;
drop policy if exists "public_insert_nexora_orders" on nexora_orders;
drop policy if exists "public_update_nexora_orders" on nexora_orders;
drop policy if exists "authenticated_select_nexora_orders" on nexora_orders;
drop policy if exists "authenticated_update_nexora_orders" on nexora_orders;
drop policy if exists "authenticated_delete_nexora_orders" on nexora_orders;
drop policy if exists "admin_select_nexora_orders" on nexora_orders;
drop policy if exists "admin_update_nexora_orders" on nexora_orders;
drop policy if exists "admin_delete_nexora_orders" on nexora_orders;

-- Customers submitting a card order usually have no login, so anon must be
-- able to insert. authenticated is included too: if the same browser is
-- signed into /admin, supabase-js sends every request (including from the
-- public Builder page) using that logged-in session instead of the anon
-- key, and without this the insert would be rejected for admins testing
-- the flow themselves. This is still the ONLY thing either role can do via
-- this policy: create new rows, nothing else -- and it's deliberately NOT
-- gated by is_admin(), since real customers submitting real orders are
-- never admins.
create policy "public_insert_nexora_orders" on nexora_orders for insert to anon, authenticated with check (true);

-- Reading, updating, and deleting orders (the whole Admin dashboard) is
-- restricted to the real admin, not just "any signed-in user" (see
-- is_admin() above for why that distinction is the whole fix here).
create policy "admin_select_nexora_orders" on nexora_orders for select to authenticated using (is_admin());
create policy "admin_update_nexora_orders" on nexora_orders for update to authenticated using (is_admin()) with check (is_admin());
create policy "admin_delete_nexora_orders" on nexora_orders for delete to authenticated using (is_admin());

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
-- reference AND the email the customer themselves provided at submission;
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
-- alone, so adding a parameter below changes the signature, and
-- `create or replace` would leave the old 10-arg version around as a
-- second overload instead of truly replacing it. Two overloads that could
-- both match a same-shaped call is exactly the kind of ambiguity that
-- caused repeated payment failures earlier (see the RLS comments above);
-- drop the old shape explicitly so there's only ever one submit_order.
drop function if exists submit_order(text, text, text, integer, numeric, numeric, text, text, text, jsonb);
drop function if exists submit_order(text, text, text, integer, numeric, numeric, text, text, text, jsonb, text);
drop function if exists submit_order(text, text, text, integer, numeric, numeric, text, text, text, jsonb, text, boolean);

-- Creates an order via a SECURITY DEFINER function instead of a raw table
-- insert. This bypasses RLS internally (the function runs as its owner,
-- not the caller), so order creation no longer depends on the anon/
-- authenticated INSERT policy or on Postgres/PostgREST return-preference
-- defaults at all: the exact combination that caused repeated RLS
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
  p_parent_order_code text default null,
  p_is_trial boolean default false,
  p_plan_id text default 'business'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_code text;
  v_parent_id bigint;
  v_family_count int;
  v_initial_status text := 'submitted';
  v_trial_expires_at timestamptz := null;
  v_plan_id text := p_plan_id;
  v_root_plan_id text;
begin
  if p_plan_id not in ('trial', 'basic', 'pro', 'business') then
    raise exception 'Invalid plan_id: %', p_plan_id;
  end if;
  -- Free Trial is a standalone-only entry point: never an add-on. Guards
  -- against a direct RPC call attaching a trial expiry to what should be
  -- one of the Business plan's free/paid family slots (see below).
  if p_is_trial and p_parent_order_code is not null then
    raise exception 'A free trial card cannot be an add-on.';
  end if;

  -- Resolved server-side from the order_code the client already has (never
  -- a raw numeric id: the client never sees or handles those), and always
  -- re-pointed at the true root so a family stays exactly one level deep
  -- even if the caller passed a child's own order_code by mistake.
  if p_parent_order_code is not null then
    select coalesce(o.parent_order_id, o.id) into v_parent_id
    from nexora_orders o
    where o.order_code = p_parent_order_code;

    if v_parent_id is null then
      raise exception 'Unknown parent order code: %', p_parent_order_code;
    end if;

    -- "Add New Cards" is Business-exclusive, not something a Basic/Pro
    -- (or trial) root can unlock even by paying the add-on price: this is
    -- a real server-side check, not just a hidden UI button, since the
    -- RPC itself is the only enforcement boundary this app has (no RLS
    -- policies restrict it). Also pins plan_id to the root's actual plan
    -- for the new row, ignoring whatever p_plan_id the caller passed:
    -- what plan a family is on is a fact about the root, not something
    -- each add-on's own insert gets to assert independently.
    select plan_id into v_root_plan_id from nexora_orders where id = v_parent_id;
    if v_root_plan_id <> 'business' then
      raise exception 'Add New Cards is a Business plan feature.';
    end if;
    v_plan_id := v_root_plan_id;

    select count(*) into v_family_count
    from nexora_orders where id = v_parent_id or parent_order_id = v_parent_id;

    -- The Business plan includes the root card plus 5 free team members
    -- (6 total). This new card's position is v_family_count + 1, computed
    -- server-side from the real row count, not trusted from the client, so
    -- it's the only thing that decides whether payment is actually
    -- required. Position 7+ still goes through the normal paid/admin-
    -- review flow below, same as the root order always does.
    if v_family_count + 1 <= 6 then
      v_initial_status := 'approved';
    end if;
  end if;

  -- No payment to verify for a trial signup, so it goes straight to
  -- approved too, same reasoning as a free family slot above. The 15-day
  -- clock starts now and is never touched again by a background job (this
  -- app has none); get_public_card/get_business_cards just compare it to
  -- now() at query time on every read.
  if p_is_trial then
    v_initial_status := 'approved';
    v_trial_expires_at := now() + interval '15 days';
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
      method, payment_ref, notes, status, card, parent_order_id,
      is_trial, trial_expires_at, plan_id
    )
    values (
      p_customer, p_email, p_template, p_amount, p_amount_usd, p_exchange_rate,
      p_method, p_payment_ref, p_notes, v_initial_status, p_card, v_parent_id,
      p_is_trial, v_trial_expires_at, v_plan_id
    )
    returning order_code into v_order_code;
  exception when unique_violation then
    raise exception 'This payment reference number has already been submitted. Each reference can only be used once.';
  end;

  return v_order_code;
end;
$$;

grant execute on function submit_order(text, text, text, integer, numeric, numeric, text, text, text, jsonb, text, boolean, text)
  to anon, authenticated;

-- Converts a Free Trial order into a real paid one, in place: same
-- order_code, so any QR/link the customer already handed out keeps
-- working. Only ever touches a row that is_trial = true, both so this
-- can't be used to silently rewrite a normal order's payment info, and so
-- calling it twice on an already-upgraded order is a no-op (0 rows
-- updated) rather than a second, conflicting "payment".
create or replace function upgrade_trial_order(
  p_order_code text,
  p_template text,
  p_amount integer,
  p_amount_usd numeric,
  p_exchange_rate numeric,
  p_method text,
  p_payment_ref text,
  p_notes text,
  p_card jsonb,
  p_plan_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_plan_id not in ('basic', 'pro', 'business') then
    raise exception 'Invalid plan_id: %', p_plan_id;
  end if;

  if p_payment_ref <> '' and exists (select 1 from nexora_orders where payment_ref = p_payment_ref) then
    raise exception 'This payment reference number has already been submitted. Each reference can only be used once.';
  end if;

  begin
    update nexora_orders set
      template = p_template,
      amount = p_amount,
      amount_usd = p_amount_usd,
      exchange_rate = p_exchange_rate,
      method = p_method,
      payment_ref = p_payment_ref,
      notes = p_notes,
      card = p_card,
      status = 'submitted',
      is_trial = false,
      trial_expires_at = null,
      plan_id = p_plan_id
    where order_code = p_order_code and is_trial = true;
    get diagnostics v_count = row_count;
  exception when unique_violation then
    raise exception 'This payment reference number has already been submitted. Each reference can only be used once.';
  end;

  if v_count = 0 then
    raise exception 'This trial card no longer exists or has already been upgraded.';
  end if;
end;
$$;

grant execute on function upgrade_trial_order(text, text, integer, numeric, numeric, text, text, text, jsonb, text)
  to anon, authenticated;

-- Powers the Card Holder's "Add New Cards" list: given any order_code that
-- belongs to a family (root or an add-on child), returns every card in
-- that family. SECURITY DEFINER avoids needing a general SELECT policy:
-- same trust model as get_public_card: knowing an order_code within the
-- family is the only credential this app has, root or child.
-- Return type changed (added is_trial/trial_expires_at below); drop the
-- old shape first since create or replace can't change a return type.
drop function if exists get_business_cards(text);

create or replace function get_business_cards(p_order_code text)
returns table (
  order_code text, card jsonb, status text, is_root boolean,
  is_trial boolean, trial_expires_at timestamptz, plan_id text
)
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
  -- plan_id always comes from the root row, not each card's own column:
  -- what plan this family is on is a family-wide fact, not something an
  -- add-on card's own row is the source of truth for.
  select o.order_code, o.card, o.status, (o.parent_order_id is null) as is_root,
    o.is_trial, o.trial_expires_at, root.plan_id
  from nexora_orders o, target t
  join nexora_orders root on root.id = t.root_id
  where o.id = t.root_id or o.parent_order_id = t.root_id
  order by o.id asc;
$$;

grant execute on function get_business_cards(text) to anon, authenticated;

-- Serves the public "scan to view this card" page (/c/:orderCode). Card
-- fields are meant to be shared once a card exists (that's the point of a
-- business card), so this doesn't gate on payment status; the public page
-- itself shows a "not active yet" state for anything other than approved/
-- provisioned. SECURITY DEFINER again avoids needing any general SELECT
-- policy on the table.
--
-- create or replace cannot change an existing function's return type with
-- the same argument list (unlike adding an argument, which at least makes
-- a new overload; this errors outright), so the old shape has to be
-- dropped explicitly before recreating it with the added column.
--
-- is_root lets the client gate Business-only features (Add New Cards,
-- Lead Generation, QR Transfer) to only the original Business plan
-- purchaser: an add-on team member's card is never root, so it only
-- ever gets Pro-tier UI, no matter what its own lead_gen_enabled/family
-- data might otherwise suggest. Delivered here rather than requiring a
-- second get_business_cards round-trip, so there's no gap where the
-- owner-only controls could flash visible before this resolves.
drop function if exists get_public_card(text);

create or replace function get_public_card(p_order_code text)
returns table (
  card jsonb, status text, lead_gen_enabled boolean, is_root boolean,
  is_trial boolean, trial_expires_at timestamptz, plan_id text
)
language sql
security definer
set search_path = public
as $$
  -- plan_id always comes from the root row (see get_business_cards for
  -- why), so this is correct even when p_order_code is a team member's
  -- own add-on card, not just when it's the root.
  select o.card, o.status, o.lead_gen_enabled, (o.parent_order_id is null) as is_root,
    o.is_trial, o.trial_expires_at, root.plan_id
  from nexora_orders o
  join nexora_orders root on root.id = coalesce(o.parent_order_id, o.id)
  where o.order_code = p_order_code
  limit 1;
$$;

grant execute on function get_public_card(text) to anon, authenticated;

-- There's no login for card owners (order_code is this whole app's only
-- credential; see get_public_card/get_business_cards above), so toggling
-- this is trusted the same way: knowing the order_code is exactly as much
-- proof of ownership as every other owner-only action already relies on.
create or replace function set_lead_gen(p_order_code text, p_enabled boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update nexora_orders set lead_gen_enabled = p_enabled where order_code = p_order_code;
$$;

grant execute on function set_lead_gen(text, boolean) to anon, authenticated;

create table if not exists nexora_leads (
  id bigint generated always as identity primary key,
  order_id bigint not null references nexora_orders(id) on delete cascade,
  contact text not null,
  name text not null default '',
  captured_at timestamptz not null default now()
);

-- RLS with no policies at all: every access goes through the two
-- SECURITY DEFINER functions below, so there's deliberately no direct-table
-- path for anon/authenticated at all, not even insert. A lead's contact
-- info is exactly the kind of data that must never be broadly readable.
alter table nexora_leads enable row level security;

-- Same name-required and email-or-phone checks as the client (LeadGate
-- in Holder.tsx), kept server-side too since this RPC is callable
-- directly (anon key is public); the client checks alone are only a UX
-- nicety, not enforcement.
--
-- Also auto-provisions a lightweight, chat-only account for the lead
-- (plan_id = 'lead') and connects it to the card owner's family root,
-- exactly as if they'd mutually scanned cards -- this is what lets the
-- owner instant-message a lead right after capture, even though the
-- lead never gets a real NexxaDBC card of their own. Returns the lead's
-- new order_code so the client can drop them straight into that chat
-- thread (see Holder.tsx's LeadGate). Return type changed from void to
-- text, so the old signature has to be dropped first.
drop function if exists submit_lead(text, text, text);

create or replace function submit_lead(p_order_code text, p_contact text, p_name text default '')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_root_id bigint;
  v_name text := trim(p_name);
  v_contact text := trim(p_contact);
  v_digits text;
  v_is_email boolean;
  v_lead_id bigint;
  v_lead_order_code text;
begin
  select id, coalesce(parent_order_id, id) into v_order_id, v_root_id
  from nexora_orders where order_code = p_order_code;
  if v_order_id is null then
    raise exception 'Unknown order code: %', p_order_code;
  end if;

  if v_name = '' then
    raise exception 'Name is required.';
  end if;

  v_digits := regexp_replace(v_contact, '[\s()+-]', '', 'g');
  v_is_email := v_contact ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$';
  if not v_is_email and v_digits !~ '^\d{7,15}$' then
    raise exception 'Enter a valid email address or phone number.';
  end if;

  insert into nexora_leads (order_id, contact, name) values (v_order_id, v_contact, v_name);

  insert into nexora_orders (
    customer, email, template, amount, amount_usd, exchange_rate,
    method, payment_ref, notes, status, card, plan_id
  )
  values (
    v_name, case when v_is_email then v_contact else '' end, 'corporate', 0, 0, 0,
    'none', '', '', 'approved', '{}'::jsonb, 'lead'
  )
  returning id, order_code into v_lead_id, v_lead_order_code;

  insert into nexora_connections (order_id_a, order_id_b)
  values (least(v_root_id, v_lead_id), greatest(v_root_id, v_lead_id))
  on conflict (order_id_a, order_id_b) do nothing;

  return v_lead_order_code;
end;
$$;

grant execute on function submit_lead(text, text, text) to anon, authenticated;

-- Powers the owner's "captured leads" list/CSV download on their own Card
-- Holder. Same order_code-as-credential trust model as everything else;
-- also resolves the family root first so a lead captured on any add-on
-- card in the family shows up for the owner regardless of which card's
-- order_code they're viewing from.
create or replace function get_leads(p_order_code text)
returns table (id bigint, contact text, name text, captured_at timestamptz)
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
  select l.id, l.contact, l.name, l.captured_at
  from nexora_leads l
  join nexora_orders o on o.id = l.order_id
  join target t on o.id = t.root_id or o.parent_order_id = t.root_id
  order by l.captured_at desc;
$$;

grant execute on function get_leads(text) to anon, authenticated;

-- Business plan "QR Transfer": moving a Card Holder's device-local data
-- (collected cards, plus which orders this device recognizes itself as
-- the owner of; see deviceOwnership.ts) to a new phone. The owned family
-- cards themselves already live server-side and need no transfer; this is
-- only for what's local-storage-only today.
--
-- A short-lived, one-time bearer token, not tied to any order_code or
-- account: the old phone POSTs its local data and gets a token back, the
-- QR encodes a link with that token, the new phone visits it once. No RLS
-- policies at all: claim_transfer's delete-and-return makes the read the
-- same atomic operation as the one-time invalidation, so there's no
-- window where a direct table read could get at a transfer's payload.
create table if not exists nexora_transfers (
  id bigint generated always as identity primary key,
  token text not null unique default gen_random_uuid()::text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table nexora_transfers enable row level security;

create or replace function create_transfer(p_payload jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  -- 200KB was too tight for real usage: a handful of collected cards with
  -- uploaded PNG logos (stored as base64 data URLs) easily exceeds it.
  -- 2MB is still trivial for a jsonb row that lives at most 15 minutes.
  if pg_column_size(p_payload) > 2000000 then
    raise exception 'Transfer payload is too large.';
  end if;

  -- Opportunistic cleanup instead of a separate scheduled job: this app
  -- has no cron infra, and every create/claim call is a natural place to
  -- sweep out anything that was started but never picked up.
  delete from nexora_transfers where created_at < now() - interval '15 minutes';

  insert into nexora_transfers (payload) values (p_payload) returning token into v_token;
  return v_token;
end;
$$;

grant execute on function create_transfer(jsonb) to anon, authenticated;

-- delete ... returning is the whole mechanism here: it makes "read the
-- payload" and "invalidate the token" a single atomic step, so the token
-- is truly one-time-use even under a race between two claim attempts.
create or replace function claim_transfer(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  delete from nexora_transfers where created_at < now() - interval '15 minutes';

  delete from nexora_transfers
  where token = p_token
  returning payload into v_payload;

  return v_payload;
end;
$$;

grant execute on function claim_transfer(text) to anon, authenticated;

-- Landing page "Stay Connected" newsletter form. Independent of
-- nexora_leads (which is scoped to one card's family via order_id):
-- these are site-wide inquiries for NexxaDBC itself, not tied to any one
-- customer's card, so they get their own table rather than a fake/shared
-- order_id.
create table if not exists nexora_subscribers (
  id bigint generated always as identity primary key,
  email text not null unique,
  subscribed_at timestamptz not null default now()
);

-- RLS with no policies, same as nexora_leads: all access goes through the
-- functions below, not the table directly.
alter table nexora_subscribers enable row level security;

-- on conflict do nothing: resubmitting the same email (e.g. double-
-- clicking Subscribe) is a silent no-op, not an error the visitor sees.
create or replace function subscribe_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into nexora_subscribers (email) values (p_email)
  on conflict (email) do nothing;
end;
$$;

grant execute on function subscribe_email(text) to anon, authenticated;

-- Read access mirrors the Admin dashboard's own orders policy: the real
-- admin only (is_admin(), not just "signed in" -- being SECURITY DEFINER,
-- this bypasses RLS entirely, so the GRANT below was the only thing
-- standing between any freshly self-signed-up account and the full
-- subscriber email list, and a grant alone doesn't check who's calling).
create or replace function get_subscribers()
returns table (email text, subscribed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Admin access required.';
  end if;
  return query select s.email, s.subscribed_at from nexora_subscribers s order by s.subscribed_at desc;
end;
$$;

-- Postgres grants EXECUTE on every newly created function to PUBLIC (which
-- anon inherits) by default; granting to authenticated alone does NOT
-- revoke that. Without this explicit revoke, the subscriber list (email
-- addresses) would be readable by anyone, defeating the whole point of
-- restricting this one function to signed-in admins.
revoke execute on function get_subscribers() from public;
grant execute on function get_subscribers() to authenticated;

-- Chat (Pro/Business plans): lets two cardholders who've exchanged cards
-- message each other directly inside the app, real-time. Connections and
-- messages are keyed by ROOT order id (coalesce(parent_order_id, id)),
-- same as every other family-aware feature: chat is between people, i.e.
-- family roots, not between individual add-on cards.
--
-- order_id_a is always the smaller id (enforced below) so a connection
-- between two roots has exactly one canonical row no matter which side
-- scanned first.
-- on delete cascade on every FK here: Admin's Delete Order otherwise
-- fails outright (a Postgres foreign key violation, not a soft/silent
-- failure) for any order that ever exchanged a connection or message,
-- which in practice is any order used to test chat at all.
create table if not exists nexora_connections (
  id bigint generated always as identity primary key,
  order_id_a bigint not null references nexora_orders(id) on delete cascade,
  order_id_b bigint not null references nexora_orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint nexora_connections_ordered check (order_id_a < order_id_b),
  constraint nexora_connections_unique unique (order_id_a, order_id_b)
);

alter table nexora_connections enable row level security;

create table if not exists nexora_messages (
  id bigint generated always as identity primary key,
  from_order_id bigint not null references nexora_orders(id) on delete cascade,
  to_order_id bigint not null references nexora_orders(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- RLS enabled with no policies, same trust model as everywhere else in
-- this app (order_code-as-credential, no login): all access goes through
-- the SECURITY DEFINER functions below, never a direct table read/write.
alter table nexora_messages enable row level security;

create index if not exists nexora_messages_to_order_id_idx on nexora_messages (to_order_id, created_at desc);
create index if not exists nexora_messages_from_order_id_idx on nexora_messages (from_order_id, created_at desc);

-- Called after a successful in-app scan (see Holder.tsx's handleScan),
-- only when the scanning device itself has its own card open: recording a
-- connection is what makes chat's "anyone who's received your DBC can
-- message you" rule mean something, rather than any two order_codes being
-- able to message each other with no prior relationship. Silent no-op if
-- the two are already connected, or if someone scans their own card.
create or replace function record_connection(p_order_code text, p_scanned_order_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root_a bigint;
  v_root_b bigint;
begin
  select coalesce(o.parent_order_id, o.id) into v_root_a from nexora_orders o where o.order_code = p_order_code;
  select coalesce(o.parent_order_id, o.id) into v_root_b from nexora_orders o where o.order_code = p_scanned_order_code;

  if v_root_a is null or v_root_b is null or v_root_a = v_root_b then
    return;
  end if;

  insert into nexora_connections (order_id_a, order_id_b)
  values (least(v_root_a, v_root_b), greatest(v_root_a, v_root_b))
  on conflict (order_id_a, order_id_b) do nothing;
end;
$$;

grant execute on function record_connection(text, text) to anon, authenticated;

-- Sends a message from one cardholder to another. Requires: both roots are
-- on a plan that includes chat (Pro or Business; a free trial or Basic
-- card can't send or receive), and a connection already exists between
-- them (see record_connection) so this can't be used to cold-message a
-- stranger's order_code. Real-time delivery itself happens client-side via
-- a Realtime Broadcast on a channel named after the recipient's order_code
-- (see lib/supabase.ts sendMessage), not through this function; this just
-- persists the message so it's there on the recipient's next fetch
-- regardless of whether they were online to receive the broadcast.
create or replace function send_chat_message(p_from_order_code text, p_to_order_code text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root_from bigint;
  v_root_to bigint;
  v_plan_from text;
  v_plan_to text;
  v_connected boolean;
begin
  if length(trim(p_body)) = 0 then
    raise exception 'Message cannot be empty.';
  end if;

  select coalesce(o.parent_order_id, o.id) into v_root_from from nexora_orders o where o.order_code = p_from_order_code;
  select coalesce(o.parent_order_id, o.id) into v_root_to from nexora_orders o where o.order_code = p_to_order_code;

  if v_root_from is null or v_root_to is null then
    raise exception 'Unknown order code.';
  end if;

  if v_root_from = v_root_to then
    raise exception 'You cannot message yourself.';
  end if;

  select plan_id into v_plan_from from nexora_orders where id = v_root_from;
  select plan_id into v_plan_to from nexora_orders where id = v_root_to;

  -- 'lead' included: an auto-provisioned lead chat account (see
  -- submit_lead) always has exactly one connection, to the specific
  -- owner who captured it, so it's never a way to reach chat without
  -- ever having been Pro/Business -- only the real owner side of that
  -- one connection needs to be.
  if v_plan_from not in ('pro', 'business', 'lead') or v_plan_to not in ('pro', 'business', 'lead') then
    raise exception 'Chat is available on the Pro and Business plans.';
  end if;

  select exists (
    select 1 from nexora_connections
    where order_id_a = least(v_root_from, v_root_to) and order_id_b = greatest(v_root_from, v_root_to)
  ) into v_connected;

  if not v_connected then
    raise exception 'You need to exchange cards before you can message someone.';
  end if;

  insert into nexora_messages (from_order_id, to_order_id, body) values (v_root_from, v_root_to, trim(p_body));
end;
$$;

grant execute on function send_chat_message(text, text, text) to anon, authenticated;

-- Powers the Messages inbox: one row per connection, with the other
-- party's current card (so name/company/logo always reflect their latest
-- edits, not a stale snapshot), the last message, and how many are unread
-- from their side.
create or replace function get_conversations(p_order_code text)
returns table (
  with_order_code text,
  with_card jsonb,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path = public
as $$
  with me as (
    select coalesce(o.parent_order_id, o.id) as root_id
    from nexora_orders o
    where o.order_code = p_order_code
  ),
  connected as (
    select
      case when order_id_a = me.root_id then order_id_b else order_id_a end as other_root_id,
      created_at as connected_at
    from nexora_connections, me
    where me.root_id in (order_id_a, order_id_b)
  )
  select
    other.order_code,
    other.card,
    lm.body,
    lm.created_at,
    coalesce((
      select count(*) from nexora_messages m
      where m.from_order_id = other.id and m.to_order_id = me.root_id and m.read_at is null
    ), 0)
  from connected
  join nexora_orders other on other.id = connected.other_root_id
  cross join me
  left join lateral (
    select body, created_at from nexora_messages m
    where (m.from_order_id = connected.other_root_id and m.to_order_id = me.root_id)
       or (m.from_order_id = me.root_id and m.to_order_id = connected.other_root_id)
    order by m.created_at desc
    limit 1
  ) lm on true
  -- Falls back to when the connection itself was made, so a
  -- just-exchanged-cards thread with no messages yet still shows up
  -- (sorted by recency of connection) instead of being pushed to the
  -- bottom or excluded by the ordering.
  order by coalesce(lm.created_at, connected.connected_at) desc;
$$;

grant execute on function get_conversations(text) to anon, authenticated;

-- Full message history between two cardholders, oldest first.
create or replace function get_chat_messages(p_order_code text, p_with_order_code text)
returns table (from_order_code text, body text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  with me as (
    select coalesce(o.parent_order_id, o.id) as root_id
    from nexora_orders o
    where o.order_code = p_order_code
  ),
  them as (
    select coalesce(o.parent_order_id, o.id) as root_id
    from nexora_orders o
    where o.order_code = p_with_order_code
  )
  select sender.order_code, m.body, m.created_at
  from nexora_messages m
  join nexora_orders sender on sender.id = m.from_order_id
  cross join me
  cross join them
  where (m.from_order_id = me.root_id and m.to_order_id = them.root_id)
     or (m.from_order_id = them.root_id and m.to_order_id = me.root_id)
  order by m.created_at asc;
$$;

grant execute on function get_chat_messages(text, text) to anon, authenticated;

-- Marks every message from the other party as read, called when the
-- owner opens that thread. Powers the unread badge going back to 0 for
-- that conversation.
create or replace function mark_chat_read(p_order_code text, p_with_order_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root_me bigint;
  v_root_them bigint;
begin
  select coalesce(o.parent_order_id, o.id) into v_root_me from nexora_orders o where o.order_code = p_order_code;
  select coalesce(o.parent_order_id, o.id) into v_root_them from nexora_orders o where o.order_code = p_with_order_code;

  update nexora_messages
  set read_at = now()
  where from_order_id = v_root_them and to_order_id = v_root_me and read_at is null;
end;
$$;

grant execute on function mark_chat_read(text, text) to anon, authenticated;

-- Web Push subscriptions: one row per browser/device that has granted
-- notification permission and subscribed. This is what lets a chat
-- message notify a device even when NexxaDBC isn't open at all: the
-- Realtime broadcast and the in-page Notification/chime (see Holder.tsx)
-- both require the tab to still be alive in memory, so a fully closed
-- app or a locked phone with the browser swapped out of memory has no
-- other way to be reached. Keyed by root order id like everything else
-- chat-related, since only the root card owner's own device(s) ever
-- chat. The actual send happens from the send-push Edge Function using
-- these rows (with the service role key, bypassing RLS same as every
-- other table here), not from any client-callable function.
create table if not exists nexora_push_subscriptions (
  id bigint generated always as identity primary key,
  order_id bigint not null references nexora_orders (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table nexora_push_subscriptions enable row level security;

create index if not exists nexora_push_subscriptions_order_id_idx on nexora_push_subscriptions (order_id);

-- Upserts by endpoint: a device re-subscribing (permission re-granted,
-- local subscription lost, browser storage cleared) updates the same
-- row rather than accumulating duplicates, and gets re-pointed at
-- whichever order_code it's subscribing under now.
create or replace function save_push_subscription(
  p_order_code text,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root bigint;
begin
  select coalesce(o.parent_order_id, o.id) into v_root from nexora_orders o where o.order_code = p_order_code;
  if v_root is null then
    raise exception 'Unknown order code.';
  end if;

  insert into nexora_push_subscriptions (order_id, endpoint, p256dh, auth)
  values (v_root, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set
    order_id = excluded.order_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth;
end;
$$;

grant execute on function save_push_subscription(text, text, text, text) to anon, authenticated;
