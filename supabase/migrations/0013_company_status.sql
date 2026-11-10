-- Migration 0013: your own status and note for each company (Interested, Applied, Not for me).
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run more than once. The app keeps working without it, but status and notes cannot be saved until it is run.

alter table watchlist add column if not exists status text
  check (status in ('interested', 'applied', 'not_for_me'));
alter table watchlist add column if not exists note text;

-- How each person turned out, for the Pipeline board: a call was booked, they referred you, or you got an interview.
alter table contacts add column if not exists outcome text
  check (outcome in ('call_booked', 'referral', 'interview', 'declined'));
