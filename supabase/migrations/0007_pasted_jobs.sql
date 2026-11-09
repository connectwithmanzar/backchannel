-- Migration 0007: jobs a user pastes in themselves (paste-a-job).
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run more than once. Run it BEFORE deploying the matching code.

alter table jobs add column if not exists added_by uuid references auth.users on delete cascade;
alter table jobs add column if not exists source text;
alter table jobs add column if not exists company_name text;

-- Shared jobs (added_by is null) stay visible to everyone; pasted jobs only to the person who pasted them.
drop policy if exists "read jobs" on jobs;
drop policy if exists "read shared and own jobs" on jobs;
create policy "read shared and own jobs" on jobs for select to authenticated
  using (added_by is null or added_by = auth.uid());

create index if not exists jobs_added_by_idx on jobs (added_by) where added_by is not null;
