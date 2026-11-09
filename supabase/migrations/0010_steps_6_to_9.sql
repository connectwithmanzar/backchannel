-- Migration 0010: warm-up ramp, approved templates with auto-send, interview prep and offers.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run more than once. Run it BEFORE deploying the matching code.

-- Step 7: when this user's sending began, so the daily cap ramps 5, 10, 15, 20.
alter table preferences add column if not exists email_ramp_start timestamptz;

-- Step 8: approved templates and auto-send. Auto-send is OFF unless the owner switches it on.
alter table preferences add column if not exists autosend_enabled boolean not null default false;
alter table preferences add column if not exists autosend_min_fit int not null default 75;

create table if not exists outreach_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null default 'Default',
  subject text not null,
  body text not null,
  approved_at timestamptz,            -- null until the owner approves this exact text
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table outreach_templates enable row level security;
drop policy if exists "own rows" on outreach_templates;
create policy "own rows" on outreach_templates for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Step 9: interview prep per role, and offer comparison.
create table if not exists interview_preps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  job_id uuid not null references jobs on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);
alter table interview_preps enable row level security;
drop policy if exists "own rows" on interview_preps;
create policy "own rows" on interview_preps for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  company text not null,
  role_title text,
  location text,
  currency text not null default 'USD',
  base numeric check (base is null or base >= 0),
  variable numeric check (variable is null or variable >= 0),
  joining_bonus numeric check (joining_bonus is null or joining_bonus >= 0),
  equity_note text,
  visa_note text,
  notes text,
  deadline date,
  status text not null default 'considering' check (status in ('considering', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table offers enable row level security;
drop policy if exists "own rows" on offers;
create policy "own rows" on offers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists offers_user_idx on offers (user_id, created_at desc);
