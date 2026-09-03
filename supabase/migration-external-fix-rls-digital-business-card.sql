-- NOT a Nexora table -- these belong to the separate "Digital Business
-- Card" app (Drizzle/Next.js, /Users/ren/Desktop/Projects/Digital Business
-- Card), which happens to share this same Supabase project as Nexora.
-- Kept here only because that's where the shared DB's project ref lives
-- and this repo already tracks migrations for it.
--
-- Fixes: RLS Disabled in Public + Sensitive Columns Exposed
-- (Supabase Security Advisor, 2026-09-03) for public.orders,
-- public.customer_history, public.card_drafts.
--
-- That app connects via a direct DATABASE_URL (server-side only -- no
-- Supabase JS client found in its codebase), so it never relied on the
-- anon/PostgREST path these policies close off.
--
-- Enabling RLS with zero policies denies all access to the `anon` and
-- `authenticated` roles (what the public anon API key resolves to)
-- while leaving `service_role` and direct Postgres connections (e.g. a
-- DATABASE_URL using the `postgres` role) untouched, since RLS does
-- not restrict those by default in Supabase/Postgres.
--
-- Run in the Supabase Dashboard: SQL Editor -> paste -> Run
-- (CLI link fails with a 403 for this project ref, same as Edge
-- Functions deploy -- see project memory).

alter table public.orders enable row level security;
alter table public.customer_history enable row level security;
alter table public.card_drafts enable row level security;
