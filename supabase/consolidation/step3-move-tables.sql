-- Consolidation Step 3: move the 28 Backchannel tables from "public" into "backchannel".
-- Data, indexes, constraints, triggers and row-level-security policies all travel with each table.
-- Run ONLY at the agreed moment, and set DB_SCHEMA=backchannel in Vercel straight afterwards (see the runbook).
-- It is one transaction: if anything fails, nothing is moved.

begin;

alter table public.applications set schema backchannel;
alter table public.blocklist set schema backchannel;
alter table public.collect_runs set schema backchannel;
alter table public.companies set schema backchannel;
alter table public.company_insights set schema backchannel;
alter table public.company_research set schema backchannel;
alter table public.connections set schema backchannel;
alter table public.contact_lookups set schema backchannel;
alter table public.contacts set schema backchannel;
alter table public.copilots set schema backchannel;
alter table public.cv_versions set schema backchannel;
alter table public.funnel_events set schema backchannel;
alter table public.gmail_accounts set schema backchannel;
alter table public.interview_preps set schema backchannel;
alter table public.job_scores set schema backchannel;
alter table public.jobs set schema backchannel;
alter table public.offers set schema backchannel;
alter table public.outreach set schema backchannel;
alter table public.outreach_templates set schema backchannel;
alter table public.preferences set schema backchannel;
alter table public.profiles set schema backchannel;
alter table public.referrals set schema backchannel;
alter table public.sequences set schema backchannel;
alter table public.signals set schema backchannel;
alter table public.stories set schema backchannel;
alter table public.targets set schema backchannel;
alter table public.usage_counters set schema backchannel;
alter table public.watchlist set schema backchannel;

-- The usage counter function is called through the data API, so it moves with the app.
alter function public.bump_usage(text, timestamptz) set schema backchannel;

-- Backchannel is private: remove the public (anon) role's access to everything that just moved.
revoke all on all tables in schema backchannel from anon;
revoke all on all functions in schema backchannel from anon, public;
grant all on all tables in schema backchannel to authenticated, service_role;
grant execute on all functions in schema backchannel to service_role;

commit;

notify pgrst, 'reload schema';

-- Check: should list 28 tables in backchannel and none left in public.
select table_schema, count(*) as tables from information_schema.tables
where table_schema in ('backchannel', 'public') and table_type = 'BASE TABLE' group by 1 order by 1;
