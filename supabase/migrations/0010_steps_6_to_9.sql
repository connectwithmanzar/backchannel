-- Migration 0010: warm-up ramp, approved templates with auto-send, interview prep and offers.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run more than once. Run it BEFORE deploying the matching code.

-- Step 7: when this user's sending began, so the daily cap ramps 5, 10, 15, 20.
alter table preferences add column if not exists email_ramp_start timestamptz;
