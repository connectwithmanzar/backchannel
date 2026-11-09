-- Migration 0011: indexes for lookups that grow with use. Optional and safe to run more than once.
-- Run in the Supabase SQL editor. Nothing breaks if it is never run; pages just get slower with more data.

create index if not exists outreach_contact_idx on outreach (contact_id);
create index if not exists outreach_user_sent_idx on outreach (user_id, sent_at desc) where sent_at is not null;
create index if not exists jobs_company_idx on jobs (company_id);
create index if not exists job_scores_job_idx on job_scores (job_id);
create index if not exists funnel_events_user_type_idx on funnel_events (user_id, type, occurred_at desc);
