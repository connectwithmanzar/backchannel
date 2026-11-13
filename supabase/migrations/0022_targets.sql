-- Migration 0022: the Target list, roles you want to go after with a plan (referral, email, LinkedIn, then apply).
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to run more than once.

create table if not exists targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  job_id uuid references jobs on delete set null,
  company text not null default '',
  title text not null default '',
  url text not null default '',
  source text not null default 'job' check (source in ('swipe', 'job', 'company', 'link')),
  strategy text not null default 'referral_first' check (strategy in ('referral_first', 'outreach_first', 'apply_now')),
  steps jsonb not null default '{}',
  notes text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table targets enable row level security;
drop policy if exists "own rows" on targets;
create policy "own rows" on targets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create unique index if not exists targets_user_job_idx on targets (user_id, job_id) where job_id is not null;
create unique index if not exists targets_user_url_idx on targets (user_id, url) where url <> '';
create index if not exists targets_user_idx on targets (user_id, created_at desc);

-- Tell the API to pick up the new table straight away.
notify pgrst, 'reload schema';
