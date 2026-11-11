-- Migration 0017: company tiers, story bank, CV versions and your career-gap line.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to run more than once.

-- Tier A / B for the companies you watch (your target list). Blank = watching only.
alter table watchlist add column if not exists tier text check (tier in ('A', 'B'));

-- One honest sentence about a career gap, reused in CVs and interviews.
alter table profiles add column if not exists gap_line text;

-- Interview stories: situation, action, result. Private to you.
create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  situation text not null default '',
  action text not null default '',
  result text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table stories enable row level security;
drop policy if exists "own rows" on stories;
create policy "own rows" on stories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists stories_user_idx on stories (user_id, created_at);

-- One CV text per role family (for example GTM, Associate AE, SDR), built from your master CV. Private to you.
create table if not exists cv_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  family text not null,
  cv_text text not null default '',
  updated_at timestamptz default now(),
  unique (user_id, family)
);
alter table cv_versions enable row level security;
drop policy if exists "own rows" on cv_versions;
create policy "own rows" on cv_versions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
