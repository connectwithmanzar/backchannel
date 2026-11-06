-- Build 6: track which jobs have been sent in a Telegram digest per user.
-- Run in Supabase SQL Editor → paste → Run.

alter table job_scores
  add column if not exists telegram_notified_at timestamptz;
