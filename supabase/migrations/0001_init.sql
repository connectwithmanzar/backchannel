-- Backchannel: initial schema
-- Run in Supabase: SQL Editor → New query → paste this whole file → Run.
-- Single user now, multi-user ready: every personal table has user_id + row-level security.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------- Personal tables ----------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users on delete cascade,
  name text,
  current_role text,
  years_in_sales numeric,
  quota_attainment_pct int,
  meetings_per_month int,
  segment text check (segment in ('SMB','Mid-market','Enterprise')),
  motion text check (motion in ('Outbound','Inbound','Full-cycle')),
  tools text[] default '{}',
  target_titles text[] default '{}',
  markets text[] default '{}',
  min_ote_usd int default 0,
  stealth boolean default true,
  cv_file_path text,
  cv_text text,
  profile_embedding vector(1024),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users on delete cascade,
  great_company_criteria text[] default '{}',
  valued_awards text[] default '{}',
  countries text[] default '{}',
  dealbreakers text[] default '{}',
  created_at timestamptz default now()
);

create table blocklist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null check (type in ('domain','company','person')),
  value text not null,
  created_at timestamptz default now()
);

-- ---------- Shared reference tables ----------
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text,
  country text,
  hq text,
  size text,
  sector text,
  ats_type text check (ats_type in ('greenhouse','lever','ashby','smartrecruiters','workday','other')),
  ats_slug text,
  careers_url text,
  created_at timestamptz default now(),
  unique (ats_type, ats_slug)
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies on delete cascade,
  title text not null,
  location text,
  remote_type text check (remote_type in ('remote','hybrid','onsite','unknown')) default 'unknown',
  market text,
  source_type text not null check (source_type in ('careers','public','unposted','signal','network','recruiter')),
  board text,
  url text,
  posted_at timestamptz,
  last_checked_at timestamptz default now(),
  currency text,
  base_min numeric, base_max numeric,
  ote_min numeric, ote_max numeric,
  pay_band_status text check (pay_band_status in ('verified','estimated','unknown')) default 'unknown',
  visa_sponsorship text check (visa_sponsorship in ('yes','no','unknown')) default 'unknown',
  description text,
  dedupe_hash text not null unique,
  embedding vector(1024),
  is_active boolean default true,
  created_at timestamptz default now()
);
create index jobs_active_idx on jobs (is_active, last_checked_at desc);

create table signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies on delete cascade,
  type text check (type in ('funding','leader_hire','expansion','hiring_post','layoff')),
  title text, url text, published_at timestamptz, summary text,
  created_at timestamptz default now()
);

-- ---------- Personal tables tied to shared data ----------
create table company_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  company_id uuid not null references companies on delete cascade,
  why_great text,
  criteria_tags text[] default '{}',
  awards jsonb default '[]',      -- [{name, year, source_url}]
  visa_note text,
  sources jsonb default '[]',
  added_by text check (added_by in ('ai','user')) default 'ai',
  hidden boolean default false,
  created_at timestamptz default now(),
  unique (user_id, company_id)
);

create table watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  company_id uuid not null references companies on delete cascade,
  watching boolean default true,
  created_at timestamptz default now(),
  unique (user_id, company_id)
);

create table job_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  job_id uuid not null references jobs on delete cascade,
  score int check (score between 0 and 100),
  parts jsonb,
  explanation text,
  model text,
  scored_at timestamptz default now(),
  unique (user_id, job_id)
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  job_id uuid not null references jobs on delete cascade,
  status text check (status in ('needs_answer','awaiting_approval','scheduled','submitted','skipped')) default 'awaiting_approval',
  mode text check (mode in ('ask','queue24h','auto')) default 'ask',
  tailored_cv_path text,
  answers jsonb default '{}',
  pending_question text,
  receipt text,
  submitted_at timestamptz,
  created_at timestamptz default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  company_id uuid references companies on delete set null,
  name text, title text, email text, linkedin_url text, source text,
  opted_out boolean default false,
  created_at timestamptz default now()
);

create table sequences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  steps jsonb not null default '[]',  -- [{day, channel: 'email'|'linkedin_task', template}]
  created_at timestamptz default now()
);

create table outreach (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  contact_id uuid references contacts on delete cascade,
  sequence_id uuid references sequences on delete set null,
  step_index int default 0,
  channel text check (channel in ('email','linkedin_task')),
  status text check (status in ('scheduled','sent','opened','replied','stopped','task_open','task_done')) default 'scheduled',
  subject text, body text,
  scheduled_for timestamptz, sent_at timestamptz,
  gmail_message_id text,
  created_at timestamptz default now()
);

create table funnel_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text check (type in ('role_found','high_fit','applied','outreach_sent','reply','interview','offer')),
  ref_id uuid,
  occurred_at timestamptz default now()
);

-- ---------- Row-level security ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','preferences','blocklist','company_insights','watchlist','job_scores','applications','contacts','sequences','outreach','funnel_events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Shared tables: signed-in users can read; only the server (service role) writes.
alter table companies enable row level security;
alter table jobs enable row level security;
alter table signals enable row level security;
create policy "read companies" on companies for select to authenticated using (true);
create policy "read jobs" on jobs for select to authenticated using (true);
create policy "read signals" on signals for select to authenticated using (true);
