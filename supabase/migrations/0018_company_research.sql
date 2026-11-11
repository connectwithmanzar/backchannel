-- Migration 0018: company research (work mode, pay, perks, ratings) and tiers A to D.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to run more than once.
-- Needs migration 0017 first (it created the tier column).

-- Tiers now run A, B, C, D: from the review rating (A 3.5+, B 3.0 to 3.4, C 2.5 to 2.9, D below 2.5).
alter table watchlist drop constraint if exists watchlist_tier_check;
alter table watchlist add constraint watchlist_tier_check check (tier in ('A', 'B', 'C', 'D'));

-- What you know about a company. AI research fills a draft, you correct it, you save it. Private to you.
create table if not exists company_research (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  company_id uuid not null references companies on delete cascade,
  website text,
  hq text,
  work_mode text check (work_mode in ('remote', 'hybrid', 'office', 'mixed')),
  hiring_locations text,
  pay_note text,
  perks text[] not null default '{}',
  summary text,
  glassdoor_rating numeric(2, 1) check (glassdoor_rating between 0 and 5),
  ambitionbox_rating numeric(2, 1) check (ambitionbox_rating between 0 and 5),
  wlb_rating numeric(2, 1) check (wlb_rating between 0 and 5),
  growth_rating numeric(2, 1) check (growth_rating between 0 and 5),
  sources jsonb not null default '{}',
  researched_at timestamptz,
  updated_at timestamptz default now(),
  unique (user_id, company_id)
);
alter table company_research enable row level security;
drop policy if exists "own rows" on company_research;
create policy "own rows" on company_research for all using (user_id = auth.uid()) with check (user_id = auth.uid());
