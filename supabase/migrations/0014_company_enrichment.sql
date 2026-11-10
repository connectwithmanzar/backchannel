-- Company facts from an enriched list (for example a Clay export): LinkedIn page, B2B/B2C type, hiring signal and LinkedIn opening count.
-- country, hq, size and sector already exist on companies from 0001.
alter table companies add column if not exists linkedin_url text;
alter table companies add column if not exists company_type text check (company_type in ('B2B','B2B2C','B2C','Unclear'));
alter table companies add column if not exists hiring_signal text check (hiring_signal in ('yes','unclear','no'));
alter table companies add column if not exists linkedin_openings integer;
