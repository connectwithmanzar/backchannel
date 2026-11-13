-- Migration 0020: auto-apply. JobRadar (on your Mac) fills in application forms for the applications you queue.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to run more than once.

-- Off by default. 'dry_run' fills the form and stops before sending; 'submit' sends it.
alter table preferences add column if not exists auto_apply_mode text not null default 'off' check (auto_apply_mode in ('off', 'dry_run', 'submit'));
alter table preferences add column if not exists auto_apply_daily_cap int not null default 20;
-- Standing approval: use your saved visa, salary and notice-period answers without asking each time. Off by default.
alter table preferences add column if not exists auto_apply_use_saved boolean not null default false;

-- Where each application is in the auto-apply queue, and what the robot browser did.
alter table applications add column if not exists auto_status text check (auto_status in ('queued', 'running', 'filled', 'submitted', 'needs_you', 'failed'));
alter table applications add column if not exists auto_log text;
alter table applications add column if not exists auto_at timestamptz;
create index if not exists applications_auto_idx on applications (user_id, auto_status);
