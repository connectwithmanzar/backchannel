-- Migration 0019: Copilots, saved job searches you can switch on and off.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to run more than once.

create table if not exists copilots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null default '',
  titles text[] not null default '{}',
  remote boolean not null default true,
  remote_regions text[] not null default '{}',
  onsite boolean not null default false,
  places text[] not null default '{}',
  seniority text[] not null default '{}',
  exclude_words text[] not null default '{}',
  is_on boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table copilots enable row level security;
drop policy if exists "own rows" on copilots;
create policy "own rows" on copilots for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists copilots_user_idx on copilots (user_id, created_at);
