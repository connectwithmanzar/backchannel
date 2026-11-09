-- Migration 0008: a minimum pay (USD OTE) per market, e.g. {"us": 90000, "india": 40000}.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run more than once. Run it BEFORE deploying the matching code.

alter table profiles add column if not exists min_ote_by_market jsonb not null default '{}';
