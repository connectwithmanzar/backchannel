# Migrations applied to production

Run each file once in the Supabase SQL editor, in order, and tick it here. Take a manual export of the data before any migration that
drops or replaces a constraint: the free Supabase plan has no point-in-time restore.

| File | What it adds | Applied |
|---|---|---|
| 0001_init.sql | Base tables | yes |
| 0002_reactions.sql | Save, skip and apply on scores | yes |
| 0003_telegram.sql | Telegram digest tracking | yes |
| 0004_shared_company_insights.sql | Shared company insights | yes |
| 0005_indexes_and_rls_audit.sql | Indexes and row-level security audit | yes |
| 0006_full_product.sql | Applications, outreach, referrals, Gmail accounts | yes |
| 0007_pasted_jobs.sql | Jobs a user pastes, private to them | yes |
| 0008_min_ote_by_market.sql | Minimum pay per market | yes |
| 0009_contact_lookups.sql | People search cache and caps | yes |
| 0010_steps_6_to_9.sql | Warm-up, templates, auto-send, interview prep, offers | yes |
| 0011_indexes.sql | Extra indexes (optional) | not yet |

## Backups
The free Supabase plan keeps no backups. Before a migration, export the tables from the dashboard (Table editor, Export). Moving to the Pro plan
adds daily backups.

## Optional settings that switch on extra protection
- `TOKEN_ENC_KEY` (64 hex characters): encrypts Gmail tokens. After setting it, disconnect and reconnect Gmail once so the stored token is encrypted.
- `HEARTBEAT_OUTREACH_URL` and `HEARTBEAT_DAILY_URL`: a monitor address (for example a Healthchecks.io check) pinged after each successful run.

- 0013_company_status.sql: PENDING. Adds status and notes per company (Interested, Applied, Not for me) and a per-person outcome (call booked, referral, interview) for the Pipeline board. Everything else works without it.

- 0016_jobradar.sql: PENDING. LinkedIn connections (imported by JobRadar) and past employers / college for referral search links. Without it, JobRadar's referral import shows a message and role pages skip the connections list.

- 0017_priority_tools.sql: PENDING. Company tiers (A and B), your career-gap line, the story bank and CV versions. Until it is run, the app still works: tiers, stories, CV versions and the gap line show a message asking you to run it, and watched companies still show under Priority on Jobs.
