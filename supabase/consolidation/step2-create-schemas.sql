-- Consolidation Step 2: two empty schemas, one per app. Nothing moves yet and the live app is unaffected.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to run more than once.

create schema if not exists backchannel;
create schema if not exists rws;

-- Backchannel is private: only signed-in users and the server key can reach it. The public (anon) role gets nothing.
grant usage on schema backchannel to authenticated, service_role;
alter default privileges in schema backchannel grant all on tables to authenticated, service_role;
alter default privileges in schema backchannel grant all on sequences to authenticated, service_role;
alter default privileges in schema backchannel grant all on functions to authenticated, service_role;

-- RWS is a public directory: visitors can reach the schema. Row-level security decides which rows they may read,
-- and writes stay with the server key. (No tables exist yet; each one gets its own policies when it is created.)
grant usage on schema rws to anon, authenticated, service_role;
alter default privileges in schema rws grant select on tables to anon, authenticated;
alter default privileges in schema rws grant all on tables to service_role;
alter default privileges in schema rws grant all on sequences to service_role;
alter default privileges in schema rws grant all on functions to service_role;

-- Tell the data API to notice the new schemas.
notify pgrst, 'reload schema';

-- Check (should return 2 rows: backchannel and rws):
select schema_name from information_schema.schemata where schema_name in ('backchannel', 'rws') order by 1;
