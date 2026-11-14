-- Rollback for Step 3: puts every table back in "public" and restores the original access.
-- Run this, then remove DB_SCHEMA in Vercel (or set it to public) and redeploy.

begin;

alter table backchannel.applications set schema public;
alter table backchannel.blocklist set schema public;
alter table backchannel.collect_runs set schema public;
alter table backchannel.companies set schema public;
alter table backchannel.company_insights set schema public;
alter table backchannel.company_research set schema public;
alter table backchannel.connections set schema public;
alter table backchannel.contact_lookups set schema public;
alter table backchannel.contacts set schema public;
alter table backchannel.copilots set schema public;
alter table backchannel.cv_versions set schema public;
alter table backchannel.funnel_events set schema public;
alter table backchannel.gmail_accounts set schema public;
alter table backchannel.interview_preps set schema public;
alter table backchannel.job_scores set schema public;
alter table backchannel.jobs set schema public;
alter table backchannel.offers set schema public;
alter table backchannel.outreach set schema public;
alter table backchannel.outreach_templates set schema public;
alter table backchannel.preferences set schema public;
alter table backchannel.profiles set schema public;
alter table backchannel.referrals set schema public;
alter table backchannel.sequences set schema public;
alter table backchannel.signals set schema public;
alter table backchannel.stories set schema public;
alter table backchannel.targets set schema public;
alter table backchannel.usage_counters set schema public;
alter table backchannel.watchlist set schema public;

alter function backchannel.bump_usage(text, timestamptz) set schema public;

grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';

select table_schema, count(*) as tables from information_schema.tables
where table_schema in ('backchannel', 'public') and table_type = 'BASE TABLE' group by 1 order by 1;
