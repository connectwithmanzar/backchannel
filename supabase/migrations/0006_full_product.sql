-- Migration 0006: everything the full product needs.
-- Run once in Supabase: SQL Editor → New query → paste this whole file → Run.
-- Safe to run more than once.

-- ── Job sources ─────────────────────────────────────────────────────────────
alter table companies add column if not exists enabled boolean not null default true;
alter table companies add column if not exists collect_error text;
alter table companies add column if not exists last_collected_at timestamptz;
alter table companies add column if not exists open_sales_roles int;

create table if not exists collect_runs (
  id uuid primary key default gen_random_uuid(),
  summary jsonb,
  results jsonb,
  created_at timestamptz default now()
);
alter table collect_runs enable row level security;
drop policy if exists "read collect runs" on collect_runs;
create policy "read collect runs" on collect_runs for select to authenticated using (true);

-- ── Settings for Autopilot and Outreach ─────────────────────────────────────
alter table preferences add column if not exists autopilot_mode text default 'ask' check (autopilot_mode in ('ask','queue24h','auto'));
alter table preferences add column if not exists autopilot_min_fit int default 75;
alter table preferences add column if not exists autopilot_daily_cap int default 5;
alter table preferences add column if not exists email_daily_limit int default 20;
alter table preferences add column if not exists email_signature text;

-- ── Applications (Autopilot) ────────────────────────────────────────────────
alter table applications add column if not exists tailored_cv text;
alter table applications add column if not exists cover_note text;
alter table applications add column if not exists cv_changes jsonb default '[]';
alter table applications add column if not exists questions jsonb default '[]';
alter table applications add column if not exists notes text;
alter table applications add column if not exists stage text default 'applied'
  check (stage in ('applied','screening','interview','final','offer','rejected','withdrawn'));
alter table applications add column if not exists updated_at timestamptz default now();
alter table applications drop constraint if exists applications_status_check;
alter table applications add constraint applications_status_check
  check (status in ('preparing','needs_answer','awaiting_approval','scheduled','submitted','skipped'));
create unique index if not exists applications_user_job_idx on applications (user_id, job_id);

-- ── Contacts and outreach ───────────────────────────────────────────────────
alter table contacts add column if not exists company_name text;
alter table contacts add column if not exists job_id uuid references jobs on delete set null;
alter table contacts add column if not exists notes text;
alter table outreach add column if not exists to_email text;
alter table outreach add column if not exists gmail_thread_id text;
alter table outreach add column if not exists error text;
alter table outreach drop constraint if exists outreach_status_check;
alter table outreach add constraint outreach_status_check
  check (status in ('draft','scheduled','sent','opened','replied','stopped','failed','task_open','task_done'));

-- Gmail connection (refresh token). Only the server (service role) can read or write it.
create table if not exists gmail_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  refresh_token text not null,
  connected_at timestamptz default now()
);
alter table gmail_accounts enable row level security;
-- No policies on purpose: browsers can never read the token.

-- ── Referrals ───────────────────────────────────────────────────────────────
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  job_id uuid references jobs on delete set null,
  company_name text not null,
  role_title text,
  referrer_name text not null,
  referrer_relation text,
  channel text default 'linkedin' check (channel in ('linkedin','email','whatsapp','other')),
  message text,
  stage text default 'to_ask' check (stage in ('to_ask','asked','agreed','referred','interview','declined')),
  follow_up_on date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table referrals enable row level security;
drop policy if exists "own rows" on referrals;
create policy "own rows" on referrals for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Funnel events: allow 'referral' too ─────────────────────────────────────
alter table funnel_events drop constraint if exists funnel_events_type_check;
alter table funnel_events add constraint funnel_events_type_check
  check (type in ('role_found','high_fit','applied','outreach_sent','reply','referral','interview','offer'));

create index if not exists outreach_user_status_idx on outreach (user_id, status, scheduled_for);
create index if not exists referrals_user_idx on referrals (user_id, stage);

-- Saved answers to sensitive application questions (visa, salary, notice period…), reused by Autopilot.
alter table preferences add column if not exists standard_answers jsonb default '{}';
