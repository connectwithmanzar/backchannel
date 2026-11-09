-- Migration 0009: cache and monthly usage count for the "find who to ask" people search.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run more than once. Run it BEFORE deploying the matching code.

create table if not exists contact_lookups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('search', 'reveal')),
  company_key text not null,          -- company domain for a search, Apollo person id for a reveal
  result jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create unique index if not exists contact_lookups_unique_idx on contact_lookups (user_id, kind, company_key);
create index if not exists contact_lookups_month_idx on contact_lookups (user_id, kind, created_at desc);

alter table contact_lookups enable row level security;
drop policy if exists "own rows" on contact_lookups;
create policy "own rows" on contact_lookups for all using (user_id = auth.uid()) with check (user_id = auth.uid());
