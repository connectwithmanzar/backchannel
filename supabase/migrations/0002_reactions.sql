-- Build 5: add reaction column to job_scores so users can bookmark / skip / mark applied.
-- Run in Supabase SQL Editor → paste → Run.

alter table job_scores
  add column if not exists reaction text
    check (reaction in ('bookmarked', 'skipped', 'applied'));
