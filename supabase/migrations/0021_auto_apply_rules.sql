-- Migration 0021: your own limits for auto-apply (minimum match, pay floor, blocked companies, weekend pause).
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to run more than once.
alter table preferences add column if not exists auto_apply_rules jsonb not null default '{}';
