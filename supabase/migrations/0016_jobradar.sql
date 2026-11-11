-- Migration 0016: JobRadar referral engine.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to run more than once.

-- Your LinkedIn connections, uploaded from LinkedIn's own data export (via JobRadar). Private to you.
create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  full_name text not null,
  company text,
  company_key text,            -- lower-case company name without punctuation, for matching
  position text,
  linkedin_url text,
  connected_on date,
  created_at timestamptz default now()
);
alter table connections enable row level security;
drop policy if exists "own rows" on connections;
create policy "own rows" on connections for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists connections_user_company_idx on connections (user_id, company_key);

-- Past employers and college, used for ex-colleague and alumni search links.
alter table profiles add column if not exists past_employers text[] default '{}';
alter table profiles add column if not exists college text;
